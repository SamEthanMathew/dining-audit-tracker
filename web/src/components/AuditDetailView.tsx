import { useEffect, useMemo, useState } from "react";
import type { Audit, AuditPhoto, Location } from "../lib/api";
import { listAuditPhotos } from "../lib/api";
import { getPhotoUrls } from "../lib/photos";
import GradeBadge from "./GradeBadge";
import PhotoLightbox from "./PhotoLightbox";
import type { LightboxItem } from "./PhotoLightbox";

type Stream = "landfill" | "bottles_cans" | "compost" | "cardboard";

const STREAMS: Stream[] = ["landfill", "bottles_cans", "compost", "cardboard"];

const STREAM_LABEL: Record<Stream, string> = {
  landfill: "Landfill",
  bottles_cans: "Bottles & Cans",
  compost: "Compost",
  cardboard: "Cardboard",
};

/** Ordered to match the submission form, so an admin reads them in the same order. */
const SIMPLE_QUESTIONS: Record<Stream, { key: string; label: string }[]> = {
  landfill: [
    { key: "sees_compost",      label: "Compost (food, fiber, napkins) in bin" },
    { key: "sees_bottles_cans", label: "Bottles or cans in bin" },
    { key: "sees_cardboard",    label: "Cardboard in bin" },
  ],
  bottles_cans: [
    { key: "sees_food",     label: "Food residue or liquids in bin (hard fail)" },
    { key: "sees_paper",    label: "Paper / coffee cups in bin" },
    { key: "sees_landfill", label: "Landfill items (wrappers, utensils) in bin" },
  ],
  compost: [
    { key: "sees_plastic",               label: "Plastic items in bin" },
    { key: "sees_metal",                 label: "Metal items in bin" },
    { key: "sees_paper_non_compostable", label: "Non-compostable paper / packaging in bin" },
  ],
  cardboard: [
    { key: "sees_non_cardboard", label: "Non-cardboard material (film, food, styrofoam) in bin" },
  ],
};

const SURVEY_ROWS: { key: keyof Audit; label: string }[] = [
  { key: "donates_forinto",          label: "Donates leftover food to Forinto food rescue" },
  { key: "donates_cmu_food_pantry",  label: "Donates to the CMU Food Pantry" },
  { key: "reuse_program",            label: "Reuse program in place" },
  { key: "energy_conservation_plan", label: "Kitchen energy conservation plan" },
  { key: "water_conservation_plan",  label: "Kitchen water conservation plan" },
];

export default function AuditDetailView({ audit, location }: { audit: Audit; location?: Location | null }) {
  const grades = (audit.computed_grades ?? {}) as Record<string, string>;
  const simple = (audit.simple_responses ?? {}) as Record<string, Record<string, boolean>>;
  const isSimple = audit.audit_form_mode === "simple";

  const [photos, setPhotos] = useState<AuditPhoto[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photosLoading, setPhotosLoading] = useState(true);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setPhotosLoading(true);
    setPhotoErr(null);
    listAuditPhotos(audit.id)
      .then(async (rows) => {
        if (!active) return;
        setPhotos(rows);
        const urls = await getPhotoUrls(rows.map((r) => r.storage_path));
        if (active) setPhotoUrls(urls);
      })
      .catch((e) => { if (active) setPhotoErr(e.message); })
      .finally(() => { if (active) setPhotosLoading(false); });
    return () => { active = false; };
  }, [audit.id]);

  // One flat, stream-ordered list so the lightbox can page through the whole audit.
  const ordered = useMemo(() => {
    const byStream = (s: Stream) =>
      photos
        .filter((p) => p.stream === s)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return STREAMS.flatMap(byStream);
  }, [photos]);

  const lightboxItems: LightboxItem[] = useMemo(
    () =>
      ordered
        .filter((p) => photoUrls[p.storage_path])
        .map((p) => ({
          url: photoUrls[p.storage_path],
          href: photoUrls[p.storage_path],
          caption: `${STREAM_LABEL[p.stream as Stream] ?? p.stream} · ${formatDateTime(p.created_at)}`,
        })),
    [ordered, photoUrls]
  );

  const indexOfPath = (path: string) =>
    lightboxItems.findIndex((i) => i.url === photoUrls[path]);

  const missingUrls = ordered.filter((p) => !photoUrls[p.storage_path]).length;

  return (
    <div className="space-y-4">
      {/* Header ---------------------------------------------------------- */}
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold leading-tight">
              {location?.name ?? "Unknown location"}
            </h2>
            <p className="text-sm text-slate-500">
              {audit.audit_date}
              {audit.audit_week && <span className="text-slate-400"> · week of {audit.audit_week}</span>}
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-bold tabular-nums">{audit.computed_score?.toFixed(1) ?? "—"}</div>
            <div className="text-xs text-slate-500">overall (0–100)</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="chip">👤 {audit.submitter_name || "(no name)"}</span>
          <span className="chip">{audit.audit_form_mode} mode</span>
          <span className="chip">role: {audit.submitted_by_role}</span>
          <span className="chip">📷 {photos.length}</span>
          {audit.is_sustainability_champion && (
            <span className="chip !bg-emerald-50 !border-emerald-200 !text-emerald-800">sustainability champion</span>
          )}
          {audit.done_by_dining_team && (
            <span className="chip !bg-red-50 !border-red-200 !text-cmu">Dining &amp; Sustainability team</span>
          )}
          <span className="chip">submitted {formatDateTime(audit.created_at)}</span>
        </div>

        {audit.nullified && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-3 py-2 text-sm">
            <strong>Nullified</strong>
            {audit.nullified_at && <span className="text-red-600"> · {formatDateTime(audit.nullified_at)}</span>}
            <div className="mt-0.5">{audit.nullified_reason || "No reason recorded."}</div>
          </div>
        )}
      </header>

      {/* Grade strip ----------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {STREAMS.map((s) => (
          <div key={s} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2">
            <GradeBadge grade={grades[s]} />
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{STREAM_LABEL[s]}</div>
              <div className="text-xs text-slate-500">{contaminationLabel(audit, s, isSimple)}</div>
            </div>
          </div>
        ))}
      </div>

      {photoErr && <p className="text-xs text-red-700">Photo load error: {photoErr}</p>}
      {!photoErr && missingUrls > 0 && !photosLoading && (
        <p className="text-xs text-amber-700">
          {missingUrls} photo{missingUrls === 1 ? "" : "s"} couldn't be loaded from storage.
        </p>
      )}

      {/* Per-stream detail ---------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {STREAMS.map((s) => (
          <StreamDetail
            key={s}
            stream={s}
            audit={audit}
            grade={grades[s]}
            simple={simple[s] ?? {}}
            isSimple={isSimple}
            photos={photos.filter((p) => p.stream === s)}
            photoUrls={photoUrls}
            photosLoading={photosLoading}
            onOpenPhoto={(path) => {
              const i = indexOfPath(path);
              if (i >= 0) setViewerIndex(i);
            }}
          />
        ))}
      </div>

      {isSimple && (
        <div className="card p-4 text-sm flex items-center justify-between gap-3">
          <span className="text-slate-600">Cardboard sent to the baler</span>
          <BoolValue v={audit.cardboard_to_baler} />
        </div>
      )}

      {/* Survey ---------------------------------------------------------- */}
      <div className="card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Sustainability programs</h3>
        {SURVEY_ROWS.map((row) => (
          <div key={row.key as string} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <BoolValue v={audit[row.key] as boolean | null} />
          </div>
        ))}
        <SustainabilityContact contact={audit.sustainability_contact} />
      </div>

      {audit.general_comments && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-1">General comments</h3>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{audit.general_comments}</p>
        </div>
      )}

      {/* Everything else, verbatim -------------------------------------- */}
      <details className="card p-4">
        <summary className="text-sm font-semibold cursor-pointer select-none">
          All stored fields (raw)
        </summary>
        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {Object.entries(audit)
            .filter(([k]) => k !== "simple_responses" && k !== "computed_grades" && k !== "sustainability_contact")
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 py-1">
                <dt className="font-mono text-slate-500 truncate">{k}</dt>
                <dd className="text-right text-slate-800 break-all">{renderRaw(v)}</dd>
              </div>
            ))}
        </dl>
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-500 mb-1">simple_responses</div>
          <pre className="text-[11px] bg-slate-50 border border-slate-200 rounded p-2 overflow-x-auto">
            {JSON.stringify(audit.simple_responses ?? null, null, 2)}
          </pre>
        </div>
        <div className="mt-2">
          <div className="text-xs font-semibold text-slate-500 mb-1">storage paths</div>
          <ul className="text-[11px] font-mono text-slate-600 space-y-0.5 break-all">
            {ordered.length === 0 && <li className="text-slate-400">none</li>}
            {ordered.map((p) => <li key={p.id}>{p.stream}: {p.storage_path}</li>)}
          </ul>
        </div>
      </details>

      {viewerIndex !== null && lightboxItems[viewerIndex] && (
        <PhotoLightbox
          items={lightboxItems}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onIndexChange={setViewerIndex}
        />
      )}
    </div>
  );
}

function StreamDetail({
  stream, audit, grade, simple, isSimple, photos, photoUrls, photosLoading, onOpenPhoto,
}: {
  stream: Stream;
  audit: Audit;
  grade: string | undefined;
  simple: Record<string, boolean>;
  isSimple: boolean;
  photos: AuditPhoto[];
  photoUrls: Record<string, string>;
  photosLoading: boolean;
  onOpenPhoto: (storagePath: string) => void;
}) {
  const total   = num((audit as any)[`${stream}_total`]);
  const contam  = num((audit as any)[`${stream}_contamination`]);
  const pct     = (audit as any)[`${stream}_contamination_pct`] as number | null;
  const bins    = (audit as any)[`${stream}_total_dustbins`] as number | null;
  const cleared = (audit as any)[`${stream}_cleared_contamination`] as boolean;
  const description = (audit as any)[`${stream}_additional_description`] as string | null;
  const detailedPct = total > 0 ? ((contam / total) * 100).toFixed(1) : "0.0";

  // Show every canonical question plus anything unexpected still in the payload.
  const canonical = SIMPLE_QUESTIONS[stream];
  const extraKeys = Object.keys(simple).filter((k) => !canonical.some((q) => q.key === k));

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">{STREAM_LABEL[stream]}</div>
        <GradeBadge grade={grade} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {isSimple ? (
          <>
            <Stat label="Visual contamination" value={`${pct ?? 0}%`} />
            <Stat label="Dustbins audited" value={bins === null || bins === undefined ? "—" : String(bins)} />
          </>
        ) : (
          <>
            <Stat label="Total counted" value={String(total)} />
            <Stat label="Contaminated" value={`${contam} (${detailedPct}%)`} />
          </>
        )}
        <Stat label="Cleared contamination" value={cleared ? "Yes" : "No"} />
        <Stat label="Photos" value={String(photos.length)} />
        {stream === "bottles_cans" && !isSimple && (
          <Stat label="Food present" value={audit.bottles_cans_food_present ? "Yes" : "No"} />
        )}
      </dl>

      {isSimple && (
        <div className="space-y-1 pt-1 border-t border-slate-100">
          {canonical.map((q) => (
            <div key={q.key} className="flex items-start justify-between gap-3 text-xs">
              <span className="text-slate-600">{q.label}</span>
              <BoolValue v={simple[q.key] === undefined ? null : simple[q.key]} invertColors />
            </div>
          ))}
          {extraKeys.map((k) => (
            <div key={k} className="flex items-start justify-between gap-3 text-xs">
              <span className="text-slate-600 font-mono">{k}</span>
              <BoolValue v={simple[k]} invertColors />
            </div>
          ))}
        </div>
      )}

      <div className="pt-1 border-t border-slate-100">
        <div className="text-xs text-slate-500 mb-0.5">Additional description</div>
        {description
          ? <p className="text-xs text-slate-800 whitespace-pre-wrap">{description}</p>
          : <p className="text-xs text-slate-400">— none given</p>}
      </div>

      <div className="pt-1 border-t border-slate-100">
        <div className="text-xs text-slate-500 mb-1">Photos ({photos.length})</div>
        {photos.length === 0 ? (
          <p className="text-xs text-slate-400">— no photos for this bin</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2">
            {photos.map((p) => {
              const url = photoUrls[p.storage_path];
              return (
                <li key={p.id}>
                  {url ? (
                    <button
                      type="button"
                      onClick={() => onOpenPhoto(p.storage_path)}
                      className="block w-full aspect-square rounded-lg overflow-hidden border border-slate-300 hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-cmu"
                      title={formatDateTime(p.created_at)}
                    >
                      <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
                    </button>
                  ) : (
                    <div className="w-full aspect-square rounded-lg border border-slate-300 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 text-center px-1">
                      {photosLoading ? "…" : "no preview"}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function BoolValue({ v, invertColors = false }: { v: boolean | null | undefined; invertColors?: boolean }) {
  if (v === null || v === undefined) {
    return <span className="shrink-0 font-medium text-slate-400">— not answered</span>;
  }
  // invertColors: a "Yes" to "do you see plastic in the compost" is bad news.
  const good = invertColors ? !v : v;
  return (
    <span className={"shrink-0 font-semibold " + (good ? "text-emerald-700" : "text-red-700")}>
      {v ? "Yes" : "No"}
    </span>
  );
}

function SustainabilityContact({ contact }: { contact: Audit["sustainability_contact"] }) {
  const c = (contact ?? null) as { name?: string; phone?: string; email?: string } | null;
  const filled = c && [c.name, c.phone, c.email].some((v) => (v ?? "").trim() !== "");
  if (!c) {
    return (
      <p className="text-xs text-slate-400 pt-2 border-t border-slate-200">
        No follow-up requested.
      </p>
    );
  }
  return (
    <div className="pt-2 border-t border-slate-200 text-xs space-y-0.5">
      <div className="font-semibold text-slate-700">Wants follow-up</div>
      {filled ? (
        <>
          {c.name?.trim()  && <div>Name: <span className="text-slate-800">{c.name}</span></div>}
          {c.phone?.trim() && <div>Phone: <a className="text-cmu underline" href={`tel:${c.phone}`}>{c.phone}</a></div>}
          {c.email?.trim() && <div>Email: <a className="text-cmu underline" href={`mailto:${c.email}`}>{c.email}</a></div>}
        </>
      ) : (
        <div className="text-slate-500">Checked the box but left contact details blank.</div>
      )}
    </div>
  );
}

function contaminationLabel(audit: Audit, s: Stream, isSimple: boolean): string {
  if (isSimple) {
    const pct = (audit as any)[`${s}_contamination_pct`] as number | null;
    return `${pct ?? 0}% contamination`;
  }
  const total  = num((audit as any)[`${s}_total`]);
  const contam = num((audit as any)[`${s}_contamination`]);
  if (!total) return "0.0% contamination";
  return `${((contam / total) * 100).toFixed(1)}% contamination`;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function renderRaw(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}
