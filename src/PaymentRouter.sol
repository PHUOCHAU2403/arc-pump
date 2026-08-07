// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PaymentRouter — pay-per-call settlement for agentic payments in native USDC on Arc.
/// @notice The rail that lets an AI agent pay a service per request. On Arc, USDC is the native
/// token, and native transfers carry no memo — so a raw transfer can't be tied to an invoice.
/// This router fixes that: an agent pays an invoice by id, the value (native USDC) is forwarded
/// straight to the service, and the payment is bound to BOTH the invoice id and the recipient so
/// the service can verify — in one view call — that it was actually paid for this invoice. The
/// router never custodies funds.
///
/// @dev Payments are keyed by `(invoiceId, service)`, not by `invoiceId` alone, and they
/// accumulate rather than reject once set. Both choices exist to close a denial-of-service hole
/// that the previous single-key, reject-on-second-payment design left open:
///
///   Invoice ids are published in the clear inside the HTTP 402 challenge, so anyone can read
///   one. Under the old design a stranger could call `pay(invoiceId, attackerAddress)` with a
///   single wei. That wrote the invoice slot, and every later call — including the legitimate
///   agent's — reverted with `AlreadyPaid`. `verify` then returned false forever, because the
///   recorded recipient was the attacker. The invoice was unusable, and the attack cost one wei
///   plus gas. Repeated against each freshly issued invoice, it takes the whole service down.
///
/// Keying by `(invoiceId, service)` means a payment aimed at the wrong recipient can never touch
/// the real one's slot. Accumulating means a spoiler payment of one wei to the *right* recipient
/// is a one-wei donation rather than a lock: the honest payer tops the slot up and `verify`
/// passes. There is no longer any way for a third party to make an invoice unpayable.
///
/// The trade-off is that the router no longer rejects a repeated payment from the same payer.
/// That guard protected the payer, not the service, and it belongs on the payer's side: call
/// `verify` (or read `paidAmount`) before paying. A contract cannot tell an honest retry from a
/// deliberate second purchase, so it should not be the one deciding.
contract PaymentRouter {
    /// @notice Emitted when an invoice is paid. Services may watch this to release a response.
    /// @dev Watching this event alone is NOT sufficient to authorise a response — anyone can emit
    /// it for any invoice id by paying any address. Authorise on `verify`, which binds the amount
    /// to the recipient.
    event Paid(bytes32 indexed invoiceId, address indexed service, address indexed payer, uint256 amount);

    error ZeroAmount();
    error ZeroService();
    error TransferFailed();

    /// @dev keccak256(invoiceId, service) => total native USDC forwarded to that recipient.
    mapping(bytes32 => uint256) private _paid;

    /// @notice The storage key for an (invoice, recipient) pair. Exposed so off-chain callers can
    /// derive it without reimplementing the hash.
    function slotOf(bytes32 invoiceId, address service) public pure returns (bytes32) {
        return keccak256(abi.encode(invoiceId, service));
    }

    /// @notice Total paid so far against `invoiceId` and forwarded to `service`.
    /// @dev Amounts are in wei of native USDC — 18 decimals on Arc, not the 6 that USDC uses as
    /// an ERC-20 elsewhere. Scaling by 1e6 here is a common and expensive mistake.
    function paidAmount(bytes32 invoiceId, address service) public view returns (uint256) {
        return _paid[slotOf(invoiceId, service)];
    }

    /// @notice Pay an invoice. Forwards `msg.value` (native USDC) to `service` and records it.
    /// @param invoiceId Unique id the service issued.
    /// @param service   The payee — receives the full amount.
    function pay(bytes32 invoiceId, address payable service) external payable {
        if (msg.value == 0) revert ZeroAmount();
        // Without this, value sent to address(0) is burned while the slot still records it as
        // paid, and `verify` would authorise a response nobody was paid for.
        if (service == address(0)) revert ZeroService();

        // Effects before interaction. A re-entrant call lands on its own accumulated slot and
        // moves its own value, so it can inflate a total only by actually paying it.
        _paid[slotOf(invoiceId, service)] += msg.value;

        (bool ok,) = service.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit Paid(invoiceId, service, msg.sender, msg.value);
    }

    /// @notice One-call verification for a service: was `invoiceId` paid at least `minAmount`
    /// AND forwarded to `service`? This is what a service checks before releasing its response.
    /// @dev The `!= 0` guard is load-bearing: without it an untouched slot would satisfy
    /// `0 >= 0` and every unpaid invoice would verify against a zero minimum.
    function verify(bytes32 invoiceId, address service, uint256 minAmount) external view returns (bool) {
        uint256 amount = _paid[slotOf(invoiceId, service)];
        return amount != 0 && amount >= minAmount;
    }
}
