// One colour per muscle group, so the exercises of a workout tell apart at a glance: the
// one-tap setup's pills, Add exercise's groups, the exercise rows (their thumbnail's ring) and
// the workout's exercise cards. The groups are Add exercise's (lib/add-exercise.js ADD_GROUPS);
// an exercise takes its primary muscle's group. Cardio and stretches (lib/activities.js) keep
// their own group but get no colour, so the muscle groups have more hues to spread across.
// Colours are CSS tokens (--mg-*, index.css), set for the dark and the light theme.
import { ADD_GROUPS, groupOfMuscle } from './add-exercise.js'
import { ACTIVITY_GROUPS, activityOf } from './activities.js'
import { MUSCLE_NAME, muscleWeightsOf } from './muscles.js'
import { smOf } from './exercises.js'
import { primaryMuscleOf } from './strength-exercises.js'

export const GROUP_COLOR_IDS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs',
  'quads', 'hamstrings', 'glutes', 'calves',
]

/** The CSS colour of a muscle group id ('chest', 'quads'…), or null for anything else. */
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

/** What an exercise's muscle chips say: its group's name and colour, then its target muscle only
 *  when that adds something to the group's name ('Delts' under Shoulders, nothing under Chest),
 *  then up to three secondary muscles it trains, leaving out the ones already named.
 *  Names are English i18n keys. */
export function muscleTagsOf(ex) {
  const id = groupOfExercise(ex)
  const group = (id && [...ADD_GROUPS, ...ACTIVITY_GROUPS].find(g => g.id === id)?.n) || null
  const raw = ex?.tg || ex?.bp
  const muscle = raw ? MUSCLE_NAME[raw] || raw : null
  const shown = muscle && muscle.toLowerCase() !== group?.toLowerCase() ? muscle : null
  // A secondary weighted 0 is listed for the record but not trained (muscles.js).
  const weights = muscleWeightsOf(ex || {})
  const named = new Set([group, shown].filter(Boolean).map(n => n.toLowerCase()))
  const secondaries = []
  for (const s of ex?.secondaries?.length ? ex.secondaries : smOf(ex || {})) {
    const n = MUSCLE_NAME[s] || s
    if (weights[s] === 0 || named.has(n.toLowerCase())) continue
    named.add(n.toLowerCase())
    secondaries.push(n)
  }
  return { group, color: groupColor(id), muscle: shown, secondaries: secondaries.slice(0, 3) }
}

/** A style setting `--mc` (what the .mg rules colour with), or undefined for no colour. */
export const mcStyle = color => (color ? { '--mc': color } : undefined)
