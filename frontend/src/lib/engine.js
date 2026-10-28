// The one place a built session's sets and reps come from, whoever builds it: a one-tap workout,
// a day of the running program, or a week the program builder lays out (planner.js). Pure.
//
// Every lift has a slot in its session. The day's first big lift is its lead: the heaviest, the
// fewest reps, the longest rest. The other lifts that train three groups or more are its main
// lifts, the ones for one muscle its accessories, and calves, forearms and abs take the most reps
// of all. The goal (SCHEMES) sets each slot's sets, rep range and rest; the reps are a
// range climbed by double progression, so a lift takes more weight once every set reaches the top.

// Rep schemes by goal and slot: lo–hi reps, rir = reps left in the tank, rest in seconds.
// English names, used as i18n keys where they are shown. `base` is the weekly sets a group aims for.
export const SCHEMES = {
  strength: { n: 'Strength', base: 8, leadSets: 5, slotSets: 3, slotMin: 3, accMin: 2, accMax: 3,
    lead: { lo: 3, hi: 5, rir: 2, rest: 240 }, main: { lo: 3, hi: 5, rir: 2, rest: 180 }, acc: { lo: 8, hi: 12, rir: 1, rest: 90 }, small: { lo: 10, hi: 15, rir: 1, rest: 60 } },
  growth: { n: 'Muscle', base: 10, leadSets: 4, slotSets: 3, slotMin: 3, accMin: 2, accMax: 4,
    lead: { lo: 6, hi: 8, rir: 2, rest: 180 }, main: { lo: 8, hi: 12, rir: 2, rest: 120 }, acc: { lo: 10, hi: 15, rir: 1, rest: 90 }, small: { lo: 12, hi: 20, rir: 1, rest: 60 } },
  maintain: { n: 'Maintain', base: 6, leadSets: 3, slotSets: 3, slotMin: 2, accMin: 2, accMax: 3,
    lead: { lo: 6, hi: 8, rir: 3, rest: 180 }, main: { lo: 8, hi: 12, rir: 3, rest: 120 }, acc: { lo: 10, hi: 15, rir: 2, rest: 75 }, small: { lo: 12, hi: 20, rir: 2, rest: 60 } },
  endurance: { n: 'Endurance', base: 8, leadSets: 3, slotSets: 3, slotMin: 2, accMin: 2, accMax: 3,
    lead: { lo: 12, hi: 15, rir: 2, rest: 90 }, main: { lo: 15, hi: 20, rir: 1, rest: 60 }, acc: { lo: 15, hi: 25, rir: 1, rest: 45 }, small: { lo: 20, hi: 30, rir: 0, rest: 45 } },
}
export const ENGINE_GOAL = 'growth'
// Sets for each slot. A lead takes the goal's own; an accessory the fewest the goal gives one,
// and one more for a group of its own (a curl), as a small group's lift is mostly a second
// exercise for muscles the big lifts already worked.
const SLOT_SETS = { lead: sc => sc.leadSets, main: sc => sc.slotSets, acc: sc => Math.min(sc.accMax, sc.accMin + 1), small: sc => sc.accMin }

// A lift may take sets past its slot's to give its group the day's share: two more at most, and
// never past five. A group's second exercise comes only once its first has them all: a fourth
// and fifth set of the bench, not a push-up after it.
export const MAX_SETS = 5
export const EXTRA_SETS = 2
export const roomOf = sets => Math.max(sets, Math.min(MAX_SETS, sets + EXTRA_SETS))

// Imports nothing: coverage.js, generate.js and planner.js all read it at load.

/**
 * The slot of a lift of `kind` (coverage.js liftKind: 'compound', 'isolation' or 'small') in a
 * session: 'lead' when it leads the day, else by its kind.
 */
export const slotOf = (kind, lead = false) =>
  kind === 'small' ? 'small' : lead && kind === 'compound' ? 'lead' : kind === 'compound' ? 'main' : 'acc'

/**
 * What a lift takes in `slot` ('lead', 'main', 'acc' or 'small', slotOf) for `goal`:
 * `{ sets, lo, hi, rest }`, the reps each arm's or leg's.
 */
export function slotScheme(slot, goal = ENGINE_GOAL) {
  const sc = SCHEMES[goal] || SCHEMES[ENGINE_GOAL]
  const s = sc[slot] || sc.main
  return { sets: (SLOT_SETS[slot] || SLOT_SETS.main)(sc), lo: s.lo, hi: s.hi, rest: s.rest }
}

/**
 * The slots of a session's lifts, in the order they run: the first big lift leads, the rest go
 * by their kind (slotOf). Kinds -> slots, in the same order.
 */
export function sessionSlots(kinds) {
  let led = false
  return kinds.map(kind => {
    const slot = slotOf(kind, !led)
    if (slot === 'lead') led = true
    return slot
  })
}

// The movements a day leads with. A full body alternates a lower-body lead (a squat, then a
// hinge) with an upper-body one, and the upper-body lead moves on each block: three days a week
// lead squat, bench, deadlift for four weeks, then squat, pull-up, deadlift. A day of one kind
// takes its kind's in turn. Pattern names are the catalogue's (exercises.js patternOf).
const LOWER_LEADS = ['squat', 'hinge']
const UPPER_LEADS = ['push-horizontal', 'pull-vertical', 'push-vertical', 'pull-horizontal']
const TYPE_LEADS = { push: ['push-horizontal', 'push-vertical'], pull: ['pull-vertical', 'pull-horizontal'], legs: LOWER_LEADS }
// A block: the weeks a day keeps its lead lift, so it has time to climb.
export const BLOCK_DAYS = 28

/**
 * The movement session `i` of a `type` day leads with, when `n` such days make a week, in
 * block `block`. Null for a type with no leads.
 */
export function leadPattern(type, i, n, block = 0) {
  if (type !== 'full') {
    const leads = TYPE_LEADS[type]
    return leads ? leads[i % leads.length] : null
  }
  const k = i % Math.max(1, n)
  return k % 2 === 0 ? LOWER_LEADS[(k / 2) % 2] : UPPER_LEADS[(block + (k - 1) / 2) % UPPER_LEADS.length]
}
