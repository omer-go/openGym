import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { ACTIVITY_GROUPS } from './activities.js'
import { GROUP_COLOR_IDS, groupColor, groupOfExercise, exerciseColor, muscleColor, mcStyle } from './muscle-colors.js'

describe('muscle group colours', () => {
  it('has one for every Add exercise group and activity, and nothing else', () => {
    expect([...GROUP_COLOR_IDS].sort()).toEqual([...ADD_GROUPS, ...ACTIVITY_GROUPS].map(g => g.id).sort())
    expect(groupColor('chest')).toBe('var(--mg-chest)')
    expect(groupColor('stretching')).toBe('var(--mg-stretching)')
    expect(groupColor('nope')).toBeNull()
    expect(groupColor(null)).toBeNull()
  })

  it('gives an exercise its primary muscle\'s group', () => {
    expect(groupOfExercise(EXIDX['1029'])).toBe('chest')       // lever pec deck fly
    expect(groupOfExercise(EXIDX['1013'])).toBe('back')        // band underhand pulldown
    expect(groupOfExercise(EXIDX['1050'])).toBe('calves')      // smith calf raise
    expect(groupOfExercise(EXIDX['1032'])).toBe('biceps')      // lever alternate biceps curl
    expect(exerciseColor(EXIDX['1029'])).toBe('var(--mg-chest)')
  })

  it('puts cardio and stretches in their own group, whatever they work', () => {
    expect(groupOfExercise(EXIDX['1160'])).toBe('cardio')      // burpee
    expect(groupOfExercise(EXIDX['1051'])).toBe('stretching')  // cat stretch
  })

  it('colours a custom exercise by the muscles it was given', () => {
    expect(groupOfExercise({ id: 'c_1', n: 'Mine', primaries: ['triceps'] })).toBe('triceps')
  })

  it('colours a single muscle by the group it belongs to', () => {
    expect(muscleColor('upper-back')).toBe('var(--mg-back)')
    expect(muscleColor('trapezius')).toBe('var(--mg-back)')
    expect(muscleColor('adductors')).toBe('var(--mg-glutes)')
    expect(muscleColor('neck')).toBeNull()
  })

  it('leaves out what has no group', () => {
    expect(exerciseColor(null)).toBeNull()
    expect(exerciseColor({ id: 'c_2', n: 'Nothing' })).toBeNull()
    expect(mcStyle(null)).toBeUndefined()
    expect(mcStyle('var(--mg-abs)')).toEqual({ '--mc': 'var(--mg-abs)' })
  })
})
