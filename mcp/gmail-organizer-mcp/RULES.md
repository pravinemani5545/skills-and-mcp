# Triage Rules & Label Taxonomy

The MCP tools are mechanical (search / label / archive / filter). *This* file is
the policy Claude follows when you say "triage my inboxes." Edit it freely — it is
the single place organizing behavior is defined.

## Label taxonomy

Labels are created on demand (`apply_label` makes them if missing). Use nested
labels (`Parent/Child`) for hierarchy.

| Label | Meaning |
|---|---|
| `Triage/Action` | Needs a reply or a task from me. Keep in inbox. |
| `Triage/Waiting` | I'm blocked on someone else. Keep in inbox, revisit. |
| `Triage/FYI` | Read-only, no action. Archive after labeling. |
| `Receipts` | Order confirmations, invoices, payment receipts. Archive. |
| `Newsletters` | Subscriptions, digests, marketing. Archive. |
| `Clients/<name>` | Per-client consulting threads. Keep recent in inbox. |
| `Notifications` | Automated app/system notifications. Archive. |

## Bulk list buckets (one-pass sorting)

For sorting a whole mailbox into broad lists fast, apply these labels by query
(`apply_label` with `query:`, no per-message reading needed). Labels are additive —
a message can land in more than one list. Non-destructive: labeling only.

| List | Query |
|---|---|
| `Subscriptions` | `category:promotions` |
| `Billing` | `subject:(receipt OR invoice OR payment OR "order confirmation" OR billing OR renewal OR refund) OR from:(stripe OR paypal OR billing OR invoice OR receipts)` |
| `Finance` | `from:(interactivebrokers OR wealthsimple OR coinbase OR robinhood OR fidelity OR chase OR rbc OR td OR amex OR "capital one" OR scotiabank)` |
| `Social` | `category:social` |
| `Updates` | `category:updates` |
| `Shopping` | `from:(amazon OR ebay OR shopify OR aliexpress OR etsy OR walmart) OR subject:(shipped OR "your order" OR delivery OR "tracking number")` |
| `Travel` | `subject:(flight OR booking OR reservation OR itinerary OR hotel) OR from:(booking.com OR airbnb OR expedia OR aircanada OR uber OR lyft)` |
| `Jobs` | `from:(linkedin OR indeed OR glassdoor OR ziprecruiter) OR subject:(hiring OR "job alert" OR "your application")` |

## Triage procedure (interactive or scheduled)

For each account (or `account:"all"`):

1. `search` `is:unread newer_than:2d` (or a wider window on first run).
2. Classify each message into exactly one taxonomy label using sender + subject + snippet.
3. `apply_label` the chosen label.
4. `archive` everything labeled `Triage/FYI`, `Receipts`, `Newsletters`, `Notifications`.
5. Leave `Triage/Action` and `Triage/Waiting` in the inbox.
6. Output a one-line-per-account summary: counts per label + anything ambiguous left untouched.

## Classification heuristics

- **Newsletters**: `category:promotions`, `list-unsubscribe` present, known senders
  (Substack, Mailchimp, etc.).
- **Receipts**: subjects with "receipt", "invoice", "order #", "your payment",
  senders like `noreply@`, Stripe, Shopify, Apple.
- **Notifications**: GitHub, Vercel, Supabase, calendar invites already actioned, CI.
- **Clients/<name>**: map known client domains → label. Maintain the mapping below.
- **Action vs Waiting**: a direct question to me → `Action`; my open question to them → `Waiting`.

## Standing filters (set once with `create_filter`)

For high-volume, unambiguous senders, prefer a server-side filter so future mail is
auto-organized without a triage pass:

- Newsletters from a fixed sender → `create_filter` action `label_and_archive` → `Newsletters`.
- A noisy notification source → `label_and_archive` → `Notifications`.

## Client domain mapping

_(fill in as you onboard clients — used for the `Clients/<name>` label)_

| Domain | Label |
|---|---|
| example.com | `Clients/Example` |

## Hard rules

- **Never delete.** The server has no delete tool and the scope can't. Worst case is archive.
- When unsure, **leave it in the inbox** and flag it in the summary rather than guess.
- Don't archive anything labeled `Triage/Action` or `Triage/Waiting`.
