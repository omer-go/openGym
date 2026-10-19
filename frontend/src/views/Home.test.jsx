// @vitest-environment happy-dom
// Home is this week's logged workouts and the ways to start one: four one-tap day types,
// freestyle and your saved routines. A session in progress replaces the tiles, since starting
// another would overwrite it.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { isoOf } from '../lib/format.js'
import { menuSheet, startFlow, startGenerated } from '../sheets.jsx'
import Home from './Home.jsx'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../sheets.jsx', () => ({
  startFlow: vi.fn(), startGenerated: vi.fn(), menuSheet: vi.fn(), workoutDetailSheet: vi.fn(),
  logPastWorkoutSheet: vi.fn(), WorkoutRow: ({ w }) => <div className="wrow">{w.name}</div>, DayNoteRow: () => null,
}))

const today = isoOf(new Date())
let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  useUI.setState({ sheets: [] })
  useStore.setState(s => ({ S: { ...s.S, routines: [], workouts: [], dayNotes: {}, active: null }, user: null }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const setS = over => useStore.setState(s => ({ S: { ...s.S, ...over } }))
const mount = () => act(() => root.render(<Home />))
const tile = label => host.querySelector(`.gen-tile[aria-label="${label}"]`)
const todayCell = () => host.querySelector('.wday.today')

describe('Home — starting a workout', () => {
  it('offers the four day types, freestyle and saved routines', () => {
    mount()
    expect([...host.querySelectorAll('.gen-tile')].map(el => el.getAttribute('aria-label')))
      .toEqual(['Full body', 'Pull day', 'Push day', 'Leg day', 'Freestyle', 'Saved routines'])
  })

  it('a day type builds that session; freestyle starts empty', () => {
    mount()
    act(() => { tile('Pull day').click() })
    expect(startGenerated).toHaveBeenCalledWith('pull')
    act(() => { tile('Freestyle').click() })
    expect(startFlow).toHaveBeenCalledWith([])
  })

  it('saved routines lists each routine, one tap to start it', () => {
    setS({ routines: [{ id: 'r1', name: 'Upper', emoji: null, ex: [{ id: 'a' }, { id: 'b' }] }] })
    mount()
    expect(tile('Saved routines').textContent).toContain('1 routine')
    act(() => { tile('Saved routines').click() })
    const [item] = menuSheet.mock.calls[0][0].items
    expect(item.label).toBe('Upper')
    expect(item.sub).toBe('2 exercises')
    item.onClick()
    expect(startFlow).toHaveBeenCalledWith(['r1'])
  })

  it('with no routines saved, the sheet points at Plan', () => {
    mount()
    act(() => { tile('Saved routines').click() })
    const [item] = menuSheet.mock.calls[0][0].items
    expect(item.label).toBe('Build a plan first')
    item.onClick()
    expect(nav).toHaveBeenCalledWith('/plan')
  })

  it('a session in progress replaces the tiles with Resume', () => {
    setS({ active: { id: 'x', name: 'Push day', entries: [] } })
    mount()
    expect(host.querySelector('.gen-tile')).toBeNull()
    expect(host.textContent).toContain('Push day (in progress)')
    expect(host.textContent).toContain('Resume')
    act(() => { host.querySelector('.today-row').click() })
    expect(nav).toHaveBeenCalledWith('/workout')
  })

  it('reads an open editor on a saved workout as an edit, not as a session in progress', () => {
    setS({ active: { id: 'x', name: 'Push day', entries: [], editingWorkoutId: 'w1' } })
    mount()
    expect(host.textContent).not.toContain('(in progress)')
    expect(host.querySelector('.today-row .tag').textContent).toBe('Edit')
  })
})

describe('Home — the week strip', () => {
  it('marks a day with one dot per session in its kind\'s colour, named after the first', () => {
    setS({ workouts: [
      { id: 'a', d: today, start: 1, name: 'Pull day', genType: 'pull', entries: [] },
      { id: 'b', d: today, start: 2, name: 'Mine', routineIds: ['r'], entries: [] },
    ] })
    mount()
    const dots = todayCell().querySelectorAll('.dot')
    expect(dots).toHaveLength(2)
    expect(dots[0].style.background).toBe('var(--purple)')
    expect(dots[1].style.background).toBe('var(--mint)')
    expect(todayCell().querySelector('.wk-name').textContent).toBe('Pull +1')
    expect(host.textContent).toContain('This week · 2 workouts')
  })

  it('a day opens the sessions logged on it', () => {
    setS({ workouts: [{ id: 'a', d: today, start: 1, name: 'Leg day', genType: 'legs', entries: [] }] })
    mount()
    act(() => { todayCell().click() })
    const sheet = useUI.getState().sheets.at(-1)
    const box = document.createElement('div')
    const r = createRoot(box)
    act(() => r.render(sheet.render(() => {})))
    expect(box.querySelector('.wrow').textContent).toBe('Leg day')
    act(() => r.unmount())
  })

  it('steps a week back and leaves this week\'s count behind', () => {
    setS({ workouts: [{ id: 'a', d: today, start: 1, name: 'Free', entries: [] }] })
    mount()
    act(() => { host.querySelector('button[aria-label="Previous week"]').click() })
    expect(host.textContent).not.toContain('This week')
    expect(host.textContent).toContain('0 workouts')
    expect(host.querySelector('.wday.today')).toBeNull()
  })
})
