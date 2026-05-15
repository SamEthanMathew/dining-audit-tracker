import { gradeColor } from "../lib/grades";

export default function GradeBadge({ grade }: { grade: string | null | undefined }) {
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full border font-bold text-sm ${gradeColor(grade)}`}>
      {grade ?? "?"}
    </span>
  );
}
