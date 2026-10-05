// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Wrapped BOT, a WETH9-style wrapper for the native BOT coin.
interface IWBOT is IERC20 {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}
