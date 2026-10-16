import { describe, expect, it } from 'vitest'
import { ADD_GROUPS, MUSCLE_VIEW, avatarOf, groupOfMuscle, muscleStatus, suggestedGroups, groupExercises, lastTopSet } from './add-exercise.js'
import { MUSCLES } from './muscles.js'
import { STAPLES } from './generate.js'
import { EXIDX } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const session = (d, ids, sets = [row()]) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })

// bench press (chest), dumbbell bench (chest), lat pulldown (upper back), squat (quads)
const BENCH = '0025', DBBENCH = '0289', PULLDOWN = '2330', SQUAT = '0043'
// 2026-10-16 is a Friday; with a Monday start the week began on the 12th
const TODAY = '2026-10-16'

describe('groups', () => {
  it('every muscle the map draws belongs to exactly one group, and has a side and a box', () => {
    for (const slug of MUSCLES) {
      expect(ADD_GROUPS.filter(g => g.m.includes(slug)), slug).toHaveLength(1)
      expect(MUSCLE_VIEW[slug], slug).toBeTruthy()
      for (const body of ['male', 'female']) expect(avatarOf([slug], body).vb.split(' ').map(Number).every(Number.isFinite), slug).toBe(true)
    }
    expect(groupOfMuscle('trapezius').id).toBe('back')
  })
  it('an avatar lights only the muscles on the side it shows', () => {
    // glutes are pictured from behind, adductors and hip flexors from the front
    expect(avatarOf(['gluteal', 'adductors', 'hip-flexors'])).toMatchObject({ view: 'back', on: ['gluteal'] })
    const [, , w, h] = avatarOf(['chest']).vb.split(' ').map(Number)
    expect(w).toBe(h)
  })
})

describe('muscleStatus', () => {
  it('marks what is in the workout, what was trained this week, and when each was last', () => {
    const st = muscleStatus(state({
      workouts: [session('2026-10-05', [PULLDOWN]), session('2026-10-13', [BENCH])],
      active: { entries: [{ id: SQUAT, sets: [] }] },
    }), TODAY)
    expect(st.quadriceps.st).toBe('td')
    expect(st.chest).toEqual({ st: 'wk', last: '2026-10-13' })
    expect(st['upper-back']).toEqual({ st: '', last: '2026-10-05' })
    expect(st.calves).toEqual({ st: '', last: null })
  })
  it('follows the profile’s week start', () => {
    // Sunday the 11th is last week for a Monday start, this week for a Sunday one
    const S = state({ workouts: [session('2026-10-11', [BENCH])] })
    expect(muscleStatus(S, TODAY).chest.st).toBe('')
    expect(muscleStatus({ ...S, weekStart: 0 }, TODAY).chest.st).toBe('wk')
  })
})

describe('suggestedGroups', () => {
  it('suggests the groups with the most left to train, longest rested first', () => {
    const S = state({ workouts: [
      session('2026-10-13', [BENCH, SQUAT]),
      // back: only the upper back this week; hamstrings a month ago
      session('2026-10-14', [PULLDOWN]), session('2026-09-10', ['0586']),
    ] })
    const st = muscleStatus(S, TODAY)
    const top = suggestedGroups(st, TODAY, 20)
    expect(top).not.toContain('chest')
    expect(top).not.toContain('quads')
    // a group never trained outranks one with some of it done this week
    expect(top.indexOf('shoulders')).toBeLessThan(top.indexOf('back'))
    expect(suggestedGroups(st, TODAY)).toHaveLength(2)
  })
})

describe('groupExercises', () => {
  it('lists an area’s logged exercises first, then its staples', () => {
    const S = state({ workouts: [session('2026-10-01', [DBBENCH]), session('2026-10-13', [BENCH])] })
    const { sections } = groupExercises(S, 'chest', { status: muscleStatus(S, TODAY) })
    expect(sections).toHaveLength(1)
    const ids = sections[0].list.map(e => e.id)
    expect(ids.slice(0, 2)).toEqual([DBBENCH, BENCH])
    expect(ids.slice(2, 4)).toEqual(STAPLES.chest.filter(id => id !== BENCH && id !== DBBENCH).slice(0, 2))
    expect(sections[0].list.every(e => primaryMuscleOf(e)?.slug === 'chest')).toBe(true)
  })
  it('puts areas not trained this week before the ones that were', () => {
    const S = state({ workouts: [session('2026-10-13', [PULLDOWN])] })
    const { sections } = groupExercises(S, 'back', { status: muscleStatus(S, TODAY) })
    expect(sections.map(s => s.m)).toEqual(['lower-back', 'trapezius', 'upper-back'])
    const az = groupExercises(S, 'back', { sort: 'az', status: muscleStatus(S, TODAY) })
    expect(az.sections.map(s => s.m)).toEqual(['upper-back', 'lower-back', 'trapezius'])
  })
  it('leaves out and counts what is already in the workout', () => {
    const S = state({ active: { entries: [{ id: BENCH, sets: [] }] } })
    const { sections, hidden } = groupExercises(S, 'chest')
    expect(hidden).toBe(1)
    expect(sections[0].list.map(e => e.id)).not.toContain(BENCH)
  })
  it('Recent is what you logged in the group, newest first; an area narrows it', () => {
    const S = state({ workouts: [session('2026-10-01', [DBBENCH]), session('2026-10-13', [BENCH]), session('2026-10-14', [SQUAT])] })
    const { sections } = groupExercises(S, 'chest', { sort: 'recent' })
    expect(sections[0].list.map(e => e.id)).toEqual([BENCH, DBBENCH])
    expect(groupExercises(S, 'back', { sort: 'recent' }).sections).toEqual([])
    expect(groupExercises(S, 'back', { area: 'trapezius' }).sections.map(s => s.m)).toEqual(['trapezius'])
  })
  it('respects the active equipment profile', () => {
    const S = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    const ids = groupExercises(S, 'chest').sections[0].list.map(e => e.id)
    expect(ids).not.toContain(BENCH)
    expect(ids).toContain(DBBENCH)
  })
})

describe('lastTopSet', () => {
  it('is the heaviest work set of the last session', () => {
    const S = state({ workouts: [session('2026-10-13', [BENCH], [row({ w: 40, r: 10, warmup: true }), row({ w: 80, r: 5 }), row({ w: 75, r: 8 })])] })
    expect(lastTopSet(S, BENCH)).toEqual({ w: 80, r: 5, d: '2026-10-13' })
    expect(lastTopSet(S, SQUAT)).toBeNull()
    expect(EXIDX[BENCH]).toBeTruthy()
  })
})
