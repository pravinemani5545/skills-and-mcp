#!/usr/bin/env bash
# Manage gmail-organizer's Gmail accounts and the Bitwarden session its server reads.
# Run `gmail-accounts.sh help` for usage. Run it in a real terminal: the master
# password prompt needs a TTY, so Claude can't run the unlocking commands for you.
set -euo pipefail

REPO="$(cd "$(dirname "$(realpath "$0")")/.." && pwd)"
ENV_FILE="$HOME/.env"
# Matches the lines `on` writes and the server reads: [export ]BW_SESSION=<key>
SESSION_LINE='^[[:space:]]*(export[[:space:]]+)?BW_SESSION='

usage() {
  cat <<'EOF'
Usage: gmail-accounts <command>

  list                 show connected Gmail accounts
  add <email> [alias]  authorize an account, or re-authorize one whose token expired
                       (keeps the account's alias if you don't pass one)
  on                   unlock Bitwarden for Claude: writes BW_SESSION to ~/.env so the
                       Gmail server in your Claude session can load its tokens
  off                  lock Bitwarden and remove BW_SESSION from ~/.env

list and add unlock only for their own run and lock again when they finish, unless
the vault was already unlocked. Their session never touches ~/.env.
EOF
}

die() {
  echo "gmail-accounts: $*" >&2
  exit 1
}

# Last BW_SESSION value in ~/.env: the one the server uses first.
env_file_session() {
  [ -f "$ENV_FILE" ] || return 0
  { grep -E "$SESSION_LINE" "$ENV_FILE" || true; } | tail -n 1 |
    sed -E "s/${SESSION_LINE}[\"']?([^\"'[:space:]]+).*/\\2/"
}

# True if the session key unlocks the vault right now.
is_unlocked() {
  [ -n "${1:-}" ] || return 1
  local out
  out="$(bw status --session "$1" 2>/dev/null || true)"
  [[ "$out" == *'"status":"unlocked"'* ]]
}

require_login() {
  command -v bw >/dev/null || die "the Bitwarden CLI (bw) isn't installed."
  local out
  out="$(bw status 2>/dev/null || true)"
  if [[ "$out" == *'"status":"unauthenticated"'* ]]; then
    die "the Bitwarden CLI isn't logged in. Run \`bw login\` first."
  fi
}

# Remove BW_SESSION lines from ~/.env, keeping every other line and the file's mode.
drop_env_session() {
  [ -f "$ENV_FILE" ] && grep -qE "$SESSION_LINE" "$ENV_FILE" || return 0
  local tmp rc=0
  tmp="$(mktemp)"
  grep -vE "$SESSION_LINE" "$ENV_FILE" > "$tmp" || rc=$?
  if [ "$rc" -gt 1 ]; then
    rm -f "$tmp"
    die "couldn't read $ENV_FILE; left it unchanged."
  fi
  cat "$tmp" > "$ENV_FILE"
  rm -f "$tmp"
}

# Prompt for the master password; prints the new session key.
unlock() {
  [ -t 0 ] || die "unlocking needs a real terminal for the password prompt. Run this in Terminal, not through Claude."
  local s
  s="$(bw unlock --raw)" || die "unlock failed."
  [ -n "$s" ] || die "unlock returned no session key."
  printf '%s' "$s"
}

# Export a session for list/add: reuse an unlocked one, else unlock just for this run.
use_session() {
  require_login
  local s
  s="$(env_file_session)"
  if ! is_unlocked "$s"; then
    if [ -n "$s" ]; then
      drop_env_session
      echo "Removed a stale BW_SESSION line from ~/.env." >&2
    fi
    s="${BW_SESSION:-}"
    if ! is_unlocked "$s"; then
      s="$(unlock)"
      trap 'bw lock >/dev/null 2>&1 || true' EXIT
      trap 'exit 130' INT TERM
    fi
  fi
  export BW_SESSION="$s"
}

run_auth() {
  if [ ! -x "$REPO/node_modules/.bin/tsx" ]; then
    echo "Installing dependencies..." >&2
    (cd "$REPO" && pnpm install --frozen-lockfile >&2)
  fi
  "$REPO/node_modules/.bin/tsx" "$REPO/src/auth.ts" "$@"
}

cmd="${1:-help}"
if [ $# -gt 0 ]; then shift; fi

case "$cmd" in
  list)
    use_session
    run_auth --list
    ;;
  add)
    email="${1:-}"
    alias_name="${2:-}"
    [[ "$email" == *@* ]] || die "usage: gmail-accounts add <email> [alias]"
    use_session
    if [ -n "$alias_name" ]; then
      run_auth "$email" --alias "$alias_name"
    else
      run_auth "$email"
    fi
    echo "In Claude Code, reconnect gmail-organizer with /mcp (or start a new session) to load it."
    ;;
  on)
    require_login
    if is_unlocked "$(env_file_session)"; then
      echo "Already on: ~/.env has a working BW_SESSION."
      exit 0
    fi
    drop_env_session
    s="${BW_SESSION:-}"
    is_unlocked "$s" || s="$(unlock)"
    (umask 077 && touch "$ENV_FILE")
    echo "export BW_SESSION=$s" >> "$ENV_FILE"
    echo "On. Make your first Gmail request in Claude, then run gmail-off."
    ;;
  off)
    if command -v bw >/dev/null; then bw lock >/dev/null 2>&1 || true; fi
    drop_env_session
    echo "Off: vault locked and BW_SESSION removed from ~/.env. A Claude session that already loaded its tokens keeps working."
    ;;
  help | -h | --help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
