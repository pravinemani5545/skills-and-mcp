/**
 * Per-account OAuth CLI.
 *
 *   pnpm auth <email> [--alias work]   authorize/refresh one account
 *   pnpm auth --list                   show connected accounts
 *
 * Runs a loopback PKCE flow: spins a temporary local server, opens the browser
 * with login_hint, captures the code, exchanges for a refresh token, and stores
 * it in Bitwarden. Re-runnable to re-authorize.
 */
import http from "node:http";
import { AddressInfo } from "node:net";
import open from "open";
import { google } from "googleapis";
import { SCOPES } from "./gmail.js";
import {
  loadOAuthApp,
  loadAccounts,
  saveAccount,
  ensureUnlocked,
} from "./tokens.js";

async function list() {
  const accounts = await loadAccounts();
  if (accounts.length === 0) {
    console.log("No accounts connected yet. Run: pnpm auth <email>");
    return;
  }
  console.log("Connected accounts:");
  for (const a of accounts) {
    console.log(`  - ${a.email}${a.alias ? `  (alias: ${a.alias})` : ""}`);
  }
}

async function authorize(email: string, alias?: string) {
  const app = await loadOAuthApp();

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

  await saveAccount({
    email: canonicalEmail,
    alias,
    refresh_token: tokens.refresh_token,
    scope: tokens.scope ?? SCOPES.join(" "),
  });

  console.log(`\nStored refresh token for ${canonicalEmail} in Bitwarden${alias ? ` (alias: ${alias})` : ""}.`);
}

async function main() {
  const args = process.argv.slice(2);
  await ensureUnlocked().catch(() => {}); // ok if BW_SESSION already set

  if (args.includes("--list")) {
    await list();
    return;
  }
  const email = args.find((a) => !a.startsWith("--"));
  if (!email) {
    console.error("Usage: pnpm auth <email> [--alias <name>]   |   pnpm auth --list");
    process.exit(1);
  }
  const aliasIdx = args.indexOf("--alias");
  const alias = aliasIdx >= 0 ? args[aliasIdx + 1] : undefined;
  await authorize(email, alias);
}

main().catch((err) => {
  console.error("\nError:", err.message ?? err);
  process.exit(1);
});
