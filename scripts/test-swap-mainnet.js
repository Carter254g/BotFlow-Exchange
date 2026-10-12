// live micro-swap on mainnet through BotFlowRouter: 0.05 BOT -> USDT.
// Proves the full path (wrap, route, min-out, payout) with real funds.
// Usage: PRIVATE_KEY=0x... node scripts/test-swap-mainnet.js
const { JsonRpcProvider, Wallet, Contract, parseEther, formatUnits, solidityPacked } = require("/Users/apple/Documents/Default Project/Agent-Allowance/node_modules/ethers");

const RPC = "https://rpc.botchain.ai";
const EXPLORER = "https://scan.botchain.ai";
const ROUTER = "0x30E2dA3Bb34FC2d17F86318daaf45Aa72e7fe524";
const QUOTER = "0x034A705b36067cff99ABf5C662Be881cBd8d0176";
const WBOT = "0xD5452816194a3784dBa983426cCe7c122F4abd30";
const USDT = "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C";
const AMOUNT = parseEther("0.05");
const FEE = 3000;

async function main() {
  const p = new JsonRpcProvider(RPC, 677, { staticNetwork: true });
  const w = new Wallet(process.env.PRIVATE_KEY, p);
  console.log("tester:", w.address, "| BOT:", Number(await p.getBalance(w.address)) / 1e18);

  const q = new Contract(QUOTER,
    ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)"], p);
  const quoted = (await q.quoteExactInputSingle.staticCall({ tokenIn: WBOT, tokenOut: USDT, amountIn: AMOUNT, fee: FEE, sqrtPriceLimitX96: 0 }))[0];
  const minOut = quoted * 99n / 100n; // 1% slippage
  console.log(`quote: 0.05 BOT -> ${formatUnits(quoted, 6)} USDT | minOut: ${formatUnits(minOut, 6)}`);

  const usdt = new Contract(USDT, ["function balanceOf(address) view returns (uint256)"], p);
  const before = await usdt.balanceOf(w.address);
  const r = new Contract(ROUTER,
    ["function swapExactBOTForTokens(bytes path,uint256 minOut,address recipient,uint256 deadline) payable"], w);
  const path = solidityPacked(["address", "uint24", "address"], [WBOT, FEE, USDT]);
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const tx = await r.swapExactBOTForTokens(path, minOut, w.address, deadline, { value: AMOUNT });
  console.log("sent:", `${EXPLORER}/tx/${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status !== 1) throw new Error("swap reverted on chain");
  const got = (await usdt.balanceOf(w.address)) - before;
  console.log(`SUCCESS: received ${formatUnits(got, 6)} USDT`);
}

main().catch((e) => { console.error("SWAP TEST FAILED:", e.shortMessage || e.message || e); process.exitCode = 1; });
