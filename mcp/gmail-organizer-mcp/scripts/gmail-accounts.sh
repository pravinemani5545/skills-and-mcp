#!/usr/bin/env bash
# Manage gmail-organizer's Gmail accounts, stored in the macOS login Keychain.
# Run `gmail-accounts.sh help` for usage.
set -euo pipefail

REPO="$(cd "$(dirname "$(realpath "$0")")/.." && pwd)"

usage() {
  cat <<'EOF'
Usage: gmail-accounts <command>

  list                   show connected Gmail accounts
  add <email> [alias]    authorize an account, or re-authorize one whose token expired
                         (keeps the account's alias if you don't pass one)
  remove <email|alias>   forget an account
  client                 store the Google OAuth client ID and secret (one-time setup)

Secrets live in your macOS login Keychain under "gmail-organizer".
After add or remove, reconnect gmail-organizer in Claude Code with /mcp.
EOF
}

accounts_cli() {
  if [ ! -x "$REPO/node_modules/.bin/tsx" ]; then
    echo "Installing dependencies..." >&2
    (cd "$REPO" && pnpm install --frozen-lockfile >&2)
  fi
  "$REPO/node_modules/.bin/tsx" "$REPO/src/auth.ts" "$@"
}

case "${1:-help}" in
  list | add | remove)
    accounts_cli "$@"
    ;;
  client)
    read -r -p "OAuth client ID: " client_id
    read -r -s -p "OAuth client secret: " client_secret
    echo
    printf '%s\n%s\n' "$client_id" "$client_secret" | accounts_cli client
    ;;
  help | -h | --help)
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
