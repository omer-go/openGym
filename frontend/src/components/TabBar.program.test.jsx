// @vitest-environment happy-dom
// One plan in charge: while a program runs, Start begins its next day, never the weekday's
// routine the paused schedule would have started (lib/program-span.js).
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const startGenerated = vi.fn()
const navTo = vi.fn()
vi.mock('../sheets.jsx', () => ({ startGenerated: (...a) => startGenerated(...a) }))
vi.mock('react-router-dom', () => ({
  useNavigate: () => navTo,
  useLocation: () => ({ pathname: '/home' }),
}))

import TabBar from './TabBar.jsx'
import { DEF, useStore } from '../store/useStore.js'
import { todayISO } from '../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalS, originalUser
const routine = { id: 'r1', name: 'Push A', ex: [{ id: 'bench' }] }
const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, ['r1']]))

beforeEach(() => {
  startGenerated.mockClear(); navTo.mockClear()
  const store = useStore.getState()
  originalS = store.S
  originalUser = store.user
  useStore.setState({ S: { ...JSON.parse(JSON.stringify(DEF)), routines: [routine], week: everyDay }, user: { id: 1, name: 'test' } })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  useStore.setState({ S: originalS, user: originalUser })
})

const tapStart = () => act(() => { host.querySelector('#tabbar .start').click() })

describe('Start while a program runs', () => {
  it('starts the scheduled routine without a program', () => {
    const onStart = vi.fn()
    act(() => { root.render(<TabBar onStart={onStart} />) })
    tapStart()
    expect(onStart).toHaveBeenCalledWith(['r1'])
    expect(startGenerated).not.toHaveBeenCalled()
  })

  it("starts the program's next day instead of the weekday's routine", () => {
    useStore.getState().update(s => { s.program = { template: 'ppl-3', days: ['push', 'pull', 'legs'], startedAt: todayISO(), weeks: 8 } }, false)
    const onStart = vi.fn()
    act(() => { root.render(<TabBar onStart={onStart} />) })
    tapStart()
    expect(startGenerated).toHaveBeenCalledWith('push', 0)
    expect(onStart).not.toHaveBeenCalled()
  })
})
