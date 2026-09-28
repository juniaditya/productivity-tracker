"use client";

import { LockKeyhole, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!configured) return;
    setLoading(true);
    setError("");
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required disabled={!configured} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" placeholder="you@example.com" />
      </label>
      <label className="block text-sm font-medium">Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required disabled={!configured} className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 outline-none focus:border-primary" placeholder="••••••••" />
      </label>
      {error ? <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-300">{error}</p> : null}
      <button disabled={!configured || loading} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? <LockKeyhole className="size-4 animate-pulse" /> : <LogIn className="size-4" />} {loading ? "Signing in..." : "Sign in"}
      </button>
      {!configured ? <p className="text-center text-xs leading-5 text-muted-foreground">Supabase environment variables are not configured yet. The main app remains available in demo mode until they are added.</p> : null}
    </form>
  );
}
