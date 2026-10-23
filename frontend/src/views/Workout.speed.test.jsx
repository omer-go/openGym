// @vitest-environment happy-dom
// Cardio speed is mph, the only unit: the set row shows, steps and takes typing in mph, and
// stores exactly that.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Workout from './Workout.jsx'
import { DEF, useStore } from '../store/useStore.js'

vi.mock('../lib/sound.js', () => ({ beep: vi.fn(), tick: vi.fn(), vibrate: vi.fn(), alertBuzz: vi.fn(), unlock: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const BIKE = '2138'   // stationary bike, cardio
let root, container

function mount(settings = {}) {
  if (root) unmount()
  const S = { ...JSON.parse(JSON.stringify(DEF)), unit: 'lb', ...settings }
  S.active = {
    id: 'speed-test', d: '2026-09-23', start: Date.now(), routineId: null, name: 'Cardio', bw: null, cur: 0,
    entries: [{ id: BIKE, target: { sets: 1, min: 20, speed: 8 }, sets: [{ min: 20, speed: 8, done: false }] }],
  }
  useStore.setState({ S, user: null })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<MemoryRouter><Workout /></MemoryRouter>))
}
function unmount() {
  act(() => root.unmount())
  container.remove()
  root = null
}
afterEach(() => { if (root) unmount() })

// The speed column, after the minutes (a Start button until the set is done).
const speedCell = () => container.querySelector('.setrow .stp.r:not(.inc)')
const shown = () => speedCell().querySelector('input').value
const header = () => container.querySelector('.sethead .r-sp').textContent
const stored = () => useStore.getState().S.active.entries[0].sets[0].speed
const tap = label => act(() => speedCell().querySelector(`button[aria-label="${label}"]`).click())
function type(value) {
  const input = speedCell().querySelector('input')
  act(() => {
    Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('cardio speed in the set row', () => {
  it('reads, steps and takes typing in mph, and stores it as typed', () => {
    mount()
    expect(header()).toBe('Speed (mph)')
    expect(shown()).toBe('8')
    tap('Increase')
    expect(stored()).toBe(8.5)
    type('6.25')
    expect(stored()).toBe(6.25)
    expect(shown()).toBe('6.25')
  })

  it('is mph even for a profile that once chose km/h', () => {
    mount({ unit: 'kg', speedUnit: 'kmh' })
    expect(header()).toBe('Speed (mph)')
    expect(shown()).toBe('8')
  })
})

// The line under the exercise reads the past in the same unit as the row it sits over, whether
// it holds the last time or the best set (#173).
describe('the reference line in mph', () => {
  const past = { id: 'w0', d: '2026-09-20', start: Date.now() - 3 * 86400000, end: Date.now() - 3 * 86400000 + 1800000, name: 'Cardio',
    entries: [{ id: BIKE, target: { mode: 'cardio', sets: 1, min: 20, speed: 10 }, sets: [{ min: 20, speed: 10, done: true }] }] }
  const refText = () => container.querySelector('.refline')?.textContent || ''

  it('shows last time and the best set in mph', () => {
    mount({ unit: 'lb', workouts: [past] })
    expect(refText()).toContain('20 min @ 10 mph')
    mount({ unit: 'lb', workouts: [past], logRef: 'best' })
    expect(refText()).toContain('20 min @ 10 mph')
  })
})
