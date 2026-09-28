import { DemoBadge } from "@/components/demo-badge";
import { PageHeader } from "@/components/page-header";
import { TimelineEditor } from "@/components/timeline-editor";

export default function TimelinePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow="Timeline"
        title="Where did the day go?"
        description="Rencanakan atau catat aktivitas aktual dalam resolusi 15 menit. Dua aktivitas boleh overlap pada waktu yang sama."
        action={<DemoBadge />}
      />
      <div className="mt-6"><TimelineEditor /></div>
    </div>
  );
}
