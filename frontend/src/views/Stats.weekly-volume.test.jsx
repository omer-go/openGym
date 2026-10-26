// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MUSCLES } from '../lib/muscles.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import Stats from './Stats.jsx'

const NOW = new Date(2026, 8, 30, 12).getTime()
const press = { id: 'press', n: 'Press', primaries: ['chest'], secondaries: ['triceps'], custom: true }
const mocks = vi.hoisted(() => ({ S: null, bodyMaps: [] }))

vi.mock('../store/useStore.js', () => ({ useStore: selector => selector({ S: mocks.S }) }))
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../sheets.jsx', () => ({
  bwSheet: vi.fn(), goalSheet: vi.fn(), calendarSheet: vi.fn(), workoutDetailSheet: vi.fn(),
  exerciseHistorySheet: vi.fn(), WorkoutRow: () => React.createElement('div'), bwDeltaColor: () => '', weighInsSheet: vi.fn(),
}))
vi.mock('../components/Heatmap.jsx', () => ({ default: () => React.createElement('div') }))
vi.mock('../components/LineChart.jsx', () => ({ default: () => React.createElement('div') }))
vi.mock('../components/BodyMap.jsx', () => ({
  default: props => {
    mocks.bodyMaps.push(props)
    const sel = props.selected
    return React.createElement('div', { 'data-body-map': true, 'data-selected': Array.isArray(sel) ? sel.join(',') : sel || '' },
      ['chest', 'lower-back'].map(slug => React.createElement('button', { key: slug, 'aria-label': `map ${slug}`, onClick: () => props.onMuscle?.(slug) }, slug)))
  },
  BodyMapLegend: () => React.createElement('div', { 'data-body-map-legend': true }),
}))

const completed = (d, muscle, sets) => ({
  id: `${d}-${muscle}`, d, start: new Date(`${d}T12:00:00`).getTime(),
  entries: [{ id: `custom-${muscle}`, exercise: { primaries: [muscle], secondaries: [] }, sets: Array.from({ length: sets }, () => ({ done: true })) }],
})
const state = over => ({
  unit: 'kg', body: 'male', effort: 'rir', targetW: null, bodyweight: [], exWeights: {},
  routines: [{ id: 'push', name: 'Push', ex: [{ id: 'press', sets: 2 }] }],
  customEx: [press], week: { 1: ['push'] }, weekStart: 1, workouts: [], ...over,
})

let host, root
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  mocks.bodyMaps.length = 0
  mocks.S = state({ workouts: [completed('2026-09-30', 'biceps', 3)] })
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

const mount = () => act(() => root.render(<Stats />))
const comparison = () => host.querySelector('[data-weekly-volume-comparison]')
const button = label => host.querySelector(`button[aria-label="${label}"]`)
const groupBar = id => comparison().querySelector(`[data-group="${id}"]`)
const number = id => groupBar(id).querySelector('.cov-l b').textContent
const split = () => comparison().querySelector('[data-group-split]')
const regions = () => [...split().querySelectorAll('[data-group-region]')].map(r => [r.dataset.groupRegion, r.querySelector('.v').textContent])
const selected = () => host.querySelector('[data-body-map]').dataset.selected
const mapLoad = () => mocks.bodyMaps.at(-1).load
const missed = () => [...comparison().querySelectorAll('.mchip.miss')].map(item => item.textContent)
const isBefore = (first, second) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('Stats — muscle balance by group', () => {
  it('reads the last 7 days as done/goal per group, as the bar does, and colours the map by its group', () => {
    mocks.S = state({
      routines: [{ id: 'push', name: 'Push', ex: [{ id: 'press', sets: 12 }] }],
      workouts: [completed('2026-09-30', 'chest', 8), completed('2026-09-30', 'biceps', 3)],
    })
    mount()
    expect(button('Next week').disabled).toBe(true)
    expect(host.querySelector('[data-body-map-legend]')).toBeTruthy()
    expect(number('chest')).toBe('8/10')
    expect(number('triceps')).toBe('0/10')
    expect(number('biceps')).toBe('3/10')
    expect(groupBar('chest').querySelector('.cov-bar').getAttribute('aria-label')).toBe('Chest: 8 of 10 sets')
    expect(mapLoad()).toEqual(Object.fromEntries(MUSCLES.map(m => [m, m === 'chest' ? 8 : m === 'biceps' ? 3 : 0])))
    expect(comparison().querySelector('[data-muscle-volume]')).toBeNull()
  })

  it('gives every region of a group the group number, so the map and the bars agree', () => {
    mocks.S = state({ workouts: [completed('2026-09-30', 'upper-back', 6), completed('2026-09-30', 'lower-back', 4)] })
    mount()
    expect(number('back')).toBe('7/10')
    expect(mapLoad()['upper-back']).toBe(7)
    expect(mapLoad()['lower-back']).toBe(7)
    expect(mapLoad().trapezius).toBe(7)
  })

  it('opens a group from its bar: the map highlights its regions and the split adds up', () => {
    mocks.S = state({ workouts: [completed('2026-09-30', 'upper-back', 6), completed('2026-09-30', 'lower-back', 4)] })
    mount()
    expect(split()).toBeNull()
    expect(groupBar('back').getAttribute('role')).toBe('button')
    act(() => groupBar('back').click())
    expect(selected()).toBe('upper-back,lower-back,trapezius')
    expect(groupBar('back').getAttribute('aria-pressed')).toBe('true')
    expect(split().dataset.groupSplit).toBe('back')
    expect(split().querySelector('.mrow .v').textContent).toBe('7 sets')
    expect(regions()).toEqual([['upper-back', '6'], ['lower-back', '1'], ['trapezius', '0']])
    act(() => groupBar('back').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(selected()).toBe('')
    expect(split()).toBeNull()
  })

  it('opens the same group from a region on the map', () => {
    mocks.S = state({ workouts: [completed('2026-09-30', 'lower-back', 4)] })
    mount()
    act(() => button('map lower-back').click())
    expect(selected()).toBe('upper-back,lower-back,trapezius')
    expect(groupBar('back').classList.contains('sel')).toBe(true)
    act(() => button('map chest').click())
    expect(selected()).toBe('chest')
    expect(split().dataset.groupSplit).toBe('chest')
    expect(split().querySelector('[data-group-region]')).toBeNull()  // one region: no region rows
  })

  it('shows a planned group as done of planned when opened', () => {
    mocks.S = state({
      routines: [{ id: 'push', name: 'Push', ex: [{ id: 'press', sets: 12 }] }],
      workouts: [completed('2026-09-30', 'chest', 8)],
    })
    mount()
    act(() => groupBar('chest').click())
    expect(split().querySelector('.mrow .v').textContent).toBe('8 of 12 planned sets')
  })

  it('lists the groups the period missed, after the bars', () => {
    mount()
    expect(missed()).toContain('Triceps')
    expect(missed()).toContain('Back')
    expect(missed()).not.toContain('Biceps')
    expect(isBefore(groupBar('calves'), comparison().querySelector('.mchip.miss'))).toBe(true)
  })

  it('says every group got work when none is missed', () => {
    mocks.S = state({ workouts: ADD_GROUPS.map(g => completed('2026-09-30', g.m[0], 1)) })
    mount()
    expect(missed()).toEqual([])
    expect(comparison().textContent).toContain('Every muscle group got some work in this period.')
  })

  it('reads the last 7 days back from today, across the week start, not the calendar week', () => {
    // Wednesday the 30th, Monday-first: the Sunday before is last calendar week but within 7 days
    mocks.S = state({
      workouts: [completed('2026-09-27', 'biceps', 1), completed('2026-09-20', 'quadriceps', 4)],
    })
    mount()
    expect(comparison().dataset.back).toBe('0')
    expect(host.querySelector('[data-period]').textContent).toContain('–')
    expect(number('biceps')).toBe('1/10')
    expect(number('quads')).toBe('0/10')
    expect(mapLoad().quadriceps).toBe(0)
    expect(missed()).toContain('Quads')
  })

  it('steps back 7 days at a time, without the plan, which is the one in place now', () => {
    mocks.S = state({
      routines: [{ id: 'push', name: 'Push', ex: [{ id: 'press', sets: 12 }] }],
      workouts: [completed('2026-09-30', 'chest', 8), completed('2026-09-20', 'quadriceps', 4)],
    })
    mount()
    act(() => groupBar('chest').click())
    expect(split().querySelector('.mrow .v').textContent).toBe('8 of 12 planned sets')
    act(() => button('Previous week').click())
    expect(comparison().dataset.back).toBe('1')
    expect(host.querySelector('[data-period] span').textContent).toContain('17')
    expect(selected()).toBe('')
    expect(number('quads')).toBe('4/10')
    expect(number('chest')).toBe('0/10')
    act(() => groupBar('chest').click())
    expect(split().querySelector('.mrow .v').textContent).toBe('not trained')
    act(() => button('Next week').click())
    expect(number('chest')).toBe('8/10')
    expect(button('Next week').disabled).toBe(true)
  })

  it('keeps the map, bars and empty state for an empty 7 days', () => {
    mocks.S = state({ workouts: [completed('2026-09-10', 'biceps', 3)] })
    mount()
    expect(host.querySelector('[data-body-map-legend]')).toBeTruthy()
    expect(Object.values(mapLoad()).every(v => v === 0)).toBe(true)
    expect(groupBar('chest')).toBeTruthy()
    expect(comparison().textContent).toContain('Nothing logged in these 7 days. Your last workout before them was on')
    // the button steps back to the week that holds it
    const jump = [...comparison().querySelectorAll('button')].find(b => b.textContent === 'Show that week')
    act(() => jump.click())
    expect(Object.values(mapLoad()).some(v => v > 0)).toBe(true)
    expect(comparison().querySelector('[data-empty-period]')).toBeNull()
  })

  it('says so plainly when no workout comes before an empty 7 days', () => {
    mocks.S = state({ workouts: [] })
    mount()
    expect(comparison().textContent).toContain('No workouts in this period yet.')
    expect(comparison().textContent).not.toContain('Show that week')
  })

  it('leaves a group the plan gives no credit out of the planned numbers', () => {
    const zeroPress = { id: 'zero-press', n: 'Zero press', muscleWeights: { chest: 1, biceps: 0 }, custom: true }
    const plannedOnly = { id: 'planned-only', n: 'Planned only', muscleWeights: { triceps: 1 }, custom: true }
    mocks.S = state({
      customEx: [zeroPress, plannedOnly],
      routines: [{
        id: 'zero-plan', name: 'Zero plan',
        ex: [{ id: zeroPress.id, sets: 2 }, { id: plannedOnly.id, sets: 1 }],
      }],
      week: { 1: ['zero-plan'] },
      workouts: [{
        id: 'zero-workout', d: '2026-09-30', start: new Date('2026-09-30T12:00:00').getTime(),
        entries: [{ id: zeroPress.id, exercise: zeroPress, sets: [{ done: true }, { done: true }] }],
      }],
    })
    mount()
    const opened = id => { act(() => groupBar(id).click()); return split().querySelector('.mrow .v').textContent }
    expect(opened('chest')).toBe('2 of 2 planned sets')
    expect(opened('triceps')).toBe('0 of 1 planned sets')
    expect(opened('biceps')).toBe('not trained')
  })
})
