export const APP_NAME = "Focus Ledger";

export const categoryPresets = [
  { name: "Tidur", color: "#6366f1", classification: "recovery" },
  { name: "Belajar", color: "#8b5cf6", classification: "productive" },
  { name: "Kerja", color: "#3b82f6", classification: "productive" },
  { name: "Olahraga", color: "#22c55e", classification: "productive" },
  { name: "Main HP", color: "#f43f5e", classification: "distraction" },
  { name: "Personal", color: "#06b6d4", classification: "neutral" },
  { name: "Hiburan", color: "#eab308", classification: "leisure" },
  { name: "Makan", color: "#f97316", classification: "neutral" },
  { name: "Perjalanan", color: "#64748b", classification: "neutral" },
  { name: "Lainnya", color: "#71717a", classification: "neutral" },
] as const;

export const colorPresets = [
  "#6366f1", "#8b5cf6", "#3b82f6", "#06b6d4",
  "#14b8a6", "#22c55e", "#84cc16", "#eab308",
  "#f59e0b", "#f97316", "#ef4444", "#f43f5e",
  "#ec4899", "#a855f7", "#64748b", "#71717a",
] as const;
