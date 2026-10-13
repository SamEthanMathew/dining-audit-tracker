import { useEffect, useMemo, useRef, useState } from "react";
import type { Location, SubmitAuditPayload } from "../lib/api";
import { listLocations } from "../lib/api";
import { labelFor } from "../lib/recommended-time";
import { supabase } from "../lib/supabase";
import PhotoCapture from "./PhotoCapture";

type StreamKey = "landfill" | "bottles_cans" | "compost" | "cardboard";

const STREAM_ORDER: StreamKey[] = ["landfill", "bottles_cans", "compost", "cardboard"];

const STREAM_META: Record<StreamKey, { label: string; icon: string; accent: string }> = {
  landfill:     { label: "Landfill",       icon: "🗑️", accent: "bg-slate-500" },
  bottles_cans: { label: "Bottles & Cans", icon: "🥫", accent: "bg-blue-500" },
  compost:      { label: "Compost",        icon: "🌱", accent: "bg-emerald-600" },
  cardboard:    { label: "Cardboard",      icon: "📦", accent: "bg-amber-600" },
};

// "Yes" on any of these → contamination is present → Additional Description helps.
const STREAM_QUESTIONS: Record<StreamKey, { key: string; label: string; badWhen: "yes" | "no" }[]> = {
  landfill: [
    { key: "sees_compost",       label: "Do you see compost (food, fiber, napkins) in this bin?", badWhen: "yes" },
    { key: "sees_bottles_cans",  label: "Do you see bottles or cans in this bin?", badWhen: "yes" },
    { key: "sees_cardboard",     label: "Do you see cardboard in this bin?", badWhen: "yes" },
  ],
  bottles_cans: [
    { key: "sees_food",          label: "Do you see food residue or liquids in this bin? (hard fail)", badWhen: "yes" },
    { key: "sees_paper",         label: "Do you see paper / coffee cups in this bin?", badWhen: "yes" },
    { key: "sees_landfill",      label: "Do you see landfill items (snack wrappers, utensils)?", badWhen: "yes" },
  ],
  compost: [
    { key: "sees_plastic",                 label: "Do you see plastic items in this bin?", badWhen: "yes" },
    { key: "sees_metal",                   label: "Do you see metal items in this bin?", badWhen: "yes" },
    { key: "sees_paper_non_compostable",   label: "Do you see non-compostable paper / packaging?", badWhen: "yes" },
  ],
  cardboard: [
    { key: "sees_non_cardboard", label: "Do you see anything that isn't pure cardboard (plastic film, food, styrofoam)?", badWhen: "yes" },
  ],
};

const CONTAM_PRESETS = [
  { value: 0,   label: "None" },
  { value: 10,  label: "A little" },
  { value: 25,  label: "Some" },
  { value: 50,  label: "Half" },
  { value: 75,  label: "Most" },
];

type StreamState = {
  total_dustbins: number;
  contamination_pct: number;
  cleared: boolean;
  description: string;
  q: Record<string, boolean>;
  photos: string[];
  photos_pending: number;
  photos_failed: number;
};

const emptyStream = (): StreamState => ({
  total_dustbins: 1,
  contamination_pct: 0,
  cleared: false,
  description: "",
  q: {},
  photos: [],
  photos_pending: 0,
  photos_failed: 0,
});

export type SimpleAuditFormProps = {
  defaultLocationId?: string;
  lockLocation?: boolean;
  isAdmin?: boolean;
  defaultSubmitterName?: string;
  onSubmit: (payload: SubmitAuditPayload) => Promise<void>;
};

export default function SimpleAuditForm({
  defaultLocationId,
  lockLocation,
  isAdmin,
  defaultSubmitterName,
  onSubmit,
}: SimpleAuditFormProps) {
  const [submissionId] = useState(() => crypto.randomUUID());
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState(defaultLocationId ?? "");
  const [recommendedWindow, setRecommendedWindow] = useState<string | null>(null);

  const [submitterName, setSubmitterName] = useState(defaultSubmitterName ?? "");
  const [isChampion, setIsChampion] = useState(false);
  const [doneByDiningTeam, setDoneByDiningTeam] = useState(false);

  const [streams, setStreams] = useState<Record<StreamKey, StreamState>>(() => ({
    landfill: emptyStream(),
    bottles_cans: emptyStream(),
    compost: emptyStream(),
    cardboard: emptyStream(),
  }));
  const [collapsed, setCollapsed] = useState<Record<StreamKey, boolean>>({
    landfill: false, bottles_cans: false, compost: false, cardboard: false,
  });
  const [cardboardToBaler, setCardboardToBaler] = useState<boolean | null>(null);

  // sustainability survey (optional)
  const [reuseProgram, setReuseProgram] = useState<boolean | null>(null);
  const [energyPlan, setEnergyPlan] = useState<boolean | null>(null);
  const [waterPlan, setWaterPlan] = useState<boolean | null>(null);
  const [donatesForinto, setDonatesForinto] = useState<boolean | null>(null);
  const [donatesPantry, setDonatesPantry] = useState<boolean | null>(null);
  const [wantsContact, setWantsContact] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  const [generalComments, setGeneralComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState<string | null>(null);

  const topRef = useRef<HTMLDivElement>(null);
  const streamRefs = useRef<Record<string, HTMLDivElement | null>>({});

  function setStream(key: StreamKey, update: Partial<StreamState> | ((s: StreamState) => StreamState)) {
    setStreams((prev) => ({
      ...prev,
      [key]: typeof update === "function" ? update(prev[key]) : { ...prev[key], ...update },
    }));
  }

  function loadLocations() {
    setLocationsLoading(true);
    setLocationsError(null);
    listLocations()
      .then((rows) => {
        setLocations(rows);
        if (rows.length === 0) setLocationsError("No locations available. Please refresh.");
      })
      .catch((e) =>
        setLocationsError(
          /failed to fetch|network/i.test(e?.message ?? "")
            ? "Couldn't reach the server. Check your connection."
            : e?.message ?? "Could not load locations."
        )
      )
      .finally(() => setLocationsLoading(false));
  }

  useEffect(() => { loadLocations(); }, []);

  useEffect(() => {
    if (!locationId) {
      setRecommendedWindow(null);
      return;
    }
    supabase.rpc("recommended_audit_window", { loc: locationId }).then(({ data }) => {
      setRecommendedWindow(typeof data === "string" ? labelFor(data) : null);
    });
  }, [locationId]);

  const pendingPhotos = STREAM_ORDER.reduce((n, k) => n + streams[k].photos_pending, 0);
  const failedPhotos  = STREAM_ORDER.reduce((n, k) => n + streams[k].photos_failed, 0);
  const savedPhotos   = STREAM_ORDER.reduce((n, k) => n + streams[k].photos.length, 0);
  const binsStarted   = STREAM_ORDER.filter((k) => isStarted(streams[k], k)).length;

  function validate(): string | null {
    if (!locationId) return "Pick the location you're auditing.";
    if (!submitterName.trim()) return "Add your name so we know who ran this audit.";
    if (pendingPhotos > 0) {
      return `${pendingPhotos} photo${pendingPhotos === 1 ? " is" : "s are"} still uploading. Give it a second, then submit.`;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) {
      setError(v);
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (failedPhotos > 0) {
      const ok = window.confirm(
        `${failedPhotos} photo${failedPhotos === 1 ? "" : "s"} failed to upload and won't be saved with this audit.\n\nSubmit anyway?`
      );
      if (!ok) return;
    }

    const photos = STREAM_ORDER.flatMap((k) =>
      streams[k].photos.map((p) => ({ stream: k, storage_path: p }))
    );

    const payload: SubmitAuditPayload = {
      audit_form_mode: "simple",
      location_id: locationId,
      submitter_name: submitterName.trim(),
      is_sustainability_champion: isChampion,
      done_by_dining_team: doneByDiningTeam,
      simple_responses: {
        landfill:     streams.landfill.q,
        bottles_cans: streams.bottles_cans.q,
        compost:      streams.compost.q,
        cardboard:    streams.cardboard.q,
      },
      landfill_total_dustbins: streams.landfill.total_dustbins,
      landfill_contamination_pct: streams.landfill.contamination_pct,
      landfill_cleared_contamination: streams.landfill.cleared,
      landfill_additional_description: streams.landfill.description.trim() || undefined,
      bottles_cans_total_dustbins: streams.bottles_cans.total_dustbins,
      bottles_cans_contamination_pct: streams.bottles_cans.contamination_pct,
      bottles_cans_cleared_contamination: streams.bottles_cans.cleared,
      bottles_cans_food_present: !!streams.bottles_cans.q.sees_food,
      bottles_cans_additional_description: streams.bottles_cans.description.trim() || undefined,
      compost_total_dustbins: streams.compost.total_dustbins,
      compost_contamination_pct: streams.compost.contamination_pct,
      compost_cleared_contamination: streams.compost.cleared,
      compost_additional_description: streams.compost.description.trim() || undefined,
      cardboard_total_dustbins: streams.cardboard.total_dustbins,
      cardboard_contamination_pct: streams.cardboard.contamination_pct,
      cardboard_cleared_contamination: streams.cardboard.cleared,
      cardboard_additional_description: streams.cardboard.description.trim() || undefined,
      cardboard_to_baler: cardboardToBaler,
      reuse_program: reuseProgram,
      energy_conservation_plan: energyPlan,
      water_conservation_plan: waterPlan,
      donates_forinto: donatesForinto,
      donates_cmu_food_pantry: donatesPantry,
      sustainability_contact: wantsContact
        ? { name: contactName, phone: contactPhone, email: contactEmail }
        : null,
      general_comments: generalComments.trim() || undefined,
      photos,
    };

    setSubmitting(true);
    try { await onSubmit(payload); }
    catch (e: any) {
      setError(friendlySubmitError(e?.message));
      topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    finally { setSubmitting(false); }
  }

  function jumpTo(key: StreamKey) {
    setCollapsed((prev) => ({ ...prev, [key]: false }));
    // Wait for the expand to paint before scrolling.
    requestAnimationFrame(() => {
      streamRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <div ref={topRef} />

      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-sm">
        <strong>Heads up:</strong> this audit is for <em>back-of-house</em> dustbins only — not customer-facing bins.
      </div>

      {/* Who / where ------------------------------------------------------ */}
      <section className="card p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="loc">Location <span className="text-red-600">*</span></label>
            <select
              id="loc"
              className="input"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={lockLocation || locationsLoading || locations.length === 0}
            >
              <option value="">
                {locationsLoading ? "Loading locations…" : locations.length === 0 ? "No locations available" : "Select…"}
              </option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {locationsError && (
              <div className="text-xs text-red-700 mt-1.5 flex items-center gap-2">
                <span>{locationsError}</span>
                <button type="button" onClick={loadLocations} className="font-semibold text-cmu underline">Retry</button>
              </div>
            )}
            {recommendedWindow && (
              <p className="text-xs text-emerald-700 mt-1.5">
                Suggested next window: <strong>{recommendedWindow}</strong>
              </p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="name">Your name <span className="text-red-600">*</span></label>
            <input
              id="name"
              className="input"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="First and last"
              autoComplete="name"
              autoCapitalize="words"
              required
            />
          </div>
        </div>

        <CheckRow
          checked={isChampion}
          onChange={setIsChampion}
          label="I'm the sustainability champion for this location."
        />
        {isAdmin && (
          <CheckRow
            checked={doneByDiningTeam}
            onChange={setDoneByDiningTeam}
            label="This audit is performed by the Dining & Sustainability team."
          />
        )}
      </section>

      {/* Jump bar --------------------------------------------------------- */}
      <nav className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5" aria-label="Jump to a bin">
        {STREAM_ORDER.map((k) => {
          const started = isStarted(streams[k], k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => jumpTo(k)}
              className={
                "shrink-0 min-h-10 inline-flex items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition " +
                (started
                  ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                  : "bg-white border-slate-300 text-slate-600")
              }
            >
              <span aria-hidden>{started ? "✓" : STREAM_META[k].icon}</span>
              {STREAM_META[k].label}
            </button>
          );
        })}
      </nav>

      {STREAM_ORDER.map((key) => (
        <StreamCard
          key={key}
          streamKey={key}
          state={streams[key]}
          setState={(u) => setStream(key, u)}
          submissionId={submissionId}
          collapsed={collapsed[key]}
          onToggle={() => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))}
          innerRef={(el) => { streamRefs.current[key] = el; }}
        >
          {key === "cardboard" && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <div className="text-sm font-semibold mb-2">
                Is the cardboard being sent to the baler?{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </div>
              <YesNoPair
                value={cardboardToBaler}
                onChange={setCardboardToBaler}
                yesTone="plain"
              />
            </div>
          )}
        </StreamCard>
      ))}

      <SustainabilitySurvey
        reuseProgram={reuseProgram} setReuseProgram={setReuseProgram}
        energyPlan={energyPlan}     setEnergyPlan={setEnergyPlan}
        waterPlan={waterPlan}       setWaterPlan={setWaterPlan}
        donatesForinto={donatesForinto} setDonatesForinto={setDonatesForinto}
        donatesPantry={donatesPantry}   setDonatesPantry={setDonatesPantry}
        wantsContact={wantsContact} setWantsContact={setWantsContact}
        contactName={contactName}   setContactName={setContactName}
        contactPhone={contactPhone} setContactPhone={setContactPhone}
        contactEmail={contactEmail} setContactEmail={setContactEmail}
      />

      <section className="card p-4 sm:p-5">
        <label className="label" htmlFor="comments">General comments <span className="text-slate-400 font-normal">(optional)</span></label>
        <textarea
          id="comments"
          rows={3}
          className="input"
          value={generalComments}
          onChange={(e) => setGeneralComments(e.target.value)}
          placeholder="Anything else the Dining & Sustainability team should know?"
        />
      </section>

      {error && (
        <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Sticky submit ---------------------------------------------------- */}
      <div className="action-bar">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600 leading-tight min-w-0">
            <div className="font-semibold text-slate-800">{binsStarted} of 4 bins recorded</div>
            <div className="truncate">
              {pendingPhotos > 0
                ? `${pendingPhotos} photo${pendingPhotos === 1 ? "" : "s"} uploading…`
                : failedPhotos > 0
                  ? `${failedPhotos} photo${failedPhotos === 1 ? "" : "s"} failed`
                  : savedPhotos > 0
                    ? `${savedPhotos} photo${savedPhotos === 1 ? "" : "s"} attached`
                    : "Photos optional"}
            </div>
          </div>
          <button
            className="btn-primary px-6 shrink-0"
            type="submit"
            disabled={submitting || pendingPhotos > 0}
          >
            {submitting ? "Submitting…" : pendingPhotos > 0 ? "Uploading…" : "Submit audit"}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------

function StreamCard({
  streamKey, state, setState, submissionId, collapsed, onToggle, innerRef, children,
}: {
  streamKey: StreamKey;
  state: StreamState;
  setState: (u: Partial<StreamState> | ((s: StreamState) => StreamState)) => void;
  submissionId: string;
  collapsed: boolean;
  onToggle: () => void;
  innerRef: (el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}) {
  const questions = STREAM_QUESTIONS[streamKey];
  const meta = STREAM_META[streamKey];
  const answered = questions.filter((q) => state.q[q.key] !== undefined).length;
  const hasBadAnswer = useMemo(
    () => questions.some((q) => state.q[q.key] === (q.badWhen === "yes")),
    [state.q, questions]
  );

  return (
    <section ref={innerRef} className="card overflow-hidden scroll-mt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"
      >
        <span className={"w-9 h-9 shrink-0 rounded-lg text-white flex items-center justify-center " + meta.accent} aria-hidden>
          {meta.icon}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-semibold leading-tight">{meta.label}</span>
          <span className="block text-xs text-slate-500 leading-tight mt-0.5">
            {answered}/{questions.length} answered
            {" · "}{state.contamination_pct}% contamination
            {state.photos.length > 0 && ` · ${state.photos.length} photo${state.photos.length === 1 ? "" : "s"}`}
          </span>
        </span>
        <span className="shrink-0 text-slate-400 text-lg" aria-hidden>{collapsed ? "▾" : "▴"}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 sm:px-5 sm:pb-5 space-y-5 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="label">Total dustbins audited</label>
              <Stepper
                value={state.total_dustbins}
                onChange={(v) => setState({ total_dustbins: v })}
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="label mb-0">Estimated contamination</span>
                <span className="text-lg font-bold tabular-nums text-cmu">{state.contamination_pct}%</span>
              </div>
              <input
                type="range" min="0" max="100" step="5"
                aria-label={`${meta.label} estimated contamination percent`}
                value={state.contamination_pct}
                onChange={(e) => setState({ contamination_pct: Number(e.target.value) })}
              />
              <div className="flex flex-wrap gap-1.5 mt-1">
                {CONTAM_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setState({ contamination_pct: p.value })}
                    className={
                      "min-h-9 rounded-full border px-3 text-xs font-semibold " +
                      (state.contamination_pct === p.value
                        ? "bg-cmu text-white border-cmu"
                        : "bg-white text-slate-600 border-slate-300 active:bg-slate-100")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {questions.map((q) => (
              <div key={q.key} className="sm:flex sm:items-center sm:justify-between sm:gap-4">
                <p className="text-sm text-slate-800 mb-2 sm:mb-0">{q.label}</p>
                <div className="sm:shrink-0">
                  <YesNoPair
                    value={state.q[q.key] ?? null}
                    onChange={(v) => setState((prev) => ({ ...prev, q: { ...prev.q, [q.key]: v as boolean } }))}
                    allowClear={false}
                  />
                </div>
              </div>
            ))}
          </div>

          <CheckRow
            checked={state.cleared}
            onChange={(v) => setState({ cleared: v })}
            label="I found contamination but cleared it out"
            hint="Bonus points if you describe what you did below."
          />

          <div>
            <label className="label">Photos <span className="text-slate-400 font-normal">(optional)</span></label>
            <PhotoCapture
              submissionId={submissionId}
              stream={streamKey}
              label={meta.label}
              onChange={(paths, pending, failed) =>
                setState((prev) => ({ ...prev, photos: paths, photos_pending: pending, photos_failed: failed }))
              }
            />
          </div>

          <div>
            <label className="label">
              Additional description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              rows={2}
              className="input"
              value={state.description}
              onChange={(e) => setState({ description: e.target.value })}
              placeholder={hasBadAnswer ? "Describe what you saw and what you did about it." : "Anything worth noting about this bin?"}
            />
          </div>

          {children}

          <button
            type="button"
            onClick={onToggle}
            className="w-full min-h-11 rounded-lg border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-700 active:bg-slate-100"
          >
            Done with {meta.label}
          </button>
        </div>
      )}
    </section>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-stretch gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="Decrease"
        className="w-12 min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-40"
        disabled={value <= 0}
      >
        −
      </button>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        pattern="[0-9]*"
        className="input text-center flex-1"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
        }}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Increase"
        className="w-12 min-h-11 rounded-lg border border-slate-300 bg-white text-xl font-semibold text-slate-700 active:bg-slate-100"
      >
        +
      </button>
    </div>
  );
}

function YesNoPair({
  value, onChange, allowClear = true, yesTone = "bad",
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  allowClear?: boolean;
  /** "bad" = a Yes means contamination (red). "plain" = neutral yes/no. */
  yesTone?: "bad" | "plain";
}) {
  const yesClass =
    value === true
      ? yesTone === "bad" ? "answer-btn answer-btn-yes" : "answer-btn answer-btn-no"
      : "answer-btn answer-btn-idle";
  const noClass = value === false ? "answer-btn answer-btn-no" : "answer-btn answer-btn-idle";
  return (
    <div className="grid grid-cols-2 gap-2 sm:w-40">
      <button
        type="button"
        aria-pressed={value === true}
        onClick={() => onChange(value === true && allowClear ? null : true)}
        className={yesClass}
      >
        Yes
      </button>
      <button
        type="button"
        aria-pressed={value === false}
        onClick={() => onChange(value === false && allowClear ? null : false)}
        className={noClass}
      >
        No
      </button>
    </div>
  );
}

function CheckRow({
  checked, onChange, label, hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label
      className={
        "flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition " +
        (checked ? "border-cmu bg-red-50/40" : "border-slate-200 bg-white active:bg-slate-50")
      }
    >
      <input
        type="checkbox"
        className="mt-0.5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm text-slate-800 leading-snug">
        {label}
        {hint && <span className="block text-xs text-slate-500 mt-0.5">{hint}</span>}
      </span>
    </label>
  );
}

type SurveyQuestion = { prompt: string; yesLabel: string; noLabel: string };

const SURVEY_QUESTIONS: Record<string, SurveyQuestion> = {
  forinto: {
    prompt: "Does this location donate leftover food to Forinto food rescue?",
    yesLabel: "Yes — I care about fighting hunger",
    noLabel: "Not yet",
  },
  pantry: {
    prompt: "Does this location donate to the CMU Food Pantry?",
    yesLabel: "Yes — I want to support our students",
    noLabel: "Not yet",
  },
  reuse: {
    prompt: "Does this location have a reuse program in place?",
    yesLabel: "Yes — I believe in cutting waste at the source",
    noLabel: "Not yet",
  },
  energy: {
    prompt: "Does the kitchen have an energy conservation plan?",
    yesLabel: "Yes — I want to conserve energy",
    noLabel: "Not yet",
  },
  water: {
    prompt: "Does the kitchen have a water conservation plan?",
    yesLabel: "Yes — I want to conserve water",
    noLabel: "Not yet",
  },
};

function SurveyItem({
  q, value, onSet,
}: {
  q: SurveyQuestion;
  value: boolean | null;
  onSet: (v: boolean | null) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-800">{q.prompt}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={value === true}
          onClick={() => onSet(value === true ? null : true)}
          className={
            "min-h-12 px-3 py-2 rounded-xl text-sm border text-left transition " +
            (value === true
              ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
              : "bg-white text-slate-800 border-slate-300 active:bg-emerald-50 hover:bg-emerald-50 hover:border-emerald-300")
          }
        >{q.yesLabel}</button>
        <button
          type="button"
          aria-pressed={value === false}
          onClick={() => onSet(value === false ? null : false)}
          className={
            "min-h-12 px-3 py-2 rounded-xl text-sm border text-left transition " +
            (value === false
              ? "bg-slate-700 text-white border-slate-800 shadow-sm"
              : "bg-white text-slate-600 border-slate-300 active:bg-slate-100 hover:bg-slate-50")
          }
        >{q.noLabel}</button>
      </div>
    </div>
  );
}

function SustainabilitySurvey(props: {
  reuseProgram: boolean | null; setReuseProgram: (v: boolean | null) => void;
  energyPlan: boolean | null;   setEnergyPlan: (v: boolean | null) => void;
  waterPlan: boolean | null;    setWaterPlan: (v: boolean | null) => void;
  donatesForinto: boolean | null; setDonatesForinto: (v: boolean | null) => void;
  donatesPantry: boolean | null;  setDonatesPantry: (v: boolean | null) => void;
  wantsContact: boolean;        setWantsContact: (v: boolean) => void;
  contactName: string;          setContactName: (v: string) => void;
  contactPhone: string;         setContactPhone: (v: string) => void;
  contactEmail: string;         setContactEmail: (v: string) => void;
}) {
  return (
    <section className="card p-4 sm:p-5 space-y-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold">Sustainability programs</h3>
        <span className="text-xs text-slate-500 shrink-0">All optional — not scored</span>
      </div>
      <p className="hint -mt-3">Tap a button to answer. Tap again to clear.</p>

      <SurveyItem q={SURVEY_QUESTIONS.forinto} value={props.donatesForinto} onSet={props.setDonatesForinto} />
      <SurveyItem q={SURVEY_QUESTIONS.pantry}  value={props.donatesPantry}  onSet={props.setDonatesPantry} />
      <SurveyItem q={SURVEY_QUESTIONS.reuse}   value={props.reuseProgram}   onSet={props.setReuseProgram} />
      <SurveyItem q={SURVEY_QUESTIONS.energy}  value={props.energyPlan}     onSet={props.setEnergyPlan} />
      <SurveyItem q={SURVEY_QUESTIONS.water}   value={props.waterPlan}      onSet={props.setWaterPlan} />

      <div className="pt-1 border-t border-slate-200">
        <CheckRow
          checked={props.wantsContact}
          onChange={props.setWantsContact}
          label="I'd like to be contacted about expanding any of these programs."
        />
      </div>
      {props.wantsContact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="input" placeholder="Name"  autoComplete="name"  value={props.contactName}  onChange={(e) => props.setContactName(e.target.value)} />
          <input className="input" placeholder="Phone" type="tel"   inputMode="tel"   autoComplete="tel"   value={props.contactPhone} onChange={(e) => props.setContactPhone(e.target.value)} />
          <input className="input" placeholder="Email" type="email" inputMode="email" autoComplete="email" value={props.contactEmail} onChange={(e) => props.setContactEmail(e.target.value)} />
        </div>
      )}
    </section>
  );
}

function isStarted(s: StreamState, key: StreamKey): boolean {
  return (
    Object.keys(s.q).length > 0 ||
    s.contamination_pct > 0 ||
    s.cleared ||
    s.photos.length > 0 ||
    s.description.trim().length > 0 ||
    s.total_dustbins !== emptyStream().total_dustbins ||
    // cardboard has a single question; treat any answer as started
    (key === "cardboard" && s.q.sees_non_cardboard !== undefined)
  );
}

function friendlySubmitError(msg: string | undefined): string {
  if (!msg) return "Submit failed. Check your connection and try again.";
  if (msg === "already_submitted_this_week") {
    return "An audit for this location was already submitted this week.";
  }
  if (/failed to fetch|network/i.test(msg)) {
    return "No connection — your answers are still here. Reconnect and tap Submit again.";
  }
  return msg;
}
