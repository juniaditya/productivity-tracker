import { HabitPlanner } from "@/components/habit-planner";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { dateKeyInTimeZone, monthRange } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Habit, HabitCheck } from "@/lib/types";

export default async function HabitsPage() {
  const supabase = await createClient();
  const [{ data: userData }, { data: settings }, { data: habits }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("habits").select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").eq("is_active", true).order("sort_order"),
  ]);
  const today = dateKeyInTimeZone(new Date(), settings?.timezone ?? "Asia/Makassar");
  const [year, month] = today.split("-").map(Number);
  const range = monthRange(year, month - 1);
  const { data: checks } = await supabase
    .from("habit_checks")
    .select("id,habit_id,check_date,checked,source,note")
    .gte("check_date", range.start)
    .lte("check_date", range.end)
    .eq("checked", true);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Habits"
        title="Consistency without streak pressure"
        description="Centang habit yang benar-benar dilakukan. Completion rate memakai weekly/monthly goal, jadi hari kosong tidak otomatis dianggap gagal."
        action={<LiveDataBadge />}
      />
      <div className="mt-6">
        <HabitPlanner
          userId={userData.user?.id ?? ""}
          initialMonth={today.slice(0, 7)}
          initialHabits={(habits ?? []) as Habit[]}
          initialChecks={(checks ?? []) as HabitCheck[]}
        />
      </div>
    </div>
  );
}
