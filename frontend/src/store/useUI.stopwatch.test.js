// @vitest-environment happy-dom
// The stopwatch (cardio, a stretch): the work timer counting up instead of down. No target, no
// end chime; Stop logs what it shows, and it outlives a reload like a hold does.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({ ok: true })) }))
const { beep, chime } = vi.hoisted(() => ({ beep: vi.fn(), chime: vi.fn() }))
vi.mock('../lib/sound.js', () => ({ beep, chime, vibrate: vi.fn(), alertBuzz: vi.fn() }))

import { useUI, restoreWork, WORK_KEY, MAX_STOPWATCH_SEC } from './useUI.js'
import { useStore } from './useStore.js'

const runSet = () => useStore.getState().S.active.entries[0].sets[0]
const owner = { idx: 0, i: 0, id: '0685' }

let original
beforeEach(() => {
  vi.useFakeTimers()
  original = useStore.getState().S
  useStore.setState({ S: { ...original, sound: true, active: { id: 'a', entries: [{ id: '0685', sets: [{ min: 20, speed: 9 }] }] } } })
  useUI.setState({ timer: null, work: null })
  localStorage.clear()
  beep.mockClear(); chime.mockClear()
})
afterEach(() => {
  useUI.getState().stopWork()
  useUI.getState().stopRest()
  useStore.setState({ S: original })
  vi.useRealTimers()
})

describe('the stopwatch', () => {
  it('counts up silently until stopped, and hands back what it counted', () => {
    const done = vi.fn()
    useUI.getState().startWork(0, 'Run', done, owner, { up: true, mode: 'cardio' })
    vi.advanceTimersByTime(25 * 60000 + 10000)
    expect(useUI.getState().work).toMatchObject({ up: true, left: 25 * 60 + 10 })
    expect(beep).not.toHaveBeenCalled()
    expect(chime).not.toHaveBeenCalled()
    useUI.getState().finishWorkEarly()
    expect(done).toHaveBeenCalledWith(25 * 60 + 10)
    expect(useUI.getState().work).toBeNull()
  })

  it('stops itself at the cap', () => {
    const done = vi.fn()
    useUI.getState().startWork(0, 'Run', done, owner, { up: true, mode: 'cardio' })
    vi.advanceTimersByTime((MAX_STOPWATCH_SEC + 5) * 1000)
    expect(done).toHaveBeenCalledWith(MAX_STOPWATCH_SEC)
    expect(useUI.getState().work).toBeNull()
  })

  it('carries on after a reload, and its Stop writes minutes to the cardio row', () => {
    useUI.getState().startWork(0, 'Run', vi.fn(), owner, { up: true, mode: 'cardio' })
    expect(JSON.parse(localStorage.getItem(WORK_KEY))).toMatchObject({ up: true, mode: 'cardio', owner })
    // The reload: the handler is gone, the saved stopwatch is all there is.
    const kept = localStorage.getItem(WORK_KEY)
    useUI.getState().stopWork()
    localStorage.setItem(WORK_KEY, kept)
    vi.advanceTimersByTime(12 * 60000)
    expect(restoreWork()).toBe(true)
    expect(useUI.getState().work).toMatchObject({ up: true, left: 12 * 60 })
    vi.advanceTimersByTime(60000)
    useUI.getState().finishWorkEarly()
    expect(runSet()).toMatchObject({ min: 13, speed: 9, done: true })
  })
})
