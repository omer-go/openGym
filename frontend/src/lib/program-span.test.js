import { describe, it, expect } from 'vitest'
import { programOn, programSpan } from './program-span.js'
import { effectiveRoutineIds } from './history.js'

const program = { template: 'ppl-3', days: ['push', 'pull', 'legs'], startedAt: '2026-09-09', weeks: 2 }
const routines = [{ id: 'r1', name: 'Push', ex: [] }, { id: 'r2', name: 'Pull', ex: [] }, { id: 'r3', name: 'Legs', ex: [] }]
const base = { routines, week: { 1: ['r1'] }, dayPlan: {}, workouts: [] }

describe('programSpan', () => {
  it('runs from the start day to the end of the last calendar week', () => {
    expect(programSpan({ program })).toEqual({ from: '2026-09-09', to: '2026-09-20' })
    expect(programSpan({ program, weekStart: 0 })).toEqual({ from: '2026-09-09', to: '2026-09-19' })
  })
  it('is null without a program', () => {
    expect(programSpan({})).toBe(null)
    expect(programOn({}, '2026-09-10')).toBe(false)
  })
})

describe('effectiveRoutineIds while a program runs', () => {
  it('pauses the weekdays from its start, past its last week too, until it is ended', () => {
    const S = { ...base, program }
    expect(effectiveRoutineIds(S, '2026-09-07', '2026-09-07')).toEqual(['r1']) // before it
    expect(effectiveRoutineIds(S, '2026-09-14', '2026-09-14')).toEqual([])
    expect(effectiveRoutineIds(S, '2026-09-21', '2026-09-21')).toEqual([]) // weeks done, still chosen
    expect(effectiveRoutineIds({ ...S, program: null }, '2026-09-21', '2026-09-21')).toEqual(['r1'])
  })
  it('pauses a loop too', () => {
    const S = { ...base, program, queue: { ids: ['r3'], since: 1, startsOn: '2026-09-07' } }
    expect(effectiveRoutineIds(S, '2026-09-10', '2026-09-10')).toEqual([])
  })
  it('keeps a routine picked for one date', () => {
    const S = { ...base, program, dayPlan: { '2026-09-15': 'r2', '2026-09-16': 'rest' } }
    expect(effectiveRoutineIds(S, '2026-09-15', '2026-09-15')).toEqual(['r2'])
    expect(effectiveRoutineIds(S, '2026-09-16', '2026-09-16')).toEqual([])
  })
})
