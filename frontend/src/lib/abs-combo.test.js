import { describe, expect, it } from 'vitest'
import {
  ABS_STYLES, ABS_STAPLES, ABS_SPOTS, ABS_ITEMS, ABS_COMBO_MAX, absStyleOf, absGearOf, absPositionOf,
  absCandidates, absSpotsOpen, absStylesFor, absOrder, randomAbsCombo, swapAbsExercise, resizeAbsCombo,
} from './abs-combo.js'
import { EXIDX } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'

const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const session = (d, ids) => ({ id: 'w' + d, d, name: 'x', entries: ids.map(id => ({ id, target: { reps: 15 }, sets: [{ w: 0, r: 15, done: true }] })) })
// A repeatable stand-in for Math.random.
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const gear = id => absGearOf(EXIDX[id])
const POS = ['hang', 'stand', 'kneel', 'bench', 'seat', 'back', 'side', 'front']
const pos = id => POS.indexOf(absPositionOf(EXIDX[id]))

describe('abs staples', () => {
  it('are catalogue abs exercises of a style, done with the gear they are listed under', () => {
    for (const [g, ids] of Object.entries(ABS_STAPLES)) {
      for (const id of ids) {
        const ex = EXIDX[id]
        expect(ex, id).toBeTruthy()
        expect(primaryMuscleOf(ex)?.slug, ex.n).toBe('abs')
        expect(absStyleOf(ex), ex.n).toBeTruthy()
        expect(absGearOf(ex), ex.n).toBe(g)
      }
    }
  })
  it('give the floor a few of every style, enough for the longest floor combo', () => {
    for (const style of ABS_STYLES) expect(ABS_STAPLES.floor.filter(id => absStyleOf(EXIDX[id]) === style).length, style).toBeGreaterThanOrEqual(3)
  })
})

describe('absStyleOf', () => {
  it('reads the style from the name', () => {
    expect(absStyleOf({ n: 'cable kneeling crunch' })).toBe('crunch')
    expect(absStyleOf({ n: 'reverse crunch' })).toBe('lower')
    expect(absStyleOf({ n: 'bicycle crunch' })).toBe('twist')
    expect(absStyleOf({ n: 'side plank' })).toBe('twist')
    expect(absStyleOf({ n: 'front plank' })).toBe('brace')
    expect(absStyleOf({ n: 'my core thing', cat: 'isometric' })).toBe('brace')
    expect(absStyleOf({ n: 'inchworm' })).toBe(null)
  })
})

describe('absGearOf', () => {
  it('tells the floor, what you carry and where you stay apart', () => {
    expect(absGearOf({ n: 'crunch floor', eq: 'body weight' })).toBe('floor')
    expect(absGearOf({ n: 'hanging leg raise', eq: 'body weight' })).toBe('bar')
    expect(absGearOf({ n: 'weighted hanging leg-hip raise', eq: 'weighted' })).toBe('bar')
    expect(absGearOf({ n: 'captains chair leg raise', eq: 'body weight' })).toBe('chair')
    expect(absGearOf({ n: 'decline crunch', eq: 'body weight' })).toBe('bench')
    expect(absGearOf({ n: 'lever decline sit up', eq: 'leverage machine' })).toBe('machine')
    expect(absGearOf({ n: 'cable hanging leg raise', eq: 'cable' })).toBe('cable')
    expect(absGearOf({ n: 'dumbbell side bend', eq: 'dumbbell' })).toBe('dumbbell')
    expect(absGearOf({ n: 'weighted crunch', eq: 'weighted' })).toBe('plate')
    expect(ABS_ITEMS).toContain('plate')
    expect(ABS_ITEMS).not.toContain('cable')
  })
})

describe('absPositionOf', () => {
  it('places the body', () => {
    expect(absPositionOf({ n: 'hanging knee raise' })).toBe('hang')
    expect(absPositionOf({ n: 'cable reverse woodchop', eq: 'cable' })).toBe('stand')
    expect(absPositionOf({ n: 'cable kneeling crunch', eq: 'cable' })).toBe('kneel')
    expect(absPositionOf({ n: 'standing wheel rollerout' })).toBe('stand')
    expect(absPositionOf({ n: 'wheel rollerout' })).toBe('kneel')
    expect(absPositionOf({ n: 'russian twist' })).toBe('seat')
    expect(absPositionOf({ n: 'dead bug' })).toBe('back')
    // Both start on your back, though they end sitting up.
    expect(absPositionOf({ n: 'v up' })).toBe('back')
    expect(absPositionOf({ n: 'tuck crunch' })).toBe('back')
    expect(absPositionOf({ n: 'side plank' })).toBe('side')
    expect(absPositionOf({ n: 'front plank' })).toBe('front')
  })
  it('orders a combo off the bar first and down to the plank last', () => {
    expect(absOrder(['0463', '0274', '0472', '0687'])).toEqual(['0472', '0687', '0274', '0463'])
    // The machine before the floor, though you sit at both.
    expect(absOrder(['0687', '1453', '0463'])).toEqual(['1453', '0687', '0463'])
  })
})

describe('absStylesFor', () => {
  it('takes every style once before any twice, in ABS_STYLES order', () => {
    expect(absStylesFor(4, seeded())).toEqual(ABS_STYLES)
    const six = absStylesFor(6, seeded(7))
    expect(six.slice(0, 4)).toEqual(ABS_STYLES)
    expect(new Set(six.slice(4)).size).toBe(2)
  })
})

describe('randomAbsCombo', () => {
  it('stays in one spot: the floor and at most one other gear, a machine just once', () => {
    for (const spot of ABS_SPOTS) {
      for (let seed = 1; seed < 30; seed++) {
        for (const count of [2, 4, 6, 8]) {
          const { ids, gear: g } = randomAbsCombo(state(), { spot, count, random: seeded(seed * 31 + count) })
          expect(ids, spot).toHaveLength(count)
          expect(new Set(ids).size).toBe(count)
          const gears = new Set(ids.map(gear))
          gears.delete('floor')
          expect([...gears], spot + ' ' + ids).toEqual(g === 'floor' ? [] : [g])
          expect(ids.filter(id => gear(id) === 'machine').length).toBeLessThanOrEqual(1)
        }
      }
    }
  })
  it('keeps to the spot asked for', () => {
    for (let seed = 1; seed < 20; seed++) {
      expect(randomAbsCombo(state(), { spot: 'floor', random: seeded(seed) }).ids.every(id => gear(id) === 'floor')).toBe(true)
      const cable = randomAbsCombo(state(), { spot: 'cable', random: seeded(seed) })
      expect(cable.gear).toBe('cable')
      expect(cable.ids.some(id => gear(id) === 'cable')).toBe(true)
      expect(ABS_ITEMS).toContain(randomAbsCombo(state(), { spot: 'item', random: seeded(seed) }).gear)
      expect(['bar', 'chair']).toContain(randomAbsCombo(state(), { spot: 'bar', random: seeded(seed) }).gear)
    }
  })
  it('gives about half the combo to its gear', () => {
    for (let seed = 1; seed < 20; seed++) {
      const { ids } = randomAbsCombo(state(), { spot: 'cable', count: 6, random: seeded(seed) })
      expect(ids.filter(id => gear(id) === 'cable').length).toBe(3)
    }
  })
  it('runs the station first, then in body order', () => {
    const atStation = id => !['floor', ...ABS_ITEMS].includes(gear(id))
    for (let seed = 1; seed < 40; seed++) {
      const { ids } = randomAbsCombo(state(), { count: 6, random: seeded(seed) })
      const station = ids.filter(atStation)
      expect(ids.slice(0, station.length), ids.join()).toEqual(station)
      const ranks = ids.slice(station.length).map(pos)
      expect(ranks, ids.join()).toEqual([...ranks].sort((a, b) => a - b))
    }
  })
  it('a floor combo of four has one of each style', () => {
    for (let seed = 1; seed < 30; seed++) {
      const { ids } = randomAbsCombo(state(), { spot: 'floor', random: seeded(seed) })
      expect(new Set(ids.map(id => absStyleOf(EXIDX[id]))).size).toBe(4)
    }
  })
  it('keeps the count between two and the most a combo takes', () => {
    expect(randomAbsCombo(state(), { count: 1, random: seeded() }).ids).toHaveLength(2)
    expect(randomAbsCombo(state(), { count: 50, random: seeded() }).ids).toHaveLength(ABS_COMBO_MAX)
  })
  it('is not the same combo every time', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, k) => randomAbsCombo(state(), { random: seeded(k + 1) }).ids.join()))
    expect(seen.size).toBeGreaterThan(10)
  })
  it('often brings back the abs exercises you have logged, and their gear', () => {
    const mine = ['0872', '0274', '0687', '0463']
    const S = state({ workouts: [session('2026-09-01', mine)] })
    expect(absCandidates(S).filter(c => c.known).map(c => c.id).sort()).toEqual([...mine].sort())
    let known = 0
    for (let seed = 1; seed <= 40; seed++) known += randomAbsCombo(S, { spot: 'floor', random: seeded(seed) }).ids.filter(id => mine.includes(id)).length
    expect(known / 160).toBeGreaterThan(0.45)
    const cableFan = state({ workouts: [session('2026-09-01', ['0175', '0243', '8193', '1202'])] })
    let cable = 0
    for (let seed = 1; seed <= 40; seed++) if (randomAbsCombo(cableFan, { random: seeded(seed) }).gear === 'cable') cable++
    expect(cable).toBeGreaterThan(10)
  })
  it('a shuffle steers clear of the combo it replaces', () => {
    for (let seed = 1; seed < 20; seed++) {
      const first = randomAbsCombo(state(), { spot: 'floor', random: seeded(seed) }).ids
      const next = randomAbsCombo(state(), { spot: 'floor', avoid: first, random: seeded(seed + 100) }).ids
      expect(next.filter(id => first.includes(id))).toEqual([])
    }
  })
  it('leaves out the exercises you skip, and the spots left with none', () => {
    const skipEx = Object.values(ABS_STAPLES).flat().filter(id => id !== '0463' && id !== '0276')
    expect([...randomAbsCombo(state({ skipEx }), { random: seeded() }).ids].sort()).toEqual(['0276', '0463'])
    expect(absSpotsOpen(state({ skipEx }))).toEqual(['any', 'floor'])
    expect(randomAbsCombo(state({ skipEx }), { spot: 'cable' })).toEqual({ ids: [], gear: null })
    expect(absSpotsOpen(state())).toEqual(ABS_SPOTS)
  })
})

describe('swapAbsExercise', () => {
  it('swaps one for the same style and gear, leaving the rest', () => {
    const ids = ['0472', '0175', '0687', '0463']
    for (let seed = 1; seed < 20; seed++) {
      const out = swapAbsExercise(state(), ids, 0, { random: seeded(seed) })
      expect(out.slice(1)).toEqual(ids.slice(1))
      expect(out[0]).not.toBe('0472')
      expect(gear(out[0])).toBe('bar')
      expect(absStyleOf(EXIDX[out[0]])).toBe('lower')
      const floor = swapAbsExercise(state(), ids, 3, { random: seeded(seed) })
      expect(['floor', 'bar', 'cable']).toContain(gear(floor[3]))
      expect(new Set(floor).size).toBe(4)
    }
  })
  it('never brings in a second machine', () => {
    for (let seed = 1; seed < 20; seed++) {
      const out = swapAbsExercise(state(), ['1452', '0274', '0687'], 0, { random: seeded(seed) })
      expect(gear(out[0])).not.toBe('machine')
    }
  })
})

describe('resizeAbsCombo', () => {
  it('adds at the bottom and takes the last off, so + then − gives back the combo', () => {
    for (const spot of ['floor', 'cable', 'item', 'machine']) {
      for (let seed = 1; seed < 20; seed++) {
        const { ids, gear: g } = randomAbsCombo(state(), { spot, count: 4, random: seeded(seed) })
        const six = resizeAbsCombo(state(), resizeAbsCombo(state(), ids, g, 5, { random: seeded(seed + 50) }), g, 6, { random: seeded(seed) })
        expect(six, spot).toHaveLength(6)
        expect(six.slice(0, 4), spot).toEqual(ids)
        expect(resizeAbsCombo(state(), resizeAbsCombo(state(), six, g, 5), g, 4)).toEqual(ids)
        expect(resizeAbsCombo(state(), ids, g, 3)).toEqual(ids.slice(0, 3))
      }
    }
  })
  it('adds the gear to about half, a machine once, and only floor besides', () => {
    for (let seed = 1; seed < 20; seed++) {
      let { ids } = randomAbsCombo(state(), { spot: 'cable', count: 2, random: seeded(seed) })
      for (let n = 3; n <= ABS_COMBO_MAX; n++) {
        ids = resizeAbsCombo(state(), ids, 'cable', n, { random: seeded(seed * n) })
        expect(ids.filter(id => gear(id) === 'cable').length).toBe(Math.ceil(n / 2))
        expect(ids.every(id => ['cable', 'floor'].includes(gear(id)))).toBe(true)
      }
      const machine = randomAbsCombo(state(), { spot: 'machine', count: 2, random: seeded(seed) })
      const eight = resizeAbsCombo(state(), machine.ids, 'machine', 8, { random: seeded(seed) })
      expect(eight.filter(id => gear(id) === 'machine')).toHaveLength(1)
    }
  })
  it('adds the style the combo lacks', () => {
    const style = id => absStyleOf(EXIDX[id])
    const three = ABS_STYLES.slice(0, 3).map(s => ABS_STAPLES.floor.find(id => style(id) === s))
    const four = resizeAbsCombo(state(), three, 'floor', 4, { random: seeded() })
    expect(style(four[3])).toBe(ABS_STYLES[3])
  })
})
