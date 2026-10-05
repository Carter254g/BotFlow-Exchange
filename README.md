# BotFlow Exchange

BotFlow Exchange is an open source swap app for BOT Chain (chain ID 677). It has two parts: `BotFlowRouter`, a Solidity contract that routes swaps through BDEX V3 liquidity, and a web app that runs entirely in the browser with no backend, no tracking and no custody of user funds.

**Website:** https://carter254g.github.io/BotFlow-Exchange/  
**Swap app:** https://carter254g.github.io/BotFlow-Exchange/app/

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
- **Shareable swap links.** `/app/?from=BOT&to=USDT&amount=10` opens the page with that swap filled in, so communities and projects can link straight to a trade. Unknown token addresses in a link are never imported automatically.
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

## Smart contract: BotFlowRouter

`src/BotFlowRouter.sol` is the on-chain entry point for BotFlow swaps. It sits in front of the BDEX V3 SwapRouter and adds the things a plain pool router leaves to the front end.

- **Native BOT in one transaction.** `swapExactBOTForTokens` takes BOT as `msg.value`, wraps it and swaps. `swapExactTokensForBOT` swaps and unwraps, sending native BOT to the recipient. Users no longer need separate wrap and unwrap transactions.
- **Single and multi-hop routes** through one function, using the standard V3 packed path (`token, fee, token, fee, token`). The path layout is validated on chain.
- **Minimum output enforced on what the user actually receives**, measured by balance change and checked after any protocol fee.
- **Fee-on-transfer input tokens** are handled by swapping only the amount that actually arrived.
- **No funds held.** Every call pulls the input, swaps, pays out and resets its router approval in the same transaction. Stray BOT sent to the contract is rejected.
- **Protocol fee for sustainability**, starting at 0% and hard-capped at 0.30% in the contract itself.
- **Safety controls.** OpenZeppelin `ReentrancyGuard`, `Pausable` for emergencies, two-step ownership transfer, and custom errors for clear revert reasons.

| Function | What it does |
| --- | --- |
| `swapExactTokensForTokens(path, amountIn, minOut, recipient, deadline)` | ERC-20 to ERC-20 |
| `swapExactBOTForTokens(path, minOut, recipient, deadline)` | Native BOT to ERC-20 (path starts with WBOT) |
| `swapExactTokensForBOT(path, amountIn, minOut, recipient, deadline)` | ERC-20 to native BOT (path ends with WBOT) |
| `setFee`, `pause`, `unpause`, `rescue` | Owner only |

### Tests

24 unit and fuzz tests in `test/BotFlowRouter.t.sol` cover every swap path, slippage and deadline checks, malformed paths, fee-on-transfer tokens, a reentrancy attack, fee maths and caps, pausing, ownership and rescue. Every test also checks that the contract is left holding no tokens, no BOT and no open approvals. Line coverage is about 97%.

`test/fork/BotChainFork.t.sol` runs a real BOT to USDT and back trip against live BDEX pools on a fork of BOT Chain.

```
forge install            # fetch forge-std and OpenZeppelin (git submodules)
forge test               # unit and fuzz tests
BOT_RPC_URL=https://rpc.botchain.ai forge test --match-path "test/fork/*"
```

### Deploy

```
OWNER=0xYourMultisig forge script script/Deploy.s.sol --rpc-url botchain --broadcast --account deployer
```

The script refuses to run on any chain other than BOT Chain and checks that the BDEX router and WBOT exist before deploying. Use a multisig as `OWNER`.

## Contracts

| Contract | Address |
| --- | --- |
| BotFlowRouter | Not deployed yet |
| BDEX V3 SwapRouter | `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929` |
| BDEX V3 Quoter | `0x034A705b36067cff99ABf5C662Be881cBd8d0176` |
| WBOT | `0xD5452816194a3784dBa983426cCe7c122F4abd30` |
| USDT | `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C` |

Network: BOT Chain, chain ID 677, RPC `https://rpc.botchain.ai`, explorer https://scan.botchain.ai

## Run the web app

No build step. Serve the folder with any static host:

```
python3 -m http.server 8000
```

then visit http://localhost:8000 for the landing page or http://localhost:8000/app/ for the swap app. The live demo is served by GitHub Pages from the `main` branch.

## Tech

- Solidity 0.8.24, OpenZeppelin Contracts 5.1, Foundry
- Plain HTML, CSS and JavaScript with no build step
- [ethers.js](https://docs.ethers.org/v6/) v6 from cdnjs
- Browser `localStorage` for settings, imported tokens and recent activity

## Roadmap

- Deploy BotFlowRouter to BOT Chain and switch the web app to route through it
- Independent security review of BotFlowRouter
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

## Repository layout

```
index.html                 landing page (served by GitHub Pages)
assets/                    landing page styles and live quote script
app/index.html             swap app
app/app.js                 web app logic: quoting, routing, wallet, swaps
app/styles.css             web app styles, light and dark themes
src/BotFlowRouter.sol      router contract
src/interfaces/            BDEX router and WBOT interfaces
test/                      unit, fuzz and fork tests
script/Deploy.s.sol        deployment script
```

## License

MIT. See [LICENSE](LICENSE).

## Notice

BotFlow Exchange is an independent interface and is not affiliated with BOT Chain or BDEX. Verify contract addresses on https://scan.botchain.ai before use.
