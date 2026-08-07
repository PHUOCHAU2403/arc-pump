// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";

/// @dev A service that refuses native transfers — used to exercise the TransferFailed path.
contract RejectingService {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev A malicious service that tries to re-enter the router while being paid.
contract ReenteringService {
    PaymentRouter private immutable router;
    bytes32 private immutable invoiceId;
    bool public reentered;

    constructor(PaymentRouter _router, bytes32 _invoiceId) {
        router = _router;
        invoiceId = _invoiceId;
    }

    receive() external payable {
        // Only re-enter on the first pass, otherwise this recurses until out of gas.
        if (reentered) return;
        reentered = true;
        router.pay{value: 0.1 ether}(invoiceId, payable(address(this)));
    }
}

/// @dev A plain payable service that accepts funds.
contract AcceptingService {
    receive() external payable {}
}

contract PaymentRouterTest is Test {
    event Paid(bytes32 indexed invoiceId, address indexed service, address indexed payer, uint256 amount);

    PaymentRouter internal router;
    address internal agent = address(0xA6E17);
    address payable internal service = payable(address(0x5E7C1));

    bytes32 internal constant INVOICE = keccak256("invoice-1");

    function setUp() public {
        router = new PaymentRouter();
        vm.deal(agent, 100 ether);
    }

    // ---------------------------------------------------------------- pay: happy path

    function test_pay_forwardsFullAmountToService() public {
        uint256 before = service.balance;

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertEq(service.balance - before, 1 ether, "service should receive the full amount");
        assertEq(address(router).balance, 0, "router must never custody funds");
    }

    function test_pay_recordsAmountAgainstInvoiceAndRecipient() public {
        vm.prank(agent);
        router.pay{value: 2.5 ether}(INVOICE, service);

        assertEq(router.paidAmount(INVOICE, service), 2.5 ether);
        assertEq(router.paidAmount(INVOICE, address(0xBEEF)), 0, "another recipient's slot is untouched");
    }

    function test_pay_emitsPaidEvent() public {
        vm.expectEmit(true, true, true, true);
        emit Paid(INVOICE, service, agent, 1 ether);

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);
    }

    function test_pay_independentInvoicesDoNotCollide() public {
        bytes32 second = keccak256("invoice-2");
        address payable other = payable(address(0xBEEF));

        vm.startPrank(agent);
        router.pay{value: 1 ether}(INVOICE, service);
        router.pay{value: 3 ether}(second, other);
        vm.stopPrank();

        assertEq(router.paidAmount(INVOICE, service), 1 ether);
        assertEq(router.paidAmount(second, other), 3 ether);
    }

    function test_slotOf_isDistinctPerRecipient() public view {
        assertTrue(router.slotOf(INVOICE, service) != router.slotOf(INVOICE, address(0xBEEF)));
        assertTrue(router.slotOf(INVOICE, service) != router.slotOf(keccak256("other"), service));
    }

    // ---------------------------------------------------------------- the griefing attack

    /// @dev THE regression test for this contract.
    ///
    /// Invoice ids travel in the clear inside the 402 challenge, so a stranger can always read
    /// one. Under the previous design a stranger paying one wei to their own address wrote the
    /// invoice's only slot, and the real agent's payment then reverted with `AlreadyPaid`
    /// forever. One wei took the invoice — and, repeated, the whole service — offline.
    function test_pay_strangerPayingElsewhereCannotBrickTheInvoice() public {
        address stranger = address(0x1234);
        address payable attackerWallet = payable(address(0xBAD));
        vm.deal(stranger, 1 ether);

        // The attack: one wei against the victim's invoice id, routed to the attacker.
        vm.prank(stranger);
        router.pay{value: 1 wei}(INVOICE, attackerWallet);

        // The honest agent pays normally afterwards. This must still work.
        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertTrue(router.verify(INVOICE, service, 1 ether), "the invoice must remain payable and verifiable");
        assertEq(router.paidAmount(INVOICE, service), 1 ether, "the attacker's wei must not land in the service's slot");
        assertEq(attackerWallet.balance, 1 wei, "the attacker only ever moved their own money");
    }

    /// @dev The harder variant: the spoiler pays the *real* recipient, hitting the same slot.
    /// Accumulation turns the attack into a donation instead of a lock.
    function test_pay_dustToTheRealServiceDoesNotBlockTheRealPayment() public {
        address stranger = address(0x1234);
        vm.deal(stranger, 1 ether);

        vm.prank(stranger);
        router.pay{value: 1 wei}(INVOICE, service);

        assertFalse(router.verify(INVOICE, service, 1 ether), "dust alone must not unlock the resource");

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertTrue(router.verify(INVOICE, service, 1 ether), "the honest payment tops the slot up");
        assertEq(router.paidAmount(INVOICE, service), 1 ether + 1 wei);
    }

    /// @dev Underpayment is still rejected at the point that matters — verification.
    function test_verify_falseUntilTheThresholdIsActuallyReached() public {
        vm.startPrank(agent);
        router.pay{value: 0.4 ether}(INVOICE, service);
        assertFalse(router.verify(INVOICE, service, 1 ether));

        router.pay{value: 0.6 ether}(INVOICE, service);
        assertTrue(router.verify(INVOICE, service, 1 ether), "partial payments accumulate to the threshold");
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- pay: reverts

    function test_pay_revertsOnZeroAmount() public {
        vm.prank(agent);
        vm.expectRevert(PaymentRouter.ZeroAmount.selector);
        router.pay{value: 0}(INVOICE, service);
    }

    /// @dev Paying address(0) burns the value. Recording it as paid would let `verify` authorise
    /// a response that nobody was actually paid for.
    function test_pay_revertsOnZeroService() public {
        vm.prank(agent);
        vm.expectRevert(PaymentRouter.ZeroService.selector);
        router.pay{value: 1 ether}(INVOICE, payable(address(0)));
    }

    function test_pay_revertsWhenServiceRejectsTransfer() public {
        RejectingService rejecting = new RejectingService();

        vm.prank(agent);
        vm.expectRevert(PaymentRouter.TransferFailed.selector);
        router.pay{value: 1 ether}(INVOICE, payable(address(rejecting)));
    }

    /// @dev A failed transfer must roll back state, leaving the invoice payable on retry.
    function test_pay_failedTransferLeavesInvoicePayable() public {
        RejectingService rejecting = new RejectingService();

        vm.prank(agent);
        vm.expectRevert(PaymentRouter.TransferFailed.selector);
        router.pay{value: 1 ether}(INVOICE, payable(address(rejecting)));

        assertEq(router.paidAmount(INVOICE, address(rejecting)), 0, "state must roll back after a failed transfer");

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);
        assertEq(router.paidAmount(INVOICE, service), 1 ether);
    }

    // ---------------------------------------------------------------- reentrancy

    /// @dev Re-entry is no longer rejected, and does not need to be. Effects land before the
    /// call, and a re-entrant payer can only raise a total by sending that value itself — there
    /// is no path to credit without payment, and the router still ends with a zero balance.
    function test_pay_reentrancyCannotCreditWithoutPaying() public {
        ReenteringService attacker = new ReenteringService(router, INVOICE);
        vm.deal(address(attacker), 10 ether);
        uint256 attackerBefore = address(attacker).balance;

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, payable(address(attacker)));

        assertTrue(attacker.reentered(), "the re-entrant path should have been exercised");
        assertEq(
            router.paidAmount(INVOICE, address(attacker)),
            1.1 ether,
            "total must equal exactly what was actually sent: 1 from the agent, 0.1 from itself"
        );
        assertEq(address(attacker).balance, attackerBefore + 1 ether, "the attacker gained only the agent's payment");
        assertEq(address(router).balance, 0, "router must never custody funds");
    }

    // ---------------------------------------------------------------- verify

    function test_verify_trueForExactService_andAtOrBelowAmount() public {
        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertTrue(router.verify(INVOICE, service, 1 ether), "exact amount should verify");
        assertTrue(router.verify(INVOICE, service, 0.5 ether), "overpayment should verify");
    }

    function test_verify_falseWhenUnderpaid() public {
        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertFalse(router.verify(INVOICE, service, 1 ether + 1), "underpayment must not verify");
    }

    function test_verify_falseForWrongService() public {
        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        assertFalse(router.verify(INVOICE, address(0xBEEF), 1 ether), "payment is bound to the recipient");
    }

    function test_verify_falseForUnpaidInvoice() public view {
        assertFalse(router.verify(keccak256("never-paid"), service, 1 ether));
    }

    /// @dev The `!= 0` guard matters: without it, an unpaid invoice would verify against
    ///      service == address(0) and minAmount == 0.
    function test_verify_falseForUnpaidInvoice_withZeroServiceAndZeroMinimum() public view {
        assertFalse(router.verify(keccak256("never-paid"), address(0), 0), "unpaid invoice must never verify");
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_pay_forwardsAnyNonZeroAmount(uint96 amount, bytes32 invoiceId) public {
        vm.assume(amount > 0);
        AcceptingService payee = new AcceptingService();
        vm.deal(agent, amount);

        vm.prank(agent);
        router.pay{value: amount}(invoiceId, payable(address(payee)));

        assertEq(address(payee).balance, amount);
        assertEq(router.paidAmount(invoiceId, address(payee)), amount);
        assertTrue(router.verify(invoiceId, address(payee), amount));
        assertEq(address(router).balance, 0);
    }

    function testFuzz_verify_thresholdBoundary(uint96 paid, uint96 minAmount) public {
        vm.assume(paid > 0);
        AcceptingService payee = new AcceptingService();
        vm.deal(agent, paid);

        vm.prank(agent);
        router.pay{value: paid}(INVOICE, payable(address(payee)));

        assertEq(router.verify(INVOICE, address(payee), minAmount), paid >= minAmount);
    }

    /// @dev No stranger, at any dust amount, against any recipient, can stop the honest payment
    /// from verifying. This is the property the old design failed to hold.
    function testFuzz_noStrangerCanBrickAnInvoice(uint96 dust, address spoiler, bytes32 invoiceId) public {
        vm.assume(dust > 0);
        // Above the precompile range: 0x01..0xff have no code yet reject value, which would
        // fail the spoiler's own transfer and prove nothing about the property under test.
        vm.assume(uint160(spoiler) > 0xff && spoiler.code.length == 0);
        vm.assume(spoiler != service && spoiler != agent);

        vm.deal(spoiler, dust);
        vm.prank(spoiler);
        router.pay{value: dust}(invoiceId, payable(spoiler));

        vm.prank(agent);
        router.pay{value: 1 ether}(invoiceId, service);

        assertTrue(router.verify(invoiceId, service, 1 ether), "the honest payment must always verify");
    }
}
