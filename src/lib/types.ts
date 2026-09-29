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

export type HabitRule = {
  id: string;
  user_id: string;
  habit_id: string;
  source: "time_tracker" | "stayfree";
  operator: "gte" | "lte";
  threshold_minutes: number;
  category_id: string | null;
  match_type: "all" | "app" | "domain" | "device" | null;
  match_value: string | null;
  finalize_at_day_end: boolean;
  is_active: boolean;
};

export type HabitRuleStatus = {
  habit_id: string;
  rule_source: "time_tracker" | "stayfree";
  measured_minutes: number;
  target_minutes: number;
  rule_operator: "gte" | "lte";
  status: "complete" | "pending" | "on_track" | "failed";
};

export type ScreenUsage = {
  usage_date: string;
  device: string | null;
  app_name: string | null;
  domain: string | null;
  duration_seconds: number;
};

export type ImportBatch = {
  id: string;
  source: "stayfree_csv" | "other";
  file_name: string | null;
  row_count: number;
  imported_at: string;
};
