/**
 * macOS Keychain-backed token store.
 *
 * Generic passwords in the login Keychain, all under service "gmail-organizer":
 *   - "client"          { client_id, client_secret } — the shared desktop OAuth client
 *   - "accounts"        ["a@x.com", ...] — index (`security` can't list items by service)
 *   - "account:<email>" { email, alias?, refresh_token, scope }
 *
 * The login Keychain unlocks when you log in, so there's no unlock step. Items are
 * written by Apple's `security` tool, so reading them back never prompts. Writes go
 * through `security -i` on stdin so secrets stay out of the process list.
 */
import { spawn } from "node:child_process";

const SERVICE = "gmail-organizer";
const CLIENT_ITEM = "client";
const INDEX_ITEM = "accounts";
const accountItem = (email: string) => `account:${email.toLowerCase()}`;

// `security` exit status for a missing item.
const ITEM_NOT_FOUND = 44;
// `security -i` splits input lines at ~4 KB and runs the first chunk anyway, which
// would store a truncated value. Refuse anything near that.
const MAX_COMMAND_LINE = 4000;

export interface OAuthApp {
  client_id: string;
  client_secret: string;
}

export interface AccountRecord {
  email: string;
  alias?: string;
  refresh_token: string;
  scope?: string;
}

/** Run `security`, optionally writing `input` to stdin. */
function security(
  args: string[],
  input?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("security", args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

/** An item's parsed JSON, or null if the item doesn't exist. */
async function readItem<T>(account: string): Promise<T | null> {
  const { code, stdout, stderr } = await security([
    "find-generic-password", "-s", SERVICE, "-a", account, "-w",
  ]);
  if (code === ITEM_NOT_FOUND) return null;
  if (code !== 0) {
    throw new Error(`Couldn't read Keychain item ${SERVICE}/${account}: ${stderr.trim() || `exit ${code}`}`);
  }
  try {
    return JSON.parse(stdout.trim()) as T;
  } catch {
    throw new Error(`Keychain item ${SERVICE}/${account} doesn't hold valid JSON.`);
  }
}

/** Create or overwrite an item, then read it back to confirm it was stored intact. */
async function writeItem(account: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  const hex = Buffer.from(json).toString("hex");
  const line = `add-generic-password -U -s ${SERVICE} -a ${account} -X ${hex}\n`;
  if (line.length > MAX_COMMAND_LINE) {
    throw new Error(`Keychain item ${SERVICE}/${account} would be too large to store safely.`);
  }
  const { code, stderr } = await security(["-i"], line);
  if (code !== 0) {
    throw new Error(`Couldn't write Keychain item ${SERVICE}/${account}: ${stderr.trim() || `exit ${code}`}`);
  }
  const back = await readItem<unknown>(account);
  if (JSON.stringify(back) !== json) {
    throw new Error(`Keychain item ${SERVICE}/${account} didn't read back as written.`);
  }
}

async function deleteItem(account: string): Promise<void> {
  const { code, stderr } = await security(["delete-generic-password", "-s", SERVICE, "-a", account]);
  if (code !== 0 && code !== ITEM_NOT_FOUND) {
    throw new Error(`Couldn't delete Keychain item ${SERVICE}/${account}: ${stderr.trim() || `exit ${code}`}`);
  }
}

export async function loadOAuthApp(): Promise<OAuthApp> {
  const app = await readItem<OAuthApp>(CLIENT_ITEM);
  if (!app) {
    throw new Error("No OAuth client in the Keychain yet. Run `gmail-accounts client` first.");
  }
  if (!app.client_id || !app.client_secret) {
    throw new Error("The Keychain's OAuth client is missing client_id/client_secret. Run `gmail-accounts client`.");
  }
  return app;
}

export async function saveOAuthApp(app: OAuthApp): Promise<void> {
  await writeItem(CLIENT_ITEM, { client_id: app.client_id, client_secret: app.client_secret });
}

export async function loadAccounts(): Promise<AccountRecord[]> {
  const emails = (await readItem<string[]>(INDEX_ITEM)) ?? [];
  const accounts: AccountRecord[] = [];
  for (const email of emails) {
    const record = await readItem<AccountRecord>(accountItem(email));
    if (record?.email && record.refresh_token) accounts.push(record);
  }
  return accounts;
}

/** Create or update an account. Writes its item before indexing it. */
export async function saveAccount(record: AccountRecord): Promise<void> {
  await writeItem(accountItem(record.email), record);
  const emails = (await readItem<string[]>(INDEX_ITEM)) ?? [];
  if (!emails.some((e) => e.toLowerCase() === record.email.toLowerCase())) {
    await writeItem(INDEX_ITEM, [...emails, record.email]);
  }
}

/** Remove an account by email or alias; returns the removed record. Unindexes before deleting. */
export async function removeAccount(emailOrAlias: string): Promise<AccountRecord> {
  const key = emailOrAlias.toLowerCase();
  const matched = (await loadAccounts()).filter(
    (a) => a.email.toLowerCase() === key || a.alias?.toLowerCase() === key,
  );
  if (matched.length === 0) throw new Error(`No account matches "${emailOrAlias}".`);
  if (matched.length > 1) throw new Error(`"${emailOrAlias}" matches more than one account; use the email.`);
  const [record] = matched;
  const emails = (await readItem<string[]>(INDEX_ITEM)) ?? [];
  await writeItem(INDEX_ITEM, emails.filter((e) => e.toLowerCase() !== record.email.toLowerCase()));
  await deleteItem(accountItem(record.email));
  return record;
}
