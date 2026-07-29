// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PaymentRouter — pay-per-call settlement for agentic payments in native USDC on Arc.
/// @notice The rail that lets an AI agent pay a service per request. On Arc, USDC is the native
/// token, and native transfers carry no memo — so a raw transfer can't be tied to an invoice.
/// This router fixes that: an agent pays an invoice by id, the value (native USDC) is forwarded
/// straight to the service, and the payment is bound to BOTH the invoice id and the recipient so
/// the service can verify — in one view call — that it was actually paid for this invoice. The
/// router never custodies funds.
contract PaymentRouter {
    /// @notice Emitted when an invoice is paid. Services may watch this to release a response.
    event Paid(bytes32 indexed invoiceId, address indexed service, address indexed payer, uint256 amount);

    error ZeroAmount();
    error AlreadyPaid();
    error TransferFailed();

    /// @notice invoiceId => amount paid (in wei of native USDC). 0 means unpaid.
    mapping(bytes32 => uint256) public paidAmount;
    /// @notice invoiceId => the recipient the payment was forwarded to.
    mapping(bytes32 => address) public paidTo;

    /// @notice Pay an invoice. Forwards `msg.value` (native USDC) to `service` and records it.
    /// @param invoiceId Unique id the service issued.
    /// @param service   The payee — receives the full amount.
    function pay(bytes32 invoiceId, address payable service) external payable {
        if (msg.value == 0) revert ZeroAmount();
        if (paidAmount[invoiceId] != 0) revert AlreadyPaid();

        // Effects before interaction (guards against reentrancy / double-pay).
        paidAmount[invoiceId] = msg.value;
        paidTo[invoiceId] = service;

        (bool ok,) = service.call{value: msg.value}("");
        if (!ok) revert TransferFailed();

        emit Paid(invoiceId, service, msg.sender, msg.value);
    }

    /// @notice One-call verification for a service: was `invoiceId` paid at least `minAmount`
    /// AND forwarded to `service`? This is what a service checks before releasing its response.
    function verify(bytes32 invoiceId, address service, uint256 minAmount) external view returns (bool) {
        return paidTo[invoiceId] == service && paidAmount[invoiceId] >= minAmount && paidAmount[invoiceId] != 0;
    }
}
