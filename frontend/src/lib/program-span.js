// The dates a program (program.js) runs over, on their own so history.js can ask without pulling
// in the generator: history.js is imported by mcp/, plain Node, and program.js is not.
//
// One plan is in charge at a time. A program is one of the ways you train (Plan → Schedule → How
// you train), beside a fixed week and a rotation: from the day it starts it decides what a day is
// for, until you end it or choose another way, also after its last week. The weekdays and the
// loop (S.week, S.queue) are kept as they were for when you switch back.
import { isoOf, startOfWeek, weekStartOf } from './format.js'

/** `{ from, to }`: the start day and the last day of its last week (null without a length). */
export function programSpan(S) {
  const p = S?.program
  if (!p || !Array.isArray(p.days) || !p.days.length || typeof p.startedAt !== 'string') return null
  const weeks = p.weeks > 0 ? p.weeks : null
  if (!weeks) return { from: p.startedAt, to: null }
  const end = startOfWeek(p.startedAt, weekStartOf(S))
  end.setDate(end.getDate() + weeks * 7 - 1)
  return { from: p.startedAt, to: isoOf(end) }
}

/** Does a program speak for `iso`? From its start until it is ended. */
export function programOn(S, iso) {
  const span = programSpan(S)
  return !!span && iso >= span.from
}
