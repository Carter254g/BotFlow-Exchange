// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {BotFlowRouter} from "../../src/BotFlowRouter.sol";

/// @notice Runs against live BDEX pools on a fork of BOT Chain.
///         BOT_RPC_URL=https://rpc.botchain.ai forge test --match-path test/fork/*
///         Skipped when BOT_RPC_URL is not set.
contract BotChainForkTest is Test {
    address constant BDEX_ROUTER = 0x07032d47A1b9f8460cBeE9dC17c1d3E438693929;
    address constant WBOT = 0xD5452816194a3784dBa983426cCe7c122F4abd30;
    address constant USDT = 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C;

    BotFlowRouter router;
    address user = makeAddr("user");

    function setUp() public {
        string memory rpc = vm.envOr("BOT_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true);
            return;
        }
        vm.createSelectFork(rpc);
        router = new BotFlowRouter(BDEX_ROUTER, WBOT, address(this), address(this));
        vm.deal(user, 10 ether);
    }

    function _bestPath(address a, address b) internal returns (bytes memory best) {
        uint24[4] memory fees = [uint24(3000), 500, 10000, 100];
        for (uint256 i; i < fees.length; i++) {
            bytes memory p = abi.encodePacked(a, fees[i], b);
            vm.prank(user);
            try router.swapExactBOTForTokens{value: 0.01 ether}(p, 0, user, block.timestamp) returns (uint256 out) {
                if (out > 0) return p;
            } catch {}
        }
        revert("no live WBOT/USDT pool found");
    }

    function test_Fork_BOTToUSDTAndBack() public {
        bytes memory path = _bestPath(WBOT, USDT);
        uint256 usdtBefore = IERC20(USDT).balanceOf(user);
        vm.prank(user);
        router.swapExactBOTForTokens{value: 1 ether}(path, 1, user, block.timestamp + 600);
        uint256 got = IERC20(USDT).balanceOf(user) - usdtBefore;
        assertGt(got, 0);

        // reverse the path: USDT, fee, WBOT
        bytes memory back = abi.encodePacked(USDT, uint24(bytes3(_slice(path, 20, 3))), WBOT);
        vm.startPrank(user);
        IERC20(USDT).approve(address(router), got);
        uint256 botBefore = user.balance;
        router.swapExactTokensForBOT(back, got, 1, user, block.timestamp + 600);
        vm.stopPrank();
        assertGt(user.balance, botBefore);
        assertEq(IERC20(USDT).balanceOf(address(router)), 0);
        assertEq(IERC20(WBOT).balanceOf(address(router)), 0);
    }

    function _slice(bytes memory b, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i; i < len; i++) out[i] = b[start + i];
    }
}
