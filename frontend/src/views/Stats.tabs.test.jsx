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
    expect(chest.querySelector('.cov-l b').textContent).toBe('4')
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

  it('keeps the All/Hard toggle in every period, so the card does not jump; it only works where it can', () => {
    window.location.hash = '#/stats?tab=muscles'
    const rated = { ...workout, entries: [{ ...workout.entries[0], sets: workout.entries[0].sets.map(x => ({ ...x, rir: 1 })) }] }
    mocks.S = state({ workouts: [rated] })
    render()
    const card = host.querySelector('[data-body-map]').closest('.card')
    const toggle = () => [...card.querySelectorAll('button')].find(b => b.textContent === 'All' && !b.closest('.seg'))
    const range = name => [...card.querySelectorAll('.seg button')].find(b => b.textContent === name)
    expect(toggle().disabled).toBe(true) // a week is held against the plan, which counts every set
    act(() => range('30d').click())
    expect(toggle().disabled).toBe(false)
    mocks.S = state() // no ratings to read
    render()
    expect(toggle().disabled).toBe(true)
  })

  it('lays every period out the same: the period row, the map and the bars, even with nothing in it', () => {
    window.location.hash = '#/stats?tab=muscles'
    const old = { ...workout, id: 'old', d: '2020-01-06', start: new Date('2020-01-06T12:00:00').getTime() }
    mocks.S = state({ workouts: [old] }) // nothing in the last 90 days
    render()
    const card = host.querySelector('[data-body-map]').closest('.card')
    const range = name => [...card.querySelectorAll('.seg button')].find(b => b.textContent === name)
    for (const name of ['Week', '30d', '90d', 'All']) {
      act(() => range(name).click())
      const row = card.querySelector('[data-period]')
      expect(row, name).toBeTruthy()
      expect(row.querySelectorAll('button').length).toBe(2)
      expect(card.querySelector('[data-body-map]'), name).toBeTruthy()
      expect(card.querySelector('[data-group-sets]'), name).toBeTruthy()
    }
    // a longer period names its dates; its arrows only hold the space
    expect(card.querySelector('[data-period] span').textContent).toContain(' – ')
    expect(card.querySelector('[data-period] button').style.visibility).toBe('hidden')
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
