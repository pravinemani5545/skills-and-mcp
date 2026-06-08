#!/usr/bin/env node
/**
 * gmail-organizer-mcp — local MCP server exposing account-aware Gmail tools so
 * Claude Code can read and organize multiple Gmail accounts.
 *
 * Secrets come from Bitwarden at startup (BW_SESSION required). No deletes.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadOAuthApp, loadAccounts, ensureUnlocked } from "./tokens.js";
import type { AccountRecord, OAuthApp } from "./tokens.js";
import { GmailClient, selectAccounts } from "./gmail.js";

const HARD_MAX = 1000;

let oauthApp: OAuthApp;
let accounts: AccountRecord[] = [];
const clientCache = new Map<string, GmailClient>();

function clientFor(account: AccountRecord): GmailClient {
  let c = clientCache.get(account.email);
  if (!c) {
    c = new GmailClient(oauthApp, account);
    clientCache.set(account.email, c);
  }
  return c;
}

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}
function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

/** Resolve message ids from explicit ids or a query, capped. */
async function resolveIds(
  client: GmailClient,
  ids: string[] | undefined,
  query: string | undefined,
  max: number,
): Promise<string[]> {
  if (ids?.length) return ids.slice(0, HARD_MAX);
  if (query) return client.queryIds(query, Math.min(max, HARD_MAX));
  throw new Error("Provide either `ids` or `query`.");
}

const server = new McpServer({ name: "gmail-organizer", version: "1.0.0" });

const accountArg = z
  .string()
  .describe('Account email or alias, or "all" to fan out across every connected account.');

server.registerTool(
  "list_accounts",
  {
    description: "List the connected Gmail accounts this server can organize.",
    inputSchema: {},
  },
  async () => {
    if (accounts.length === 0) return text("No accounts connected. Run `pnpm auth <email>` then restart the server.");
    return text(
      accounts.map((a) => `- ${a.email}${a.alias ? ` (alias: ${a.alias})` : ""}`).join("\n"),
    );
  },
);

server.registerTool(
  "search",
  {
    description:
      "Search messages using Gmail query syntax (e.g. 'is:unread category:promotions newer_than:7d'). Returns summaries with id, threadId, from, subject, date, snippet, labels.",
    inputSchema: {
      account: accountArg,
      query: z.string().describe("Gmail search query."),
      max: z.number().int().positive().max(HARD_MAX).optional().describe("Max results per account (default 25)."),
    },
  },
  async ({ account, query, max }) => {
    try {
      const targets = selectAccounts(accounts, account);
      const blocks = await Promise.all(
        targets.map(async (a) => {
          const results = await clientFor(a).search(query, max ?? 25);
          const header = `### ${a.email} — ${results.length} match(es)`;
          const body = results
            .map((m) => `- [${m.id}] ${m.from} — ${m.subject || "(no subject)"} (${m.date})\n  ${m.snippet}\n  labels: ${m.labelIds.join(", ")}`)
            .join("\n");
          return `${header}\n${body || "(none)"}`;
        }),
      );
      return text(blocks.join("\n\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "get_thread",
  {
    description: "Get the full content of a thread for deeper triage.",
    inputSchema: { account: accountArg, thread_id: z.string() },
  },
  async ({ account, thread_id }) => {
    try {
      const a = selectAccounts(accounts, account)[0];
      const thread = await clientFor(a).getThread(thread_id);
      return text(JSON.stringify(thread, null, 2));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "list_labels",
  {
    description: "List all labels for an account.",
    inputSchema: { account: accountArg },
  },
  async ({ account }) => {
    try {
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const labels = await clientFor(a).listLabels();
          return `### ${a.email}\n${labels.map((l) => `- ${l.name}`).join("\n")}`;
        }),
      );
      return text(blocks.join("\n\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

const idsOrQuery = {
  ids: z.array(z.string()).optional().describe("Explicit message ids (from search)."),
  query: z.string().optional().describe("Gmail query selecting messages (alternative to ids)."),
  max: z.number().int().positive().max(HARD_MAX).optional().describe("Cap when using query (default 100)."),
};

server.registerTool(
  "apply_label",
  {
    description: "Apply a label (created if missing) to messages selected by ids or query. Returns count.",
    inputSchema: { account: accountArg, label: z.string(), ...idsOrQuery },
  },
  async ({ account, label, ids, query, max }) => {
    try {
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const c = clientFor(a);
          const targetIds = await resolveIds(c, ids, query, max ?? 100);
          const n = await c.applyLabel(targetIds, label);
          return `${a.email}: labeled ${n} message(s) as "${label}"`;
        }),
      );
      return text(blocks.join("\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "remove_label",
  {
    description: "Remove a label from messages selected by ids or query. Returns count.",
    inputSchema: { account: accountArg, label: z.string(), ...idsOrQuery },
  },
  async ({ account, label, ids, query, max }) => {
    try {
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const c = clientFor(a);
          const targetIds = await resolveIds(c, ids, query, max ?? 100);
          const n = await c.removeLabel(targetIds, label);
          return `${a.email}: removed "${label}" from ${n} message(s)`;
        }),
      );
      return text(blocks.join("\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "archive",
  {
    description: "Archive messages (remove INBOX label) selected by ids or query. Does NOT delete. Returns count.",
    inputSchema: { account: accountArg, ...idsOrQuery },
  },
  async ({ account, ids, query, max }) => {
    try {
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const c = clientFor(a);
          const targetIds = await resolveIds(c, ids, query, max ?? 100);
          const n = await c.archive(targetIds);
          return `${a.email}: archived ${n} message(s)`;
        }),
      );
      return text(blocks.join("\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "mark_read",
  {
    description: "Mark messages read (remove UNREAD) selected by ids or query. Returns count.",
    inputSchema: { account: accountArg, ...idsOrQuery },
  },
  async ({ account, ids, query, max }) => {
    try {
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const c = clientFor(a);
          const targetIds = await resolveIds(c, ids, query, max ?? 100);
          const n = await c.markRead(targetIds);
          return `${a.email}: marked ${n} message(s) read`;
        }),
      );
      return text(blocks.join("\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

server.registerTool(
  "create_filter",
  {
    description:
      "Create a server-side Gmail filter that applies to FUTURE mail. action: label | archive | label_and_archive.",
    inputSchema: {
      account: accountArg,
      from: z.string().optional(),
      to: z.string().optional(),
      subject: z.string().optional(),
      query: z.string().optional().describe("Raw Gmail search expression for the filter criteria."),
      has_attachment: z.boolean().optional(),
      action: z.enum(["label", "archive", "label_and_archive"]),
      label: z.string().optional().describe("Required for label / label_and_archive."),
    },
  },
  async ({ account, from, to, subject, query, has_attachment, action, label }) => {
    try {
      const criteria = {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(subject ? { subject } : {}),
        ...(query ? { query } : {}),
        ...(has_attachment ? { hasAttachment: true } : {}),
      };
      if (Object.keys(criteria).length === 0) throw new Error("Provide at least one criterion.");
      const blocks = await Promise.all(
        selectAccounts(accounts, account).map(async (a) => {
          const id = await clientFor(a).createFilter(criteria, action, label);
          return `${a.email}: created filter ${id} (${action}${label ? ` → ${label}` : ""})`;
        }),
      );
      return text(blocks.join("\n"));
    } catch (e) {
      return errorResult(e);
    }
  },
);

async function main() {
  await ensureUnlocked().catch(() => {}); // unattended path; ok if BW_SESSION already set
  oauthApp = await loadOAuthApp();
  accounts = await loadAccounts();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`gmail-organizer-mcp ready — ${accounts.length} account(s) loaded.`);
}

main().catch((err) => {
  console.error("Fatal:", err.message ?? err);
  process.exit(1);
});
