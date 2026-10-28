// One-tap workouts: a full-body, push, pull or leg session built from what your last 7 days
// left short. Pure: reads state, returns picks and session entries, never writes.
//
// A day type is the muscle groups it covers and how many exercises it has (GEN_TYPES, read as
// groups by genGroupsOf). lib/coverage.js picks the exercises: each one is the one that adds the
// most to the groups that still need it this week, secondary muscles counting too, so a squat
// covers quads, glutes and some hamstrings at once. Among picks that cover about the same, the
// part of the muscle, then the helpers, the tool and the position done longest ago win, so the
// bench press rotates through incline and decline, dumbbells and the smith machine. A part of a muscle the last two weeks left out
// (side delts that only helped presses) gets its own exercise, and a full body always keeps
// one lower-body compound. The session runs compounds first.
//
// Within a muscle, exercises you have already logged come first, longest-ago first; then the ones
// you starred (Choose your exercises keeps a lift by starring it, lib/curate.js); after them a
// short list of staple lifts, so a muscle you have never trained opens on a bench press, not
// on whichever of 300 catalogue rows sorts first. `shift` walks each choice one further:
// Shuffle in the workout is a shift + 1.
//
// A day of the running program (lib/program.js) rotates the same way: its own is how many
// exercises it takes and which groups the ones past the first fill (`share`), not which lifts.
// A variation you would rather not do is one swap away.
//
// The setup sheet before a one-tap workout (genSetup) can change how many exercises it has,
// which muscle groups it covers, add a run and stretches, and set the rest and warm-ups of every
// exercise. Sets and reps go by the lift's slot (GEN_SCHEME, engine.js) unless the setup sets its own for
// every exercise; generatedEntries builds the session from it.
import { EXIDX, isCardio, patternOf } from './exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { ACTIVITY_GROUPS, isStretch } from './activities.js'
import { musclesOf, doneSetItems } from './muscles.js'
import { partFocus, muscleRolesOf } from './muscle-roles.js'
import { entryWeights, workSets, weeklyNeed, variantHistory, pickForCoverage, liftKind, partsShort, spareParts, slotMuscleOf } from './coverage.js'
import { suggestable } from './skipped.js'
import { favIds } from './favourites.js'
import { POPULAR_IDS, popularBySlug } from './popular.js'
import { buildSets, applyIntensifierPlan, defaultConfig, freestyleConfig, isPerSide, modeOf } from './history.js'
import { weightIncrement, defaultIncrement } from './progression.js'
import { dropGrid } from './plates.js'
import { isoOf } from './format.js'
import { slotOf, slotScheme, sessionSlots, leadPattern, BLOCK_DAYS } from './engine.js'
import { withMeaning, historyAs, dbLoadFor, ownedWeightsFor } from './dumbbells.js'
import { isConditioning, strengthWorkouts } from './conditioning.js'

export const GEN_TYPES = {
  full: [['chest', 1], ['upper-back', 1], ['deltoids', 1], ['quadriceps', 1], ['hamstring|gluteal', 1], ['biceps|triceps', 1], ['calves|abs', 1]],
  push: [['chest', 2], ['deltoids', 2], ['triceps', 2]],
  pull: [['upper-back', 3], ['trapezius', 1], ['biceps', 2]],
  legs: [['quadriceps', 2], ['hamstring', 2], ['gluteal', 1], ['calves', 1]],
}

// The groups a day type's one lower-body compound comes from (coverage.js anchor): a full body
// without a squat, hinge or leg press is not one, even when the legs have had their week.
export const GEN_ANCHOR = { full: ['quads', 'hamstrings', 'glutes'] }

// English names, used as i18n keys where they are shown (t(GEN_NAME[type])).
export const GEN_NAME = { full: 'Full body', push: 'Push day', pull: 'Pull day', legs: 'Leg day' }

// Staple lifts per muscle, best first. Only reached for exercises you have not logged yet. The
// last few are the decline, smith and military-press variants the variety rotation moves on to.
// Only those on the popular list (lib/popular.js) count; where that leaves a muscle fewer than
// two, the list's own first few for it (the forearms' wrist curls) stand in.
const PICKS = {
  chest: ['0025', '0289', '0047', '0314', '0308', '1030', '0251', '0662', '0188', '0033', '0301', '0748', '0757'],
  deltoids: ['0426', '0405', '0091', '0334', '0178', '0603', '2137', '0383', '5609', '1162', '1224'],
  triceps: ['0241', '0030', '0061', '0814', '2188', '0333', '0187'],
  'upper-back': ['0652', '2330', '0027', '1323', '0861', '0293', '2393', '1326', '0327', '1350'],
  biceps: ['0031', '0313', '0447', '0318', '0868', '0372', '0070'],
  quadriceps: ['0043', '0739', '0042', '0585', '2290', '5516', '0770', '1571', '4722'],
  hamstring: ['0085', '0586', '0599', '1543', '1459'],
  gluteal: ['1060', '0032', '0336', '0054', '1409', '2146'],
  calves: ['0605', '1372', '0594', '0417', '0088'],
  abs: ['0175', '0472', '0274', '0463', '0276', '3449'],
  trapezius: ['0406', '0095', '0220', '0604'],
  forearm: ['1412', '1411', '1415', '2917', '4163'],
}
const ON_LIST = new Set(POPULAR_IDS)
const POP = popularBySlug()
export const STAPLES = Object.fromEntries(Object.entries(PICKS).map(([slug, ids]) => {
  const listed = ids.filter(id => ON_LIST.has(id))
  return [slug, listed.length >= 2 ? listed : (POP[slug] || []).length >= 2 ? POP[slug].slice(0, 5) : ids]
}))
// The rest of the popular list, muscle by muscle: reached for when the staples run short.
const LISTED = Object.fromEntries(Object.entries(POP).map(([slug, ids]) => [slug, ids.filter(id => !STAPLES[slug]?.includes(id))]))

// A muscle counts as trained by an exercise that works it at least this hard: every primary, not
// a supporting role (muscles.js weighs a secondary at 0.4) — a bench press is not a shoulder day.
const TRAINED_AT = 0.5

/** Muscle slug -> the latest ISO day it was trained, and exercise id -> { d, n } of logged use. */
export function trainingIndex(S) {
  const muscles = {}, exercises = {}
  for (const w of S?.workouts || []) {
    const d = typeof w?.d === 'string' ? w.d : null
    if (!d) continue
    for (const entry of w.entries || []) {
      if (!workSets(entry)) continue
      const seen = exercises[entry.id] || (exercises[entry.id] = { d, n: 0 })
      seen.n++
      if (d > seen.d) seen.d = d
      // A conditioning combo leaves its muscles due for a hard session (lib/conditioning.js)
      if (isConditioning(entry)) continue
      for (const [slug, weight] of Object.entries(entryWeights(entry))) {
        if (weight >= TRAINED_AT && !(muscles[slug] >= d)) muscles[slug] = d
      }
    }
  }
  return { muscles, exercises }
}

// Never trained sorts before any day; otherwise the earlier day is the staler one.
const staleKey = d => d || ''
const staler = (a, b) => (staleKey(a) < staleKey(b) ? -1 : staleKey(a) > staleKey(b) ? 1 : 0)

// A skill that takes years to learn (a handstand push-up, a muscle-up, a pistol squat): never
// offered ahead of an ordinary lift for the muscle, only once you have logged or starred it.
const SKILL = /\bhandstand\b|\bmuscle[- ]up\b|\bplanche\b|\bfront lever\b|\bback lever\b|\bhuman flag\b|\bpistol\b|\barcher\b|\bdragon flag\b|\bone arm (push|pull|chin)/
export const isSkill = ex => !!ex && SKILL.test(ex.n || '')
// An olympic lift (a power clean, a snatch pull, a jerk): power for the trained lifter, not the
// muscle a session is built for, and a technique of its own. It trains so many groups at once that
// it would lead every day over your squat; a session only takes one you have logged.
const OLYMPIC = /\b(clean|snatch|jerk)\b(?![- ]grip)/
export const isOlympic = ex => !!ex && OLYMPIC.test(ex.n || '')

/** The exercises a slot on `slug` may use, in the order they are offered. */
export function candidatesFor(S, slug, index = trainingIndex(S)) {
  // A stretch is filed under the muscle it lengthens; it is no strength slot's lift.
  const usable = ex => ex && !isCardio(ex) && ex.cat !== 'stretching' && suggestable(S, ex)
  // The slot an exercise fills is its main muscle's (coverage.js slotMuscleOf), not always the
  // catalogue's: a handstand push-up is a shoulder lift.
  const on = id => slotMuscleOf(EXIDX[id]) === slug
  const logged = Object.entries(index.exercises)
    .filter(([id]) => usable(EXIDX[id]) && on(id))
    .sort(([a, x], [b, y]) => staler(x.d, y.d) || y.n - x.n || (a < b ? -1 : 1))
    .map(([id]) => id)
  const starred = favIds(S).filter(id => usable(EXIDX[id]) && on(id) && !logged.includes(id) && !isOlympic(EXIDX[id]))
  // The staples are listed by hand under the slot they fill: a leg press is a quad staple,
  // whichever muscle the catalogue files it under.
  const fresh = id => usable(EXIDX[id]) && !logged.includes(id) && !starred.includes(id) && !isOlympic(EXIDX[id])
  const staples = (STAPLES[slug] || []).filter(fresh)
  // The rest of the list only once the staples run short: the session is built from the best
  // few, and a long tail of candidates would let an odd lift outscore them on coverage.
  const more = starred.length + staples.length < 2 ? (LISTED[slug] || []).filter(fresh) : []
  const plain = [...staples, ...more]
  return [...logged, ...starred, ...plain.filter(id => !isSkill(EXIDX[id])), ...plain.filter(id => isSkill(EXIDX[id]))]
}

// The listed lifts on `slug` that target a part a program day's spare slot may go to
// (coverage.js spareParts), past the staples: a hip abduction for the side glutes when the
// deadlifts and hip thrusts never get to them. Only the spare slot takes them.
function spareCandidates(S, slug, spare) {
  const muscles = new Set(spare.flatMap(p => p.muscles))
  if (!muscles.size) return []
  return (LISTED[slug] || []).filter(id => EXIDX[id] && !isCardio(EXIDX[id]) && suggestable(S, EXIDX[id])
    && (muscleRolesOf(id)?.target || []).some(m => muscles.has(m)))
}

/** How many exercises a `type` session has unless the setup says otherwise. */
export const genCount = type => (GEN_TYPES[type] || []).reduce((n, [, count]) => n + count, 0)

// The muscle groups the setup offers are the Add exercise groups (ADD_GROUPS). add-exercise.js
// imports this file too, so ADD_GROUPS is only read inside functions, never at load.
/** The group ids a `type` session covers by default: every group one of its slots trains. */
export const genGroupsOf = type => {
  const slugs = new Set((GEN_TYPES[type] || []).flatMap(([spec]) => spec.split('|')))
  return ADD_GROUPS.filter(g => g.m.some(m => slugs.has(m))).map(g => g.id)
}

/** What the setup sheet opens on for `type`, before anything is changed. */
export const genDefaults = type => ({
  count: genCount(type), groups: genGroupsOf(type), cardio: false, stretch: false,
  byKind: true, sets: 3, reps: 10, restSec: 0, warmupSets: 0, lastToFailure: false,
})

// Sets and reps for muscle growth, by the lift's slot in the session (engine.js): the day's first
// big lift leads at 4 × 6–8, the other big lifts take 3 × 8–12, the lifts for one muscle 3 × 10–15
// and calves, forearms and abs 2 × 12–20. Used unless the setup turns `byKind` off and sets its
// own for every lift.
export const GEN_SCHEME = Object.fromEntries(['lead', 'main', 'acc', 'small'].map(k => [k, slotScheme(k)]))
/**
 * What `setup` gives lift `id` in `slot` (engine.js slotOf, by its kind when not given):
 * `{ sets, lo, hi, rest }`, its slot's (GEN_SCHEME), or the setup's own sets and reps.
 */
export const genScheme = (id, setup, slot = slotOf(liftKind(id))) => (setup?.byKind === false
  ? { sets: setup.sets, lo: setup.reps, hi: setup.reps, rest: 0 } : GEN_SCHEME[slot] || GEN_SCHEME.main)
export const MAX_GEN_COUNT = 15

// Cardio you have logged comes back first, most recent first (a run is a habit, not a rotation);
// then the staples of each cardio area.
function cardioCandidates(S, index) {
  const usable = ex => ex && isCardio(ex) && suggestable(S, ex)
  const logged = Object.entries(index.exercises).filter(([id]) => usable(EXIDX[id]))
    .sort(([, x], [, y]) => staler(y.d, x.d)).map(([id]) => id)
  const staples = ACTIVITY_GROUPS[0].areas.flatMap(a => a.staples).filter(id => usable(EXIDX[id]) && !logged.includes(id))
  return [...logged, ...staples]
}
// Stretches for what the session trains first, then the rest; logged ones before the staples.
function stretchCandidates(S, index, slugs) {
  const usable = ex => ex && isStretch(ex) && suggestable(S, ex)
  const logged = Object.entries(index.exercises).filter(([id]) => usable(EXIDX[id]))
    .sort(([, x], [, y]) => staler(y.d, x.d)).map(([id]) => id)
  const staples = ACTIVITY_GROUPS[1].areas.flatMap(a => a.staples).filter(id => usable(EXIDX[id]) && !logged.includes(id))
  const hits = id => Object.entries(musclesOf(EXIDX[id])).some(([m, w]) => w >= TRAINED_AT && slugs.has(m))
  const all = [...logged, ...staples]
  return [...all.filter(hits), ...all.filter(id => !hits(id))]
}
export const GEN_STRETCHES = 2

/**
 * Group id -> the target muscles of the parts of it short of their weekly minimum (coverage.js
 * partsShort), else of the part the 14 days up to `now` trained least (muscle-roles.js
 * partFocus, as Add exercise marks it), for the `groups` given.
 */
export function partGaps(S, groups, now = Date.now()) {
  const today = isoOf(new Date(now)), from = isoOf(new Date(now - 13 * 864e5))
  const items = doneSetItems(strengthWorkouts(S?.workouts || []).filter(w => typeof w?.d === 'string' && w.d >= from && w.d <= today))
  const short = partsShort(S, groups, now)
  const gaps = {}
  for (const g of ADD_GROUPS) {
    if (!groups.includes(g.id)) continue
    if (short[g.id]) { gaps[g.id] = short[g.id].flatMap(p => p.muscles); continue }
    for (const slug of g.m) {
      const gap = partFocus(items, slug)
      if (gap) gaps[g.id] = [...(gaps[g.id] || []), ...gap.muscles]
    }
  }
  return gaps
}

/**
 * The lifts of the last `n` strength sessions before `now`, latest first, each by id: what a new
 * one goes easy on repeating.
 */
export function recentSessionIds(S, now = Date.now(), n = 3) {
  const today = isoOf(new Date(now))
  const at = w => w.start || 0
  return strengthWorkouts(S?.workouts || []).filter(w => typeof w?.d === 'string' && w.d <= today && at(w) < now
    && Array.isArray(w.entries) && w.entries.length)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : at(b) - at(a)))
    .slice(0, n).map(w => w.entries.map(e => e?.id).filter(id => id != null))
}
/** The lifts of the last strength session before `now`, by id. */
export const lastSessionIds = (S, now = Date.now()) => recentSessionIds(S, now, 1)[0] || []

const DAY_MS = 864e5
const dayNo = iso => Math.round(new Date(iso + 'T12:00:00').getTime() / DAY_MS)
// The lifts of a pattern you know best: two blocks of history before the block began.
const LEAD_HISTORY = 2 * BLOCK_DAYS

/**
 * The lift a `type` session leads with on `now`, from the candidates for the ticked `groups`:
 * the movement it is the day's turn for (engine.js leadPattern), done with the lift of that
 * movement you logged most in the two blocks before this one began, so it stays the same lift
 * for the whole block and has time to climb. A running program counts its days and blocks from
 * its start; without one, the week is the goal's days. Then the lift you logged most before
 * the block, then the one you have logged most in it so far, then the first candidate. A
 * movement for a muscle trained yesterday or today, or one you have no lift for, passes the
 * lead to the next day's. `{ id, pattern }`, or null when no candidate fits.
 */
export function leadFor(S, type, groups, now = Date.now(), index = trainingIndex(S)) {
  const today = isoOf(new Date(now))
  const p = S?.program
  const inProgram = !!p?.startedAt && Array.isArray(p.days) && p.days.includes(type) && p.startedAt <= today
  const n = inProgram ? p.days.filter(t => t === type).length : Math.max(1, S?.goals?.days || 3)
  const done = strengthWorkouts(S?.workouts || []).filter(w => w?.genType === type && typeof w.d === 'string' && w.d < today
    && (!inProgram || w.d >= p.startedAt) && Array.isArray(w.entries) && w.entries.length).length
  const since = dayNo(today) - (inProgram ? dayNo(p.startedAt) : 0)
  const block = Math.floor(since / BLOCK_DAYS)
  const start = dayNo(today) - (since % BLOCK_DAYS)
  const counts = {}, before = {}, inBlock = {}
  for (const w of strengthWorkouts(S?.workouts || [])) {
    if (typeof w?.d !== 'string' || w.d >= today) continue
    for (const e of w.entries || []) {
      if (!workSets(e)) continue
      if (dayNo(w.d) >= start) { inBlock[e.id] = (inBlock[e.id] || 0) + 1; continue }
      before[e.id] = (before[e.id] || 0) + 1
      if (dayNo(w.d) >= start - LEAD_HISTORY) counts[e.id] = (counts[e.id] || 0) + 1
    }
  }
  const slugs = ADD_GROUPS.filter(g => groups.includes(g.id)).flatMap(g => g.m)
  const ids = [...new Set(slugs.flatMap(slug => candidatesFor(S, slug, index)))].filter(id => liftKind(id) === 'compound')
  for (let k = 0; k < n; k++) {
    const pattern = leadPattern(type, done + k, n, block)
    // Not on a muscle trained yesterday or today: a bench press the day after one waits its turn.
    const fit = ids.filter(id => patternOf(id) === pattern && !(dayNo(today) - dayNo(index.muscles[slotMuscleOf(EXIDX[id])] || '1970-01-01') <= 1))
    if (!fit.length) continue
    const best = fit.map((id, rank) => ({ id, rank })).sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)
      || (before[b.id] || 0) - (before[a.id] || 0) || (inBlock[b.id] || 0) - (inBlock[a.id] || 0) || a.rank - b.rank)[0]
    return { id: best.id, pattern }
  }
  return null
}

/**
 * The exercises of a `type` session: [{ id, muscle, last }], compounds first. `muscle` is the
 * exercise's primary muscle and `last` the ISO day it was last trained, null when never; `at` is
 * the order it was picked in (the first n picked are what an n-exercise session would be).
 * `count` and `groups` are the setup's (genDefaults); `cardio` adds a run and `stretch` two
 * stretches after the lifts, as { id, kind: 'cardio' | 'stretch' }. `now` dates the week. A
 * program day passes its `share` (program.js dayShare) and the setup's `byKind` and `sets`, so
 * the exercises past the first of each group go to a part short of its minimum (spareParts),
 * then where the day is furthest short.
 */
export function generateWorkout(S, type, { shift = 0, count, groups, cardio = false, stretch = false, now = Date.now(), share = null, byKind, sets } = {}) {
  if (!GEN_TYPES[type]) return []
  const index = trainingIndex(S)
  const ticked = (groups || genGroupsOf(type)).filter(id => ADD_GROUPS.some(g => g.id === id))
  const spare = share ? spareParts(S, ticked, now) : []
  const slugs = ADD_GROUPS.filter(g => ticked.includes(g.id)).flatMap(g => g.m)
  // A day that leads with a squat or a deadlift has no other hinge: a romanian deadlift after
  // either is the lower back's third heavy lift of the day.
  const lead = leadFor(S, type, ticked, now, index)
  const heavy = lead && (lead.pattern === 'squat' || lead.pattern === 'hinge')
  const candidates = slugs.flatMap(slug => candidatesFor(S, slug, index).map((id, rank) => ({ id, rank })))
    .filter(c => !heavy || c.id === lead.id || patternOf(c.id) !== 'hinge' || liftKind(c.id) !== 'compound')
  const spareOnly = slugs.flatMap(slug => spareCandidates(S, slug, spare).map((id, rank) => ({ id, rank: 100 + rank })))
  const n = Math.max(0, Math.min(MAX_GEN_COUNT, count ?? genCount(type)))
  const [recent = [], ...earlier] = recentSessionIds(S, now)
  const picks = pickForCoverage(candidates, { count: n, groups: ticked, need: weeklyNeed(S, ticked, now), history: variantHistory(S), shift,
    anchor: GEN_ANCHOR[type] || [], gaps: partGaps(S, ticked, now),
    share, setsOf: id => genScheme(id, { byKind, sets }).sets || 0, spare, spareOnly,
    recent, earlier: earlier.flat(), known: Object.keys(index.exercises), first: lead?.id })
    .map(({ id, slug, at }) => ({ id, muscle: slug, last: index.muscles[slug] || null, at }))
  // The first big lift the session runs leads it (engine.js): the day's lead when it has one.
  sessionSlots(picks.map(p => liftKind(p.id))).forEach((slot, i) => { picks[i].slot = slot })
  const pickFrom = (list, k, kind) => {
    for (let i = 0; i < Math.min(k, list.length); i++) picks.push({ id: list[(shift + i) % list.length], muscle: null, last: null, kind })
  }
  if (cardio) pickFrom(cardioCandidates(S, index), 1, 'cardio')
  if (stretch) pickFrom(stretchCandidates(S, index, new Set(picks.map(p => p.muscle))), GEN_STRETCHES, 'stretch')
  return picks
}

/**
 * The target of one lift in a session built from `setup` (genDefaults): its sets and reps (genScheme),
 * rest and warm-ups on the exercise's own kind of set (a plank keeps its seconds). The weight is
 * last time's; an exercise's own numbers are set from its name in the workout once it starts.
 */
export function genConfig(S, id, setup, slot) {
  const base = freestyleConfig(S, { id, ...defaultConfig(id) })
  const def = defaultConfig(id, modeOf({ ...base, id }))
  const keep = {}
  for (const k of ['bodyweight', 'side', 'sec']) if (base[k] !== undefined) keep[k] = base[k]
  const want = genScheme(id, setup, slot)
  const cfg = { ...def, ...keep, sets: Math.max(1, Math.round(want.sets) || def.sets) }
  // The scheme's reps are each arm's or leg's; a per-side count is the total across both. A range
  // is climbed by double progression: the top is the target, the bottom where it opens.
  if (cfg.mode === 'reps') {
    const per = isPerSide(cfg) ? 2 : 1
    cfg.reps = Math.max(1, Math.round(want.hi) * per || def.reps)
    if (want.lo < want.hi) Object.assign(cfg, { repsMin: Math.round(want.lo) * per, prog: 'double' })
  }
  if (setup.restSec > 0) cfg.restSec = Math.round(setup.restSec)
  else if (want.rest > 0) cfg.restSec = want.rest
  if (setup.warmupSets > 0) cfg.warmupSets = Math.round(setup.warmupSets)
  if (setup.lastToFailure) cfg.lastToFailure = true
  return cfg
}

/**
 * The config of an exercise added to a running session, with the session's rest: a one-tap
 * workout's setup chose a rest for every lift in it (genConfig), and one added later keeps to
 * it instead of falling back to the app's default. Any other session leaves `cfg` as it is.
 */
export function withSessionRest(cfg, active) {
  const rest = Math.round(Number(active?.gen?.setup?.restSec)) || 0
  return cfg && rest > 0 ? { ...cfg, restSec: rest } : cfg
}

/**
 * The config of a lift added to a one-tap workout, or swapped into one: built from the workout's
 * setup the way the lifts it picked were (genConfig), so it takes the same sets and reps, rest,
 * warm-ups and last set to failure. Null in any other session, and for cardio and stretches,
 * which a one-tap workout builds the freestyle way too (generatedEntries).
 */
export function sessionConfig(S, id, active) {
  const setup = active?.gen?.setup
  if (!setup || id == null) return null
  const ex = EXIDX[id]
  if (ex ? (isCardio(ex) || isStretch(ex)) : modeOf({ id, ...defaultConfig(id) }) === 'cardio') return null
  return genConfig(S, id, setup)
}

/**
 * Session entries for `picks`, built the way a freestyle exercise added mid-workout is
 * (Workout.jsx): last time's target and loads, in the exercise's dumbbell meaning today.
 * With a `setup` the lifts take its target instead (genConfig) and open at it, the weight
 * falling back to last time's when none was typed. Cardio and stretches are always built
 * the freestyle way: the stopwatch measures them.
 * `gen` says why it was picked; the finish path keeps only what was logged, so it never
 * reaches the saved workout.
 */
export function generatedEntries(S, picks, setup = null) {
  return picks.map(({ id, muscle, last, kind, slot }) => {
    const planned = setup && !kind
    const cfg = planned ? genConfig(S, id, setup, slot) : freestyleConfig(S, { id, ...defaultConfig(id) })
    const full = { ...cfg, id }
    const step = modeOf(full) === 'reps' ? (ownedWeightsFor(S, full) || weightIncrement(full, S.unit)) : defaultIncrement(id, S.unit)
    const opts = planned ? { step, useTarget: true } : { step, preferLast: true }
    const sets = applyIntensifierPlan(buildSets(historyAs(S, id, dbLoadFor(S, full)), full, opts), full, dropGrid(S, full))
    return { id, target: withMeaning(S, cfg, id), plan: null, sets, gen: kind ? { k: kind } : { m: muscle, d: last } }
  })
}
