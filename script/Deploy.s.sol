// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BotFlowRouter} from "../src/BotFlowRouter.sol";

/// @notice Deploys BotFlowRouter to BOT Chain Testnet (968) or Mainnet (677).
///         The BDEX V3 SwapRouter and WBOT share the same address on both networks.
///
///   OWNER=0xYourMultisig forge script script/Deploy.s.sol \
///     --rpc-url botchain_testnet --broadcast --account deployer
///
/// Optional env: FEE_RECIPIENT (defaults to OWNER), BDEX_ROUTER, WBOT.
contract Deploy is Script {
    address constant DEFAULT_BDEX_ROUTER = 0x07032d47A1b9f8460cBeE9dC17c1d3E438693929;
    address constant DEFAULT_WBOT = 0xD5452816194a3784dBa983426cCe7c122F4abd30;

    function run() external returns (BotFlowRouter router) {
        address owner = vm.envAddress("OWNER");
        address feeRecipient = vm.envOr("FEE_RECIPIENT", owner);
        address bdex = vm.envOr("BDEX_ROUTER", DEFAULT_BDEX_ROUTER);
        address wbot = vm.envOr("WBOT", DEFAULT_WBOT);
        require(block.chainid == 968 || block.chainid == 677, "Not BOT Chain");
        require(bdex.code.length > 0 && wbot.code.length > 0, "BDEX router or WBOT not found");

        vm.startBroadcast();
        router = new BotFlowRouter(bdex, wbot, owner, feeRecipient);
        vm.stopBroadcast();

        console2.log("BotFlowRouter deployed at", address(router));
    }
}
