// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {BondingCurveV2} from "../src/BondingCurveV2.sol";
import {MemeToken} from "../src/MemeToken.sol";

contract BondingCurveV2Test is Test {
    event Buy(address indexed buyer, uint256 tokensOut, uint256 usdcIn, uint256 fee);
    event Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 fee);
    event CreatorFeesClaimed(address indexed to, uint256 amount);
    event ProtocolFeesClaimed(address indexed to, uint256 amount);

    BondingCurveV2 internal curve;
    MemeToken internal token;

    address internal creator = address(0xC8EA704);
    address internal protocol = address(0x9807);
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 internal constant START_PRICE = 1e15; // 0.001 per token
    uint256 internal constant SLOPE = 1e14; // +0.0001 per token minted
    uint256 internal constant MAX_SUPPLY = 1000e18;
    uint16 internal constant FEE_BPS = 300; // 3%

    function setUp() public {
        curve = new BondingCurveV2(START_PRICE, SLOPE, MAX_SUPPLY, creator, protocol, FEE_BPS);
        token = new MemeToken("Arc Pump", "PUMP", "ipfs://img", "test token", MAX_SUPPLY, address(curve));
        curve.setMemeToken(address(token));

        vm.deal(alice, 1000 ether);
        vm.deal(bob, 1000 ether);
    }

    /// @dev The contract must always hold exactly what it owes: curve reserve plus unclaimed fees.
    function _assertSolvent() internal view {
        assertEq(
            address(curve).balance,
            curve.reserve() + curve.creatorFeesAccrued() + curve.protocolFeesAccrued(),
            "balance must equal reserve + accrued fees"
        );
    }

    function _buy(address who, uint256 amount) internal {
        uint256 total = curve.getBuyCost(amount) + curve.feeFor(amount, true);
        vm.prank(who);
        curve.buy{value: total}(amount);
    }

    // ---------------------------------------------------------------- pricing math

    function test_getBuyCost_firstTokenCostsStartPrice() public view {
        assertEq(curve.getBuyCost(1e18), START_PRICE);
    }

    function test_getBuyCost_matchesLinearSum() public view {
        // Buying 3 tokens from supply 0: P(0) + P(1) + P(2)
        uint256 expected = START_PRICE + (START_PRICE + SLOPE) + (START_PRICE + 2 * SLOPE);
        assertEq(curve.getBuyCost(3e18), expected);
    }

    function test_spotPrice_risesWithSupply() public {
        assertEq(curve.spotPrice(), START_PRICE);
        _buy(alice, 10e18);
        assertEq(curve.spotPrice(), START_PRICE + 10 * SLOPE);
    }

    /// @dev Selling back the same amount at the resulting supply must return the exact buy cost.
    function test_buySellRoundTrip_isSymmetricBeforeFees() public {
        uint256 amount = 7e18;
        uint256 cost = curve.getBuyCost(amount);
        _buy(alice, amount);

        assertEq(curve.getSellReturn(amount), cost, "curve must be symmetric");
    }

    function test_getBuyCost_revertsOnFractionalOrZero() public {
        vm.expectRevert(BondingCurveV2.InvalidAmount.selector);
        curve.getBuyCost(0);

        vm.expectRevert(BondingCurveV2.InvalidAmount.selector);
        curve.getBuyCost(1e18 + 1);
    }

    function test_getSellReturn_revertsWhenSellingMoreThanSupply() public {
        _buy(alice, 2e18);

        vm.expectRevert(BondingCurveV2.InvalidAmount.selector);
        curve.getSellReturn(3e18);
    }

    // ---------------------------------------------------------------- buy

    function test_buy_mintsTokensAndBanksReserve() public {
        uint256 amount = 5e18;
        uint256 cost = curve.getBuyCost(amount);

        _buy(alice, amount);

        assertEq(token.balanceOf(alice), amount, "buyer receives tokens");
        assertEq(token.totalSupply(), amount);
        assertEq(curve.reserve(), cost, "reserve holds cost only, no fees");
        _assertSolvent();
    }

    function test_buy_splitsFee80CreatorAnd20Protocol() public {
        uint256 amount = 10e18;
        uint256 fee = curve.feeFor(amount, true);
        assertGt(fee, 0, "test needs a non-zero fee");

        _buy(alice, amount);

        uint256 expectedCreator = (fee * 8000) / 10000;
        assertEq(curve.creatorFeesAccrued(), expectedCreator);
        assertEq(curve.protocolFeesAccrued(), fee - expectedCreator);
        assertEq(curve.creatorFeesAccrued() + curve.protocolFeesAccrued(), fee, "no fee dust lost");
    }

    function test_buy_refundsOverpayment() public {
        uint256 amount = 4e18;
        uint256 total = curve.getBuyCost(amount) + curve.feeFor(amount, true);
        uint256 before = alice.balance;

        vm.prank(alice);
        curve.buy{value: total + 5 ether}(amount);

        assertEq(before - alice.balance, total, "buyer is charged exactly cost + fee");
        _assertSolvent();
    }

    function test_buy_emitsBuyEvent() public {
        uint256 amount = 2e18;
        uint256 cost = curve.getBuyCost(amount);
        uint256 fee = curve.feeFor(amount, true);

        vm.expectEmit(true, false, false, true);
        emit Buy(alice, amount, cost, fee);

        vm.prank(alice);
        curve.buy{value: cost + fee}(amount);
    }

    function test_buy_revertsOnInsufficientPayment() public {
        uint256 amount = 3e18;
        uint256 total = curve.getBuyCost(amount) + curve.feeFor(amount, true);

        vm.prank(alice);
        vm.expectRevert(BondingCurveV2.InsufficientPayment.selector);
        curve.buy{value: total - 1}(amount);
    }

    function test_buy_revertsPastMaxSupply() public {
        vm.prank(alice);
        vm.expectRevert(BondingCurveV2.MaxSupplyReached.selector);
        curve.buy{value: 1000 ether}(MAX_SUPPLY + 1e18);
    }

    function test_buy_canFillExactlyToMaxSupply() public {
        _buy(alice, MAX_SUPPLY);
        assertEq(token.totalSupply(), MAX_SUPPLY);
        _assertSolvent();

        // One more token must now be rejected.
        vm.prank(bob);
        vm.expectRevert(BondingCurveV2.MaxSupplyReached.selector);
        curve.buy{value: 100 ether}(1e18);
    }

    // ---------------------------------------------------------------- sell

    function test_sell_burnsTokensAndPaysNetOfFee() public {
        uint256 amount = 10e18;
        _buy(alice, amount);

        uint256 gross = curve.getSellReturn(amount);
        uint256 fee = (gross * FEE_BPS) / 10000;
        uint256 before = alice.balance;

        vm.prank(alice);
        curve.sell(amount);

        assertEq(alice.balance - before, gross - fee, "seller receives gross minus fee");
        assertEq(token.balanceOf(alice), 0, "tokens burned");
        assertEq(token.totalSupply(), 0);
        _assertSolvent();
    }

    function test_sell_roundTripCostsExactlyBothFees() public {
        uint256 amount = 8e18;
        uint256 buyFee = curve.feeFor(amount, true);
        uint256 before = alice.balance;

        _buy(alice, amount);
        uint256 sellFee = curve.feeFor(amount, false);

        vm.prank(alice);
        curve.sell(amount);

        assertEq(before - alice.balance, buyFee + sellFee, "round trip costs exactly the two fees");
    }

    function test_sell_revertsWhenSupplyIsExhausted() public {
        // Alice buys, then sells everything, returning supply to zero.
        _buy(alice, 5e18);
        vm.prank(alice);
        curve.sell(5e18);

        // Bob holds nothing; selling must fail on the supply check rather than silently underflow.
        vm.prank(bob);
        vm.expectRevert(BondingCurveV2.InvalidAmount.selector);
        curve.sell(1e18);
    }

    /// @dev `InsufficientLiquidity` is a defensive guard that the curve's own accounting makes
    ///      unreachable: reserve is the integral under the curve from 0 to supply, while a sell
    ///      of n tokens only ever claims the integral from supply-n to supply. This test pins
    ///      that property — if it ever fails, the reserve accounting has drifted.
    function testFuzz_reserveAlwaysCoversAnyValidSell(uint256 buyTokens, uint256 sellTokens) public {
        buyTokens = bound(buyTokens, 1, 900);
        sellTokens = bound(sellTokens, 1, buyTokens);

        _buy(alice, buyTokens * 1e18);
        assertGe(curve.reserve(), curve.getSellReturn(sellTokens * 1e18), "reserve must cover any valid sell");
    }

    function test_sell_emitsSellEventWithNetAmount() public {
        uint256 amount = 6e18;
        _buy(alice, amount);
        uint256 gross = curve.getSellReturn(amount);
        uint256 fee = (gross * FEE_BPS) / 10000;

        vm.expectEmit(true, false, false, true);
        emit Sell(alice, amount, gross - fee, fee);

        vm.prank(alice);
        curve.sell(amount);
    }

    // ---------------------------------------------------------------- fee claims

    function test_claimCreatorFees_onlyCreatorAndZeroesBalance() public {
        _buy(alice, 10e18);
        uint256 accrued = curve.creatorFeesAccrued();
        assertGt(accrued, 0);

        vm.prank(bob);
        vm.expectRevert(BondingCurveV2.OnlyCreator.selector);
        curve.claimCreatorFees(payable(bob));

        vm.expectEmit(true, false, false, true);
        emit CreatorFeesClaimed(creator, accrued);

        vm.prank(creator);
        curve.claimCreatorFees(payable(creator));

        assertEq(creator.balance, accrued);
        assertEq(curve.creatorFeesAccrued(), 0);
        _assertSolvent();
    }

    function test_claimProtocolFees_onlyProtocolAndZeroesBalance() public {
        _buy(alice, 10e18);
        uint256 accrued = curve.protocolFeesAccrued();
        assertGt(accrued, 0);

        vm.prank(bob);
        vm.expectRevert(BondingCurveV2.OnlyProtocol.selector);
        curve.claimProtocolFees(payable(bob));

        vm.prank(protocol);
        curve.claimProtocolFees(payable(protocol));

        assertEq(protocol.balance, accrued);
        assertEq(curve.protocolFeesAccrued(), 0);
        _assertSolvent();
    }

    function test_claim_revertsWhenNothingAccrued() public {
        vm.prank(creator);
        vm.expectRevert(BondingCurveV2.NothingToClaim.selector);
        curve.claimCreatorFees(payable(creator));

        vm.prank(protocol);
        vm.expectRevert(BondingCurveV2.NothingToClaim.selector);
        curve.claimProtocolFees(payable(protocol));
    }

    /// @dev Claiming fees must never eat into the reserve backing outstanding tokens.
    function test_claimingFeesLeavesReserveIntactForSellers() public {
        _buy(alice, 20e18);
        uint256 reserveBefore = curve.reserve();

        vm.prank(creator);
        curve.claimCreatorFees(payable(creator));
        vm.prank(protocol);
        curve.claimProtocolFees(payable(protocol));

        assertEq(curve.reserve(), reserveBefore, "reserve untouched by fee claims");
        _assertSolvent();

        // Alice can still exit in full.
        vm.prank(alice);
        curve.sell(20e18);
        _assertSolvent();
    }

    // ---------------------------------------------------------------- initialization

    function test_setMemeToken_cannotBeChangedOnceSet() public {
        vm.expectRevert(BondingCurveV2.AlreadySet.selector);
        curve.setMemeToken(address(0xDEAD));
    }

    function test_viewsRevertBeforeInitialization() public {
        BondingCurveV2 fresh = new BondingCurveV2(START_PRICE, SLOPE, MAX_SUPPLY, creator, protocol, FEE_BPS);

        vm.expectRevert(BondingCurveV2.NotInitialized.selector);
        fresh.getBuyCost(1e18);

        vm.expectRevert(BondingCurveV2.NotInitialized.selector);
        fresh.getSellReturn(1e18);

        // spotPrice is the one view that degrades gracefully.
        assertEq(fresh.spotPrice(), START_PRICE);
    }

    // ---------------------------------------------------------------- token access control

    function test_memeToken_mintAndBurnRestrictedToCurve() public {
        vm.prank(alice);
        vm.expectRevert(MemeToken.OnlyBondingCurve.selector);
        token.mint(alice, 1e18);

        _buy(alice, 1e18);

        vm.prank(alice);
        vm.expectRevert(MemeToken.OnlyBondingCurve.selector);
        token.burn(alice, 1e18);
    }

    // ---------------------------------------------------------------- fuzz / invariant

    /// @dev Solvency must hold for any single buy size.
    function testFuzz_buy_keepsContractSolvent(uint256 tokens) public {
        tokens = bound(tokens, 1, 1000);
        uint256 amount = tokens * 1e18;

        _buy(alice, amount);

        _assertSolvent();
        assertEq(token.totalSupply(), amount);
    }

    /// @dev Solvency must hold across an arbitrary buy → partial sell sequence.
    function testFuzz_buyThenPartialSell_keepsContractSolvent(uint256 buyTokens, uint256 sellTokens) public {
        buyTokens = bound(buyTokens, 1, 1000);
        sellTokens = bound(sellTokens, 1, buyTokens);

        _buy(alice, buyTokens * 1e18);
        _assertSolvent();

        vm.prank(alice);
        curve.sell(sellTokens * 1e18);

        _assertSolvent();
        assertEq(token.totalSupply(), (buyTokens - sellTokens) * 1e18);
    }

    /// @dev Two buyers interleaved: the second pays a strictly higher price for the same size.
    function testFuzz_priceIsMonotonic(uint256 tokens) public {
        tokens = bound(tokens, 1, 400);
        uint256 amount = tokens * 1e18;

        uint256 firstCost = curve.getBuyCost(amount);
        _buy(alice, amount);
        uint256 secondCost = curve.getBuyCost(amount);

        assertGt(secondCost, firstCost, "price must rise as supply grows");
        _buy(bob, amount);
        _assertSolvent();
    }

    /// @dev Every holder can still exit after an arbitrary sequence — the reserve is sufficient.
    function testFuzz_allHoldersCanExit(uint256 aliceTokens, uint256 bobTokens) public {
        aliceTokens = bound(aliceTokens, 1, 400);
        bobTokens = bound(bobTokens, 1, 400);

        _buy(alice, aliceTokens * 1e18);
        _buy(bob, bobTokens * 1e18);

        // Last in, first out — bob exits first, then alice.
        vm.prank(bob);
        curve.sell(bobTokens * 1e18);
        vm.prank(alice);
        curve.sell(aliceTokens * 1e18);

        assertEq(token.totalSupply(), 0);
        assertEq(curve.reserve(), 0, "reserve fully unwinds when supply returns to zero");
        _assertSolvent();
    }
}
