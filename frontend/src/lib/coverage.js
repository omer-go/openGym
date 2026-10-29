// Muscle-group coverage: how much an exercise gives each muscle group, what the week so far left
// short, and which exercises fill that best. What a workout is made of is planner.js's to decide;
// this is the counting it and the rest of the app share. Pure: reads state, never writes.
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
// Variety. Among exercises that cover about the same, the part of the muscle (front, side or rear
// delt; upper or mid chest; lats or mid back: the exercise's target in its muscle roles,
// muscle-roles.js) last done longest ago for that group comes first, then the helpers (its
// synergists), then the tool (barbell, dumbbell, smith…), then the position (standing, seated,
// lying, incline…, variant.js), then the exercise you know. Parts and helpers only decide where
// every exercise in the running has roles.
//
// The same numbers show elsewhere: the one-tap setup and the routine editor draw what a session
// adds per group (plannedSets), and Add exercise suggests groups and orders a group's exercises
// by what the session in progress still lacks (rankForGaps).
import { EXIDX, isCardio, patternOf } from './exercises.js'
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
const MIN_WEIGHT = 0.02   // a group trained to target still counts for something
const OVER = 0.25         // the cost of credit to a group already at its cap
const NEAR = 0.75         // within this share of the best gain, picks count as equally good

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

// The parts of a group lifters train on purpose, each with a share of its goal (goals.js): a
// shoulder week of presses is a front-delt week, the side and rear delts only helped. English
// names, also the i18n keys; each part is the role muscles (muscle-roles.js) that make it up.
export const GROUP_PARTS = {
  chest: [['Upper chest', ['pec-major-clavicular']], ['Mid and lower chest', ['pec-major-sternal']]],
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
 * Group id -> the sets it still lacks this week: what is left of its goal, for the `groups`
 * given. A part short of its minimum (partsShort) adds none: it decides which lift the group's
 * sets go to, not how many. Counted in, the presses and rows
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
// three groups, so an exercise for one never counts as a compound.
const SMALL = new Set(['calves', 'forearms', 'abs'])
// An exercise as rankForGaps weighs it, or null when its main muscle is in none of the groups.
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
 * What kind of lift `id` is, as the planner files it (planner.js liftOf): 'small' for calves, forearms
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

// A hinge the lower back holds up: a deadlift, a romanian, a good morning, a swing, by the roles
// (the erectors among what it works), else by the catalogue's "lower back". Not a hip thrust.
const backOf = (id, rolesOf) => {
  const roles = rolesOf(id)
  return roles ? [...(roles.target || []), ...(roles.synergists || [])].includes('erector-spinae')
    : !!EXIDX[id]?.sm?.includes('lower back')
}
export const loadsBack = id => backOf(id, muscleRolesOf)

/**
 * `candidates` ([{ id, rank }]) in the order Add exercise suggests them for a session that
 * already has the entries `have`: what fills the session's gaps best for the week's `need`
 * first, and among the ones about as good, the staler variation.
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
