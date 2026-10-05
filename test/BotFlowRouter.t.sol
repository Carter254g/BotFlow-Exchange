// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {BotFlowRouter} from "../src/BotFlowRouter.sol";
import {MockERC20, MockWBOT, MockSwapRouter, MockFeeToken, ReentrantToken} from "./mocks/Mocks.sol";

contract BotFlowRouterTest is Test {
    BotFlowRouter router;
    MockSwapRouter bdex;
    MockWBOT wbot;
    MockERC20 usdt;
    MockERC20 xyz;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint24 constant FEE_TIER = 3000;
    uint256 deadline;

    function setUp() public {
        bdex = new MockSwapRouter();
        wbot = new MockWBOT();
        usdt = new MockERC20("Tether USD", "USDT", 6);
        xyz = new MockERC20("XYZ", "XYZ", 18);
        router = new BotFlowRouter(address(bdex), address(wbot), owner, treasury);
        vm.deal(address(wbot), 1_000_000 ether); // backs WBOT minted by the mock router
        vm.deal(alice, 100 ether);
        usdt.mint(alice, 1_000_000e6);
        xyz.mint(alice, 1_000_000 ether);
        deadline = block.timestamp + 20 minutes;
        vm.startPrank(alice);
        usdt.approve(address(router), type(uint256).max);
        xyz.approve(address(router), type(uint256).max);
        wbot.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function _path(address a, address b) internal pure returns (bytes memory) {
        return abi.encodePacked(a, FEE_TIER, b);
    }

    function _assertEmpty() internal view {
        assertEq(usdt.balanceOf(address(router)), 0, "router kept USDT");
        assertEq(xyz.balanceOf(address(router)), 0, "router kept XYZ");
        assertEq(wbot.balanceOf(address(router)), 0, "router kept WBOT");
        assertEq(address(router).balance, 0, "router kept BOT");
        assertEq(usdt.allowance(address(router), address(bdex)), 0, "approval left open");
        assertEq(xyz.allowance(address(router), address(bdex)), 0, "approval left open");
        assertEq(wbot.allowance(address(router), address(bdex)), 0, "approval left open");
    }

    // ---------------------------------------------------------------- happy paths

    function test_TokensForTokens() public {
        vm.prank(alice);
        uint256 out = router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 100e6, 200e6, bob, deadline);
        assertEq(out, 200e6);
        assertEq(xyz.balanceOf(bob), 200e6);
        assertEq(usdt.balanceOf(alice), 1_000_000e6 - 100e6);
        _assertEmpty();
    }

    function test_MultiHop() public {
        bytes memory path = abi.encodePacked(address(usdt), uint24(500), address(wbot), uint24(3000), address(xyz));
        vm.prank(alice);
        uint256 out = router.swapExactTokensForTokens(path, 10e6, 0, alice, deadline);
        assertEq(out, 20e6);
        assertEq(bdex.lastPathLength(), 66);
        _assertEmpty();
    }

    function test_BOTForTokens() public {
        vm.prank(alice);
        uint256 out =
            router.swapExactBOTForTokens{value: 1 ether}(_path(address(wbot), address(usdt)), 2 ether, bob, deadline);
        assertEq(out, 2 ether);
        assertEq(usdt.balanceOf(bob), 2 ether);
        assertEq(alice.balance, 99 ether);
        _assertEmpty();
    }

    function test_TokensForBOT() public {
        uint256 before = bob.balance;
        vm.prank(alice);
        uint256 out = router.swapExactTokensForBOT(_path(address(xyz), address(wbot)), 5 ether, 10 ether, bob, deadline);
        assertEq(out, 10 ether);
        assertEq(bob.balance - before, 10 ether);
        _assertEmpty();
    }

    function test_EmitsSwapped() public {
        vm.expectEmit(true, true, true, true, address(router));
        emit BotFlowRouter.Swapped(alice, bob, router.NATIVE(), address(usdt), 1 ether, 2 ether, 0);
        vm.prank(alice);
        router.swapExactBOTForTokens{value: 1 ether}(_path(address(wbot), address(usdt)), 0, bob, deadline);
    }

    // ---------------------------------------------------------------- user protection

    function test_RevertWhen_OutputBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BotFlowRouter.InsufficientOutput.selector, 200e6, 200e6 + 1));
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 100e6, 200e6 + 1, bob, deadline);
    }

    function test_RevertWhen_Expired() public {
        vm.warp(deadline + 1);
        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.Expired.selector);
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 1e6, 0, bob, deadline);
    }

    function test_RevertWhen_PathMalformed() public {
        bytes memory bad = abi.encodePacked(address(usdt), uint24(3000), address(xyz), uint8(1));
        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(bad, 1e6, 0, bob, deadline);

        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(abi.encodePacked(address(usdt)), 1e6, 0, bob, deadline);
    }

    function test_RevertWhen_SameTokenInAndOut() public {
        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(_path(address(usdt), address(usdt)), 1e6, 0, bob, deadline);
    }

    function test_RevertWhen_BOTPathDoesNotStartWithWBOT() public {
        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.InvalidPath.selector);
        router.swapExactBOTForTokens{value: 1 ether}(_path(address(usdt), address(xyz)), 0, bob, deadline);
    }

    function test_RevertWhen_BOTOutPathDoesNotEndWithWBOT() public {
        vm.prank(alice);
        vm.expectRevert(BotFlowRouter.InvalidPath.selector);
        router.swapExactTokensForBOT(_path(address(usdt), address(xyz)), 1e6, 0, bob, deadline);
    }

    function test_RevertWhen_ZeroAmountsOrRecipient() public {
        vm.startPrank(alice);
        vm.expectRevert(BotFlowRouter.ZeroAmount.selector);
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 0, 0, bob, deadline);
        vm.expectRevert(BotFlowRouter.ZeroAmount.selector);
        router.swapExactBOTForTokens(_path(address(wbot), address(usdt)), 0, bob, deadline);
        vm.expectRevert(BotFlowRouter.ZeroAddress.selector);
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 1e6, 0, address(0), deadline);
        vm.stopPrank();
    }

    function test_RejectsStrayBOT() public {
        vm.prank(alice);
        (bool ok,) = address(router).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_FeeOnTransferInput() public {
        MockFeeToken fot = new MockFeeToken();
        fot.mint(alice, 100 ether);
        vm.startPrank(alice);
        fot.approve(address(router), type(uint256).max);
        uint256 out = router.swapExactTokensForTokens(_path(address(fot), address(xyz)), 10 ether, 0, alice, deadline);
        vm.stopPrank();
        // 1% is lost on the way in, so only 9.9 is swapped (the router must not try to spend 10)
        assertEq(out, 19.8 ether);
        assertEq(fot.balanceOf(address(router)), 0);
    }

    function test_RevertWhen_Reentered() public {
        ReentrantToken evil = new ReentrantToken();
        evil.mint(alice, 10 ether);
        bytes memory inner = abi.encodeCall(
            BotFlowRouter.swapExactTokensForTokens, (_path(address(evil), address(xyz)), 1, 0, alice, deadline)
        );
        evil.arm(address(router), inner);
        vm.startPrank(alice);
        evil.approve(address(router), type(uint256).max);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        router.swapExactTokensForTokens(_path(address(evil), address(xyz)), 1 ether, 0, alice, deadline);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- fees

    function test_FeeTakenFromOutputAndMinOutAppliesAfterFee() public {
        vm.prank(owner);
        router.setFee(30, treasury);
        vm.prank(alice);
        uint256 out = router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 100e6, 0, bob, deadline);
        assertEq(out, 200e6 - 600_000);
        assertEq(xyz.balanceOf(treasury), 600_000);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BotFlowRouter.InsufficientOutput.selector, 200e6 - 600_000, 200e6));
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 100e6, 200e6, bob, deadline);
    }

    function test_RevertWhen_FeeAboveCap() public {
        vm.prank(owner);
        vm.expectRevert(BotFlowRouter.FeeTooHigh.selector);
        router.setFee(31, treasury);
    }

    // ---------------------------------------------------------------- admin

    function test_OnlyOwnerCanAdminister() public {
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        router.setFee(10, alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        router.pause();
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        router.rescue(address(usdt), alice, 1);
        vm.stopPrank();
    }

    function test_PauseBlocksSwaps() public {
        vm.prank(owner);
        router.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 1e6, 0, bob, deadline);
        vm.prank(owner);
        router.unpause();
        vm.prank(alice);
        router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), 1e6, 0, bob, deadline);
    }

    function test_RescueTokensSentByMistake() public {
        vm.prank(alice);
        usdt.transfer(address(router), 5e6);
        vm.prank(owner);
        router.rescue(address(usdt), alice, 5e6);
        assertEq(usdt.balanceOf(address(router)), 0);
    }

    function test_OwnershipTransferIsTwoStep() public {
        vm.prank(owner);
        router.transferOwnership(bob);
        assertEq(router.owner(), owner);
        vm.prank(bob);
        router.acceptOwnership();
        assertEq(router.owner(), bob);
    }

    function test_ConstructorRejectsZeroAddresses() public {
        vm.expectRevert(BotFlowRouter.ZeroAddress.selector);
        new BotFlowRouter(address(0), address(wbot), owner, treasury);
        vm.expectRevert(BotFlowRouter.ZeroAddress.selector);
        new BotFlowRouter(address(bdex), address(wbot), owner, address(0));
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_TokensForTokens(uint256 amountIn, uint16 feeBps, uint8 rateNum) public {
        amountIn = bound(amountIn, 1, 1_000_000e6);
        feeBps = uint16(bound(feeBps, 0, 30));
        rateNum = uint8(bound(rateNum, 1, 255));
        bdex.setRate(rateNum, 3);
        vm.prank(owner);
        router.setFee(feeBps, treasury);

        uint256 gross = (amountIn * rateNum) / 3;
        uint256 fee = (gross * feeBps) / 10_000;
        vm.prank(alice);
        if (gross - fee == 0) {
            uint256 out = router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), amountIn, 0, bob, deadline);
            assertEq(out, 0);
        } else {
            uint256 out =
                router.swapExactTokensForTokens(_path(address(usdt), address(xyz)), amountIn, gross - fee, bob, deadline);
            assertEq(out, gross - fee);
            assertEq(xyz.balanceOf(bob) + xyz.balanceOf(treasury), gross);
        }
        _assertEmpty();
    }

    function testFuzz_BOTRoundTrip(uint96 amount) public {
        uint256 a = bound(uint256(amount), 1, 50 ether);
        bdex.setRate(1, 1);
        vm.startPrank(alice);
        router.swapExactBOTForTokens{value: a}(_path(address(wbot), address(xyz)), a, alice, deadline);
        uint256 before = alice.balance;
        router.swapExactTokensForBOT(_path(address(xyz), address(wbot)), a, a, alice, deadline);
        vm.stopPrank();
        assertEq(alice.balance - before, a);
        _assertEmpty();
    }
}
