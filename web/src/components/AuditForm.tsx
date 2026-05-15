import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import type { Location } from "../lib/api";
import { listLocations } from "../lib/api";

const streamSchema = (foodPresent = false) => z.object({
  total: z.coerce.number().min(0),
  contamination: z.coerce.number().min(0),
  notes: z.string().optional(),
  food_present: z.boolean().optional(),
}).refine((v) => v.contamination <= v.total, {
  message: "Contamination cannot exceed total",
  path: ["contamination"],
});

const schema = z.object({
  location_id: z.string().uuid("Select a location"),
  audit_date: z.string().min(1),
  landfill: streamSchema(),
  bottles_cans: streamSchema(true),
  compost: streamSchema(),
  cardboard: streamSchema(),
  general_comments: z.string().optional(),
});

export type AuditFormValues = z.infer<typeof schema>;

export type AuditFormProps = {
  defaultLocationId?: string;
  lockLocation?: boolean;
  onSubmit: (values: AuditFormValues) => Promise<void>;
};

export default function AuditForm({ defaultLocationId, lockLocation, onSubmit }: AuditFormProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register, handleSubmit, formState: { errors }, watch, reset,
  } = useForm<AuditFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      location_id: defaultLocationId ?? "",
      audit_date: new Date().toISOString().slice(0, 10),
      landfill: { total: 0, contamination: 0, notes: "" },
      bottles_cans: { total: 0, contamination: 0, notes: "", food_present: false },
      compost: { total: 0, contamination: 0, notes: "" },
      cardboard: { total: 0, contamination: 0, notes: "" },
      general_comments: "",
    },
  });

  useEffect(() => {
    listLocations().then(setLocations).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (defaultLocationId) reset((prev) => ({ ...prev, location_id: defaultLocationId }));
  }, [defaultLocationId, reset]);

  const submit = handleSubmit(async (values) => {
    setSubmitting(true);
    setError(null);
    try { await onSubmit(values); }
    catch (e: any) { setError(e.message ?? "Submit failed"); }
    finally { setSubmitting(false); }
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Location</label>
            <select className="input" {...register("location_id")} disabled={lockLocation}>
              <option value="">Select…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {errors.location_id && <p className="text-red-600 text-xs mt-1">{errors.location_id.message}</p>}
          </div>
          <div>
            <label className="label">Audit Date (week of)</label>
            <input type="date" className="input" {...register("audit_date")} />
          </div>
        </div>
      </div>

      <StreamCard
        title="Landfill"
        prefix="landfill"
        register={register}
        errors={errors.landfill}
        watch={watch}
        hint="Anything in the landfill bin that should have been recycled, composted, or cardboard counts as contamination."
      />
      <StreamCard
        title="Bottles & Cans"
        prefix="bottles_cans"
        register={register}
        errors={errors.bottles_cans}
        watch={watch}
        foodPresentCheckbox
      />
      <StreamCard
        title="Compost"
        prefix="compost"
        register={register}
        errors={errors.compost}
        watch={watch}
      />
      <StreamCard
        title="Cardboard"
        prefix="cardboard"
        register={register}
        errors={errors.cardboard}
        watch={watch}
        hint="Strict mode: any non-cardboard contamination fails the stream."
      />

      <div className="card p-5">
        <label className="label">General comments (optional)</label>
        <textarea rows={3} className="input" {...register("general_comments")} />
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">{error}</div>}

      <div className="flex justify-end">
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit audit"}
        </button>
      </div>
    </form>
  );
}

function StreamCard({
  title, prefix, register, errors, watch, hint, foodPresentCheckbox,
}: {
  title: string;
  prefix: "landfill" | "bottles_cans" | "compost" | "cardboard";
  register: any;
  errors: any;
  watch: any;
  hint?: string;
  foodPresentCheckbox?: boolean;
}) {
  const total = watch(`${prefix}.total`) || 0;
  const contam = watch(`${prefix}.contamination`) || 0;
  const pct = total > 0 ? ((contam / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
        <span className="text-sm text-slate-500">{pct}% contamination</span>
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Total {`(count/weight)`}</label>
          <input type="number" min="0" step="0.01" className="input" {...register(`${prefix}.total`)} />
        </div>
        <div>
          <label className="label">Contamination</label>
          <input type="number" min="0" step="0.01" className="input" {...register(`${prefix}.contamination`)} />
          {errors?.contamination && <p className="text-red-600 text-xs mt-1">{errors.contamination.message}</p>}
        </div>
      </div>
      {foodPresentCheckbox && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register(`${prefix}.food_present`)} />
          Food residue present in this bin (hard fail)
        </label>
      )}
      <div>
        <label className="label">Notes (optional)</label>
        <input className="input" {...register(`${prefix}.notes`)} />
      </div>
    </div>
  );
}
