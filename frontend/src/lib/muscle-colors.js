// One colour per muscle group, so the exercises of a workout tell apart at a glance: the
// one-tap setup's pills, Add exercise's groups, the exercise rows (their thumbnail's ring) and
// the workout's exercise cards. The groups are Add exercise's (lib/add-exercise.js ADD_GROUPS)
// plus Cardio and Stretching (lib/activities.js); an exercise takes its primary muscle's group.
// Colours are CSS tokens (--mg-*, index.css), set for the dark and the light theme.
import { groupOfMuscle } from './add-exercise.js'
import { activityOf } from './activities.js'
import { primaryMuscleOf } from './strength-exercises.js'

export const GROUP_COLOR_IDS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
  'quads', 'hamstrings', 'glutes', 'calves', 'cardio', 'stretching',
]

/** The CSS colour of a group id ('chest', 'cardio'…), or null for anything else. */
export const groupColor = id => (GROUP_COLOR_IDS.includes(id) ? `var(--mg-${id})` : null)

// The library is long and rows re-render often: remember each exercise object's group.
const memo = new WeakMap()

/** The colour group of an exercise: its activity (cardio, stretching), else its primary muscle's. */
export function groupOfExercise(ex) {
  if (!ex || typeof ex !== 'object') return null
  if (memo.has(ex)) return memo.get(ex)
  const act = activityOf(ex)
  const id = act ? act.group : groupOfMuscle(primaryMuscleOf(ex)?.slug)?.id || null
  memo.set(ex, id)
  return id
}

/** The CSS colour of a body-map muscle's group ('upper-back' → Back's), or null. */
export const muscleColor = slug => groupColor(groupOfMuscle(slug)?.id)

/** The CSS colour of an exercise's group, or null when it has none. */
export const exerciseColor = ex => groupColor(groupOfExercise(ex))

/** A style setting `--mc` (what the .mg rules colour with), or undefined for no colour. */
export const mcStyle = color => (color ? { '--mc': color } : undefined)
