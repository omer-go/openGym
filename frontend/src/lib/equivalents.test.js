import { beforeAll, describe, expect, it } from 'vitest'
import { equivalentsOf, fitsFor, TIERS } from './equivalents.js'
import { EXIDX } from './exercises.js'
import { planPool } from './generate.js'
import { loadMuscleRoles } from './muscle-roles.js'

const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const ids = list => list.map(x => x.ex.id)
const tierOf = (list, id) => list.find(x => x.ex.id === id)?.tier

// barbell bench, dumbbell bench, incline bench, push-up, chest fly; lateral raise, reverse fly,
// upright row; lying leg curl, seated leg curl, good morning; RDL, deadlift; squat, lunge
const BENCH = '0025', DBBENCH = '0289', INCLINE = '0047', PUSHUP = '0662', FLY = '0308'
const RAISE = '0334', REAR = '0383', UPRIGHT = '0120'
const LEGCURL = '0586', SEATED = '0599', GOODMORNING = '0044'
const RDL = '0085', DEADLIFT = '0032', SQUAT = '0043', LUNGE = '0336'

describe('equivalentsOf', () => {
  beforeAll(() => loadMuscleRoles())

  it('puts the same lift on other kit first, then the movement, then the slot', () => {
    const list = equivalentsOf(state(), BENCH, { scope: 'all' })
    expect(tierOf(list, DBBENCH)).toBe('lift')
    expect(tierOf(list, PUSHUP)).toBe('muscle')
    const rank = list.map(x => TIERS.findIndex(t => t.id === x.tier))
    expect(rank).toEqual([...rank].sort((a, b) => a - b))
    expect(ids(list)).not.toContain(BENCH)
  })
  it('keeps to the slot: no fly for a press, no incline press for a flat one', () => {
    const list = ids(equivalentsOf(state(), BENCH, { scope: 'all' }))
    expect(list).not.toContain(FLY)
    expect(list).not.toContain(INCLINE)
  })
  it('keeps to the target muscle: a side-delt raise is no rear-delt fly', () => {
    const list = equivalentsOf(state(), RAISE, { scope: 'all' })
    expect(ids(list)).not.toContain(REAR)
    expect(tierOf(list, UPRIGHT)).toBe('muscle')
  })
  it("an isolation lift's equivalents are isolation lifts", () => {
    const list = ids(equivalentsOf(state(), LEGCURL, { scope: 'all' }))
    expect(list).toContain(SEATED)
    expect(list).not.toContain(GOODMORNING)
  })
  it('a hinge for a hinge, a squat or a lunge for a squat', () => {
    expect(ids(equivalentsOf(state(), RDL, { scope: 'all' }))).toContain(DEADLIFT)
    const squat = equivalentsOf(state(), SQUAT, { scope: 'all' })
    expect(tierOf(squat, LUNGE)).toBe('muscle')
    expect(ids(squat)).not.toContain(RDL)
  })
  it('in your list, only what is on it', () => {
    const S = state(), pool = new Set(planPool(S))
    const mine = equivalentsOf(S, BENCH)
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every(x => pool.has(x.ex.id))).toBe(true)
    expect(mine.length).toBeLessThan(equivalentsOf(S, BENCH, { scope: 'all' }).length)
  })
  it('leaves out skipped exercises, kit you lack and filmed form checks', () => {
    const skipped = equivalentsOf(state({ skipEx: [DBBENCH] }), BENCH, { scope: 'all' })
    expect(ids(skipped)).not.toContain(DBBENCH)
    const home = state({ equipFilterOn: true, equipProfiles: [{ id: 'p', name: 'Home', equipment: ['dumbbell', 'bench'], accV: 1 }], activeEquipId: 'p' })
    expect(equivalentsOf(home, BENCH, { scope: 'all' }).every(x => x.ex.eq !== 'barbell')).toBe(true)
    expect(equivalentsOf(state(), BENCH, { scope: 'all' }).some(x => /pov|form check/.test(x.ex.n))).toBe(false)
  })
  it('fitsFor needs both ways the same slot', () => {
    expect(fitsFor(EXIDX[BENCH], EXIDX[DBBENCH])).toBe(true)
    expect(fitsFor(EXIDX[BENCH], EXIDX[SQUAT])).toBe(false)
  })
  it('an unknown exercise has none', () => {
    expect(equivalentsOf(state(), 'nope')).toEqual([])
  })
})
