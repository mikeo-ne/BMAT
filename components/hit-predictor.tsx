import { VERDICT_LABEL, type HitCandidate } from "@/lib/geography";
import { EMERGING_SPIN_FLOOR } from "@/lib/geography";

interface HitPredictorProps {
  candidates: HitCandidate[];
}

const VERDICT_TONE: Record<HitCandidate["verdict"], string> = {
  "breaking-now": "text-accent",
  watch: "text-brand",
  early: "text-muted",
};

/**
 * A&R hit predictor.
 *
 * The Ugandan break pattern is regional first: a record works Gulu, Mbale or
 * Mbarara for two or three weeks before Kampala adds it. So the signal is a
 * track clearing the spin floor in a secondary market while Kampala is still
 * quiet — the higher the ratio, the further the record is from crossing over,
 * and the earlier the A&R desk gets it.
 */
export function HitPredictor({ candidates }: HitPredictorProps) {
  return (
    <section className="panel p-4" aria-labelledby="hit-predictor-heading">
      <h2 id="hit-predictor-heading" className="text-sm font-semibold tracking-tight">
        A&amp;R hit predictor — emerging regional tracks
      </h2>
      <p className="mt-1 text-xs text-muted">
        Over {EMERGING_SPIN_FLOOR} spins this week in a secondary market, ranked by how far ahead of
        Kampala they are.
      </p>

      {candidates.length === 0 ? (
        <p className="mt-4 rounded border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
          No track has cleared the secondary-market floor this week.
        </p>
      ) : (
        <ol className="mt-4 space-y-2.5">
          {candidates.map((candidate, rank) => (
            <li key={candidate.trackId} className="rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="mr-2 font-mono text-[11px] text-muted">#{rank + 1}</span>
                    {candidate.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {candidate.primaryArtist} · {candidate.genre}
                  </p>
                </div>

                <div className="text-right">
                  <p className="font-mono text-2xl font-semibold leading-none">
                    {candidate.score}
                  </p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-muted">
                    breakout score
                  </p>
                </div>
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
                <div>
                  <dt className="text-muted">Breakout hub</dt>
                  <dd className="mt-0.5 font-medium">{candidate.breakoutHub.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">Secondary spins</dt>
                  <dd className="mt-0.5 font-mono">{candidate.secondarySpins}</dd>
                </div>
                <div>
                  <dt className="text-muted">Kampala spins</dt>
                  <dd className="mt-0.5 font-mono">{candidate.kampalaSpins}</dd>
                </div>
              </dl>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`chip ${VERDICT_TONE[candidate.verdict]}`}>
                  {VERDICT_LABEL[candidate.verdict]}
                </span>
                <span className="text-[11px] text-muted">
                  {candidate.ratio.toFixed(1)}× more regional than Kampala airplay
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
