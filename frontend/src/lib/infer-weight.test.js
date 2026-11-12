import { beforeAll, describe, expect, it } from 'vitest'
import { inferWeight, withInferredWeight, NEW_LIFT, REACH } from './infer-weight.js'
import { buildPlannedEntry } from './session-start.js'
import { generatedEntries } from './generate.js'
import { estimate1RM, formulaOf } from './onerm.js'
import { isWarmupRow } from './workout-model.js'
import { loadMuscleRoles } from './muscle-roles.js'

const BENCH = '0025', DB_BENCH = '0289', SMITH_BENCH = '0748', CABLE_BENCH = '0151'
const SQUAT = '0043', FRONT_SQUAT = '0042', SMITH_SQUAT = '0770'
const PREACHER = '0070', DB_PREACHER = '0372', PUSHUP = '0662'

const row = (w, r) => ({ w, r, done: true })
const session = (d, id, w, r = 5, target = {}) => ({ id: 'w' + d + id, d, name: 'x', entries: [{ id, target: { reps: r, ...target }, sets: [row(w, r), row(w, r), row(w, r)] }] })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const e1 = (w, r) => estimate1RM(w, r, formulaOf({}))
// The weight a one-rep max allows at `reps` with two in the tank, the helper's own reading.
const at = (max, reps) => max / (e1(100, reps + 2) / 100)

beforeAll(loadMuscleRoles)

describe('a first weight read off a similar lift', () => {
  it('a cable lift reads another on the same stack as it is: no kit to convert between', () => {
    // a standing rear delt row off the seated one
    const S = state({ workouts: [session('2026-10-01', '0203', 50, 10)] })
    const g = inferWeight(S, { id: '0233', reps: 10, mode: 'reps' })
    expect(g.from).toBe('0203')
    expect(g.est).toBeCloseTo(e1(50, 10) * NEW_LIFT, 0)
    expect(g.w).toBeLessThanOrEqual(at(g.est, 10))
  })
  it('a barbell bench from a Smith bench is lighter: the Smith machine steadies the bar', () => {
    const S = state({ workouts: [session('2026-10-01', SMITH_BENCH, 100)] })
    const g = inferWeight(S, { id: BENCH, reps: 5, mode: 'reps' })
    expect(g.from).toBe(SMITH_BENCH)
    expect(g.est).toBeCloseTo(e1(100, 5) / 1.1 * NEW_LIFT, 0)
    expect(g.w).toBeLessThanOrEqual(at(g.est, 5))
    expect(g.w).toBeGreaterThan(at(g.est, 5) - 2.5)
    expect(g.w % 2.5).toBe(0)
    // The other way round the Smith bench takes more than its bar.
    const back = inferWeight(state({ workouts: [session('2026-10-01', BENCH, 100)] }), { id: SMITH_BENCH, reps: 5, mode: 'reps' })
    expect(back.w).toBeGreaterThan(g.w)
  })

  it('a dumbbell bench takes about two fifths of the bar a hand, or both bells as a total', () => {
    const S = state({ workouts: [session('2026-10-01', BENCH, 100)] })
    const each = inferWeight(S, { id: DB_BENCH, reps: 8, mode: 'reps' })
    expect(each.est).toBeCloseTo(e1(100, 5) * 0.4 * NEW_LIFT, 0)
    expect(each.w).toBeGreaterThan(20)
    expect(each.w).toBeLessThan(40)
    const total = inferWeight({ ...S, dbLoad: { [DB_BENCH]: { mode: 'total', _ts: 1 } } }, { id: DB_BENCH, reps: 8, mode: 'reps' })
    expect(total.w).toBeGreaterThan(each.w * 1.8)
    // And a dumbbell bench logged a hand reads back as twice that on the bar.
    const bar = inferWeight(state({ workouts: [session('2026-10-01', DB_BENCH, 30)] }), { id: BENCH, reps: 5, mode: 'reps' })
    expect(bar.est).toBeCloseTo(e1(30, 5) / 0.4 * NEW_LIFT, 0)
  })

  it('lands on a dumbbell you own', () => {
    const S = state({ workouts: [session('2026-10-01', BENCH, 100)], dumbbells: { kg: { weights: [10, 20, 24, 32], _ts: 1 } } })
    expect(inferWeight(S, { id: DB_BENCH, reps: 8, mode: 'reps' }).w).toBe(24)
  })

  it('reads the same named movement on other kit first', () => {
    const curls = state({ workouts: [session('2026-10-01', PREACHER, 40, 10)] })
    expect(inferWeight(curls, { id: DB_PREACHER, reps: 10, mode: 'reps' })).toMatchObject({ from: PREACHER, reach: 0 })
    const squats = state({ workouts: [session('2026-10-01', SQUAT, 140)] })
    expect(inferWeight(squats, { id: SMITH_SQUAT, reps: 5, mode: 'reps' })).toMatchObject({ from: SQUAT, reach: 0 })
  })

  it('falls back on another lift for the same muscles, started well under it', () => {
    // A front squat is no back squat with another bar, but your back squat still says roughly
    // what it will be: well under the same lift's guess.
    const squats = state({ workouts: [session('2026-10-01', SQUAT, 140)] })
    const front = inferWeight(squats, { id: FRONT_SQUAT, reps: 5, mode: 'reps' })
    expect(front).toMatchObject({ from: SQUAT })
    expect(front.reach).toBeGreaterThan(0)
    expect(front.est).toBeCloseTo(e1(140, 5) * REACH[front.reach], 0)
    expect(front.w).toBeLessThan(inferWeight(squats, { id: SMITH_SQUAT, reps: 5, mode: 'reps' }).w / 1.1)
    // A bench on the cable stack reads the barbell's load as it is, a step further off.
    const S = state({ workouts: [session('2026-10-01', BENCH, 100)] })
    const cable = inferWeight(S, { id: CABLE_BENCH, reps: 10, mode: 'reps' })
    expect(cable).toMatchObject({ from: BENCH, reach: 1 })
    expect(cable.est).toBeCloseTo(e1(100, 5) * REACH[1], 0)
  })

  it('prefers the closest source to the one trained last', () => {
    // The cable bench was trained last, but it is a stack: the barbell bench says more.
    const S = state({ workouts: [session('2026-10-01', BENCH, 100), session('2026-10-08', CABLE_BENCH, 40, 10)] })
    expect(inferWeight(S, { id: DB_BENCH, reps: 8, mode: 'reps' })).toMatchObject({ from: BENCH, reach: 0 })
  })

  it('loads for the reps the rows open at, the top of a range', () => {
    const S = state({ workouts: [session('2026-10-01', BENCH, 100)] })
    const ten = inferWeight(S, { id: DB_BENCH, reps: 10, mode: 'reps' })
    const range = inferWeight(S, { id: DB_BENCH, repsMin: 10, reps: 15, mode: 'reps' })
    expect(range.w).toBeLessThan(ten.w)
    expect(range.w).toBe(inferWeight(S, { id: DB_BENCH, reps: 15, mode: 'reps' }).w)
  })

  it('reads a lift done past the rep cap as if done at the cap', () => {
    // Calf raises for twenty give no one-rep max, but the load still says something.
    const S = state({ workouts: [session('2026-10-01', '0417', 40, 20)] })
    const g = inferWeight(S, { id: '0773', reps: 12, mode: 'reps' })
    expect(g?.from).toBe('0417')
    expect(g.w).toBeGreaterThan(0)
  })

  it('takes the recent best, and the lift trained last of two', () => {
    const S = state({ workouts: [session('2026-09-01', SMITH_BENCH, 60), session('2026-10-01', DB_BENCH, 30)] })
    expect(inferWeight(S, { id: BENCH, reps: 5, mode: 'reps' }).from).toBe(DB_BENCH)
  })

  it('leaves alone a lift with a weight of its own, a bodyweight lift, and a lift with nothing like it', () => {
    const S = state({ workouts: [session('2026-10-01', BENCH, 100)] })
    expect(inferWeight({ ...S, exWeights: { [DB_BENCH]: { w: 30, d: '2026-09-01' } } }, { id: DB_BENCH, reps: 8, mode: 'reps' })).toBeNull()
    expect(inferWeight(S, { id: BENCH, reps: 5, mode: 'reps' })).toBeNull()
    expect(inferWeight(S, { id: PUSHUP, reps: 10, mode: 'reps' })).toBeNull()
    expect(inferWeight(state(), { id: DB_BENCH, reps: 8, mode: 'reps' })).toBeNull()
    expect(withInferredWeight(S, { id: DB_BENCH, reps: 8, weight: 18 }).cfg.weight).toBe(18)
  })
})

describe('a lift never logged opens at the estimate', () => {
  const S = state({ workouts: [session('2026-10-01', BENCH, 100)] })
  const work = sets => sets.filter(s => !isWarmupRow(s))

  it('in a planned session, and says where it came from; the plan keeps no weight', () => {
    const entry = buildPlannedEntry(S, { id: DB_BENCH, sets: 3, reps: 8, weight: 0, mode: 'reps' }, null)
    const w = inferWeight(S, { id: DB_BENCH, reps: 8, mode: 'reps' }).w
    expect(work(entry.sets).every(s => s.w === w)).toBe(true)
    expect(entry.plan.why[1]).toBe('barbell bench press')
    expect(entry.planned.weight).toBe(0)
  })

  it('in a one-tap workout, planned or freestyle', () => {
    const w = inferWeight(S, { id: DB_BENCH, reps: 8, mode: 'reps' }).w
    const [free] = generatedEntries(S, [{ id: DB_BENCH, muscle: 'chest', last: null }])
    expect(work(free.sets)[0].w).toBeGreaterThan(0)
    const [planned] = generatedEntries(S, [{ id: DB_BENCH, muscle: 'chest', last: null, slot: 'main' }], { type: 'push', goal: 'growth' })
    expect(work(planned.sets)[0].w).toBeGreaterThan(0)
    expect(work(planned.sets)[0].w).toBeLessThanOrEqual(w * 1.5)
  })
})
