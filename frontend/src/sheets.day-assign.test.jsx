// @vitest-environment happy-dom
// Plan → Schedule → a weekday: one picker for the whole day. A tap puts that one routine on the day
// and closes. "Train several together" turns the rows into ticks for a combined day (in the order
// tapped) with a Done, and a day that is combined already opens that way. "Rest day" clears the
// day and closes. The weekday key is dropped rather than left as an empty list.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { dayAssignSheet } from './sheets.jsx'

const clone = v => JSON.parse(JSON.stringify(v))
let host, root

const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
}
const row = name => [...host.querySelectorAll('.item')].find(el => el.querySelector('.tt')?.textContent === name)
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const tap = el => { act(() => el.click()); if (useUI.getState().sheets.length) renderTop() }
const week = () => useStore.getState().S.week

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [], toastMsg: '' })
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  const S = clone(useStore.getState().S)
  S.routines = [
    { id: 'push', name: 'Push', emoji: null, ex: [{ id: '0025' }] },
    { id: 'core', name: 'Core', emoji: null, ex: [] },
  ]
  S.week = { 1: ['push'] }
  useStore.setState({ S, user: null })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('the weekday picker', () => {
  it('ticks what is on the day, and a tap puts just that routine on it and closes', () => {
    dayAssignSheet(1)
    renderTop()
    expect(host.querySelector('h3').textContent).toBe('Monday')
    expect(row('Push').getAttribute('aria-pressed')).toBe('true')
    expect(row('Core').getAttribute('aria-pressed')).toBe('false')
    tap(row('Core'))
    expect(week()[1]).toEqual(['core'])
    expect(useUI.getState().sheets.length).toBe(0)
  })

  it('Train several together ticks a combined day, takes one off again, and stays open until Done', () => {
    dayAssignSheet(1)
    renderTop()
    tap(button('Train several together'))
    tap(row('Core'))
    expect(week()[1]).toEqual(['push', 'core'])
    expect(useUI.getState().sheets.length).toBe(1)
    tap(row('Push'))
    tap(row('Core'))
    expect(week()).not.toHaveProperty('1')
    expect(row('Rest day').querySelector('.menu-on').className).toContain('is-on')
    tap(button('Done'))
    expect(useUI.getState().sheets.length).toBe(0)
  })

  it('a combined day opens with its ticks, not one tap away from losing one', () => {
    useStore.getState().update(s => { s.week[1] = ['push', 'core'] })
    dayAssignSheet(1)
    renderTop()
    expect(button('Done')).toBeTruthy()
    tap(row('Core'))
    expect(week()[1]).toEqual(['push'])
  })

  it('Rest day clears a combined day and closes', () => {
    useStore.getState().update(s => { s.week[1] = ['push', 'core'] })
    dayAssignSheet(1)
    renderTop()
    tap(row('Rest day'))
    expect(week()).not.toHaveProperty('1')
    expect(useUI.getState().sheets.length).toBe(0)
  })
})
