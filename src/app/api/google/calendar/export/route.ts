import { NextRequest, NextResponse } from "next/server";
import {
  calendarEventFingerprint,
  googleApiFetch,
  zonedLocalToIso,
} from "@/lib/google-calendar";
import { shiftDateKey } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Category, TimeBlock } from "@/lib/types";

type GoogleEvent = {
  extendedProperties?: { private?: Record<string, string> };
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json()) as { date?: string; calendarId?: string };
  if (!body.date || !body.calendarId) {
    return NextResponse.json({ error: "Date and calendar are required." }, { status: 400 });
  }

  const [{ data: settings }, { data: blocksData }, { data: categoriesData }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase
      .from("time_blocks")
      .select("id,activity_date,start_minute,end_minute,category_id,note,source,external_id,external_calendar_id")
      .eq("activity_date", body.date)
      .neq("source", "google_calendar")
      .order("start_minute"),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active"),
  ]);
  const timezone = settings?.timezone ?? "Asia/Makassar";
  const blocks = (blocksData ?? []) as TimeBlock[];
  const categories = (categoriesData ?? []) as Category[];
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  try {
    const startIso = zonedLocalToIso(body.date, 0, timezone);
    const endIso = zonedLocalToIso(shiftDateKey(body.date, 1), 0, timezone);
    const params = new URLSearchParams({
      timeMin: startIso,
      timeMax: endIso,
      singleEvents: "true",
      maxResults: "2500",
    });
    const existing = await googleApiFetch<{ items?: GoogleEvent[] }>(
      authData.user.id,
      `/calendars/${encodeURIComponent(body.calendarId)}/events?${params.toString()}`,
    );
    const existingFingerprints = new Set(
      (existing.items ?? [])
        .map((event) => event.extendedProperties?.private?.focusLedgerFingerprint)
        .filter((value): value is string => Boolean(value)),
    );

    let created = 0;
    let skippedExisting = 0;
    let skippedMissingCategory = 0;
    for (const block of blocks) {
      const category = categoryMap.get(block.category_id);
      if (!category) {
        skippedMissingCategory += 1;
        continue;
      }
      const fingerprint = calendarEventFingerprint({
        date: body.date,
        startMinute: block.start_minute,
        endMinute: block.end_minute,
        categoryId: block.category_id,
        note: block.note,
      });
      if (existingFingerprints.has(fingerprint)) {
        skippedExisting += 1;
        continue;
      }

      await googleApiFetch(
        authData.user.id,
        `/calendars/${encodeURIComponent(body.calendarId)}/events?sendUpdates=none`,
        {
          method: "POST",
          body: JSON.stringify({
            summary: category.name,
            description: block.note || "Created from Focus Ledger",
            start: {
              dateTime: zonedLocalToIso(body.date, block.start_minute, timezone),
              timeZone: timezone,
            },
            end: {
              dateTime: zonedLocalToIso(body.date, block.end_minute, timezone),
              timeZone: timezone,
            },
            extendedProperties: {
              private: {
                focusLedgerFingerprint: fingerprint,
                focusLedgerCategoryId: block.category_id,
                focusLedgerSource: "timeline",
              },
            },
          }),
        },
      );
      existingFingerprints.add(fingerprint);
      created += 1;
    }

    const { data: existingPrefs } = await supabase
      .from("calendar_preferences")
      .select("import_calendar_id,import_category_id,skip_all_day")
      .maybeSingle();
    await supabase.from("calendar_preferences").upsert({
      user_id: authData.user.id,
      import_calendar_id: existingPrefs?.import_calendar_id ?? null,
      export_calendar_id: body.calendarId,
      import_category_id: existingPrefs?.import_category_id ?? null,
      skip_all_day: existingPrefs?.skip_all_day ?? true,
    });

    return NextResponse.json({ created, skippedExisting, skippedMissingCategory });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Calendar export failed." },
      { status: 502 },
    );
  }
}
