/**
 * Fills the hero's example trade with a live BDEX V3 quote: 100 BOT (as WBOT) to USDT,
 * best of all fee tiers. Read-only calls to the public BOT Chain RPC. No wallet needed.
 */
"use strict";
(async function () {
  const out = document.getElementById("qOut"), feeEl = document.getElementById("qFee");
  const tag = document.getElementById("liveTag"), txt = document.getElementById("liveTxt");
  const fail = () => { out.textContent = "Check in app"; txt.textContent = "Live quote unavailable right now"; };
  if (!window.ethers) return fail();
  const { ethers } = window;
  const QUOTER = "0x034A705b36067cff99ABf5C662Be881cBd8d0176";
  const WBOT = "0xD5452816194a3784dBa983426cCe7c122F4abd30";
  const USDT = "0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C";
  const ABI = ["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160,uint32,uint256)",
               "function decimals() view returns (uint8)"];
  try {
    const p = new ethers.JsonRpcProvider("https://rpc.botchain.ai", 677, { staticNetwork: true });
    const q = new ethers.Contract(QUOTER, ABI, p);
    const dec = Number(await new ethers.Contract(USDT, ABI, p).decimals().catch(() => 6n));
    const amountIn = ethers.parseEther("100");
    let best = null;
    await Promise.all([100, 500, 3000, 10000].map(async (fee) => {
      try {
        const r = await q.quoteExactInputSingle.staticCall({ tokenIn: WBOT, tokenOut: USDT, amountIn, fee, sqrtPriceLimitX96: 0 });
        if (r[0] > 0n && (!best || r[0] > best.out)) best = { out: r[0], fee };
      } catch (e) {}
    }));
    if (!best) return fail();
    const n = Number(ethers.formatUnits(best.out, dec));
    out.textContent = n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 }) + " USDT";
    feeEl.textContent = best.fee / 10000 + "% pool";
    tag.classList.add("on");
    txt.textContent = "Live";
  } catch (e) { fail(); }
})();
