import { supabase } from "./supabase";

const LABELS: Record<string, string> = {
  after_breakfast: "After Breakfast",
  after_lunch: "After Lunch",
  after_dinner: "After Dinner",
  mid_morning: "Mid-Morning",
  mid_afternoon: "Mid-Afternoon",
};

export async function getRecommendedWindow(locationId: string): Promise<string> {
  const { data } = await supabase.rpc("recommended_audit_window", { loc: locationId });
  return labelFor((data as unknown as string) ?? "after_lunch");
}

export function labelFor(key: string): string {
  return LABELS[key] ?? key;
}
