import { describe, it, expect } from 'vitest'
import { comboSpans, comboSpanAt, comboRound, fitRounds, asComboMember, comboSwapSeed, asComboSwap, comboRowsFrom } from './combo.js'

const row = (done = false, extra = {}) => ({ w: 20, r: 10, done, ...extra })

describe('combo rounds', () => {
  it('round r is every member\'s r-th work row; warm-ups sit outside', () => {
    const e = { sets: [row(true, { phase: 'warmup' }), row(), row()] }
    expect(comboSpans(e)).toEqual([[1, 1], [2, 1]])
    expect(comboSpanAt(e, 0)).toEqual([1, 1])
    expect(comboSpanAt(e, 2)).toBe(null)
  })

  it('a hold timed per side is one set of two rows, and a round needs both sides', () => {
    const e = { sets: [row(true, { side: 'L' }), row(false, { side: 'R' }), row(false, { side: 'L' }), row(false, { side: 'R' })] }
    expect(comboSpans(e)).toEqual([[0, 2], [2, 2]])
    expect(comboRound([e], [0]).round).toBe(0)
    e.sets[1].done = true
    expect(comboRound([e], [0])).toMatchObject({ rounds: 2, round: 1, done: [true, false] })
  })

  it('the current round is the first one a member still has open', () => {
    const entries = [
      { sets: [row(true), row(true), row()] },
      { sets: [row(true), row(), row()] },
    ]
    expect(comboRound(entries, [0, 1])).toEqual({ rounds: 3, done: [true, false, false], round: 1, allDone: false })
  })

  it('a member with fewer rounds does not hold the others back', () => {
    const entries = [{ sets: [row(true), row(true)] }, { sets: [row(true)] }]
    const s = comboRound(entries, [0, 1])
    expect(s.done).toEqual([true, true])
    expect(s.allDone).toBe(true)
    expect(s.round).toBe(1)
  })

  it('one round is just a titled list', () => {
    const s = comboRound([{ sets: [row()] }, { sets: [row(true)] }], [0, 1])
    expect(s).toEqual({ rounds: 1, done: [false], round: 0, allDone: false })
  })

  it('an empty combo has nothing done', () => {
    expect(comboRound([], [])).toEqual({ rounds: 0, done: [], round: 0, allDone: false })
  })
})

describe('fitRounds', () => {
  it('copies the last row forward, unchecked, up to the rounds asked for', () => {
    const out = fitRounds([row(false, { phase: 'warmup', w: 10 }), row(true, { w: 40 })], 3)
    expect(out).toHaveLength(3)
    expect(out.every(s => s.w === 40)).toBe(true)
    expect(out.slice(1).every(s => s.done === false)).toBe(true)
  })

  it('cuts down a plan with more rows, keeping its order', () => {
    expect(fitRounds([row(false, { r: 8 }), row(false, { r: 6 }), row(false, { r: 4 })], 2).map(s => s.r)).toEqual([8, 6])
  })

  it('copies a per-side hold forward as its pair of rows', () => {
    const out = fitRounds([row(true, { side: 'L', sec: 30 }), row(true, { side: 'R', sec: 30 })], 2)
    expect(out.map(s => s.side)).toEqual(['L', 'R', 'L', 'R'])
    expect(out.slice(2).every(s => !s.done)).toBe(true)
  })

  it('does not share row objects with the source', () => {
    const src = [row()]
    fitRounds(src, 2)[0].w = 99
    expect(src[0].w).toBe(20)
  })
})

describe('asComboMember', () => {
  it('a routine exercise takes the rounds as its sets and the group meta on itself', () => {
    expect(asComboMember({ id: 'crunch', sets: 3, reps: 15 }, { sg: 'sgA', rounds: 2, name: ' Abs ', rest: 60 }))
      .toEqual({ id: 'crunch', sets: 2, reps: 15, sg: 'sgA', sgCombo: true, sgName: 'Abs', sgRest: 60 })
  })

  it('a session entry gets one row per round, the meta on its target', () => {
    const e = asComboMember({ id: 'plank', target: { sec: 30, sets: 3 }, sets: [row(false, { sec: 30 })] }, { sg: 'sgB', rounds: 3 }, { onTarget: true })
    expect(e.sg).toBe('sgB')
    expect(e.sets).toHaveLength(3)
    expect(e.target).toEqual({ sec: 30, sets: 3, sgCombo: true })
  })
})

describe('a swap inside a combo', () => {
  const member = { id: 'crunch', sg: 'sgC', target: { reps: 15, sets: 3, sgCombo: true, sgKind: 'strength', sgName: 'Core', sgRest: 45 }, sets: [row(true), row(false), row(false)] }
  it('builds the new exercise for the member\'s rounds and the combo\'s kind', () => {
    expect(comboSwapSeed(member)).toEqual({ sets: 3, sgCombo: true, sgKind: 'strength' })
    expect(comboSwapSeed({ id: 'crunch', target: { reps: 15 }, sets: [row(false)] })).toEqual({})
  })
  it('keeps the replacement in the combo, one row per round, with its meta', () => {
    const swapped = asComboSwap(member, { id: 'plank', target: { sec: 30, sets: 5 }, sets: [row(false, { sec: 30 })] })
    expect(swapped.sg).toBe('sgC')
    expect(swapped.sets).toHaveLength(3)
    expect(swapped.target).toEqual({ sec: 30, sets: 3, sgCombo: true, sgKind: 'strength', sgName: 'Core', sgRest: 45 })
  })
  it('leaves any other entry\'s replacement as it is', () => {
    const plain = { id: 'plank', target: { sec: 30 }, sets: [row(false)] }
    expect(asComboSwap({ id: 'crunch', sg: 'sgD', target: {}, sets: [] }, plain)).toBe(plain)
  })
})

describe('comboRowsFrom', () => {
  it('is the round on show and the later ones, past the rows already done', () => {
    const e = { sets: [row(true, { warmup: true }), row(true), row(false), row(true), row(false)] }
    expect(comboRowsFrom(e, 1)).toEqual([2, 4])
    expect(comboRowsFrom(e, 3)).toEqual([4])
    expect(comboRowsFrom(e, 9)).toEqual([])
  })
  it('takes both rows of a hold timed per side', () => {
    const e = { sets: [{ sec: 30, side: 'L', done: false }, { sec: 30, side: 'R', done: false }, { sec: 30, side: 'L', done: false }, { sec: 30, side: 'R', done: false }] }
    expect(comboRowsFrom(e, 1)).toEqual([2, 3])
  })
})
