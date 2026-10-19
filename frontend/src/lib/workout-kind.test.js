import { describe, it, expect } from 'vitest'
import { workoutKind, workoutsOn, KIND_COLOR } from './workout-kind.js'
import { buildCompletedWorkout } from './finish-workout.js'

describe('workoutKind', () => {
  it('reads a one-tap session by its day type, ahead of any routine', () => {
    expect(workoutKind({ genType: 'push', routineIds: [] })).toBe('push')
    expect(workoutKind({ genType: 'legs', routineIds: ['r1'] })).toBe('legs')
  })
  it('reads a routine session as a routine, the legacy routineId included', () => {
    expect(workoutKind({ routineIds: ['r1'] })).toBe('routine')
    expect(workoutKind({ routineId: 'r1' })).toBe('routine')
  })
  it('reads anything else as freestyle', () => {
    expect(workoutKind({ routineIds: [] })).toBe('free')
    expect(workoutKind({ genType: 'nonsense' })).toBe('free')
    expect(workoutKind(null)).toBe('free')
  })
  it('has a colour for every kind', () => {
    for (const k of ['full', 'pull', 'push', 'legs', 'routine', 'free']) expect(KIND_COLOR[k]).toBeTruthy()
  })
})

describe('workoutsOn', () => {
  it('lists one day’s sessions in the order they started', () => {
    const ws = [
      { d: '2026-10-12', start: 20, routineIds: ['r'] },
      { d: '2026-10-13', start: 5, genType: 'full' },
      { d: '2026-10-12', start: 10, genType: 'pull' },
    ]
    expect(workoutsOn(ws, '2026-10-12').map(x => x.kind)).toEqual(['pull', 'routine'])
    expect(workoutsOn(ws, '2026-10-14')).toEqual([])
  })
})

describe('a finished one-tap session', () => {
  const set = { w: 100, r: 8, done: true }
  const active = { id: 'a', d: '2026-10-18', start: 1, routineIds: [], name: 'Push day', entries: [{ id: '0025', sets: [set] }] }
  it('keeps its day type', () => {
    expect(buildCompletedWorkout({ ...active, gen: { type: 'push' } }, { end: 2 }).genType).toBe('push')
  })
  it('a freestyle one has none', () => {
    expect('genType' in buildCompletedWorkout(active, { end: 2 })).toBe(false)
  })
})
