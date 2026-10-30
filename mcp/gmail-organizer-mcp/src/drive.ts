/**
 * Drive, Docs, Sheets and Slides for one account, on the account's shared OAuth client.
 * Needs the `drive` scope, which the Docs, Sheets and Slides APIs all accept.
 * No permanent deletes: files can only be trashed (recoverable from Drive's trash).
 */
import { Readable } from "node:stream";
import { google, docs_v1, drive_v3, slides_v1, sheets_v4 } from "googleapis";
import { withRetry, type OAuth2Client } from "./google.js";

const GOOGLE_DOC = "application/vnd.google-apps.document";
const GOOGLE_SHEET = "application/vnd.google-apps.spreadsheet";
const GOOGLE_SLIDES = "application/vnd.google-apps.presentation";
const FOLDER = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id, name, mimeType, modifiedTime, owners(emailAddress), webViewLink, size";

// Caps so one large file or sheet can't flood the conversation.
const MAX_READ_CHARS = 50_000;
const MAX_ROWS = 1000;
const MAX_DOWNLOAD_BYTES = 5_000_000;

const TEXT_TYPES = new Set(["application/json", "application/xml", "application/javascript", "application/x-yaml"]);

export type FileKind = "doc" | "sheet" | "slides" | "folder" | "file";

export interface FileSummary {
  id: string;
  name: string;
  mimeType: string;
  modified: string;
  owners: string[];
  link: string;
}

export interface Replacement {
  find: string;
  replace: string;
  match_case?: boolean;
}

function summarize(f: drive_v3.Schema$File): FileSummary {
  return {
    id: f.id ?? "",
    name: f.name ?? "",
    mimeType: f.mimeType ?? "",
    modified: f.modifiedTime ?? "",
    owners: (f.owners ?? []).map((o) => o.emailAddress ?? "").filter(Boolean),
    link: f.webViewLink ?? "",
  };
}

/** Short label for a MIME type: Doc / Sheet / Slides / Folder, else the type itself. */
export function shortType(mimeType: string): string {
  return { [GOOGLE_DOC]: "Doc", [GOOGLE_SHEET]: "Sheet", [GOOGLE_SLIDES]: "Slides", [FOLDER]: "Folder" }[mimeType] ?? mimeType;
}

function truncate(s: string, max = MAX_READ_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}\n\n[… truncated: ${s.length - max} more characters]` : s;
}

/** Quote a value for a Drive query string. */
function driveString(s: string): string {
  return `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function replaceAll(replacements: Replacement[]) {
  return replacements.map((r) => ({
    replaceAllText: { containsText: { text: r.find, matchCase: r.match_case ?? true }, replaceText: r.replace },
  }));
}

export class DriveClient {
  private drive: drive_v3.Drive;
  private docs: docs_v1.Docs;
  private sheets: sheets_v4.Sheets;
  private slides: slides_v1.Slides;

  constructor(auth: OAuth2Client) {
    this.drive = google.drive({ version: "v3", auth });
    this.docs = google.docs({ version: "v1", auth });
    this.sheets = google.sheets({ version: "v4", auth });
    this.slides = google.slides({ version: "v1", auth });
  }

  /** Full-text `text` and/or a raw Drive `query`; trashed files excluded unless the query says otherwise. */
  async search(text: string | undefined, query: string | undefined, max: number): Promise<FileSummary[]> {
    const parts: string[] = [];
    if (query) parts.push(`(${query})`);
    if (text) parts.push(`fullText contains ${driveString(text)}`);
    if (!query?.includes("trashed")) parts.push("trashed = false");
    const res = await withRetry(() =>
      this.drive.files.list({
        q: parts.join(" and "),
        pageSize: Math.min(max, 100),
        fields: `files(${FILE_FIELDS})`,
        // Drive can't sort full-text results.
        orderBy: text ? undefined : "modifiedTime desc",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );
    return (res.data.files ?? []).map(summarize);
  }

  /** A file's metadata plus its content as text, where it has a text form. */
  async read(id: string): Promise<{ file: FileSummary; content: string }> {
    const meta = (await withRetry(() => this.drive.files.get({ fileId: id, fields: FILE_FIELDS, supportsAllDrives: true }))).data;
    const file = summarize(meta);
    const mime = file.mimeType;
    let content: string;
    if (mime === GOOGLE_DOC) {
      content = await this.exportText(id, "text/markdown");
    } else if (mime === GOOGLE_SLIDES) {
      content = await this.exportText(id, "text/plain");
    } else if (mime === GOOGLE_SHEET) {
      content = `${await this.sheetTabs(id)}\n\nUse sheets_read with a range (e.g. 'Sheet1!A1:Z100') for values.`;
    } else if (mime.startsWith("text/") || TEXT_TYPES.has(mime)) {
      if (Number(meta.size ?? 0) > MAX_DOWNLOAD_BYTES) {
        content = `(${meta.size} bytes — too large to read as text)`;
      } else {
        const res = await withRetry(() =>
          this.drive.files.get({ fileId: id, alt: "media", supportsAllDrives: true }, { responseType: "text" }),
        );
        content = String(res.data);
      }
    } else {
      content = `(${mime} — no text form${meta.size ? `, ${meta.size} bytes` : ""})`;
    }
    return { file, content: truncate(content) };
  }

  private async exportText(id: string, mimeType: string): Promise<string> {
    const res = await withRetry(() => this.drive.files.export({ fileId: id, mimeType }, { responseType: "text" }));
    return String(res.data);
  }

  /**
   * Create a file. `content` is Markdown for a doc and CSV for a sheet (Drive converts
   * both), plain text for a file; slides and folders are created empty.
   */
  async create(name: string, kind: FileKind, parent?: string, content?: string): Promise<FileSummary> {
    const target = { doc: GOOGLE_DOC, sheet: GOOGLE_SHEET, slides: GOOGLE_SLIDES, folder: FOLDER, file: undefined }[kind];
    const source = { doc: "text/markdown", sheet: "text/csv", file: "text/plain", slides: undefined, folder: undefined }[kind];
    if (content !== undefined && !source) throw new Error(`A ${kind} is created empty; leave out content.`);
    const requestBody: drive_v3.Schema$File = { name, ...(target ? { mimeType: target } : {}), ...(parent ? { parents: [parent] } : {}) };
    const media = content !== undefined ? { mimeType: source, body: Readable.from([content]) } : undefined;
    const res = await this.drive.files.create({ requestBody, media, fields: FILE_FIELDS, supportsAllDrives: true });
    return summarize(res.data);
  }

  /** Rename, move, star/unstar, or trash/untrash. */
  async update(
    id: string,
    changes: { name?: string; moveTo?: string; starred?: boolean; trashed?: boolean },
  ): Promise<FileSummary> {
    let removeParents: string | undefined;
    if (changes.moveTo) {
      const current = await withRetry(() => this.drive.files.get({ fileId: id, fields: "parents", supportsAllDrives: true }));
      removeParents = (current.data.parents ?? []).join(",") || undefined;
    }
    const requestBody: drive_v3.Schema$File = {};
    if (changes.name !== undefined) requestBody.name = changes.name;
    if (changes.starred !== undefined) requestBody.starred = changes.starred;
    if (changes.trashed !== undefined) requestBody.trashed = changes.trashed;
    const res = await withRetry(() =>
      this.drive.files.update({
        fileId: id,
        requestBody,
        addParents: changes.moveTo,
        removeParents,
        fields: FILE_FIELDS,
        supportsAllDrives: true,
      }),
    );
    return summarize(res.data);
  }

  async share(id: string, email: string, role: "reader" | "commenter" | "writer", notify: boolean): Promise<void> {
    await this.drive.permissions.create({
      fileId: id,
      requestBody: { type: "user", role, emailAddress: email },
      sendNotificationEmail: notify,
      supportsAllDrives: true,
    });
  }

  /** One atomic Docs batch: replace text everywhere, then append at the end of the body. */
  async docsEdit(id: string, edit: { append?: string; replace?: Replacement[] }): Promise<number> {
    const requests: docs_v1.Schema$Request[] = replaceAll(edit.replace ?? []);
    if (edit.append) requests.push({ insertText: { endOfSegmentLocation: {}, text: edit.append } });
    if (requests.length === 0) throw new Error("Nothing to do: pass append and/or replace.");
    const res = await this.docs.documents.batchUpdate({ documentId: id, requestBody: { requests } });
    return (res.data.replies ?? []).reduce((n, r) => n + (r.replaceAllText?.occurrencesChanged ?? 0), 0);
  }

  /** Tabs and sizes without a range; values (one JSON array per row) with one. */
  async sheetsRead(id: string, range?: string): Promise<string> {
    if (!range) return this.sheetTabs(id);
    const res = await withRetry(() => this.sheets.spreadsheets.values.get({ spreadsheetId: id, range }));
    const rows = res.data.values ?? [];
    const lines = rows.slice(0, MAX_ROWS).map((r) => JSON.stringify(r));
    if (rows.length > MAX_ROWS) lines.push(`[… ${rows.length - MAX_ROWS} more rows; read a narrower range]`);
    return truncate(`${res.data.range} — ${rows.length} row(s)\n${lines.join("\n")}`);
  }

  private async sheetTabs(id: string): Promise<string> {
    const res = await withRetry(() =>
      this.sheets.spreadsheets.get({
        spreadsheetId: id,
        fields: "properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))",
      }),
    );
    const tabs = (res.data.sheets ?? []).map((s) => {
      const g = s.properties?.gridProperties;
      return `- ${s.properties?.title} (${g?.rowCount ?? "?"} rows × ${g?.columnCount ?? "?"} cols)`;
    });
    return `Spreadsheet "${res.data.properties?.title}" — tabs:\n${tabs.join("\n")}`;
  }

  async sheetsWrite(
    id: string,
    range: string,
    values: (string | number | boolean)[][],
    mode: "update" | "append",
    input: "user_entered" | "raw",
  ): Promise<string> {
    const valueInputOption = input === "raw" ? "RAW" : "USER_ENTERED";
    if (mode === "append") {
      const res = await this.sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range,
        valueInputOption,
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });
      return `appended ${res.data.updates?.updatedRows ?? 0} row(s) at ${res.data.updates?.updatedRange}`;
    }
    const res = await withRetry(() =>
      this.sheets.spreadsheets.values.update({ spreadsheetId: id, range, valueInputOption, requestBody: { values } }),
    );
    return `updated ${res.data.updatedCells ?? 0} cell(s) in ${res.data.updatedRange}`;
  }

  /** Replace text across a deck; returns the number of occurrences changed. */
  async slidesReplace(id: string, replacements: Replacement[]): Promise<number> {
    if (replacements.length === 0) throw new Error("Nothing to do: pass at least one replacement.");
    const res = await this.slides.presentations.batchUpdate({
      presentationId: id,
      requestBody: { requests: replaceAll(replacements) },
    });
    return (res.data.replies ?? []).reduce((n, r) => n + (r.replaceAllText?.occurrencesChanged ?? 0), 0);
  }
}
