import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GOAL, baseGoalOf, daysOf, goalEstimate, goalGroups, goalWindow, sessionMinutes, weeklyTargetOf,
  weeklyTargets, windowWorkouts,
} from './goals.js'
import { weeklyDone, weeklyNeed } from './coverage.js'

const row = () => ({ w: 60, r: 8, done: true })
const session = (d, ids, n = 3) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: Array.from({ length: n }, row) })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const TUE = at(2026, 9, 15)   // a Tuesday
const BENCH = '0025'

describe('the weekly goal', () => {
  it('is 10 a group unless set; calves, forearms and abs take about two thirds', () => {
    expect(baseGoalOf(state())).toBe(DEFAULT_GOAL)
    expect(weeklyTargetOf(state(), 'chest')).toBe(10)
    expect(weeklyTargetOf(state(), 'calves')).toBe(7)
    const st = state({ goals: { weeklySets: 15 } })
    expect(weeklyTargetOf(st, 'back')).toBe(15)
    expect(weeklyTargetOf(st, 'abs')).toBe(10)
  })
  it('a group set on its own keeps its number, 0 included', () => {
    const st = state({ goals: { weeklySets: 15, byGroup: { biceps: 8, calves: 0 } } })
    expect(weeklyTargets(st, ['biceps', 'calves', 'chest'])).toEqual({ biceps: 8, calves: 0, chest: 15 })
  })
  it('ignores a goal out of range or not a number', () => {
    expect(baseGoalOf(state({ goals: { weeklySets: 99 } }))).toBe(30)
    expect(baseGoalOf(state({ goals: { weeklySets: 'x' } }))).toBe(DEFAULT_GOAL)
  })
  it('leaves forearms out of what it shows unless they have a goal', () => {
    expect(goalGroups(state())).not.toContain('forearms')
    expect(goalGroups(state({ goals: { byGroup: { forearms: 4 } } }))).toContain('forearms')
  })
  it('estimates the week, a session and its minutes', () => {
    const e = goalEstimate(state({ goals: { weeklySets: 10, days: 4 } }))
    expect(e.days).toBe(4)
    expect(e.week).toBeGreaterThan(40)
    expect(e.week).toBeLessThan(80)
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
    const rolling = state({ workouts })
    expect(windowWorkouts(rolling, TUE)).toHaveLength(2)
    expect(weeklyDone(rolling, TUE).chest).toBe(10)
    const calendar = state({ workouts, program: { days: ['push'], startedAt: '2026-09-01', weeks: 8 } })
    expect(weeklyDone(calendar, TUE).chest).toBe(5)
    // 10 of 10 leaves no need; 10 of 20 leaves half, before rest
    expect(weeklyNeed(rolling, ['chest'], TUE).chest).toBe(0)
    expect(weeklyNeed(state({ workouts, goals: { weeklySets: 20 } }), ['chest'], TUE).chest).toBeGreaterThan(0)
  })
})
