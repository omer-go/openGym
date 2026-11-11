import { describe, expect, it } from 'vitest'
import { profileOf, rotationOf } from './profile.js'

describe('the training profile', () => {
  it('has the goal’s defaults with nothing set', () => {
    expect(profileOf({})).toMatchObject({ goal: 'growth', volume: 0, minutes: 0, rests: { min: 20, max: 60 }, rotation: 'session', focus: { glutes: 'none', forearms: 'none', abs: 'more' } })
    expect(profileOf({ restRange: false, goals: { focus: { glutes: 'normal', forearms: 'normal', abs: 'normal' } } })).toMatchObject({ rests: null, focus: {} })
    expect(profileOf(null).rotation).toBe('session')
  })
  it('reads every setting from where it is kept', () => {
    const S = {
      goals: { type: 'strength', volume: 1, focus: { glutes: 'more', abs: 'normal', chest: 'normal' } },
      restRange: { min: 30, max: 90 }, rotation: 'block',
      program: { days: ['full'], startedAt: '2026-09-01', plan: { minutes: 45, level: 'beginner', equipment: 'home' } },
    }
    expect(profileOf(S)).toEqual({
      goal: 'strength', volume: 1, days: 2, minutes: 45, level: 'beginner', equipment: 'home',
      rests: { min: 30, max: 90 }, rotation: 'block', focus: { glutes: 'more', forearms: 'none' },
    })
  })
  it('lifts take turns every session unless set to keep to the ones you know', () => {
    expect(rotationOf({ rotation: 'block' })).toBe('block')
    expect(rotationOf({ rotation: 'weekly' })).toBe('session')
  })
})
