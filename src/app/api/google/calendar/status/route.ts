import { NextResponse } from "next/server";
import {
  getStoredGoogleTokens,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = isGoogleCalendarConfigured();
  if (!configured) return NextResponse.json({ configured: false, connected: false });
  const tokens = await getStoredGoogleTokens(data.user.id);
  return NextResponse.json({
    configured: true,
    connected: Boolean(tokens?.refresh_token),
    account: tokens?.google_account ?? null,
    scopes: tokens?.scopes?.split(" ").filter(Boolean) ?? [],
    updatedAt: tokens?.updated_at ?? null,
  });
}
