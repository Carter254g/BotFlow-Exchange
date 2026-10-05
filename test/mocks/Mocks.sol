// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IBDEXSwapRouter} from "../../src/interfaces/IBDEXSwapRouter.sol";

interface IMintable {
    function mint(address to, uint256 amount) external;
}

contract MockERC20 is ERC20, IMintable {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @dev Burns 1% of every transfer, like a fee-on-transfer token.
contract MockFeeToken is MockERC20 {
    constructor() MockERC20("Fee Token", "FEE", 18) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 burn = value / 100;
            super._update(from, address(0), burn);
            value -= burn;
        }
        super._update(from, to, value);
    }
}

/// @dev WETH9-style wrapper. mint() lets the mock router pay out WBOT; it must hold enough BOT to back withdrawals.
contract MockWBOT is MockERC20 {
    constructor() MockERC20("Wrapped BOT", "WBOT", 18) {}

    function deposit() external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "send failed");
    }

    receive() external payable {}
}

/// @dev Simplified V3 router: pays out amountIn * rateNum / rateDen of the last token in the path.
///      Mirrors the real router's revert strings for deadline and slippage.
contract MockSwapRouter is IBDEXSwapRouter {
    uint256 public rateNum = 2;
    uint256 public rateDen = 1;
    uint256 public lastPathLength;

    function setRate(uint256 n, uint256 d) external {
        rateNum = n;
        rateDen = d;
    }

    function exactInput(ExactInputParams calldata p) external payable returns (uint256 out) {
        require(block.timestamp <= p.deadline, "Transaction too old");
        bytes calldata path = p.path;
        address tokenIn = address(bytes20(path[:20]));
        address tokenOut = address(bytes20(path[path.length - 20:]));
        lastPathLength = path.length;
        IERC20(tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        out = (p.amountIn * rateNum) / rateDen;
        require(out >= p.amountOutMinimum, "Too little received");
        IMintable(tokenOut).mint(p.recipient, out);
    }
}

/// @dev Tries to re-enter the router during a swap by acting as a malicious token.
contract ReentrantToken is MockERC20 {
    address public target;
    bytes public payload;

    constructor() MockERC20("Evil", "EVIL", 18) {}

    function arm(address t, bytes calldata p) external {
        target = t;
        payload = p;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (target != address(0) && from != address(0) && to == target) {
            address t = target;
            target = address(0);
            (bool ok, bytes memory ret) = t.call(payload);
            if (!ok) {
                assembly {
                    revert(add(ret, 32), mload(ret))
                }
            }
        }
    }
}
