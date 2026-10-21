// Exercises you asked not to be suggested: ones you dislike, or whose kit your gym lacks
// without that being worth an equipment profile. One-tap workouts, the quick swap and the Add
// exercise shortlists pass them over (`suggestable`); search still finds them, and routines that
// already hold one keep it.
//
// Stored as a flat id list in synced state (S.skipEx), the way favourites are (lib/favourites.js):
// catalogue or custom ids alike, personal, and absent from profiles written before it existed.

import { exAvailable } from './equipment.js'

export const skipIds = S => (Array.isArray(S?.skipEx) ? S.skipEx : [])

export const isSkipped = (S, id) => skipIds(S).includes(id)

/** Flip one exercise in a state draft. Returns true when it is not suggested afterwards. */
export function toggleSkip(s, id) {
  const list = skipIds(s)
  const on = !list.includes(id)
  s.skipEx = on ? [...list, id] : list.filter(x => x !== id)
  return on
}

/** Whether an exercise may be offered unasked: the kit is at hand and it is not skipped. */
export const suggestable = (S, ex) => !!ex && exAvailable(S, ex) && !isSkipped(S, ex.id)
