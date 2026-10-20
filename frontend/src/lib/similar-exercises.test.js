import { describe, expect, it } from 'vitest'
import { roleLikeness, sameMuscleFirst } from './similar-exercises.js'

// A lateral raise and what a delt swap could land on, with made-up roles.
const ROLES = {
  raise: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'middle-trap'] },
  cable: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'middle-trap'] },
  row: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'biceps', 'brachialis'] },
  y: { target: ['side-delt', 'lower-trap'], synergists: ['supraspinatus'] },
  press: { target: ['front-delt'], synergists: ['side-delt', 'triceps'] },
  fly: { target: ['rear-delt'], synergists: ['side-delt', 'rhomboids'] },
}
const rolesOf = id => ROLES[id] || null
const ex = (id, eq) => ({ id, tg: 'delts', eq })

describe('roleLikeness', () => {
  it('2 on the same target muscles, 1 on a shared one, 0 on none', () => {
    expect(roleLikeness(ex('raise'), ex('cable'), rolesOf)).toEqual({ target: 2, helpers: 1 })
    expect(roleLikeness(ex('raise'), ex('y'), rolesOf).target).toBe(1)
    expect(roleLikeness(ex('raise'), ex('press'), rolesOf).target).toBe(0)
  })
  it('helpers is the share of helper muscles in common', () => {
    expect(roleLikeness(ex('raise'), ex('row'), rolesOf).helpers).toBeCloseTo(2 / 5)
  })
  it('0 when either has no roles', () => {
    expect(roleLikeness(ex('raise'), ex('nope'), rolesOf)).toEqual({ target: 0, helpers: 0 })
    expect(roleLikeness(ex('nope'), ex('raise'), rolesOf)).toEqual({ target: 0, helpers: 0 })
    expect(roleLikeness(null, ex('raise'), rolesOf)).toEqual({ target: 0, helpers: 0 })
  })
})

describe('sameMuscleFirst with muscle roles', () => {
  const list = [ex('press', 'dumbbell'), ex('fly', 'dumbbell'), ex('nope', 'dumbbell'), ex('y', 'cable'),
    ex('row', 'dumbbell'), ex('cable', 'cable'), ex('raise', 'dumbbell')]
  it('same target muscles first, then a shared one, then the rest; same kit, then same helpers within each', () => {
    expect(sameMuscleFirst(list, ex('raise', 'dumbbell'), rolesOf).map(e => e.id))
      .toEqual(['row', 'cable', 'y', 'press', 'fly', 'nope'])
  })
  it('without roles, same equipment first and the list order otherwise', () => {
    expect(sameMuscleFirst(list, ex('raise', 'cable'), () => null).map(e => e.id))
      .toEqual(['y', 'cable', 'press', 'fly', 'nope', 'row'])
  })
})
