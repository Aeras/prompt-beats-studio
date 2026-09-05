const BARS = [0.9, 0.5, 0.75, 0.35, 0.95, 0.6, 0.45, 0.8, 0.3, 0.7, 0.55, 0.85];

export function Visualizer({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="flex h-9 items-end gap-[3px] rounded-lg border border-white/10 bg-black/60 px-2 py-1.5 shadow-[inset_0_0_12px_rgba(0,0,0,0.9)]"
    >
      {BARS.map((h, i) => (
        <span
          key={i}
          className="eq-bar w-[3px] rounded-[1px]"
          style={{
            height: `${Math.round(h * 100)}%`,
            background: "linear-gradient(to top, #22c55e 0%, #eab308 62%, #ef4444 100%)",
            boxShadow: "0 0 6px rgba(34,197,94,0.6)",
            animationDelay: `${i * 70}ms`,
            animationDuration: `${700 + (i % 5) * 120}ms`,
            animationPlayState: active ? "running" : "paused",
            opacity: active ? 1 : 0.35,
          }}
        />
      ))}
    </div>
  );
}
