import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  await supabase.rpc("ensure_personal_defaults");
  return <AppShell>{children}</AppShell>;
}
