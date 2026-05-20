// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MemeFactoryTempoV2} from "../src/MemeFactoryTempoV2.sol";

/**
 * @title DeployTempoV2
 * @notice Deploy MemeFactoryTempoV2 to Tempo mainnet (chain 4217).
 *
 * Run (from WSL Ubuntu with tempo-foundry installed):
 *   /root/.tempo-foundry/bin/forge script script/DeployTempoV2.s.sol \
 *     --rpc-url https://rpc.tempo.xyz \
 *     --private-key $TEMPO_DEPLOYER_KEY \
 *     --tempo.fee-token 0x20c000000000000000000000b9537d11c60e8b50 \
 *     --broadcast
 */
contract DeployTempoV2 is Script {
    // pathUSD — Tempo's canonical native stablecoin (TIP-20 zero address).
    // Chosen over Bridged USDC.e because the welcome credit lands as pathUSD,
    // so demo agents can fund themselves without crossing tokens.
    address constant PATHUSD = 0x20C0000000000000000000000000000000000000;

    function run() external {
        vm.startBroadcast();

        MemeFactoryTempoV2 factory = new MemeFactoryTempoV2(PATHUSD);

        console.log("MemeFactoryTempoV2 deployed at:", address(factory));
        console.log("Fee token (pathUSD):", address(factory.feeToken()));
        console.log("createFee (pathUSD wei):", factory.createFee());
        console.log("Owner:", factory.owner());

        vm.stopBroadcast();
    }
}
