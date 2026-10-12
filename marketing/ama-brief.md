# BotFlow Telegram AMA Brief (45–60 min, for the host + our prep)

## Suggested title
Swapping safely on BOT Chain: how BotFlow routes every trade, plus what's next for agent-driven trading

## Promo blurb (for the announcement post)
Co-hosted by the BotFlow team and the BOT Chain community team, promoted to both communities. Join us for a live AMA on safe swapping on BOT Chain: how smart routing finds the best BDEX price, how the app protects you before you sign, and what's next, including trading by AI agents. Bring questions, bring skepticism. Thursday [DATE], [TIME] UTC, right here.

## Questions + drafted answers

1. **What is BotFlow in one minute?**
   A swap app on BOT Chain Mainnet. You pick two tokens, it finds the best route through BDEX V3 pools, and you sign once in your own wallet. No account, no backend, no custody. The page can't touch your funds even if it wanted to.

2. **Why build another swap interface?**
   New BOT Chain users hold native BOT, but pools trade WBOT, so every first trade meant finding a wrapper, then an approver, then a router, while hoping the price didn't move. BotFlow compresses wrap → approve → re-quote → simulate → swap into one guided flow.

3. **What is BotFlowRouter, and why not call BDEX directly?**
   A thin contract in front of the BDEX SwapRouter that adds what pool routers leave to front ends: native BOT in/out in one transaction, minimum-output enforced on what you actually receive (not estimates), fee-on-transfer support, approvals reset every call, and zero fund-holding between calls. Deployed and verified: `0x30E2dA3Bb34FC2d17F86318daaf45Aa72e7fe524`.

4. **How do you protect users before they sign?**
   Four layers: the route is re-quoted right before signing and stops if the price slipped; every swap is simulated so failures cost no gas; price impact over 3% warns and over 15% demands extra confirmation; and Max leaves 0.01 BOT for fees so you never strand your wallet.

5. **What does it cost?**
   No BotFlow fee at launch (hard-capped at 0.30% in code). You pay the BDEX pool fee (0.01%–1%, shown upfront) plus the BOT network fee, estimated before signing.

6. **Is it audited?**
   Honestly: not yet independently audited. It has 24 Foundry unit+fuzz tests (~97% coverage), a fork test against live pools, and a live 0.05-BOT mainnet shakedown swap. An audit is the funded next step before marketing to big balances.

7. **Can AI agents trade through BotFlow?**
   Technically yes today: the router is permissionless, so any wallet can call it, including one controlled by an agent. What doesn't exist yet is guardrails for that: spending budgets, allowlists, and verifiable records of why the agent traded. That guarded agent trading is the research direction after the audit.

8. **What's next? (roadmap)**
   Audit → approvals and routing polish → shared verified token list → USD values → liquidity/position views → multi-pool split routing.

## Host logistics
- Both sides post the announcement 48 hours ahead so both communities show up.
- Ask us to demo one live small trade on screen share (0.05–0.1 BOT).
- Keep a pinned message with: app link, router explorer link, "start small" warning.
- Collect unanswered questions for a follow-up post.
