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
export BW_SESSION=$(bw unlock --raw)

pnpm auth you@gmail.com --alias personal
pnpm auth work@yourbiz.com --alias work
# ... once per account. Re-run anytime to re-authorize.

pnpm auth --list   # confirm connected accounts
```

Each run opens a browser, you pick the account + approve, and the refresh token lands in a
Bitwarden item `Gmail Token: <email>`.

### 4. Register with Claude Code

```bash
claude mcp add -s user gmail-organizer \
  --env BW_SESSION=$BW_SESSION \
  -- node ~/Developer/projects/active/gmail-organizer-mcp/dist/server.js

claude mcp list   # should show gmail-organizer: connected
```

> `BW_SESSION` keys expire when the vault locks. If the server reports the vault is locked,
> re-unlock (`export BW_SESSION=$(bw unlock --raw)`) and re-add, or use the `BW_PASSWORD`
> path below.

## Usage

In any Claude Code session:

- "List my Gmail accounts."
- "Search account `all` for unread newsletters from the last week."
- "Triage all my inboxes per RULES.md."
- "Create a filter on `personal` that archives and labels mail from `news@substack.com` as Newsletters."

Organizing policy (label taxonomy, what gets archived) lives in [`RULES.md`](./RULES.md).

## Tools

| Tool | Purpose |
|---|---|
| `list_accounts` | Connected accounts |
| `search` | Gmail query → message summaries (`account:"all"` fans out) |
| `get_thread` | Full thread for deeper triage |
| `list_labels` | Labels for an account |
| `apply_label` / `remove_label` | Label messages by ids or query (creates label if missing) |
| `archive` | Remove from inbox (no delete) |
| `mark_read` | Remove UNREAD |
| `create_filter` | Server-side rule for future mail (label / archive / both) |

## Scheduled triage (unattended)

Cron/launchd has no warm `BW_SESSION`. The server (and `auth`) can unlock with a master
password from the environment instead:

```bash
# wrapper sourced from ~/.env (chmod 600), which sets BW_PASSWORD
export BW_PASSWORD
node ~/Developer/projects/active/gmail-organizer-mcp/dist/server.js
```

Prove the interactive flow and `RULES.md` behavior first, then drive a daily triage via
Claude Code's `/schedule` (or a launchd plist) pointing at the same prompt: *"Triage all
inboxes per RULES.md and summarize."*

## Notes / limits

- Adding a new account requires restarting the server (accounts load at startup).
- Bulk ops use `batchModify` (≤1000 ids/call); Gmail allows ~6000 quota units/min/account.
- Code lives under `~/Developer` (outside iCloud) by design.
