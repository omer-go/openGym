// @vitest-environment happy-dom
// A cardio exercise's settings in mph, the only unit: the speed stepper reads, steps and saves mph.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { EXIDX } from './lib/exercises.js'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { exConfigSheet } from './sheets.jsx'

const mounted = []
function open(settings, existing) {
  useStore.setState({ S: { ...structuredClone(DEF), ...settings }, user: null })
  const onSave = vi.fn()
  exConfigSheet(EXIDX['2138'], existing, onSave, null, null)
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  const speed = [...host.querySelectorAll('.stp-w')].find(w => w.querySelector('.stp-l')?.textContent.startsWith('Speed'))
  const save = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')
  return { speed, save, onSave }
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  useUI.setState({ sheets: [] })
  document.body.innerHTML = ''
})
afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

describe('cardio settings speed', () => {
  it('reads, steps and saves mph', () => {
    const { speed, save, onSave } = open({ unit: 'lb' }, { sets: 1, min: 20, speed: 5 })
    expect(speed.querySelector('.stp-l').textContent).toBe('Speed (mph)')
    expect(speed.querySelector('input').value).toBe('5')
    act(() => speed.querySelector('button[aria-label="Increase"]').click())
    expect(speed.querySelector('input').value).toBe('5.5')
    act(() => save.click())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ min: 20, speed: 5.5 }))
  })

  it('is mph even for an old kg profile', () => {
    const { speed } = open({ unit: 'kg', speedUnit: 'kmh' }, { sets: 1, min: 20, speed: 8 })
    expect(speed.querySelector('.stp-l').textContent).toBe('Speed (mph)')
    expect(speed.querySelector('input').value).toBe('8')
  })
})
