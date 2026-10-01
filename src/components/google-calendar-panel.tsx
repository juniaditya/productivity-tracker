"use client";

import { CalendarDays, CheckCircle2, Loader2, LogOut, RefreshCw, Upload, Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarPreference, Category } from "@/lib/types";

type CalendarItem = {
  id: string;
  summary: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  timeZone?: string;
};

type Status = {
  configured: boolean;
  connected: boolean;
  account?: string | null;
  updatedAt?: string | null;
};

export function GoogleCalendarPanel({
  categories,
  initialPreferences,
  today,
}: {
  categories: Category[];
  initialPreferences: CalendarPreference;
  today: string;
}) {
  const router = useRouter();
  const activeCategories = useMemo(() => categories.filter((category) => category.is_active), [categories]);
  const [status, setStatus] = useState<Status | null>(null);
  const [calendars, setCalendars] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"import" | "export" | "disconnect" | null>(null);
  const [date, setDate] = useState(today);
  const [importCalendar, setImportCalendar] = useState(initialPreferences.import_calendar_id ?? "");
  const [exportCalendar, setExportCalendar] = useState(initialPreferences.export_calendar_id ?? "");
  const [categoryId, setCategoryId] = useState(initialPreferences.import_category_id ?? activeCategories[0]?.id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCalendars = useCallback(async () => {
    const response = await fetch("/api/google/calendar/calendars", { cache: "no-store" });
    const json = await response.json() as { calendars?: CalendarItem[]; error?: string };
    if (!response.ok) throw new Error(json.error || "Unable to load calendars.");
    const items = json.calendars ?? [];
    setCalendars(items);
    const primary = items.find((item) => item.primary) ?? items[0];
    if (!importCalendar && primary) setImportCalendar(primary.id);
    if (!exportCalendar && primary) setExportCalendar(primary.id);
  }, [exportCalendar, importCalendar]);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/google/calendar/status", { cache: "no-store" });
      const json = await response.json() as Status & { error?: string };
      if (!response.ok) throw new Error(json.error || "Unable to check Calendar status.");
      setStatus(json);
      if (json.connected) await loadCalendars();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load Google Calendar status.");
    } finally {
      setLoading(false);
    }
  }, [loadCalendars]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function run(kind: "import" | "export") {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      const payload = kind === "import"
        ? { date, calendarId: importCalendar, categoryId }
        : { date, calendarId: exportCalendar };
      const response = await fetch(`/api/google/calendar/${kind}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json() as Record<string, number | string> & { error?: string };
      if (!response.ok) throw new Error(json.error || `Calendar ${kind} failed.`);
      if (kind === "import") {
        setMessage(`Import selesai: ${json.inserted ?? 0} event masuk, ${json.skippedOverlap ?? 0} dilewati karena overlap, ${json.skippedAllDay ?? 0} all-day event dilewati.`);
      } else {
        setMessage(`Export selesai: ${json.created ?? 0} event dibuat, ${json.skippedExisting ?? 0} sudah ada dan tidak diduplikasi.`);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Calendar ${kind} failed.`);
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!window.confirm("Putuskan Google Calendar dari Focus Ledger? Timeline yang sudah diimport tidak akan dihapus.")) return;
    setBusy("disconnect");
    setError(null);
    const response = await fetch("/api/google/calendar/disconnect", { method: "POST" });
    const json = await response.json() as { error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(json.error || "Disconnect failed.");
      return;
    }
    setCalendars([]);
    setStatus((current) => current ? { ...current, connected: false, account: null } : current);
    setMessage("Google Calendar disconnected.");
  }

  if (loading) return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking Google Calendar…</div>;

  if (!status?.configured) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">OAuth credentials belum dipasang di Vercel.</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Tambahkan server-only environment variables <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, dan <code>SUPABASE_SERVICE_ROLE_KEY</code>. Jangan memakai prefix NEXT_PUBLIC untuk secret.</p>
      </div>
    );
  }

  if (!status.connected) {
    return (
      <div className="mt-4 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm font-medium">Google Calendar belum terhubung.</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Focus Ledger meminta akses event read/write dan daftar calendar read-only. Token refresh disimpan server-side.</p>
        <a href="/api/google/calendar/connect" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><CalendarDays className="size-4" /> Connect Google Calendar</a>
      </div>
    );
  }

  const writableCalendars = calendars.filter((calendar) => !["reader", "freeBusyReader"].includes(calendar.accessRole ?? ""));

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/60 p-3">
        <div><p className="text-sm font-medium">Connected{status.account ? ` · ${status.account}` : ""}</p><p className="text-xs text-muted-foreground">Import dan export dijalankan manual agar Timeline tidak berubah diam-diam.</p></div>
        <div className="flex gap-2">
          <button onClick={() => void loadStatus()} className="grid size-9 place-items-center rounded-lg border border-border bg-background" title="Refresh calendars"><RefreshCw className="size-4" /></button>
          <button onClick={() => void disconnect()} disabled={busy === "disconnect"} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium disabled:opacity-50">{busy === "disconnect" ? <Loader2 className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />} Disconnect</button>
        </div>
      </div>

      <label className="mt-4 block text-sm font-medium">Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary" /></label>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2"><Download className="size-4" /><h4 className="text-sm font-semibold">Calendar → Timeline</h4></div>
          <label className="mt-3 block text-xs font-medium">Calendar<select value={importCalendar} onChange={(event) => setImportCalendar(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{calendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " · Primary" : ""}</option>)}</select></label>
          <label className="mt-3 block text-xs font-medium">Import as category<select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Timed events dibulatkan keluar ke grid 15 menit. All-day event dilewati. Event yang membuat lebih dari 2 aktivitas pada slot yang sama juga dilewati.</p>
          <button onClick={() => void run("import")} disabled={busy !== null || !importCalendar || !categoryId} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy === "import" ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Import day</button>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="flex items-center gap-2"><Upload className="size-4" /><h4 className="text-sm font-semibold">Timeline → Calendar</h4></div>
          <label className="mt-3 block text-xs font-medium">Calendar<select value={exportCalendar} onChange={(event) => setExportCalendar(event.target.value)} className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{writableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.summary}{calendar.primary ? " · Primary" : ""}</option>)}</select></label>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Hanya block non-Google yang diexport. Focus Ledger menambahkan fingerprint private pada event agar export yang sama tidak menggandakan event.</p>
          <button onClick={() => void run("export")} disabled={busy !== null || !exportCalendar} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">{busy === "export" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Export day</button>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
      {message ? <p className="mt-3 inline-flex items-start gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="mt-0.5 size-4 shrink-0" /> {message}</p> : null}
    </div>
  );
}
