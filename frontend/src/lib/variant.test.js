import { describe, expect, it } from 'vitest'
import { variantOf } from './variant.js'
import { EXIDX } from './exercises.js'

describe('variantOf', () => {
  it('reads the bench angle from the name', () => {
    expect(variantOf(EXIDX['0025']).angle).toBe('flat')     // barbell bench press
    expect(variantOf(EXIDX['0047']).angle).toBe('incline')  // barbell incline bench press
    expect(variantOf(EXIDX['0301']).angle).toBe('decline')  // dumbbell decline bench press
  })
  it('folds the equipment into tool families', () => {
    expect(variantOf(EXIDX['0025']).tool).toBe('barbell')
    expect(variantOf(EXIDX['0289']).tool).toBe('dumbbell')  // dumbbell bench press
    expect(variantOf(EXIDX['0748']).tool).toBe('smith')     // smith bench press
    expect(variantOf(EXIDX['0178']).tool).toBe('cable')     // cable lateral raise
    expect(variantOf(EXIDX['0652']).tool).toBe('bodyweight') // pull-up
    expect(variantOf({ n: 'curl', eq: 'ez barbell' }).tool).toBe('barbell')
    expect(variantOf({ n: 'leg press', eq: 'sled machine' }).tool).toBe('machine')
  })
  it('names what it cannot place', () => {
    expect(variantOf({ n: 'Mine' })).toEqual({ angle: 'flat', tool: 'other' })
    expect(variantOf(null)).toEqual({ angle: 'flat', tool: 'other' })
  })
})
