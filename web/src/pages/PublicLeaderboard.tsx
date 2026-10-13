import { Link } from "react-router-dom";
import Leaderboard from "./Leaderboard";

export default function PublicLeaderboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-cmu text-white border-b border-cmu-dark pt-safe">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-semibold tracking-tight leading-tight truncate">CMU Dining — Leaderboard</div>
            <div className="text-[11px] text-white/70 leading-tight">Tier badges only · scores stay private</div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Link to="/" className="min-h-10 px-2.5 flex items-center rounded-lg text-xs font-semibold text-white/85 hover:bg-white/10 active:bg-white/15">Submit audit</Link>
            <Link to="/login" className="min-h-10 px-2.5 flex items-center rounded-lg text-xs font-semibold text-white/85 hover:bg-white/10 active:bg-white/15">Sign in</Link>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5 sm:py-6 pb-safe">
        <Leaderboard />
      </main>
    </div>
  );
}
