// The weekly goal: hard sets per muscle group a week (coverage.js counts them). Each kind of goal
// (strength, muscle, maintain, endurance: engine.js SCHEMES) has a default for every group and
// for the parts trained on purpose (coverage.js GROUP_PARTS), GOAL_SETS below. `S.goals.weeklySets`
// scales them all: the goal's own `ref` (10 for muscle) keeps them as they are, 15 makes each half
// as much again. A group can be set on its own (`S.goals.byGroup`). `S.goals.type` is the kind of
// goal, else the running program's; `S.goals.days` is how many days a week you mean to train, for
// the estimates the goal screen shows.
//
// The week a goal is measured over: while a program runs (program.js) the calendar week, from
// the first day of the week (Settings) to today, so it lines up with the program's days. Without
// one the last 7 days, which never empties out on a Monday.
//
// add-exercise.js imports coverage.js, which imports this file, so ADD_GROUPS is only read
// inside functions, never at load.
import { ADD_GROUPS } from './add-exercise.js'
import { isoOf, startOfWeek, weekStartOf } from './format.js'

export const DEFAULT_GOAL = 10
export const MIN_GOAL = 2
export const MAX_GOAL = 30
/** The presets of the goal screen: keep what you have, grow, more, about the most that helps. */
export const GOAL_PRESETS = [
  { sets: 6, n: 'Keep' },
  { sets: 10, n: 'Grow' },
  { sets: 15, n: 'More' },
  { sets: 20, n: 'Max' },
]
export const DEFAULT_DAYS = 4
/** No one-tap day trains forearms on their own, so the goal leaves them out unless set. */
export const UNTRACKED = ['forearms']
export const DEFAULT_TYPE = 'growth'

// Sets a week for each kind of goal, [low, high, default]: a set counts in full for the muscle
// it aims at, part of one for those that help (coverage.js). From the volume studies
// (Schoenfeld 2017: 10+ sets a week grow more than 5-9; Baz-Valle 2022: 12-20; Pelland 2024),
// the landmarks lifters plan by (Renaissance Periodization's minimum to maximum adaptive
// volume), strength programs (3-6 heavy sets a lift a week, the rest from what helps it) and
// maintenance (Spiering 2021: about a third of the volume holds what you built). Endurance is
// the muscle column at lighter loads, more for the calves and abs that do the work longest.
//
// The back is the lats and mid back; the upper traps have a goal of their own, met by shrugs
// and carries more than rows. The shoulders are the three delts added up, each with its own:
// presses give the front delts most of what they need, so their own is small, while the side
// and rear delts grow from lifts aimed at them. `parts` are those minimums (coverage.js
// GROUP_PARTS); a part not listed takes PART_SHARE of its group's goal.
export const GOAL_SETS = {
  strength: {
    ref: 8,
    groups: { chest: [6, 12, 9], back: [8, 14, 10], shoulders: [8, 22, 14], biceps: [4, 8, 6], triceps: [4, 10, 6],
      forearms: [0, 6, 2], abs: [4, 10, 6], quads: [6, 12, 9], hamstrings: [4, 10, 6], glutes: [2, 8, 5], calves: [0, 8, 4] },
    parts: { 'Front delts': [0, 4, 2], 'Side delts': [4, 10, 6], 'Rear delts': [4, 8, 6],
      Lats: [4, 8, 5], 'Mid back': [3, 6, 4], 'Upper traps': [0, 8, 4] },
  },
  growth: {
    ref: 10,
    groups: { chest: [10, 20, 14], back: [10, 22, 16], shoulders: [14, 44, 24], biceps: [8, 20, 12], triceps: [6, 14, 10],
      forearms: [0, 8, 4], abs: [0, 16, 8], quads: [8, 18, 12], hamstrings: [6, 16, 10], glutes: [4, 12, 8], calves: [8, 16, 10] },
    parts: { 'Front delts': [0, 8, 4], 'Side delts': [8, 20, 12], 'Rear delts': [6, 16, 8],
      Lats: [5, 11, 8], 'Mid back': [4, 9, 6], 'Upper traps': [0, 12, 6] },
  },
  maintain: {
    ref: 6,
    groups: { chest: [4, 6, 5], back: [4, 8, 6], shoulders: [5, 10, 7], biceps: [2, 6, 4], triceps: [2, 6, 3],
      forearms: [0, 2, 0], abs: [0, 6, 3], quads: [4, 6, 5], hamstrings: [3, 6, 4], glutes: [0, 4, 2], calves: [3, 6, 4] },
    parts: { 'Front delts': [0, 0, 0], 'Side delts': [3, 6, 4], 'Rear delts': [2, 4, 3],
      Lats: [2, 4, 3], 'Mid back': [2, 3, 2], 'Upper traps': [0, 4, 0] },
  },
  endurance: {
    ref: 8,
    groups: { chest: [8, 14, 10], back: [8, 16, 12], shoulders: [10, 26, 16], biceps: [6, 10, 8], triceps: [6, 10, 8],
      forearms: [0, 8, 4], abs: [8, 16, 10], quads: [8, 14, 10], hamstrings: [6, 12, 8], glutes: [4, 10, 6], calves: [8, 14, 10] },
    parts: { 'Front delts': [0, 4, 2], 'Side delts': [6, 12, 8], 'Rear delts': [4, 10, 6],
      Lats: [4, 8, 6], 'Mid back': [3, 7, 5], 'Upper traps': [0, 6, 3] },
  },
}
// A part with no default of its own (the glutes'): its share of the group's goal.
export const PART_SHARE = 0.3

// A set of a compound credits more than one group (a squat: quads and glutes, a little of the
// rest), so a week reaches every group's goal in fewer sets than the goals add up to.
export const OVERLAP = 1.4
const MIN_PER_SET = 2.5   // a work set and its rest
const MIN_SESSION = 5     // getting set up, warming up

const clampGoal = n => Math.max(MIN_GOAL, Math.min(MAX_GOAL, Math.round(n)))
const isNum = n => typeof n === 'number' && Number.isFinite(n)

/** The kind of goal (GOAL_SETS): the one set, else the running program's, else muscle. */
export function goalTypeOf(S) {
  for (const k of [S?.goals?.type, S?.program?.plan?.goal]) if (GOAL_SETS[k]) return k
  return DEFAULT_TYPE
}
const tableOf = type => GOAL_SETS[type] || GOAL_SETS[DEFAULT_TYPE]
/** The `weeklySets` that keeps a kind of goal's defaults as they are. */
export const goalRef = type => tableOf(type).ref

/** The goal's scale: `S.goals.weeklySets`, its own `ref` unless set. */
export function baseGoalOf(S) {
  const n = S?.goals?.weeklySets
  return isNum(n) && n > 0 ? clampGoal(n) : goalRef(goalTypeOf(S))
}

/** What a group's goal is without a setting of its own, for a base goal and kind of goal. */
export function defaultTargetFor(group, base = DEFAULT_GOAL, type = DEFAULT_TYPE) {
  const t = tableOf(type)
  const def = t.groups[group]?.[2]
  if (def == null) return Math.min(MAX_GOAL, Math.round(base))
  return Math.min(MAX_GOAL, Math.round(def * base / t.ref))
}

/** Sets a week `group` aims for. */
export function weeklyTargetOf(S, group) {
  const own = S?.goals?.byGroup?.[group]
  if (isNum(own) && own >= 0) return Math.min(MAX_GOAL, Math.round(own))
  return defaultTargetFor(group, baseGoalOf(S), goalTypeOf(S))
}

/**
 * The weekly minimum of a part of `group` (coverage.js GROUP_PARTS): its default for the kind of
 * goal, moved with its group's goal (a group set to twice its default doubles its parts), or
 * PART_SHARE of the group's goal when it has none. To the tenth, not rounded.
 */
export function partTargetOf(S, group, part) {
  const goal = weeklyTargetOf(S, group)
  const t = tableOf(goalTypeOf(S))
  const def = t.parts[part]?.[2], groupDef = t.groups[group]?.[2]
  if (def == null || !groupDef) return goal * PART_SHARE
  return Math.round(def * goal / groupDef * 10) / 10
}

/** Group id -> weekly target, for `groups` (every group by default). */
export function weeklyTargets(S, groups = ADD_GROUPS.map(g => g.id)) {
  return Object.fromEntries(groups.map(g => [g, weeklyTargetOf(S, g)]))
}

/** The groups the goal is shown for: all but the ones no day trains, unless given a goal. */
export function goalGroups(S) {
  return ADD_GROUPS.map(g => g.id).filter(g => !UNTRACKED.includes(g) || isNum(S?.goals?.byGroup?.[g]))
}

/** The smallest and largest goal of the groups shown (goalGroups), groups at 0 left out. */
export function goalSpan(S) {
  const v = goalGroups(S).map(g => weeklyTargetOf(S, g)).filter(n => n > 0)
  return v.length ? { lo: Math.min(...v), hi: Math.max(...v) } : { lo: 0, hi: 0 }
}

/** Days a week of training, 2 to 7. */
export function daysOf(S) {
  const n = S?.program?.days?.length || S?.goals?.days
  return isNum(n) ? Math.max(2, Math.min(7, Math.round(n))) : DEFAULT_DAYS
}

/** The days a goal is counted over, both ends included: `{ from, to, calendar }`. */
export function goalWindow(S, now = Date.now()) {
  const to = isoOf(new Date(now))
  if (S?.program) return { from: isoOf(startOfWeek(to, weekStartOf(S))), to, calendar: true }
  return { from: isoOf(new Date(now - 6 * 864e5)), to, calendar: false }
}

/** The workouts logged in the goal's window. */
export function windowWorkouts(S, now = Date.now()) {
  const { from, to } = goalWindow(S, now)
  return (S?.workouts || []).filter(w => typeof w?.d === 'string' && w.d >= from && w.d <= to)
}

/** About how many sets a week, and a session, the goals take, and how long a session runs. */
export function goalEstimate(S, groups = goalGroups(S)) {
  const sum = groups.reduce((n, g) => n + weeklyTargetOf(S, g), 0)
  const week = Math.round(sum / OVERLAP)
  const days = daysOf(S)
  const session = Math.round(week / days)
  return { week, days, session, minutes: sessionMinutes(session) }
}

/** About how long a session of `sets` work sets runs, rounded to 5 minutes. */
export const sessionMinutes = sets => Math.round((sets * MIN_PER_SET + MIN_SESSION) / 5) * 5
