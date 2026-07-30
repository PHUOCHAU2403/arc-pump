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
    bool public reentryReverted;

    constructor(PaymentRouter _router, bytes32 _invoiceId) {
        router = _router;
        invoiceId = _invoiceId;
    }

    receive() external payable {
        // Re-enter with the same invoice id. Effects-before-interaction must make this fail.
        try router.pay{value: 0.1 ether}(invoiceId, payable(address(this))) {
            reentryReverted = false;
        } catch {
            reentryReverted = true;
        }
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

    function test_pay_recordsAmountAndRecipient() public {
        vm.prank(agent);
        router.pay{value: 2.5 ether}(INVOICE, service);

        assertEq(router.paidAmount(INVOICE), 2.5 ether);
        assertEq(router.paidTo(INVOICE), service);
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

        assertEq(router.paidAmount(INVOICE), 1 ether);
        assertEq(router.paidTo(INVOICE), service);
        assertEq(router.paidAmount(second), 3 ether);
        assertEq(router.paidTo(second), other);
    }

    // ---------------------------------------------------------------- pay: reverts

    function test_pay_revertsOnZeroAmount() public {
        vm.prank(agent);
        vm.expectRevert(PaymentRouter.ZeroAmount.selector);
        router.pay{value: 0}(INVOICE, service);
    }

    function test_pay_revertsOnDoublePay() public {
        vm.startPrank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        vm.expectRevert(PaymentRouter.AlreadyPaid.selector);
        router.pay{value: 1 ether}(INVOICE, service);
        vm.stopPrank();
    }

    /// @dev Double-pay is blocked even when a different payer targets a different service.
    function test_pay_revertsOnDoublePay_differentPayerAndService() public {
        address stranger = address(0x1234);
        vm.deal(stranger, 10 ether);

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);

        vm.prank(stranger);
        vm.expectRevert(PaymentRouter.AlreadyPaid.selector);
        router.pay{value: 1 ether}(INVOICE, payable(address(0xBEEF)));
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

        assertEq(router.paidAmount(INVOICE), 0, "state must roll back after a failed transfer");
        assertEq(router.paidTo(INVOICE), address(0));

        // The same invoice can now be paid to a working service — it is not bricked.
        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, service);
        assertEq(router.paidAmount(INVOICE), 1 ether);
    }

    // ---------------------------------------------------------------- reentrancy

    function test_pay_reentrancyOnSameInvoiceIsBlocked() public {
        ReenteringService attacker = new ReenteringService(router, INVOICE);
        vm.deal(address(attacker), 10 ether);

        vm.prank(agent);
        router.pay{value: 1 ether}(INVOICE, payable(address(attacker)));

        assertTrue(attacker.reentryReverted(), "re-entrant pay on the same invoice must revert");
        assertEq(router.paidAmount(INVOICE), 1 ether, "amount must reflect the single legitimate payment");
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
        assertEq(router.paidAmount(invoiceId), amount);
        assertEq(router.paidTo(invoiceId), address(payee));
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
}
