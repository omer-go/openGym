import { describe, expect, it } from 'vitest'
import { WEEKLY_TARGET, groupCredit, weeklyDone, weeklyNeed, variantHistory, pickForCoverage } from './coverage.js'
import { generateWorkout } from './generate.js'
import { EXIDX } from './exercises.js'
import { musclesOf } from './muscles.js'
import { variantOf } from './variant.js'
import { groupOfExercise } from './muscle-colors.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const sets = n => Array.from({ length: n }, () => row())
const session = (d, ids, s = sets(3)) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: s })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const at = (y, m, d) => new Date(y, m - 1, d, 12).getTime()
const NOW = at(2026, 9, 15)
const ALL = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'abs', 'quads', 'hamstrings', 'glutes', 'calves']
const credit = id => groupCredit(musclesOf(EXIDX[id]))
const groupsOf = picks => picks.map(p => groupOfExercise(EXIDX[p.id]))

// barbell bench press, dumbbell bench press, squat, deadlift, romanian deadlift, barbell shrug,
// dumbbell standing overhead press, cable lateral raise, pushdown
const BENCH = '0025', DB_BENCH = '0289', SQUAT = '0043', DEADLIFT = '0032', RDL = '0085', SHRUG = '0095'
const OHP = '0426', CABLE_RAISE = '0178', PUSHDOWN = '0241'

describe('groupCredit', () => {
  it('credits each group its best muscle: primary 1, secondary 0.4', () => {
    expect(credit(SQUAT)).toMatchObject({ quads: 1, glutes: 1, hamstrings: 0.4, calves: 0.4, abs: 0.4 })
    expect(credit(BENCH)).toEqual({ chest: 1, shoulders: 0.4, triceps: 0.4 })
  })
  it('a group’s other muscles credit it at a quarter: a deadlift or shrugs are no back exercise', () => {
    expect(credit(DEADLIFT).back).toBe(0.25)  // lower back
    expect(credit(SHRUG).back).toBe(0.25)     // traps
    expect(credit('1323').back).toBe(1)       // a row works the upper back, the group's main muscle
  })
})

describe('weeklyNeed', () => {
  it('counts credit × completed work sets over the last 7 days', () => {
    const st = state({ workouts: [
      session('2026-09-14', [BENCH], [row(), row(), row({ warmup: true }), row({ done: false })]),
      session('2026-09-08', [BENCH]),  // 7 days before today: outside the window
      session('2026-09-09', [OHP]),    // 6 days before: inside
      session('2026-09-16', [BENCH]),  // after now
    ] })
    const done = weeklyDone(st, NOW)
    expect(done.chest).toBeCloseTo(2 + 1.2) // the press works the upper chest in support
    expect(done.shoulders).toBeCloseTo(0.8 + 3)
  })
  it('a week of 10 effective sets leaves nothing, rested or not', () => {
    const tenSets = state({ workouts: [session('2026-09-09', [BENCH]), session('2026-09-10', [BENCH], sets(WEEKLY_TARGET))] })
    expect(weeklyNeed(tenSets, ['chest'], at(2026, 9, 16)).chest).toBe(0)
  })
  it('a group still fatigued needs less than its sets alone say', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH], sets(4))] })
    const need = weeklyNeed(st, ['chest', 'quads'], NOW)
    expect(need.quads).toBe(1)
    expect(need.chest).toBeLessThan(1 - 4 / WEEKLY_TARGET)
  })
})

describe('pickForCoverage, a fresh week', () => {
  const fresh = generateWorkout(state(), 'full', { now: NOW })
  it('one exercise per group before any second, each on the group’s main muscle', () => {
    expect(fresh).toHaveLength(7)
    expect(new Set(groupsOf(fresh)).size).toBe(7)
    expect(groupsOf(fresh)).not.toContain('forearms')
  })
  it('the big compounds cover the groups it has no slot for', () => {
    const ids = fresh.map(p => p.id)
    expect(ids).toContain(SQUAT)
    const covered = {}
    for (const id of ids) for (const [g, c] of Object.entries(credit(id))) covered[g] = (covered[g] || 0) + c
    for (const g of ALL) expect(covered[g], g).toBeGreaterThan(0)
  })
  it('runs compounds first', () => {
    const total = p => Object.values(credit(p.id)).reduce((a, b) => a + b, 0)
    const totals = fresh.map(total)
    expect(totals).toEqual(totals.slice().sort((a, b) => b - a))
  })
  it('a shuffle changes the exercises, not the groups', () => {
    const next = generateWorkout(state(), 'full', { now: NOW, shift: 1 })
    expect(next.map(p => p.id)).not.toEqual(fresh.map(p => p.id))
    expect(new Set(next.map(p => p.id)).size).toBe(7)
  })
})

describe('pickForCoverage, after the week so far', () => {
  it('groups that had their week wait while others are open', () => {
    // a push day of 12 sets each, five days ago: rested but done for the week
    const st = state({ workouts: [session('2026-09-10', [BENCH, '0047', OHP, '1162', PUSHDOWN, '0814'], sets(6))] })
    const picks = generateWorkout(st, 'full', { now: NOW, count: 5 })
    expect(groupsOf(picks)).not.toContain('chest')
    expect(groupsOf(picks)).not.toContain('shoulders')
    expect(groupsOf(picks)).not.toContain('triceps')
  })
  it('the day after a bench session, chest waits for the rested groups', () => {
    const st = state({ workouts: [session('2026-09-14', [BENCH, DB_BENCH], sets(4))] })
    expect(groupsOf(generateWorkout(st, 'full', { now: NOW, count: 6 }))).not.toContain('chest')
  })
  it('still fills every slot when each group has had its week', () => {
    const st = state({ workouts: [session('2026-09-12', ['0652', BENCH, OHP, SQUAT, RDL, '0031', PUSHDOWN, '0175', '0605'], sets(12))] })
    expect(generateWorkout(st, 'full', { now: NOW })).toHaveLength(7)
  })
})

describe('variety', () => {
  const chestPick = st => generateWorkout(st, 'full', { now: NOW }).find(p => groupOfExercise(EXIDX[p.id]) === 'chest')
  it('after a flat barbell bench, chest moves to another angle and another tool', () => {
    const v = variantOf(EXIDX[chestPick(state({ workouts: [session('2026-09-01', [BENCH])] })).id])
    expect(v.angle).not.toBe('flat')
    expect(v.tool).not.toBe('barbell')
  })
  it('after a flat dumbbell bench, it moves to a barbell or the smith machine', () => {
    const v = variantOf(EXIDX[chestPick(state({ workouts: [session('2026-09-01', [DB_BENCH])] })).id])
    expect(v.angle).not.toBe('flat')
    expect(v.tool).not.toBe('dumbbell')
  })
  it('after incline and decline, the angle done longest ago comes back', () => {
    const st = state({ workouts: [session('2026-08-25', [BENCH]), session('2026-09-01', ['0047', '0301'])] })
    expect(variantOf(EXIDX[chestPick(st).id]).angle).toBe('flat')
  })
  it('the equipment profile still decides what is possible', () => {
    const st = state({
      workouts: [session('2026-09-01', [DB_BENCH])],
      equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p',
    })
    for (const p of generateWorkout(st, 'full', { now: NOW })) expect(['dumbbell', 'bodyweight']).toContain(variantOf(EXIDX[p.id]).tool)
  })
  it('a second exercise for the same group in one session is on another tool', () => {
    const back = generateWorkout(state(), 'pull', { now: NOW }).filter(p => groupOfExercise(EXIDX[p.id]) === 'back' && p.muscle === 'upper-back')
    expect(back.length).toBeGreaterThan(1)
    expect(new Set(back.map(p => variantOf(EXIDX[p.id]).tool)).size).toBe(back.length)
  })
  it('presses rotate with presses: a raise never stands in for an overhead press', () => {
    // the dumbbell press was done last, so the cable raise is the staler tool; it is no press
    const history = variantHistory(state({ workouts: [session('2026-09-14', [OHP])] }))
    const [pick] = pickForCoverage([{ id: CABLE_RAISE, rank: 0 }, { id: OHP, rank: 1 }], { count: 1, groups: ['shoulders', 'triceps', 'chest'], need: { shoulders: 1, triceps: 1, chest: 1 }, history })
    expect(pick.id).toBe(OHP)
  })
  it('between equal variations, the exercise you know comes first', () => {
    const cands = [{ id: '0047', rank: 3 }, { id: '0314', rank: 1 }, { id: '0757', rank: 2 }]
    const [pick] = pickForCoverage(cands, { count: 1, groups: ['chest'], need: { chest: 1 } })
    expect(pick.id).toBe('0314')
  })
})
