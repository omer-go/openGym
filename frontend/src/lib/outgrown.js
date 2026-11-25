// Dumbbell lifts your heaviest bell is too light for, which a one-tap day and a program stop
// picking (docs/dev/OUTGROWN_DUMBBELLS.md has the rules and worked examples). Pure.
//
// A planned lift climbs by double progression: every set at the top of its rep range, then more
// weight. A dumbbell lift is outgrown when that weight does not exist: you can do the heaviest
// bell you own (the cap, dumbbells.js) for the top of the range. Two ways to know:
//   own      you did it: the lift's recent one-rep max per bell is the cap's at those reps;
//   sibling  a lift like it says so: the closest one you log, carried over to two dumbbells
//            (infer-weight.js KIT and REACH), clears the cap at those reps with two in the tank
//            by MARGIN. Your own logs well under the cap (ROOM) overrule it.
// A sibling is the same lift on other kit, else the same movement and target muscle, else the
// same movement that works the lift's main muscle as a prime mover. One-sided lifts, machines and
// anything but plain strength work are no evidence and are not judged by any: balance, a stack's
// own scale and a swing's speed are not a barbell's load.
//
// Without a dumbbell inventory nothing is outgrown: nothing says how heavy your dumbbells go.
import { EXIDX, isBodyweightEq, isUnilateral } from './exercises.js'
import { moveOf, angleOf, isTail, isDemo } from './exercise-facets.js'
import { musclesOf } from './muscles.js'
import { slotMuscleOf, liftKind } from './coverage.js'
import { slotOf, slotScheme } from './engine.js'
import { POPULAR } from './popular.js'
import { estimate1RM, formulaOf } from './onerm.js'
import { entriesForExercise, metricRowsForEntry, modeOf, workoutAt } from './history.js'
import { isSideSet } from './workout-model.js'
import { isConditioning } from './conditioning.js'
import { bellsIn, currentDbLoad, dumbbellsOf, isOneArm, workoutAs } from './dumbbells.js'
import { goalTypeOf } from './goals.js'
import { KIT, REACH, RECENT, RIR, coreOf, fromBar, toBar } from './infer-weight.js'

/** Logs older than this say nothing of today, in days. */
export const FRESH = 84
/** How far a sibling's prediction must clear the cap: a prediction is not a log. */
export const MARGIN = 1.15
/** Own logs under this share of what the cap needs overrule a sibling: the lift has room. */
export const ROOM = 0.85

const DAY_MS = 86400000
// Each popular id -> the lift it is one kit of (as equivalents.js reads the list).
const LIFT = new Map(Object.entries(POPULAR).flatMap(([m, lifts]) => lifts.flatMap(([, ids], i) => ids.map(id => [id, `${m}:${i}`]))))
// Not a plain lift: thrown, jumped, held, done to one side, or two lifts in one.
const ODD = /swing|jump|plyo|thruster|snatch|\bclean|overhead squat|wall sit|\bhold\b|march|\bwalk|pull.through|cossack|\bside\b|\b(to|and)\b/
const noRoles = () => null
// A lift's movement and bare name, worked out once: every dumbbell lift is matched against every sibling.
const memo = fn => { const seen = new Map(); return ex => { if (!seen.has(ex.id)) seen.set(ex.id, fn(ex)); return seen.get(ex.id) } }
const moveFor = memo(ex => moveOf(ex)), coreFor = memo(ex => coreOf(ex.n))

const oneSided = ex => isUnilateral(ex) || isOneArm({ id: ex.id })
const cfgOf = ex => ({ id: ex.id, side: isUnilateral(ex) })
const loaded = ex => !!ex && modeOf({ id: ex.id }) === 'reps' && !isBodyweightEq(ex.id)
/** Whether `ex` can be a sibling or be judged by one: plain two-sided strength work on free kit. */
const plain = ex => loaded(ex) && KIT[ex.eq] != null && ex.cat === 'strength' && !oneSided(ex)
  && !isTail(ex) && !isDemo(ex) && !ODD.test(String(ex.n || '').toLowerCase())

/** What `formula` makes of one rep's weight at `reps`: a max over it. Epley's line past its rep cap. */
export const ratioAt = (reps, formula) => (reps <= 1 ? 1 : (estimate1RM(100, reps, formula) || 100 * (1 + reps / 30)) / 100)

/** The top of the rep range lift `id` is planned in under `goal` (engine.js SCHEMES), by its kind. */
export const topReps = (id, goal) => slotScheme(slotOf(liftKind(id)), goal).hi

/**
 * How close logged lift `src` is to dumbbell lift `ex`: 0 the same lift on other kit, 1 the same
 * movement, angle and target muscle, 2 the same movement with `ex`'s main muscle a prime mover
 * of `src`; null when it is no sibling.
 */
export function reachOf(ex, src) {
  if (!ex || !src || ex.id === src.id) return null
  const lift = LIFT.get(ex.id), core = coreFor(ex)
  if ((lift && LIFT.get(src.id) === lift) || (core && coreFor(src) === core)) return 0
  const move = moveFor(ex)
  if (!move || move === 'other' || moveFor(src) !== move) return null
  if (ex.tg && ex.tg === src.tg && angleOf(ex) === angleOf(src)) return 1
  return musclesOf(src)[slotMuscleOf(ex, noRoles)] >= 1 ? 2 : null
}

// Lift `id`'s best one-rep max over its last RECENT sessions within FRESH days of `now`, in the
// meaning its weights are read in: `{ top, as }`, null with no loaded set in them. Every done
// set counts, a set of twenty too (ratioAt), so a high-rep lift has a reading.
function recentTop(S, id, formula, now) {
  const as = currentDbLoad(S, id)
  const tops = []
  for (const w of S.workouts || []) {
    if (!(now - workoutAt(w) <= FRESH * DAY_MS)) continue
    let best = 0
    for (const e of entriesForExercise(workoutAs(w, id, as), id)) {
      if (isConditioning(e)) continue
      for (const s of metricRowsForEntry(e, 'reps')) {
        for (const set of isSideSet(s) ? [s.sides.L, s.sides.R].filter(x => x?.done === true) : [s]) {
          const wt = Number(set.w), r = Number(set.r)
          if (wt > 0 && r >= 1) best = Math.max(best, wt * ratioAt(Math.round(r), formula))
        }
      }
    }
    if (best > 0) tops.push(best)
  }
  const last = tops.slice(-RECENT)
  return last.length ? { top: Math.max(...last), as } : null
}

/**
 * What `S`'s recent logs say, read once for every lift judged: the cap, and each sibling you
 * could be read off with its one-rep max in barbell terms. Null without a dumbbell inventory.
 */
export function evidenceOf(S, { now = Date.now(), goal = goalTypeOf(S) } = {}) {
  const bells = dumbbellsOf(S)
  if (!bells.length) return null
  const formula = formulaOf(S)
  const ids = new Set()
  for (const w of S.workouts || []) {
    if (now - workoutAt(w) <= FRESH * DAY_MS) for (const e of w?.entries || []) if (e?.id) ids.add(e.id)
  }
  const sources = []
  for (const id of ids) {
    const ex = EXIDX[id]
    if (!plain(ex)) continue
    const seen = recentTop(S, id, formula, now)
    if (seen) sources.push({ ex, bar: toBar(seen.top, ex, seen.as, cfgOf(ex)) })
  }
  return { cap: bells[bells.length - 1], formula, goal, now, logged: ids, sources }
}

/**
 * Why dumbbell lift `id` is outgrown, or null when it is not (or is no dumbbell lift by reps):
 * `{ by: 'own' | 'sibling', cap, reps, need, own, from, reach, pred }`, one-rep maxes per bell.
 * `need` is the max that does the cap for `reps`, the top of the lift's range; `from` the sibling
 * it was read off at `reach`, `pred` what that predicts. `ev` is evidenceOf(S), built when not given.
 */
export function outgrown(S, id, ev = evidenceOf(S)) {
  const ex = EXIDX[id]
  if (!ev || !ex || ex.eq !== 'dumbbell' || !loaded(ex)) return null
  const reps = topReps(id, ev.goal)
  const need = ev.cap * ratioAt(reps, ev.formula)
  const cfg = cfgOf(ex)
  const seen = ev.logged.has(id) ? recentTop(S, id, ev.formula, ev.now) : null
  // One bell's: a two-bell lift logged as both together is halved.
  const own = seen ? (seen.as === 'total' && bellsIn(cfg) === 2 ? seen.top / 2 : seen.top) : null
  const base = { cap: ev.cap, reps, need, own }
  if (own != null && own >= need - 1e-9) return { ...base, by: 'own', from: null, reach: null, pred: null }
  if (!plain(ex) || (own != null && own < ROOM * need)) return null
  let best = null
  for (const src of ev.sources) {
    const reach = reachOf(ex, src.ex)
    if (reach == null || (best && reach > best.reach)) continue
    const pred = fromBar(src.bar, ex, 'each', cfg) * REACH[reach]
    if (!best || reach < best.reach || pred > best.pred) best = { from: src.ex.id, reach, pred }
  }
  if (!best || best.pred < MARGIN * ev.cap * ratioAt(reps + RIR, ev.formula)) return null
  return { ...base, by: 'sibling', ...best }
}

const DUMBBELL_IDS = () => Object.values(EXIDX).filter(ex => ex.eq === 'dumbbell').map(ex => ex.id)

/**
 * The dumbbell lifts among `ids` (the whole catalogue's when not given) that `S` has outgrown:
 * what a plan leaves out beside the skipped ones. [] without a dumbbell inventory.
 */
export function outgrownIds(S, ids, opts) {
  const ev = evidenceOf(S, opts)
  if (!ev) return []
  return (ids || DUMBBELL_IDS()).filter(id => EXIDX[id]?.eq === 'dumbbell' && outgrown(S, id, ev))
}
