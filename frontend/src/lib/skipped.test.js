import { describe, expect, it } from 'vitest'
import { skipIds, isSkipped, toggleSkip, suggestable } from './skipped.js'
import { candidatesFor, generateWorkout } from './generate.js'
import { swapCycle } from './quick-swap.js'
import { groupExercises, shortlist } from './add-exercise.js'
import { EXIDX } from './exercises.js'

const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const session = (d, ids) => ({ id: 'w' + d, d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets: [{ w: 60, r: 8, done: true }] })) })
// bench press, dumbbell bench (chest); squat (quads)
const BENCH = '0025', DBBENCH = '0289', SQUAT = '0043'
const idsOf = r => r.sections.flatMap(s => s.list.map(x => x.id))

describe('the not-suggested list', () => {
  it('reads a profile without the field as nothing skipped', () => {
    expect(skipIds({})).toEqual([])
    expect(skipIds({ skipEx: null })).toEqual([])
    expect(isSkipped({}, BENCH)).toBe(false)
  })
  it('toggles an id in and out and reports the new state', () => {
    const s = {}
    expect(toggleSkip(s, BENCH)).toBe(true)
    expect(s.skipEx).toEqual([BENCH])
    expect(toggleSkip(s, SQUAT)).toBe(true)
    expect(toggleSkip(s, BENCH)).toBe(false)
    expect(s.skipEx).toEqual([SQUAT])
  })
  it('suggestable: available kit and not skipped', () => {
    expect(suggestable(state(), EXIDX[BENCH])).toBe(true)
    expect(suggestable(state({ skipEx: [BENCH] }), EXIDX[BENCH])).toBe(false)
    expect(suggestable(state(), null)).toBe(false)
    const home = { equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' }
    expect(suggestable(state(home), EXIDX[BENCH])).toBe(false)
  })
})

describe('a skipped exercise is never suggested', () => {
  it('one-tap candidates leave it out, logged or a staple', () => {
    const logged = state({ workouts: [session('2026-09-10', [BENCH])] })
    expect(candidatesFor(logged, 'chest')).toContain(BENCH)
    expect(candidatesFor({ ...logged, skipEx: [BENCH] }, 'chest')).not.toContain(BENCH)
    expect(candidatesFor(state({ skipEx: [BENCH] }), 'chest')).not.toContain(BENCH)
  })
  it('a generated workout picks around it, cardio and stretches too', () => {
    const opts = { cardio: true, stretch: true }
    const first = generateWorkout(state(), 'push', opts)
    const skipEx = first.map(p => p.id)
    const again = generateWorkout(state({ skipEx }), 'push', opts)
    expect(again.length).toBe(first.length)
    expect(again.some(p => skipEx.includes(p.id))).toBe(false)
    expect(again.some(p => p.kind === 'cardio')).toBe(true)
    expect(again.some(p => p.kind === 'stretch')).toBe(true)
  })
  it('the quick swap steps past it', () => {
    const cycle = swapCycle(state(), BENCH)
    expect(cycle).toContain(cycle[1])
    const skipped = swapCycle(state({ skipEx: [cycle[1]] }), BENCH)
    expect(skipped[0]).toBe(BENCH)
    expect(skipped).not.toContain(cycle[1])
  })
  it('Add exercise lists and shortlists leave it out', () => {
    const S = state({ workouts: [session('2026-10-10', [BENCH, DBBENCH])] })
    expect(idsOf(groupExercises(S, 'chest'))).toContain(BENCH)
    const skip = { ...S, skipEx: [BENCH] }
    expect(idsOf(groupExercises(skip, 'chest'))).not.toContain(BENCH)
    const { yours, picks, all } = shortlist(skip, 'chest')
    expect([...yours, ...picks, ...all].some(x => x.id === BENCH)).toBe(false)
    expect(yours.map(x => x.id)).toEqual([DBBENCH])
  })
  it('an activity group leaves it out too', () => {
    const run = idsOf(groupExercises(state(), 'cardio'))[0]
    expect(idsOf(groupExercises(state({ skipEx: [run] }), 'cardio'))).not.toContain(run)
  })
})
