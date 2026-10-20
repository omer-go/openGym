// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ sheets: [] }))
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ openSheet: render => { mocks.sheets.push(render); return { close: vi.fn() } } })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})

import { durationSheet } from './DurationPicker.jsx'

let host, root
beforeEach(() => {
  mocks.sheets = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

const open = props => {
  const onDone = vi.fn(), close = vi.fn()
  durationSheet({ title: 'Rest timer', value: 105, off: 'Off', onDone, ...props })
  act(() => root.render(mocks.sheets.at(-1)(close)))
  return { onDone, close }
}
const shown = () => host.querySelector('.dp-v').textContent
const chip = text => [...host.querySelectorAll('.wgrid .chip')].find(b => b.textContent === text)
const done = () => act(() => { [...host.querySelectorAll('button')].find(b => b.textContent === 'Done').click() })
// React tracks an input's value itself, so set it the way a keystroke does.
const type = (el, text) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, text)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('durationSheet', () => {
  it('shows the time big, the presets as chips with the odd value among them, and Done hands it back', () => {
    const { onDone, close } = open()
    expect(host.querySelector('h3').textContent).toBe('Rest timer')
    expect(shown()).toBe('1:45')
    expect(chip('1:45').getAttribute('aria-pressed')).toBe('true')
    act(() => chip('20s').click())
    expect(shown()).toBe('20s')
    done()
    expect(close).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalledWith(20)
  })

  it('steps by 5 s under a minute and 15 s above', () => {
    const { onDone } = open({ value: 60 })
    act(() => host.querySelector('button[aria-label="15 seconds longer"]').click())
    expect(shown()).toBe('1:15')
    act(() => host.querySelector('button[aria-label="15 seconds shorter"]').click())
    act(() => host.querySelector('button[aria-label="5 seconds shorter"]').click())
    done()
    expect(onDone).toHaveBeenCalledWith(55)
  })

  it('a tap on the time opens a field; what is typed counts at Done, even with the field still open', () => {
    const { onDone } = open()
    act(() => host.querySelector('.dp-v').click())
    const input = host.querySelector('input.dp-in')
    expect(input.value).toBe('105')
    type(input, '1.30')
    done()
    expect(onDone).toHaveBeenCalledWith(90)
  })

  it('Enter keeps a typed value, clamped to the range; nonsense keeps the old one', () => {
    const { onDone } = open({ max: 300 })
    act(() => host.querySelector('.dp-v').click())
    type(host.querySelector('input.dp-in'), '600')
    act(() => { host.querySelector('input.dp-in').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(shown()).toBe('5:00')
    act(() => host.querySelector('.dp-v').click())
    type(host.querySelector('input.dp-in'), 'abc')
    done()
    expect(onDone).toHaveBeenCalledWith(300)
  })

  it('reads 0 as its off choice, a full-width chip of its own', () => {
    const { onDone } = open({ value: 0 })
    expect(shown()).toBe('Off')
    expect(host.querySelector('.dp-off').getAttribute('aria-pressed')).toBe('true')
    act(() => chip('30s').click())
    act(() => host.querySelector('.dp-off').click())
    done()
    expect(onDone).toHaveBeenCalledWith(0)
  })
})
