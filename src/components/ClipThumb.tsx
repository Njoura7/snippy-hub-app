const SEEDS = [
  "oklch(0.86 0.03 258)",
  "oklch(0.88 0.02 150)",
  "oklch(0.87 0.03 60)",
  "oklch(0.85 0.03 20)",
  "oklch(0.88 0.02 300)",
  "oklch(0.86 0.02 200)",
];

export function ClipThumb({
  index,
  label,
  className = "",
}: {
  index: number;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex items-end overflow-hidden rounded-md border border-border ${className}`}
      style={{ backgroundColor: SEEDS[index % SEEDS.length], aspectRatio: "9 / 16" }}
      aria-hidden
    >
      <div className="absolute inset-x-0 bottom-0 p-3">
        {label ? (
          <p className="line-clamp-2 rounded bg-foreground/85 px-2 py-1 text-[11px] font-semibold leading-snug text-background">
            {label}
          </p>
        ) : null}
      </div>
    </div>
  );
}