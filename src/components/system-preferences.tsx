"use client";

import { CheckCircle2, Clock3, Gamepad2, Globe2, Loader2, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { UserSettings } from "@/lib/types";

const fallbackZones = [
  "Asia/Jakarta",
  "Asia/Makassar",
  "Asia/Jayapura",
  "Asia/Tokyo",
  "UTC",
];

export function SystemPreferences({ initialSettings }: { initialSettings: UserSettings }) {
  const [timezone, setTimezone] = useState(initialSettings.timezone);
  const [dayCutoff, setDayCutoff] = useState((initialSettings.day_cutoff || "23:59").slice(0, 5));
  const [gamification, setGamification] = useState(initialSettings.gamification_enabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const zones = useMemo(() => {
    try {
      const values = Intl.supportedValuesOf("timeZone");
      return values.includes(timezone) ? values : [timezone, ...values];
    } catch {
      return Array.from(new Set([timezone, ...fallbackZones]));
    }
  }, [timezone]);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: saveError } = await supabase
      .from("user_settings")
      .update({
        timezone,
        day_cutoff: `${dayCutoff}:00`,
        gamification_enabled: gamification,
      })
      .eq("user_id", initialSettings.user_id);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setMessage("Preferences tersimpan.");
  }

  return (
    <div>
      <div className="flex gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-muted"><Globe2 className="size-4" /></span>
        <div><h2 className="font-semibold">Productivity settings</h2><p className="mt-1 text-sm text-muted-foreground">Timezone dan day cutoff dipakai untuk Today, habit automation, dan Google Calendar.</p></div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block text-sm font-medium">
          <span className="mb-1.5 flex items-center gap-2"><Globe2 className="size-3.5" /> Timezone</span>
          <select value={timezone} onChange={(event) => setTimezone(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary">
            {zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">
          <span className="mb-1.5 flex items-center gap-2"><Clock3 className="size-3.5" /> Day cutoff</span>
          <input type="time" value={dayCutoff} onChange={(event) => setDayCutoff(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" />
          <span className="mt-1 block text-xs font-normal text-muted-foreground">Rule ≤ baru dianggap final setelah jam ini.</span>
        </label>
      </div>

      <label className="mt-4 flex items-center justify-between gap-4 rounded-lg border border-border p-3">
        <span className="flex items-center gap-3"><Gamepad2 className="size-4 text-muted-foreground" /><span><span className="block text-sm font-medium">Milestones</span><span className="block text-xs text-muted-foreground">Gamification ringan tanpa streak atau penalty.</span></span></span>
        <input type="checkbox" checked={gamification} onChange={(event) => setGamification(event.target.checked)} className="size-4 accent-[var(--primary)]" />
      </label>

      {error ? <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
      {message ? <p className="mt-3 inline-flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /> {message}</p> : null}
      <button onClick={() => void save()} disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save preferences
      </button>
    </div>
  );
}
