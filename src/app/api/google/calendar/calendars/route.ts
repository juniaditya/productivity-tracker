import { NextResponse } from "next/server";
import { listGoogleCalendars } from "@/lib/google-calendar";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const calendars = await listGoogleCalendars(data.user.id);
    return NextResponse.json({ calendars });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Google calendars." },
      { status: 502 },
    );
  }
}
