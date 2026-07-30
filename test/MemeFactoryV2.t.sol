// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {MemeFactoryV2} from "../src/MemeFactoryV2.sol";
import {BondingCurveV2} from "../src/BondingCurveV2.sol";
import {MemeToken} from "../src/MemeToken.sol";

contract MemeFactoryV2Test is Test {
    event CreateFeeUpdated(uint256 newFee);

    MemeFactoryV2 internal factory;

    address internal protocol = address(this); // factory owner
    address internal creator = address(0xC8EA704);
    address internal buyer = address(0xB0B);

    uint256 internal constant SUPPLY = 1_000_000e18;
    uint16 internal constant FEE_BPS = 300;

    // Cached in setUp: reading these from `factory` inside an argument list would be an external
    // call that consumes a pending vm.prank / vm.expectRevert before the call under test runs.
    uint256 internal launchFee;
    uint256 internal minSupply;
    uint256 internal maxSupplyCap;
    uint16 internal maxFeeBps;

    function setUp() public {
        factory = new MemeFactoryV2();
        launchFee = factory.createFee();
        minSupply = factory.MIN_MAX_SUPPLY();
        maxSupplyCap = factory.MAX_MAX_SUPPLY();
        maxFeeBps = factory.MAX_TRADE_FEE_BPS();

        vm.deal(creator, 100 ether);
        vm.deal(buyer, 100 ether);
    }

    function _create() internal returns (address token, address curve) {
        vm.prank(creator);
        return factory.createToken{value: launchFee}("Arc Pump", "PUMP", "ipfs://x", "desc", SUPPLY, FEE_BPS);
    }

    // ---------------------------------------------------------------- createToken

    function test_createToken_wiresTokenAndCurveTogether() public {
        (address token, address curve) = _create();

        assertEq(MemeToken(token).bondingCurve(), curve, "token must point at its curve");
        assertEq(address(BondingCurveV2(payable(curve)).memeToken()), token, "curve must point at its token");
        assertEq(factory.curveOf(token), curve, "registry must map token to curve");
    }

    function test_createToken_setsCreatorAndProtocolOnCurve() public {
        (, address curve) = _create();
        BondingCurveV2 c = BondingCurveV2(payable(curve));

        assertEq(c.creator(), creator, "creator earns 80% of trade fees");
        assertEq(c.protocol(), factory.owner(), "protocol is the factory owner");
        assertEq(c.tradeFeeBps(), FEE_BPS);
        assertEq(c.maxSupply(), SUPPLY);
    }

    function test_createToken_recordsMetadata() public {
        (address token, address curve) = _create();

        assertEq(factory.totalTokens(), 1);
        MemeFactoryV2.TokenInfo memory info = factory.tokenAt(0);

        assertEq(info.token, token);
        assertEq(info.curve, curve);
        assertEq(info.creator, creator);
        assertEq(info.name, "Arc Pump");
        assertEq(info.symbol, "PUMP");
        assertEq(info.imageURI, "ipfs://x");
        assertEq(info.maxSupply, SUPPLY);
        assertEq(info.tradeFeeBps, FEE_BPS);
        assertEq(info.createdAt, block.timestamp);
    }

    function test_createToken_collectsLaunchFeeAndRefundsExcess() public {
        uint256 before = creator.balance;

        vm.prank(creator);
        factory.createToken{value: launchFee + 3 ether}("A", "A", "", "", SUPPLY, FEE_BPS);

        assertEq(before - creator.balance, launchFee, "creator charged exactly the launch fee");
        assertEq(address(factory).balance, launchFee, "factory banks the launch fee");
    }

    function test_createToken_revertsOnInsufficientFee() public {
        vm.prank(creator);
        vm.expectRevert(MemeFactoryV2.InsufficientFee.selector);
        factory.createToken{value: launchFee - 1}("A", "A", "", "", SUPPLY, FEE_BPS);
    }

    function test_createToken_enforcesMaxSupplyRange() public {
        vm.prank(creator);
        vm.expectRevert(MemeFactoryV2.MaxSupplyOutOfRange.selector);
        factory.createToken{value: launchFee}("A", "A", "", "", minSupply - 1, FEE_BPS);

        vm.prank(creator);
        vm.expectRevert(MemeFactoryV2.MaxSupplyOutOfRange.selector);
        factory.createToken{value: launchFee}("A", "A", "", "", maxSupplyCap + 1, FEE_BPS);
    }

    function test_createToken_acceptsSupplyRangeBoundaries() public {
        vm.prank(creator);
        factory.createToken{value: launchFee}("Min", "MIN", "", "", minSupply, 0);

        vm.prank(creator);
        factory.createToken{value: launchFee}("Max", "MAX", "", "", maxSupplyCap, 0);

        assertEq(factory.totalTokens(), 2);
    }

    function test_createToken_enforcesTradeFeeCap() public {
        vm.prank(creator);
        vm.expectRevert(MemeFactoryV2.TradeFeeTooHigh.selector);
        factory.createToken{value: launchFee}("A", "A", "", "", SUPPLY, maxFeeBps + 1);

        // The cap itself is allowed.
        vm.prank(creator);
        factory.createToken{value: launchFee}("A", "A", "", "", SUPPLY, maxFeeBps);
        assertEq(factory.totalTokens(), 1);
    }

    function test_createToken_multipleLaunchesGetDistinctContracts() public {
        (address t1, address c1) = _create();
        (address t2, address c2) = _create();

        assertTrue(t1 != t2 && c1 != c2, "each launch deploys fresh contracts");
        assertEq(factory.totalTokens(), 2);
        assertEq(factory.curveOf(t1), c1);
        assertEq(factory.curveOf(t2), c2);
    }

    // ---------------------------------------------------------------- end-to-end

    /// @dev A launched token must be immediately tradeable through its curve.
    function test_endToEnd_launchThenBuyThenSell() public {
        (address token, address curveAddr) = _create();
        BondingCurveV2 curve = BondingCurveV2(payable(curveAddr));

        uint256 amount = 100e18;
        uint256 total = curve.getBuyCost(amount) + curve.feeFor(amount, true);

        vm.prank(buyer);
        curve.buy{value: total}(amount);
        assertEq(MemeToken(token).balanceOf(buyer), amount);

        vm.prank(buyer);
        curve.sell(amount);
        assertEq(MemeToken(token).balanceOf(buyer), 0);

        assertEq(
            address(curve).balance,
            curve.reserve() + curve.creatorFeesAccrued() + curve.protocolFeesAccrued(),
            "curve stays solvent through the full cycle"
        );
    }

    /// @dev The factory ships with a zero start price, so the very first token is free.
    ///      This pins that intentional design choice — flag it if it ever changes silently.
    function test_startPriceIsZero_soFirstTokenIsFree() public {
        (, address curveAddr) = _create();
        BondingCurveV2 curve = BondingCurveV2(payable(curveAddr));

        assertEq(factory.DEFAULT_START_PRICE(), 0);
        assertEq(curve.getBuyCost(1e18), 0, "first token costs nothing on a zero start price");

        vm.prank(buyer);
        curve.buy{value: 0}(1e18);
        assertEq(curve.reserve(), 0);
    }

    // ---------------------------------------------------------------- pagination

    function test_tokensBatch_pagination() public {
        for (uint256 i = 0; i < 5; i++) {
            _create();
        }

        assertEq(factory.tokensBatch(0, 2).length, 2, "full page");
        assertEq(factory.tokensBatch(3, 10).length, 2, "limit clamps to remaining items");
        assertEq(factory.tokensBatch(5, 1).length, 0, "offset at end returns empty");
        assertEq(factory.tokensBatch(99, 10).length, 0, "offset past end returns empty");
        assertEq(factory.tokensBatch(0, 0).length, 0, "zero limit returns empty");
    }

    function test_tokensBatch_returnsItemsInOrder() public {
        (address t1,) = _create();
        (address t2,) = _create();

        MemeFactoryV2.TokenInfo[] memory page = factory.tokensBatch(0, 2);
        assertEq(page[0].token, t1);
        assertEq(page[1].token, t2);
    }

    // ---------------------------------------------------------------- admin

    function test_setCreateFee_onlyOwner() public {
        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator));
        factory.setCreateFee(5e18);

        vm.expectEmit(false, false, false, true);
        emit CreateFeeUpdated(5e18);
        factory.setCreateFee(5e18);

        assertEq(factory.createFee(), 5e18);
    }

    function test_setCreateFee_takesEffectOnNextLaunch() public {
        factory.setCreateFee(5e18);

        vm.prank(creator);
        vm.expectRevert(MemeFactoryV2.InsufficientFee.selector);
        factory.createToken{value: 1e18}("A", "A", "", "", SUPPLY, FEE_BPS);

        vm.prank(creator);
        factory.createToken{value: 5e18}("A", "A", "", "", SUPPLY, FEE_BPS);
        assertEq(factory.totalTokens(), 1);
    }

    function test_setCreateFee_canBeZeroForFreeLaunches() public {
        factory.setCreateFee(0);

        vm.prank(creator);
        factory.createToken{value: 0}("Free", "FREE", "", "", SUPPLY, FEE_BPS);
        assertEq(factory.totalTokens(), 1);
    }

    function test_withdrawLaunchFees_onlyOwnerAndDrainsBalance() public {
        _create();
        _create();
        uint256 banked = address(factory).balance;
        assertEq(banked, 2 * launchFee);

        vm.prank(creator);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, creator));
        factory.withdrawLaunchFees(payable(creator));

        address payable sink = payable(address(0x51));
        factory.withdrawLaunchFees(sink);

        assertEq(sink.balance, banked);
        assertEq(address(factory).balance, 0);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_createToken_acceptsAnyValidConfig(uint256 maxSupply, uint16 feeBps) public {
        maxSupply = bound(maxSupply, minSupply, maxSupplyCap);
        feeBps = uint16(bound(feeBps, 0, maxFeeBps));

        vm.prank(creator);
        (, address curveAddr) = factory.createToken{value: launchFee}("F", "F", "", "", maxSupply, feeBps);

        BondingCurveV2 curve = BondingCurveV2(payable(curveAddr));
        assertEq(curve.maxSupply(), maxSupply);
        assertEq(curve.tradeFeeBps(), feeBps);
        assertEq(curve.creator(), creator);
    }

    receive() external payable {}
}
