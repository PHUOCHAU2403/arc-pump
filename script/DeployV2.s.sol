// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MemeFactoryV2} from "../src/MemeFactoryV2.sol";

contract DeployV2Script is Script {
    function run() external returns (MemeFactoryV2 factory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        factory = new MemeFactoryV2();
        vm.stopBroadcast();

        console.log("=========================================");
        console.log("ARC.PUMP MemeFactoryV2 deployed");
        console.log("=========================================");
        console.log("Factory v2 address :", address(factory));
        console.log("Owner              :", factory.owner());
        console.log("Create fee (wei)   :", factory.createFee());
        console.log("Default slope      :", factory.DEFAULT_SLOPE());
        console.log("Min max supply     :", factory.MIN_MAX_SUPPLY());
        console.log("Max max supply     :", factory.MAX_MAX_SUPPLY());
        console.log("Max trade fee bps  :", factory.MAX_TRADE_FEE_BPS());
    }
}
