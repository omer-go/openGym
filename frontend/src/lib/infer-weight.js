// A first weight for a lift you have never logged, read off a similar one you have: a dumbbell
// bench press from your barbell bench, a barbell bench from your Smith bench. Pure.
//
// "Similar" is the same lift on other kit (equivalents.js, tier 'lift': the popular list groups a
// dumbbell and a Smith bench with the barbell one), or the same named movement on other kit (a
// dumbbell preacher curl for the barbell preacher curl). A front squat is not a back squat with
// another bar, nor a goblet squat a squat with a dumbbell: their numbers are not one another's, so
// only the name with its kit taken out has to match.
//
// The load moves between kits through what each lets you lift against a barbell (KIT): a Smith
// machine steadies the bar, so you move about a tenth more on it; two dumbbells take about four
// fifths of the bar between them, balanced on their own; one dumbbell in one hand a little more
// than half of that. A cable stack or a machine is its own scale, so it only reads its own kind.
// The estimate is the source's recent best one-rep max carried over, a tenth off for a lift you
// have not done yet, at today's reps with two in the tank, rounded down to a weight you can load.
import { EXIDX, isBodyweightEq } from './exercises.js'
import { equivalentsOf } from './equivalents.js'
import { e1rmSeries, estimate1RM, formulaOf } from './onerm.js'
import { bestWeightFor, modeOf, isPerSide } from './history.js'
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
// A tenth off: the first time on a lift is no time for its heaviest weight.
export const NEW_LIFT = 0.9
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
  if (typeof k === 'number') return load / k
  // A two-bell lift logged as both together is two bells' worth; as entered or each is one bell.
  const n = bellsIn(cfg)
  const bell = as === 'total' && n === 2 ? load / 2 : load
  return bell / (n === 2 ? k.bell : k.one)
}
function fromBar(load, ex, as, cfg) {
  const k = KIT[ex.eq]
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
    if (tier === 'muscle' || (tier === 'move' && coreOf(src.n) !== core)) continue
    const own = kitOf(src)
    // A stack or a machine only speaks for its own kind.
    if (!own || ((OWN_SCALE.has(own) || OWN_SCALE.has(kit)) && own !== kit)) continue
    const as = currentDbLoad(S, src.id)
    const pts = e1rmSeries(S, src.id, formula, as).slice(-RECENT)
    if (!pts.length) continue
    const top = Math.max(...pts.map(p => p.y))
    const at = pts[pts.length - 1].t || 0
    const rank = tier === 'lift' ? 0 : 1
    // The closest tier, then the lift you trained last.
    if (!best || rank < best.rank || (rank === best.rank && at > best.at)) best = { src, as, top, at, rank }
  }
  if (!best) return null
  const as = dbLoadFor(S, cfg)
  const srcCfg = { id: best.src.id }
  const est = fromBar(toBar(best.top, best.src, best.as, srcCfg), ex, as, cfg) * NEW_LIFT
  // Today's reps are each arm's or leg's; a per-side count is the total across both.
  const reps = Math.max(1, Math.round((cfg.repsMin > 0 ? cfg.repsMin : cfg.reps || 8) / (isPerSide(cfg) ? 2 : 1)))
  const ratio = (estimate1RM(100, reps + RIR, formula) || 100) / 100
  const raw = est / ratio
  const owned = BELL_EQ.has(ex.eq) ? ownedWeightsFor(S, cfg) : null
  const inc = weightIncrement(cfg, S.unit)
  let w = owned ? ownedFloor(owned, raw) : Math.floor(raw / inc + 1e-9) * inc
  w = Math.max(w, barWeightFor(S, cfg.id) || 0)
  if (!(w > 0)) return null
  return { w: Math.round(w * 1000) / 1000, from: best.src.id, est: Math.round(est * 10) / 10 }
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
