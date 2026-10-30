/**
 * Google Calendar for one account, on the account's shared OAuth client. Needs the
 * `calendar` scope. Guests are emailed about changes only when `notify` is true.
 */
import { google, calendar_v3 } from "googleapis";
import { withRetry, type OAuth2Client } from "./google.js";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export interface EventInput {
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

/** A YYYY-MM-DD date is an all-day boundary; anything else an RFC 3339 date-time. */
function when(value: string, timeZone?: string): calendar_v3.Schema$EventDateTime {
  return DATE_ONLY.test(value) ? { date: value } : { dateTime: value, ...(timeZone ? { timeZone } : {}) };
}

/** RFC 3339 for a list bound; a bare date means local midnight. */
function bound(value: string): string {
  return DATE_ONLY.test(value) ? new Date(`${value}T00:00:00`).toISOString() : value;
}

function eventBody(input: EventInput): calendar_v3.Schema$Event {
  const body: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined) body.description = input.description;
  if (input.location !== undefined) body.location = input.location;
  if (input.start) body.start = when(input.start, input.timeZone);
  if (input.end) body.end = when(input.end, input.timeZone);
  if (input.attendees) body.attendees = input.attendees.map((email) => ({ email }));
  return body;
}

const sendUpdates = (notify: boolean) => (notify ? "all" : "none");

export class CalendarClient {
  private api: calendar_v3.Calendar;

  constructor(auth: OAuth2Client) {
    this.api = google.calendar({ version: "v3", auth });
  }

  async calendars(): Promise<calendar_v3.Schema$CalendarListEntry[]> {
    const res = await withRetry(() => this.api.calendarList.list({ maxResults: 250 }));
    return res.data.items ?? [];
  }

  /** Events in start-time order with recurring events expanded; defaults to the next 7 days. */
  async events(opts: { calendar?: string; from?: string; to?: string; query?: string; max?: number }): Promise<calendar_v3.Schema$Event[]> {
    const timeMin = opts.from ? bound(opts.from) : new Date().toISOString();
    const timeMax = opts.to ? bound(opts.to) : new Date(Date.parse(timeMin) + 7 * DAY_MS).toISOString();
    const res = await withRetry(() =>
      this.api.events.list({
        calendarId: opts.calendar ?? "primary",
        timeMin,
        timeMax,
        q: opts.query,
        singleEvents: true,
        orderBy: "startTime",
        maxResults: Math.min(opts.max ?? 50, 250),
      }),
    );
    return res.data.items ?? [];
  }

  async create(calendar: string, input: EventInput, notify: boolean): Promise<calendar_v3.Schema$Event> {
    if (!input.summary || !input.start || !input.end) throw new Error("summary, start and end are required.");
    const res = await this.api.events.insert({ calendarId: calendar, sendUpdates: sendUpdates(notify), requestBody: eventBody(input) });
    return res.data;
  }

  /** Patch only the given fields. `attendees` replaces the whole guest list. */
  async update(calendar: string, eventId: string, input: EventInput, notify: boolean): Promise<calendar_v3.Schema$Event> {
    const requestBody = eventBody(input);
    if (Object.keys(requestBody).length === 0) throw new Error("Nothing to change.");
    const res = await withRetry(() =>
      this.api.events.patch({ calendarId: calendar, eventId, sendUpdates: sendUpdates(notify), requestBody }),
    );
    return res.data;
  }

  async delete(calendar: string, eventId: string, notify: boolean): Promise<void> {
    await this.api.events.delete({ calendarId: calendar, eventId, sendUpdates: sendUpdates(notify) });
  }
}
