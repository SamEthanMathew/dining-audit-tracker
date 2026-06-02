import { useEffect, useState } from "react";
import type { Audit, AuditPhoto, Location } from "../lib/api";
import { listAuditPhotos } from "../lib/api";
import { getPhotoUrl } from "../lib/photos";
import GradeBadge from "./GradeBadge";

type Stream = "landfill" | "bottles_cans" | "compost" | "cardboard";

const STREAM_LABEL: Record<Stream, string> = {
  landfill: "Landfill",
  bottles_cans: "Bottles & Cans",
  compost: "Compost",
  cardboard: "Cardboard",
};

const SIMPLE_QUESTION_LABEL: Record<Stream, Record<string, string>> = {
  landfill: {
    sees_compost: "Sees compost in this bin",
    sees_bottles_cans: "Sees bottles/cans in this bin",
    sees_cardboard: "Sees cardboard in this bin",
  },
  bottles_cans: {
    sees_food: "Food residue in bin",
    sees_paper: "Paper / coffee cups in bin",
    sees_landfill: "Landfill items in bin",
  },
  compost: {
    sees_plastic: "Plastic in bin",
    sees_metal: "Metal in bin",
    sees_paper_non_compostable: "Non-compostable paper in bin",
  },
  cardboard: {
    sees_non_cardboard: "Non-cardboard material in bin",
  },
};

export default function AuditDetailView({ audit, location }: { audit: Audit; location?: Location | null }) {
  const grades = (audit.computed_grades ?? {}) as Record<string, string>;
  const simple = (audit.simple_responses ?? {}) as Record<string, Record<string, boolean>>;
  const isSimple = audit.audit_form_mode === "simple";
  const [photos, setPhotos] = useState<AuditPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listAuditPhotos(audit.id)
      .then(async (rows) => {
        if (!active) return;
        setPhotos(rows);
        const urls: Record<string, string> = {};
        await Promise.all(rows.map(async (r) => {
          const u = await getPhotoUrl(r.storage_path);
          if (u) urls[r.id] = u;
        }));
        if (active) setPhotoUrls(urls);
      })
      .catch((e) => { if (active) setPhotoErr(e.message); });
    return () => { active = false; };
  }, [audit.id]);

  const photosByStream: Record<Stream, AuditPhoto[]> = {
    landfill: [], bottles_cans: [], compost: [], cardboard: [],
  };
  for (const p of photos) (photosByStream[p.stream as Stream] ??= []).push(p);

  return (
    <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">
            {location?.name ?? "—"} <span className="font-normal text-slate-500">· {audit.audit_date}</span>
          </h2>
          <div className="text-right">
            <div className="text-2xl font-bold">{audit.computed_score?.toFixed(1) ?? "—"}</div>
            <div className="text-xs text-slate-500">overall (0–100)</div>
          </div>
        </div>
        <div className="text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
          <span>Submitted by <strong>{audit.submitter_name || "(no name)"}</strong></span>
          <span className="text-slate-400">·</span>
          <span>{audit.audit_form_mode} mode</span>
          <span className="text-slate-400">·</span>
          <span>role: {audit.submitted_by_role}</span>
          {audit.is_sustainability_champion && (
            <><span className="text-slate-400">·</span><span className="text-emerald-700">sustainability champion</span></>
          )}
          {audit.done_by_dining_team && (
            <><span className="text-slate-400">·</span><span className="text-cmu">Dining &amp; Sustainability team audit</span></>
          )}
        </div>
        {audit.nullified && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded px-3 py-2 text-sm">
            <strong>Nullified.</strong> {audit.nullified_reason}
          </div>
        )}
      </header>

      {photoErr && <p className="text-xs text-red-700">Photo load error: {photoErr}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(["landfill", "bottles_cans", "compost", "cardboard"] as Stream[]).map((s) => (
          <StreamCard
            key={s}
            stream={s}
            audit={audit}
            grade={grades[s]}
            simple={simple[s] ?? {}}
            isSimple={isSimple}
            photos={photosByStream[s]}
            photoUrls={photoUrls}
          />
        ))}
      </div>

      {isSimple && (
        <div className="card p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>Cardboard sent to the baler</span>
            <strong>{audit.cardboard_to_baler === null ? "—" : audit.cardboard_to_baler ? "Yes" : "No"}</strong>
          </div>
        </div>
      )}

      {hasAnySurvey(audit) && (
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold text-sm">Sustainability programs</h3>
          <SurveyRow label="Donates to Forinto food rescue" v={audit.donates_forinto} />
          <SurveyRow label="Donates to CMU Food Pantry"     v={audit.donates_cmu_food_pantry} />
          <SurveyRow label="Reuse program at this location" v={audit.reuse_program} />
          <SurveyRow label="Energy conservation plan"        v={audit.energy_conservation_plan} />
          <SurveyRow label="Water conservation plan"         v={audit.water_conservation_plan} />
          {audit.sustainability_contact && Object.keys(audit.sustainability_contact as object).length > 0 && (
            <div className="text-xs text-slate-600 pt-2 border-t border-slate-200">
              <strong>Wants follow-up:</strong> {JSON.stringify(audit.sustainability_contact)}
            </div>
          )}
        </div>
      )}

      {audit.general_comments && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-1">General comments</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{audit.general_comments}</p>
        </div>
      )}
    </div>
  );
}

function StreamCard({
  stream, audit, grade, simple, isSimple, photos, photoUrls,
}: {
  stream: Stream;
  audit: Audit;
  grade: string | undefined;
  simple: Record<string, boolean>;
  isSimple: boolean;
  photos: AuditPhoto[];
  photoUrls: Record<string, string>;
}) {
  const total = (audit as any)[`${stream}_total`] as number;
  const contam = (audit as any)[`${stream}_contamination`] as number;
  const pct = (audit as any)[`${stream}_contamination_pct`] as number | null;
  const bins = (audit as any)[`${stream}_total_dustbins`] as number | null;
  const cleared = (audit as any)[`${stream}_cleared_contamination`] as boolean;
  const description = (audit as any)[`${stream}_additional_description`] as string | null;
  const detailedPct = total > 0 ? ((contam / total) * 100).toFixed(1) : null;

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold">{STREAM_LABEL[stream]}</div>
        <GradeBadge grade={grade} />
      </div>

      <div className="text-xs text-slate-600 grid grid-cols-2 gap-1">
        {isSimple ? (
          <>
            <div>Visual % contamination: <strong>{pct ?? 0}%</strong></div>
            <div>Total dustbins: <strong>{bins ?? "—"}</strong></div>
          </>
        ) : (
          <>
            <div>Total: <strong>{total}</strong></div>
            <div>Contamination: <strong>{contam}</strong> ({detailedPct ?? "0"}%)</div>
            {stream === "bottles_cans" && (
              <div className="col-span-2">Food present: <strong>{audit.bottles_cans_food_present ? "Yes" : "No"}</strong></div>
            )}
          </>
        )}
        <div className="col-span-2 mt-1">Cleared contamination: <strong>{cleared ? "Yes" : "No"}</strong></div>
      </div>

      {isSimple && Object.keys(simple).length > 0 && (
        <div className="space-y-1">
          {Object.entries(simple).map(([key, value]) => {
            const label = SIMPLE_QUESTION_LABEL[stream]?.[key] ?? key;
            return (
              <div key={key} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">{label}</span>
                <span className={"font-medium " + (value ? "text-red-700" : "text-emerald-700")}>
                  {value ? "Yes" : "No"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {description && (
        <div className="text-xs">
          <div className="text-slate-500 mb-0.5">Additional description</div>
          <p className="text-slate-800 italic whitespace-pre-wrap">{description}</p>
        </div>
      )}

      {photos.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-slate-500">Photos ({photos.length})</div>
          <div className="flex flex-wrap gap-2">
            {photos.map((p) => {
              const url = photoUrls[p.id];
              return url ? (
                <a key={p.id} href={url} target="_blank" rel="noreferrer" className="block">
                  <img src={url} alt="" className="w-20 h-20 rounded-lg object-cover border border-slate-300 hover:opacity-90" />
                </a>
              ) : (
                <div key={p.id} className="w-20 h-20 rounded-lg border border-slate-300 bg-slate-100 flex items-center justify-center text-xs text-slate-400">…</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SurveyRow({ label, v }: { label: string; v: boolean | null | undefined }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium">
        {v === true ? <span className="text-emerald-700">Yes</span> : v === false ? <span className="text-red-700">No</span> : <span className="text-slate-400">—</span>}
      </span>
    </div>
  );
}

function hasAnySurvey(a: Audit): boolean {
  return (
    a.donates_forinto !== null ||
    a.donates_cmu_food_pantry !== null ||
    a.reuse_program !== null ||
    a.energy_conservation_plan !== null ||
    a.water_conservation_plan !== null ||
    !!a.sustainability_contact
  );
}
