// Muscle-group coverage: how much an exercise gives each muscle group, what the last 7 days left
// short, and which exercises fill that best. The one-tap workouts (generate.js) pick with it.
// Pure: reads state, never writes.
//
// Credit. An exercise credits a group (Add exercise's groups, add-exercise.js ADD_GROUPS) with
// its best muscle weight there (muscles.js: primary 1, secondary 0.4), the group's main muscle
// (its first) at full weight and its other muscles at a quarter, so a deadlift (lower back) or
// shrugs (traps) are no back exercise. A squat credits quads and glutes 1, hamstrings, calves
// and abs 0.4.
//
// Weekly need. Credit × completed work sets over the goal's week (goals.js: the last 7 days, or
// the calendar week while a program runs) is the group's week; its goal (goals.js, 10 unless
// set) fills it. What is left is scaled by how rested the group's main muscle is (recovery.js fatigueOf).
//
// Picking. One exercise at a time, the one that adds the most coverage, weighted by need squared
// (a group with nothing this week beats two half-done ones). Coverage spreads before it stacks:
// first every group gets one exercise that targets its main muscle, then a second, and so on;
// a group under 0.1 (near its goal, or still tired) gets its one after every group over it has
// one, but before any second: the day after a full body, when every group is tired and only two
// or three are just over the line, is not those groups four times over. A group that has had
// its week (need 0) waits until no other group can take one. One movement comes once: two
// compounds with the same targets (a romanian and a stiff-legged deadlift, a squat and a split
// squat) only when nothing else is left. Calves, forearms and abs take one exercise each until
// then: a legs day whose thighs are still tired brings the thighs back before a second calf raise.
//
// Variety. Among picks that cover about the same, the part of the muscle (front, side or rear
// delt; upper or mid chest; lats or mid back: the exercise's target in its muscle roles,
// muscle-roles.js) last done longest ago for that group wins, then the helpers (its synergists),
// then the tool (barbell, dumbbell, smith…), then the position (standing, seated, lying,
// incline…, variant.js), then the exercise you know. So a flat barbell bench is followed by an
// incline press for the upper chest, and lateral raises by rear-delt work. Parts and helpers only
// decide where every exercise in the running has roles. Presses rotate with presses: an isolation lift is only offered where
// an isolation lift is best, or for the part of the group the last two weeks targeted least
// (`gaps`, muscle-roles.js partFocus): the group's first exercise is one for that part, so side
// delts that only ever helped a press get a lateral raise.
//
// Anchor. A session can name groups one compound must come from (`anchor`): a full body keeps
// a squat, hinge or leg press even in a week the legs have had, in the last slot if nothing
// earlier took one.
//
// The same numbers show elsewhere: the one-tap setup and the routine editor draw what a session
// adds per group (plannedSets), and Add exercise suggests groups and orders a group's exercises
// by what the session in progress still lacks (rankForGaps).
import { EXIDX, isCardio, patternOf, OPPOSITE_PATTERN } from './exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { musclesOf, weeklyPlanRoutines } from './muscles.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { hasCompletedWork, isWarmupRow } from './workout-model.js'
import { fatigueOf } from './recovery.js'
import { weeklyTargetOf, windowWorkouts } from './goals.js'
import { workoutAt } from './history.js'
import { variantOf } from './variant.js'
import { muscleRolesOf } from './muscle-roles.js'
import { isConditioning } from './conditioning.js'

/** The default weekly goal; the one in use is goals.js weeklyTargetOf. */
export const WEEKLY_TARGET = 10
const OTHER_MUSCLE = 0.25 // a group's other muscles credit it at a quarter
const RESTED = 0.1        // below this need, a group waits until the others are served
const MIN_WEIGHT = 0.02   // a group trained to target still counts for something
const OVER = 0.25         // the cost of credit to a group already at its cap
const NEAR = 0.75         // within this share of the best gain, picks count as equally good
const ALIKE = 0.5         // credit profiles closer than this are the same exercise twice
const SAME_SHAPE = 1      // credit profiles this close cover the same, so variety may choose
const CLOSE = 0.85         // a gain this close to the best still loses to a bigger compound
export const USEFUL = 1    // a group less than one set short of its day's share is served

/** The muscle weights of a logged entry: the catalogue's, else what was saved with it. */
export function entryWeights(entry) {
  const ex = EXIDX[entry?.id]
  if (ex) return musclesOf(ex)
  const snap = entry?.muscleSnapshot?.muscleWeights || entry?.muscleWeights
  if (snap && typeof snap === 'object') return snap
  return entry?.exercise ? musclesOf(entry.exercise) : {}   // a custom exercise logged with its muscles
}
/** Completed work sets of a logged entry, warm-ups left out. */
export const workSets = entry => (entry?.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s)).length

/** Group id -> [credit, the muscle that earned it], from a muscle -> weight map. */
function creditBy(weights) {
  const out = {}
  for (const g of ADD_GROUPS) {
    let best = 0, by = null
    g.m.forEach((m, i) => { const c = weights[m] > 0 ? weights[m] * (i ? OTHER_MUSCLE : 1) : 0; if (c > best) { best = c; by = m } })
    if (best > 0) out[g.id] = [best, by]
  }
  return out
}

/** Group id -> credit, from a muscle -> weight map. */
export function groupCredit(weights) {
  return Object.fromEntries(Object.entries(creditBy(weights)).map(([g, [c]]) => [g, c]))
}

const groupOf = slug => ADD_GROUPS.find(g => g.m.includes(slug)) || null
const isLift = ex => !!ex && !isCardio(ex) && ex.cat !== 'stretching'

/**
 * Effective sets per group that planned entries add: credit × work sets. An entry's sets are its
 * rows (a workout's, warm-ups left out) or a count (a routine's). Cardio and stretches add none.
 */
export function plannedSets(entries) {
  const out = {}
  for (const e of entries || []) {
    if (!isLift(EXIDX[e?.id]) && EXIDX[e?.id]) continue
    const n = Array.isArray(e?.sets) ? e.sets.filter(x => !isWarmupRow(x)).length : Number(e?.sets) || 0
    if (!n) continue
    for (const [g, c] of Object.entries(groupCredit(entryWeights(e)))) out[g] = (out[g] || 0) + c * n
  }
  return out
}

/** Group id -> credit the exercises of a session already give it, one exercise counted once. */
export function sessionCredit(entries) {
  const out = {}
  for (const e of entries || []) {
    if (!isLift(EXIDX[e?.id]) && EXIDX[e?.id]) continue
    for (const [g, c] of Object.entries(groupCredit(entryWeights(e)))) out[g] = (out[g] || 0) + c
  }
  return out
}

/**
 * Group id -> { muscle: effective sets }: the logged workouts' credit × completed work sets, each
 * set's credit under the muscle of the group that earned it, so the parts add up to the group
 * (Stats splits a group's bar with it). `keep` narrows the sets counted (Stats passes the
 * hard-set test).
 */
export function groupSplitOf(workouts, keep = null) {
  const out = {}
  for (const w of workouts || []) {
    for (const entry of w?.entries || []) {
      if (isConditioning(entry)) continue  // not a hard set (lib/conditioning.js)
      const n = keep ? (entry?.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s) && keep(s)).length : workSets(entry)
      if (!n) continue
      for (const [g, [c, m]] of Object.entries(creditBy(entryWeights(entry)))) {
        const parts = out[g] || (out[g] = {})
        parts[m] = (parts[m] || 0) + c * n
      }
    }
  }
  return out
}

/** Group id -> effective sets, from a split (groupSplitOf). */
export const splitTotals = split =>
  Object.fromEntries(Object.entries(split).map(([g, parts]) => [g, Object.values(parts).reduce((a, b) => a + b, 0)]))

/**
 * A split's parts in whole sets that add up to the group's own rounded number, the one its bar
 * shows: each part rounded down, then the leftover sets to the parts that lost the most.
 */
export function roundSplit(parts) {
  const entries = Object.entries(parts || {})
  const total = Math.round(entries.reduce((a, [, v]) => a + v, 0))
  const out = Object.fromEntries(entries.map(([m, v]) => [m, Math.floor(v)]))
  let left = total - Object.values(out).reduce((a, b) => a + b, 0)
  for (const [m] of entries.slice().sort((a, b) => (b[1] % 1) - (a[1] % 1))) {
    if (left <= 0) break
    out[m]++; left--
  }
  return out
}

/** Effective sets per group the logged workouts did: groupSplitOf added up. */
export const groupSetsOf = (workouts, keep = null) => splitTotals(groupSplitOf(workouts, keep))

/**
 * The workouts in the `days` before `now` (0: all of them) and how many weeks they span: the
 * period, cut to the first workout in it, never less than a week (groupSplitPerWeek).
 */
export function weeksOf(workouts, days, now = Date.now()) {
  const from = days ? now - days * 864e5 : -Infinity
  const inWin = (workouts || []).filter(w => { const at = workoutAt(w); return at > from && at <= now })
  if (!inWin.length) return { inWin, weeks: 1 }
  const first = Math.min(...inWin.map(workoutAt))
  return { inWin, weeks: Math.max(1, (now - Math.max(from, first)) / (7 * 864e5)) }
}

/**
 * groupSplitOf a week, averaged over the `days` before `now` (0: all of it). A period longer
 * than the training is cut to the first workout in it, so a fortnight of training read over 90
 * days is not a third of what it was. Never less than a week.
 */
export function groupSplitPerWeek(workouts, days, now = Date.now(), keep = null) {
  const { inWin, weeks } = weeksOf(workouts, days, now)
  if (!inWin.length) return {}
  return Object.fromEntries(Object.entries(groupSplitOf(inWin, keep)).map(([g, parts]) =>
    [g, Object.fromEntries(Object.entries(parts).map(([m, v]) => [m, v / weeks]))]))
}

/** Effective sets per group a week over the `days` before `now`: groupSplitPerWeek added up. */
export const groupSetsPerWeek = (workouts, days, now = Date.now(), keep = null) =>
  splitTotals(groupSplitPerWeek(workouts, days, now, keep))

/**
 * Effective sets per group the recurring week plans (muscles.js weeklyPlanRoutines: every weekday
 * routine once, plus a running rotation's sessions), counted as plannedSets counts a routine.
 */
export function groupSetsOfWeeklyPlan(S) {
  const custom = Object.fromEntries((S?.customEx || []).map(ex => [ex.id, ex]))
  const out = {}
  for (const routine of weeklyPlanRoutines(S)) {
    const adds = plannedSets((routine.ex || []).map(c => ({ id: c.id, sets: c.sets || 1, exercise: custom[c.id] || c })))
    for (const [g, v] of Object.entries(adds)) out[g] = (out[g] || 0) + v
  }
  return out
}

/** Effective sets per group over the goal's week up to `now` (goals.js goalWindow). */
export function weeklyDone(S, now = Date.now()) {
  return groupSetsOf(windowWorkouts(S, now))
}

/** Group id -> how much it still needs this week, 0–1, for the `groups` given. */
const needOf = (done, target) => (target > 0 ? Math.max(0, 1 - done / target) : 0)
export function weeklyNeed(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  const fatigue = fatigueOf(S?.workouts || [], now, { unit: S?.unit })
  const need = {}
  for (const id of groups) {
    const g = ADD_GROUPS.find(x => x.id === id)
    if (g) need[id] = needOf(done[id] || 0, weeklyTargetOf(S, id)) * (1 - (fatigue[g.m[0]] || 0))
  }
  return need
}

/**
 * Group id -> { part: { 'rear-delt': day }, helpers: { 'biceps,teres-major': day },
 * tool: { barbell: day }, position: { seated: day } }: when each was last done. A part is a
 * target muscle in the exercise's roles (`rolesOf`), the helpers its synergists as one set.
 */
export function variantHistory(S, rolesOf = muscleRolesOf) {
  const last = {}
  const mark = (seen, k, v, d) => { if (v != null && !(seen[k][v] >= d)) seen[k][v] = d }
  for (const w of S?.workouts || []) {
    if (typeof w?.d !== 'string') continue
    for (const entry of w.entries || []) {
      const ex = EXIDX[entry.id]
      const g = ex && workSets(entry) ? groupOf(primaryMuscleOf(entry)?.slug)?.id : null
      if (!g) continue
      const v = variantOf(ex), roles = rolesOf(entry.id)
      const seen = last[g] || (last[g] = { part: {}, helpers: {}, tool: {}, position: {} })
      for (const m of roles?.target || []) mark(seen, 'part', m, w.d)
      mark(seen, 'helpers', helpersOf(roles), w.d)
      mark(seen, 'tool', v.tool, w.d)
      mark(seen, 'position', v.position, w.d)
    }
  }
  return last
}
// The synergists of an exercise as one key, so two lifts that share them rotate as the same.
const helpersOf = roles => (roles ? [...(roles.synergists || [])].sort().join() : null)

// Within `share` of the best gain, which can be below zero when every pick left overfills a group.
const within = (g, best, share) => g >= best - Math.abs(best) * (1 - share)
const totalOf = credit => Object.values(credit).reduce((a, b) => a + b, 0)
// The small groups. The catalogue credits a barbell calf raise or a wrist curl over a bench to
// three groups, so an exercise for one never counts as a compound; and one exercise each is what
// a session gives them until the big groups are served, rested or not.
const SMALL = new Set(['calves', 'forearms', 'abs'])
// An exercise as the pickers weigh it, or null when its main muscle is in none of the groups.
// `last` is the day it was last logged, null when never.
function itemOf(id, rank, on, rolesOf) {
  const ex = EXIDX[id]
  const slug = primaryMuscleOf(ex)?.slug
  const g = groupOf(slug)
  if (!g || !on.has(g.id)) return null
  const full = groupCredit(musclesOf(ex))
  return {
    id, rank, slug, ex, group: g.id, main: g.m[0] === slug, variant: variantOf(ex),
    parts: rolesOf(id)?.target || null, helpers: helpersOf(rolesOf(id)),
    credit: Object.fromEntries(Object.entries(full).filter(([k]) => on.has(k))),
    total: totalOf(full),
    // A compound trains three groups or more in earnest (a bench: chest, shoulders, triceps);
    // a fly or a curl has one helper at most. Isolation lifts rotate among themselves.
    compound: liftKind(id) === 'compound',
    pattern: patternOf(ex),
  }
}
/**
 * What kind of lift `id` is, by the same measure the pickers use: 'small' for calves, forearms
 * and abs, 'compound' for one that trains three groups or more in earnest, else 'isolation'.
 */
export function liftKind(id) {
  const ex = EXIDX[id]
  const g = ex && groupOf(primaryMuscleOf(ex)?.slug)
  if (g && SMALL.has(g.id)) return 'small'
  return g && Object.values(groupCredit(musclesOf(ex))).filter(c => c >= 0.4).length >= 3 ? 'compound' : 'isolation'
}
// Sorts `list` staler first, for the group: the part of the muscle, then the helpers, the tool
// and the position last done longest ago, then the exercise you know best. A part, helper set or
// tool the session already uses for the group (`taken`, [{ group, parts, helpers, variant }])
// counts as the latest of all, so a second shoulder exercise is for another delt and a second
// back exercise on another tool. An exercise is as fresh as the stalest of its parts, the one it
// brings back: after pull-ups a row (mid back and lats) beats a pulldown. Parts and helpers count
// only when every exercise in `list` has roles; positions go by history only.
function fresherFor(history, taken) {
  const mine = (c, p) => p.group === c.group
  const done = (c, k, v, inSession) => (inSession ? '~' : history[c.group]?.[k]?.[v] || '')
  const partDone = c => c.parts.map(m => done(c, 'part', m, taken.some(p => mine(c, p) && p.parts?.includes(m))))
    .reduce((a, b) => (b < a ? b : a))
  const keys = [
    c => done(c, 'helpers', c.helpers, taken.some(p => mine(c, p) && p.helpers === c.helpers)),
    c => done(c, 'tool', c.variant.tool, taken.some(p => mine(c, p) && p.variant.tool === c.variant.tool)),
    c => done(c, 'position', c.variant.position, false),
  ]
  return list => {
    const roles = list.every(c => c.parts)
    const parts = roles ? new Map(list.map(c => [c, partDone(c)])) : null
    return list.sort((a, b) => {
      if (parts && parts.get(a) !== parts.get(b)) return parts.get(a) < parts.get(b) ? -1 : 1
      for (const key of roles ? keys : keys.slice(1)) {
        const x = key(a), y = key(b)
        if (x !== y) return x < y ? -1 : 1
      }
      return a.rank - b.rank
    })
  }
}
// What `c` adds to coverage `covered` capped at `cap` per group, weighted by need.
const gainOf = (c, covered, cap, weight) => Object.entries(c.credit).reduce((s, [g, a]) => s + weight(g) * (
  Math.min(cap, (covered[g] || 0) + a) - Math.min(cap, covered[g] || 0) - ((covered[g] || 0) >= cap ? OVER * a : 0)), 0)
const weightFor = need => g => Math.max((need[g] || 0) ** 2, MIN_WEIGHT)
// The sets `c` done `sets` times gives the groups still `short` of their share, less a quarter of
// what it gives past it: a row for a back short six sets before a calf raise short one.
const fillOf = (c, sets, short) => Object.entries(c.credit).reduce((s, [g, a]) => {
  const left = short(g)
  return s + Math.min(a * sets, left) - OVER * Math.max(0, a * sets - left)
}, 0)

// Two compounds with the same targets are one movement twice, whatever group each is filed
// under: a romanian deadlift (glutes) and a stiff-legged one (hamstrings) both hinge, a squat
// and a split squat both work glutes and quads. Two isolation lifts for the same part of one group
// are too: a barbell, a dumbbell and a cable shrug are one shrug three times. So are two
// compounds on the same tool in the same position that work the same groups, only weighted
// another way: a chest dip and a triceps dip are one dip.
const sameKeys = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => k in b)
const sameMove = (a, b) => (a.compound && b.compound && a.variant.tool === b.variant.tool
  && a.variant.position === b.variant.position && sameKeys(a.credit, b.credit))
  || ((a.compound ? b.compound : !b.compound && a.group === b.group) && !!a.parts && !!b.parts
  && a.parts.length === b.parts.length && a.parts.every(m => b.parts.includes(m)))

// How much `c` evens out the movements of `picks`: one for each pick of the movement that balances
// it (a row after a bench press, a deadlift after a squat), less one for each of its own. A
// movement with nothing to balance (a lunge, a curl) is even.
const balanceOf = (c, picks) => {
  const op = OPPOSITE_PATTERN[c.pattern]
  return op ? picks.filter(p => p.pattern === op).length - picks.filter(p => p.pattern === c.pattern).length : 0
}

const distance = (a, b) => {
  let d = 0
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[k] || 0) - (b[k] || 0))
  return d
}

// The order a session runs in: compounds for the big groups first, then the big groups before the
// small ones, abs last; within a group, the exercise that trains more. Array#sort is stable: what
// still ties keeps the order it was picked in.
const BIG_FIRST = ['quads', 'glutes', 'hamstrings', 'back', 'chest', 'shoulders', 'triceps', 'biceps', 'calves', 'forearms', 'abs']
const runOrder = (a, b) => b.compound - a.compound
  || BIG_FIRST.indexOf(a.group) - BIG_FIRST.indexOf(b.group) || b.total - a.total

/**
 * `count` exercises from `candidates` ([{ id, rank }], rank lower = better known) that cover
 * the ticked `groups` best for their `need` (weeklyNeed), compounds first. `history` is
 * variantHistory; `shift` walks each choice one further (Shuffle). `rolesOf` gives the muscle
 * roles the parts of a group rotate by. `anchor` is the group ids one compound must come from;
 * `gaps` maps a group id to the target muscles of the part it trained least (partFocus's `muscles`).
 * `share` maps a group id to
 * the sets the day should give it (program.js dayShare), `setsOf` an id to the sets it takes:
 * once every group has its exercise, the next go to the group furthest short of its share.
 */
export function pickForCoverage(candidates, { count, groups, need, history = {}, shift = 0, rolesOf = muscleRolesOf, anchor = [], gaps = {},
  share = null, setsOf = () => 3 }) {
  const on = new Set(groups)
  const pool = []
  for (const { id, rank } of candidates) {
    const item = pool.some(c => c.id === id) ? null : itemOf(id, rank, on, rolesOf)
    if (item) pool.push(item)
  }
  const weight = weightFor(need)
  const covered = Object.fromEntries(groups.map(g => [g, 0]))
  const picks = []
  const fresher = fresherFor(history, picks)
  const anchors = c => c.compound && anchor.includes(c.group)
  const anchored = () => !pool.some(anchors) || picks.some(anchors)
  // A small group past its one exercise waits until every other group, rested ones too, is served.
  const full = c => !spill && SMALL.has(c.group) && picks.some(p => p.group === c.group)
  // Sets each group is still short of its share, while the picks go to the shares (`filling`).
  const got = {}
  const short = g => Math.max(0, (share?.[g] || 0) - (got[g] || 0))
  let cap = 1, relaxed = false, spill = false, filling = false, filled = !share
  while (picks.length < count) {
    const last = picks.length === count - 1 && !anchored()
    const open = pool.filter(c => !picks.includes(c) && (last ? anchors(c) : filling ? short(c.group) >= USEFUL && !full(c)
      : covered[c.group] < cap && (spill || need[c.group] >= RESTED || (relaxed && need[c.group] > 0)) && (cap > 1 || c.main) && !full(c)))
    // A movement already in the session is out before a near twin is: a leg curl after a
    // stiff-legged deadlift covers alike, a romanian deadlift is the same lift again.
    const fresh = open.filter(c => !picks.some(p => sameMove(p, c)))
    const distinct = fresh.filter(c => !picks.some(p => distance(p.credit, c.credit) < ALIKE))
    // Filling a share, what fills it most wins: a second curl for biceps still short, not a shrug.
    const ok = distinct.length && !filling ? distinct : fresh.length ? fresh : open
    if (!ok.length) {
      if (filling) { filling = false; filled = true } else if (!relaxed && !filled) filling = true
      else if (relaxed && cap < count) cap++
      else if (!relaxed) { relaxed = true; cap = 1 } else if (!spill) { spill = true; cap = 1 } else break
      continue
    }
    const gain = c => (filling ? fillOf(c, setsOf(c.id), short) : gainOf(c, covered, cap, weight))
    const scored = ok.map(c => ({ c, g: gain(c) })).sort((a, b) => b.g - a.g || a.c.rank - b.c.rank)
    // Near the best, the exercise that trains more wins: a squat over a plank.
    const top = scored.filter(x => within(x.g, scored[0].g, CLOSE)).sort((a, b) => b.c.total - a.c.total)[0]
    // A part the last two weeks left out, and nothing in the session for it yet: its exercise.
    const gap = gaps[top.c.group]
    const fills = c => c.group === top.c.group && c.parts?.some(m => gap.includes(m))
    // Filling a share, only one about as good: a shrug for the traps is no pull-up for a back
    // and biceps both short.
    const fillers = gap && !picks.some(fills) ? scored.filter(x => fills(x.c) && (!filling || within(x.g, top.g, NEAR))) : []
    // Among those, the movement the session is short of comes first (a row after a bench press),
    // the staler variation within it.
    const near = fresher((fillers.length ? fillers : scored.filter(({ c, g }) => c.group === top.c.group && c.compound === top.c.compound
      && (within(g, top.g, NEAR) || distance(c.credit, top.c.credit) <= SAME_SHAPE))).map(x => x.c))
      .sort((a, b) => balanceOf(b, picks) - balanceOf(a, picks))
    const pick = near[shift % near.length]
    picks.push(pick)
    for (const [g, a] of Object.entries(pick.credit)) { covered[g] += a; got[g] = (got[g] || 0) + a * setsOf(pick.id) }
  }
  return picks.map((c, at) => ({ id: c.id, slug: c.slug, group: c.group, at })).sort((a, b) => runOrder(picks[a.at], picks[b.at]))
}

/**
 * `candidates` ([{ id, rank }]) in the order Add exercise suggests them for a session that
 * already has the entries `have`: what fills the session's gaps best for the week's `need`
 * first, and among the ones about as good, the staler variation (as the one-tap workouts pick).
 * Returns ids; an id whose main muscle is in none of `groups` keeps its place at the end.
 */
export function rankForGaps(candidates, { groups, need, have = [], history = {}, rolesOf = muscleRolesOf }) {
  const on = new Set(groups)
  const covered = sessionCredit(have)
  const weight = weightFor(need)
  const taken = have.map(e => EXIDX[e?.id] && itemOf(e.id, 0, on, rolesOf)).filter(Boolean)
  const items = [], rest = []
  for (const { id, rank } of candidates) {
    const item = itemOf(id, rank, on, rolesOf)
    if (item) items.push({ c: item, g: gainOf(item, covered, 1, weight) })
    else rest.push(id)
  }
  if (!items.length) return rest
  const best = Math.max(...items.map(x => x.g))
  const fresher = fresherFor(history, taken)
  const top = fresher(items.filter(x => within(x.g, best, NEAR)).map(x => x.c))
  const others = items.filter(x => !within(x.g, best, NEAR)).sort((a, b) => b.g - a.g || a.c.rank - b.c.rank).map(x => x.c)
  return [...top, ...others].map(c => c.id).concat(rest)
}
