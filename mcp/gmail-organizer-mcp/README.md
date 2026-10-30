# gmail-organizer-mcp

A local [MCP](https://modelcontextprotocol.io) server that lets **Claude Code read and
organize multiple Gmail accounts**. Claude's built-in Gmail connector is single-account
only ([anthropics/claude-code#36024](https://github.com/anthropics/claude-code/issues/36024));
this server holds one OAuth refresh token per account and exposes account-aware tools.

- **Permissions:** read, label, archive, create filters. **No permanent delete** (scope
  is `gmail.modify` + `gmail.labels` + `gmail.settings.basic`).
- **Secrets:** stored in Bitwarden, never on disk.
- **Transport:** stdio, runs locally — nothing is deployed.

## One-time setup

### 1. Google Cloud OAuth app

1. [console.cloud.google.com](https://console.cloud.google.com) → new project → enable
   **Gmail API**.
2. **OAuth consent screen** → User type **External**. Add scopes
   `gmail.modify`, `gmail.labels`, `gmail.settings.basic`. Add each of your Gmail
   addresses as a **Test user**.
3. **Publish the app to "Production"** (the "Publish App" button). It stays *unverified* —
   you'll click through a one-time "Google hasn't verified this app" warning. This is
   required: apps left in *Testing* mode have their **refresh tokens expire every 7 days**.
   Unverified-Production is fine for your own accounts.
4. **Credentials → Create credentials → OAuth client ID → Desktop app.** Note the
   `client_id` and `client_secret`. (Desktop, *not* Web — loopback redirect.)

### 2. Store the app creds in Bitwarden

Create a **secure note** named exactly `Gmail Organizer OAuth` whose notes are:

```json
{ "client_id": "xxxx.apps.googleusercontent.com", "client_secret": "yyyy" }
```

```bash
export BW_SESSION=$(bw unlock --raw)
printf '{"client_id":"...","client_secret":"..."}' > /tmp/oauth.json
bw get template item | jq \
  --arg n "Gmail Organizer OAuth" --arg notes "$(cat /tmp/oauth.json)" \
  '.type=2 | .name=$n | .notes=$notes | .secureNote={"type":0} | .login=null' \
  | bw encode | bw create item
rm /tmp/oauth.json && bw sync
```

### 3. Build & authorize accounts

```bash
pnpm install && pnpm build

scripts/gmail-accounts.sh add you@gmail.com personal
scripts/gmail-accounts.sh add work@yourbiz.com work
# ... once per account.

scripts/gmail-accounts.sh list   # confirm connected accounts
```

Each `add` asks for your master password if the vault is locked, opens a browser where you
pick the account and approve, stores the refresh token in a Bitwarden item
`Gmail Token: <email>`, then locks the vault again. `pnpm auth <email> --alias <name>` is the
underlying command if you'd rather manage the Bitwarden session yourself.

### 4. Register with Claude Code

If you got this code from the `skills-and-mcp` repo (vendored under `mcp/gmail-organizer-mcp/`),
first copy it to a working location (e.g. `~/pravinemaniva/projects/gmail-organizer-mcp`),
run `pnpm install && pnpm build`, then register with the path you chose.

```bash
claude mcp add -s user gmail-organizer \
  -- node ~/pravinemaniva/projects/gmail-organizer-mcp/dist/server.js

claude mcp list   # should show gmail-organizer: connected
```

> Don't put `BW_SESSION` in the registration — a hardcoded session goes stale at the next
> `bw lock`. Secrets load lazily on the first tool call: while the vault is locked the
> server still connects and tools return a "vault locked" error. Run
> `scripts/gmail-accounts.sh on` in a terminal and the next call succeeds — the server
> re-reads `~/.env` on every vault access, so no restart is needed.

### 5. Shell aliases (optional)

```bash
# ~/.zshrc
alias gmail-accounts="$HOME/pravinemaniva/projects/gmail-organizer-mcp/scripts/gmail-accounts.sh"
alias gmail-on="$HOME/pravinemaniva/projects/gmail-organizer-mcp/scripts/gmail-accounts.sh on"
alias gmail-off="$HOME/pravinemaniva/projects/gmail-organizer-mcp/scripts/gmail-accounts.sh off"
```

## Usage

Each Claude Code session starts its own server with no secrets loaded, so once per session:

1. `gmail-on` in a terminal (asks for the master password).
2. Make your first Gmail request in Claude.
3. `gmail-off` once it answers. The server keeps its tokens in memory for the rest of the
   session.

Then, in that session:

- "List my Gmail accounts."
- "Search account `all` for unread newsletters from the last week."
- "Triage all my inboxes per RULES.md."
- "Create a filter on `personal` that archives and labels mail from `news@substack.com` as Newsletters."

Organizing policy (label taxonomy, what gets archived) lives in [`RULES.md`](./RULES.md).

## Managing accounts

| Command | What it does |
|---|---|
| `gmail-accounts list` | Show connected accounts |
| `gmail-accounts add <email> [alias]` | Add an account, or re-authorize one whose token expired. Keeps the account's alias if you leave it out; refuses an alias another account already uses. |
| `gmail-accounts on` | Unlock Bitwarden for Claude: writes `BW_SESSION` to `~/.env` |
| `gmail-accounts off` | Lock Bitwarden and remove `BW_SESSION` from `~/.env` |

`list` and `add` unlock only for their own run and lock again when they finish (unless the
vault was already unlocked); their session never touches `~/.env`. Run all of these in a
real terminal: the password prompt needs a TTY. After adding an account, reconnect
`gmail-organizer` with `/mcp` or start a new session. Google drops a refresh token after
about 6 months unused or a password change on that account; re-run `add` for it.

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

All API calls retry on rate-limit/5xx with backoff; bulk reads use bounded concurrency. Id-based tools (`get_thread`, `get_message`, `delete_filter`) require a single account.

## Scheduled triage (unattended)

Cron/launchd has no warm `BW_SESSION`. The server (and `auth`) can unlock with a master
password from the environment instead:

```bash
# wrapper sourced from ~/.env (chmod 600), which sets BW_PASSWORD
export BW_PASSWORD
node ~/pravinemaniva/projects/gmail-organizer-mcp/dist/server.js
```

Prove the interactive flow and `RULES.md` behavior first, then drive a daily triage via
Claude Code's `/schedule` (or a launchd plist) pointing at the same prompt: *"Triage all
inboxes per RULES.md and summarize."*

## Notes / limits

- Accounts load on the server's first successful tool call; after adding one, reconnect with
  `/mcp` or start a new session.
- Bulk ops use `batchModify` (≤1000 ids/call); Gmail allows ~6000 quota units/min/account.
- Code lives under `~/pravinemaniva/projects` (outside iCloud) by design.
