import { ADD_GROUPS } from '../lib/add-exercise.js'
import { WEEKLY_TARGET } from '../lib/coverage.js'
import { groupColor, mcStyle } from '../lib/muscle-colors.js'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

// Effective sets per muscle group against the week's goal (lib/goals.js, `goals`: group id ->
// sets; 10 each when not given): one bar each, in the
// group's colour, for what a session or routine adds (plannedSets). The one-tap setup shows it
// for the workout it built, so a shuffle or a group ticked shows what it changes; the routine
// editor for the routine. The bars share one scale, wide enough for the fullest group, with a
// tick at a group's goal once one passes its own. `planned` makes a group's number read
// done/planned, the bar still toward the goal; `ofGoal` makes it read done/goal, as the bar does.
// Stats passes `ofGoal` and `onGroup`, which makes each group a button that opens its split;
// `selected` is the group open. `ahead` (group id -> sets still planned) adds a light bar after
// the solid one and a tick at the goal: a week's done and planned, against the goal.
export const shown = v => (v > 0 && v < 0.5 ? '<1' : String(Math.round(v)))

export default function CoverageStrip({ groups = ADD_GROUPS.map(g => g.id), adds, goals, label, planned, ofGoal, onGroup, selected, ahead }) {
  const list = ADD_GROUPS.filter(g => groups.includes(g.id))
  const goalOf = id => goals?.[id] ?? WEEKLY_TARGET
  // a group a fraction over its goal stays on the goals' scale; the rounding hides it anyway
  const sum = id => (adds[id] || 0) + (ahead?.[id] || 0)
  const top = Math.max(0, ...list.map(g => (sum(g.id) >= goalOf(g.id) + 0.5 ? sum(g.id) : 0)))
  const scale = Math.max(1, top, ...list.map(g => goalOf(g.id)))
  const pct = v => `${Math.min(100, (v / scale) * 100)}%`
  return <>
    <div className="cov-strip">{list.map(g => {
      const add = adds[g.id] || 0, plan = planned?.[g.id] || 0, goal = goalOf(g.id), more = ahead?.[g.id] || 0
      return <div key={g.id} data-group={g.id} className={'cov-g mg' + (onGroup ? ' tap' : '') + (selected === g.id ? ' sel' : '') + (goal < scale || ahead ? ' over' : '')}
        style={{ ...mcStyle(groupColor(g.id)), '--goal': pct(goal) }} {...(onGroup ? { ...tappable(() => onGroup(g.id)), 'aria-pressed': selected === g.id } : {})}>
        <div className="cov-l"><span>{t(g.n)}</span><b>{shown(add)}{ahead ? <span className="dim">/{shown(add + more)}</span> : ofGoal ? <span className="dim">/{goal}</span> : plan > 0 && <span className="dim">/{shown(plan)}</span>}</b></div>
        <div className="cov-bar" role="img" aria-label={plan > 0
          ? t('{0}: {1} of {2} sets, {3} planned', t(g.n), shown(add), goal, shown(plan))
          : t('{0}: {1} of {2} sets', t(g.n), shown(add), goal)}>
          {add > 0 && <i style={{ width: pct(add) }} />}
          {more > 0 && <i className="ahead" style={{ width: pct(more) }} />}
        </div>
      </div>
    })}</div>
    <div className="cov-key small dim">{label}</div>
  </>
}
