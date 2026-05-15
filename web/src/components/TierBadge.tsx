import { tierStyle } from "../lib/grades";

export default function TierBadge({ tier, size = "md" }: { tier: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const s = tierStyle(tier);
  const sz =
    size === "sm" ? "px-2 py-0.5 text-xs"
    : size === "lg" ? "px-4 py-2 text-lg"
    : "px-3 py-1 text-sm";
  return (
    <span className={`inline-flex items-center rounded-full ring-1 font-semibold uppercase tracking-wide ${sz} ${s.bg} ${s.text} ${s.ring}`}>
      {s.label}
    </span>
  );
}
