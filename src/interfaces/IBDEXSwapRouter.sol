// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal interface for the BDEX V3 SwapRouter on BOT Chain (Uniswap V3 SwapRouter compatible).
interface IBDEXSwapRouter {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
