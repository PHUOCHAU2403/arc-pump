// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MemeFactoryTempo} from "../src/MemeFactoryTempo.sol";

/**
 * @title DeployTempo
 * @notice One-shot deploy of MemeFactoryTempo to Tempo mainnet (chain 4217).
 *
 * Run:
 *   forge script script/DeployTempo.s.sol \
 *     --rpc-url tempo \
 *     --private-key $TEMPO_DEPLOYER_KEY \
 *     --broadcast
 */
contract DeployTempo is Script {
    function run() external {
        vm.startBroadcast();

        MemeFactoryTempo factory = new MemeFactoryTempo();

        console.log("MemeFactoryTempo deployed at:", address(factory));
        console.log("createFee (USDC.e wei):", factory.createFee());
        console.log("Owner:", factory.owner());

        vm.stopBroadcast();
    }
}
