import { ADD_GROUPS } from '../lib/add-exercise.js'
import { WEEKLY_TARGET } from '../lib/coverage.js'
import { groupColor, mcStyle } from '../lib/muscle-colors.js'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

// Effective sets per muscle group against the week's 10 (lib/coverage.js): one bar each, in the
// group's colour, for what a session or routine adds (plannedSets). The one-tap setup shows it
// for the workout it built, so a shuffle or a group ticked shows what it changes; the routine
// editor for the routine. The bars share one scale, wide enough for the fullest group, with a
// tick at the goal once a group passes it. Stats also passes `planned` (a group's number reads
// done/planned, the bar still toward the goal) and `onGroup`, which makes each group a button
// that opens its split; `selected` is the group open.
export const shown = v => (v > 0 && v < 0.5 ? '<1' : String(Math.round(v)))

export default function CoverageStrip({ groups = ADD_GROUPS.map(g => g.id), adds, label, planned, onGroup, selected }) {
  const list = ADD_GROUPS.filter(g => groups.includes(g.id))
  // a group a fraction over the goal stays on the goal's scale; the rounding hides it anyway
  const top = Math.max(0, ...list.map(g => adds[g.id] || 0))
  const scale = top >= WEEKLY_TARGET + 0.5 ? top : WEEKLY_TARGET
  const pct = v => `${Math.min(100, (v / scale) * 100)}%`
  return <>
    <div className={'cov-strip' + (scale > WEEKLY_TARGET ? ' over' : '')} style={{ '--goal': pct(WEEKLY_TARGET) }}>{list.map(g => {
      const add = adds[g.id] || 0, plan = planned?.[g.id] || 0
      return <div key={g.id} data-group={g.id} className={'cov-g mg' + (onGroup ? ' tap' : '') + (selected === g.id ? ' sel' : '')}
        style={mcStyle(groupColor(g.id))} {...(onGroup ? { ...tappable(() => onGroup(g.id)), 'aria-pressed': selected === g.id } : {})}>
        <div className="cov-l"><span>{t(g.n)}</span><b>{shown(add)}{plan > 0 && <span className="dim">/{shown(plan)}</span>}</b></div>
        <div className="cov-bar" role="img" aria-label={plan > 0
          ? t('{0}: {1} of {2} sets, {3} planned', t(g.n), shown(add), WEEKLY_TARGET, shown(plan))
          : t('{0}: {1} of {2} sets', t(g.n), shown(add), WEEKLY_TARGET)}>
          {add > 0 && <i style={{ width: pct(add) }} />}
        </div>
      </div>
    })}</div>
    <div className="cov-key small dim">{label}</div>
  </>
}
