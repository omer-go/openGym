import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOAL, GOAL_SETS, VOLUMES, MAX_GOAL, PART_SHARE, PART_SHARES, daysOf, defaultTargetFor, goalEstimate, goalGroups,
  goalTypeOf, goalWindow, partTargetOf, sessionMinutes, volumeOf, weeklyTargetOf, weeklyTargets, windowWorkouts,
} from './goals.js'
import { GROUP_PARTS } from './coverage.js'
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
    expect(weeklyTargets(state(), ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'calves', 'abs']))
      .toEqual({ chest: 14, back: 16, shoulders: 12, biceps: 12, triceps: 10, calves: 10, abs: 8 })
    expect(defaultTargetFor('nope')).toBe(DEFAULT_GOAL)
  })
  it('takes the defaults of the kind of goal set, else the running program\'s', () => {
    expect(weeklyTargetOf(state({ goals: { type: 'strength' } }), 'chest')).toBe(9)
    expect(weeklyTargetOf(state({ goals: { type: 'maintain' } }), 'chest')).toBe(5)
    expect(weeklyTargetOf(state({ program: { plan: { goal: 'endurance' } } }), 'abs')).toBe(10)
    expect(weeklyTargetOf(state({ goals: { type: 'nope' } }), 'chest')).toBe(14)
  })
  it('every default sits in its range, and the shoulders sit with the arms', () => {
    const shoulders = { growth: [8, 20, 12], strength: [4, 10, 6], maintain: [2, 6, 4], endurance: [6, 12, 8] }
    for (const [type, t] of Object.entries(GOAL_SETS)) {
      for (const [k, [lo, hi, def]] of Object.entries(t)) expect(lo <= def && def <= hi, `${type} ${k}`).toBe(true)
      expect(Object.keys(t).sort(), type).toEqual(ADD_GROUPS.map(g => g.id).sort())
      expect(t.shoulders, type).toEqual(shoulders[type])
    }
  })
  it('a volume moves every group along its range, a group set on its own keeping its number', () => {
    expect([-2, -1, 0, 1, 2].map(v => defaultTargetFor('chest', 'growth', v))).toEqual([10, 12, 14, 17, 20])
    expect(defaultTargetFor('abs', 'growth', -2)).toBe(0)
    expect(defaultTargetFor('chest', 'growth', 7)).toBe(14)
    for (const [type, t] of Object.entries(GOAL_SETS)) for (const [g, [lo, hi]] of Object.entries(t)) {
      expect(defaultTargetFor(g, type, -2), `${type} ${g}`).toBe(lo)
      expect(defaultTargetFor(g, type, 2), `${type} ${g}`).toBe(hi)
    }
    const st = state({ goals: { volume: 2, byGroup: { biceps: 9 } } })
    expect(weeklyTargets(st, ['chest', 'biceps'])).toEqual({ chest: 20, biceps: 9 })
  })
  it('the volume set, else the running program\'s, else the default', () => {
    expect(VOLUMES).toEqual([-2, -1, 0, 1, 2])
    expect(volumeOf(state())).toBe(0)
    expect(volumeOf(state({ program: { plan: { volume: -1 } } }))).toBe(-1)
    expect(volumeOf(state({ goals: { volume: 2 }, program: { plan: { volume: -1 } } }))).toBe(2)
    expect(volumeOf(state({ goals: { volume: 9 } }))).toBe(0)
  })
  it('an old weekly number for every group is ignored', () => {
    const st = state({ goals: { weeklySets: 15 } })
    expect(weeklyTargets(st, ['chest', 'shoulders', 'abs'])).toEqual({ chest: 14, shoulders: 12, abs: 8 })
    expect(weeklyTargetOf(state({ goals: { weeklySets: 6, type: 'strength' } }), 'chest')).toBe(9)
  })
  it('the parts share their group\'s goal, whatever it is', () => {
    for (const [g, shares] of Object.entries(PART_SHARES)) {
      expect(Object.keys(shares).sort(), g).toEqual(GROUP_PARTS[g].map(([name]) => name).sort())
      for (const goal of [10, 12, 20]) {
        const st = state({ goals: { byGroup: { [g]: goal } } })
        const sum = Object.keys(shares).reduce((n, name) => n + partTargetOf(st, g, name), 0)
        expect(sum, `${g} ${goal}`).toBeCloseTo(goal, 5)
      }
      for (const type of Object.keys(GOAL_SETS)) {
        const st = state({ goals: { type } })
        const sum = Object.keys(shares).reduce((n, name) => n + partTargetOf(st, g, name), 0)
        expect(sum, `${g} ${type}`).toBeCloseTo(weeklyTargetOf(st, g), 5)
      }
    }
    const st = state()
    expect(partTargetOf(st, 'shoulders', 'Side delts')).toBeCloseTo(5.4)
    expect(partTargetOf(st, 'shoulders', 'Rear delts')).toBeCloseTo(4.2)
    expect(partTargetOf(st, 'shoulders', 'Front delts')).toBeCloseTo(2.4)
    expect(partTargetOf(st, 'chest', 'Upper chest')).toBeCloseTo(4.9)
    expect(partTargetOf(state({ goals: { byGroup: { shoulders: 20 } } }), 'shoulders', 'Side delts')).toBeCloseTo(9)
    // the glutes' parts have no share of their own: PART_SHARE of the group
    expect(partTargetOf(st, 'glutes', 'Side glutes')).toBeCloseTo(8 * PART_SHARE)
  })
  it('a group set on its own keeps its number, 0 included', () => {
    const st = state({ goals: { byGroup: { biceps: 8, calves: 0, chest: 99 } } })
    expect(weeklyTargets(st, ['biceps', 'calves', 'chest', 'back'])).toEqual({ biceps: 8, calves: 0, chest: MAX_GOAL, back: 16 })
    expect(weeklyTargetOf(state({ goals: { byGroup: { chest: 'x' } } }), 'chest')).toBe(14)
  })
  it('leaves forearms out of what it shows unless they have a goal', () => {
    expect(goalGroups(state())).not.toContain('forearms')
    expect(goalGroups(state({ goals: { byGroup: { forearms: 4 } } }))).toContain('forearms')
  })
  it('estimates the week, a session and its minutes', () => {
    const e = goalEstimate(state({ goals: { days: 4 } }))
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
