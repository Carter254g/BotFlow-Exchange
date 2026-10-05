// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IBDEXSwapRouter} from "./interfaces/IBDEXSwapRouter.sol";
import {IWBOT} from "./interfaces/IWBOT.sol";

/// @title BotFlowRouter
/// @notice Swap entry point for BotFlow Exchange on BOT Chain. Routes single and multi-hop swaps
///         through BDEX V3, handles native BOT in and out in a single transaction, enforces the
///         user's minimum output after any protocol fee, and supports fee-on-transfer input tokens.
/// @dev The contract never holds user funds between transactions. Every swap pulls the input,
///      swaps, pays out and clears its router approval within the same call.
contract BotFlowRouter is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Hard cap on the protocol fee: 0.30%.
    uint16 public constant MAX_FEE_BPS = 30;
    uint256 private constant BPS = 10_000;
    /// @notice Used in events to mean the native BOT coin.
    address public constant NATIVE = address(0);

    uint256 private constant ADDR_SIZE = 20;
    uint256 private constant HOP_SIZE = 23; // fee (3 bytes) + next token (20 bytes)
    uint256 private constant MIN_PATH = ADDR_SIZE + HOP_SIZE;

    IBDEXSwapRouter public immutable swapRouter;
    IWBOT public immutable wbot;

    /// @notice Protocol fee taken from the output, in basis points. Starts at zero.
    uint16 public feeBps;
    address public feeRecipient;

    event Swapped(
        address indexed sender,
        address indexed recipient,
        address indexed tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 fee
    );
    event FeeUpdated(uint16 feeBps, address feeRecipient);
    event Rescued(address indexed token, address indexed to, uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error Expired();
    error InvalidPath();
    error InsufficientOutput(uint256 amountOut, uint256 minimum);
    error FeeTooHigh();
    error NativeTransferFailed();
    error UnexpectedNativeSender();

    modifier checkDeadline(uint256 deadline) {
        _checkDeadline(deadline);
        _;
    }

    constructor(address swapRouter_, address wbot_, address owner_, address feeRecipient_) Ownable(owner_) {
        if (swapRouter_ == address(0) || wbot_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        swapRouter = IBDEXSwapRouter(swapRouter_);
        wbot = IWBOT(wbot_);
        feeRecipient = feeRecipient_;
    }

    /// @dev Only WBOT may send native BOT here (when unwrapping). Stops users losing BOT by mistake.
    receive() external payable {
        if (msg.sender != address(wbot)) revert UnexpectedNativeSender();
    }

    // ------------------------------------------------------------------ swaps

    /// @notice Swap an exact amount of one ERC-20 for another along a BDEX V3 path.
    /// @param path Packed path: tokenIn, fee, token, fee, ..., tokenOut.
    /// @param amountIn Amount of tokenIn to spend. The caller must approve this contract first.
    /// @param minOut Minimum tokenOut the recipient must receive, after fees.
    /// @param recipient Address that receives tokenOut.
    /// @param deadline Unix time after which the swap reverts.
    function swapExactTokensForTokens(
        bytes calldata path,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 amountOut) {
        if (recipient == address(0)) revert ZeroAddress();
        (address tokenIn, address tokenOut) = _pathEnds(path);
        uint256 received = _pullIn(tokenIn, amountIn);
        uint256 fee;
        (amountOut, fee) = _swap(path, tokenIn, tokenOut, received, minOut);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        emit Swapped(msg.sender, recipient, tokenIn, tokenOut, received, amountOut, fee);
    }

    /// @notice Swap native BOT (sent as msg.value) for an ERC-20. The path must start with WBOT.
    function swapExactBOTForTokens(bytes calldata path, uint256 minOut, address recipient, uint256 deadline)
        external
        payable
        nonReentrant
        whenNotPaused
        checkDeadline(deadline)
        returns (uint256 amountOut)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();
        (address tokenIn, address tokenOut) = _pathEnds(path);
        if (tokenIn != address(wbot)) revert InvalidPath();
        wbot.deposit{value: msg.value}();
        uint256 fee;
        (amountOut, fee) = _swap(path, tokenIn, tokenOut, msg.value, minOut);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        emit Swapped(msg.sender, recipient, NATIVE, tokenOut, msg.value, amountOut, fee);
    }

    /// @notice Swap an exact amount of an ERC-20 for native BOT. The path must end with WBOT.
    function swapExactTokensForBOT(
        bytes calldata path,
        uint256 amountIn,
        uint256 minOut,
        address recipient,
        uint256 deadline
    ) external nonReentrant whenNotPaused checkDeadline(deadline) returns (uint256 amountOut) {
        if (recipient == address(0)) revert ZeroAddress();
        (address tokenIn, address tokenOut) = _pathEnds(path);
        if (tokenOut != address(wbot)) revert InvalidPath();
        uint256 received = _pullIn(tokenIn, amountIn);
        uint256 fee;
        (amountOut, fee) = _swap(path, tokenIn, tokenOut, received, minOut);
        wbot.withdraw(amountOut);
        _sendBOT(recipient, amountOut);
        emit Swapped(msg.sender, recipient, tokenIn, NATIVE, received, amountOut, fee);
    }

    // ------------------------------------------------------------------ admin

    /// @notice Set the protocol fee. Capped at MAX_FEE_BPS so users are never charged more.
    function setFee(uint16 feeBps_, address feeRecipient_) external onlyOwner {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeBps = feeBps_;
        feeRecipient = feeRecipient_;
        emit FeeUpdated(feeBps_, feeRecipient_);
    }

    /// @notice Stop new swaps in an emergency. Does not affect funds, since none are held.
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Recover tokens or BOT sent to this contract by mistake. Use address(0) for BOT.
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        if (token == NATIVE) _sendBOT(to, amount);
        else IERC20(token).safeTransfer(to, amount);
        emit Rescued(token, to, amount);
    }

    // ------------------------------------------------------------------ internal

    /// @dev Validates the packed path layout and returns its first and last token.
    function _pathEnds(bytes calldata path) internal pure returns (address tokenIn, address tokenOut) {
        uint256 len = path.length;
        if (len < MIN_PATH || (len - ADDR_SIZE) % HOP_SIZE != 0) revert InvalidPath();
        tokenIn = address(bytes20(path[:ADDR_SIZE]));
        tokenOut = address(bytes20(path[len - ADDR_SIZE:]));
        if (tokenIn == tokenOut) revert InvalidPath();
    }

    /// @dev Pulls tokens from the caller and returns the amount actually received,
    ///      so tokens that charge a fee on transfer are handled correctly.
    function _pullIn(address token, uint256 amount) internal returns (uint256 received) {
        if (amount == 0) revert ZeroAmount();
        uint256 before = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
    }

    /// @dev Swaps through BDEX, takes the protocol fee from the output and enforces minOut on the
    ///      amount the user actually gets. Output is measured by balance change, not trusted from
    ///      the router's return value.
    function _swap(bytes calldata path, address tokenIn, address tokenOut, uint256 amountIn, uint256 minOut)
        internal
        returns (uint256 net, uint256 fee)
    {
        IERC20(tokenIn).forceApprove(address(swapRouter), amountIn);
        uint256 before = IERC20(tokenOut).balanceOf(address(this));
        swapRouter.exactInput(
            IBDEXSwapRouter.ExactInputParams({
                path: path,
                recipient: address(this),
                deadline: block.timestamp,
                amountIn: amountIn,
                amountOutMinimum: 0 // checked below, after the fee
            })
        );
        uint256 gross = IERC20(tokenOut).balanceOf(address(this)) - before;
        IERC20(tokenIn).forceApprove(address(swapRouter), 0);

        fee = (gross * feeBps) / BPS;
        net = gross - fee;
        if (net < minOut) revert InsufficientOutput(net, minOut);
        if (fee != 0) IERC20(tokenOut).safeTransfer(feeRecipient, fee);
    }

    function _checkDeadline(uint256 deadline) internal view {
        if (block.timestamp > deadline) revert Expired();
    }

    function _sendBOT(address to, uint256 amount) internal {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
