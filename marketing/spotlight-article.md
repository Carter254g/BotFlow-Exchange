# Builder Spotlight (draft for BOT Chain blog / Telegram article)

## How BotFlow tamed the first trade on BOT Chain

Every new chain has the same awkward first five minutes. You arrive holding the native coin, you want a stablecoin, and the pools trade a wrapped version you've never heard of. Somewhere between a wrapping tool, an approval transaction, and a router page, the price moves, or you approve the wrong thing.

BotFlow Exchange started from that exact frustration on BOT Chain. The goal was deliberately narrow: make the first trade a single flow, and make every cost visible before anything is signed.

**One contract, no custody.** At the center is BotFlowRouter, a small Solidity contract in front of BDEX V3. It takes native BOT directly, wraps it, routes single or multi-hop paths, enforces your minimum on the amount you actually receive (measured, not estimated), handles fee-on-transfer tokens, resets its approvals every call, and holds nothing between transactions. It proved itself on testnet at [`0xEA00197fe5Ec5E5BcF2F6Bdc180d187c46c4aCD9`](https://scan.bohr.life/address/0xEA00197fe5Ec5E5BcF2F6Bdc180d187c46c4aCD9) and is now live and verified on mainnet at [`0x30E2dA3Bb34FC2d17F86318daaf45Aa72e7fe524`](https://scan.botchain.ai/address/0x30E2dA3Bb34FC2d17F86318daaf45Aa72e7fe524), with the fee starting at 0% and hard-capped at 0.30% in code.

**An app that checks before it asks.** The web side quotes every BDEX fee tier plus two-hop routes through WBOT and USDT, then re-quotes right before signing and simulates the swap, so a trade that would fail never costs gas. Price impact over 3% warns; over 15% the button turns red. An approvals manager shows everything the router can spend, revocable in one click. There is no backend: no accounts, no tracking, no custody.

**Tested like money depends on it.** Twenty-four Foundry unit and fuzz tests (~97% line coverage) cover every swap path, slippage and deadline checks, malformed paths, a reentrancy attack, and fee math, plus a fork test running real trades against live BDEX pools. Before opening to users, the team ran a live 0.05-BOT mainnet swap end to end: quoted 0.616096 USDT, received 0.616098.

**Built in the open.** The whole project (contracts, app, tests, whitepaper) is MIT-licensed at https://github.com/Carter254g/BotFlow-Exchange. Next stop: an independent audit, then deeper liquidity views. Try it at https://botflow-woad.vercel.app/app/. Start small, as with anything onchain.
