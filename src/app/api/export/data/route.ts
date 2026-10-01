import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function readAll(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
) {
  const rows: unknown[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function GET() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tables = [
    "user_settings",
    "categories",
    "time_blocks",
    "habits",
    "habit_rules",
    "habit_checks",
    "import_batches",
    "screen_usage",
    "calendar_preferences",
    "milestone_unlocks",
  ];

  try {
    const entries = await Promise.all(
      tables.map(async (table) => [table, await readAll(supabase, table)] as const),
    );
    const payload = {
      format: "focus-ledger-backup",
      version: 3,
      exported_at: new Date().toISOString(),
      user: { id: authData.user.id, email: authData.user.email ?? null },
      note: "Google OAuth tokens are intentionally excluded from backups.",
      data: Object.fromEntries(entries),
    };
    const filename = `focus-ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backup export failed." },
      { status: 500 },
    );
  }
}
