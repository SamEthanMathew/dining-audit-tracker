import { Link } from "react-router-dom";
import Leaderboard from "./Leaderboard";

export default function PublicLeaderboard() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-cmu text-white border-b border-cmu-dark">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-semibold tracking-tight">CMU Dining — Leaderboard</div>
            <div className="text-xs text-white/80">Tier badges only · scores stay private</div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/" className="text-white/80 hover:text-white underline-offset-4 hover:underline">Submit audit</Link>
            <Link to="/login" className="text-white/80 hover:text-white underline-offset-4 hover:underline">Admin sign in</Link>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        <Leaderboard />
      </main>
    </div>
  );
}
