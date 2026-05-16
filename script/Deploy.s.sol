// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MemeFactory} from "../src/MemeFactory.sol";

contract DeployScript is Script {
    function run() external returns (MemeFactory factory) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        vm.startBroadcast(deployerPrivateKey);
        factory = new MemeFactory();
        vm.stopBroadcast();

        console.log("=================================");
        console.log("ARC.PUMP MemeFactory deployed");
        console.log("=================================");
        console.log("Factory address :", address(factory));
        console.log("Owner           :", factory.owner());
        console.log("Create fee (wei):", factory.createFee());
        console.log("Default slope   :", factory.DEFAULT_SLOPE());
        console.log("Default maxSupply:", factory.DEFAULT_MAX_SUPPLY());
    }
}
