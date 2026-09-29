export type CategoryClassification =
  | "productive"
  | "recovery"
  | "leisure"
  | "distraction"
  | "neutral";

export type Category = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  classification: CategoryClassification;
  sort_order: number;
  is_active: boolean;
};

export type TimeBlock = {
  id?: string;
  activity_date: string;
  start_minute: number;
  end_minute: number;
  category_id: string;
  note: string | null;
  source?: string;
};

export type Habit = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  completion_mode: "manual" | "automatic" | "hybrid";
  weekly_target: number | null;
  monthly_target: number | null;
  sort_order: number;
  is_active: boolean;
};

export type HabitCheck = {
  id?: string;
  habit_id: string;
  check_date: string;
  checked: boolean;
  source: "manual" | "time_rule" | "stayfree_rule" | "manual_override";
  note?: string | null;
};

export type ScreenUsage = {
  usage_date: string;
  device: string | null;
  app_name: string | null;
  domain: string | null;
  duration_seconds: number;
};
