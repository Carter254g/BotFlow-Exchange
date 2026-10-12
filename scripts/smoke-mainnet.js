// Mainnet readiness smoke test (read-only, no wallet, no gas).
// Checks chain, contract code, router config, USDT metadata, and a live
// WBOT -> USDT quote across every BDEX fee tier, mirroring app/app.js routing.
// Usage: node scripts/smoke-mainnet.js
const { JsonRpcProvider, Contract, parseEther, formatUnits } = require("/Users/apple/Documents/Default Project/Agent-Allowance/node_modules/ethers");

const RPC = "https://rpc.botchain.ai";
const ROUTER = "0x30E2dA3Bb34FC2d17F86318daaf45Aa72e7fe524";
const QUOTER = "0x034A705b36067cff99ABf5C662Be881cBd8d0176";
const WBOT = "0xD5452816194a3784dBa983426cCe7c122F4abd30";
const USDT = "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C";

async function main() {
  const p = new JsonRpcProvider(RPC, 677, { staticNetwork: true });
  const chain = Number((await p.getNetwork()).chainId);
  console.log("chain:", chain, chain === 677 ? "OK" : "WRONG CHAIN");
  for (const [n, a] of [["BotFlowRouter", ROUTER], ["Quoter", QUOTER], ["WBOT", WBOT], ["USDT", USDT]]) {
    const code = await p.getCode(a);
    console.log(`${n}:`, code === "0x" ? "NO CODE - STOP" : `code OK (${(code.length - 2) / 2} bytes)`);
  }
  const r = new Contract(ROUTER,
    ["function owner() view returns (address)", "function feeRecipient() view returns (address)",
     "function feeBps() view returns (uint16)", "function swapRouter() view returns (address)"], p);
  console.log("owner:", await r.owner(), "| feeRecipient:", await r.feeRecipient(),
    "| feeBps:", (await r.feeBps()).toString(), "| bdex:", await r.swapRouter());
  const t = new Contract(USDT, ["function decimals() view returns (uint8)", "function symbol() view returns (string)"], p);
  console.log("USDT:", await t.symbol(), await t.decimals(), "decimals");

  const q = new Contract(QUOTER,
    ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)"], p);
  const amountIn = parseEther("1");
  let best = null;
  for (const fee of [100, 500, 3000, 10000]) {
    try {
      const out = (await q.quoteExactInputSingle.staticCall({ tokenIn: WBOT, tokenOut: USDT, amountIn, fee, sqrtPriceLimitX96: 0 }))[0];
      if (out > 0n) {
        console.log(`1 WBOT -> ${formatUnits(out, 6)} USDT @ ${fee / 10000}%`);
        if (!best || out > best) best = out;
      }
    } catch { console.log(`fee ${fee}: no pool`); }
  }
  if (!best) throw new Error("No WBOT->USDT route on mainnet. App will show 'No route found'.");
  console.log("SMOKE OK");
}

main().catch((e) => { console.error("SMOKE FAILED:", e.shortMessage || e.message || e); process.exitCode = 1; });
