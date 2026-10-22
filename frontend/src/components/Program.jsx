import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { DAYS, isoOf, startOfWeek, todayISO, weekStartOf } from '../lib/format.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import { GEN_NAME, genScheme, generateWorkout } from '../lib/generate.js'
import { weeklyDone } from '../lib/coverage.js'
import {
  DEFAULT_GOAL, GOAL_PRESETS, MAX_GOAL, MIN_GOAL, baseGoalOf, defaultTargetFor, goalEstimate, goalGroups,
  sessionMinutes, weeklyTargets,
} from '../lib/goals.js'
import {
  DEFAULT_WEEKS, PROGRAM_TEMPLATES, PROGRAM_WEEKS, isProgram, newProgram, programForecast, programLayout, programOver, programWeek, sizeDay,
  suggestDay, templateOf,
} from '../lib/program.js'
import { KIND_COLOR } from '../lib/workout-kind.js'
import { glyphOf } from '../lib/glyphs.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { startGenerated, confirmSheet } from '../sheets.jsx'
import { Button, Segmented, Stepper } from './ui.jsx'
import CoverageStrip from './CoverageStrip.jsx'
import Icon from './Icon.jsx'

// The weekly goal and the program (lib/goals.js, lib/program.js): the goal screen, Plan →
// Schedule with Program chosen, the setup before a program starts, and Home's next-day and this-week cards.

const SHORT = { full: 'Full', pull: 'Pull', push: 'Push', legs: 'Legs' }
export const PROGRAM_SHORT = SHORT
const KIND_ICON = { full: 'figureStrength', pull: 'pullup', push: 'barbell', legs: 'legs' }
const update = fn => useStore.getState().update(fn)
const ui = () => useUI.getState()

/** A day of a program as a small chip in its kind's colour; ticked once done this week. */
export function DayChip({ type, done, next }) {
  return <span className={'prog-chip' + (done ? ' done' : '') + (next ? ' next' : '')} style={{ '--kind': KIND_COLOR[type] }}>
    {done && <Icon name="check" />}{t(SHORT[type])}
  </span>
}

/** About how long a `type` day runs for `S`: exercises, work sets and minutes. */
function dayEstimate(S, type) {
  const setup = { ...(S.genSetup?.[type] || {}) }
  const count = sizeDay(S, type, { setup })
  const picks = generateWorkout(S, type, { count })
  const sets = picks.reduce((n, p) => n + (genScheme(p.id, setup)?.sets || 0), 0)
  return { count: picks.length, sets, minutes: sessionMinutes(sets) }
}

/* ============================ the weekly goal ============================ */

// One number for the big groups, presets around it, the days a week, and any group set on its
// own. Saved on Done.
function GoalSheet({ close }) {
  const S = useStore(s => s.S)
  const [base, setBase] = useState(() => baseGoalOf(S))
  const [days, setDays] = useState(() => S.goals?.days || 4)
  const [byGroup, setByGroup] = useState(() => ({ ...(S.goals?.byGroup || {}) }))
  const draft = { ...S, goals: { weeklySets: base, days, byGroup } }
  const est = goalEstimate(draft, goalGroups(draft))
  const programDays = isProgram(S.program) ? S.program.days.length : 0
  const setGroup = (g, v) => setByGroup(x => {
    const out = { ...x }
    if (v === defaultTargetFor(g, base) || v == null) delete out[g]
    else out[g] = v
    return out
  })
  const save = () => {
    update(s => { s.goals = { ...(s.goals || {}), weeklySets: base, days, byGroup } })
    close()
  }
  return <div className="wd-fit">
    <div style={{ flex: 'none' }}>
      <h3>{t('Weekly goal')}</h3>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 6 }}>{t('Hard sets for each muscle group, every week. The one-tap workouts fill what is left.')}</div>
    </div>
    <div className="wd-scroll sheet-scroll">
      <div className="goal-big">
        <Stepper label={t('Sets a week per group')} value={base} step={1} min={MIN_GOAL} max={MAX_GOAL} decimal={false} onChange={setBase} />
      </div>
      <div className="goal-presets" role="group" aria-label={t('Presets')}>
        {GOAL_PRESETS.map(p => <button key={p.sets} type="button" className={'goal-preset' + (p.sets === base ? ' on' : '')} aria-pressed={p.sets === base} onClick={() => setBase(p.sets)}>
          <b>{p.sets}</b><span>{t(p.n)}</span>
        </button>)}
      </div>
      <div className="muted small" style={{ marginTop: 8 }}>{t('About 10 grows most people; past 20 adds little. Calves, forearms and abs aim for two thirds of it.')}</div>

      <h4 className="sec">{t('Days a week')}</h4>
      {programDays
        ? <div className="muted small">{t('Days a week in your program: {0}.', programDays)}</div>
        : <Segmented value={days} onChange={setDays} options={[2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) }))} />}

      <div className="goal-est" data-goal-estimate>
        {t('≈ {0} sets a week · about {1} a session, {2} min', est.week, est.session, est.minutes)}
      </div>

      <h4 className="sec">{t('By muscle group')}</h4>
      <div className="list goal-groups">{ADD_GROUPS.map(g => {
        const own = byGroup[g.id] != null
        const v = own ? byGroup[g.id] : defaultTargetFor(g.id, base)
        return <div key={g.id} className="item">
          <div className="grow"><div className="tt">{t(g.n)}</div>
            <div className="ss">{own ? <button type="button" className="linkish" onClick={() => setGroup(g.id, null)}>{t('Set on its own · reset')}</button> : t('Follows the goal')}</div></div>
          <Stepper value={v} step={1} min={0} max={MAX_GOAL} decimal={false} ariaLabel={t(g.n)} onChange={n => setGroup(g.id, n)} />
        </div>
      })}</div>
    </div>
    <div className="wd-foot">
      <Button variant="primary" onClick={save}>{t('Done')}</Button>
    </div>
  </div>
}
export const goalSheet = () => ui().openSheet(close => <GoalSheet close={close} />)

/* ============================ program setup ============================ */

// A template's days, the goal they are sized to (presets or your own), and how many weeks; each
// day shows about how long it runs. Start makes it the program, and the goal the weekly goal.
function ProgramSetup({ template, close }) {
  const S = useStore(s => s.S)
  const tpl = templateOf(template)
  const [goal, setGoal] = useState(() => baseGoalOf(S))
  const [weeks, setWeeks] = useState(DEFAULT_WEEKS)
  const custom = !GOAL_PRESETS.some(p => p.sets === goal)
  const types = [...new Set(tpl.days)]
  const est = useMemo(() => {
    const draft = { ...S, program: newProgram(template, { weeks }), goals: { ...(S.goals || {}), weeklySets: goal } }
    return Object.fromEntries(types.map(type => [type, dayEstimate(draft, type)]))
  }, [S, template, goal, weeks])
  const start = () => {
    const go = () => {
      update(s => {
        s.program = newProgram(template, { weeks, today: todayISO() })
        s.goals = { ...(s.goals || {}), weeklySets: goal, days: tpl.days.length }
      })
      ui().toast(t('Program started. Home shows your next day.'))
    }
    close()
    if (isProgram(S.program)) confirmSheet({ title: t('Replace your program?'), message: t('The program running now ends. Your workouts stay as they are.'), confirmText: t('Replace'), onConfirm: go })
    else go()
  }
  // A schedule you have (weekday routines or a loop) is paused while the program runs, not lost.
  const hasSchedule = !!S.queue || Object.values(S.week || {}).some(v => [].concat(v || []).length)
  return <div className="wd-fit">
    <div style={{ flex: 'none' }}>
      <h3>{t(tpl.n)}</h3>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 6 }}>{t(tpl.sub)}</div>
    </div>
    <div className="wd-scroll sheet-scroll">
      <h4 className="sec">{t('Sets a week per group')}</h4>
      <Segmented value={custom ? 'custom' : goal} onChange={v => setGoal(v === 'custom' ? (custom ? goal : goal + 2) : v)}
        options={[...GOAL_PRESETS.filter(p => p.sets >= DEFAULT_GOAL).map(p => ({ value: p.sets, label: String(p.sets) })), { value: 'custom', label: t('Custom') }]} />
      {custom && <div className="row cfgrow" style={{ marginTop: 10 }}>
        <Stepper label={t('Sets a week per group')} value={goal} step={1} min={MIN_GOAL} max={MAX_GOAL} decimal={false} onChange={setGoal} />
      </div>}

      <h4 className="sec">{t('Each week')}</h4>
      <div className="list">{tpl.days.map((type, i) => {
        const e = est[type]
        return <div key={i} className="item">
          <span className="lrow-i" style={{ background: `color-mix(in srgb,${KIND_COLOR[type]} 22%,transparent)`, color: KIND_COLOR[type] }}><Icon name={glyphOf(KIND_ICON[type])} /></span>
          <div className="grow"><div className="tt">{t(GEN_NAME[type])}</div>
            <div className="ss">{t('≈ {0} exercises · {1} sets · {2} min', e.count, e.sets, e.minutes)}</div></div>
        </div>
      })}</div>
      <div className="muted small" style={{ marginTop: 6 }}>{t('In any order, on any days. A day sizes itself to what the week still needs, so these shift as you train.')}</div>

      <h4 className="sec">{t('Length')}</h4>
      <Segmented value={weeks} onChange={setWeeks} options={PROGRAM_WEEKS.map(n => ({ value: n, label: t('{0} wk', n) }))} />
    </div>
    <div className="wd-foot">
      {hasSchedule && <div className="muted small" style={{ marginBottom: 8 }} data-schedule-note>{t('Your fixed week or rotation is kept for when you switch back.')}</div>}
      <Button variant="primary" onClick={start}>{t('Start program')}</Button>
    </div>
  </div>
}
export const programSetupSheet = template => ui().openSheet(close => <ProgramSetup template={template} close={close} />)

/* ===================== Plan → Schedule, Program chosen ===================== */

function TemplateList({ active }) {
  return <div className="list">{PROGRAM_TEMPLATES.map(p => <div key={p.id} className="item" role="button" {...tappable(() => programSetupSheet(p.id))}>
    <div className="grow">
      <div className="tt">{t(p.n)}{active === p.id && <span className="muted"> · {t('running')}</span>}</div>
      <div className="ss">{t(p.sub)}</div>
      <div className="prog-chips" style={{ marginTop: 6 }}>{p.days.map((d, i) => <DayChip key={i} type={d} />)}</div>
    </div>
    <Icon name="chevronRight" className="menu-chev" />
  </div>)}</div>
}

/** Ends the program, after asking; `then` runs once it is ended (the way of training switched to). */
export const endProgram = then => confirmSheet({
  title: t('End the program?'), message: t('Your workouts and goal stay. Your fixed week or rotation takes over again.'), confirmText: t('End program'),
  danger: true, onConfirm: () => { update(s => { s.program = null }); then?.() },
})

/**
 * This week of the program on its days (lib/program.js programLayout): what was done where, and
 * the days left as a forecast from today, the next one a tap from starting.
 */
function ProgramWeek({ S }) {
  const today = todayISO()
  const ws = weekStartOf(S)
  const days = useMemo(() => programLayout(S, isoOf(startOfWeek(today, ws))), [S, today, ws])
  const nextType = days?.flatMap(d => d.items).find(it => it.state === 'next')?.type
  const est = useMemo(() => (nextType ? dayEstimate(S, nextType) : null), [S, nextType])
  // This program week's days the forecast puts past Sunday.
  const carry = useMemo(() => {
    const left = programWeek(S)?.items.filter(it => !it.w).length || 0
    return days ? programForecast(S).slice(0, left).filter(f => f.iso > days[6].iso).map(f => f.type) : []
  }, [S, days])
  if (!days) return null
  return <>
    <h4 className="sec">{t('This week')}</h4>
    <div className="list plan-week prog-week">{days.map(({ iso, items }) => {
      const wd = new Date(iso + 'T12:00:00').getDay()
      const it = items[0]
      // The days before it started weren't the program's to fill.
      const before = !it && iso < S.program.startedAt
      const next = items.find(x => x.state === 'next')
      const tap = next && !S.active ? { role: 'button', 'aria-label': t('Start {0}', t(GEN_NAME[next.type])), ...tappable(() => startGenerated(next.type)) } : {}
      const sub = !it ? '' : it.state === 'done' ? t('Done')
        : it.state === 'next' ? (est ? t('Next · ≈ {0} exercises · {1} min', est.count, est.minutes) : t('Next'))
        : t('Planned')
      return <div key={iso} className={'item plan-day' + (it?.state === 'planned' || before ? ' forecast' : '')} data-day={wd} data-state={it?.state || 'rest'} {...tap}>
        <span className={'plan-day-n' + (iso === today ? ' today' : '')} aria-hidden="true">{t(DAYS[wd])}</span>
        <span className={'lrow-i' + (it ? '' : ' rest')} style={it ? { background: `color-mix(in srgb,${KIND_COLOR[it.type]} 22%,transparent)`, color: KIND_COLOR[it.type] } : undefined}>
          <Icon name={it ? glyphOf(KIND_ICON[it.type]) : 'moon'} /></span>
        <div className="grow">
          <div className="tt">{it ? items.map(x => t(GEN_NAME[x.type])).join(' + ') : before ? t('Before the program') : t('Rest day')}</div>
          {sub && <div className="ss">{sub}</div>}
        </div>
        {it?.state === 'done' && <Icon name="check" className="prog-done" />}
        {next && <span className="tag" style={{ color: KIND_COLOR[next.type], background: `color-mix(in srgb,${KIND_COLOR[next.type]} 16%,transparent)` }}>{t('Start')}</span>}
      </div>
    })}</div>
    {carry.length > 0 && <p className="sect-f">{t('Moves to next week: {0}.', carry.map(x => t(GEN_NAME[x])).join(', '))}</p>}
    <p className="sect-f">{t('A forecast, not a booking: train on any day, and the days left move along.')}</p>
  </>
}

/** Plan → Schedule with Program chosen: the program and its week, the goal, and the programs. */
export function ProgramMode() {
  const S = useStore(s => s.S)
  const p = isProgram(S.program) ? S.program : null
  const pw = p ? programWeek(S) : null
  const over = p && programOver(S)
  const tpl = p ? templateOf(p.template) : null
  return <>
    {p && <div className="card prog-card" data-program>
      <div className="row between">
        <div><div className="eyebrow">{over ? t('Program done') : t('Week {0} of {1}', pw.week, p.weeks)}</div><h2 style={{ margin: '2px 0 0' }}>{tpl ? t(tpl.n) : t('Program')}</h2></div>
        <Button size="sm" variant="plain" onClick={() => endProgram()}>{t('End')}</Button>
      </div>
      {!over && <>
        <div className="prog-chips" style={{ margin: '12px 0 4px' }}>{pw.items.map((it, i) => <DayChip key={i} type={it.type} done={!!it.w} next={i === pw.next} />)}</div>
        <div className="muted small">{pw.next == null
          ? t('This week is done. Rest, or train freestyle.')
          : t('Done: {0} of {1}.', pw.done, pw.items.length)}</div>
      </>}
      {over && <div className="muted small" style={{ marginTop: 8 }}>{t('All weeks done. Run it again, or choose another below.')}</div>}
      <div className="list" style={{ marginTop: 12 }}>
        <div className="item" role="button" {...tappable(goalSheet)}>
          <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="target" /></span>
          <div className="grow"><div className="tt">{t('Weekly goal')}</div><div className="ss">{t('Sets a week per group: {0}', baseGoalOf(S))}</div></div>
          <Icon name="chevronRight" className="menu-chev" />
        </div>
      </div>
    </div>}
    {p && !over && <ProgramWeek S={S} />}
    {!p && <div className="card">
      <div className="muted small" style={{ marginBottom: 12 }}>{t('A week of one-tap days, each built fresh from what your muscles need, sized to your weekly goal.')}</div>
      <div className="list">
        <div className="item" role="button" {...tappable(goalSheet)}>
          <span className="lrow-i" style={{ background: 'var(--green)' }}><Icon name="target" /></span>
          <div className="grow"><div className="tt">{t('Weekly goal')}</div><div className="ss">{t('Sets a week per group: {0}', baseGoalOf(S))}</div></div>
          <Icon name="chevronRight" className="menu-chev" />
        </div>
      </div>
    </div>}
    <h4 className="sec" style={{ marginTop: 18 }}>{p ? t('Switch program') : t('Choose a program')}</h4>
    <TemplateList active={p?.template} />
  </>
}

/* ============================ Home ============================ */

/** Home's next day: the program's, with its week, or the one-tap day the week needs most. */
export function NextDayCard({ onPrograms }) {
  const S = useStore(s => s.S)
  const p = isProgram(S.program) ? S.program : null
  const pw = useMemo(() => (p ? programWeek(S) : null), [S, p])
  const over = p && programOver(S)
  const type = useMemo(() => (over ? null : suggestDay(S)), [S, over])
  const est = useMemo(() => (type ? dayEstimate(S, type) : null), [S, type])
  const tpl = p ? templateOf(p.template) : null
  const head = p
    ? (over ? t('Program done') : t('Program · week {0} of {1}', pw.week, p.weeks))
    : t('Suggested next')
  return <div className="card next-card" data-next-day>
    <div className="row between" style={{ marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}><div className="eyebrow">{head}</div>{tpl && <div className="small muted">{t(tpl.n)}</div>}</div>
      {!p && <Button size="sm" variant="plain" onClick={onPrograms}>{t('Programs')}</Button>}
    </div>
    {type ? <div className="gen-tile kind next-tile" style={{ '--kind': KIND_COLOR[type] }} role="button" aria-label={t('Start {0}', t(GEN_NAME[type]))} {...tappable(() => startGenerated(type))}>
      <div className="row" style={{ gap: 10 }}>
        <span className="lrow-i" style={{ width: 36, height: 36, borderRadius: 10, fontSize: 20 }}><Icon name={glyphOf(KIND_ICON[type])} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tt">{t(GEN_NAME[type])}</div>
          {est && <div className="ss" style={{ marginTop: 2 }}>{t('≈ {0} exercises · {1} sets · {2} min', est.count, est.sets, est.minutes)}</div>}
        </div>
        <span className="tag" style={{ color: KIND_COLOR[type], background: `color-mix(in srgb,${KIND_COLOR[type]} 16%,transparent)` }}>{t('Start')}</span>
      </div>
    </div> : <div className="muted small">{over
      ? t('All weeks done. Start it again or pick another in Plan.')
      : p ? t('This week is done. Rest, or train freestyle.') : t('Your week is on goal. Rest, or train freestyle.')}</div>}
    {pw && !over && <div className="prog-chips" style={{ marginTop: 10 }}>{pw.items.map((it, i) => <DayChip key={i} type={it.type} done={!!it.w} next={i === pw.next} />)}</div>}
    {over && <Button size="sm" variant="tinted" style={{ marginTop: 10 }} onClick={onPrograms}>{t('Programs')}</Button>}
  </div>
}

/** Home's this-week card: each group's sets so far against its goal. */
export function WeekGoalCard() {
  const S = useStore(s => s.S)
  const done = useMemo(() => weeklyDone(S), [S])
  const goals = weeklyTargets(S)
  const groups = goalGroups(S)
  const met = groups.filter(g => (done[g] || 0) >= goals[g] - 0.5).length
  return <div className="card" data-week-goal>
    <div className="row between" style={{ marginBottom: 10 }}>
      <div><h2 style={{ margin: 0 }}>{t('Weekly goal')}</h2>
        <div className="small muted">{t('{0} of {1} groups on goal', met, groups.length)}</div></div>
      <Button size="sm" variant="tinted" icon="target" onClick={goalSheet}>{t('Goal: {0}', baseGoalOf(S))}</Button>
    </div>
    <CoverageStrip groups={groups} adds={done} goals={goals}
      label={isProgram(S.program) ? t('Sets per group this week, against your goal') : t('Sets per group over the last 7 days, against your goal')} />
  </div>
}
