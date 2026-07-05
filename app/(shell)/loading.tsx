// Shared skeleton for every shell route (route-group loading.tsx): shown
// instantly while server components fetch. Mirrors the common page shape —
// title line, stat/filter band, then list rows — with a soft pulse. Never a
// spinner on a full page (DESIGN_BRIEF §6).
export default function ShellLoading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-6 py-8" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-3 w-40 rounded-sm bg-surface-2" />
      <div className="mb-6 h-5 w-72 rounded-sm bg-surface-2" />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 border border-hairline bg-surface p-4">
            <div className="mb-2 h-2.5 w-24 rounded-sm bg-surface-2" />
            <div className="h-5 w-32 rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>
      <div className="border border-hairline bg-surface">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4 border-b border-hairline px-3 py-3 last:border-b-0">
            <div className="h-3 w-16 rounded-sm bg-surface-2" />
            <div className="h-3 flex-1 rounded-sm bg-surface-2" />
            <div className="h-3 w-24 rounded-sm bg-surface-2" />
            <div className="h-3 w-16 rounded-sm bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
