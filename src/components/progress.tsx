export function Progress({ value, className = "" }: { value: number; className?: string }) {
  const safe = Math.min(100, Math.max(0, value));
  return (
    <div className={`h-2 overflow-hidden rounded-full bg-muted ${className}`}>
      <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${safe}%` }} />
    </div>
  );
}
