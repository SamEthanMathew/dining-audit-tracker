import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect, useState } from "react";
import type { Location, SubmitAuditPayload } from "../lib/api";
import { listLocations } from "../lib/api";

const streamSchema = z.object({
  total: z.coerce.number().min(0),
  contamination: z.coerce.number().min(0),
  additional_description: z.string().optional(),
  food_present: z.boolean().optional(),
}).refine((v) => v.contamination <= v.total, {
  message: "Contamination cannot exceed total",
  path: ["contamination"],
});

const schema = z.object({
  location_id: z.string().uuid("Select a location"),
  audit_date: z.string().min(1),
  submitter_name: z.string().min(1, "Your name is required"),
  is_sustainability_champion: z.boolean().optional(),
  done_by_dining_team: z.boolean().optional(),
  landfill:     streamSchema,
  bottles_cans: streamSchema,
  compost:      streamSchema,
  cardboard:    streamSchema,
  general_comments: z.string().optional(),
});

export type DetailedFormValues = z.infer<typeof schema>;

export type DetailedAuditFormProps = {
  defaultLocationId?: string;
  lockLocation?: boolean;
  isAdmin?: boolean;
  defaultSubmitterName?: string;
  onSubmit: (payload: SubmitAuditPayload) => Promise<void>;
};

export default function DetailedAuditForm({
  defaultLocationId, lockLocation, isAdmin, defaultSubmitterName, onSubmit,
}: DetailedAuditFormProps) {
  const [locations, setLocations] = useState<Location[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { register, handleSubmit, formState: { errors }, watch, reset } = useForm<DetailedFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      location_id: defaultLocationId ?? "",
      audit_date: new Date().toISOString().slice(0, 10),
      submitter_name: defaultSubmitterName ?? "",
      is_sustainability_champion: false,
      done_by_dining_team: false,
      landfill:     { total: 0, contamination: 0, additional_description: "" },
      bottles_cans: { total: 0, contamination: 0, additional_description: "", food_present: false },
      compost:      { total: 0, contamination: 0, additional_description: "" },
      cardboard:    { total: 0, contamination: 0, additional_description: "" },
      general_comments: "",
    },
  });

  useEffect(() => { listLocations().then(setLocations).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (defaultLocationId) reset((prev) => ({ ...prev, location_id: defaultLocationId }));
  }, [defaultLocationId, reset]);

  const submit = handleSubmit(async (v) => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: SubmitAuditPayload = {
        audit_form_mode: "detailed",
        location_id: v.location_id,
        audit_date: v.audit_date,
        submitter_name: v.submitter_name,
        is_sustainability_champion: !!v.is_sustainability_champion,
        done_by_dining_team: !!v.done_by_dining_team,
        landfill_total: Number(v.landfill.total),
        landfill_contamination: Number(v.landfill.contamination),
        landfill_additional_description: v.landfill.additional_description,
        bottles_cans_total: Number(v.bottles_cans.total),
        bottles_cans_contamination: Number(v.bottles_cans.contamination),
        bottles_cans_food_present: !!v.bottles_cans.food_present,
        bottles_cans_additional_description: v.bottles_cans.additional_description,
        compost_total: Number(v.compost.total),
        compost_contamination: Number(v.compost.contamination),
        compost_additional_description: v.compost.additional_description,
        cardboard_total: Number(v.cardboard.total),
        cardboard_contamination: Number(v.cardboard.contamination),
        cardboard_additional_description: v.cardboard.additional_description,
        general_comments: v.general_comments,
      };
      await onSubmit(payload);
    } catch (e: any) {
      setError(e.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  });

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 text-sm">
        <strong>Heads up:</strong> this audit is for <em>back-of-house</em> dustbins only — not customer-facing bins.
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Location</label>
            <select className="input" {...register("location_id")} disabled={lockLocation}>
              <option value="">Select…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {errors.location_id && <p className="text-red-600 text-xs mt-1">{errors.location_id.message}</p>}
          </div>
          <div>
            <label className="label">Audit Date (week of)</label>
            <input type="date" className="input" {...register("audit_date")} />
          </div>
          <div>
            <label className="label">Your name</label>
            <input className="input" placeholder="First and last" {...register("submitter_name")} />
            {errors.submitter_name && <p className="text-red-600 text-xs mt-1">{errors.submitter_name.message}</p>}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("is_sustainability_champion")} />
          I'm the sustainability champion for this location.
        </label>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register("done_by_dining_team")} />
            This audit is performed by the Dining &amp; Sustainability team.
          </label>
        )}
      </div>

      <StreamCard title="Landfill"       prefix="landfill"     register={register} errors={errors.landfill}     watch={watch}
        hint="Anything in the landfill bin that should have been recycled, composted, or cardboard counts as contamination." />
      <StreamCard title="Bottles & Cans" prefix="bottles_cans" register={register} errors={errors.bottles_cans} watch={watch}
        foodPresentCheckbox />
      <StreamCard title="Compost"        prefix="compost"      register={register} errors={errors.compost}      watch={watch} />
      <StreamCard title="Cardboard"      prefix="cardboard"    register={register} errors={errors.cardboard}    watch={watch}
        hint="Strict mode: any non-cardboard contamination fails the stream." />

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
        <label className="label">Additional Description (optional)</label>
        <input className="input" {...register(`${prefix}.additional_description`)} />
      </div>
    </div>
  );
}
