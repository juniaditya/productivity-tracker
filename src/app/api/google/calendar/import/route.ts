import { NextRequest, NextResponse } from "next/server";
import {
  googleApiFetch,
  localDateTimeParts,
  zonedLocalToIso,
} from "@/lib/google-calendar";
import { shiftDateKey } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as {
    date?: string;
    calendarId?: string;
    categoryId?: string;
  };
  if (!body.date || !body.calendarId || !body.categoryId) {
    return NextResponse.json({ error: "Date, calendar, and category are required." }, { status: 400 });
  }

  const { data: settings } = await supabase
    .from("user_settings")
    .select("timezone")
    .maybeSingle();
  const timezone = settings?.timezone ?? "Asia/Makassar";
  const dayStart = new Date(zonedLocalToIso(body.date, 0, timezone));
  const dayEnd = new Date(zonedLocalToIso(shiftDateKey(body.date, 1), 0, timezone));
  const queryStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const queryEnd = new Date(dayEnd.getTime() + 24 * 60 * 60 * 1000).toISOString();

  try {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        timeMin: queryStart,
        timeMax: queryEnd,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "2500",
        timeZone: timezone,
      });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await googleApiFetch<{ items?: GoogleEvent[]; nextPageToken?: string }>(
        authData.user.id,
        `/calendars/${encodeURIComponent(body.calendarId)}/events?${params.toString()}`,
      );
      events.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
    } while (pageToken);

    let allDaySkipped = 0;
    let outsideDaySkipped = 0;
    const mapped = events.flatMap((event) => {
      if (event.status === "cancelled" || !event.id) return [];
      if (event.start?.date || event.end?.date || !event.start?.dateTime || !event.end?.dateTime) {
        allDaySkipped += 1;
        return [];
      }
      const startDate = new Date(event.start.dateTime);
      const endDate = new Date(event.end.dateTime);
      if (!(startDate < dayEnd && endDate > dayStart)) {
        outsideDaySkipped += 1;
        return [];
      }

      const startParts = localDateTimeParts(startDate, timezone);
      const endParts = localDateTimeParts(endDate, timezone);
      let startMinute = startDate <= dayStart
        ? 0
        : startParts.hour * 60 + startParts.minute;
      let endMinute = endDate >= dayEnd
        ? 1440
        : endParts.hour * 60 + endParts.minute + (endParts.second > 0 ? 1 : 0);
      startMinute = Math.max(0, Math.floor(startMinute / 15) * 15);
      endMinute = Math.min(1440, Math.ceil(endMinute / 15) * 15);
      if (endMinute <= startMinute) return [];

      return [{
        external_id: event.id,
        start_minute: startMinute,
        end_minute: endMinute,
        note: event.summary?.trim() || "Google Calendar event",
      }];
    });

    const { data: syncResult, error: syncError } = await supabase.rpc(
      "sync_google_calendar_day",
      {
        p_activity_date: body.date,
        p_calendar_id: body.calendarId,
        p_category_id: body.categoryId,
        p_events: mapped,
      },
    );
    if (syncError) throw new Error(syncError.message);

    const { data: existingPrefs } = await supabase
      .from("calendar_preferences")
      .select("export_calendar_id")
      .maybeSingle();
    await supabase.from("calendar_preferences").upsert({
      user_id: authData.user.id,
      import_calendar_id: body.calendarId,
      export_calendar_id: existingPrefs?.export_calendar_id ?? null,
      import_category_id: body.categoryId,
      skip_all_day: true,
    });

    const result = (syncResult ?? [])[0] as
      | { inserted_count?: number; skipped_overlap_count?: number }
      | undefined;
    return NextResponse.json({
      inserted: result?.inserted_count ?? 0,
      skippedOverlap: result?.skipped_overlap_count ?? 0,
      skippedAllDay: allDaySkipped,
      skippedOutsideDay: outsideDaySkipped,
      fetched: events.length,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calendar import failed." },
      { status: 502 },
    );
  }
}
