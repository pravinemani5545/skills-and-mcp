/**
 * Gmail API helpers. One GmailClient per account, on the account's shared OAuth client.
 *
 * Scopes used: gmail.modify (read/label/archive), gmail.labels, gmail.settings.basic.
 * No permanent delete: trash/untrash below are recoverable and not exposed as tools.
 */
import { google, gmail_v1 } from "googleapis";
import type { AccountRecord } from "./tokens.js";
import { withRetry, mapLimit, type OAuth2Client } from "./google.js";

// Gmail batchModify accepts up to 1000 ids per call.
const BATCH_LIMIT = 1000;

// Gmail's reserved system labels — never deletable.
const SYSTEM_LABELS = new Set([
  "INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "UNREAD", "STARRED", "IMPORTANT",
  "CHAT", "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS",
]);

/** Find the first part of a given MIME type anywhere in the tree. */
function findPart(
  p: gmail_v1.Schema$MessagePart | undefined,
  mime: string,
): gmail_v1.Schema$MessagePart | undefined {
  if (!p) return undefined;
  if (p.mimeType === mime && p.body?.data) return p;
  for (const child of p.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return undefined;
}

/** Best-effort plain-text body: prefer text/plain anywhere, else stripped text/html. */
function extractBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return "";
  const decode = (d?: string | null) => (d ? Buffer.from(d, "base64url").toString("utf8") : "");
  const plain = findPart(payload, "text/plain");
  if (plain?.body?.data) return decode(plain.body.data);
  const html = findPart(payload, "text/html");
  if (html?.body?.data) {
    return decode(html.body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
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

  constructor(account: AccountRecord, auth: OAuth2Client) {
    this.email = account.email;
    this.alias = account.alias;
    this.api = google.gmail({ version: "v1", auth });
  }

  /** Resolve a Gmail search query to message ids (paged up to `max`). */
  async queryIds(query: string, max = 100): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const res = await withRetry(() =>
        this.api.users.messages.list({
          userId: "me",
          q: query,
          maxResults: Math.max(1, Math.min(500, max - ids.length)),
          pageToken,
        }),
      );
      for (const m of res.data.messages ?? []) if (m.id) ids.push(m.id);
      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken && ids.length < max);
    return ids.slice(0, max);
  }

  /** Search returning human-readable summaries (From/Subject/Date/snippet/labels). */
  async search(query: string, max = 25): Promise<MessageSummary[]> {
    const ids = await this.queryIds(query, max);
    const summaries = await mapLimit(ids, 15, async (id) => {
        const res = await withRetry(() =>
          this.api.users.messages.get({
            userId: "me",
            id,
            format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"],
          }),
        );
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
    });
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
      await withRetry(() =>
        this.api.users.messages.batchModify({
          userId: "me",
          requestBody: { ids: slice, addLabelIds: add, removeLabelIds: remove },
        }),
      );
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

  /** Move messages to Trash (recoverable ~30 days, then auto-purged). NOT a hard delete. */
  async trash(ids: string[]): Promise<number> {
    return this.batchModify(ids, ["TRASH"], []);
  }

  /** Restore messages from Trash. */
  async untrash(ids: string[]): Promise<number> {
    return this.batchModify(ids, [], ["TRASH"]);
  }

  /** Mark messages read (remove UNREAD). */
  async markRead(ids: string[]): Promise<number> {
    return this.batchModify(ids, [], ["UNREAD"]);
  }

  /** Mark messages unread (add UNREAD). */
  async markUnread(ids: string[]): Promise<number> {
    return this.batchModify(ids, ["UNREAD"], []);
  }

  /** Star or unstar messages. */
  async setStar(ids: string[], starred: boolean): Promise<number> {
    return starred ? this.batchModify(ids, ["STARRED"], []) : this.batchModify(ids, [], ["STARRED"]);
  }

  /** Full message with a decoded plain-text body, for reading/classification. */
  async getMessage(id: string): Promise<{
    id: string; from: string; to: string; subject: string; date: string;
    labelIds: string[]; body: string;
  }> {
    const res = await this.api.users.messages.get({ userId: "me", id, format: "full" });
    const headers = res.data.payload?.headers ?? [];
    const h = (n: string) =>
      headers.find((x) => x.name?.toLowerCase() === n.toLowerCase())?.value ?? "";
    return {
      id,
      from: h("From"),
      to: h("To"),
      subject: h("Subject"),
      date: h("Date"),
      labelIds: res.data.labelIds ?? [],
      body: extractBody(res.data.payload).slice(0, 20_000),
    };
  }

  /** List existing server-side filters. */
  async listFilters(): Promise<gmail_v1.Schema$Filter[]> {
    const res = await this.api.users.settings.filters.list({ userId: "me" });
    return res.data.filter ?? [];
  }

  /** Delete a server-side filter by id. */
  async deleteFilter(id: string): Promise<void> {
    await this.api.users.settings.filters.delete({ userId: "me", id });
  }

  /** Delete a user label by name. Refuses Gmail system labels. */
  async deleteLabel(name: string): Promise<boolean> {
    if (SYSTEM_LABELS.has(name.toUpperCase())) {
      throw new Error(`"${name}" is a system label and cannot be deleted.`);
    }
    const labels = await this.listLabels();
    const label = labels.find((l) => l.name?.toLowerCase() === name.toLowerCase());
    if (!label?.id) return false;
    await this.api.users.labels.delete({ userId: "me", id: label.id });
    return true;
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
