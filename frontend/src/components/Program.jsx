import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { DAYS, fmtDate, fmtNum, isoOf, startOfWeek, todayISO, weekStartOf } from '../lib/format.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import { genDefaults, genScheme, generateWorkout } from '../lib/generate.js'
import { weeklyDone } from '../lib/coverage.js'
import {
  GOAL_PRESETS, MAX_GOAL, MIN_GOAL, baseGoalOf, defaultTargetFor, goalEstimate, goalGroups,
  sessionMinutes, weeklyTargets,
} from '../lib/goals.js'
import {
  DAY_NAME, DEFAULT_WEEKS, PROGRAM_WEEKS, isPlanProgram, isProgram, newPlanProgram, planExclude, programForecast, programLayout, programOver, planAhead,
  programShare, programWeek, sizeDay, suggestDay, templateOf,
} from '../lib/program.js'
import {
  DAY_TYPES, EQUIPMENT, LEVELS, PLAN_BASES, PLAN_DAYS, PLAN_DEFAULTS, PLAN_MINUTES, PLAN_TEMPLATES, SCHEMES, blocker, configOf, fixFor, plan, scheduleOf,
} from '../lib/planner.js'
import { KIND_COLOR } from '../lib/workout-kind.js'
import { glyphOf } from '../lib/glyphs.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { startGenerated, confirmSheet } from '../sheets.jsx'
import { Button, Segmented, Stepper } from './ui.jsx'
import CoverageStrip from './CoverageStrip.jsx'
import Icon from './Icon.jsx'
import { useMuscleRoles } from './MuscleRoles.jsx'
import { rolesLoaded } from '../lib/muscle-roles.js'
import { exOr } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { Thumb } from './Media.jsx'

// The weekly goal and the program (lib/goals.js, lib/program.js): the goal screen, Plan →
// Schedule with Program chosen, the setup before a program starts, and Home's next-day and this-week cards.

const SHORT = { full: 'Full', pull: 'Pull', push: 'Push', legs: 'Legs', upper: 'Upper', lower: 'Lower' }
export const PROGRAM_SHORT = SHORT
export const KIND_ICON = { full: 'figureStrength', pull: 'pullup', push: 'barbell', legs: 'legs', upper: 'arm', lower: 'legs' }
const update = fn => useStore.getState().update(fn)
const ui = () => useUI.getState()

/** A day of a program as a small chip in its kind's colour; ticked once done this week. */
export function DayChip({ type, done, next }) {
  return <span className={'prog-chip' + (done ? ' done' : '') + (next ? ' next' : '')} style={{ '--kind': KIND_COLOR[type] }}>
    {done && <Icon name="check" />}{t(SHORT[type])}
  </span>
}

/**
 * About how long a `type` day runs for `S`: exercises, work sets and minutes. Built as the Start
 * sheet builds it (sheets.jsx GenSetup), or the two say different numbers: the setup kept for the
 * day, sized to its share of the week on a program day. A plan program's day `k` is its own lifts.
 */
function dayEstimate(S, type, k) {
  const day = isPlanProgram(S.program) ? S.program.week[k] : null
  if (day) return { count: day.items.length, sets: day.items.reduce((n, i) => n + i.sets, 0), minutes: day.minutes }
  const setup = { ...genDefaults(type), ...(S.genSetup?.[type] || {}) }
  if (isProgram(S.program) && S.program.days.includes(type)) setup.count = sizeDay(S, type, { groups: setup.groups, setup })
  const picks = generateWorkout(S, type, { ...setup, share: programShare(S, type) })
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

const SETTING_NAME = { template: 'Split', goal: 'Training goal', level: 'Level', equipment: 'Equipment', days: 'Days a week', base: 'Sets a week per group', minutes: 'Session length' }
const CAUSE = {
  time: 'the sessions are too short', accessories: 'the level allows too few accessories a day',
  equipment: 'the equipment has too few lifts for it', caps: 'its lifts are capped a day', template: 'no day of the split trains it',
}
const fixText = (f, o) => [f.days !== o.days && t('{0} days', f.days), f.minutes !== o.minutes && t('{0} min', f.minutes)].filter(Boolean).join(' · ')
const groupName = g => t(ADD_GROUPS.find(x => x.id === g)?.n || g)
/** A plan program's settings in a line: goal · level · equipment · minutes. */
const planSummary = pl => [t(SCHEMES[pl.goal]?.n), t(LEVELS[pl.level]?.n), t(EQUIPMENT[pl.equipment]?.n), t('{0} min', pl.minutes)].join(' · ')

/** A program day's lift: sets × reps (a range) and its rest. */
const liftLine = i => `${i.sets} × ${i.lo === i.hi ? i.lo : `${i.lo}–${i.hi}`}` + (i.rest ? ` · ${t('{0} rest', i.rest >= 120 && i.rest % 60 === 0 ? `${i.rest / 60} min` : `${i.rest}s`)}` : '')

/** One day of a plan being set up: its size, folded open to its lifts. */
function PreviewDay({ day, k }) {
  const [open, setOpen] = useState(k === 0)
  const color = KIND_COLOR[day.type]
  return <div className={'ahead-day plan-prev' + (open ? ' open' : '')} style={{ '--kind': color }}>
    <button type="button" className="ahead-h" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span className="lrow-i" style={{ background: `color-mix(in srgb,${color} 22%,transparent)`, color }}><Icon name={glyphOf(KIND_ICON[day.type])} /></span>
      <div className="grow">
        <div className="tt">{t('Day {0}', k + 1)} · {t(DAY_NAME[day.type])}</div>
        <div className="ss">{tn('{0} exercise', '{0} exercises', day.items.length)} · {tn('{0} set', '{0} sets', day.sets)} · {t('≈ {0} min', day.minutes)}</div>
      </div>
      <Icon name="chevronRight" />
    </button>
    {open && <div className="ahead-b"><div className="list">{day.items.map(i => {
      const ex = exOr(i.ex.id)
      return <div key={i.ex.id} className="item">
        <Thumb ex={ex} />
        <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
          <div className="ss">{groupName(i.ex.p[0])} · {liftLine({ sets: i.sets, ...i.rx })}</div></div>
      </div>
    })}</div></div>}
  </div>
}

/**
 * A program from settings (lib/planner.js): the split, goal, level, equipment, days, sets and
 * session length, and the week they build, each day's lifts fixed for the program. A setting
 * that can't reach the weekly goal at these days and minutes brings the ones it needs (marked +),
 * or can't be picked when no number of them would. Start makes it the program, and its sets the
 * weekly goal.
 */
function PlanBuilder({ template, close }) {
  const S = useStore(s => s.S)
  const running = isPlanProgram(S.program) ? S.program : null
  const exclude = useMemo(() => planExclude(S), [S])
  const [o, setO] = useState(() => {
    const from = running?.template === template ? running.plan : {}
    const start = { ...PLAN_DEFAULTS, ...from, template }
    const fix = blocker({ ...start, exclude }).length ? fixFor({ ...start, exclude }) : null
    return fix ? { ...start, ...fix } : start
  })
  const [weeks, setWeeks] = useState(() => running?.weeks || DEFAULT_WEEKS)
  const [note, setNote] = useState('')
  // The planner is quick, but the controls ask it a hundred times; once each is plenty.
  const memo = useMemo(() => new Map(), [exclude])
  const blocked = x => {
    const key = JSON.stringify(x)
    if (!memo.has(key)) memo.set(key, blocker({ ...x, exclude }))
    return memo.get(key)
  }
  const week = useMemo(() => plan({ ...o, exclude }), [o, exclude])
  const cfg = week.cfg

  const pick = (key, v) => {
    const next = { ...o, [key]: v }
    const fix = blocked(next).length ? fixFor({ ...next, exclude }, key === 'days' || key === 'minutes' ? key : undefined, { ...o, exclude }) : null
    setNote(fix ? t('{0} needs more training time, so it also set {1}.', t(SETTING_NAME[key]), fixText(fix, o)) : '')
    setO(fix ? { ...next, ...fix } : next)
  }
  const options = (key, values, label) => values.map(v => {
    const opt = { value: v, label: label(v) }
    if (v === o[key]) return opt
    const next = { ...o, [key]: v }
    if (!blocked(next).length) return opt
    const fix = fixFor({ ...next, exclude }, key === 'days' || key === 'minutes' ? key : undefined, { ...o, exclude })
    return fix ? { ...opt, needs: true, title: t('Needs {0}. Picking it changes that too.', fixText(fix, o)) }
      : { ...opt, disabled: true, title: t("Can't reach the weekly goal with this.") }
  })
  const seg = (key, values, label) => <>
    <h4 className="sec">{t(SETTING_NAME[key])}</h4>
    <Segmented value={o[key]} onChange={v => pick(key, v)} options={options(key, values, label)} />
  </>
  const short = week.short.filter(x => x.cause !== 'planner')

  const start = () => {
    const go = () => {
      const program = newPlanProgram(o, { weeks, today: todayISO(), exclude })
      if (!program) return
      update(s => {
        s.program = program
        s.goals = { ...(s.goals || {}), weeklySets: cfg.base, days: cfg.days }
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
      <h3>{t(PLAN_TEMPLATES[o.template].n)}</h3>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 6 }}>{t(PLAN_TEMPLATES[o.template].sub)}</div>
    </div>
    <div className="wd-scroll sheet-scroll plan-build">
      {seg('template', Object.keys(PLAN_TEMPLATES), v => t(SHORT_TEMPLATE[v]))}
      {seg('goal', Object.keys(SCHEMES), v => t(SCHEMES[v].n))}
      {seg('level', Object.keys(LEVELS), v => t(LEVELS[v].n))}
      {seg('equipment', Object.keys(EQUIPMENT), v => t(EQUIPMENT[v].n))}
      {seg('days', PLAN_DAYS, v => String(v))}
      {seg('base', ['auto', ...PLAN_BASES], v => (v === 'auto' ? t('Auto · {0}', SCHEMES[o.goal].base) : String(v)))}
      {seg('minutes', PLAN_MINUTES, v => String(v))}
      <div className="muted small" style={{ marginTop: 6 }}>{t('Minutes a session, rests and warm-up sets included.')}</div>
      {note && <div className="plan-note" data-plan-note>{note}</div>}

      <div className="goal-est" data-goal-estimate>
        {t('{0} days · {1} sets a week per group · up to {2} min', cfg.days, cfg.base, cfg.minutes)}
      </div>
      {short.length > 0 && <div className="plan-note warn">{t('Short of the weekly goal: {0}.', short.map(x => `${groupName(x.g)} ${x.total}/${x.goal} (${t(CAUSE[x.cause])})`).join(', '))}</div>}

      <h4 className="sec">{t('Each week')}</h4>
      <div className="ahead-days">{week.days.map((d, k) => <PreviewDay key={`${k}-${d.type}-${d.items.map(i => i.ex.id).join()}`} day={d} k={k} />)}</div>
      <Button variant="tinted" icon="shuffle" style={{ marginTop: 10 }} onClick={() => {
        // Another week of lifts, as long as it still reaches the goal.
        for (let seed = o.seed + 1, n = 0; n < 30; seed++, n++) if (!blocked({ ...o, seed }).length) return setO({ ...o, seed })
      }}>{t('Other lifts')}</Button>
      <div className="muted small" style={{ marginTop: 6 }}>{t('Each day keeps its lifts for the whole program; the weight and reps move on as you log them.')}</div>

      <h4 className="sec">{t('Length')}</h4>
      <Segmented value={weeks} onChange={setWeeks} options={PROGRAM_WEEKS.map(n => ({ value: n, label: t('{0} wk', n) }))} />
    </div>
    <div className="wd-foot">
      {hasSchedule && <div className="muted small" style={{ marginBottom: 8 }} data-schedule-note>{t('Your fixed week or rotation is kept for when you switch back.')}</div>}
      <Button variant="primary" onClick={start}>{t('Start program')}</Button>
    </div>
  </div>
}
export const programSetupSheet = template => ui().openSheet(close => <PlanBuilder template={template} close={close} />)

const SHORT_TEMPLATE = { full: 'Full body', ul: 'Upper/lower', ppl: 'PPL' }

/* ===================== Plan → Schedule, Program chosen ===================== */

function TemplateList({ active, days }) {
  return <div className="list">{Object.entries(PLAN_TEMPLATES).map(([id, p]) => <div key={id} className="item" role="button" {...tappable(() => programSetupSheet(id))}>
    <div className="grow">
      <div className="tt">{t(p.n)}{active === id && <span className="muted"> · {t('running')}</span>}</div>
      <div className="ss">{t(p.sub)}</div>
      <div className="prog-chips" style={{ marginTop: 6 }}>{scheduleOf(configOf({ template: id, days })).map((d, i) => <DayChip key={i} type={d} />)}</div>
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
function ProgramWeek({ S, ahead }) {
  const today = todayISO()
  const ws = weekStartOf(S)
  const days = useMemo(() => programLayout(S, isoOf(startOfWeek(today, ws))), [S, today, ws])
  const nextDay = days?.flatMap(d => d.items).find(it => it.state === 'next')
  useMuscleRoles()
  const est = useMemo(() => (nextDay ? dayEstimate(S, nextDay.type, nextDay.k) : null), [S, nextDay?.type, nextDay?.k, rolesLoaded()])
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
      const planned = !next && it?.state === 'planned' ? ahead?.find(d => d.iso === iso) : null
      const tap = next && !S.active ? { role: 'button', 'aria-label': t('Start {0}', t(DAY_NAME[next.type])), ...tappable(() => startGenerated(next.type, next.k)) }
        : it?.state === 'planned' ? { role: 'button', 'aria-label': t('Show {0}', fmtDate(iso, true)), ...tappable(() => plannedSheet(iso)) } : {}
      const sub = !it ? '' : it.state === 'done' ? t('Done')
        : it.state === 'next' ? (est ? t('Next · ≈ {0} exercises · {1} min', est.count, est.minutes) : t('Next'))
        : planned ? t('Planned · ≈ {0} exercises · {1} min', planned.entries.length, planned.minutes) : t('Planned')
      return <div key={iso} className={'item plan-day' + (it?.state === 'planned' || before ? ' forecast' : '')} data-day={wd} data-state={it?.state || 'rest'} {...tap}>
        <span className={'plan-day-n' + (iso === today ? ' today' : '')} aria-hidden="true">{t(DAYS[wd])}</span>
        <span className={'lrow-i' + (it ? '' : ' rest')} style={it ? { background: `color-mix(in srgb,${KIND_COLOR[it.type]} 22%,transparent)`, color: KIND_COLOR[it.type] } : undefined}>
          <Icon name={it ? glyphOf(KIND_ICON[it.type]) : 'moon'} /></span>
        <div className="grow">
          <div className="tt">{it ? items.map(x => t(DAY_NAME[x.type])).join(' + ') : before ? t('Before the program') : t('Rest day')}</div>
          {sub && <div className="ss">{sub}</div>}
        </div>
        {it?.state === 'done' && <Icon name="check" className="prog-done" />}
        {next && <span className="tag" style={{ color: KIND_COLOR[next.type], background: `color-mix(in srgb,${KIND_COLOR[next.type]} 16%,transparent)` }}>{t('Start')}</span>}
        {!next && it?.state === 'planned' && <Icon name="chevronRight" className="menu-chev" />}
      </div>
    })}</div>
    {carry.length > 0 && <p className="sect-f">{t('Moves to next week: {0}.', carry.map(x => t(DAY_NAME[x])).join(', '))}</p>}
    <p className="sect-f">{t('A forecast, not a booking: train on any day, and the days left move along.')}</p>
  </>
}

/* ============================ The days ahead ============================ */

// The program's days ahead (lib/program.js planAhead), each built as Start would build it if the
// ones before it were done as planned: how big each is, what it gives each group, and its lifts.
// A day done differently, or a day skipped, changes the ones after it.

const groupsOf = (S, type) => (isPlanProgram(S.program) ? DAY_TYPES[type].groups : ({ ...genDefaults(type), ...(S.genSetup?.[type] || {}) }).groups)
const useAhead = (S, days) => {
  useMuscleRoles()
  return useMemo(() => (days > 0 ? planAhead(S, { days }) : []), [S, days, rolesLoaded()])
}

/** One day ahead: its size, folded open to its sets per group and its lifts. */
function AheadDay({ S, day, next, open: opened = false }) {
  const [open, setOpen] = useState(opened)
  const color = KIND_COLOR[day.type]
  return <div className={'ahead-day' + (open ? ' open' : '')} style={{ '--kind': color }}>
    <button type="button" className="ahead-h" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span className="lrow-i" style={{ background: `color-mix(in srgb,${color} 22%,transparent)`, color }}><Icon name={glyphOf(KIND_ICON[day.type])} /></span>
      <div className="grow">
        <div className="tt">{fmtDate(day.iso, true)} · {t(DAY_NAME[day.type])}<span className="ahead-next">{next ? t('Next') : t('Planned')}</span></div>
        <div className="ss">{tn('{0} exercise', '{0} exercises', day.entries.length)} · {tn('{0} set', '{0} sets', day.sets)} · {t('≈ {0} min', day.minutes)}</div>
      </div>
      <Icon name="chevronRight" />
    </button>
    {open && <AheadBody S={S} day={day} />}
  </div>
}

/** What a day ahead gives each group, then its lifts as planned: sets × reps, and the weight. */
function AheadBody({ S, day }) {
  return <div className="ahead-b">
    <CoverageStrip groups={groupsOf(S, day.type)} adds={day.groups} goals={weeklyTargets(S)} label={t('Sets per group this day, toward your weekly goal')} />
    <div className="list">{day.entries.map(e => {
      const ex = exOr(e.id), work = e.sets.filter(x => !isWarmupRow(x))
      const reps = e.target?.repsMin > 0 && e.target.repsMin < e.target.reps ? `${e.target.repsMin}–${e.target.reps}` : e.target?.reps ?? ''
      const how = e.target?.sec ? `${work.length} × ${fmtNum(e.target.sec)}s` : `${work.length} × ${reps}`
      const w = work.find(x => x.w > 0)?.w
      const what = e.gen?.k ? t(e.gen.k === 'cardio' ? 'Cardio' : 'Stretching')
        : `${e.gen?.g ? groupName(e.gen.g) : t(MUSCLE_NAME[e.gen?.m] || '')} · ${how}` + (w ? ` · ${fmtNum(w)} ${S.unit}` : '')
      return <div key={e.id} className="item">
        <Thumb ex={ex} />
        <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div><div className="ss">{what}</div></div>
      </div>
    })}</div>
  </div>
}

/**
 * Plan → Program: the days ahead one after another, by calendar week, each week with what its
 * days add up to per group (with what is done of it already), two program weeks at first.
 */
function ComingUp({ S, ahead, more, onMore }) {
  const ws = weekStartOf(S)
  const thisWeek = isoOf(startOfWeek(todayISO(), ws))
  const done = useMemo(() => weeklyDone(S), [S])
  const weeks = []
  for (const d of ahead) {
    const from = isoOf(startOfWeek(d.iso, ws))
    let w = weeks[weeks.length - 1]
    if (w?.from !== from) weeks.push(w = { from, days: [], adds: from === thisWeek ? { ...done } : {} })
    w.days.push(d)
    for (const [g, v] of Object.entries(d.groups)) w.adds[g] = (w.adds[g] || 0) + v
  }
  if (!weeks.length) return null
  const groups = [...new Set(S.program.days.flatMap(type => groupsOf(S, type)))]
  return <>
    <h4 className="sec">{t('Coming up')}</h4>
    <p className="sect-f" style={{ marginTop: 0 }}>{t('Each day as Start would build it if you do the days before it as planned. Train differently and the days after change.')}</p>
    {weeks.map(w => <div key={w.from} className="ahead-week">
      <div className="ahead-wk">{w.from === thisWeek ? t('This week') : t('Week of {0}', fmtDate(w.from))}</div>
      <div className="ahead-days">{w.days.map(d => <AheadDay key={d.iso + d.type} S={S} day={d} next={d === ahead[0]} />)}</div>
      <details className="ahead-sum">
        <summary>{t('These days add up to')}</summary>
        <CoverageStrip groups={groups} adds={w.adds} goals={weeklyTargets(S)} ofGoal
          label={w.from === thisWeek ? t('Sets per group this week, done and planned, of your weekly goal') : t('Sets per group that week, of your weekly goal')} />
      </details>
    </div>)}
    {more && <Button variant="tinted" onClick={onMore}>{t('Show the next week')}</Button>}
  </>
}

/**
 * A day ahead on its own, from the calendar or its row in the week: said to be planned, dashed
 * like its mark in the calendar, and the next one can be started from here. Starting builds the
 * next day, so a later one cannot. With nothing planned that day, just the date.
 */
export function PlannedOn({ iso, close }) {
  const S = useStore(s => s.S)
  const days = useMemo(() => {
    const i = programForecast(S).findLastIndex(f => f.iso === iso)
    return i < 0 ? 0 : i + 1
  }, [S, iso])
  const all = useAhead(S, days)
  const ahead = all.filter(d => d.iso === iso)
  if (!ahead.length) return <h3>{fmtDate(iso, true)}</h3>
  const next = all[0].iso === iso
  const n = ahead.reduce((a, d) => ({ ex: a.ex + d.entries.length, sets: a.sets + d.sets, min: a.min + d.minutes }), { ex: 0, sets: 0, min: 0 })
  return <>
    <h3 style={{ '--kind': KIND_COLOR[ahead[0].type] }}>{ahead.map(d => t(DAY_NAME[d.type])).join(' + ')}<span className="ahead-next">{t('Planned')}</span></h3>
    <div className="muted small">{fmtDate(iso, true)} · {tn('{0} exercise', '{0} exercises', n.ex)} · {tn('{0} set', '{0} sets', n.sets)} · {t('≈ {0} min', n.min)}</div>
    <p className="sect-f" style={{ marginTop: 4 }}>{t('If you do the days before it as planned.')}</p>
    {ahead.map(d => <div key={d.type} className="ahead-day planned-one" style={{ '--kind': KIND_COLOR[d.type] }}><AheadBody S={S} day={d} /></div>)}
    {next && !S.active && <Button icon="play" onClick={() => { close?.(); startGenerated(ahead[0].type, ahead[0].k) }}>{t('Start {0}', t(DAY_NAME[ahead[0].type]))}</Button>}
  </>
}
const plannedSheet = iso => ui().openSheet(close => <PlannedOn iso={iso} close={close} />)

/** Plan → Schedule with Program chosen: the program and its week, the goal, and the programs. */
export function ProgramMode() {
  const S = useStore(s => s.S)
  const p = isProgram(S.program) ? S.program : null
  const pw = p ? programWeek(S) : null
  const over = p && programOver(S)
  const tpl = !p ? null : isPlanProgram(p) ? PLAN_TEMPLATES[p.template] : templateOf(p.template)
  // The days ahead: two program weeks, a week more a tap, as far as the program goes.
  const left = useMemo(() => (p && !over ? programForecast(S).length : 0), [S, p, over])
  const [weeksAhead, setWeeksAhead] = useState(2)
  const ahead = useAhead(S, Math.min(left, (p?.days.length || 0) * weeksAhead))
  return <>
    {p && <div className="card prog-card" data-program>
      <div className="row between">
        <div><div className="eyebrow">{over ? t('Program done') : t('Week {0} of {1}', pw.week, p.weeks)}</div><h2 style={{ margin: '2px 0 0' }}>{tpl ? t(tpl.n) : t('Program')}</h2>
          {isPlanProgram(p) && <div className="small muted">{planSummary(p.plan)}</div>}</div>
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
    {p && !over && <ProgramWeek S={S} ahead={ahead} />}
    {p && !over && <ComingUp S={S} ahead={ahead} more={ahead.length < left} onMore={() => setWeeksAhead(n => n + 1)} />}
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
    <TemplateList active={isPlanProgram(p) ? p.template : null} days={isPlanProgram(p) ? p.plan.days : S.goals?.days || PLAN_DEFAULTS.days} />
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
  // As the Start sheet (sheets.jsx GenSetup): picked again once muscle roles are in, or the
  // estimate is of a different day than Start builds.
  useMuscleRoles()
  const k = pw?.next != null ? pw.items[pw.next].k : undefined
  const est = useMemo(() => (type ? dayEstimate(S, type, k) : null), [S, type, k, rolesLoaded()])
  const tpl = !p ? null : isPlanProgram(p) ? PLAN_TEMPLATES[p.template] : templateOf(p.template)
  const head = p
    ? (over ? t('Program done') : t('Program · week {0} of {1}', pw.week, p.weeks))
    : t('Suggested next')
  return <div className="card next-card" data-next-day>
    <div className="row between" style={{ marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}><div className="eyebrow">{head}</div>{tpl && <div className="small muted">{t(tpl.n)}</div>}</div>
      {!p && <Button size="sm" variant="plain" onClick={onPrograms}>{t('Programs')}</Button>}
    </div>
    {type ? <div className="gen-tile kind next-tile" style={{ '--kind': KIND_COLOR[type] }} role="button" aria-label={t('Start {0}', t(DAY_NAME[type]))} {...tappable(() => startGenerated(type, k))}>
      <div className="row" style={{ gap: 10 }}>
        <span className="lrow-i" style={{ width: 36, height: 36, borderRadius: 10, fontSize: 20 }}><Icon name={glyphOf(KIND_ICON[type])} /></span>
        <div className="grow" style={{ minWidth: 0 }}>
          <div className="tt">{t(DAY_NAME[type])}</div>
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
