import { beforeAll, describe, expect, it } from 'vitest'
import { SWAP_CYCLE, swapCycle, nextSwap } from './quick-swap.js'
import { STAPLES } from './generate.js'
import { EXIDX } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'
import { loadMuscleRoles, muscleRolesOf } from './muscle-roles.js'

const session = (d, ids) => ({ id: 'w' + d, d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: [{ w: 60, r: 8, done: true }] })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const active = (...ids) => ({ entries: ids.map(id => (typeof id === 'string' ? { id, sets: [] } : { sets: [], ...id })) })

// bench press, dumbbell bench (chest); squat (quads)
const BENCH = '0025', DBBENCH = '0289', SQUAT = '0043'

describe('swapCycle', () => {
  it('starts on the exercise, then what you logged on its muscle, then the staples', () => {
    const S = state({ workouts: [session('2026-10-01', [DBBENCH])] })
    const cycle = swapCycle(S, BENCH)
    expect(cycle[0]).toBe(BENCH)
    expect(cycle[1]).toBe(DBBENCH)
    expect(cycle.slice(2, 4)).toEqual(STAPLES.chest.filter(id => id !== BENCH && id !== DBBENCH).slice(0, 2))
    expect(cycle).toHaveLength(SWAP_CYCLE)
    expect(new Set(cycle).size).toBe(cycle.length)
    expect(cycle.every(id => primaryMuscleOf(EXIDX[id])?.slug === 'chest')).toBe(true)
  })
  it('leaves out what the equipment profile rules out', () => {
    const S = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    expect(swapCycle(S, DBBENCH).slice(1).every(id => EXIDX[id].eq !== 'barbell')).toBe(true)
  })
  it('an unknown exercise has nothing to swap to', () => {
    expect(swapCycle(state(), 'nope')).toEqual(['nope'])
  })
})

// dumbbell lateral raise (side delt), dumbbell reverse fly (rear delt), overhead press (front delt)
const RAISE = '0334', FLY = '0383', OHP = '0426'
const targetOf = id => muscleRolesOf(id)?.target.join(' ')

describe('swapCycle by muscle roles', () => {
  beforeAll(() => loadMuscleRoles())
  it('a lateral raise swaps to other side-delt work, not to the shoulder-press staples', () => {
    const cycle = swapCycle(state(), RAISE)
    expect(cycle).toHaveLength(SWAP_CYCLE)
    expect(cycle.every(id => targetOf(id) === 'side-delt')).toBe(true)
  })
  it('a reverse fly swaps to other rear-delt work', () => {
    expect(swapCycle(state(), FLY).every(id => targetOf(id) === 'rear-delt')).toBe(true)
  })
  it('what you logged leads within its tier, and only there', () => {
    const S = state({ workouts: [session('2026-10-01', ['0178', OHP])] })
    expect(swapCycle(S, RAISE)[1]).toBe('0178')
    expect(swapCycle(S, OHP)[1]).not.toBe('0178')
    expect(targetOf(swapCycle(S, OHP)[1])).toBe('front-delt')
  })
  it('without roles the order is the one before them', () => {
    expect(swapCycle(state(), RAISE, () => null)[1]).toBe(STAPLES.deltoids[0])
  })
})

describe('nextSwap', () => {
  it('steps down the cycle the entry started on, and back round to it', () => {
    const S = state({ active: active(BENCH) })
    const cycle = swapCycle(S, BENCH)
    const first = nextSwap(S, 0)
    expect(first).toEqual({ id: cycle[1], swapOf: BENCH })
    const S2 = state({ active: active({ id: cycle[1], swapOf: BENCH }) })
    expect(nextSwap(S2, 0)).toEqual({ id: cycle[2], swapOf: BENCH })
    const S3 = state({ active: active({ id: cycle.at(-1), swapOf: BENCH }) })
    expect(nextSwap(S3, 0)).toEqual({ id: BENCH, swapOf: null })
  })
  it('skips what is already elsewhere in the workout', () => {
    const cycle = swapCycle(state(), BENCH)
    const S = state({ active: active(BENCH, SQUAT, cycle[1]) })
    expect(nextSwap(S, 0).id).toBe(cycle[2])
  })
  it('null when there is no such entry', () => {
    expect(nextSwap(state({ active: active(BENCH) }), 3)).toBeNull()
    expect(nextSwap(state(), 0)).toBeNull()
  })
})
