// An exercise's equivalents: the lifts that could take its place in a program day. "Could take its
// place" is the planner's own test (planner.js planLift): the same movement slot (a squat, a
// horizontal press, an isolation lift…), compound or not, aimed at the same group. Where the
// catalogue has muscle roles for both, they must also share a target muscle, so a lateral raise
// is not a rear-delt fly's equivalent though both are shoulder isolation work. An exercise the
// planner has no slot for (a forearm or neck lift, a custom one) is matched on its target muscle
// and movement instead (exercise-facets.js moveOf).
//
// Three tiers, closest first:
//   lift   — the same lift on other kit, as the popular list groups it (a dumbbell bench press
//            for the barbell one);
//   move   — the same movement and bench angle on another variant (a close-stance leg press for a
//            leg press, a Smith incline press for an incline dumbbell press);
//   muscle — another movement for the same slot and muscles (a push-up or a dip for a bench).
// Within each, the popular list's order, then the closer muscle roles, then the plainer name.
//
// `scope` 'mine' looks in your list (generate.js planPool: what a program is built from), 'all' in
// the whole catalogue you have the kit for, without the filmed form checks and the odd variants
// (exercise-facets.js isTail) that would bury the lifts you would pick.
import { allExercises, EXIDX, isCardio, patternOf } from './exercises.js'
import { isStretch } from './activities.js'
import { suggestable } from './skipped.js'
import { planPool } from './generate.js'
import { planLift } from './planner.js'
import { POPULAR, popularPlace } from './popular.js'
import { moveOf, angleOf, isDemo, isTail, rareWords } from './exercise-facets.js'
import { roleLikeness } from './similar-exercises.js'
import { muscleRolesOf } from './muscle-roles.js'

export const TIERS = [
  { id: 'lift', n: 'Same lift, other kit' },
  { id: 'move', n: 'Same movement' },
  { id: 'muscle', n: 'Same muscles, other movement' },
]

// Each popular id -> the lift it is one kit of.
const LIFT = new Map(Object.entries(POPULAR).flatMap(([m, lifts]) => lifts.flatMap(([, ids], i) => ids.map(id => [id, `${m}:${i}`]))))

// Kinds of training that stand in only for their own kind: a yoga pose, a hold, a jump, a snatch.
const OWN_KIND = new Set(['yoga', 'stretching', 'isometric', 'cardio', 'mobility', 'rehab', 'olympic', 'pilates', 'combat', 'plyometrics'])
// Movements that are a compound however the catalogue files them: no isolation lift's equivalent.
const BIG_MOVES = new Set(['squat', 'lunge', 'hinge', 'legpress', 'press', 'pushup', 'dip', 'pullup', 'pulldown', 'row'])

/** Whether `e` could stand in for `from`, by the rules above. */
export function fitsFor(from, e, rolesOf = muscleRolesOf) {
  if (!e || e.id === from.id) return false
  if ((OWN_KIND.has(e.cat) || OWN_KIND.has(from.cat)) && e.cat !== from.cat) return false
  const lf = planLift(from.id), le = planLift(e.id)
  if (lf) {
    if (!le || le.pat !== lf.pat || le.kind !== lf.kind || le.p[0] !== lf.p[0]) return false
    // An isolation lift for an isolation lift: a good morning works the hamstrings, but it is no leg curl.
    if (lf.kind === 'iso' && (patternOf(e) !== patternOf(from) || (BIG_MOVES.has(moveOf(e)) && !BIG_MOVES.has(moveOf(from))))) return false
  } else if (e.tg !== from.tg || moveOf(e) !== moveOf(from)) return false
  const both = rolesOf(from.id)?.target?.length && rolesOf(e.id)?.target?.length
  return both ? roleLikeness(from, e, rolesOf).target > 0 : e.tg === from.tg
}

const tierOf = (from, e) => {
  const lift = LIFT.get(from.id)
  if (lift && LIFT.get(e.id) === lift) return 'lift'
  return moveOf(e) === moveOf(from) && angleOf(e) === angleOf(from) ? 'move' : 'muscle'
}

/**
 * The equivalents of exercise `id`: `[{ ex, tier }]`, closest tier first (TIERS). `scope` 'mine'
 * (your list) or 'all' (the catalogue). Skipped exercises and kit you don't have are left out.
 */
export function equivalentsOf(S, id, { scope = 'mine', rolesOf = muscleRolesOf } = {}) {
  const all = allExercises(S || {})
  const from = EXIDX[id] || all.find(e => e.id === id)
  if (!from || isCardio(from) || isStretch(from)) return []
  const pool = scope === 'mine' ? planPool(S || {}).map(x => EXIDX[x] || all.find(e => e.id === x))
    : all.filter(e => suggestable(S, e) && !isTail(e))
  const rank = { lift: 0, move: 1, muscle: 2 }
  const like = e => roleLikeness(from, e, rolesOf)
  // The catalogue has a few lifts twice under one name; one of each is plenty.
  const names = new Set([from.n])
  return pool
    .filter(e => e && !isCardio(e) && !isStretch(e) && !isDemo(e) && fitsFor(from, e, rolesOf))
    .filter(e => !names.has(e.n) && names.add(e.n))
    .map(e => ({ ex: e, tier: tierOf(from, e), at: popularPlace(e.id), like: like(e), rare: rareWords(e) }))
    .sort((a, b) => rank[a.tier] - rank[b.tier] || a.at - b.at || b.like.target - a.like.target
      || b.like.helpers - a.like.helpers || a.rare - b.rare || a.ex.n.length - b.ex.n.length)
    .map(({ ex, tier }) => ({ ex, tier }))
}
