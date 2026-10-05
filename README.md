# BotFlow Exchange

BotFlow Exchange is an open source token swap interface for BOT Chain (chain ID 677). It routes trades through the BDEX V3 contracts and runs entirely in the browser as a single HTML file, with no backend, no tracking and no custody of user funds.

**Live demo:** https://carter254g.github.io/BotFlow-Exchange/

## Why it exists

New users on BOT Chain often hold native BOT but find that DEX pools trade WBOT, and they have to find a separate tool to wrap it first. BotFlow Exchange handles wrapping, approval and swapping in one flow, shows clearly what a trade will cost before it's signed, and works inside the in-app browsers of the wallets people on BOT Chain already use.

## Features

- **Swap any pair with liquidity.** Quotes every BDEX V3 fee tier (0.01%, 0.05%, 0.3%, 1%) and picks the one that returns the most.
- **Native BOT support.** Pay with or receive native BOT. The page wraps or unwraps WBOT for you, and BOT to WBOT (or back) is a direct 1:1 wrap with no pool fee.
- **Token selector with custom import.** Choose from the built-in list or paste any token address. The symbol and decimals are read from the contract, and the user is warned to check the address on the explorer before importing.
- **Price impact and rate.** Shows the exchange rate and the price impact of each trade. Impact over 3% is highlighted, and over 15% the button turns red and asks for an extra confirmation.
- **Slippage control.** 0.5%, 1% or 3%, with the minimum received amount shown before signing.
- **Approval choice.** Approve the exact amount each time (default, safer) or approve once with an unlimited allowance.
- **Recent activity.** The last 10 trades for each connected wallet, with explorer links. Saved only in the user's browser.
- **Live quotes before connecting.** Prices load from the public BOT Chain RPC, so users can check a rate without connecting a wallet.
- **Wallet and network handling.** Works with MetaMask, OKX, Bitget, TokenPocket and other EVM wallets. Switches to BOT Chain, or adds it if the wallet doesn't have it.
- **Mobile first, light and dark mode.**

## How a swap works

1. The page asks the BDEX V3 Quoter (`quoteExactInputSingle`) for a price at each fee tier and keeps the best result.
2. Price impact is measured by comparing that rate with the rate for a trade 1/1000th the size in the same pool.
3. When the user confirms, the page runs only the steps needed, numbered in the status line:
   - wrap BOT to WBOT, if paying with BOT
   - approve the router, if the allowance is too low
   - call `exactInputSingle` on the router, with `amountOutMinimum` set from the slippage setting and a 20 minute deadline
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

- Multi-hop routes (for example TOKEN to WBOT to USDT) when no direct pool exists
- Shared token list with verified logos
- Add-liquidity and position views for BDEX V3 pools
- Gas cost estimate in the trade summary
- Translations, starting with Swahili

## Security notes

- Default approvals are for the exact trade amount only.
- Imported tokens are never trusted by name. The address is shown and linked to the explorer.
- All user-supplied text, such as token symbols, is rendered as plain text, never as HTML.

## License

MIT. See [LICENSE](LICENSE).

## Notice

BotFlow Exchange is an independent interface and is not affiliated with BOT Chain or BDEX. Verify contract addresses on https://scan.botchain.ai before use.
