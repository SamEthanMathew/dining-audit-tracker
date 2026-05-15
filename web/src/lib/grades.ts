export type Letter = "A" | "B" | "C" | "D" | "F";
export type Tier = "platinum" | "gold" | "silver" | "bronze" | "unrated";

export function gradeColor(g: Letter | string | null | undefined) {
  switch (g) {
    case "A": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "B": return "bg-lime-100 text-lime-800 border-lime-200";
    case "C": return "bg-amber-100 text-amber-800 border-amber-200";
    case "D": return "bg-orange-100 text-orange-800 border-orange-200";
    case "F": return "bg-red-100 text-red-800 border-red-200";
    default:  return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function tierStyle(t: Tier | string | null | undefined) {
  switch (t) {
    case "platinum": return { bg: "bg-slate-200", text: "text-slate-900",   ring: "ring-slate-400", label: "Platinum" };
    case "gold":     return { bg: "bg-yellow-200", text: "text-yellow-900", ring: "ring-yellow-400", label: "Gold" };
    case "silver":   return { bg: "bg-slate-100", text: "text-slate-800",   ring: "ring-slate-300", label: "Silver" };
    case "bronze":   return { bg: "bg-orange-200", text: "text-orange-900", ring: "ring-orange-400", label: "Bronze" };
    default:         return { bg: "bg-slate-50", text: "text-slate-500",    ring: "ring-slate-200", label: "Unrated" };
  }
}

export const STREAM_LABELS: Record<string, string> = {
  landfill: "Landfill",
  bottles_cans: "Bottles & Cans",
  compost: "Compost",
  cardboard: "Cardboard",
};
