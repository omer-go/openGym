import { describe, expect, it } from 'vitest'
import { normalizeRepRange, pickTopReps, repsForSides } from './rep-range.js'

describe('pickTopReps', () => {
  it('keeps the floor when the picked top is above it', () => {
    expect(pickTopReps(12, { reps: 10, repsMin: 8 })).toEqual({ reps: 12, repsMin: 8 })
  })
  it('takes the floor down with a top picked under it, the range as wide as it was', () => {
    // A per-side 16–22 switched off: picking 11 gave 17 before.
    expect(pickTopReps(11, { reps: 22, repsMin: 16 })).toEqual({ reps: 11, repsMin: 5 })
    expect(pickTopReps(8, { reps: 12, repsMin: 10 })).toEqual({ reps: 8, repsMin: 6 })
  })
  it('a top picked at the floor moves it too', () => {
    expect(pickTopReps(10, { reps: 12, repsMin: 10 })).toEqual({ reps: 10, repsMin: 8 })
  })
  it('keeps an even stride for a per-side range', () => {
    expect(pickTopReps(12, { reps: 24, repsMin: 18 }, 2)).toEqual({ reps: 12, repsMin: 6 })
  })
  it('without a floor, the default one', () => {
    expect(pickTopReps(12, {})).toEqual({ reps: 12, repsMin: 10 })
  })
})

describe('repsForSides', () => {
  it('halves a per-side total turned off: 11 a side is a set of 11', () => {
    expect(repsForSides({ reps: 22, repsMin: 16 }, false)).toEqual({ reps: 11, repsMin: 8 })
  })
  it('doubles reps turned per side, the same work on each side', () => {
    expect(repsForSides({ reps: 11, repsMin: 8 }, true)).toEqual({ reps: 22, repsMin: 16 })
  })
  it('leaves out what the config does not have', () => {
    expect(repsForSides({ reps: 10 }, true)).toEqual({ reps: 20 })
    expect(repsForSides({}, false)).toEqual({})
  })
})

describe('normalizeRepRange', () => {
  it('keeps valid positive integer bounds unchanged', () => {
    expect(normalizeRepRange(12, 8)).toEqual({ reps: 12, repsMin: 8 })
  })

  it('rounds bounds to positive integers', () => {
    expect(normalizeRepRange(12.4, 7.6)).toEqual({ reps: 12, repsMin: 8 })
    expect(normalizeRepRange(0, -2)).toEqual({ reps: 10, repsMin: 8 })
  })

  it('raises the upper bound when the lower bound reaches it', () => {
    expect(normalizeRepRange(8, 8)).toEqual({ reps: 9, repsMin: 8 })
  })

  it('raises the upper bound when the lower bound exceeds it', () => {
    expect(normalizeRepRange(8, 12)).toEqual({ reps: 13, repsMin: 12 })
  })

  it('keeps the lower bound at least one below a lowered upper bound', () => {
    expect(normalizeRepRange(6, 8)).toEqual({ reps: 9, repsMin: 8 })
  })

  it('supplies a usable default lower bound for a small upper bound', () => {
    expect(normalizeRepRange(1, undefined)).toEqual({ reps: 2, repsMin: 1 })
  })

  it('aligns both bounds to an even stride', () => {
    expect(normalizeRepRange(13, 7, 2)).toEqual({ reps: 14, repsMin: 8 })
  })

  it('keeps a valid gap when per-side bounds are invalid', () => {
    expect(normalizeRepRange(8, 9, 2)).toEqual({ reps: 12, repsMin: 10 })
    expect(normalizeRepRange(0, -2, 2)).toEqual({ reps: 10, repsMin: 8 })
  })
})
