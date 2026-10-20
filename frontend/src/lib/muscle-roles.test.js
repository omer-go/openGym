import { describe, it, expect } from 'vitest'
import { loadMuscleRoles, muscleRolesOf, ROLE_MUSCLE_NAME, roleRows, roleChips, regionBreakdown, REGION_PARTS, partGap } from './muscle-roles.js'
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

describe('partGap', () => {
  const roles = {
    raise: { target: ['side-delt'], synergists: ['front-delt', 'supraspinatus', 'infraspinatus'] },
    press: { target: ['front-delt'], synergists: ['side-delt', 'triceps'] },
    rear: { target: ['rear-delt'], synergists: ['infraspinatus', 'teres-minor', 'side-delt'] },
    bench: { target: ['pec-major-sternal'], synergists: ['front-delt', 'triceps'] },
  }
  const rolesOf = id => roles[id] || null
  const ex = (id, primaries, secondaries = []) => ({ id, primaries, secondaries })
  const items = (...entries) => doneSetItems([{ entries: entries.map(([e, done]) => ({ id: e.id, exercise: e,
    sets: Array(done).fill({ done: true }) })) }])
  const RAISE = ex('raise', ['deltoids']), PRESS = ex('press', ['deltoids']), REAR = ex('rear', ['deltoids'])

  it('names the part a lopsided region left out', () => {
    expect(partGap(items([RAISE, 3], [PRESS, 3]), 'deltoids', { rolesOf }))
      .toEqual({ name: 'Rear delt', sets: 0, muscles: ['rear-delt'] })
  })

  it('stays quiet once the weakest part has more than a quarter of the strongest', () => {
    expect(partGap(items([RAISE, 3], [PRESS, 3], [REAR, 2]), 'deltoids', { rolesOf })).toBe(null)
    // 1 set against 5.4 is still a gap, and says how many
    expect(partGap(items([RAISE, 4], [PRESS, 3], [REAR, 1]), 'deltoids', { rolesOf })).toMatchObject({ name: 'Rear delt', sets: 1 })
  })

  it('never names a part that only helps', () => {
    // Pec minor and the rotator cuff have nothing here either; upper chest is the gap
    expect(partGap(items([ex('bench', ['chest']), 6]), 'chest', { rolesOf })).toMatchObject({ name: 'Upper chest', sets: 0 })
    expect(partGap(items([RAISE, 3], [PRESS, 3], [REAR, 2]), 'deltoids', { rolesOf })?.name).not.toBe('Rotator cuff')
  })

  it('needs a region really trained, and mostly by exercises with roles', () => {
    expect(partGap(items([RAISE, 1], [PRESS, 1]), 'deltoids', { rolesOf })).toBe(null)
    expect(partGap(items([RAISE, 3], [PRESS, 3], [ex('machine', ['deltoids']), 8]), 'deltoids', { rolesOf })).toBe(null)
    expect(partGap(items([RAISE, 1], [PRESS, 1]), 'deltoids', { rolesOf, min: 2 })).toMatchObject({ name: 'Rear delt' })
    expect(partGap([], 'deltoids', { rolesOf })).toBe(null)
    expect(partGap(items([RAISE, 6]), 'quadriceps', { rolesOf })).toBe(null)
  })
})

describe('partGap on the traps', () => {
  it('stays quiet: rows credit the middle traps, deadlifts hold the upper ones unseen', () => {
    const rolesOf = id => id === 'row' ? { target: ['middle-trap', 'rhomboids', 'lats'] } : null
    const row = { id: 'row', primaries: ['trapezius'], secondaries: [] }
    const items = doneSetItems([{ entries: [{ id: 'row', exercise: row, sets: Array(8).fill({ done: true }) }] }])
    expect(regionBreakdown(items, 'trapezius', rolesOf).rows[0]).toEqual({ name: 'Upper traps', sets: 0 })
    expect(partGap(items, 'trapezius', { rolesOf })).toBe(null)
  })
})
