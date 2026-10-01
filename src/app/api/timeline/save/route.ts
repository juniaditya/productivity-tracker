import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as { date?: string; blocks?: unknown[] };
    if (!body.date || !Array.isArray(body.blocks)) {
      return NextResponse.json({ error: "Invalid Timeline payload." }, { status: 400 });
    }

    const { error } = await supabase.rpc("save_day_time_blocks", {
      p_activity_date: body.date,
      p_blocks: body.blocks,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Timeline save failed." }, { status: 500 });
  }
}
