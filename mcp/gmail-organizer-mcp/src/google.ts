/**
 * Shared Google plumbing: scopes, the per-account OAuth client, retries, and account
 * selection. An account's Gmail, Drive and Calendar clients share one OAuth client.
 */
import { google } from "googleapis";
import type { AccountRecord, OAuthApp } from "./tokens.js";

// Use googleapis' own bundled google-auth-library so OAuth2Client types match
// what google.gmail()/drive()/calendar() expect (avoids dual-version private-field clashes).
export type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

// The Docs, Sheets and Slides APIs all accept the `drive` scope, so it covers them too.
export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  DRIVE_SCOPE,
  CALENDAR_SCOPE,
];

/** An OAuth client that mints access tokens from the account's refresh token. */
export function authFor(app: OAuthApp, account: AccountRecord): OAuth2Client {
  const auth = new google.auth.OAuth2(app.client_id, app.client_secret);
  auth.setCredentials({ refresh_token: account.refresh_token });
  return auth;
}

/** Throw unless the account's stored grant includes `scope`. */
export function requireScope(account: AccountRecord, scope: string, service: string): void {
  if (!(account.scope ?? "").split(/\s+/).includes(scope)) {
    throw new Error(
      `${account.email} was authorized before ${service} access was added. Run \`gmail-accounts add ${account.email}\` to grant it.`,
    );
  }
}

/** Retry transient errors (429 / 5xx / rate-limit / quota) with exponential backoff, up to
 *  ~30 s of waiting so per-minute quotas can recover.
 *  Only for calls that are safe to repeat: a retried create or append could apply twice. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 6): Promise<T> {
  let delay = 1000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code ?? e?.response?.status;
      const transient =
        code === 429 ||
        (typeof code === "number" && code >= 500) ||
        /rate ?limit|backendError|quota exceeded/i.test(e?.message ?? "");
      if (!transient || attempt >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.floor(Math.random() * 250)));
      delay = Math.min(delay * 2, 16_000);
    }
  }
}

/** Map over items with bounded concurrency (avoids 1000-way request storms). */
export async function mapLimit<A, B>(items: A[], limit: number, fn: (a: A) => Promise<B>): Promise<B[]> {
  const out: B[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return out;
}

/** Pick accounts by email, alias, or "all". */
export function selectAccounts(accounts: AccountRecord[], account: string): AccountRecord[] {
  if (account === "all") return accounts;
  const key = account.toLowerCase();
  const matched = accounts.filter(
    (a) => a.email.toLowerCase() === key || a.alias?.toLowerCase() === key,
  );
  if (matched.length === 0) {
    const known = accounts.map((a) => a.alias ?? a.email).join(", ") || "(none)";
    throw new Error(`No account matches "${account}". Connected: ${known}`);
  }
  return matched;
}
