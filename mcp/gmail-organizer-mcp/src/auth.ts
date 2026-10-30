/**
 * Account management CLI (wrapped by scripts/gmail-accounts.sh).
 *
 *   list                   show connected accounts
 *   add <email> [alias]    authorize an account, or re-authorize an expired one
 *   remove <email|alias>   forget an account
 *   client                 store the OAuth client (client ID and secret as two lines on stdin)
 *
 * `add` runs a loopback PKCE flow: spins a temporary local server, opens the browser
 * with login_hint, captures the code, exchanges it for a refresh token, and stores it
 * in the macOS Keychain.
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import readline from "node:readline";
import open from "open";
import { google } from "googleapis";
import { SCOPES } from "./gmail.js";
import {
  loadOAuthApp,
  loadAccounts,
  saveAccount,
  saveOAuthApp,
  removeAccount,
} from "./tokens.js";

const USAGE = "Usage: gmail-accounts list | add <email> [alias] | remove <email|alias> | client";

async function list() {
  const accounts = await loadAccounts();
  if (accounts.length === 0) {
    console.log("No accounts connected yet. Run: gmail-accounts add <email> [alias]");
    return;
  }
  console.log("Connected accounts:");
  for (const a of accounts) {
    console.log(`  - ${a.email}${a.alias ? `  (alias: ${a.alias})` : ""}`);
  }
}

async function authorize(email: string, alias?: string) {
  const app = await loadOAuthApp();
  const accounts = await loadAccounts();

  // selectAccounts treats a shared alias as ambiguous, so refuse it up front.
  const clash = alias
    ? accounts.find(
        (a) =>
          a.alias?.toLowerCase() === alias.toLowerCase() &&
          a.email.toLowerCase() !== email.toLowerCase(),
      )
    : undefined;
  if (clash) {
    throw new Error(`Alias "${alias}" is already used by ${clash.email}. Pick another alias.`);
  }

  // Temporary loopback server to receive the OAuth redirect.
  const server = http.createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  const redirectUri = `http://127.0.0.1:${port}`;

  const client = new google.auth.OAuth2(
    app.client_id,
    app.client_secret,
    redirectUri,
  );
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();

  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token even on re-auth
    scope: SCOPES,
    login_hint: email,
    code_challenge_method: "S256" as any,
    code_challenge: codeChallenge,
  });

  const codePromise = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for OAuth callback (5 min)")), 5 * 60_000);
    server.on("request", (req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      const code = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<html><body style="font-family:system-ui;padding:3rem"><h2>${err ? "Authorization failed" : "Authorized ✓"}</h2><p>${err ?? "You can close this tab and return to the terminal."}</p></body></html>`,
      );
      clearTimeout(timeout);
      if (err) reject(new Error(`OAuth error: ${err}`));
      else if (code) resolve(code);
      else reject(new Error("No code in callback"));
    });
  });

  console.log(`\nOpening browser to authorize ${email} ...`);
  console.log(`If it doesn't open, visit:\n${authUrl}\n`);
  await open(authUrl);

  let code: string;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions and retry (prompt=consent should normally force one).",
    );
  }

  // Confirm which account actually authorized (canonical email).
  client.setCredentials(tokens);
  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  const canonicalEmail = profile.data.emailAddress ?? email;

  // Re-authorizing without --alias keeps the account's existing alias.
  const keptAlias =
    alias ?? accounts.find((a) => a.email.toLowerCase() === canonicalEmail.toLowerCase())?.alias;

  await saveAccount({
    email: canonicalEmail,
    alias: keptAlias,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope ?? SCOPES.join(" "),
  });

  console.log(`\nStored refresh token for ${canonicalEmail} in the Keychain${keptAlias ? ` (alias: ${keptAlias})` : ""}.`);
  console.log("Reconnect gmail-organizer in Claude Code with /mcp to load it.");
}

async function remove(emailOrAlias: string) {
  const removed = await removeAccount(emailOrAlias);
  console.log(`Removed ${removed.email}. Reconnect gmail-organizer in Claude Code with /mcp to drop it.`);
  console.log("To also revoke its Google access: https://myaccount.google.com/permissions");
}

async function setClient() {
  const lines: string[] = [];
  for await (const line of readline.createInterface({ input: process.stdin })) lines.push(line.trim());
  const [client_id, client_secret] = lines;
  if (!client_id?.endsWith(".apps.googleusercontent.com") || !client_secret) {
    throw new Error("Expected a client ID (…apps.googleusercontent.com) and a client secret.");
  }
  await saveOAuthApp({ client_id, client_secret });
  console.log("Stored the OAuth client in the Keychain.");
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "list":
      return list();
    case "add":
      if (!args[0]?.includes("@")) break;
      return authorize(args[0], args[1]);
    case "remove":
      if (!args[0]) break;
      return remove(args[0]);
    case "client":
      return setClient();
  }
  console.error(USAGE);
  process.exit(1);
}

main().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
