import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { defaultConfig, fmtMin, setLabel } from './history.js'
import { ACTIVITY_GROUPS, activityOf, cardioAreaOf, stretchAreaOf, usesStopwatch, cardioMinutes, logElapsed, isStretch } from './activities.js'
import { groupExercises, activityLast } from './add-exercise.js'
import { swapCycle } from './quick-swap.js'

// run, run on treadmill (filed under "stationary bike"), walking on treadmill, rowing machine,
// jump rope; a hamstring stretch and an across-chest shoulder stretch; bench press
const RUN = '0685', TREADMILL = '2197', TM_WALK = '2259', ROW = '1161', ROPE = '2612', BENCH = '0025'
const SHOULDER_STRETCH = Object.values(EXIDX).find(e => e.n === 'across chest shoulder stretch').id
const state = (over = {}) => ({ unit: 'kg', workouts: [], exWeights: {}, routines: [], ...over })
const session = (d, ids) => ({ id: 'w' + d, d, name: 'x', entries: ids.map(id => ({ id, sets: [{ min: 20, speed: 9, done: true }] })) })

describe('activity areas', () => {
  it('sorts cardio by what it is, the name before the equipment', () => {
    expect(cardioAreaOf(EXIDX[RUN])).toBe('running')
    expect(cardioAreaOf(EXIDX[TREADMILL])).toBe('running')
    expect(cardioAreaOf(EXIDX[TM_WALK])).toBe('walking')
    expect(cardioAreaOf(EXIDX[ROW])).toBe('machines')
    expect(cardioAreaOf(EXIDX[ROPE])).toBe('other')
  })
  it('puts stretches by where on the body they are', () => {
    expect(stretchAreaOf(EXIDX[SHOULDER_STRETCH])).toBe('upper')
    expect(stretchAreaOf({ bp: 'upper legs' })).toBe('legs')
    expect(stretchAreaOf({ bp: 'full body' })).toBe('back')
  })
  it('places an exercise in its group, and a lift in none', () => {
    expect(activityOf(EXIDX[RUN])).toEqual({ group: 'cardio', area: 'running' })
    expect(activityOf(EXIDX[SHOULDER_STRETCH])).toEqual({ group: 'stretching', area: 'upper' })
    expect(activityOf(EXIDX[BENCH])).toBeNull()
  })
  it('every staple is in the area it leads', () => {
    for (const g of ACTIVITY_GROUPS) for (const a of g.areas) for (const id of a.staples) expect(g.of(EXIDX[id])).toBe(a.id)
  })
})

describe('stopwatch', () => {
  it('times cardio and stretches held for time, not lifts or planks', () => {
    expect(usesStopwatch({ id: RUN })).toBe(true)
    expect(usesStopwatch({ id: SHOULDER_STRETCH, mode: 'time' })).toBe(true)
    expect(usesStopwatch({ id: SHOULDER_STRETCH, mode: 'reps' })).toBe(false)
    expect(usesStopwatch({ id: BENCH, mode: 'time' })).toBe(false)
  })
  it('a stretch is added as timed holds', () => {
    expect(isStretch(SHOULDER_STRETCH)).toBe(true)
    expect(defaultConfig(SHOULDER_STRETCH)).toEqual({ sets: 2, sec: 30, weight: 0, mode: 'time', bodyweight: true })
    expect(defaultConfig(SHOULDER_STRETCH, 'reps').mode).toBe('reps')
  })
  it('logs the exact time to a cardio row, read back as m:ss, and seconds to a hold', () => {
    expect(cardioMinutes(20)).toBe(0.3333)
    expect(cardioMinutes(7 * 60 + 40)).toBe(7.6667)
    expect(fmtMin(cardioMinutes(89))).toBe('1:29')
    expect(fmtMin(cardioMinutes(20))).toBe('0:20')
    expect(fmtMin(25)).toBe('25')
    expect(setLabel('0685', logElapsed({ min: 20, speed: 8 }, 25 * 60 + 10, 'cardio'))).toBe('25:10 min @ 8 mph')
    expect(logElapsed({ min: 20, speed: 8 }, 25 * 60 + 10, 'cardio')).toEqual({ min: 25.1667, speed: 8 })
    expect(logElapsed({ sec: 30 }, 42, 'time')).toEqual({ sec: 42 })
  })
})

describe('Add exercise: cardio and stretching', () => {
  it('lists cardio by area, what you did first, then the staples', () => {
    const S = state({ workouts: [session('2026-10-01', [TREADMILL])] })
    const { sections } = groupExercises(S, 'cardio')
    expect(sections.map(x => x.m)).toEqual(['running', 'walking', 'machines', 'other'])
    const running = sections[0]
    expect(running.list[0].id).toBe(TREADMILL)
    expect(running.list[1].id).toBe(RUN)
    expect(running.last).toBe('2026-10-01')
    expect(running.list.every(ex => cardioAreaOf(ex) === 'running')).toBe(true)
  })
  it('narrows to an area, and leaves out what is already in the workout', () => {
    const S = state({ active: { entries: [{ id: RUN, sets: [] }] } })
    const { sections, hidden } = groupExercises(S, 'cardio', { area: 'running' })
    expect(sections).toHaveLength(1)
    expect(hidden).toBe(1)
    expect(sections[0].list.some(ex => ex.id === RUN)).toBe(false)
  })
  it('stretches have a group of their own and leave the muscle groups', () => {
    const { sections } = groupExercises(state(), 'stretching', { sort: 'az' })
    expect(sections.flatMap(x => x.list).every(ex => ex.cat === 'stretching')).toBe(true)
    const shoulders = groupExercises(state(), 'shoulders').sections.flatMap(x => x.list)
    expect(shoulders.some(ex => ex.cat === 'stretching')).toBe(false)
  })
  it('knows when each group and area was last done', () => {
    expect(activityLast(state({ workouts: [session('2026-10-01', [RUN]), session('2026-10-05', [ROW])] })))
      .toEqual({ cardio: '2026-10-05', 'cardio:running': '2026-10-01', 'cardio:machines': '2026-10-05' })
  })
})

describe('one-tap swap of cardio and stretches', () => {
  it('a run swaps for another run, a stretch for another stretch', () => {
    expect(swapCycle(state(), RUN).slice(1).every(id => cardioAreaOf(EXIDX[id]) === 'running')).toBe(true)
    expect(swapCycle(state(), RUN)[1]).toBe(TREADMILL)
    const s = swapCycle(state(), SHOULDER_STRETCH)
    expect(s.length).toBeGreaterThan(1)
    expect(s.every(id => EXIDX[id].cat === 'stretching')).toBe(true)
  })
})
