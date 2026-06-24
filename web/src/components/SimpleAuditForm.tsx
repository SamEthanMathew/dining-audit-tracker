import { useEffect, useMemo, useState } from "react";
import type { Location, SubmitAuditPayload } from "../lib/api";
import { listLocations } from "../lib/api";
import { labelFor } from "../lib/recommended-time";
import { supabase } from "../lib/supabase";
import PhotoCapture from "./PhotoCapture";

type StreamKey = "landfill" | "bottles_cans" | "compost" | "cardboard";

const STREAM_LABEL: Record<StreamKey, string> = {
  landfill: "Landfill",
  bottles_cans: "Bottles & Cans",
  compost: "Compost",
  cardboard: "Cardboard",
};

// "Yes" on any of these → contamination is present → Additional Description required.
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

type StreamState = {
  total_dustbins: number;
  contamination_pct: number;
  cleared: boolean;
  description: string;
  q: Record<string, boolean>;
  photos: string[];
  photos_pending: number;
};

const emptyStream = (): StreamState => ({
  total_dustbins: 1,
  contamination_pct: 0,
  cleared: false,
  description: "",
  q: {},
  photos: [],
  photos_pending: 0,
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

  const [landfill, setLandfill] = useState<StreamState>(emptyStream);
  const [bottles, setBottles] = useState<StreamState>(emptyStream);
  const [compost, setCompost] = useState<StreamState>(emptyStream);
  const [cardboard, setCardboard] = useState<StreamState>(emptyStream);
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

  function loadLocations() {
    setLocationsLoading(true);
    setLocationsError(null);
    listLocations()
      .then((rows) => {
        setLocations(rows);
        if (rows.length === 0) setLocationsError("No locations available. Please refresh.");
      })
      .catch((e) => setLocationsError(e.message ?? "Could not load locations."))
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

  function streamHasBadAnswer(s: StreamState, key: StreamKey): boolean {
    return STREAM_QUESTIONS[key].some((q) => {
      const v = s.q[q.key];
      if (v === undefined) return false;
      return q.badWhen === "yes" ? v : !v;
    });
  }

  function streamPendingPhotos(): number {
    return landfill.photos_pending + bottles.photos_pending + compost.photos_pending + cardboard.photos_pending;
  }

  function validate(): string | null {
    if (!locationId) return "Pick a location.";
    if (!submitterName.trim()) return "Your name is required.";
    if (streamPendingPhotos() > 0) {
      return `Photos are still uploading (${streamPendingPhotos()} left). Wait a moment, then resubmit.`;
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) { setError(v); return; }

    const photos = [
      ...landfill.photos.map((p) => ({ stream: "landfill",     storage_path: p })),
      ...bottles.photos.map((p) =>  ({ stream: "bottles_cans", storage_path: p })),
      ...compost.photos.map((p) =>  ({ stream: "compost",      storage_path: p })),
      ...cardboard.photos.map((p) => ({ stream: "cardboard",   storage_path: p })),
    ];

    const payload: SubmitAuditPayload = {
      audit_form_mode: "simple",
      location_id: locationId,
      submitter_name: submitterName.trim(),
      is_sustainability_champion: isChampion,
      done_by_dining_team: doneByDiningTeam,
      simple_responses: {
        landfill:     landfill.q,
        bottles_cans: bottles.q,
        compost:      compost.q,
        cardboard:    cardboard.q,
      },
      landfill_total_dustbins: landfill.total_dustbins,
      landfill_contamination_pct: landfill.contamination_pct,
      landfill_cleared_contamination: landfill.cleared,
      landfill_additional_description: landfill.description.trim() || undefined,
      bottles_cans_total_dustbins: bottles.total_dustbins,
      bottles_cans_contamination_pct: bottles.contamination_pct,
      bottles_cans_cleared_contamination: bottles.cleared,
      bottles_cans_food_present: !!bottles.q.sees_food,
      bottles_cans_additional_description: bottles.description.trim() || undefined,
      compost_total_dustbins: compost.total_dustbins,
      compost_contamination_pct: compost.contamination_pct,
      compost_cleared_contamination: compost.cleared,
      compost_additional_description: compost.description.trim() || undefined,
      cardboard_total_dustbins: cardboard.total_dustbins,
      cardboard_contamination_pct: cardboard.contamination_pct,
      cardboard_cleared_contamination: cardboard.cleared,
      cardboard_additional_description: cardboard.description.trim() || undefined,
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
    catch (e: any) { setError(e.message ?? "Submit failed"); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-4 py-3 text-sm">
        <strong>Heads up:</strong> this audit is for <em>back-of-house</em> dustbins only — not customer-facing bins.
      </div>

      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Location <span className="text-red-600">*</span></label>
            <select
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
              <div className="text-xs text-red-700 mt-1 flex items-center gap-2">
                <span>{locationsError}</span>
                <button type="button" onClick={loadLocations} className="text-cmu hover:underline">Retry</button>
              </div>
            )}
            {!locationsLoading && !locationsError && locations.length > 0 && (
              <p className="text-xs text-slate-500 mt-1">{locations.length} locations available</p>
            )}
            {recommendedWindow && (
              <p className="text-xs text-emerald-700 mt-1">
                Suggested next window: <strong>{recommendedWindow}</strong>
              </p>
            )}
          </div>
          <div>
            <label className="label">Your name <span className="text-red-600">*</span></label>
            <input
              className="input"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              placeholder="First and last"
              required
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isChampion} onChange={(e) => setIsChampion(e.target.checked)} />
          I'm the sustainability champion for this location.
        </label>
        {isAdmin && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={doneByDiningTeam} onChange={(e) => setDoneByDiningTeam(e.target.checked)} />
            This audit is performed by the Dining &amp; Sustainability team.
          </label>
        )}
      </div>

      <StreamCard streamKey="landfill"     state={landfill}  setState={setLandfill}  submissionId={submissionId} />
      <StreamCard streamKey="bottles_cans" state={bottles}   setState={setBottles}   submissionId={submissionId} />
      <StreamCard streamKey="compost"      state={compost}   setState={setCompost}   submissionId={submissionId} />
      <StreamCard streamKey="cardboard"    state={cardboard} setState={setCardboard} submissionId={submissionId}>
        <div className="mt-3 p-3 bg-slate-50 rounded">
          <div className="text-sm font-medium mb-2">Is the cardboard being sent to the baler? <span className="text-slate-400 font-normal">(optional)</span></div>
          <div className="flex gap-2">
            <YesNoButton selected={cardboardToBaler === true}  onClick={() => setCardboardToBaler(true)}  label="Yes" />
            <YesNoButton selected={cardboardToBaler === false} onClick={() => setCardboardToBaler(false)} label="No" />
          </div>
        </div>
      </StreamCard>

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

      <div className="card p-5">
        <label className="label">General comments (optional)</label>
        <textarea
          rows={3}
          className="input"
          value={generalComments}
          onChange={(e) => setGeneralComments(e.target.value)}
        />
      </div>

      {error && <div className="text-red-700 bg-red-50 border border-red-200 px-4 py-2 rounded">{error}</div>}

      <div className="flex justify-end items-center gap-3">
        {streamPendingPhotos() > 0 && (
          <span className="text-xs text-amber-700">{streamPendingPhotos()} photo{streamPendingPhotos() === 1 ? "" : "s"} still uploading…</span>
        )}
        <button className="btn-primary" type="submit" disabled={submitting || streamPendingPhotos() > 0}>
          {submitting ? "Submitting…" : "Submit audit"}
        </button>
      </div>
    </form>
  );
}

function StreamCard({
  streamKey, state, setState, submissionId, children,
}: {
  streamKey: StreamKey;
  state: StreamState;
  setState: React.Dispatch<React.SetStateAction<StreamState>>;
  submissionId: string;
  children?: React.ReactNode;
}) {
  const questions = STREAM_QUESTIONS[streamKey];
  const hasBadAnswer = useMemo(() =>
    questions.some((q) => state.q[q.key] === (q.badWhen === "yes"))
  , [state.q, questions]);

  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-lg font-semibold">{STREAM_LABEL[streamKey]}</h3>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Total dustbins audited</label>
          <input
            type="number" min="0" step="1"
            className="input"
            value={state.total_dustbins}
            onChange={(e) => setState({ ...state, total_dustbins: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Estimated contamination: <strong>{state.contamination_pct}%</strong></label>
          <input
            type="range" min="0" max="100" step="5"
            className="w-full"
            value={state.contamination_pct}
            onChange={(e) => setState({ ...state, contamination_pct: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-2">
        {questions.map((q) => (
          <div key={q.key} className="flex items-center justify-between gap-3 text-sm">
            <span>{q.label}</span>
            <div className="flex gap-2 shrink-0">
              <YesNoButton selected={state.q[q.key] === true}  onClick={() => setState({ ...state, q: { ...state.q, [q.key]: true } })}  label="Yes" />
              <YesNoButton selected={state.q[q.key] === false} onClick={() => setState({ ...state, q: { ...state.q, [q.key]: false } })} label="No" />
            </div>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.cleared}
          onChange={(e) => setState({ ...state, cleared: e.target.checked })}
        />
        I found contamination but cleared it out (bonus points if you describe what you did below)
      </label>

      <div>
        <label className="label">Photos</label>
        <PhotoCapture
          submissionId={submissionId}
          stream={streamKey}
          onChange={(paths, pending) => setState((prev) => ({ ...prev, photos: paths, photos_pending: pending }))}
        />
      </div>

      <div>
        <label className="label">
          Additional Description <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={2}
          className="input"
          value={state.description}
          onChange={(e) => setState({ ...state, description: e.target.value })}
          placeholder={hasBadAnswer ? "Describe what you saw and what you did about it." : ""}
        />
      </div>

      {children}
    </div>
  );
}

function YesNoButton({ selected, onClick, label }: { selected: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-3 py-1 rounded-md text-sm border transition " +
        (selected
          ? label === "Yes"
            ? "bg-red-600 text-white border-red-700"
            : "bg-emerald-600 text-white border-emerald-700"
          : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50")
      }
    >
      {label}
    </button>
  );
}

type SurveyQuestion = {
  prompt: string;
  yesLabel: string;
  noLabel: string;
};

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
          onClick={() => onSet(value === true ? null : true)}
          className={
            "px-3 py-2 rounded-md text-sm border text-left transition " +
            (value === true
              ? "bg-emerald-600 text-white border-emerald-700"
              : "bg-white text-slate-800 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300")
          }
        >{q.yesLabel}</button>
        <button
          type="button"
          onClick={() => onSet(value === false ? null : false)}
          className={
            "px-3 py-2 rounded-md text-sm border text-left transition " +
            (value === false
              ? "bg-slate-700 text-white border-slate-800"
              : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
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
    <div className="card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Sustainability programs</h3>
        <span className="text-xs text-slate-500">All optional — not scored</span>
      </div>
      <p className="text-xs text-slate-500 -mt-2">Tap a button to answer. Tap again to clear.</p>

      <SurveyItem q={SURVEY_QUESTIONS.forinto} value={props.donatesForinto} onSet={props.setDonatesForinto} />
      <SurveyItem q={SURVEY_QUESTIONS.pantry}  value={props.donatesPantry}  onSet={props.setDonatesPantry} />
      <SurveyItem q={SURVEY_QUESTIONS.reuse}   value={props.reuseProgram}   onSet={props.setReuseProgram} />
      <SurveyItem q={SURVEY_QUESTIONS.energy}  value={props.energyPlan}     onSet={props.setEnergyPlan} />
      <SurveyItem q={SURVEY_QUESTIONS.water}   value={props.waterPlan}      onSet={props.setWaterPlan} />

      <label className="flex items-center gap-2 text-sm pt-2 border-t border-slate-200">
        <input type="checkbox" checked={props.wantsContact} onChange={(e) => props.setWantsContact(e.target.checked)} />
        I'd like to be contacted about expanding any of these programs.
      </label>
      {props.wantsContact && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input className="input" placeholder="Name"  value={props.contactName}  onChange={(e) => props.setContactName(e.target.value)} />
          <input className="input" placeholder="Phone" value={props.contactPhone} onChange={(e) => props.setContactPhone(e.target.value)} />
          <input className="input" placeholder="Email" value={props.contactEmail} onChange={(e) => props.setContactEmail(e.target.value)} />
        </div>
      )}
    </div>
  );
}
