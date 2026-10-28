import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOAL, GOAL_SETS, MAX_GOAL, PART_SHARE, baseGoalOf, daysOf, defaultTargetFor, goalEstimate, goalGroups, goalRef,
  goalSpan, goalTypeOf, goalWindow, partTargetOf, sessionMinutes, weeklyTargetOf, weeklyTargets, windowWorkouts,
} from './goals.js'
import { ADD_GROUPS } from './add-exercise.js'
import { weeklyDone, weeklyNeed } from './coverage.js'

const row = () => ({ w: 60, r: 8, done: true })
const session = (d, ids, n = 3) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: Array.from({ length: n }, row) })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const TUE = at(2026, 9, 15)   // a Tuesday
const BENCH = '0025'

describe('the weekly goal', () => {
  it('is the muscle goal\'s default for each group unless set', () => {
    expect(goalTypeOf(state())).toBe('growth')
    expect(baseGoalOf(state())).toBe(DEFAULT_GOAL)
    expect(weeklyTargets(state(), ['chest', 'back', 'shoulders', 'triceps', 'calves', 'abs']))
      .toEqual({ chest: 14, back: 16, shoulders: 24, triceps: 10, calves: 10, abs: 8 })
  })
  it('takes the defaults of the kind of goal set, else the running program\'s', () => {
    expect(weeklyTargetOf(state({ goals: { type: 'strength' } }), 'chest')).toBe(9)
    expect(weeklyTargetOf(state({ goals: { type: 'maintain' } }), 'chest')).toBe(5)
    expect(weeklyTargetOf(state({ program: { plan: { goal: 'endurance' } } }), 'abs')).toBe(10)
    expect(weeklyTargetOf(state({ goals: { type: 'nope' } }), 'chest')).toBe(14)
    // each kind's own base keeps its defaults as they are
    expect(baseGoalOf(state({ goals: { type: 'strength' } }))).toBe(goalRef('strength'))
  })
  it('every default sits in its range, and the shoulders are their three delts', () => {
    for (const [type, t] of Object.entries(GOAL_SETS)) {
      for (const [k, [lo, hi, def]] of [...Object.entries(t.groups), ...Object.entries(t.parts)]) {
        expect(lo <= def && def <= hi, `${type} ${k}`).toBe(true)
      }
      const delts = ['Front delts', 'Side delts', 'Rear delts'].map(p => t.parts[p])
      expect(t.groups.shoulders).toEqual([0, 1, 2].map(i => delts.reduce((a, d) => a + d[i], 0)))
      expect(t.parts.Lats[2] + t.parts['Mid back'][2], type).toBeLessThanOrEqual(t.groups.back[2] + 1)
      expect(Object.keys(t.groups).sort(), type).toEqual(ADD_GROUPS.map(g => g.id).sort())
    }
  })
  it('a base scales every default by itself over the kind of goal\'s own', () => {
    const st = state({ goals: { weeklySets: 15 } })
    expect(weeklyTargetOf(st, 'chest')).toBe(21)
    expect(weeklyTargetOf(st, 'abs')).toBe(12)
    expect(weeklyTargetOf(st, 'shoulders')).toBe(MAX_GOAL)
    expect(defaultTargetFor('chest', 4, 'strength')).toBe(5)
  })
  it('the parts: the delts and the traps have minimums of their own, moved with their group', () => {
    const st = state()
    expect(partTargetOf(st, 'shoulders', 'Side delts')).toBe(12)
    expect(partTargetOf(st, 'shoulders', 'Front delts')).toBe(4)
    expect(partTargetOf(st, 'back', 'Upper traps')).toBe(6)
    expect(partTargetOf(state({ goals: { type: 'maintain' } }), 'back', 'Upper traps')).toBe(0)
    // a group set to half its default halves its parts
    expect(partTargetOf(state({ goals: { byGroup: { shoulders: 12 } } }), 'shoulders', 'Rear delts')).toBe(4)
    // the glutes' parts have none of their own: a share of the group
    expect(partTargetOf(st, 'glutes', 'Side glutes')).toBeCloseTo(8 * PART_SHARE)
  })
  it('a group set on its own keeps its number, 0 included', () => {
    const st = state({ goals: { weeklySets: 15, byGroup: { biceps: 8, calves: 0 } } })
    expect(weeklyTargets(st, ['biceps', 'calves', 'chest'])).toEqual({ biceps: 8, calves: 0, chest: 21 })
  })
  it('ignores a goal out of range or not a number', () => {
    expect(baseGoalOf(state({ goals: { weeklySets: 99 } }))).toBe(30)
    expect(baseGoalOf(state({ goals: { weeklySets: 'x' } }))).toBe(DEFAULT_GOAL)
  })
  it('leaves forearms out of what it shows unless they have a goal', () => {
    expect(goalGroups(state())).not.toContain('forearms')
    expect(goalGroups(state({ goals: { byGroup: { forearms: 4 } } }))).toContain('forearms')
  })
  it('spans the smallest to the largest goal shown', () => {
    expect(goalSpan(state())).toEqual({ lo: 8, hi: 24 })
    expect(goalSpan(state({ goals: { type: 'maintain' } }))).toEqual({ lo: 2, hi: 7 })
  })
  it('estimates the week, a session and its minutes', () => {
    const e = goalEstimate(state({ goals: { weeklySets: 10, days: 4 } }))
    expect(e.days).toBe(4)
    expect(e.week).toBeGreaterThan(70)
    expect(e.week).toBeLessThan(100)
    expect(e.session).toBe(Math.round(e.week / 4))
    expect(sessionMinutes(18)).toBe(50)
    expect(daysOf(state({ program: { days: ['full', 'full', 'full'] } }))).toBe(3)
  })
})

describe('the week a goal counts', () => {
  it('is the last 7 days without a program', () => {
    expect(goalWindow(state(), TUE)).toEqual({ from: '2026-09-09', to: '2026-09-15', calendar: false })
  })
  it('is the calendar week while a program runs, from the first day of the week set', () => {
    const p = { days: ['full'], startedAt: '2026-09-01', weeks: 8 }
    expect(goalWindow(state({ program: p }), TUE).from).toBe('2026-09-14')
    expect(goalWindow(state({ program: p, weekStart: 0 }), TUE).from).toBe('2026-09-13')
  })
  it('weekly done and need read the goal and the window', () => {
    const workouts = [session('2026-09-12', [BENCH], 5), session('2026-09-14', [BENCH], 5)]
    const rolling = state({ workouts, goals: { byGroup: { chest: 10 } } })
    expect(windowWorkouts(rolling, TUE)).toHaveLength(2)
    expect(weeklyDone(rolling, TUE).chest).toBe(10)
    const calendar = state({ workouts, program: { days: ['push'], startedAt: '2026-09-01', weeks: 8 } })
    expect(weeklyDone(calendar, TUE).chest).toBe(5)
    // 10 of 10 leaves no need; 10 of 20 leaves half, before rest
    expect(weeklyNeed(rolling, ['chest'], TUE).chest).toBe(0)
    expect(weeklyNeed(state({ workouts, goals: { byGroup: { chest: 20 } } }), ['chest'], TUE).chest).toBeGreaterThan(0)
  })
})
