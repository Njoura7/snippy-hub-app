import { SAFE_ZONES, type CaptionPreset, type Platform } from "@/lib/mock-data";

const SEEDS = [
  "oklch(0.86 0.03 258)",
  "oklch(0.88 0.02 150)",
  "oklch(0.87 0.03 60)",
  "oklch(0.85 0.03 20)",
  "oklch(0.88 0.02 300)",
  "oklch(0.86 0.02 200)",
];

const PRESET_CLASS: Record<CaptionPreset, string> = {
  bold: "text-[13px] font-extrabold uppercase tracking-tight",
  minimal: "text-[11px] font-medium tracking-tight",
  karaoke: "text-[12px] font-bold tracking-tight",
};

const COLOR_STYLE: Record<string, string> = {
  white: "bg-foreground/85 text-background",
  yellow: "bg-foreground/85 text-[oklch(0.87_0.17_95)]",
  accent: "bg-accent text-accent-foreground",
};

export function ClipThumb({
  index,
  label,
  className = "",
  platform,
  showSafeZones = false,
  preset = "minimal",
  color = "white",
  position = "bottom",
  size,
  emphasized = [],
}: {
  index: number;
  label?: string;
  className?: string;
  platform?: Platform;
  showSafeZones?: boolean;
  preset?: CaptionPreset;
  color?: string;
  position?: "top" | "middle" | "bottom";
  size?: number;
  emphasized?: number[];
}) {
  const zone = platform ? SAFE_ZONES[platform] : null;
  const align =
    position === "top" ? "items-start" : position === "middle" ? "items-center" : "items-end";

  return (
    <div
      className={`relative flex overflow-hidden rounded-md border border-border ${align} ${className}`}
      style={{ backgroundColor: SEEDS[index % SEEDS.length], aspectRatio: "9 / 16" }}
    >
      {showSafeZones && zone ? (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute right-[6%] rounded-md border border-dashed border-foreground/40"
            style={{ bottom: `${zone.iconColumnBottom}%`, width: "16%", height: `${zone.iconColumnHeight}%` }}
          />
          <div
            className="absolute inset-x-[5%] rounded-md border border-dashed border-foreground/40"
            style={{ bottom: "3%", height: `${zone.captionBar}%` }}
          />
          <div className="absolute inset-x-[5%] top-[3%] h-[7%] rounded-md border border-dashed border-foreground/30" />
        </div>
      ) : null}

      <div className="relative z-10 w-full p-3">
        {label ? (
          <p
            className={`line-clamp-3 rounded px-2 py-1 leading-snug ${PRESET_CLASS[preset]} ${
              COLOR_STYLE[color] ?? COLOR_STYLE['white']
            }`}
            style={size ? { fontSize: `${Math.round(size * 0.42)}px` } : undefined}
          >
            {label.split(/\s+/).map((word, i) => (
              <span
                key={`${word}-${i}`}
                className={
                  emphasized.includes(i)
                    ? preset === "karaoke"
                      ? "rounded bg-accent px-1 text-accent-foreground"
                      : "text-[oklch(0.87_0.17_95)]"
                    : ""
                }
              >
                {word}{" "}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {showSafeZones && zone ? (
        <span className="absolute left-2 top-2 z-10 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-medium">
          {zone.label}
        </span>
      ) : null}
    </div>
  );
}
