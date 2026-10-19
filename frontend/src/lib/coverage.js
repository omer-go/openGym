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
// Weekly need. Credit × completed work sets over the last 7 days is the group's week; 10 fills
// it. What is left is scaled by how rested the group's main muscle is (recovery.js fatigueOf).
//
// Picking. One exercise at a time, the one that adds the most coverage, weighted by need squared
// (a group with nothing this week beats two half-done ones). Coverage spreads before it stacks:
// first every group gets one exercise that targets its main muscle, then a second, and so on;
// groups that have had their week (need under 0.1) wait until every other group is served.
//
// Variety. Among picks that cover about the same, the bench angle (incline, decline, flat) last
// done longest ago for that group wins, then the tool (barbell, dumbbell, smith…, variant.js),
// then the exercise you know. So a flat barbell bench is followed by an incline on dumbbells.
// Presses rotate with presses: an isolation lift is only offered where an isolation lift is best.
//
// The same numbers show elsewhere: the one-tap setup and the routine editor draw what a session
// adds per group (plannedSets), and Add exercise suggests groups and orders a group's exercises
// by what the session in progress still lacks (rankForGaps).
import { EXIDX, isCardio } from './exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { musclesOf } from './muscles.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { hasCompletedWork, isWarmupRow } from './workout-model.js'
import { fatigueOf } from './recovery.js'
import { isoOf } from './format.js'
import { workoutAt } from './history.js'
import { variantOf } from './variant.js'

export const WEEKLY_TARGET = 10
const OTHER_MUSCLE = 0.25 // a group's other muscles credit it at a quarter
const RESTED = 0.1        // below this need, a group waits until the others are served
const MIN_WEIGHT = 0.02   // a group trained to target still counts for something
const OVER = 0.25         // the cost of credit to a group already at its cap
const NEAR = 0.75         // within this share of the best gain, picks count as equally good
const ALIKE = 0.5         // credit profiles closer than this are the same exercise twice
const SAME_SHAPE = 1      // credit profiles this close cover the same, so variety may choose
const CLOSE = 0.85         // a gain this close to the best still loses to a bigger compound

/** The muscle weights of a logged entry: the catalogue's, else what was saved with it. */
export function entryWeights(entry) {
  const ex = EXIDX[entry?.id]
  if (ex) return musclesOf(ex)
  const snap = entry?.muscleSnapshot?.muscleWeights || entry?.muscleWeights
  return snap && typeof snap === 'object' ? snap : {}
}
/** Completed work sets of a logged entry, warm-ups left out. */
export const workSets = entry => (entry?.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s)).length

/** Group id -> credit, from a muscle -> weight map. */
export function groupCredit(weights) {
  const out = {}
  for (const g of ADD_GROUPS) {
    let best = 0
    g.m.forEach((m, i) => { if (weights[m] > 0) best = Math.max(best, weights[m] * (i ? OTHER_MUSCLE : 1)) })
    if (best > 0) out[g.id] = best
  }
  return out
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
 * Effective sets per group the logged workouts did: credit × completed work sets. `keep` narrows
 * the sets counted (Stats passes the hard-set test).
 */
export function groupSetsOf(workouts, keep = null) {
  const out = {}
  for (const w of workouts || []) {
    for (const entry of w?.entries || []) {
      const n = keep ? (entry?.sets || []).filter(s => hasCompletedWork(s) && !isWarmupRow(s) && keep(s)).length : workSets(entry)
      if (!n) continue
      for (const [g, c] of Object.entries(groupCredit(entryWeights(entry)))) out[g] = (out[g] || 0) + c * n
    }
  }
  return out
}

/**
 * Effective sets per group a week, averaged over the `days` before `now` (0: all of it). A period
 * longer than the training is cut to the first workout in it, so a fortnight of training read
 * over 90 days is not a third of what it was. Never less than a week.
 */
export function groupSetsPerWeek(workouts, days, now = Date.now(), keep = null) {
  const from = days ? now - days * 864e5 : -Infinity
  const inWin = (workouts || []).filter(w => { const at = workoutAt(w); return at > from && at <= now })
  if (!inWin.length) return {}
  const first = Math.min(...inWin.map(workoutAt))
  const weeks = Math.max(1, (now - Math.max(from, first)) / (7 * 864e5))
  const total = groupSetsOf(inWin, keep)
  return Object.fromEntries(Object.entries(total).map(([g, v]) => [g, v / weeks]))
}

/** Effective sets per group over the 7 days up to `now` (today counts as one of them). */
export function weeklyDone(S, now = Date.now()) {
  const today = isoOf(new Date(now)), from = isoOf(new Date(now - 7 * 864e5))
  return groupSetsOf((S?.workouts || []).filter(w => typeof w?.d === 'string' && w.d > from && w.d <= today))
}

/** Group id -> how much it still needs this week, 0–1, for the `groups` given. */
export function weeklyNeed(S, groups, now = Date.now()) {
  const done = weeklyDone(S, now)
  const fatigue = fatigueOf(S?.workouts || [], now, { unit: S?.unit })
  const need = {}
  for (const id of groups) {
    const g = ADD_GROUPS.find(x => x.id === id)
    if (g) need[id] = Math.max(0, 1 - (done[id] || 0) / WEEKLY_TARGET) * (1 - (fatigue[g.m[0]] || 0))
  }
  return need
}

/** Group id -> { angle: { incline: day }, tool: { barbell: day } }: when each was last done. */
export function variantHistory(S) {
  const last = {}
  for (const w of S?.workouts || []) {
    if (typeof w?.d !== 'string') continue
    for (const entry of w.entries || []) {
      const ex = EXIDX[entry.id]
      const g = ex && workSets(entry) ? groupOf(primaryMuscleOf(entry)?.slug)?.id : null
      if (!g) continue
      const v = variantOf(ex), seen = last[g] || (last[g] = { angle: {}, tool: {} })
      if (!(seen.angle[v.angle] >= w.d)) seen.angle[v.angle] = w.d
      if (!(seen.tool[v.tool] >= w.d)) seen.tool[v.tool] = w.d
    }
  }
  return last
}

// Within `share` of the best gain, which can be below zero when every pick left overfills a group.
const within = (g, best, share) => g >= best - Math.abs(best) * (1 - share)
const totalOf = credit => Object.values(credit).reduce((a, b) => a + b, 0)
// An exercise as the pickers weigh it, or null when its main muscle is in none of the groups.
function itemOf(id, rank, on) {
  const ex = EXIDX[id]
  const slug = primaryMuscleOf(ex)?.slug
  const g = groupOf(slug)
  if (!g || !on.has(g.id)) return null
  const full = groupCredit(musclesOf(ex))
  return {
    id, rank, slug, ex, group: g.id, main: g.m[0] === slug, variant: variantOf(ex),
    credit: Object.fromEntries(Object.entries(full).filter(([k]) => on.has(k))),
    total: totalOf(full),
    // A compound trains three groups or more in earnest (a bench: chest, shoulders, triceps);
    // a fly or a curl has one helper at most. Isolation lifts rotate among themselves.
    compound: Object.values(full).filter(c => c >= 0.4).length >= 3,
  }
}
// Staler first: the angle, then the tool last done longest ago for the group, then the exercise
// you know best. A tool the session already uses for the group (`taken`, [{ group, variant }])
// counts as the latest of all, so a second back exercise is on another tool. Angles go by
// history only: most groups have one.
function fresherFor(history, taken) {
  const lastDone = (c, k) => (k === 'tool' && taken.some(p => p.group === c.group && p.variant.tool === c.variant.tool)
    ? '~' : history[c.group]?.[k]?.[c.variant[k]] || '')
  return (a, b) => {
    for (const k of ['angle', 'tool']) {
      const x = lastDone(a, k), y = lastDone(b, k)
      if (x !== y) return x < y ? -1 : 1
    }
    return a.rank - b.rank
  }
}
// What `c` adds to coverage `covered` capped at `cap` per group, weighted by need.
const gainOf = (c, covered, cap, weight) => Object.entries(c.credit).reduce((s, [g, a]) => s + weight(g) * (
  Math.min(cap, (covered[g] || 0) + a) - Math.min(cap, covered[g] || 0) - ((covered[g] || 0) >= cap ? OVER * a : 0)), 0)
const weightFor = need => g => Math.max((need[g] || 0) ** 2, MIN_WEIGHT)

const distance = (a, b) => {
  let d = 0
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) d += Math.abs((a[k] || 0) - (b[k] || 0))
  return d
}

// The order a session runs in: compounds for the big groups first, then the big groups before the
// small ones, abs last; within a group, the exercise that trains more. The catalogue credits a
// barbell calf raise or a wrist curl over a bench to three groups, so a small group never counts
// as a compound. Array#sort is stable: what still ties keeps the order it was picked in.
const BIG_FIRST = ['quads', 'glutes', 'hamstrings', 'back', 'chest', 'shoulders', 'triceps', 'biceps', 'calves', 'forearms', 'abs']
const SMALL = new Set(['calves', 'forearms', 'abs'])
const leads = c => c.compound && !SMALL.has(c.group)
const runOrder = (a, b) => leads(b) - leads(a)
  || BIG_FIRST.indexOf(a.group) - BIG_FIRST.indexOf(b.group) || b.total - a.total

/**
 * `count` exercises from `candidates` ([{ id, rank }], rank lower = better known) that cover
 * the ticked `groups` best for their `need` (weeklyNeed), compounds first. `history` is
 * variantHistory; `shift` walks each choice one further (Shuffle).
 */
export function pickForCoverage(candidates, { count, groups, need, history = {}, shift = 0 }) {
  const on = new Set(groups)
  const pool = []
  for (const { id, rank } of candidates) {
    const item = pool.some(c => c.id === id) ? null : itemOf(id, rank, on)
    if (item) pool.push(item)
  }
  const weight = weightFor(need)
  const covered = Object.fromEntries(groups.map(g => [g, 0]))
  const picks = []
  const fresher = fresherFor(history, picks)
  let cap = 1, relaxed = false
  while (picks.length < count) {
    const open = pool.filter(c => !picks.includes(c) && covered[c.group] < cap
      && (relaxed || need[c.group] >= RESTED) && (cap > 1 || c.main))
    const distinct = open.filter(c => !picks.some(p => distance(p.credit, c.credit) < ALIKE))
    const ok = distinct.length ? distinct : open
    if (!ok.length) {
      if (cap < count) cap++
      else if (!relaxed) { relaxed = true; cap = 1 } else break
      continue
    }
    const gain = c => gainOf(c, covered, cap, weight)
    const scored = ok.map(c => ({ c, g: gain(c) })).sort((a, b) => b.g - a.g || a.c.rank - b.c.rank)
    // Near the best, the exercise that trains more wins: a squat over a plank.
    const top = scored.filter(x => within(x.g, scored[0].g, CLOSE)).sort((a, b) => b.c.total - a.c.total)[0]
    const near = scored.filter(({ c, g }) => c.group === top.c.group && c.compound === top.c.compound
      && (within(g, top.g, NEAR) || distance(c.credit, top.c.credit) <= SAME_SHAPE))
      .map(x => x.c).sort(fresher)
    const pick = near[shift % near.length]
    picks.push(pick)
    for (const [g, a] of Object.entries(pick.credit)) covered[g] += a
  }
  return picks.sort(runOrder).map(c => ({ id: c.id, slug: c.slug, group: c.group }))
}

/**
 * `candidates` ([{ id, rank }]) in the order Add exercise suggests them for a session that
 * already has the entries `have`: what fills the session's gaps best for the week's `need`
 * first, and among the ones about as good, the staler variation (as the one-tap workouts pick).
 * Returns ids; an id whose main muscle is in none of `groups` keeps its place at the end.
 */
export function rankForGaps(candidates, { groups, need, have = [], history = {} }) {
  const on = new Set(groups)
  const covered = sessionCredit(have)
  const weight = weightFor(need)
  const taken = have.map(e => EXIDX[e?.id] && itemOf(e.id, 0, on)).filter(Boolean)
  const items = [], rest = []
  for (const { id, rank } of candidates) {
    const item = itemOf(id, rank, on)
    if (item) items.push({ c: item, g: gainOf(item, covered, 1, weight) })
    else rest.push(id)
  }
  if (!items.length) return rest
  const best = Math.max(...items.map(x => x.g))
  const fresher = fresherFor(history, taken)
  const top = items.filter(x => within(x.g, best, NEAR)).map(x => x.c).sort(fresher)
  const others = items.filter(x => !within(x.g, best, NEAR)).sort((a, b) => b.g - a.g || a.c.rank - b.c.rank).map(x => x.c)
  return [...top, ...others].map(c => c.id).concat(rest)
}
