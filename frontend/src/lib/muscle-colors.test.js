import { describe, expect, it } from 'vitest'
import { EXIDX } from './exercises.js'
import { ADD_GROUPS } from './add-exercise.js'
import { ACTIVITY_GROUPS } from './activities.js'
import { GROUP_COLOR_IDS, groupColor, groupOfExercise, exerciseColor, muscleColor, muscleTagsOf, mcStyle } from './muscle-colors.js'

describe('muscle group colours', () => {
  it('has one for every Add exercise group, and none for cardio or stretching', () => {
    expect([...GROUP_COLOR_IDS].sort()).toEqual(ADD_GROUPS.map(g => g.id).sort())
    expect(groupColor('chest')).toBe('var(--mg-chest)')
    for (const g of ACTIVITY_GROUPS) expect(groupColor(g.id)).toBeNull()
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

  it('puts cardio and stretches in their own group, whatever they work, and leaves them uncoloured', () => {
    expect(groupOfExercise(EXIDX['1160'])).toBe('cardio')      // burpee
    expect(groupOfExercise(EXIDX['1051'])).toBe('stretching')  // cat stretch
    expect(exerciseColor(EXIDX['1160'])).toBeNull()
    expect(exerciseColor(EXIDX['1051'])).toBeNull()
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

  it('names the group, and the target muscle only when it says more', () => {
    expect(muscleTagsOf(EXIDX['1032'])).toEqual({ group: 'Biceps', color: 'var(--mg-biceps)', muscle: null })
    expect(muscleTagsOf(EXIDX['1029'])).toEqual({ group: 'Chest', color: 'var(--mg-chest)', muscle: 'pectorals' })
    const pulldown = muscleTagsOf(EXIDX['1013'])
    expect(pulldown.group).toBe('Back')
    expect(pulldown.color).toBe('var(--mg-back)')
    expect(pulldown.muscle).toBe('lats')
    expect(muscleTagsOf(EXIDX['1051'])).toMatchObject({ group: 'Stretching', color: null })
    expect(muscleTagsOf({ id: 'c_3', n: 'Mine', primaries: ['adductors'], tg: 'adductors' }))
      .toEqual({ group: 'Glutes & hips', color: 'var(--mg-glutes)', muscle: 'Adductors' })
    expect(muscleTagsOf({ id: 'c_4', n: 'Nothing' })).toEqual({ group: null, color: null, muscle: null })
  })

  it('leaves out what has no group', () => {
    expect(exerciseColor(null)).toBeNull()
    expect(exerciseColor({ id: 'c_2', n: 'Nothing' })).toBeNull()
    expect(mcStyle(null)).toBeUndefined()
    expect(mcStyle('var(--mg-abs)')).toEqual({ '--mc': 'var(--mg-abs)' })
  })
})
