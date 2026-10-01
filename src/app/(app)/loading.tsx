export default function AppLoading() {
  return (
    <div className="mx-auto max-w-7xl animate-pulse px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="mt-3 h-8 w-64 rounded bg-muted" />
      <div className="mt-3 h-4 w-full max-w-xl rounded bg-muted" />
      <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 rounded-xl border border-border bg-card" />)}
      </div>
      <div className="mt-6 h-72 rounded-xl border border-border bg-card" />
    </div>
  );
}
