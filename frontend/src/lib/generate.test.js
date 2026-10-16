import { describe, expect, it } from 'vitest'
import { GEN_TYPES, STAPLES, trainingIndex, candidatesFor, generateWorkout, generatedEntries } from './generate.js'
import { EXIDX } from './exercises.js'
import { isWarmupRow } from './workout-model.js'

const row = (patch = {}) => ({ w: 60, r: 8, done: true, ...patch })
const session = (d, ids, sets = [row()]) => ({ id: 'w' + d + ids.join(), d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 8 }, sets })) })
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })

// bench press (chest), lat pulldown (upper back), standing overhead press (shoulders), squat
// (quads), barbell curl (biceps), pushdown (triceps), lying leg curl (hamstrings)
const BENCH = '0025', PULLDOWN = '2330', OHP = '0426', SQUAT = '0043', CURL = '0031', PUSHDOWN = '0241', LEGCURL = '0586'

describe('staples', () => {
  it('every staple is a catalogue exercise', () => {
    for (const [slug, ids] of Object.entries(STAPLES)) {
      for (const id of ids) expect(EXIDX[id], `${slug} ${id}`).toBeTruthy()
    }
  })
  it('every muscle a day type names has staples', () => {
    const slugs = new Set(Object.values(GEN_TYPES).flat().flatMap(([spec]) => spec.split('|')))
    for (const slug of slugs) expect(STAPLES[slug]?.length, slug).toBeGreaterThan(1)
  })
})

describe('trainingIndex', () => {
  it('keeps the latest day each muscle and exercise was trained', () => {
    const { muscles, exercises } = trainingIndex(state({ workouts: [session('2026-09-01', [BENCH]), session('2026-09-10', [BENCH, SQUAT])] }))
    expect(muscles.chest).toBe('2026-09-10')
    expect(muscles.quadriceps).toBe('2026-09-10')
    expect(exercises[BENCH]).toEqual({ d: '2026-09-10', n: 2 })
  })
  it('ignores warm-ups, unticked sets, and muscles only working in support', () => {
    const { muscles } = trainingIndex(state({ workouts: [
      session('2026-09-01', [SQUAT], [row({ done: false })]),
      session('2026-09-02', [CURL], [row({ warmup: true })]),
      session('2026-09-03', [BENCH]),
    ] }))
    expect(muscles.quadriceps).toBeUndefined()
    expect(muscles.biceps).toBeUndefined()
    // bench works the front delts as a helper; that does not count as a shoulder session
    expect(muscles.deltoids).toBeUndefined()
  })
})

describe('candidatesFor', () => {
  it('offers exercises you have logged first, longest ago first, then the staples', () => {
    const st = state({ workouts: [session('2026-09-01', ['0289']), session('2026-09-10', [BENCH])] })
    const list = candidatesFor(st, 'chest')
    expect(list.slice(0, 2)).toEqual(['0289', BENCH])
    expect(list.slice(2)).toEqual(STAPLES.chest.filter(id => id !== BENCH && id !== '0289'))
  })
  it('leaves out what the active equipment profile cannot do', () => {
    const st = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    const list = candidatesFor(st, 'chest')
    expect(list).not.toContain(BENCH)
    expect(list).toContain('0289')
  })
})

describe('generateWorkout', () => {
  it('builds every day type with the slot counts it promises', () => {
    for (const [type, slots] of Object.entries(GEN_TYPES)) {
      const picks = generateWorkout(state(), type)
      expect(picks, type).toHaveLength(slots.reduce((n, [, c]) => n + c, 0))
      expect(new Set(picks.map(p => p.id)).size, type).toBe(picks.length)
    }
  })
  it('puts the muscle trained longest ago first, never trained before all', () => {
    const st = state({ workouts: [session('2026-09-01', [OHP]), session('2026-09-08', [PUSHDOWN]), session('2026-09-12', [BENCH])] })
    const picks = generateWorkout(st, 'push')
    expect(picks.map(p => p.muscle)).toEqual(['deltoids', 'deltoids', 'triceps', 'triceps', 'chest', 'chest'])
    expect(picks[0].last).toBe('2026-09-01')
    // and with one muscle never trained, that one leads
    const fresh = generateWorkout(state({ workouts: [session('2026-09-01', [OHP]), session('2026-09-12', [BENCH])] }), 'push')
    expect(fresh[0]).toMatchObject({ muscle: 'triceps', last: null })
  })
  it('a slot with a choice goes to the staler muscle', () => {
    const st = state({ workouts: [session('2026-09-01', [LEGCURL]), session('2026-09-10', ['1060'])] })
    const picks = generateWorkout(st, 'full')
    expect(picks.map(p => p.muscle)).toContain('hamstring')
    expect(picks.map(p => p.muscle)).not.toContain('gluteal')
  })
  it('opens a muscle on an exercise you know before a staple', () => {
    const st = state({ workouts: [session('2026-09-01', ['0293'])] })
    expect(generateWorkout(st, 'pull').find(p => p.muscle === 'upper-back').id).toBe('0293')
  })
  it('a shift picks different exercises', () => {
    const a = generateWorkout(state(), 'legs').map(p => p.id)
    const b = generateWorkout(state(), 'legs', { shift: 1 }).map(p => p.id)
    expect(b).not.toEqual(a)
    expect(new Set(b).size).toBe(b.length)
  })
  it('an unknown type builds nothing', () => {
    expect(generateWorkout(state(), 'arms')).toEqual([])
  })
})

describe('generatedEntries', () => {
  it('starts from last time, every row unchecked, with the reason attached', () => {
    const st = state({ workouts: [session('2026-09-01', [PULLDOWN], [row({ w: 55, r: 10 }), row({ w: 55, r: 9 })])] })
    const [entry] = generatedEntries(st, [{ id: PULLDOWN, muscle: 'upper-back', last: '2026-09-01' }])
    const work = entry.sets.filter(s => !isWarmupRow(s))
    expect(work.map(s => [s.w, s.r])).toEqual([[55, 10], [55, 9]])
    expect(work.every(s => !s.done)).toBe(true)
    expect(entry.gen).toEqual({ m: 'upper-back', d: '2026-09-01' })
    expect(entry.plan).toBeNull()
  })
  it('a never-logged exercise opens at the default three sets', () => {
    const [entry] = generatedEntries(state(), [{ id: SQUAT, muscle: 'quadriceps', last: null }])
    expect(entry.sets.filter(s => !isWarmupRow(s))).toHaveLength(3)
  })
})
