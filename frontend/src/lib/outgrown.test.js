import { describe, expect, it } from 'vitest'
import { outgrown, outgrownIds, reachOf, topReps, ratioAt, evidenceOf, MARGIN } from './outgrown.js'
import { EXIDX } from './exercises.js'
import { generateWorkout } from './generate.js'
import { planExclude } from './program.js'

const DEADLIFT = '0032', SUMO_DL = '0117', STIFF = '1543', BB_RDL = '0085'
const DB_DEADLIFT = '0300', DB_RDL = '1459', DB_SUMO_DL = '8192', DB_SINGLE = '1757', DB_SWING = '3368'
const SQUAT = '0043', SUMO_SQUAT = '1063', DB_SQUAT = '0413', DB_SUMO_SQUAT = '5121', DB_SPLIT = '2290'
const BENCH = '0025', DB_BENCH = '0289', DB_INCLINE = '0314'
const CURL = '0031', DB_CURL = '0294', DB_LATERAL = '0334'

const NOW = new Date('2026-11-25T12:00:00').getTime()
const row = (w, r) => ({ w, r, done: true })
const session = (d, id, w, r = 5, target = {}) => ({ id: 'w' + d + id, d, name: 'x', entries: [{ id, target: { reps: r, ...target }, sets: [row(w, r), row(w, r), row(w, r)] }] })
const bells = top => { const ws = []; for (let w = 5; w <= top; w += 5) ws.push(w); return ws }
const state = (workouts = [], over = {}) => ({ unit: 'lb', workouts, exWeights: {}, routines: [], goals: { type: 'growth' }, dumbbells: { lb: { weights: bells(75), _ts: 1 } }, ...over })
const judge = (S, id) => outgrown(S, id, evidenceOf(S, { now: NOW }))
const D = '2026-11-20'

describe('the rep range a lift is judged at', () => {
  it('is the top of its slot under the goal', () => {
    expect(topReps(DB_DEADLIFT, 'growth')).toBe(12)
    expect(topReps(DB_DEADLIFT, 'strength')).toBe(5)
    expect(topReps(DB_CURL, 'growth')).toBe(15)
  })
  it('Epley carries on past its rep cap', () => {
    expect(ratioAt(12, 'epley')).toBeCloseTo(1.4, 5)
    expect(ratioAt(17, 'epley')).toBeCloseTo(1 + 17 / 30, 5)
    expect(ratioAt(1, 'epley')).toBe(1)
  })
})

describe('siblings by movement, target and muscles', () => {
  const r = (a, b) => reachOf(EXIDX[a], EXIDX[b])
  it('the same lift on other kit is the closest', () => {
    expect(r(DB_DEADLIFT, DEADLIFT)).toBe(0)
    expect(r(DB_SUMO_DL, SUMO_DL)).toBe(0)
    expect(r(DB_SUMO_SQUAT, SUMO_SQUAT)).toBe(0)
    expect(r(DB_SQUAT, SQUAT)).toBe(0)
    expect(r(DB_BENCH, BENCH)).toBe(0)
  })
  it('the same movement and target muscle is next', () => {
    expect(r(DB_SUMO_DL, DEADLIFT)).toBe(1)
    expect(r(DB_RDL, STIFF)).toBe(1)
  })
  it('the same movement working the main muscle as a prime mover is the furthest', () => {
    expect(r(DB_RDL, DEADLIFT)).toBe(2)
    expect(r(DB_SUMO_SQUAT, SQUAT)).toBe(2)
    expect(r(DB_INCLINE, BENCH)).toBe(2)
  })
  it('runs one way: a sumo squat only helps the quads', () => {
    expect(r(DB_SQUAT, SUMO_SQUAT)).toBe(null)
  })
  it('another movement is no sibling', () => {
    expect(r(DB_DEADLIFT, SQUAT)).toBe(null)
    expect(r(DB_BENCH, DEADLIFT)).toBe(null)
  })
})

describe('outgrown by your own logs', () => {
  it('the heaviest bell for the top of the range', () => {
    const v = judge(state([session(D, DB_DEADLIFT, 75, 12)]), DB_DEADLIFT)
    expect(v.by).toBe('own')
    expect(v.cap).toBe(75)
    expect(v.need).toBeCloseTo(105, 5)
  })
  it('one bell short is not', () => {
    expect(judge(state([session(D, DB_DEADLIFT, 70, 12)]), DB_DEADLIFT)).toBe(null)
  })
  it('a weight logged as both bells together is halved', () => {
    expect(judge(state([session(D, DB_DEADLIFT, 150, 12, { dbLoad: 'total' })]), DB_DEADLIFT)?.by).toBe('own')
    expect(judge(state([session(D, DB_DEADLIFT, 140, 12, { dbLoad: 'total' })]), DB_DEADLIFT)).toBe(null)
  })
  it('a one-sided lift is judged by its own logs', () => {
    expect(judge(state([session(D, DB_SINGLE, 75, 12)]), DB_SINGLE)?.by).toBe('own')
  })
  it('logs older than twelve weeks say nothing', () => {
    expect(judge(state([session('2026-06-01', DB_DEADLIFT, 75, 12)]), DB_DEADLIFT)).toBe(null)
  })
})

describe('outgrown by a sibling', () => {
  it('a 315 deadlift outgrows the dumbbell deadlift, not its further siblings', () => {
    const S = state([session(D, DEADLIFT, 315)])
    const v = judge(S, DB_DEADLIFT)
    expect(v).toMatchObject({ by: 'sibling', from: DEADLIFT, reach: 0 })
    expect(v.pred).toBeCloseTo(367.5 * 0.4 * 0.9, 1)
    expect(v.pred).toBeGreaterThan(MARGIN * 75 * ratioAt(14, 'epley'))
    expect(judge(S, DB_SUMO_DL)).toBe(null)
    expect(judge(S, DB_RDL)).toBe(null)
  })
  it('a 405 deadlift takes the sumo deadlift too, and leaves the RDL', () => {
    const S = state([session(D, DEADLIFT, 405)])
    expect(judge(S, DB_DEADLIFT)?.reach).toBe(0)
    expect(judge(S, DB_SUMO_DL)).toMatchObject({ by: 'sibling', reach: 1 })
    expect(judge(S, DB_RDL)).toBe(null)
  })
  it('a 225 deadlift outgrows nothing', () => {
    const S = state([session(D, DEADLIFT, 225)])
    expect(outgrownIds(S, null, { now: NOW })).toEqual([])
  })
  it('a one-sided lift, a swing and another movement are never read off it', () => {
    const S = state([session(D, DEADLIFT, 495)])
    for (const id of [DB_SINGLE, DB_SWING, DB_SPLIT, DB_SQUAT, DB_BENCH]) expect(judge(S, id)).toBe(null)
  })
  it('squat and sumo squat are each read off their own lift', () => {
    const squat = state([session(D, SQUAT, 315)])
    expect(judge(squat, DB_SQUAT)?.reach).toBe(0)
    expect(judge(squat, DB_SUMO_SQUAT)).toBe(null)
    const sumo = state([session(D, SUMO_SQUAT, 315)])
    expect(judge(sumo, DB_SUMO_SQUAT)?.reach).toBe(0)
    expect(judge(sumo, DB_SQUAT)).toBe(null)
  })
  it('the closest sibling decides, not the strongest far one', () => {
    // a light barbell sumo deadlift beside a heavy deadlift: the sumo's own lift speaks for it
    const S = state([session(D, DEADLIFT, 405), session(D, SUMO_DL, 185)])
    expect(judge(S, DB_SUMO_DL)).toBe(null)
  })
  it('own logs well under the cap overrule it; near the cap they do not', () => {
    expect(judge(state([session(D, DEADLIFT, 365), session(D, DB_DEADLIFT, 50, 12)]), DB_DEADLIFT)).toBe(null)
    expect(judge(state([session(D, DEADLIFT, 365), session(D, DB_DEADLIFT, 70, 12)]), DB_DEADLIFT)?.by).toBe('sibling')
  })
  it('a stale sibling says nothing', () => {
    expect(judge(state([session('2026-06-01', DEADLIFT, 405)]), DB_DEADLIFT)).toBe(null)
  })
  it('curls and lateral raises never get there', () => {
    const S = state([session(D, CURL, 135, 8), session(D, BENCH, 225)])
    for (const id of [DB_CURL, DB_LATERAL, DB_BENCH]) expect(judge(S, id)).toBe(null)
  })
  it('a strength goal judges at five reps, where the same bar needs a heavier bell', () => {
    const w = [session(D, DEADLIFT, 275)]
    expect(judge(state(w), DB_DEADLIFT)).toBe(null)
    expect(judge(state(w, { goals: { type: 'strength' } }), DB_DEADLIFT)?.by).toBe('sibling')
  })
})

describe('where it applies', () => {
  it('nothing without a dumbbell inventory', () => {
    const S = state([session(D, DEADLIFT, 405)], { dumbbells: undefined })
    expect(evidenceOf(S, { now: NOW })).toBe(null)
    expect(outgrownIds(S, null, { now: NOW })).toEqual([])
  })
  it('a heavier rack keeps the lift', () => {
    const S = state([session(D, DEADLIFT, 315)], { dumbbells: { lb: { weights: bells(120), _ts: 1 } } })
    expect(judge(S, DB_DEADLIFT)).toBe(null)
  })
  it('only dumbbell lifts are judged', () => {
    const S = state([session(D, DEADLIFT, 405), session(D, DB_DEADLIFT, 75, 12)])
    expect(judge(S, DEADLIFT)).toBe(null)
    expect(outgrownIds(S, [DEADLIFT, DB_DEADLIFT, DB_RDL], { now: NOW })).toEqual([DB_DEADLIFT])
  })
  it('a program leaves outgrown lifts out', () => {
    const S = state([session(D, DEADLIFT, 405)])
    const out = planExclude(S, NOW)
    expect(out).toContain(DB_DEADLIFT)
    expect(out).not.toContain(DB_RDL)
  })
  it('a one-tap day gives an outgrown lift\'s place to another', () => {
    // the dumbbell RDL a leg day picks is left out once the barbell RDL says it is too light
    const w = [session('2026-11-10', BB_RDL, 405), session('2026-11-10', SQUAT, 365)]
    const picks = S => [0, 1, 2, 3].flatMap(shift => generateWorkout(S, 'legs', { now: NOW, shift }).map(p => p.id))
    expect(picks(state(w, { dumbbells: undefined }))).toContain(DB_RDL)
    expect(judge(state(w), DB_RDL)).toMatchObject({ by: 'sibling', from: BB_RDL, reach: 0 })
    expect(picks(state(w))).not.toContain(DB_RDL)
  })
  it('a sideways squat is not read off a squat', () => {
    expect(judge(state([session(D, SQUAT, 495)]), '4562')).toBe(null)
  })
})
