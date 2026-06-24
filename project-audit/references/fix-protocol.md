# Fix Protocol — Safe, Batched, Verified

Fixing a confirmed-bug list is where new bugs get introduced if you rush. The rule: **small batches, verify each, never break a live system to fix a latent one.**

## Batch ordering (do Criticals first)
1. **Idempotency / money / data-corruption / security** — the bugs that lose value or leak data. These often need only a small guard (a dedup check, a "create once", a conditional update) — high value, low risk.
2. **Silent-failure guards** — wrap unguarded external calls so a transient error retries or degrades loudly instead of dropping work.
3. **Correctness** — the logic fixes that change behavior.
4. **UX / admin / cosmetic / docs** — last.

Within a batch, group by **deploy unit** (one edge function, one service, one migration) so each deploy is coherent and independently reversible.

## Per-batch loop
1. **Apply** the edits (prefer minimal, surgical changes that match surrounding style — no opportunistic refactors mixed into a fix).
2. **Verify locally** — typecheck / build / lint / run tests as the stack allows. A fix that doesn't compile is worse than the bug.
3. **Deploy** the affected unit (if live). Deploy shared-code changes by redeploying every consumer that bundles them.
4. **Confirm it took** — re-read the live config/DB, or run a smoke check (send a test event, query the row). "Deployed" ≠ "working".
5. **Commit** with a message that names the failure prevented, not just the change ("Idempotent rewards: guard the voice+SMS double-hand-off race", not "add check").

## Migration safety (databases)
- **Verify every referenced column/enum/table exists in the LIVE schema before applying.** A trigger or function that references a missing column compiles fine but throws on every write — turning a latent bug into a total outage.
- Prefer `add ... if not exists`, `create or replace`, and `is distinct from` guards.
- Wrap multi-statement migrations in a transaction.
- For enum changes: you can add values but not easily drop them — if a value becomes wrong, make it inert in code rather than dropping it.
- Apply via the platform's SQL/management API; keep a checked-in migration file mirroring exactly what you ran (kill the code-vs-live drift you just found).

## Live-system guardrails
- Never blast a queue/all-users as a side effect of a fix (e.g. re-sending messages to everyone because a state changed). Park/limit and confirm intent.
- Changes to messaging/calling/charging behavior: respect rate limits and compliance windows; ramp, don't flood.
- Keep changes reversible; if a fix is risky, gate it or stage it.

## After fixing
- Re-run the relevant finder once more on the fixed area (a fix can expose or create an adjacent bug).
- Update architecture/build docs to the fixed reality.
- For any Critical that reached production, add a regression test or a monitor so it can't silently return.

## Reporting
Distinguish clearly:
- **Deployed + verified** — live and confirmed.
- **Committed, pending deploy** — in the repo, not yet live.
- **Deferred** — confirmed but intentionally not fixed now (say why).
