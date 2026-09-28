import { DemoBadge } from "@/components/demo-badge";
import { HabitPlanner } from "@/components/habit-planner";
import { PageHeader } from "@/components/page-header";

export default function HabitsPage() {
  return (
    <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Habits"
        title="Consistency without streak pressure"
        description="Calendar penuh tetap terlihat, tetapi completion rate dihitung terhadap weekly dan monthly goal—bukan menganggap setiap hari kosong sebagai kegagalan."
        action={<DemoBadge />}
      />
      <div className="mt-6"><HabitPlanner /></div>
    </div>
  );
}
