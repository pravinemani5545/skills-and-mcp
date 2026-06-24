# Finder Dimensions & Severity Rubric

Spawn one finder per relevant dimension. Skip dimensions that don't apply to the stack, add domain-specific ones (e.g. "telephony/SMS compliance" for a calling system, "PCI" for payments). Each finder is a focused specialist — give it ONLY its dimension so it reads deeply instead of skimming everything shallowly.

## The dimensions

1. **Correctness / business logic** — off-by-one, wrong conditionals, inverted booleans, wrong enum/string compared, state transitions that drop or skip a step, math/rounding, timezone/DST math, date arithmetic. Trace the actual happy path AND the branches.

2. **Error handling & silent failures** — swallowed exceptions (`catch {}`), unchecked return values, a failed external call that returns null and the caller proceeds as if it succeeded, missing retries on transient errors (429/5xx/network), an error in one step aborting a later critical step. **Silent failures are high severity** — they don't page anyone.

3. **Concurrency & idempotency** — races between two code paths mutating the same row, webhook retries reprocessing the same event (double charge, double reward, double send), missing dedup keys, non-atomic read-modify-write, "exactly once" assumptions that are really "at least once". Ask: *what happens if this runs twice, or two of these run at the same millisecond?*

4. **Data integrity & schema drift** — checked-in migrations vs. LIVE schema mismatch, enum values used in code but missing in the DB (or vice versa), columns referenced that don't exist, nullable assumptions, foreign-key/orphan risks, a trigger/function referencing a renamed column (breaks every write). **Always diff code against the live schema.**

5. **External API / SDK misuse** — wrong field paths in a webhook payload, assuming a field is always present, ignoring rate limits / pagination / idempotency keys the API offers, wrong auth scope, not handling the documented failure responses, SDK version drift. Verify against the provider's real contract (Context7 / official docs), not memory.

6. **Security & authorization** — missing/weak authz on an endpoint, IDOR (one tenant reading another's data), forgeable signed tokens / guessable secrets / hardcoded fallback keys, missing webhook signature verification, secrets in logs or responses, injection, over-broad data returned to a lower-privilege role.

7. **State machine & lifecycle** — unreachable states, dead-end states with no exit, terminal states that still accept mutations, a lead/order/job that can get permanently stuck, missing transitions for an edge case (qualified-but-no-clinic, paid-but-not-fulfilled).

8. **Input validation & boundaries** — unvalidated user/webhook input, missing length/format/range checks, trusting client-supplied IDs, unicode/encoding (GSM-7 for SMS, emoji), empty/missing fields, oversized payloads.

9. **Resource & performance** — N+1 queries, unbounded loops/queries (no LIMIT), missing indexes on hot filters, memory growth, connection leaks, work done inside a request that should be async, timeouts not set.

10. **Compliance / domain rules** — legal/regulatory constraints for the domain: calling/messaging hours and opt-out (TCPA/CRTC/CASL), consent gates, PII handling/redaction, retention, accessibility. These are often invisible in code review but high-stakes.

11. **Money & fulfillment** — anywhere value is created/sent (charges, refunds, rewards, credits): double-issue, issue-without-precondition, issue-to-wrong-recipient, missing reconciliation, currency/amount errors.

12. **Frontend / admin UX correctness** — stale cache vs. server truth, optimistic updates that don't reconcile, sort/filter that lies, a control that no-ops, unread/seen tracking that never clears, data shown to the wrong role.

13. **Config, deploy & environment** — env vars assumed present, dev/prod divergence, cron schedules that don't match the documented window, a function deployed from stale shared code, secrets unset in one environment.

14. **Docs vs. reality drift** — the build/architecture doc claims behavior the code no longer has. Lower severity on its own, but a strong signal of where real bugs hide, and it misleads the next change.

## Severity rubric

- **Critical** — silent money loss / double-fulfillment, data corruption, auth bypass / cross-tenant data leak, a core flow that drops users permanently, or a compliance violation with legal exposure. Fix before anything else.
- **High** — a real failure that hits users or data in a common path, silent failures on important steps, races that fire under normal load, missing retries that drop work.
- **Medium** — edge-case bugs, degraded-but-not-broken behavior, missing guards that only bite under specific conditions, schema drift not yet causing errors.
- **Low** — cosmetic, doc drift, defensive-hardening nice-to-haves, log-only issues.

Rank by blast radius × likelihood, never by how easy the fix is. A one-line idempotency guard that prevents double payouts is Critical; a gnarly refactor that improves a log message is Low.
