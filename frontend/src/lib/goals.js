// The weekly goal: hard sets per muscle group a week (coverage.js counts them). One number for
// the big groups (`S.goals.weeklySets`, 10 unless set); calves, forearms and abs take about two
// thirds of it, since they recover fast and get work from the big lifts too. A group can be set
// on its own (`S.goals.byGroup`). `S.goals.days` is how many days a week you mean to train, for
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
export const SMALL_GROUPS = ['forearms', 'abs', 'calves']
export const SMALL_SHARE = 2 / 3
export const DEFAULT_DAYS = 4
/** No one-tap day trains forearms on their own, so the goal leaves them out unless set. */
export const UNTRACKED = ['forearms']

// A set of a compound credits more than one group (a squat: quads and glutes, a little of the
// rest), so a week reaches every group's goal in fewer sets than the goals add up to.
const OVERLAP = 1.4
const MIN_PER_SET = 2.5   // a work set and its rest
const MIN_SESSION = 5     // getting set up, warming up

const clampGoal = n => Math.max(MIN_GOAL, Math.min(MAX_GOAL, Math.round(n)))
const isNum = n => typeof n === 'number' && Number.isFinite(n)

/** The goal for the big groups. */
export function baseGoalOf(S) {
  const n = S?.goals?.weeklySets
  return isNum(n) && n > 0 ? clampGoal(n) : DEFAULT_GOAL
}

/** What a group's goal is without a setting of its own, for a base goal. */
export const defaultTargetFor = (group, base) =>
  SMALL_GROUPS.includes(group) ? Math.max(1, Math.round(base * SMALL_SHARE)) : base

/** Sets a week `group` aims for. */
export function weeklyTargetOf(S, group) {
  const own = S?.goals?.byGroup?.[group]
  if (isNum(own) && own >= 0) return Math.min(MAX_GOAL, Math.round(own))
  return defaultTargetFor(group, baseGoalOf(S))
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
