/**
 * Bitwarden-backed token store.
 *
 * Source of truth for all secrets — nothing is written to disk. Layout:
 *   - One secure-note item "Gmail Organizer OAuth" holding the shared desktop
 *     OAuth client: { client_id, client_secret }.
 *   - One secure-note item per account "Gmail Token: <email>" holding:
 *     { email, alias?, refresh_token, scope }.
 *
 * Requires an unlocked vault. Pass the session via BW_SESSION in the env
 * (`export BW_SESSION=$(bw unlock --raw)`), or set BW_PASSWORD for unattended
 * unlock (used by the scheduled routine).
 */
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Spawn a command, optionally writing `input` to stdin, resolving with stdout. */
function run(
  cmd: string,
  args: string[],
  opts: { input?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: opts.env ?? process.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(stderr || `exit ${code}`), { stderr }));
    });
    if (opts.input !== undefined) child.stdin.write(opts.input);
    child.stdin.end();
  });
}

export const OAUTH_ITEM_NAME = "Gmail Organizer OAuth";
export const TOKEN_ITEM_PREFIX = "Gmail Token: ";

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

export class VaultLockedError extends Error {
  constructor(detail?: string) {
    super(
      "Bitwarden vault is locked or no session is available. Run `export BW_SESSION=$(bw unlock --raw)` and restart the server." +
        (detail ? `\nbw said: ${detail}` : ""),
    );
    this.name = "VaultLockedError";
  }
}

interface BwItem {
  id: string;
  name: string;
  notes: string | null;
  type: number;
}

function bwEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

/** Run a `bw` subcommand, returning stdout. Detects a locked/sessionless vault. */
async function bw(args: string[], input?: string): Promise<string> {
  if (!process.env.BW_SESSION && !process.env.BW_PASSWORD) {
    throw new VaultLockedError();
  }
  const sessionArgs = process.env.BW_SESSION
    ? ["--session", process.env.BW_SESSION]
    : [];
  try {
    const { stdout } = await run(
      "bw",
      [...args, ...sessionArgs, "--nointeraction"],
      { env: bwEnv(), input },
    );
    return stdout;
  } catch (err: any) {
    const stderr = String(err?.stderr ?? err?.message ?? "");
    if (/locked|not logged in|session key is invalid|mac failed/i.test(stderr)) {
      throw new VaultLockedError(stderr.trim());
    }
    throw new Error(`bw ${args[0]} failed: ${stderr.trim() || err}`);
  }
}

/** Unlock with BW_PASSWORD (unattended path) and populate BW_SESSION in-process. */
export async function ensureUnlocked(): Promise<void> {
  if (process.env.BW_SESSION) return;
  if (!process.env.BW_PASSWORD) throw new VaultLockedError();
  const { stdout } = await execFileAsync(
    "bw",
    ["unlock", "--passwordenv", "BW_PASSWORD", "--raw"],
    { env: bwEnv() },
  );
  process.env.BW_SESSION = stdout.trim();
}

async function listItems(search: string): Promise<BwItem[]> {
  const out = await bw(["list", "items", "--search", search]);
  return JSON.parse(out || "[]");
}

function parseNotes<T>(item: BwItem, what: string): T {
  if (!item.notes) throw new Error(`${what} (${item.name}) has empty notes`);
  try {
    return JSON.parse(item.notes) as T;
  } catch {
    throw new Error(`${what} (${item.name}) notes are not valid JSON`);
  }
}

export async function loadOAuthApp(): Promise<OAuthApp> {
  const items = await listItems(OAUTH_ITEM_NAME);
  const item = items.find((i) => i.name === OAUTH_ITEM_NAME);
  if (!item) {
    throw new Error(
      `Bitwarden item "${OAUTH_ITEM_NAME}" not found. Create it with a secure note: {"client_id":"...","client_secret":"..."}`,
    );
  }
  const app = parseNotes<OAuthApp>(item, "OAuth app");
  if (!app.client_id || !app.client_secret) {
    throw new Error(`OAuth app item is missing client_id/client_secret`);
  }
  return app;
}

export async function loadAccounts(): Promise<AccountRecord[]> {
  const items = await listItems(TOKEN_ITEM_PREFIX);
  return items
    .filter((i) => i.name.startsWith(TOKEN_ITEM_PREFIX) && i.notes)
    .map((i) => parseNotes<AccountRecord>(i, "Account token"))
    .filter((a) => a.email && a.refresh_token);
}

/** Create or update the per-account token item (upsert by item name). */
export async function saveAccount(record: AccountRecord): Promise<void> {
  const itemName = TOKEN_ITEM_PREFIX + record.email;
  const notes = JSON.stringify(record, null, 2);
  const items = await listItems(itemName);
  const existing = items.find((i) => i.name === itemName);

  if (existing) {
    const current: BwItem = JSON.parse(await bw(["get", "item", existing.id]));
    current.notes = notes;
    const encoded = Buffer.from(JSON.stringify(current)).toString("base64");
    await bw(["edit", "item", existing.id], encoded);
  } else {
    const template: any = JSON.parse(await bw(["get", "template", "item"]));
    template.type = 2;
    template.name = itemName;
    template.notes = notes;
    template.secureNote = { type: 0 };
    template.login = null;
    const encoded = Buffer.from(JSON.stringify(template)).toString("base64");
    await bw(["create", "item"], encoded);
  }
  await bw(["sync"]);
}
