/** Nahayat logo lockup — navy rounded tile with white "N" + wordmark. */
export function Brand({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink-900 shadow-sm">
        <span className="font-sans text-lg font-extrabold leading-none text-white">N</span>
      </div>
      <div>
        <div className="font-sans text-xl font-extrabold tracking-tight text-ink-900">
          Nahayat <span className="font-semibold text-ink-500">Pentest</span>
        </div>
        {tagline && (
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-400">
            AI-gedreven security testing
          </div>
        )}
      </div>
    </div>
  );
}
