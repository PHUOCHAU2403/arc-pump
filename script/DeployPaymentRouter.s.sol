// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PaymentRouter} from "../src/PaymentRouter.sol";

/// @notice Deploys the pay-per-call settlement router.
///
/// @dev The router had no deploy script until now — the live instance was put on
/// chain by hand, which is why nothing in this repo records which address is
/// current or how it got there. That gap is worth closing: after this runs,
/// `broadcast/DeployPaymentRouter.s.sol/<chainId>/run-latest.json` holds the
/// address, the deployer, the block and the transaction hash, so the deployment
/// is reproducible and auditable instead of remembered.
///
///   forge script script/DeployPaymentRouter.s.sol \
///     --rpc-url https://rpc.quicknode.testnet.arc.network/ --broadcast
///
/// Reads PRIVATE_KEY from the environment, same as the other scripts here.
///
/// After deploying, the new address has to be carried to four places or the
/// demo keeps pointing at the old contract:
///   1. agentpay/service — the router address advertised in the 402 challenge
///   2. agentpay/api-spec.html
///   3. README.md
///   4. frontend/app/pay/page.tsx  (const ROUTER)
contract DeployPaymentRouterScript is Script {
    function run() external returns (PaymentRouter router) {
        // PRIVATE_KEY first, then the key this repo already carries. `vm.envUint`
        // on a missing variable reverts with "environment variable not found",
        // which describes the lookup rather than the fix — so the require below
        // says what to actually do.
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0));
        if (deployerPrivateKey == 0) {
            deployerPrivateKey = vm.envOr("TEMPO_DEPLOYER_KEY", uint256(0));
        }
        require(
            deployerPrivateKey != 0,
            "No deployer key. Add PRIVATE_KEY=0x... to .env (gitignored). "
            "PaymentRouter has no owner or admin, so any funded wallet can deploy it."
        );

        address deployer = vm.addr(deployerPrivateKey);
        require(deployer.balance > 0, "Deployer has no native USDC on this chain to pay for the deployment.");

        vm.startBroadcast(deployerPrivateKey);
        router = new PaymentRouter();
        vm.stopBroadcast();

        console.log("=========================================");
        console.log("PaymentRouter deployed");
        console.log("=========================================");
        console.log("Address  :", address(router));
        console.log("Deployer :", deployer);
        console.log("ChainId  :", block.chainid);
        console.log("");
        console.log("Now update the router address in:");
        console.log("  agentpay/service (402 challenge), api-spec.html,");
        console.log("  README.md, frontend/app/pay/page.tsx");
    }
}
