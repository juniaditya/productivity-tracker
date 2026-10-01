import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type TimelineDay = {
  activity_date?: string;
  blocks?: unknown[];
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as {
      days?: TimelineDay[];
      date?: string;
      blocks?: unknown[];
    };

    const days = Array.isArray(body.days)
      ? body.days
      : body.date && Array.isArray(body.blocks)
        ? [{ activity_date: body.date, blocks: body.blocks }]
        : null;

    if (!days?.length || days.some((day) => !day.activity_date || !Array.isArray(day.blocks))) {
      return NextResponse.json({ error: "Invalid Timeline payload." }, { status: 400 });
    }

    const { error } = await supabase.rpc("save_timeline_days", { p_days: days });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, saved_days: days.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Timeline save failed." },
      { status: 500 },
    );
  }
}
