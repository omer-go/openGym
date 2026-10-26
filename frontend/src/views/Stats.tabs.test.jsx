// @vitest-environment happy-dom
// Stats is three tabs under one header: Muscles first (the body map, the muscle-group bars and the
// planned weekly volume), then Progress (charts) and Activity (tiles, heatmap, recent workouts).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ S: null }))
vi.mock('../store/useStore.js', () => ({ useStore: selector => selector({ S: mocks.S }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  bwSheet: vi.fn(), goalSheet: vi.fn(), calendarSheet: vi.fn(), workoutDetailSheet: vi.fn(),
  exerciseHistorySheet: vi.fn(), WorkoutRow: () => React.createElement('div'), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => React.createElement('div', { 'data-heatmap': '' }) }))
vi.mock('../components/LineChart.jsx', () => ({ default: () => React.createElement('div') }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => React.createElement('div', { 'data-body-map': '' }), BodyMapLegend: () => null }))

import Stats from './Stats.jsx'

const BENCH = '0025'
const today = new Date().toISOString().slice(0, 10)
const workout = { id: 'w1', d: today, start: Date.now() - 3600000, name: 'Push',
  entries: [{ id: BENCH, target: { sets: 4, reps: 8 }, sets: Array.from({ length: 4 }, () => ({ w: 60, r: 8, done: true })) }] }
const state = over => ({
  unit: 'kg', body: 'male', effort: 'none', targetW: null, bodyweight: [], exWeights: {}, workouts: [workout],
  routines: [], customEx: [], week: {}, weekStart: 1, queue: null, ...over,
})

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); window.location.hash = '' })

const tabs = () => [...host.querySelector('.stats-tabs').querySelectorAll('button')]
const tab = name => tabs().find(b => b.textContent === name)
const titles = () => [...host.querySelectorAll('.card h2')].map(h => h.textContent)
const render = () => act(() => root.render(<Stats />))

describe('Stats tabs', () => {
  it('opens on Muscles: the body map and the muscle-group bars, nothing else', () => {
    window.location.hash = '#/stats?tab=muscles'
    mocks.S = state()
    render()
    expect(tabs().map(b => b.textContent)).toEqual(['Muscles', 'Progress', 'Activity'])
    expect(tab('Muscles').getAttribute('aria-pressed')).toBe('true')
    expect(host.querySelector('[data-body-map]')).toBeTruthy()
    expect(titles().some(x => x.startsWith('Exercise progress') || x.startsWith('Activity'))).toBe(false)
    // four bench sets this week: 4 for chest, 0.4 × 4 for shoulders and triceps
    const bars = host.querySelector('[data-group-sets]')
    const chest = [...bars.querySelectorAll('.cov-g')].find(g => g.textContent.startsWith('Chest'))
    expect(chest.querySelector('.cov-l b').textContent).toBe('4/10')
  })

  it('moves the charts to Progress and the heatmap and recent workouts to Activity', () => {
    window.location.hash = '#/stats?tab=muscles'
    mocks.S = state()
    render()
    act(() => tab('Progress').click())
    expect(titles()).toEqual(expect.arrayContaining(['Body weight', 'Exercise progress', 'Structural balance', 'Body measurements']))
    expect(host.querySelector('[data-body-map]')).toBeNull()
    act(() => tab('Activity').click())
    expect(host.querySelector('[data-heatmap]')).toBeTruthy()
    expect(host.querySelector('.tiles')).toBeTruthy()
    expect(titles()).not.toContain('Exercise progress')
  })

  it('says what fills in after a first workout on Muscles and Activity, when there is none', () => {
    window.location.hash = '#/stats?tab=muscles'
    mocks.S = state({ workouts: [] })
    render()
    expect(host.textContent).toContain('Finish your first workout and your muscle balance will show up here.')
    act(() => tab('Activity').click())
    expect(host.querySelector('[data-activity-empty]')).toBeTruthy()
    mocks.S = state()
    render()
    expect(host.querySelector('[data-activity-empty]')).toBeNull()
  })

  it('tells why Fatigue is all rested after a break, with the last workout', () => {
    window.location.hash = '#/stats?tab=muscles'
    const old = { ...workout, d: '2026-01-05', start: new Date('2026-01-05T12:00:00').getTime() }
    mocks.S = state({ workouts: [old] })
    render()
    act(() => [...host.querySelectorAll('button')].find(b => b.textContent === 'Fatigue').click())
    expect(host.querySelector('[data-fatigue-empty]').textContent).toContain('Your last workout was on')
    mocks.S = state()
    render()
    expect(host.querySelector('[data-fatigue-empty]')).toBeNull()
  })

  it('comes back to the tab you were on, and Plan’s weekly-volume link opens Muscles', () => {
    mocks.S = state()
    render()
    act(() => tab('Activity').click())
    act(() => root.unmount())
    root = createRoot(host)
    render()
    expect(tab('Activity').getAttribute('aria-pressed')).toBe('true')
    act(() => root.unmount())
    root = createRoot(host)
    window.location.hash = '#/stats?focus=weekly-volume'
    render()
    expect(tab('Muscles').getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps the All/Hard toggle in every 7 days, so the card does not jump; it only works where it can', () => {
    window.location.hash = '#/stats?tab=muscles'
    const rated = { ...workout, entries: [{ ...workout.entries[0], sets: workout.entries[0].sets.map(x => ({ ...x, rir: 1 })) }] }
    mocks.S = state({ workouts: [rated] })
    render()
    const card = host.querySelector('[data-body-map]').closest('.card')
    const toggle = () => [...card.querySelectorAll('button')].find(b => b.textContent === 'All' && !b.closest('.seg'))
    expect(toggle().disabled).toBe(false)
    act(() => card.querySelector('button[aria-label="Previous week"]').click())
    expect(toggle().disabled).toBe(true) // nothing rated in the 7 days before
    act(() => card.querySelector('button[aria-label="Next week"]').click())
    expect(toggle().disabled).toBe(false)
    mocks.S = state() // no ratings to read
    render()
    expect(toggle().disabled).toBe(true)
  })

  it('steps back and forth 7 days at a time, laid out the same even with nothing in it', () => {
    window.location.hash = '#/stats?tab=muscles'
    const old = { ...workout, id: 'old', d: '2020-01-06', start: new Date('2020-01-06T12:00:00').getTime() }
    mocks.S = state({ workouts: [old] }) // nothing in the last 7 days
    render()
    const card = host.querySelector('[data-body-map]').closest('.card')
    const arrow = label => card.querySelector(`[data-period] button[aria-label="${label}"]`)
    const dates = () => card.querySelector('[data-period] span').textContent
    // no 30d, 90d or All: sets per muscle are a weekly measure
    expect([...card.querySelectorAll('.seg button')].map(b => b.textContent)).not.toContain('30d')
    expect(arrow('Next week').disabled).toBe(true)
    const today = dates()
    expect(today).toContain(' – ')
    act(() => arrow('Previous week').click())
    expect(dates()).not.toBe(today)
    expect(arrow('Next week').disabled).toBe(false)
    expect(card.querySelector('[data-body-map]')).toBeTruthy()
    expect(card.querySelector('[data-group-sets]')).toBeTruthy()
    act(() => arrow('Next week').click())
    expect(dates()).toBe(today)
  })

  it('gives Fatigue and Strength the same block above the map, held invisibly, so the map stays put', () => {
    window.location.hash = '#/stats?tab=muscles'
    mocks.S = state()
    render()
    const card = host.querySelector('[data-body-map]').closest('.card')
    const view = name => [...card.querySelector('.seg-range').querySelectorAll('button')].find(b => b.textContent === name)
    for (const name of ['Fatigue', 'Strength']) {
      act(() => view(name).click())
      const ghost = card.querySelector('[inert]')
      expect(ghost, name).toBeTruthy()
      expect(ghost.style.visibility).toBe('hidden')
      expect(ghost.querySelector('[data-period]'), name).toBeTruthy()
      expect(ghost.nextElementSibling.querySelector('h2').textContent).toBe(name)
    }
    act(() => view('Muscle balance').click())
    expect(card.querySelector('[inert]')).toBeNull()
  })
})
