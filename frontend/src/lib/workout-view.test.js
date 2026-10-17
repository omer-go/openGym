import { describe, it, expect } from 'vitest'
import { savedWorkoutView, pickWorkoutView, listByDefault } from './workout-view.js'

describe('saved workout layout', () => {
  it('defaults to list', () => {
    expect(savedWorkoutView({})).toBe('list')
    expect(savedWorkoutView(null)).toBe('list')
    expect(savedWorkoutView({ workoutView: 'nope' })).toBe('list')
    expect(savedWorkoutView({ workoutView: 'compact' })).toBe('compact')
  })
  it('remembers a pick, and applies it to the running session', () => {
    const s = { workoutView: 'list', active: { workoutView: 'list' } }
    pickWorkoutView(s, 'cards')
    expect(savedWorkoutView(s)).toBe('cards')
    expect(s.active.workoutView).toBe('cards')
    const t = { active: null }
    pickWorkoutView(t, 'focus')
    expect(savedWorkoutView(t)).toBe('focus')
  })
  it('moves a leftover cards default to the list once, and keeps a picked cards', () => {
    const old = { workoutView: 'cards' }
    expect(listByDefault(old)).toBe(true)
    expect(old.workoutView).toBe('list')
    expect(listByDefault(old)).toBe(false)
    const picked = { workoutView: 'list' }
    pickWorkoutView(picked, 'cards')
    expect(listByDefault(picked)).toBe(false)
    expect(picked.workoutView).toBe('cards')
    const compact = { workoutView: 'compact' }
    listByDefault(compact)
    expect(compact.workoutView).toBe('compact')
  })
})
