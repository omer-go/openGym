// The weekly goal: hard sets per muscle group a week (coverage.js counts them). Each kind of goal
// (strength, muscle, maintain, endurance: engine.js SCHEMES) sets every group's own, GOAL_SETS
// below: there is no one number for every group, a calf and a back don't need the same. A group
// can be set on its own (`S.goals.byGroup`). `S.goals.type` is the kind of goal, else the running
// program's; `S.goals.days` is how many days a week you mean to train, for the estimates the goal
// screen shows. The `S.goals.weeklySets` an older version scaled every group by is left alone.
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
export const MAX_GOAL = 30
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
// The shoulders are a group like the arms: the three delts share its goal (PART_SHARES).
export const GOAL_SETS = {
  strength: {
    chest: [6, 12, 9], back: [8, 14, 10], shoulders: [4, 10, 6], biceps: [4, 8, 6], triceps: [4, 10, 6],
    forearms: [0, 6, 2], abs: [4, 10, 6], quads: [6, 12, 9], hamstrings: [4, 10, 6], glutes: [2, 8, 5], calves: [0, 8, 4],
  },
  growth: {
    chest: [10, 20, 14], back: [10, 22, 16], shoulders: [8, 20, 12], biceps: [8, 20, 12], triceps: [6, 14, 10],
    forearms: [0, 8, 4], abs: [0, 16, 8], quads: [8, 18, 12], hamstrings: [6, 16, 10], glutes: [4, 12, 8], calves: [8, 16, 10],
  },
  maintain: {
    chest: [4, 6, 5], back: [4, 8, 6], shoulders: [2, 6, 4], biceps: [2, 6, 4], triceps: [2, 6, 3],
    forearms: [0, 2, 0], abs: [0, 6, 3], quads: [4, 6, 5], hamstrings: [3, 6, 4], glutes: [0, 4, 2], calves: [3, 6, 4],
  },
  endurance: {
    chest: [8, 14, 10], back: [8, 16, 12], shoulders: [6, 12, 8], biceps: [6, 10, 8], triceps: [6, 10, 8],
    forearms: [0, 8, 4], abs: [8, 16, 10], quads: [8, 14, 10], hamstrings: [6, 12, 8], glutes: [4, 10, 6], calves: [8, 14, 10],
  },
}
// How a group's goal splits between its parts (coverage.js GROUP_PARTS), whatever the goal: the
// shares of one goal, not sets on top of it. The presses give the front delts most of theirs and
// the rows the upper traps', so their share is small and the planner gives them no lift of their
// own (planner.js PLANNED_PARTS); the side and rear delts, the lats and mid back, and the two
// heads of the chest each get one.
export const PART_SHARES = {
  shoulders: { 'Front delts': 0.2, 'Side delts': 0.45, 'Rear delts': 0.35 },
  back: { Lats: 0.45, 'Mid back': 0.4, 'Upper traps': 0.15 },
  chest: { 'Upper chest': 0.35, 'Mid and lower chest': 0.65 },
}
// A part with no share of its own (the glutes'): its share of the group's goal.
export const PART_SHARE = 0.3

// A set of a compound credits more than one group (a squat: quads and glutes, a little of the
// rest), so a week reaches every group's goal in fewer sets than the goals add up to.
export const OVERLAP = 1.4
const MIN_PER_SET = 2.5   // a work set and its rest
const MIN_SESSION = 5     // getting set up, warming up

const isNum = n => typeof n === 'number' && Number.isFinite(n)

/** The kind of goal (GOAL_SETS): the one set, else the running program's, else muscle. */
export function goalTypeOf(S) {
  for (const k of [S?.goals?.type, S?.program?.plan?.goal]) if (GOAL_SETS[k]) return k
  return DEFAULT_TYPE
}
const tableOf = type => GOAL_SETS[type] || GOAL_SETS[DEFAULT_TYPE]

/** What a group's goal is without a setting of its own, for a kind of goal. */
export function defaultTargetFor(group, type = DEFAULT_TYPE) {
  return tableOf(type)[group]?.[2] ?? DEFAULT_GOAL
}

/** Sets a week `group` aims for. */
export function weeklyTargetOf(S, group) {
  const own = S?.goals?.byGroup?.[group]
  if (isNum(own) && own >= 0) return Math.min(MAX_GOAL, Math.round(own))
  return defaultTargetFor(group, goalTypeOf(S))
}

/**
 * The weekly minimum of a part of `group` (coverage.js GROUP_PARTS): its share of the group's
 * goal (PART_SHARES), PART_SHARE when it has none. Not rounded, so the shares add up to the goal.
 */
export function partTargetOf(S, group, part) {
  return weeklyTargetOf(S, group) * (PART_SHARES[group]?.[part] ?? PART_SHARE)
}

/** Group id -> weekly target, for `groups` (every group by default). */
export function weeklyTargets(S, groups = ADD_GROUPS.map(g => g.id)) {
  return Object.fromEntries(groups.map(g => [g, weeklyTargetOf(S, g)]))
}

/** The groups the goal is shown for: all but the ones no day trains, unless given a goal. */
export function goalGroups(S) {
  return ADD_GROUPS.map(g => g.id).filter(g => !UNTRACKED.includes(g) || isNum(S?.goals?.byGroup?.[g]))
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
