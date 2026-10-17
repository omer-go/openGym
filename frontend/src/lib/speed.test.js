// Cardio speed is mph, the only unit: stored, shown and typed in mph, with no conversion.
import { afterEach, describe, it, expect } from 'vitest'
import { speedUnitOf, speedLabel, toSpeed, fromSpeed, fmtSpeed } from './speed.js'
import { setLabel, exLine } from './history.js'
import { planPrintHTML } from './plan-share.js'
import { setWeightDecimals } from './format.js'

const BIKE = '2138'   // stationary bike, cardio

afterEach(() => setWeightDecimals(1))

describe('mph only', () => {
  it('is mph whatever the profile says', () => {
    expect(speedUnitOf({ unit: 'kg', speedUnit: 'kmh' })).toBe('mph')
    expect(speedUnitOf(null)).toBe('mph')
    expect(speedLabel()).toBe('mph')
  })
  it('converts nothing', () => {
    for (const v of [0, 5, 6.5, 9.66, 16.09]) {
      expect(toSpeed(v)).toBe(v)
      expect(fromSpeed(v)).toBe(v)
    }
  })
  it('formats a stored speed as it is', () => {
    expect(fmtSpeed(8)).toBe('8 mph')
    setWeightDecimals(2)
    expect(fmtSpeed(4.97)).toBe('4.97 mph')
  })
})

describe('speed in labels', () => {
  it('reads a logged cardio set and a planned cardio slot in mph', () => {
    const set = { min: 30, speed: 6, done: true }
    expect(setLabel(BIKE, set, { id: BIKE, sets: 1, min: 30, speed: 6 })).toBe('30 min @ 6 mph')
    // A set saved by an older build, with no target: read from its own fields.
    expect(setLabel(BIKE, set, null)).toBe('30 min @ 6 mph')
    expect(exLine({ id: BIKE, sets: 2, min: 20, speed: 10 }, 'lb')).toBe('2 × 20 min @ 10 mph')
  })
  it('prints a plan in mph', () => {
    const routines = [{ id: 'c', name: 'Cardio', ex: [{ id: BIKE, sets: 1, min: 25, speed: 10 }] }]
    expect(planPrintHTML({ unit: 'lb', week: {}, routines }, '')).toContain('25 min @ 10 mph')
  })
})
