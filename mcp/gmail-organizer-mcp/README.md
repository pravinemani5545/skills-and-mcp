# gmail-organizer-mcp

A local [MCP](https://modelcontextprotocol.io) server that lets **Claude Code work across
multiple Google accounts**: Gmail, Drive, Docs, Sheets, Slides and Calendar. Claude's
built-in Google connectors are single-account
([anthropics/claude-code#36024](https://github.com/anthropics/claude-code/issues/36024));
this server holds one OAuth refresh token per account and exposes account-aware tools.

- **Permissions:** `gmail.modify` + `gmail.labels` + `gmail.settings.basic`, full `drive`
  (which the Docs, Sheets and Slides APIs accept) and full `calendar`.
- **Safety defaults:** no permanent mail or file deletes (Drive files can only be trashed);
  sharing a file or changing an event emails nobody unless the tool is called with
  `notify: true`.
- **Secrets:** in your macOS login Keychain (service `gmail-organizer`), never in files.
  The login Keychain unlocks when you log in, so there's no unlock step.
- **Transport:** stdio, runs locally — nothing is deployed.

## One-time setup

### 1. Google Cloud OAuth app

1. [console.cloud.google.com](https://console.cloud.google.com) → new project → enable the
   **Gmail, Google Drive, Google Docs, Google Sheets, Google Slides and Google Calendar
   APIs**.
2. **Google Auth Platform** (formerly *OAuth consent screen*) → User type **External**.
   Under **Data Access**, add the scopes `gmail.modify`, `gmail.labels`,
   `gmail.settings.basic`, `…/auth/drive` and `…/auth/calendar`. Add each of your addresses
   as a **Test user**.
3. **Publish the app to "Production"** (the "Publish App" button). It stays *unverified* —
   you'll click through a one-time "Google hasn't verified this app" warning. This is
   required: apps left in *Testing* mode have their **refresh tokens expire every 7 days**.
   Unverified-Production is fine for your own accounts.
4. **Credentials → Create credentials → OAuth client ID → Desktop app.** Note the
   `client_id` and `client_secret`. (Desktop, *not* Web — loopback redirect.)

### 2. Build and store the OAuth client

```bash
pnpm install && pnpm build
scripts/gmail-accounts.sh client   # prompts for the client ID and secret (secret hidden)
```

### 3. Authorize accounts

```bash
scripts/gmail-accounts.sh add you@gmail.com personal
scripts/gmail-accounts.sh add work@yourbiz.com work
# ... once per account.

scripts/gmail-accounts.sh list   # confirm connected accounts
```

Each `add` opens a browser where you pick the account and approve one consent screen for
every service, then stores its refresh token in the Keychain.

### 4. Register with Claude Code

If you got this code from the `skills-and-mcp` repo (vendored under `mcp/gmail-organizer-mcp/`),
first copy it to a working location (e.g. `~/pravinemaniva/projects/gmail-organizer-mcp`),
run `pnpm install && pnpm build`, then register with the path you chose.

```bash
claude mcp add -s user gmail-organizer \
  -- node ~/pravinemaniva/projects/gmail-organizer-mcp/dist/server.js

claude mcp list   # should show gmail-organizer: connected
```

Secrets load lazily on the first tool call, so the server connects even before setup is
done; until then, its tools return a setup error.

### 5. Shell alias (optional)

```bash
# ~/.zshrc
alias gmail-accounts="$HOME/pravinemaniva/projects/gmail-organizer-mcp/scripts/gmail-accounts.sh"
```

## Usage

In any Claude Code session, with no unlock step:

- "List my Gmail accounts."
- "Search account `all` for unread newsletters from the last week."
- "Triage all my inboxes per RULES.md."
- "Create a filter on `personal` that archives and labels mail from `news@substack.com` as Newsletters."
- "Find the Q3 budget sheet in any of my accounts and summarize the totals tab."
- "What's on all my calendars tomorrow? Flag any overlaps."
- "Append today's meeting notes to the 'Client log' doc in `work`."

Organizing policy (label taxonomy, what gets archived) lives in [`RULES.md`](./RULES.md).

## Managing accounts

| Command | What it does |
|---|---|
| `gmail-accounts list` | Show connected accounts |
| `gmail-accounts add <email> [alias]` | Add an account, or re-authorize one whose token expired. Keeps the account's alias if you leave it out; refuses an alias another account already uses. |
| `gmail-accounts remove <email\|alias>` | Forget an account. Revoke its Google access separately at [myaccount.google.com/permissions](https://myaccount.google.com/permissions). |
| `gmail-accounts client` | Store or replace the OAuth client ID and secret |

After `add` or `remove`, reconnect `gmail-organizer` with `/mcp` or start a new session.
Google drops a refresh token after about 6 months unused or a password change on that
account; re-run `add` for it. An account authorized before Drive and Calendar were added
keeps working for Gmail, and its Drive/Calendar tools tell you to re-run `add` for it. To inspect the raw items, open Keychain Access and search for
`gmail-organizer`.

## Tools

| Tool | Purpose |
|---|---|
| `list_accounts` | Connected accounts |
| `search` | Gmail query → message summaries (`account:"all"` fans out) |
| `get_thread` | Full thread for deeper triage (content fenced as untrusted) |
| `get_message` | One message with a decoded plain-text body (fenced as untrusted) |
| `list_labels` | Labels for an account |
| `apply_label` / `remove_label` | Label messages by ids or query (creates label if missing) |
| `archive` | Remove from inbox (no delete) |
| `mark_read` / `mark_unread` | Toggle UNREAD by ids or query |
| `star` | Star/unstar by ids or query |
| `create_filter` | Server-side rule for future mail (label / archive / both) |
| `list_filters` / `delete_filter` | Inspect and remove server-side filters |
| `delete_label` | Remove a user label (messages kept; refuses system labels) |
| `drive_search` | Full-text and/or Drive-query search (`account:"all"` fans out) |
| `drive_read` | A file as text: Docs as Markdown, Slides as text, plain files as-is; Sheets list their tabs (fenced as untrusted) |
| `drive_create` | New Doc (from Markdown), Sheet (from CSV), Slides deck, folder or text file |
| `drive_update` | Rename, move, star, or trash/untrash (no permanent delete) |
| `drive_share` | Share with someone as reader / commenter / writer (no email unless `notify`) |
| `docs_edit` | Replace text everywhere and/or append at the end, in one atomic step |
| `sheets_read` | Tabs and sizes, or a range's values (fenced as untrusted) |
| `sheets_write` | Update or append rows; values parsed like the UI or stored raw |
| `slides_replace_text` | Replace text across a deck, e.g. `{{placeholders}}` |
| `calendar_list` | Calendars per account (`account:"all"` fans out) |
| `calendar_events` | Events in time order, recurring expanded; default next 7 days (`account:"all"` fans out) |
| `calendar_create_event` / `calendar_update_event` | Create or patch an event (no guest email unless `notify`) |
| `calendar_delete_event` | Delete an event (recoverable from Calendar's trash for 30 days) |

Reads and other repeatable calls retry on rate-limit/5xx with backoff; creates and appends
don't, so a retry can't apply them twice. Bulk reads use bounded concurrency. Tools that take
a message, file or event id require a single account. In `drive_search`, `calendar_list` and
`calendar_events` with `account:"all"`, one account's error is reported in its own block
without hiding the others' results.

## Scheduled triage (unattended)

The server runs locally, so a scheduled triage has to run on this Mac too: a launchd agent
that runs Claude Code headless (`claude -p "Triage all inboxes per RULES.md and
summarize."`). Agents in your login session read the login Keychain like any other process,
so it works whenever you're logged in. Prove the interactive flow and `RULES.md` behavior
first.

## Notes / limits

- Accounts load on the server's first successful tool call; after adding one, reconnect with
  `/mcp` or start a new session.
- Bulk ops use `batchModify` (≤1000 ids/call); Gmail allows ~6000 quota units/min/account.
- Code lives under `~/pravinemaniva/projects` (outside iCloud) by design.
