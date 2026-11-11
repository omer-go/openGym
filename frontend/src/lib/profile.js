// The training profile: every setting the workout generator reads, in one place. A one-tap
// workout (generate.js) and a program's day are built from the same one, so a goal set on the
// goal screen can't give one of them its rep ranges and the other its weekly sets. Pure.
//
// Where each lives: the goal, volume, days and each group's focus in `S.goals` (goals.js); the
// rests you keep to in `S.restRange` (engine.js); how lifts take turns in `S.rotation`; the
// level, equipment and session length on a program built from settings (`S.program.plan`).
import { daysOf, focusOf, goalTypeOf, volumeOf } from './goals.js'
import { restRangeOf } from './engine.js'
import { ADD_GROUPS } from './add-exercise.js'

/** How lifts take turns: 'session', the one done longest ago each time; 'block', the lifts you know, kept. */
export const ROTATIONS = ['session', 'block']
export const rotationOf = S => (ROTATIONS.includes(S?.rotation) ? S.rotation : 'session')

/**
 * `{ goal, volume, days, minutes, level, equipment, rests, rotation, focus }`: `minutes` 0 when
 * no session length is set, `rests` null when each goal rests as long as it says, `focus` the
 * groups set off 'normal' only.
 */
export function profileOf(S) {
  const p = S?.program
  const plan = p?.plan && Array.isArray(p.days) ? p.plan : null
  const focus = {}
  for (const { id } of ADD_GROUPS) if (focusOf(S, id) !== 'normal') focus[id] = focusOf(S, id)
  return {
    goal: goalTypeOf(S), volume: volumeOf(S), days: daysOf(S),
    minutes: plan?.minutes > 0 ? plan.minutes : 0, level: plan?.level, equipment: plan?.equipment,
    rests: restRangeOf(S), rotation: rotationOf(S), focus,
  }
}
