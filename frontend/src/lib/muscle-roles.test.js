import { describe, it, expect } from 'vitest'
import { loadMuscleRoles, muscleRolesOf, ROLE_MUSCLE_NAME, roleRows, roleChips } from './muscle-roles.js'
import data from './exercise-roles.json'

describe('muscle roles', () => {
  it('names every muscle the catalogue uses', () => {
    const used = new Set(Object.values(data).flatMap(r => Object.values(r).flat()))
    expect([...used].filter(m => !ROLE_MUSCLE_NAME[m])).toEqual([])
  })

  it('loads lazily and looks up by id', async () => {
    const id = Object.keys(data)[0]
    await loadMuscleRoles()
    expect(muscleRolesOf(id)).toEqual(data[id])
    expect(muscleRolesOf('no-such-id')).toBe(null)
  })

  it('builds Works / Helps rows and folds the stabilizers together', () => {
    const rows = roleRows({ target: ['side-delt'], synergists: ['front-delt'], dynamicStabilizers: ['biceps'],
      stabilizers: ['upper-trap'], antagonistStabilizers: ['obliques'] })
    expect(rows.main.map(r => [r.label, r.muscles])).toEqual([['Works', ['side-delt']], ['Helps', ['front-delt']]])
    expect(rows.steady.muscles).toEqual(['biceps', 'upper-trap', 'obliques'])
  })

  it('leaves out empty rows, and has nothing without a target', () => {
    const rows = roleRows({ target: ['quads'] })
    expect(rows.main).toHaveLength(1)
    expect(rows.steady).toBe(null)
    expect(roleRows(null)).toBe(null)
    expect(roleRows({ synergists: ['quads'] })).toBe(null)
  })

  it('gives a card the targets and the first helpers', () => {
    const chips = roleChips({ target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'middle-trap', 'lower-trap'],
      stabilizers: ['upper-trap'] })
    expect(chips).toEqual({ targets: ['Side delt'], helpers: ['Front delt', 'Supraspinatus', 'Middle traps'] })
    expect(roleChips({ target: ['quads'] })).toEqual({ targets: ['Quads'], helpers: [] })
    expect(roleChips(null)).toBe(null)
  })
})
