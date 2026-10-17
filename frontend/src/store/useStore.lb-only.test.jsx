// @vitest-environment happy-dom

// Weights are lb-only, with no conversion: a booted profile still labelled kg is relabelled lb once,
// its numbers kept as they are.
import { describe, it, expect, beforeEach } from 'vitest'
import { DEF, lbOnly, useStore } from './useStore.js'

const clone = o => JSON.parse(JSON.stringify(o))
const kg = () => ({
  ...clone(DEF), unit: 'kg', _ts: 100,
  bodyweight: [{ d: '2026-10-01', w: 80 }],
  workouts: [{ id: 'w1', d: '2026-10-01', entries: [{ id: 'bench', sets: [{ w: 100, r: 5, done: true }] }] }],
})
const tick = () => new Promise(r => setTimeout(r, 0))

beforeEach(() => { localStorage.clear(); useStore.setState({ S: clone(DEF), user: null, ready: false }) })

describe('lb only', () => {
  it('starts a new profile in lb', () => expect(DEF.unit).toBe('lb'))
  it('relabels a kg profile lb once it is booted, converting nothing', async () => {
    useStore.setState({ S: kg(), ready: true })
    lbOnly(useStore.getState()); await tick()
    const S = useStore.getState().S
    expect(S.unit).toBe('lb')
    expect(S.workouts[0].entries[0].sets[0].w).toBe(100)
    expect(S.bodyweight[0].w).toBe(80)
    expect(S.unitSet.convert).toBe(false)
  })
  it('waits for boot, and leaves an lb profile alone', async () => {
    useStore.setState({ S: kg(), ready: false })
    lbOnly(useStore.getState()); await tick()
    expect(useStore.getState().S.unit).toBe('kg')
    const lb = { ...kg(), unit: 'lb' }
    useStore.setState({ S: lb, ready: true })
    lbOnly(useStore.getState()); await tick()
    expect(useStore.getState().S).toBe(lb)
  })
})
