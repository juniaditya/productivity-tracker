import { NextResponse } from "next/server";
import {
  deleteGoogleTokens,
  getStoredGoogleTokens,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ error: "Google Calendar is not configured." }, { status: 503 });
  }

  const tokens = await getStoredGoogleTokens(data.user.id);
  if (tokens?.refresh_token) {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokens.refresh_token)}`,
        { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } },
      );
    } catch {
      // Local deletion still proceeds if Google's revoke endpoint is unreachable.
    }
  }
  await deleteGoogleTokens(data.user.id);
  return NextResponse.json({ ok: true });
}
