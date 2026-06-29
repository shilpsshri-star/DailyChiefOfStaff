// Lightweight MCP *client* -- the flip side of mcp-server/index.ts (which is
// an MCP *server*). This connects OUT to Google's own hosted Calendar MCP
// server and calls its create_event tool, so setting a milestone's target
// date can also drop a real event on your Google Calendar.
//
// Auth (lightweight demo, not a full OAuth flow): Google's Calendar MCP
// server expects a plain OAuth access token in the Authorization header,
// scoped to https://www.googleapis.com/auth/calendar.events. Generate a
// short-lived one yourself -- e.g. via https://developers.google.com/oauthplayground:
// pick "Calendar API v3" -> calendar.events scope in the left panel,
// authorize with your own Google account, exchange for tokens, and copy the
// resulting access token into .env.local as GOOGLE_CALENDAR_ACCESS_TOKEN.
// It expires in about an hour, so this is meant for demoing the
// integration, not unattended production use. The real version of this
// (refresh tokens stored per user, a consent screen, a callback route) is a
// separate, bigger project than this lightweight client.
//
// Intentionally best-effort: if the token is missing, expired, or the call
// fails for any reason, callers should log the detail and continue --
// a calendar hiccup should never block saving a milestone's target date.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CALENDAR_MCP_URL = "https://calendarmcp.googleapis.com/mcp/v1";

export interface CalendarEventResult {
  ok: boolean;
  detail: string;
}

// One-shot connect -> call create_event -> disconnect. Not kept open between
// calls since this only runs on the rare occasion a target date changes.
export async function createCalendarEventForMilestone(
  milestoneText: string,
  targetDate: string // YYYY-MM-DD
): Promise<CalendarEventResult> {
  const token = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (!token) {
    return {
      ok: false,
      detail:
        "GOOGLE_CALENDAR_ACCESS_TOKEN not set in .env.local -- skipping calendar sync (see mcp-server/calendar-client.ts for how to generate one).",
    };
  }

  const client = new Client({ name: "daily-chief-of-staff-calendar-client", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(CALENDAR_MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    await client.connect(transport);

    // All-day event spanning just the target date (end is exclusive in the
    // Calendar API's all-day event format, so it's the day after).
    const nextDay = new Date(targetDate + "T00:00:00");
    nextDay.setDate(nextDay.getDate() + 1);
    const endDate = nextDay.toISOString().slice(0, 10);

    const result = await client.callTool({
      name: "create_event",
      arguments: {
        calendarId: "primary",
        summary: `Milestone due: ${milestoneText}`,
        start: { date: targetDate },
        end: { date: endDate },
      },
    });

    const firstBlock = Array.isArray(result.content) ? result.content[0] : undefined;
    const text =
      firstBlock && typeof firstBlock === "object" && (firstBlock as { type?: string }).type === "text"
        ? (firstBlock as { text: string }).text
        : JSON.stringify(result.content);

    return { ok: !result.isError, detail: text };
  } catch (err) {
    return {
      ok: false,
      detail: `Calendar MCP call failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    await client.close().catch(() => {});
  }
}
