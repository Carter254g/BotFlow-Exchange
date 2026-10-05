# BotFlow Exchange

BotFlow Exchange is an open source token swap interface for BOT Chain (chain ID 677). It routes trades through the BDEX V3 contracts and runs entirely in the browser as a single HTML file, with no backend, no tracking and no custody of user funds.

**Live demo:** https://carter254g.github.io/BotFlow-Exchange/

## Why it exists

New users on BOT Chain often hold native BOT but find that DEX pools trade WBOT, and they have to find a separate tool to wrap it first. BotFlow Exchange handles wrapping, approval and swapping in one flow, shows clearly what a trade will cost before it's signed, and works inside the in-app browsers of the wallets people on BOT Chain already use.

## Features

**Trading**
- **Smart routing.** Quotes every BDEX V3 fee tier directly, plus two-hop routes through WBOT and USDT, and picks the route that returns the most. A direct pool is preferred unless a multi-hop route is more than 0.1% better, since it uses less gas. Tokens with no direct pool can still be traded.
- **Native BOT support.** Pay with or receive native BOT. The page wraps or unwraps WBOT for you, and BOT to WBOT (or back) is a direct 1:1 wrap with no pool fee.
- **Token selector with custom import.** Choose from the built-in list or paste any token address. Symbol and decimals are read from the contract, and the user is warned to check the address on the explorer before importing.
- **Live quotes before connecting.** Prices load from the public BOT Chain RPC, so visitors can check a rate without a wallet. Quotes refresh every 15 seconds.

**Protecting the user**
- **Fresh price check before signing.** The route is quoted again right before the swap. If the price has fallen below the user's minimum, the swap stops before the wallet is asked to sign.
- **Simulation before sending.** Every swap is simulated first, so a trade that would fail never costs gas.
- **Price impact warnings.** Impact over 3% is highlighted. Over 15% the button turns red and asks for an extra confirmation.
- **Readable errors.** Common failures (slippage exceeded, deadline passed, failed transfer, not enough BOT for gas, wallet busy, network down) are explained in plain language with what to do next.
- **Gas reserve.** Max and the swap button leave 0.01 BOT in the wallet so the user can always pay network fees.
- **Approvals manager.** Shows every token the router can spend from the user's wallet and lets them revoke any approval in one click.

**Settings**
- **Slippage.** 0.1%, 0.5%, 1% or a custom value up to 50%, with warnings for very low or high values.
- **Transaction deadline.** 1 to 180 minutes (default 20).
- **Approval mode.** Exact amount each time (default, safer) or unlimited.

**Convenience**
- **Network fee estimate** in BOT before signing.
- **Shareable swap links.** `?from=BOT&to=USDT&amount=10` opens the page with that swap filled in, so communities and projects can link straight to a trade. Unknown token addresses in a link are never imported automatically.
- **Add token to wallet** after a swap.
- **Recent activity** for each wallet with explorer links. Pending transactions are tracked even if the page is closed, and their result is checked the next time the wallet connects.
- **Wallet and network handling.** Works with MetaMask, OKX, Bitget, TokenPocket and other EVM wallets. Switches to BOT Chain, or adds it if the wallet doesn't have it.
- **Mobile first, light and dark mode.**

## How a swap works

1. The page asks the BDEX V3 Quoter for a price on every candidate route (`quoteExactInputSingle` for direct pools, `quoteExactInput` for two-hop paths) and keeps the best one.
2. Price impact is measured by comparing that rate with the rate for a trade 1/1000th the size on the same route.
3. When the user confirms, the page runs only the steps needed, numbered in the status line:
   - wrap BOT to WBOT, if paying with BOT
   - approve the router, if the allowance is too low
   - quote the route again and stop if the price fell below the minimum
   - simulate the swap, then send `exactInputSingle` or `exactInput` with `amountOutMinimum` from the slippage setting and the chosen deadline
   - unwrap the WBOT received, if receiving BOT (the amount is measured from the balance change, not the estimate)

Every transaction is signed in the user's own wallet. The page never holds keys or funds.

## Contracts

| Contract | Address |
| --- | --- |
| BDEX V3 SwapRouter | `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929` |
| BDEX V3 Quoter | `0x034A705b36067cff99ABf5C662Be881cBd8d0176` |
| WBOT | `0xD5452816194a3784dBa983426cCe7c122F4abd30` |
| USDT | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` |

Network: BOT Chain, chain ID 677, RPC `https://rpc.botchain.ai`, explorer https://scan.botchain.ai

## Run it

No build step. Open `index.html` in a browser, or serve the folder with any static host:

```
python3 -m http.server 8000
```

then visit http://localhost:8000. The live demo is served by GitHub Pages from the `main` branch.

## Tech

- Plain HTML, CSS and JavaScript in one file
- [ethers.js](https://docs.ethers.org/v6/) v6 from cdnjs
- Browser `localStorage` for settings, imported tokens and recent activity

## Roadmap

- Shared token list with verified logos
- USD values next to amounts
- Add-liquidity and position views for BDEX V3 pools
- Split routes across several pools for large trades
- Translations, starting with Swahili

## Security notes

- Default approvals are for the exact trade amount only, and any approval can be revoked from the Approvals panel.
- Swaps are re-quoted and simulated before the wallet is asked to sign.
- Imported tokens are never trusted by name. The address is shown and linked to the explorer.
- All user-supplied text, such as token symbols, is rendered as plain text, never as HTML.

## License

MIT. See [LICENSE](LICENSE).

## Notice

BotFlow Exchange is an independent interface and is not affiliated with BOT Chain or BDEX. Verify contract addresses on https://scan.botchain.ai before use.
