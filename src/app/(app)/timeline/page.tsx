import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { TimelineEditor } from "@/components/timeline-editor";
import { dateKeyInTimeZone, sundayWeekRange } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Category, TimeBlock } from "@/lib/types";

export default async function TimelinePage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
  ]);

  const timezone = settings?.timezone ?? "Asia/Makassar";
  const today = dateKeyInTimeZone(new Date(), timezone);
  const range = sundayWeekRange(today);
  const { data: blocks } = await supabase
    .from("time_blocks")
    .select("id,activity_date,start_minute,end_minute,category_id,title,note,source")
    .gte("activity_date", range.start)
    .lte("activity_date", range.end)
    .order("activity_date")
    .order("start_minute");

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4 lg:px-6 lg:py-6">
      <PageHeader
        eyebrow="Timeline"
        title="Calendar-style time ledger"
        description="Desktop default 7 hari, HP default 1 hari. Drag untuk pindah, tarik tepi atas/bawah untuk resize, klik block untuk edit detail. Semua waktu tetap snap 15 menit."
        action={<LiveDataBadge />}
      />
      <div className="mt-4">
        <TimelineEditor
          initialDate={today}
          initialRangeStart={range.start}
          timezone={timezone}
          initialCategories={(categories ?? []) as Category[]}
          initialBlocks={(blocks ?? []) as TimeBlock[]}
        />
      </div>
    </div>
  );
}
