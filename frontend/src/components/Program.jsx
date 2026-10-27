import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, dateLocale, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { DAYS, fmtDate, fmtDateRange, fmtDur, fmtNum, isoOf, todayISO, weekOrder, weekStartOf } from '../lib/format.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import { genDefaults, genScheme, generateWorkout } from '../lib/generate.js'
import { groupSetsOf, weeklyDone } from '../lib/coverage.js'
import {
  GOAL_PRESETS, MAX_GOAL, MIN_GOAL, baseGoalOf, defaultTargetFor, goalEstimate, goalGroups,
  sessionMinutes, weeklyTargets,
} from '../lib/goals.js'
import {
  DAY_NAME, DEFAULT_WEEKS, PROGRAM_WEEKS, isPlanProgram, isProgram, newPlanProgram, planExclude, programCalendar, programForecast, programMonths, programOver, programSummary, planAhead,
  programShare, programWeek, sizeDay, suggestDay, templateOf,
} from '../lib/program.js'
import {
  DAY_TYPES, EQUIPMENT, LEVELS, PLAN_BASES, PLAN_DAYS, PLAN_DEFAULTS, PLAN_MINUTES, PLAN_TEMPLATES, SCHEMES, blocker, configOf, fixFor, plan, scheduleOf,
} from '../lib/planner.js'
import { KIND_COLOR } from '../lib/workout-kind.js'
import { glyphOf } from '../lib/glyphs.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { startGenerated, confirmSheet, workoutDetailSheet } from '../sheets.jsx'
import { Button, Segmented, Stepper } from './ui.jsx'
import CoverageStrip from './CoverageStrip.jsx'
import { groupColor } from '../lib/muscle-colors.js'
import Icon from './Icon.jsx'
import { useMuscleRoles } from './MuscleRoles.jsx'
import { rolesLoaded } from '../lib/muscle-roles.js'
import { exOr } from '../lib/exercises.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { doneUnits, workoutDuration, workoutVolume } from '../lib/history.js'
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
  // What the plan leaves out and the goals it builds to; again once the muscle roles are in, as
  // the planner counts a set the way the app does with them.
  useMuscleRoles()
  const roles = rolesLoaded()
  // Groups set on their own (goals.js byGroup): edited here, saved with the program.
  const [byGroup, setByGroup] = useState(() => ({ ...(S.goals?.byGroup || {}) }))
  const [groupsOpen, setGroupsOpen] = useState(false)
  const env = useMemo(() => ({ exclude: planExclude(S), byGroup }), [S, roles, byGroup])
  const [o, setO] = useState(() => {
    const from = running?.template === template ? running.plan : {}
    const start = { ...PLAN_DEFAULTS, ...from, template }
    const fix = blocker({ ...start, ...env }).length ? fixFor({ ...start, ...env }) : null
    return fix ? { ...start, ...fix } : start
  })
  const [weeks, setWeeks] = useState(() => running?.weeks || DEFAULT_WEEKS)
  const [note, setNote] = useState('')
  // The planner is quick, but the controls ask it a hundred times; once each is plenty.
  const memo = useMemo(() => new Map(), [env])
  const blocked = x => {
    const key = JSON.stringify(x)
    if (!memo.has(key)) memo.set(key, blocker({ ...x, ...env }))
    return memo.get(key)
  }
  const week = useMemo(() => plan({ ...o, ...env }), [o, env])
  const cfg = week.cfg

  const pick = (key, v) => {
    const next = { ...o, [key]: v }
    const fix = blocked(next).length ? fixFor({ ...next, ...env }, key === 'days' || key === 'minutes' ? key : undefined, { ...o, ...env }) : null
    setNote(fix ? t('{0} needs more training time, so it also set {1}.', t(SETTING_NAME[key]), fixText(fix, o)) : '')
    setO(fix ? { ...next, ...fix } : next)
  }
  const options = (key, values, label) => values.map(v => {
    const opt = { value: v, label: label(v) }
    if (v === o[key]) return opt
    const next = { ...o, [key]: v }
    if (!blocked(next).length) return opt
    const fix = fixFor({ ...next, ...env }, key === 'days' || key === 'minutes' ? key : undefined, { ...o, ...env })
    return fix ? { ...opt, needs: true, title: t('Needs {0}. Picking it changes that too.', fixText(fix, o)) }
      : { ...opt, disabled: true, title: t("Can't reach the weekly goal with this.") }
  })
  const seg = (key, values, label) => <>
    <h4 className="sec">{t(SETTING_NAME[key])}</h4>
    <Segmented value={o[key]} onChange={v => pick(key, v)} options={options(key, values, label)} />
  </>
  const short = week.short.filter(x => x.cause !== 'planner')
  const updating = !!running && !programOver(S)
  const own = Object.keys(byGroup).length
  const setGroup = (g, v) => setByGroup(x => {
    const out = { ...x }
    if (v == null || v === defaultTargetFor(g, cfg.base)) delete out[g]
    else out[g] = v
    return out
  })

  const start = () => {
    const go = () => {
      const program = newPlanProgram({ ...o, byGroup }, { weeks, today: todayISO(), exclude: env.exclude })
      if (!program) return
      // An update keeps the weeks already done: the program still starts when it started.
      if (updating) program.startedAt = S.program.startedAt
      update(s => {
        s.program = program
        s.goals = { ...(s.goals || {}), weeklySets: cfg.base, days: cfg.days, byGroup }
      })
      ui().toast(updating ? t('Program updated.') : t('Program started. Home shows your next day.'))
    }
    close()
    // A program of another kind (a template one) is replaced, after asking; a plan one is updated.
    if (isProgram(S.program) && !updating) confirmSheet({ title: t('Replace your program?'), message: t('The program running now ends. Your workouts stay as they are.'), confirmText: t('Replace'), onConfirm: go })
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
      <button type="button" className="plan-adjust" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(v => !v)} data-adjust-groups>
        <span className="grow"><span className="tt">{t('Adjust by muscle group')}</span>
          <span className="ss">{own ? t('Set on their own: {0}', own) : t('All groups follow the goal')}</span></span>
        <Icon name="chevronRight" className={'menu-chev' + (groupsOpen ? ' open' : '')} />
      </button>
      {groupsOpen && <>
        <div className="muted small" style={{ marginTop: 8 }}>{t('Hard sets a week for each group. Calves, forearms and abs follow two thirds of the goal.')}</div>
        <div className="list goal-groups plan-groups">{ADD_GROUPS.map(g => {
          const mine = byGroup[g.id] != null
          return <div key={g.id} className="item" data-group={g.id}>
            <span className="plan-gdot" style={{ background: groupColor(g.id) }} />
            <div className="grow"><div className="tt">{t(g.n)}</div>
              <div className="ss">{mine ? <button type="button" className="linkish" onClick={() => setGroup(g.id, null)}>{t('Set on its own · reset')}</button> : t('Follows the goal')}</div></div>
            <Stepper value={mine ? byGroup[g.id] : defaultTargetFor(g.id, cfg.base)} step={1} min={0} max={MAX_GOAL} decimal={false} ariaLabel={t(g.n)} onChange={n => setGroup(g.id, n)} />
          </div>
        })}</div>
      </>}
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
      <Button variant="primary" onClick={start}>{updating ? t('Update program') : t('Start program')}</Button>
      {updating && <div className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>{t('Rebuilds the weeks still ahead. Logged workouts stay as they are.')}</div>}
    </div>
  </div>
}
export const programSetupSheet = template => ui().openSheet(close => <PlanBuilder template={template} close={close} />)

const SHORT_TEMPLATE = { full: 'Full body', ul: 'Upper/lower', ppl: 'PPL' }

/* ===================== Plan → Schedule, Program chosen ===================== */

/** The splits to start a program from, each with a bar per day in its kind's colour. */
function TemplateList({ active, days, skip }) {
  return <div className="list">{Object.entries(PLAN_TEMPLATES).filter(([id]) => id !== skip).map(([id, p]) => <div key={id} className="item" role="button" {...tappable(() => programSetupSheet(id))}>
    <div className="grow">
      <div className="tt">{t(p.n)}{active === id && <span className="muted"> · {t('running')}</span>}</div>
      <div className="ss">{t(p.sub)}</div>
      <div className="prog-bars" aria-hidden="true">{scheduleOf(configOf({ template: id, days })).map((d, i) => <i key={i} style={{ background: KIND_COLOR[d] }} />)}</div>
    </div>
    <Icon name="chevronRight" className="menu-chev" />
  </div>)}</div>
}

/** Ends the program, after asking; `then` runs once it is ended (the way of training switched to). */
export const endProgram = then => confirmSheet({
  title: t('End the program?'), message: t('Your workouts and goal stay. Your fixed week or rotation takes over again.'), confirmText: t('End program'),
  danger: true, onConfirm: () => { update(s => { s.program = null }); then?.() },
})

const groupsOf = (S, type) => (isPlanProgram(S.program) ? DAY_TYPES[type].groups : ({ ...genDefaults(type), ...(S.genSetup?.[type] || {}) }).groups)
const useAhead = (S, days) => {
  useMuscleRoles()
  return useMemo(() => (days > 0 ? planAhead(S, { days }) : []), [S, days, rolesLoaded()])
}
// The forecast days up to and including the last one on or before `iso`, for useAhead.
const aheadTo = (S, iso) => programForecast(S).findLastIndex(f => f.iso <= iso) + 1

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
 * A day ahead on its own, from Home's calendar: said to be planned, and the next one can be
 * started from here. Starting builds the next day, so a later one cannot. With nothing planned
 * that day, just the date.
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

/* ============================ the program calendar ============================ */

// Plan → Program while one runs: the program's month (lib/program.js programCalendar), a dot a
// workout in its kind's colour, a ring a week, and under it whatever is picked: a day done, the
// next one, one planned, or a week with what its days add up to.

const monthAdd = (m, n) => isoOf(new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1, 12)).slice(0, 7)
const monthName = m => new Date(m + '-01T12:00:00').toLocaleDateString(dateLocale(), { month: 'long', year: 'numeric' })
const timeOf = ts => new Date(ts).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })
const workSets = e => (e.sets || []).filter(s => !isWarmupRow(s))
const doneSets = w => (w.entries || []).reduce((n, e) => n + workSets(e).reduce((m, s) => m + doneUnits(s), 0), 0)
const kindTag = (state, iso) => (state === 'done' ? ['done', t('Done')] : iso === todayISO() ? ['today', t('Today')] : state === 'next' ? ['today', t('Next')] : ['planned', t('Planned')])
const Tag = ({ state, iso }) => { const [c, label] = kindTag(state, iso); return <span className={'cal-tag ' + c}>{label}</span> }

function ProgramCalendar({ S, month, setMonth, span, rows, sel, onSel }) {
  const today = todayISO()
  const ws = weekStartOf(S)
  const kinds = [...new Set(S.program.days)]
  const toToday = () => { setMonth(today.slice(0, 7)); onSel({ iso: today }) }
  return <div className="pcal" data-program-calendar>
    <div className="pcal-h">
      <h3>{monthName(month)}</h3>
      {month !== today.slice(0, 7) && <button type="button" className="pcal-today" onClick={toToday}>{t('Today')}</button>}
      <button type="button" className="pcal-nav" aria-label={t('Previous month')} disabled={month <= span.from} onClick={() => setMonth(monthAdd(month, -1))}><Icon name="chevronLeft" /></button>
      <button type="button" className="pcal-nav" aria-label={t('Next month')} disabled={month >= span.to} onClick={() => setMonth(monthAdd(month, 1))}><Icon name="chevronRight" /></button>
    </div>
    <div className="pcal-g">
      <span className="pcal-wd" aria-hidden="true">{t('Wk')}</span>
      {weekOrder(ws).map(d => <span key={d} className="pcal-wd" aria-hidden="true">{t(DAYS[d])}</span>)}
      {rows.map(r => {
        const weekSel = sel?.week === r.start
        const total = r.done + r.planned
        return <Fragment key={r.start}>
          {r.week ? <button type="button" className={'pcal-wk' + (weekSel ? ' sel' : '')} aria-label={t('Week {0}', r.week)} aria-pressed={weekSel}
            style={{ '--fill': `${total ? (r.done / total) * 360 : 0}deg` }} onClick={() => onSel({ week: r.start })}><span>{r.week}</span></button>
            : <span />}
          {r.days.map(d => {
            const it = d.items[0]
            const cls = ['pcal-d', !d.inMonth && 'out', !it && 'rest', it?.state === 'done' && 'done', d.iso === today && 'today',
              sel?.iso === d.iso && 'sel', weekSel && it && 'inweek'].filter(Boolean).join(' ')
            return <button key={d.iso} type="button" className={cls} style={it ? { '--kind': KIND_COLOR[it.type] } : undefined}
              aria-label={fmtDate(d.iso, true) + (it ? ' · ' + d.items.map(x => t(DAY_NAME[x.type])).join(' + ') : '')} aria-pressed={sel?.iso === d.iso}
              onClick={() => onSel({ iso: d.iso })}>
              <span>{Number(d.iso.slice(8))}</span>{it && <i />}
            </button>
          })}
        </Fragment>
      })}
    </div>
    <div className="pcal-key">
      {kinds.map(k => <span key={k}><i style={{ background: KIND_COLOR[k] }} />{t(DAY_NAME[k])}</span>)}
      <span><i className="done" />{t('Done')}</span>
      <span><i className="today" />{t('Today')}</span>
    </div>
  </div>
}

/** A day done for the program: its numbers, a best, the sets per group and the sets of each lift. */
function DoneDay({ S, item }) {
  const w = item.w
  const adds = useMemo(() => groupSetsOf([w]), [w])
  const prs = [...new Set(w.prs || [])].map(id => exerciseNameFor(exOr(id)))
  return <section className="card pday" data-day-panel="done">
    <div className="pday-h">
      <span className="pday-i done"><Icon name="check" /></span>
      <div className="grow">
        <div className="pday-t"><h3>{fmtDate(w.d, true)} · {t(DAY_NAME[item.type])}</h3><Tag state="done" /></div>
        <div className="muted small">{t('Day {0}', item.k + 1)}{w.start ? ' · ' + timeOf(w.start) : ''}</div>
      </div>
    </div>
    <div className="pstats three">
      <div><b>{doneSets(w)}</b><span>{t('sets')}</span></div>
      <div><b>{workoutDuration(w) >= 60000 ? fmtDur(workoutDuration(w)) : '–'}</b><span>{t('time')}</span></div>
      <div><b>{fmtNum(Math.round(workoutVolume(w)))}</b><span>{t('{0} lifted', S.unit)}</span></div>
    </div>
    {prs.length > 0 && <div className="pday-pr"><span>{t('PR')}</span>{prs.join(', ')}</div>}
    <CoverageStrip groups={goalGroups(S)} adds={adds} goals={weeklyTargets(S)} label={t('Sets logged per group')} />
    <div className="list pday-lifts">{(w.entries || []).map((e, i) => {
      const ex = exOr(e.id)
      const chips = workSets(e).filter(s => doneUnits(s)).map(s => (s.sec ? `${fmtNum(s.sec)}s` : `${s.w > 0 ? fmtNum(s.w) + ' ' : ''}× ${s.r ?? ''}`))
      return <div key={e.id + i} className="item">
        <Thumb ex={ex} />
        <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
          <div className="pday-chips">{chips.map((c, j) => <span key={j}>{c}</span>)}</div></div>
      </div>
    })}</div>
    <Button variant="tinted" onClick={() => workoutDetailSheet(w)}>{t('Open in History')}</Button>
  </section>
}

/** A day ahead: what Start would build for it if the days before it go as planned. */
function PlannedDay({ S, iso, items }) {
  const all = useAhead(S, useMemo(() => aheadTo(S, iso), [S, iso]))
  const ahead = all.filter(d => d.iso === iso)
  const next = items.some(x => x.state === 'next')
  const state = next ? 'next' : 'planned'
  if (!ahead.length) return null
  const n = ahead.reduce((a, d) => ({ ex: a.ex + d.entries.length, sets: a.sets + d.sets, min: a.min + d.minutes }), { ex: 0, sets: 0, min: 0 })
  const kind = KIND_COLOR[ahead[0].type]
  return <section className="card pday" data-day-panel={state}>
    <div className="pday-h">
      <span className="pday-i" style={{ background: `color-mix(in srgb,${kind} 22%,transparent)`, color: kind }}><Icon name={glyphOf(KIND_ICON[ahead[0].type])} /></span>
      <div className="grow">
        <div className="pday-t"><h3>{fmtDate(iso, true)} · {ahead.map(d => t(DAY_NAME[d.type])).join(' + ')}</h3><Tag state={state} iso={iso} /></div>
        <div className="muted small">{tn('{0} exercise', '{0} exercises', n.ex)} · {tn('{0} set', '{0} sets', n.sets)} · {t('≈ {0} min', n.min)}</div>
      </div>
    </div>
    {next && !S.active && <Button variant="primary" icon="play" onClick={() => startGenerated(ahead[0].type, ahead[0].k)}>{t('Start workout')}</Button>}
    {!next && <div className="muted small">{t('Weights here are a forecast. They move on as you log the workouts before this one.')}</div>}
    {ahead.map(d => <AheadBody key={d.type} S={S} day={d} />)}
  </section>
}

/** A calendar week: done against still planned per group, with the goal, and its days. */
function WeekPanel({ S, row, onSel }) {
  const items = row.days.flatMap(d => d.items.map(it => ({ ...it, iso: d.iso })))
  const last = items.filter(it => it.state !== 'done').at(-1)?.iso
  const all = useAhead(S, useMemo(() => (last ? aheadTo(S, last) : 0), [S, last]))
  const ahead = all.filter(d => d.iso >= row.start && d.iso <= row.days[6].iso)
  const done = useMemo(() => groupSetsOf(items.filter(it => it.w).map(it => it.w)), [row])
  const planned = {}
  for (const d of ahead) for (const [g, v] of Object.entries(d.groups)) planned[g] = (planned[g] || 0) + v
  const sets = Math.round(ahead.reduce((n, d) => n + d.sets, 0))
  const groups = [...new Set(S.program.days.flatMap(type => groupsOf(S, type)))]
  return <section className="card pday" data-day-panel="week">
    <div>
      <h3>{t('Week {0}', row.week)} · {fmtDateRange(row.start, row.days[6].iso)}</h3>
      <div className="muted small">{t('{0} of {1} workouts done', row.done, row.done + row.planned)}{sets ? ' · ' + t('{0} sets planned', sets) : ''}</div>
    </div>
    <CoverageStrip groups={groups} adds={done} ahead={planned} goals={weeklyTargets(S)} label={t('Solid: done · Light: still planned · Tick: weekly goal')} />
    <div className="list pweek-days">{items.map((it, i) => {
      const a = ahead.find(d => d.iso === it.iso && d.type === it.type)
      const sub = it.w ? [tn('{0} exercise', '{0} exercises', (it.w.entries || []).length), tn('{0} set', '{0} sets', doneSets(it.w)), workoutDuration(it.w) >= 60000 && fmtDur(workoutDuration(it.w))]
        : a ? [tn('{0} exercise', '{0} exercises', a.entries.length), tn('{0} set', '{0} sets', a.sets), t('≈ {0} min', a.minutes)] : []
      return <div key={it.iso + i} className="item" role="button" {...tappable(() => onSel({ iso: it.iso }))}>
        <span className={'pweek-dot' + (it.state === 'done' ? '' : ' open')} style={{ '--kind': KIND_COLOR[it.type] }} />
        <div className="grow"><div className="tt">{fmtDate(it.iso, true)} · {t('Day {0}', it.k + 1)}</div><div className="ss">{sub.filter(Boolean).join(' · ')}</div></div>
        <Tag state={it.state} iso={it.iso} />
        <Icon name="chevronRight" className="menu-chev" />
      </div>
    })}</div>
  </section>
}

/** Whatever is picked on the calendar. */
function CalendarPanel({ S, rows, sel, onSel, span }) {
  if (sel?.week) {
    const row = rows.find(r => r.start === sel.week)
    return row ? <WeekPanel S={S} row={row} onSel={onSel} /> : null
  }
  const day = rows.flatMap(r => r.days).find(d => d.iso === sel?.iso)
  if (!day) return null
  const done = day.items.filter(it => it.state === 'done')
  const left = day.items.filter(it => it.state !== 'done')
  if (!day.items.length) return <section className="card pday rest" data-day-panel="rest">
    <h3>{fmtDate(day.iso, true)}</h3>
    <div className="muted small">{day.iso > span.end ? t('After the program') : day.iso < S.program.startedAt ? t('Before the program') : t('Rest day')}</div>
  </section>
  return <>
    {done.map((it, i) => <DoneDay key={'d' + i} S={S} item={it} />)}
    {left.length > 0 && <PlannedDay key={day.iso} S={S} iso={day.iso} items={left} />}
  </>
}

/** A program run to its end: what it added up to, and what to run next. */
function ProgramDone({ S }) {
  const sum = useMemo(() => programSummary(S), [S])
  const p = S.program
  const tpl = isPlanProgram(p) ? PLAN_TEMPLATES[p.template] : templateOf(p.template)
  return <>
    <section className="card pdone" data-program-done>
      <div className="pday-h">
        <span className="pday-i big"><Icon name="check" /></span>
        <div className="grow"><h3>{t('Program done')}</h3>
          <div className="muted small">{tpl ? t(tpl.n) : t('Program')} · {fmtDateRange(sum.from, sum.to)} · {t('{0} wk', p.weeks)}</div></div>
      </div>
      <div className="pstats">
        <div><b>{sum.workouts} / {sum.total}</b><span>{t('workouts')}</span></div>
        <div><b>{sum.weeks} / {p.weeks}</b><span>{t('weeks done')}</span></div>
        <div><b>{fmtNum(sum.sets)}</b><span>{t('sets')}</span></div>
        <div><b>{sum.prs}</b><span>{t('PRs')}</span></div>
      </div>
      {sum.gains.length > 0 && <div className="pdone-gains">{sum.gains.map(g => <div key={g.id}>
        <span className={exerciseNameClass(exOr(g.id))}>{exerciseNameFor(exOr(g.id))}</span><b>{fmtNum(g.from)} → {fmtNum(g.to)} {S.unit}</b>
      </div>)}</div>}
      <Button variant="primary" onClick={() => changeProgram(S)}>{t('Run it again')}</Button>
    </section>
    <h4 className="sec" style={{ marginTop: 18 }}>{t('Or choose another')}</h4>
    <TemplateList skip={isPlanProgram(p) ? p.template : null} days={isPlanProgram(p) ? p.plan.days : S.goals?.days || PLAN_DEFAULTS.days} />
  </>
}

/**
 * Plan's "How you train" row with a program running (views/Plan.jsx): its name, and where it is.
 * The row's sheet changes the program or ends it, so the page below is just the days.
 */
export function programHeadline(S) {
  const p = S.program
  const tpl = isPlanProgram(p) ? PLAN_TEMPLATES[p.template] : templateOf(p.template)
  const pw = programWeek(S)
  const where = programOver(S) ? t('Program done') : t('Week {0} of {1}', pw.week, p.weeks)
  return { name: tpl ? t(tpl.n) : t('Program'), sub: [where, isPlanProgram(p) && planSummary(p.plan)].filter(Boolean).join(' · ') }
}
/** The running program's settings in a line, for How you train's Change program row. */
export function programSettingsLine(S) {
  const p = S.program
  if (!isPlanProgram(p)) return ''
  const pl = p.plan
  return [t(SHORT_TEMPLATE[p.template]), t(SCHEMES[pl.goal]?.n), t('{0} days', pl.days), t('{0} min', pl.minutes),
    t('{0} sets a week per group', pl.base > 0 ? pl.base : SCHEMES[pl.goal]?.base)].join(' · ')
}
/** Opens the setup for another program, on the running one's split when it has one. */
export const changeProgram = S => programSetupSheet(isPlanProgram(S.program) ? S.program.template : Object.keys(PLAN_TEMPLATES)[0])

/** Plan → Schedule with Program chosen: the program's calendar, or the programs to choose from. */
export function ProgramMode() {
  const S = useStore(s => s.S)
  const p = isProgram(S.program) ? S.program : null
  const over = p && programOver(S)
  const span = useMemo(() => (p ? programMonths(S) : null), [S, p])
  // Opens on the next workout's day, or the last one done once the program is over.
  const first = useMemo(() => {
    if (!p) return null
    const f = programForecast(S)[0]
    if (f) return f.iso
    return programSummary(S)?.to || todayISO()
  }, [S, p])
  const [month, setMonth] = useState(() => first?.slice(0, 7))
  const [sel, setSel] = useState(() => (first ? { iso: first } : null))
  const shown = month || first?.slice(0, 7)
  const rows = useMemo(() => (p && shown ? programCalendar(S, shown) : null), [S, p, shown])
  const cur = sel || (first ? { iso: first } : null)
  if (p && rows) {
    const pick = s => setSel(s.week && cur?.week === s.week ? null : s)
    return <>
      <ProgramCalendar S={S} month={shown} setMonth={setMonth} span={span} rows={rows} sel={cur} onSel={pick} />
      {p.weeks > 0 && shown === span.to && span.end.slice(0, 7) === shown && <div className="pcal-end" data-program-end>
        {t('Program ends {0}. Week {1} is the last; the days after it stay empty.', fmtDate(span.end, true), p.weeks)}</div>}
      {over ? <ProgramDone S={S} /> : <CalendarPanel S={S} rows={rows} sel={cur} onSel={pick} span={span} />}
    </>
  }
  return <>
    <div className="card prog-intro">
      <span className="prog-intro-i"><Icon name="calendar" /></span>
      <h3>{t('Let the app plan your weeks')}</h3>
      <div className="muted small">{t('Pick a split, your goal and how long you have. You get a month of one-tap workouts that add up to your weekly goal, and the calendar shows each one.')}</div>
    </div>
    <h4 className="sec" style={{ marginTop: 18 }}>{t('Choose a program')}</h4>
    <TemplateList days={S.goals?.days || PLAN_DEFAULTS.days} />
    <p className="sect-f">{t('No calendar until a program runs. Your fixed week or rotation stays in charge meanwhile.')}</p>
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
      <Button size="sm" variant="tinted" icon="target" onClick={() => (isProgram(S.program) ? changeProgram(S) : goalSheet())}>{t('Goal: {0}', baseGoalOf(S))}</Button>
    </div>
    <CoverageStrip groups={groups} adds={done} goals={goals}
      label={isProgram(S.program) ? t('Sets per group this week, against your goal') : t('Sets per group over the last 7 days, against your goal')} />
  </div>
}
