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
import { partTargetOf, weeklyTargetOf, windowWorkouts } from './goals.js'
import { workoutAt } from './history.js'
import { variantOf } from './variant.js'
import { muscleRolesOf, roleWeights, rolesLoaded, ROLE_WEIGHT } from './muscle-roles.js'
import { isConditioning } from './conditioning.js'
import { isoOf } from './format.js'

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

/**
 * The muscle weights of a logged entry: from the exercise's muscle roles where it has them
 * (muscle-roles.js roleWeights: what it works 1, what helps 0.4, what holds steady nothing), else
 * the catalogue's muscles, else what was saved with it.
 */
export function entryWeights(entry, rolesOf = muscleRolesOf) {
  const ex = EXIDX[entry?.id]
  if (ex) return roleWeights(rolesOf(entry.id)) || musclesOf(ex)
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

/**
 * The muscle an exercise's slot is for: the catalogue's primary (strength-exercises.js
 * primaryMuscleOf), unless the muscle roles say the exercise aims at another group's muscle and
 * none of the primary's own. A handstand push-up the catalogue files under triceps aims at the
 * front delts, so it fills a shoulder slot. `ex` is an exercise or a logged entry.
 */
export function slotMuscleOf(ex, rolesOf = muscleRolesOf) {
  const slug = primaryMuscleOf(ex)?.slug || null
  const weights = roleWeights(rolesOf(ex?.id))
  if (!weights) return slug
  const aimed = Object.keys(weights).filter(m => weights[m] >= ROLE_WEIGHT.target && groupOf(m))
  const own = groupOf(slug)
  return !aimed.length || aimed.some(m => groupOf(m) === own) ? slug : aimed[0]
}
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
      // Neither a conditioning combo (lib/conditioning.js) nor cardio is a hard set for a muscle
      if (isConditioning(entry) || isCardio(entry?.id)) continue
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

// The parts of a group lifters train on purpose, each with a weekly minimum of its own: a
// shoulder week of presses is a front-delt week, the side and rear delts only helped. English
// names, also the i18n keys; each part is the role muscles (muscle-roles.js) that make it up.
export const GROUP_PARTS = {
  shoulders: [['Front delts', ['front-delt']], ['Side delts', ['side-delt']], ['Rear delts', ['rear-delt']]],
  back: [['Lats', ['lats']], ['Mid back', ['rhomboids', 'middle-trap']], ['Upper traps', ['upper-trap']]],
  glutes: [['Glutes', ['glute-max']], ['Side glutes', ['glute-med']], ['Inner thighs', ['adductors', 'adductor-magnus']]],
}
/** The weekly minimum of a part of `group` (GROUP_PARTS): goals.js partTargetOf. */
export const partGoalOf = (S, group, part) => partTargetOf(S, group, part)
// Toward a part's minimum, a set that only helped it counts half what it counts for the group
// (0.2, not 0.4): a week of presses and rows is no shoulder week, and the side and rear delts
// get a lift of their own, the front delts an overhead press now and then.
export const HELPED_PART = 0.5
/** The sets a part's `{ targeted, helped }` (partSplitOf) give toward its minimum. */
export const partSets = ({ targeted = 0, helped = 0 } = {}) => targeted + helped * HELPED_PART

/**
 * Group id -> part name -> { targeted, helped }: the completed work sets of the logged workouts
 * that targeted the part, and those that only helped it at ROLE_WEIGHT's 0.4, from the
 * exercises with muscle roles (GROUP_PARTS). A conditioning combo counts no hard sets.
 */
export function partSplitOf(workouts, rolesOf = muscleRolesOf, keep = null) {
  const out = {}
  for (const w of workouts || []) {
    for (const entry of w?.entries || []) {
      if (isConditioning(entry) || isCardio(entry?.id)) continue
      const r = rolesOf(entry?.id)
      const n = r && (keep ? (entry?.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s) && keep(s)).length : workSets(entry))
      if (!n) continue
      for (const [g, parts] of Object.entries(GROUP_PARTS)) for (const [name, muscles] of parts) {
        const has = role => muscles.some(m => (r[role] || []).includes(m))
        const k = has('target') ? 'targeted' : has('synergists') ? 'helped' : null
        if (!k) continue
        const at = (out[g] ||= {})[name] ||= { targeted: 0, helped: 0 }
        at[k] += k === 'targeted' ? n : n * ROLE_WEIGHT.synergists
      }
    }
  }
  return out
}

/**
 * Group id -> the parts short of their weekly minimum over the goal's week, most short first:
 * [{ name, muscles, sets, goal, targeted, helped }]. Only for the `groups` given; nothing until
 * the muscle roles are loaded, which the parts are counted from.
 */
export function partsShort(S, groups, now = Date.now()) {
  if (!rolesLoaded()) return {}
  const split = partSplitOf(windowWorkouts(S, now))
  // Ties (a new week, every part at nothing) go to the part the last two weeks gave least: the
  // side and rear delts before the front ones every bench press helped.
  const from = isoOf(new Date(now - 13 * 864e5)), to = isoOf(new Date(now))
  const past = partSplitOf((S?.workouts || []).filter(w => typeof w?.d === 'string' && w.d >= from && w.d <= to))
  const pastOf = (g, name) => partSets(past[g]?.[name])
  const out = {}
  for (const g of groups) {
    const rows = (GROUP_PARTS[g] || []).map(([name, muscles]) => {
      const { targeted = 0, helped = 0 } = split[g]?.[name] || {}
      const goal = partGoalOf(S, g, name)
      return { name, muscles, sets: partSets({ targeted, helped }), goal, targeted, helped, past: pastOf(g, name) }
    }).filter(p => p.goal > 0 && p.sets < p.goal).sort((a, b) => a.sets - b.sets || a.past - b.past)
    if (rows.length) out[g] = rows
  }
  return out
}

/**
 * The parts short of their minimum (partsShort) across the `groups` given, furthest short of it
 * first, then the one the last two weeks gave least: [{ group, name, muscles, sets, goal, … }].
 * A program day's spare slot goes to the first of them no exercise of the day targets.
 */
export function spareParts(S, groups, now = Date.now()) {
  return Object.entries(partsShort(S, groups, now)).flatMap(([group, rows]) => rows.map(p => ({ group, ...p })))
    .sort((a, b) => a.sets / a.goal - b.sets / b.goal || a.past - b.past)
}

/**
 * Group id -> the sets it still lacks this week: what is left of its goal, for the `groups`
 * given. A part short of its minimum (partsShort) adds none: it decides which lift the group's
 * sets go to (the day's `gaps` and spare slot), not how many. Counted in, the presses and rows
 * that had already given the shoulders their week still left the three delts short, and each
 * got a lift on top (21 sets of 15).
 */
export function weeklyLack(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  return Object.fromEntries(groups.map(g => [g, Math.max(0, weeklyTargetOf(S, g) - (done[g] || 0))]))
}

/**
 * Group id -> how much it still needs this week, 0–1, for the `groups` given: its goal's need, or
 * that of its part furthest short of its minimum (partsShort), whichever is more, scaled by how
 * rested the group is.
 */
const needOf = (done, target) => (target > 0 ? Math.max(0, 1 - done / target) : 0)
export function weeklyNeed(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  const short = partsShort(S, groups, now)
  const fatigue = fatigueOf(S?.workouts || [], now, { unit: S?.unit })
  const need = {}
  for (const id of groups) {
    const g = ADD_GROUPS.find(x => x.id === id)
    if (!g) continue
    const part = Math.max(0, ...(short[id] || []).map(p => needOf(p.sets, p.goal)))
    need[id] = Math.max(needOf(done[id] || 0, weeklyTargetOf(S, id)), part) * (1 - (fatigue[g.m[0]] || 0))
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
      const g = ex && workSets(entry) ? groupOf(slotMuscleOf(entry, rolesOf))?.id : null
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
  const slug = slotMuscleOf(ex, rolesOf)
  const g = groupOf(slug)
  if (!g || !on.has(g.id)) return null
  const full = groupCredit(entryWeights({ id }, rolesOf))
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
// Movements that are never a compound, whatever the catalogue credits them with: a leg curl
// lists the calves and glutes, a straight-arm pulldown the triceps and chest, a farmers walk
// everything that holds the bar.
const NOT_COMPOUND = new Set(['isolation', 'core', 'carry'])
// A pull for the shoulders is their accessory, not the back's row or pull-up: a face pull, a rear
// delt row, an upright row, a cuban press.
const DELT_PULLS = new Set(['pull-horizontal', 'pull-vertical'])
/**
 * What kind of lift `id` is, by the same measure the pickers use: 'small' for calves, forearms
 * and abs, 'compound' for one that trains three groups or more in earnest in a movement of its
 * own, else 'isolation'.
 */
export function liftKind(id) {
  const ex = EXIDX[id]
  const slug = ex && slotMuscleOf(ex)
  const g = slug && groupOf(slug)
  if (g && SMALL.has(g.id)) return 'small'
  const pt = patternOf(ex)
  if (NOT_COMPOUND.has(pt) || (slug === 'deltoids' && DELT_PULLS.has(pt))) return 'isolation'
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
// another way: a chest dip and a triceps dip are one dip. And two compounds of the same movement
// are one movement on two tools: a smith squat and a hack squat, a cable row and a barbell row, a
// bench press and a close-grip one filed under triceps.
const MOVES = new Set(Object.keys(OPPOSITE_PATTERN))
const sameKeys = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => k in b)
const sameMove = (a, b) => (a.compound && b.compound && MOVES.has(a.pattern) && a.pattern === b.pattern)
  || (a.compound && b.compound && a.variant.tool === b.variant.tool
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

// A hinge the lower back holds up: a deadlift, a romanian, a good morning, a swing, by the roles
// (the erectors among what it works), else by the catalogue's "lower back". Not a hip thrust.
const backOf = (id, rolesOf) => {
  const roles = rolesOf(id)
  return roles ? [...(roles.target || []), ...(roles.synergists || [])].includes('erector-spinae')
    : !!EXIDX[id]?.sm?.includes('lower back')
}
export const loadsBack = id => backOf(id, muscleRolesOf)

// The order a session runs in: the lead, then the compounds, then the isolations, a carry once
// those are done (it leaves the grip and the trunk spent), then calves and forearms, abs last.
// The compounds take turns: a lower-body lift after an upper one and back, never two the lower
// back holds up in a row (a squat straight after a deadlift starts on erectors already spent), and
// among the upper ones a pull after a push. With no lead a leg lift opens (a squat before a
// deadlift), else the upper group the week needs most. What still ties goes to the group the week
// needs most, then the bigger group, then the lift that trains more; Array#sort is stable, so the
// rest keeps the order it was picked in.
const BIG_FIRST = ['quads', 'glutes', 'hamstrings', 'back', 'chest', 'shoulders', 'triceps', 'biceps', 'calves', 'forearms', 'abs']
const LOWER = new Set(['quads', 'glutes', 'hamstrings'])
const stageOf = c => (c.group === 'abs' ? 5 : SMALL.has(c.group) ? 4 : c.pattern === 'carry' ? 3 : c.compound ? 1 : 2)
const sideOf = c => (c.pattern?.startsWith('push') ? 'push' : c.pattern?.startsWith('pull') ? 'pull' : null)
export function runOrderOf(picks, { lead = null, need = {}, rolesOf = muscleRolesOf } = {}) {
  const byNeed = (a, b) => (need[b.group] ?? 0) - (need[a.group] ?? 0)
    || BIG_FIRST.indexOf(a.group) - BIG_FIRST.indexOf(b.group) || b.total - a.total
  const rest = picks.filter(c => c !== lead)
  const order = lead && picks.includes(lead) ? [lead] : []
  const compounds = rest.filter(c => stageOf(c) === 1).sort(byNeed)
  while (compounds.length) {
    const last = order[order.length - 1]
    const lastUpper = last && [...order].reverse().find(c => c.compound && !LOWER.has(c.group))
    // Lower is better on each count: the turn of the halves, the lower back, the push or the pull.
    const cost = c => [+(LOWER.has(c.group) === LOWER.has(last.group)),
      +(backOf(c.id, rolesOf) && backOf(last.id, rolesOf)),
      +(!LOWER.has(c.group) && !!lastUpper && !!sideOf(c) && sideOf(c) === sideOf(lastUpper))]
    // The lower back outweighs the turn of the halves: two upper lifts in a row are no harm.
    const score = c => { const [half, back, side] = cost(c); return back * 4 + half * 2 + side }
    const next = last ? compounds.reduce((best, c) => (score(c) < score(best) ? c : best))
      : compounds.filter(c => LOWER.has(c.group)).sort((a, b) => BIG_FIRST.indexOf(a.group) - BIG_FIRST.indexOf(b.group) || b.total - a.total)[0]
        || compounds[0]
    order.push(next)
    compounds.splice(compounds.indexOf(next), 1)
  }
  for (const stage of [2, 3, 4, 5]) order.push(...rest.filter(c => stageOf(c) === stage).sort(byNeed))
  return order
}

/**
 * `count` exercises from `candidates` ([{ id, rank }], rank lower = better known) that cover
 * the ticked `groups` best for their `need` (weeklyNeed), compounds first. `history` is
 * variantHistory; `shift` walks each choice one further (Shuffle). `rolesOf` gives the muscle
 * roles the parts of a group rotate by. `anchor` is the group ids one compound must come from;
 * `gaps` maps a group id to the target muscles of the parts it is short of, the one furthest short
 * first (generate.js partGaps). `first` is the id of the lift that leads the day: picked before
 * the rest and run first, when it is among `candidates`.
 * `share` maps a group id to
 * the sets the day should give it (program.js dayShare), `setsOf` an id (and whether it leads)
 * to the sets it takes and `roomOf` to the most it may take: once every group has its exercise,
 * one goes to the first `spare` part (spareParts) the day leaves out, from `candidates` or
 * `spareOnly` (which nothing else picks from); then a group short of its share takes a set more
 * on its own lift, up to `roomOf`, and only past that an exercise more. Each pick's `extra` is
 * the sets it takes past `setsOf`.
 */
// A lift the last session did, picked again: its gain counts 40% less, a hinge's 60%. A leg
// extension every session leaves the other quad lifts unturned, and the same stiff-legged
// deadlift twice running is the lower back's again before it has come back. One of the two
// sessions before that (`earlier`) counts a fifth less: three full-body days a week otherwise
// swing between the same two lifts for a group, a power clean, a snatch pull, a power clean.
export const REPEAT = 0.6
export const REPEAT_HINGE = 0.4
export const EARLIER = 0.8
const repeatOf = (c, recent, earlier) => (recent.has(c.id) ? (c.pattern === 'hinge' ? REPEAT_HINGE : REPEAT) : earlier.has(c.id) ? EARLIER : 1)
// The lower-body compounds a glute lift waits for: a squat or a deadlift gives the glutes their sets.
const BASE = new Set(['quads', 'hamstrings'])

export function pickForCoverage(candidates, { count, groups, need, history = {}, shift = 0, rolesOf = muscleRolesOf, anchor = [], gaps = {},
  share = null, setsOf = () => 3, roomOf = setsOf, spare = [], spareOnly = [], recent = [], earlier = [], known = null, first = null }) {
  const again = new Set(recent), before = new Set(earlier)
  const tried = known && new Set(known)
  // How lately a lift was done: 2 the last session, 1 one of the two before it, else 0.
  const ageOf = c => (again.has(c.id) ? 2 : before.has(c.id) ? 1 : 0)
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
  // A leg isolation waits for the day's lower-body compound: the squat gives the glutes their
  // sets, and a hip abduction picked before it is one exercise more than the glutes needed.
  const waits = c => (!c.compound && anchor.includes(c.group) && !anchored()) || glutesWait(c)
  // A glute lift, even a hip thrust that counts as a compound, waits for the day's squat or
  // deadlift, and then comes only if the glutes are still short of their share: the squat gave
  // them theirs, and a hip thrust every day on top only piles more on them.
  const bases = c => c.compound && BASE.has(c.group)
  const glutesWait = c => c.group === 'glutes' && anchor.includes('glutes') && pool.some(bases)
    && (!picks.some(bases) || (!!share && short('glutes') < USEFUL))
  // A small group past its one exercise waits until every other group, rested ones too, is served.
  // A day with a share keeps to that even when filling it or spilling over: its small group's one
  // lift takes the sets it has room for (roomOf), and a second plank never comes after the crunch.
  const full = c => (share || !spill) && SMALL.has(c.group) && picks.some(p => p.group === c.group)
  // Sets each group is still short of its share, while the picks go to the shares (`filling`).
  const got = {}
  const short = g => Math.max(0, (share?.[g] || 0) - (got[g] || 0))
  let cap = 1, relaxed = false, spill = false, filling = false, filled = !share, spared = false
  // The day's lead (generate.js leadFor) is in before anything else, and runs first.
  const lead = first != null && pool.find(c => c.id === first)
  const setsIn = new Map()
  const credit = pick => {
    picks.push(pick)
    setsIn.set(pick, setsOf(pick.id, pick === lead))
    for (const [g, a] of Object.entries(pick.credit)) { covered[g] += a; got[g] = (got[g] || 0) + a * setsIn.get(pick) }
  }
  // A group short of its share takes a set more on its own lift before a second exercise: the
  // group furthest short first, on the first lift picked for it that has room.
  const roomy = () => {
    let best = null
    for (const p of picks) {
      if (setsIn.get(p) >= roomOf(p.id, p === lead) || (p.credit[p.group] || 0) < 0.5 || short(p.group) < USEFUL) continue
      if (!best || short(p.group) > short(best.group)) best = p
    }
    return best
  }
  const addSet = p => {
    setsIn.set(p, setsIn.get(p) + 1)
    for (const [g, a] of Object.entries(p.credit)) got[g] = (got[g] || 0) + a
  }
  if (lead && count > 0) credit(lead)
  while (picks.length < count) {
    // Once every group has its exercise, one slot goes to the part furthest short of its minimum
    // that no exercise of the day targets (`spare`) and whose group is still short of its share:
    // side delts, rear delts, upper traps, side glutes or inner thighs in turn, where a second
    // curl would have gone.
    if (filling && !spared) {
      spared = true
      // Not for a group the day's compounds have already given its share: after a squat and a
      // deadlift the glutes have theirs, and a hip abduction on top only piles more on them.
      const s = spare.find(p => on.has(p.group) && (!share || short(p.group) >= USEFUL)
        && !picks.some(c => c.parts?.some(m => p.muscles.includes(m))))
      const extra = s ? spareOnly.filter(x => !pool.some(c => c.id === x.id)).map(x => itemOf(x.id, x.rank, on, rolesOf)).filter(Boolean) : []
      const fits = s ? [...pool, ...extra].filter(c => !picks.includes(c) && c.group === s.group && c.parts?.some(m => s.muscles.includes(m))
        && !picks.some(p => sameMove(p, c))) : []
      // A lift for that part first of all: a lateral raise for the side delts, not a cuban press.
      const own = fits.filter(c => s.muscles.includes(c.parts[0]))
      if (fits.length) {
        const ranked = fresher((own.length ? own : fits).sort((a, b) => a.rank - b.rank))
          .sort((a, b) => ageOf(a) - ageOf(b))
        credit(ranked[shift % ranked.length])
        continue
      }
    }
    const more = filling && roomy()
    if (more) { addSet(more); continue }
    const last = picks.length === count - 1 && !anchored()
    // Filling, a lift gives its own group a set or more: three sets of shrugs are not one of back.
    const open = pool.filter(c => !picks.includes(c) && (last ? anchors(c) : filling ? short(c.group) >= USEFUL && c.credit[c.group] * setsOf(c.id) >= USEFUL && !full(c)
      : covered[c.group] < cap && (spill || need[c.group] >= RESTED || (relaxed && need[c.group] > 0)) && (cap > 1 || c.main) && !full(c) && !waits(c)))
    // A movement already in the session is out before a near twin is: a leg curl after a
    // stiff-legged deadlift covers alike, a romanian deadlift is the same lift again.
    const fresh = open.filter(c => !picks.some(p => sameMove(p, c)))
    const distinct = fresh.filter(c => !picks.some(p => distance(p.credit, c.credit) < ALIKE))
    // Filling a share, what fills it most wins. A day with a share never takes the same movement
    // again, not even to make up the count: a share its lifts cannot fill, with all the sets they
    // have room for, stays short. Without one, it comes only when nothing else is left.
    const ok = distinct.length && !filling ? distinct : fresh.length || share ? fresh : open
    if (!ok.length) {
      if (filling) { filling = false; filled = true } else if (!relaxed && !filled) filling = true
      else if (relaxed && cap < count) cap++
      else if (!relaxed) { relaxed = true; cap = 1 } else if (!spill) { spill = true; cap = 1 } else break
      continue
    }
    const gain = c => {
      const g = filling ? fillOf(c, setsOf(c.id), short) : gainOf(c, covered, cap, weight)
      return g > 0 ? g * repeatOf(c, again, before) : g
    }
    const scored = ok.map(c => ({ c, g: gain(c) })).sort((a, b) => b.g - a.g || a.c.rank - b.c.rank)
    // Near the best, the exercise that trains more wins: a squat over a plank.
    // One done lately loses to the rest first, and one never logged to one you have.
    const untried = c => (tried && tried.size && !tried.has(c.id) ? 1 : 0)
    const top = scored.filter(x => within(x.g, scored[0].g, CLOSE))
      .sort((a, b) => ageOf(a.c) - ageOf(b.c) || untried(a.c) - untried(b.c) || b.c.total - a.c.total)[0]
    // A part the last two weeks left out, and nothing in the session for it yet: its exercise.
    const gap = gaps[top.c.group]
    const fills = c => c.group === top.c.group && c.parts?.some(m => gap.includes(m))
    // Filling a share, only one about as good: a shrug for the traps is no pull-up for a back
    // and biceps both short.
    const fit = gap && !picks.some(fills) ? scored.filter(x => fills(x.c) && (!filling || within(x.g, top.g, NEAR))) : []
    // The part furthest short comes first: `gaps` lists it first.
    const at = c => Math.min(...c.parts.map(m => gap.indexOf(m)).filter(i => i >= 0))
    const fillers = fit.filter(x => at(x.c) === Math.min(...fit.map(y => at(y.c))))
    // Among those, the movement the session is short of comes first (a row after a bench press),
    // the staler variation within it.
    const alike = (fillers.length ? fillers : scored.filter(({ c, g }) => c.group === top.c.group && c.compound === top.c.compound
      && (within(g, top.g, NEAR) || distance(c.credit, top.c.credit) <= SAME_SHAPE))).map(x => x.c)
    // A compound rotates among the ones you have logged: never done is the stalest of all, and a
    // hack squat would take the smith squat's place every time.
    const yours = top.c.compound && tried?.has(top.c.id) ? alike.filter(c => tried.has(c.id)) : alike
    const near = fresher(yours.length ? yours : alike)
      .sort((a, b) => balanceOf(b, picks) - balanceOf(a, picks) || ageOf(a) - ageOf(b))
    credit(near[shift % near.length])
  }
  // A day sized to end on a group's first lift (program.js sizeDay) still gives it the sets.
  if (share) for (let p = roomy(); p; p = roomy()) addSet(p)
  return runOrderOf(picks, { lead, need, rolesOf })
    .map(c => ({ id: c.id, slug: c.slug, group: c.group, at: picks.indexOf(c), extra: setsIn.get(c) - setsOf(c.id, c === lead) }))
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
