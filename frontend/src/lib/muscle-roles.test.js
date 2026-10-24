import { describe, it, expect } from 'vitest'
import { loadMuscleRoles, muscleRolesOf, ROLE_MUSCLE_NAME, roleRows, roleChips, regionBreakdown, REGION_PARTS, partFocus, targetParts } from './muscle-roles.js'
import { doneSetItems, MUSCLES } from './muscles.js'
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

  it('every breakdown region is on the body map and names its parts', () => {
    for (const [region, parts] of Object.entries(REGION_PARTS)) {
      expect(MUSCLES).toContain(region)
      for (const [, muscles] of parts) for (const m of muscles) expect(ROLE_MUSCLE_NAME[m]).toBeTruthy()
    }
  })
})

describe('regionBreakdown', () => {
  const roles = {
    raise: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'infraspinatus'], stabilizers: ['upper-trap'] },
    press: { target: ['front-delt'], synergists: ['side-delt', 'triceps'] },
  }
  const rolesOf = id => roles[id] || null
  const ex = (id, primaries, secondaries = []) => ({ id, primaries, secondaries })
  const workout = (...entries) => ({ entries: entries.map(([e, done, extra = []]) => ({ id: e.id, exercise: e,
    sets: [...Array(done).fill({ done: true }), { done: false }, ...extra] })) })

  it('counts a target fully and a helper at 0.4, rotator cuff as one row', () => {
    const items = doneSetItems([workout([ex('raise', ['deltoids']), 3], [ex('press', ['deltoids'], ['triceps']), 2])])
    const b = regionBreakdown(items, 'deltoids', rolesOf)
    expect(b.rows).toEqual([
      { name: 'Front delt', sets: 3.2 },  // 2 as target + 3 × 0.4 as helper
      { name: 'Side delt', sets: 3.8 },   // 3 + 2 × 0.4
      { name: 'Rear delt', sets: 0 },
      { name: 'Rotator cuff', sets: 2.4 }, // two helpers, 3 sets each
    ])
    expect(b).toMatchObject({ covered: 5, total: 5 })
  })

  it('says how much of the region has detail', () => {
    const items = doneSetItems([workout([ex('raise', ['deltoids']), 3], [ex('bench', ['chest'], ['deltoids']), 4])])
    expect(regionBreakdown(items, 'deltoids', rolesOf)).toMatchObject({ covered: 3, total: 4.6 })
  })

  it('leaves stabilizers out, and gives nothing without parts or detail', () => {
    const items = doneSetItems([workout([ex('raise', ['deltoids']), 3])])
    expect(regionBreakdown(items, 'trapezius', rolesOf)).toBe(null)   // upper trap only steadies
    expect(regionBreakdown(items, 'quadriceps', rolesOf)).toBe(null)  // one part, no split
    expect(regionBreakdown(doneSetItems([workout([ex('bench', ['chest']), 4])]), 'chest', rolesOf)).toBe(null)
  })

  it('skips sets not ticked off', () => {
    expect(regionBreakdown(doneSetItems([workout([ex('raise', ['deltoids']), 0])]), 'deltoids', rolesOf)).toBe(null)
  })
})

describe('partFocus', () => {
  const roles = {
    raise: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'infraspinatus'] },
    press: { target: ['front-delt'], synergists: ['side-delt', 'triceps'] },
    rear: { target: ['rear-delt'], synergists: ['infraspinatus', 'teres-minor', 'side-delt'] },
    bench: { target: ['pec-major-sternal'], synergists: ['front-delt', 'triceps'] },
    ohp: { target: ['front-delt'], synergists: ['triceps'] },
  }
  const rolesOf = id => roles[id] || null
  const ex = (id, primaries, secondaries = []) => ({ id, primaries, secondaries })
  const items = (...entries) => doneSetItems([{ entries: entries.map(([e, done]) => ({ id: e.id, exercise: e,
    sets: Array(done).fill({ done: true }) })) }])
  const RAISE = ex('raise', ['deltoids']), PRESS = ex('press', ['deltoids']), REAR = ex('rear', ['deltoids'])
  const OHP = ex('ohp', ['deltoids'])

  it('names the part trained least', () => {
    expect(partFocus(items([RAISE, 3], [PRESS, 3]), 'deltoids', { rolesOf }))
      .toEqual({ name: 'Rear delt', sets: 0, muscles: ['rear-delt'], parts: [{ name: 'Rear delt', muscles: ['rear-delt'] }] })
    // however close: 2 sets against 3 is still the least
    expect(partFocus(items([RAISE, 3], [PRESS, 3], [REAR, 2]), 'deltoids', { rolesOf })).toMatchObject({ name: 'Rear delt', sets: 2 })
  })

  it('counts the sets that targeted a part, not the ones it only helped in', () => {
    // presses and rear flies help the side delts 8 sets' worth, and never target them
    expect(partFocus(items([PRESS, 4], [REAR, 4]), 'deltoids', { rolesOf })).toMatchObject({ name: 'Side delt', sets: 0 })
  })

  it('breaks a tie by the sets a part helped in', () => {
    // three each targeted: the rear delts helped in nothing, the side delts in the press and the fly
    expect(partFocus(items([RAISE, 3], [PRESS, 3], [REAR, 3]), 'deltoids', { rolesOf })).toMatchObject({ name: 'Rear delt', sets: 3 })
  })

  it('names every part still tied, and nothing when all are level', () => {
    expect(partFocus(items([OHP, 4]), 'deltoids', { rolesOf })).toMatchObject({ name: 'Side delt',
      muscles: ['side-delt', 'rear-delt'], parts: [{ name: 'Side delt', muscles: ['side-delt'] }, { name: 'Rear delt', muscles: ['rear-delt'] }] })
    const only = { a: { target: ['front-delt'] }, b: { target: ['side-delt'] }, c: { target: ['rear-delt'] } }
    const level = items([ex('a', ['deltoids']), 2], [ex('b', ['deltoids']), 2], [ex('c', ['deltoids']), 2])
    expect(partFocus(level, 'deltoids', { rolesOf: id => only[id] || null })).toBe(null)
  })

  it('never names a part that only helps', () => {
    // Pec minor and the rotator cuff have nothing here either; upper chest is the one
    expect(partFocus(items([ex('bench', ['chest']), 6]), 'chest', { rolesOf })).toMatchObject({ name: 'Upper chest', sets: 0 })
    expect(partFocus(items([RAISE, 3], [PRESS, 3], [REAR, 2]), 'deltoids', { rolesOf })?.name).not.toBe('Rotator cuff')
  })

  it('needs a region really trained, and mostly by exercises with roles', () => {
    expect(partFocus(items([RAISE, 1], [PRESS, 1]), 'deltoids', { rolesOf })).toBe(null)
    expect(partFocus(items([RAISE, 3], [PRESS, 3], [ex('machine', ['deltoids']), 8]), 'deltoids', { rolesOf })).toBe(null)
    expect(partFocus(items([RAISE, 1], [PRESS, 1]), 'deltoids', { rolesOf, min: 2 })).toMatchObject({ name: 'Rear delt' })
    expect(partFocus([], 'deltoids', { rolesOf })).toBe(null)
    expect(partFocus(items([RAISE, 6]), 'quadriceps', { rolesOf })).toBe(null)
  })

  it('targetParts: the parts an exercise targets', () => {
    expect(targetParts('raise', 'deltoids', rolesOf)).toEqual([{ name: 'Side delt', muscles: ['side-delt'] }])
    expect(targetParts('bench', 'deltoids', rolesOf)).toEqual([])
    expect(targetParts('none', 'deltoids', rolesOf)).toEqual([])
  })
})

describe('partFocus on the traps', () => {
  it('stays quiet: rows credit the middle traps, deadlifts hold the upper ones unseen', () => {
    const rolesOf = id => id === 'row' ? { target: ['middle-trap', 'rhomboids', 'lats'] } : null
    const row = { id: 'row', primaries: ['trapezius'], secondaries: [] }
    const items = doneSetItems([{ entries: [{ id: 'row', exercise: row, sets: Array(8).fill({ done: true }) }] }])
    expect(regionBreakdown(items, 'trapezius', rolesOf).rows[0]).toEqual({ name: 'Upper traps', sets: 0 })
    expect(partFocus(items, 'trapezius', { rolesOf })).toBe(null)
  })
})
