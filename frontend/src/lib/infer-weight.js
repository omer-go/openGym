// A first weight for a lift you have never logged, read off a similar one you have: a dumbbell
// bench press from your barbell bench, a barbell bench from your Smith bench, and, when nothing
// that close is logged, another lift for the same muscles. Pure.
//
// The closer the source, the more of it carries over (REACH):
//   0  the same lift on other kit (equivalents.js, tier 'lift': the popular list groups a dumbbell
//      and a Smith bench with the barbell one), or the same named movement on other kit (a
//      dumbbell preacher curl for the barbell preacher curl): a tenth off;
//   1  another variant of the movement (a hack squat for a Smith squat, an alternate curl for a
//      barbell curl), or the same lift across a cable stack or a machine: a quarter off;
//   2  another movement for the same slot and muscles (a front squat off a back squat, a kickback
//      off a lying triceps extension): about a third off.
// Their numbers are not one another's, so the far ones start well under what the source says:
// a first weight too light costs a set, one too heavy the session.
//
// The load moves between kits through what each lets you lift against a barbell (KIT): a Smith
// machine steadies the bar, so you move about a tenth more on it; two dumbbells take about four
// fifths of the bar between them, balanced on their own; one dumbbell in one hand a little more
// than half of that. A cable stack or a machine is its own scale: read across from another kind,
// its load is taken as it is, a step further off. The estimate is the source's recent best
// one-rep max carried over, cut by its reach, at today's reps with two in the tank, rounded down
// to a weight you can load.
import { EXIDX, isBodyweightEq } from './exercises.js'
import { equivalentsOf } from './equivalents.js'
import { e1rmSeries, estimate1RM, formulaOf, REP_CAP, WEIGHTED_REP_CAP } from './onerm.js'
import { bestWeightFor, modeOf, isPerSide, workoutAt } from './history.js'
import { BELL_EQ, bellsIn, currentDbLoad, dbLoadFor, ownedWeightsFor, ownedFloor } from './dumbbells.js'
import { weightIncrement } from './progression.js'
import { barWeightFor } from './bar.js'

// What a kit lets you lift against a barbell, by the catalogue's equipment. A bell's is one bell
// in a two-handed lift (`bell`) or in a one-arm one (`one`).
const KIT = {
  barbell: 1, 'olympic barbell': 1, 'ez barbell': 1, 'trap bar': 1.1, 'smith machine': 1.1,
  dumbbell: { bell: 0.4, one: 0.45 }, kettlebell: { bell: 0.35, one: 0.4 },
}
// Their own scale: read only from the same kind.
const OWN_SCALE = new Set(['cable', 'leverage machine', 'sled machine'])
// What carries over at each reach, closest first (above). A tenth off even for the same lift: the
// first time on it is no time for its heaviest weight.
export const REACH = [0.9, 0.75, 0.65]
export const NEW_LIFT = REACH[0]
// Reps left in the tank at the estimate.
const RIR = 2
// The last sessions a source's best is read from, so a year-old peak is not today's.
const RECENT = 5

// The words a name says its kit with, and the ones that only say the same lift twice ("barbell
// full squat" is the "smith squat").
const KIT_WORDS = /\b(barbell|olympic|ez|trap bar|smith( machine)?|dumbbells?|kettlebells?|cable|lever|machine|sled)\b/g
const FILLER = /\b(full|biceps|chest|standing)\b/g
const coreOf = name => String(name || '').toLowerCase().replace(KIT_WORDS, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim()

const kitOf = ex => (OWN_SCALE.has(ex?.eq) ? ex.eq : KIT[ex?.eq] != null ? ex.eq : null)

/** How a load on exercise `ex` (in the meaning `as`, dumbbells.js) compares with a barbell's. */
function toBar(load, ex, as, cfg) {
  const k = KIT[ex.eq]
  // A stack or a machine reads only its own kind (OWN_SCALE): the load as it is.
  if (k == null) return load
  if (typeof k === 'number') return load / k
  // A two-bell lift logged as both together is two bells' worth; as entered or each is one bell.
  const n = bellsIn(cfg)
  const bell = as === 'total' && n === 2 ? load / 2 : load
  return bell / (n === 2 ? k.bell : k.one)
}
function fromBar(load, ex, as, cfg) {
  const k = KIT[ex.eq]
  if (k == null) return load
  if (typeof k === 'number') return load * k
  const n = bellsIn(cfg)
  const bell = load * (n === 2 ? k.bell : k.one)
  return as === 'total' && n === 2 ? bell * 2 : bell
}

/** Whether exercise `id` has a load of its own logged, or a working weight you confirmed. */
export const hasOwnWeight = (S, id) => bestWeightFor(S, id) > 0 || (S?.exWeights?.[id]?.w || 0) > 0

/**
 * A first weight for `cfg` (an exercise config with its `id`, reps and dumbbell meaning) from a
 * similar lift you have logged: `{ w, from, est }`, `from` the lift it was read off and `est`
 * that lift's one-rep max in this one's kit. Null when the lift has a weight of its own, is
 * no loaded lift by reps, or nothing like it has been logged.
 */
export function inferWeight(S, cfg) {
  const ex = EXIDX[cfg?.id]
  if (!S || !ex || modeOf(cfg) !== 'reps' || cfg.bodyweight || isBodyweightEq(cfg.id)) return null
  const kit = kitOf(ex)
  if (!kit || hasOwnWeight(S, cfg.id)) return null
  const core = coreOf(ex.n)
  const formula = formulaOf(S)
  let best = null
  for (const { ex: src, tier } of equivalentsOf(S, cfg.id, { scope: 'all' })) {
    const own = kitOf(src)
    if (!own) continue
    // A stack or a machine is its own scale: across to another kind is a step further off.
    const across = (OWN_SCALE.has(own) || OWN_SCALE.has(kit)) && own !== kit
    const near = tier === 'lift' || (tier === 'move' && coreOf(src.n) === core)
    const rank = tier === 'muscle' ? 2 : near && !across ? 0 : 1
    if (best && rank > best.rank) continue
    const as = currentDbLoad(S, src.id)
    const seen = recentMax(S, src.id, formula, as)
    if (!seen) continue
    // The closest reach, then the lift you trained last.
    if (!best || rank < best.rank || seen.at > best.at) best = { src, as, ...seen, rank }
  }
  if (!best) return null
  const as = dbLoadFor(S, cfg)
  const srcCfg = { id: best.src.id }
  const est = fromBar(toBar(best.top, best.src, best.as, srcCfg), ex, as, cfg) * REACH[best.rank]
  // Sized for the reps the rows open at (the top of a range, `reps`), so a set of fifteen is not
  // loaded for ten. Each arm's or leg's: a per-side count is the total across both.
  const reps = Math.max(1, Math.round((cfg.reps > 0 ? cfg.reps : cfg.repsMin || 8) / (isPerSide(cfg) ? 2 : 1)))
  // Past the formula's rep cap Epley's line carries on (a max over one rep's weight of 1 + reps / 30);
  // without it a set of fifteen would open at the whole max.
  const ratio = (estimate1RM(100, reps + RIR, formula) || 100 * (1 + (reps + RIR) / 30)) / 100
  const raw = est / ratio
  const owned = BELL_EQ.has(ex.eq) ? ownedWeightsFor(S, cfg) : null
  const inc = weightIncrement(cfg, S.unit)
  let w = owned ? ownedFloor(owned, raw) : Math.floor(raw / inc + 1e-9) * inc
  w = Math.max(w, barWeightFor(S, cfg.id) || 0)
  if (!(w > 0)) return null
  return { w: Math.round(w * 1000) / 1000, from: best.src.id, est: Math.round(est * 10) / 10, reach: best.rank }
}

// Lift `id`'s best one-rep max over its last sessions, and when it was trained last: `{ top, at }`,
// null with no load logged. Sets past the formula's rep cap give no estimate (a calf raise for
// twenty); read as if done at the cap they come out under the real max, which a first weight
// can afford.
function recentMax(S, id, formula, as) {
  const pts = e1rmSeries(S, id, formula, as).slice(-RECENT)
  if (pts.length) return { top: Math.max(...pts.map(p => p.y)), at: pts[pts.length - 1].t || 0 }
  const w = bestWeightFor(S, id, as)
  const top = w > 0 ? estimate1RM(w, formula === 'weighted' ? WEIGHTED_REP_CAP : REP_CAP, formula) : null
  if (!(top > 0)) return null
  const last = (S.workouts || []).filter(x => x.entries?.some(e => e.id === id)).pop()
  return { top, at: (last && workoutAt(last)) || 0 }
}

/**
 * `cfg` with a first weight read off a similar lift (inferWeight) when it has none of its own
 * and sets none: `{ cfg, guess }`, `guess` null and `cfg` as it was otherwise.
 */
export function withInferredWeight(S, cfg) {
  if (!cfg || cfg.weight > 0) return { cfg, guess: null }
  const guess = inferWeight(S, cfg)
  return guess ? { cfg: { ...cfg, weight: guess.w }, guess } : { cfg, guess: null }
}
