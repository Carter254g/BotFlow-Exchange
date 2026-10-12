# Shareable Swap Links (for faucet page, docs, starter guides)

Base: https://botflow-woad.vercel.app. Unknown token addresses in links are
never auto-imported, so these are safe to publish. Amounts are examples.

## First-trade links (BOT -> USDT)
- 1 BOT:    https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=1
- 10 BOT:   https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=10
- 100 BOT:  https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=100

## Reverse (USDT -> BOT)
- 10 USDT:  https://botflow-woad.vercel.app/app/?from=USDT&to=BOT&amount=10
- 100 USDT: https://botflow-woad.vercel.app/app/?from=USDT&to=BOT&amount=100

## Wrap demo (BOT <-> WBOT, 1:1, no pool fee)
- Wrap 5 BOT: https://botflow-woad.vercel.app/app/?from=BOT&to=WBOT&amount=5

## Embed snippet (docs / faucet page)
```html
<a href="https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=10">
  Trade your first BOT on BotFlow
</a>
```

## Faucet continuity note (testnet iterations)
Testnet app history: chain 968, RPC https://rpc.bohr.life, explorer
https://scan.bohr.life, faucet https://faucet.botchain.ai/basic
(10 tBOT + 1000 test USDT/day). Keep this faucet reliably dripping while
builders iterate. A dry faucet stalls every testnet project, not just ours.
