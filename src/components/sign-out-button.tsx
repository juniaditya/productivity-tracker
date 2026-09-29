"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/auth/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      disabled={loading}
      className="mt-2 inline-flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"
    >
      <LogOut className="size-3.5" /> {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
