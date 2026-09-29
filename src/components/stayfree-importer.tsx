"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ImportBatch } from "@/lib/types";

type Mapping = {
  date: string;
  duration: string;
  app: string;
  device: string;
  domain: string;
};

type DurationUnit = "auto" | "seconds" | "minutes" | "milliseconds";

type Props = {
  initialBatches: ImportBatch[];
};

type NormalizedRow = {
  usage_date: string;
  device: string;
  app_name: string;
  domain: string;
  duration_seconds: number;
  source_row_hash: string;
  raw_payload: Record<string, string>;
};

function detectDelimiter(line: string) {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const delimiter of candidates) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      else if (!quoted && line[i] === delimiter) count++;
    }
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
    }
  }
  return best;
}

function parseCsv(text: string) {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        field += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function findHeader(headers: string[], patterns: RegExp[]) {
  return headers.find((header) => patterns.some((pattern) => pattern.test(normalizedHeader(header)))) ?? "";
}

function suggestMapping(headers: string[]): Mapping {
  return {
    date: findHeader(headers, [/^date$/, /tanggal/, /day/, /usage date/]),
    duration: findHeader(headers, [/duration/, /usage time/, /screen time/, /waktu/, /time spent/]),
    app: findHeader(headers, [/^app$/, /application/, /package/, /app name/]),
    device: findHeader(headers, [/device/, /perangkat/, /platform/]),
    domain: findHeader(headers, [/domain/, /website/, /^url$/, /site/]),
  };
}

function parseDateValue(value: string) {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return null;
}

function parseDurationSeconds(value: string, unit: DurationUnit) {
  const raw = value.trim().toLowerCase();
  if (!raw) return null;

  const colon = raw.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    if (colon[3] !== undefined) return Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
    return Number(colon[1]) * 60 + Number(colon[2]);
  }

  if (/[hms]/.test(raw)) {
    const hours = Number(raw.match(/([\d.]+)\s*h/)?.[1] ?? 0);
    const minutes = Number(raw.match(/([\d.]+)\s*m(?!s)/)?.[1] ?? 0);
    const seconds = Number(raw.match(/([\d.]+)\s*s/)?.[1] ?? 0);
    const total = Math.round(hours * 3600 + minutes * 60 + seconds);
    return Number.isFinite(total) ? total : null;
  }

  const numeric = Number(raw.replace(/,/g, "."));
  if (!Number.isFinite(numeric)) return null;
  if (unit === "milliseconds") return Math.round(numeric / 1000);
  if (unit === "minutes") return Math.round(numeric * 60);
  if (unit === "seconds") return Math.round(numeric);
  // Auto treats plain numerics as seconds; the preview makes this explicit before import.
  return Math.round(numeric);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function StayFreeImporter({ initialBatches }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({ date: "", duration: "", app: "", device: "", domain: "" });
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("auto");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const headerIndex = useMemo(() => new Map(headers.map((header, index) => [header, index])), [headers]);

  const preview = useMemo(() => {
    if (!mapping.date || !mapping.duration) return [];
    return rows.slice(0, 5).map((row) => ({
      date: parseDateValue(row[headerIndex.get(mapping.date) ?? -1] ?? ""),
      duration: parseDurationSeconds(row[headerIndex.get(mapping.duration) ?? -1] ?? "", durationUnit),
      app: mapping.app ? row[headerIndex.get(mapping.app) ?? -1] ?? "" : "",
      device: mapping.device ? row[headerIndex.get(mapping.device) ?? -1] ?? "" : "",
      domain: mapping.domain ? row[headerIndex.get(mapping.domain) ?? -1] ?? "" : "",
    }));
  }, [durationUnit, headerIndex, mapping, rows]);

  async function chooseFile(nextFile: File | null) {
    setError(null);
    setMessage(null);
    setFile(nextFile);
    if (!nextFile) {
      setHeaders([]);
      setRows([]);
      return;
    }
    const text = await nextFile.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      setError("CSV tidak memiliki header + data yang cukup.");
      return;
    }
    const [nextHeaders, ...nextRows] = parsed;
    const cleanHeaders = nextHeaders.map((header, index) => header || `Column ${index + 1}`);
    setHeaders(cleanHeaders);
    setRows(nextRows.slice(0, 10000));
    setMapping(suggestMapping(cleanHeaders));
    if (nextRows.length > 10000) setMessage("V2 membatasi satu import ke 10.000 row pertama agar request tetap aman.");
  }

  async function importRows() {
    if (!file || !mapping.date || !mapping.duration) {
      setError("Pilih kolom Date dan Duration terlebih dahulu.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const fileText = await file.text();
      const fileHash = await sha256(fileText);
      const dateIndex = headerIndex.get(mapping.date) ?? -1;
      const durationIndex = headerIndex.get(mapping.duration) ?? -1;
      const appIndex = mapping.app ? (headerIndex.get(mapping.app) ?? -1) : -1;
      const deviceIndex = mapping.device ? (headerIndex.get(mapping.device) ?? -1) : -1;
      const domainIndex = mapping.domain ? (headerIndex.get(mapping.domain) ?? -1) : -1;

      const prepared: NormalizedRow[] = [];
      let invalid = 0;

      for (const row of rows) {
        const usageDate = parseDateValue(row[dateIndex] ?? "");
        const durationSeconds = parseDurationSeconds(row[durationIndex] ?? "", durationUnit);
        if (!usageDate || durationSeconds === null || durationSeconds < 0 || durationSeconds > 86400) {
          invalid++;
          continue;
        }
        const device = deviceIndex >= 0 ? (row[deviceIndex] ?? "") : "";
        const appName = appIndex >= 0 ? (row[appIndex] ?? "") : "";
        const domain = domainIndex >= 0 ? (row[domainIndex] ?? "") : "";
        const rawPayload = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]));
        const rowHash = await sha256([usageDate, device, appName, domain, durationSeconds].join("|"));
        prepared.push({ usage_date: usageDate, device, app_name: appName, domain, duration_seconds: durationSeconds, source_row_hash: rowHash, raw_payload: rawPayload });
      }

      if (!prepared.length) {
        setError("Tidak ada row valid. Cek mapping tanggal dan satuan duration pada preview.");
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { data, error: importError } = await supabase.rpc("import_stayfree_rows", {
        p_file_name: file.name,
        p_file_hash: fileHash,
        p_rows: prepared,
      });
      if (importError) throw importError;

      const result = Array.isArray(data) ? data[0] : data;
      if (result?.duplicate_file) setMessage("File yang sama sudah pernah diimport. Tidak ada data duplikat yang ditambahkan.");
      else setMessage(`${result?.inserted_count ?? prepared.length} row baru masuk${invalid ? ` · ${invalid} row invalid dilewati` : ""}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import gagal.");
    } finally {
      setLoading(false);
    }
  }

  function selectField(label: string, value: string, onChange: (value: string) => void, required = false) {
    return (
      <label className="text-xs font-medium text-muted-foreground">
        {label}{required ? " *" : ""}
        <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-primary">
          <option value="">— none —</option>
          {headers.map((header) => <option key={header} value={header}>{header}</option>)}
        </select>
      </label>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="text-sm font-semibold">StayFree CSV importer</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Upload export StayFree, map kolomnya, cek preview, lalu import. Exact file dan row overlap dideduplikasi.</p></div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background"><UploadCloud className="size-4" /> Select CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} /></label>
      </div>

      {error ? <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}
      {message ? <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" /> {message}</div> : null}

      {file ? (
        <div className="rounded-xl border border-border bg-muted/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{file.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{rows.length.toLocaleString("id-ID")} rows loaded</p></div><button onClick={() => void chooseFile(file)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"><RefreshCw className="size-3.5" /> Re-read</button></div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {selectField("Date", mapping.date, (value) => setMapping((current) => ({ ...current, date: value })), true)}
            {selectField("Duration", mapping.duration, (value) => setMapping((current) => ({ ...current, duration: value })), true)}
            <label className="text-xs font-medium text-muted-foreground">Duration unit<select value={durationUnit} onChange={(event) => setDurationUnit(event.target.value as DurationUnit)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground"><option value="auto">Auto / time text</option><option value="seconds">Numeric = seconds</option><option value="minutes">Numeric = minutes</option><option value="milliseconds">Numeric = milliseconds</option></select></label>
            {selectField("App", mapping.app, (value) => setMapping((current) => ({ ...current, app: value })))}
            {selectField("Device", mapping.device, (value) => setMapping((current) => ({ ...current, device: value })))}
            {selectField("Domain", mapping.domain, (value) => setMapping((current) => ({ ...current, domain: value })))}
          </div>

          {preview.length ? <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-background"><table className="min-w-full text-left text-xs"><thead className="border-b border-border bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">App</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Domain</th></tr></thead><tbody>{preview.map((item, index) => <tr key={index} className="border-b border-border/60 last:border-0"><td className={`px-3 py-2 font-mono ${item.date ? "" : "text-rose-500"}`}>{item.date ?? "invalid"}</td><td className={`px-3 py-2 font-mono ${item.duration !== null ? "" : "text-rose-500"}`}>{item.duration !== null ? `${item.duration}s` : "invalid"}</td><td className="px-3 py-2">{item.app || "—"}</td><td className="px-3 py-2">{item.device || "—"}</td><td className="px-3 py-2">{item.domain || "—"}</td></tr>)}</tbody></table></div> : null}

          <button onClick={() => void importRows()} disabled={loading || !mapping.date || !mapping.duration} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}{loading ? "Importing…" : "Import mapped CSV"}</button>
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center justify-between"><h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent imports</h4><span className="text-[10px] text-muted-foreground">latest 5</span></div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {initialBatches.length ? initialBatches.slice(0, 5).map((batch) => <div key={batch.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><div className="min-w-0"><p className="truncate font-medium">{batch.file_name || "StayFree CSV"}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.imported_at))}</p></div><span className="font-mono text-xs text-muted-foreground">{batch.row_count} rows</span></div>) : <p className="px-3 py-3 text-sm text-muted-foreground">Belum ada import.</p>}
        </div>
      </div>
    </div>
  );
}
