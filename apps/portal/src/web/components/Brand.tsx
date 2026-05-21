export function Brand({ tagline = true }: { tagline?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-gold shadow-glow">
        <span className="text-lg font-bold text-onyx">N</span>
      </div>
      <div>
        <div className="bg-gradient-text bg-clip-text font-display text-xl font-extrabold text-transparent">
          Nahayat Pentest
        </div>
        {tagline && (
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            AI-driven application security
          </div>
        )}
      </div>
    </div>
  );
}
