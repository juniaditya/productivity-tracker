import { HabitPlanner } from "@/components/habit-planner";
import { LiveDataBadge } from "@/components/live-data-badge";
import { PageHeader } from "@/components/page-header";
import { dateKeyInTimeZone, monthRange, shiftDateKey } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Category, Habit, HabitCheck, HabitRule, HabitRuleStatus } from "@/lib/types";

export default async function HabitsPage() {
  const supabase = await createClient();
  const [{ data: userData }, { data: settings }, { data: habits }, { data: categories }, { data: rules }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("user_settings").select("timezone").maybeSingle(),
    supabase.from("habits").select("id,user_id,name,color,completion_mode,weekly_target,monthly_target,sort_order,is_active").eq("is_active", true).order("sort_order"),
    supabase.from("categories").select("id,user_id,name,color,classification,sort_order,is_active").order("sort_order"),
    supabase.from("habit_rules").select("id,user_id,habit_id,source,operator,threshold_minutes,category_id,match_type,match_value,finalize_at_day_end,is_active").eq("is_active", true),
  ]);

  const today = dateKeyInTimeZone(new Date(), settings?.timezone ?? "Asia/Makassar");
  const yesterday = shiftDateKey(today, -1);

  // Finalize yesterday's ≤ rules and refresh today's immediate ≥ / status rules.
  await supabase.rpc("evaluate_habit_rules", { p_check_date: yesterday });
  const { data: todayStatuses } = await supabase.rpc("evaluate_habit_rules", { p_check_date: today });

  const [year, month] = today.split("-").map(Number);
  const range = monthRange(year, month - 1);
  const { data: checks } = await supabase
    .from("habit_checks")
    .select("id,habit_id,check_date,checked,source,note")
    .gte("check_date", range.start)
    .lte("check_date", range.end);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Habits"
        title="Consistency without streak pressure"
        description="Manual check tetap tersedia, tetapi habit sekarang juga bisa dicentang otomatis dari Timeline atau StayFree. Manual override selalu menang."
        action={<LiveDataBadge />}
      />
      <div className="mt-6">
        <HabitPlanner
          userId={userData.user?.id ?? ""}
          today={today}
          initialMonth={today.slice(0, 7)}
          initialHabits={(habits ?? []) as Habit[]}
          initialChecks={(checks ?? []) as HabitCheck[]}
          initialRules={(rules ?? []) as HabitRule[]}
          initialRuleStatuses={(todayStatuses ?? []) as HabitRuleStatus[]}
          categories={(categories ?? []) as Category[]}
        />
      </div>
    </div>
  );
}
