import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { TimelineEditor } from "@/components/timeline-editor";
import { dateKeyInTimeZone } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Category, TimeBlock } from "@/lib/types";

export default async function TimelinePage() {
  const supabase = await createClient();
  const [{ data: settings }, { data: categories }] = await Promise.all([
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
  ]);
  const today = dateKeyInTimeZone(new Date(), settings?.timezone ?? "Asia/Makassar");
  const { data: blocks } = await supabase
    .from("time_blocks")
    .select("id,activity_date,start_minute,end_minute,category_id,note,source")
    .eq("activity_date", today)
    .order("start_minute");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Timeline"
        title="Where did the day go?"
        description="Rencanakan atau catat aktivitas dalam resolusi 15 menit. Data sekarang tersimpan ke Supabase dan dua aktivitas boleh overlap pada waktu yang sama."
        action={<LiveDataBadge />}
      />
      <div className="mt-6">
        <TimelineEditor
          initialDate={today}
          initialCategories={(categories ?? []) as Category[]}
          initialBlocks={(blocks ?? []) as TimeBlock[]}
        />
      </div>
    </div>
  );
}
