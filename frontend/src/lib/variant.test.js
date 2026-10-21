import { describe, expect, it } from 'vitest'
import { variantOf } from './variant.js'
import { EXIDX } from './exercises.js'

describe('variantOf', () => {
  it('reads the position from the name, the bench angle first', () => {
    expect(variantOf(EXIDX['0025']).position).toBe('plain')    // barbell bench press
    expect(variantOf(EXIDX['0047']).position).toBe('incline')  // barbell incline bench press
    expect(variantOf(EXIDX['0301']).position).toBe('decline')  // dumbbell decline bench press
    expect(variantOf({ n: 'dumbbell seated curl' }).position).toBe('seated')
    expect(variantOf({ n: 'band sitting row' }).position).toBe('seated')
    expect(variantOf({ n: 'barbell prone row' }).position).toBe('lying')
    expect(variantOf({ n: 'cable half kneeling pulldown' }).position).toBe('kneeling')
    expect(variantOf({ n: 'barbell bent over row' }).position).toBe('bent-over')
    expect(variantOf({ n: 'dumbbell incline lying row' }).position).toBe('incline')
    expect(variantOf({ n: 'barbell standing calf raise' }).position).toBe('standing')
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
    expect(variantOf({ n: 'Mine' })).toEqual({ tool: 'other', position: 'plain' })
    expect(variantOf(null)).toEqual({ tool: 'other', position: 'plain' })
  })
})
