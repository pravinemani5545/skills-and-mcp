/**
 * Gmail API helpers. One GmailClient per account, built from the shared OAuth
 * desktop app creds + the account's stored refresh token.
 *
 * Scopes used: gmail.modify (read/label/archive), gmail.labels, gmail.settings.basic.
 * No delete: there is intentionally no trash/delete method here.
 */
import { google, gmail_v1 } from "googleapis";
import type { AccountRecord, OAuthApp } from "./tokens.js";

// Use googleapis' own bundled google-auth-library so OAuth2Client types match
// what google.gmail() expects (avoids dual-version private-field clashes).
type OAuth2Client = InstanceType<typeof google.auth.OAuth2>;

export const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

// Gmail batchModify accepts up to 1000 ids per call.
const BATCH_LIMIT = 1000;

export function makeOAuthClient(app: OAuthApp, redirectUri?: string): OAuth2Client {
  return new google.auth.OAuth2(app.client_id, app.client_secret, redirectUri);
}

export interface MessageSummary {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  labelIds: string[];
}

export class GmailClient {
  readonly email: string;
  readonly alias?: string;
  private api: gmail_v1.Gmail;

  constructor(app: OAuthApp, account: AccountRecord) {
    this.email = account.email;
    this.alias = account.alias;
    const auth = makeOAuthClient(app);
    auth.setCredentials({ refresh_token: account.refresh_token });
    this.api = google.gmail({ version: "v1", auth });
  }

  /** Resolve a Gmail search query to message ids (paged up to `max`). */
  async queryIds(query: string, max = 100): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await this.api.users.messages.list({
        userId: "me",
        q: query,
        maxResults: Math.min(500, max - ids.length),
        pageToken,
      });
      for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  /** Search returning human-readable summaries (From/Subject/Date/snippet/labels). */
  async search(query: string, max = 25): Promise<MessageSummary[]> {
    const ids = await this.queryIds(query, max);
    const summaries = await Promise.all(
      ids.map(async (id) => {
        const res = await this.api.users.messages.get({
          userId: "me",
          id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"],
        });
        const headers = res.data.payload?.headers ?? [];
        const h = (n: string) =>
          headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
        return {
          id,
          threadId: res.data.threadId ?? "",
          from: h("From"),
          subject: h("Subject"),
          date: h("Date"),
          snippet: res.data.snippet ?? "",
          labelIds: res.data.labelIds ?? [],
        } satisfies MessageSummary;
      }),
    );
    return summaries;
  }

  async getThread(threadId: string): Promise<gmail_v1.Schema$Thread> {
    const res = await this.api.users.threads.get({
      userId: "me",
      id: threadId,
      format: "full",
    });
    return res.data;
  }

  async listLabels(): Promise<gmail_v1.Schema$Label[]> {
    const res = await this.api.users.labels.list({ userId: "me" });
    return res.data.labels ?? [];
  }

  /** Find a label by name (case-insensitive) or create it; returns its id. */
  async ensureLabel(name: string): Promise<string> {
    const labels = await this.listLabels();
    const existing = labels.find(
      (l) => l.name?.toLowerCase() === name.toLowerCase(),
    );
    if (existing?.id) return existing.id;
    const res = await this.api.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        labelListVisibility: "labelShow",
        messageListVisibility: "show",
      },
    });
    if (!res.data.id) throw new Error(`Failed to create label "${name}"`);
    return res.data.id;
  }

  private async batchModify(
    ids: string[],
    add: string[] = [],
    remove: string[] = [],
  ): Promise<number> {
    if (ids.length === 0) return 0;
    for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
      const slice = ids.slice(i, i + BATCH_LIMIT);
      await this.api.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: slice, addLabelIds: add, removeLabelIds: remove },
      });
    }
    return ids.length;
  }

  /** Apply a label (by name, created if needed) to messages. Returns count modified. */
  async applyLabel(ids: string[], labelName: string): Promise<number> {
    const labelId = await this.ensureLabel(labelName);
    return this.batchModify(ids, [labelId], []);
  }

  async removeLabel(ids: string[], labelName: string): Promise<number> {
    const labels = await this.listLabels();
    const label = labels.find(
      (l) => l.name?.toLowerCase() === labelName.toLowerCase(),
    );
    if (!label?.id) return 0;
    return this.batchModify(ids, [], [label.id]);
  }

  /** Archive = remove the INBOX label. Returns count archived. */
  async archive(ids: string[]): Promise<number> {
    return this.batchModify(ids, [], ["INBOX"]);
  }

  /** Mark messages read (remove UNREAD). */
  async markRead(ids: string[]): Promise<number> {
    return this.batchModify(ids, [], ["UNREAD"]);
  }

  /**
   * Create a server-side filter that applies to future mail.
   * action: 'label' | 'archive' | 'label_and_archive'. labelName required for label actions.
   */
  async createFilter(
    criteria: gmail_v1.Schema$FilterCriteria,
    action: "label" | "archive" | "label_and_archive",
    labelName?: string,
  ): Promise<string> {
    const addLabelIds: string[] = [];
    const removeLabelIds: string[] = [];
    if (action !== "archive") {
      if (!labelName) throw new Error("labelName required for label actions");
      addLabelIds.push(await this.ensureLabel(labelName));
    }
    if (action !== "label") removeLabelIds.push("INBOX");
    const res = await this.api.users.settings.filters.create({
      userId: "me",
      requestBody: { criteria, action: { addLabelIds, removeLabelIds } },
    });
    return res.data.id ?? "(created)";
  }
}

/** Build clients for the chosen accounts. `account` may be an email, alias, or "all". */
export function selectAccounts(
  accounts: AccountRecord[],
  account: string,
): AccountRecord[] {
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
