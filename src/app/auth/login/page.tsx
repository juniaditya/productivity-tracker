import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function LoginPage() {
  const configured = isSupabaseConfigured();
  return (
    <main className="grid min-h-svh place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[0_16px_50px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">FL</div>
          <div><h1 className="font-semibold tracking-tight">{APP_NAME}</h1><p className="text-xs text-muted-foreground">Private productivity database</p></div>
        </div>
        <div className="mt-6"><h2 className="text-xl font-semibold">Sign in</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Personal access only. Data access will be protected with Supabase Auth + Row Level Security.</p></div>
        <LoginForm configured={configured} />
        {!configured ? <Link href="/" className="mt-4 block text-center text-sm font-medium text-primary hover:underline">Continue to demo dashboard</Link> : null}
      </section>
    </main>
  );
}
