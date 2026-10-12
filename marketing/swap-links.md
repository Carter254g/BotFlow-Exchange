# Shareable Swap Links

One-click first trades for every new wallet holder. Each link opens BotFlow
with the pair and amount filled in. Amounts are examples. Unknown token
addresses are never imported automatically, so these links are safe to publish.

## First trade: BOT to USDT

- 1 BOT:   https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=1
- 10 BOT:  https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=10
- 100 BOT: https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=100

## Back to BOT: USDT to BOT

- 10 USDT:  https://botflow-woad.vercel.app/app/?from=USDT&to=BOT&amount=10
- 100 USDT: https://botflow-woad.vercel.app/app/?from=USDT&to=BOT&amount=100

## Wrapping: BOT to WBOT, 1:1, no pool fee

- Wrap 5 BOT: https://botflow-woad.vercel.app/app/?from=BOT&to=WBOT&amount=5

## Embed in docs and faucet pages

```html
<a href="https://botflow-woad.vercel.app/app/?from=BOT&to=USDT&amount=10">
  Trade your first BOT on BotFlow
</a>
```

## Faucet continuity

Testnet history for reference: chain 968, RPC https://rpc.bohr.life, explorer
https://scan.bohr.life, faucet https://faucet.botchain.ai/basic
(10 tBOT + 1000 test USDT per day). Keep this faucet reliably dripping while
builders iterate. A dry faucet stalls every testnet project, not just ours.
