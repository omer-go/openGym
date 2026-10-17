// The saved workout layout: list by default, and whatever was last picked (in Settings or the
// workout's ⋯ menu) after that, so the next workout opens the same way.
export const WORKOUT_VIEWS = ['cards', 'list', 'compact', 'focus']

export const savedWorkoutView = S => (WORKOUT_VIEWS.includes(S?.workoutView) ? S.workoutView : 'list')

/** Save `v` as the layout every workout opens in, the running one too. Mutates `s` (in an update). */
export function pickWorkoutView(s, v) {
  s.workoutView = v
  s.workoutViewSet = true
  if (s.active) s.active.workoutView = v
}

/**
 * A profile from when cards were the default, never picked since, still holds 'cards': it moves
 * to the list once. `workoutViewSet` marks that done (or a pick made), so a later pick of cards
 * stays. Mutates `s`; returns whether anything changed.
 */
export function listByDefault(s) {
  if (s.workoutViewSet) return false
  if (s.workoutView === 'cards') s.workoutView = 'list'
  s.workoutViewSet = true
  return true
}
