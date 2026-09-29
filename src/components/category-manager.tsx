"use client";

import { Archive, Loader2, Pencil, Plus, RotateCcw, Save, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { colorPresets } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import type { Category, CategoryClassification } from "@/lib/types";

type Props = {
  userId: string;
  initialCategories: Category[];
};

type Draft = {
  name: string;
  color: string;
  classification: CategoryClassification;
};

const classificationOptions: Array<{ value: CategoryClassification; label: string }> = [
  { value: "productive", label: "Productive" },
  { value: "recovery", label: "Recovery" },
  { value: "leisure", label: "Leisure" },
  { value: "distraction", label: "Distraction" },
  { value: "neutral", label: "Neutral" },
];

export function CategoryManager({ userId, initialCategories }: Props) {
  const [categories, setCategories] = useState(initialCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ name: "", color: colorPresets[0], classification: "neutral" });

  function addMode() {
    setEditingId(null);
    setShowAdd(true);
    setDraft({ name: "", color: colorPresets[0], classification: "neutral" });
  }

  function editMode(category: Category) {
    setShowAdd(false);
    setEditingId(category.id);
    setDraft({ name: category.name, color: category.color, classification: category.classification });
  }

  async function saveCategory(event: FormEvent) {
    event.preventDefault();
    if (!draft.name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (editingId) {
      const { data, error: updateError } = await supabase
        .from("categories")
        .update({
          name: draft.name.trim(),
          color: draft.color,
          classification: draft.classification,
        })
        .eq("id", editingId)
        .select("id,user_id,name,color,classification,sort_order,is_active")
        .single();
      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }
      setCategories((current) => current.map((item) => (item.id === editingId ? (data as Category) : item)));
    } else {
      const { data, error: insertError } = await supabase
        .from("categories")
        .insert({
          user_id: userId,
          name: draft.name.trim(),
          color: draft.color,
          classification: draft.classification,
          sort_order: (categories.length + 1) * 10,
          is_active: true,
        })
        .select("id,user_id,name,color,classification,sort_order,is_active")
        .single();
      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }
      setCategories((current) => [...current, data as Category]);
    }

    setSaving(false);
    setEditingId(null);
    setShowAdd(false);
  }

  async function setActive(category: Category, active: boolean) {
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("categories")
      .update({ is_active: active })
      .eq("id", category.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setCategories((current) => current.map((item) => (item.id === category.id ? { ...item, is_active: active } : item)));
  }

  const editorVisible = showAdd || editingId;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">Activity categories</h2>
          <p className="mt-1 text-sm text-muted-foreground">Satu level kategori. Warna dan klasifikasi dipakai Timeline serta Insights.</p>
        </div>
        <button onClick={addMode} className="inline-flex items-center justify-center gap-2 rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background"><Plus className="size-4" /> Add category</button>
      </div>

      {error ? <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</div> : null}

      {editorVisible ? (
        <form onSubmit={saveCategory} className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">{editingId ? "Edit category" : "New category"}</h3><button type="button" onClick={() => { setEditingId(null); setShowAdd(false); }} className="grid size-8 place-items-center rounded-lg hover:bg-muted"><X className="size-4" /></button></div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="text-sm font-medium">Name<input required maxLength={40} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" /></label>
            <label className="text-sm font-medium">Classification<select value={draft.classification} onChange={(e) => setDraft((d) => ({ ...d, classification: e.target.value as CategoryClassification }))} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary">{classificationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </div>
          <div className="mt-4"><p className="text-sm font-medium">Preset color</p><div className="mt-2 flex flex-wrap gap-2">{colorPresets.map((color) => <button key={color} type="button" onClick={() => setDraft((d) => ({ ...d, color }))} className={`size-8 rounded-lg border-2 ${draft.color === color ? "border-foreground" : "border-transparent"}`} style={{ background: color }} aria-label={`Color ${color}`} />)}</div></div>
          <button disabled={saving} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save category</button>
        </form>
      ) : null}

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {[...categories].sort((a, b) => a.sort_order - b.sort_order).map((category) => (
          <div key={category.id} className={`rounded-lg border border-border px-3 py-3 ${category.is_active ? "bg-background" : "bg-muted/40 opacity-70"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5"><span className="size-3 shrink-0 rounded-full" style={{ background: category.color }} /><div className="min-w-0"><p className="truncate text-sm font-medium">{category.name}</p><p className="mt-0.5 text-[10px] capitalize text-muted-foreground">{category.classification} · {category.is_active ? "active" : "archived"}</p></div></div>
              <div className="flex items-center gap-1">
                <button onClick={() => editMode(category)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${category.name}`}><Pencil className="size-3.5" /></button>
                {category.is_active ? <button onClick={() => setActive(category, false)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Archive ${category.name}`}><Archive className="size-3.5" /></button> : <button onClick={() => setActive(category, true)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Restore ${category.name}`}><RotateCcw className="size-3.5" /></button>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
