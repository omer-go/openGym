import { Fragment, useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t, tn, dateLocale, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { DAYS, fmtDate, fmtDateRange, fmtDur, fmtNum, isoOf, todayISO, weekOrder, weekStartOf } from '../lib/format.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import { genDefaults, genSets, generateWorkout, planPool } from '../lib/generate.js'
import { groupSetsOf, weeklyDone } from '../lib/coverage.js'
import {
  MAX_GOAL, VOLUMES, VOLUME_NAME, defaultTargetFor, goalEstimate, goalGroups, goalTypeOf,
  sessionMinutes, volumeOf, weeklyTargets,
} from '../lib/goals.js'
import {
  DAY_NAME, DEFAULT_WEEKS, PROGRAM_WEEKS, isPlanProgram, isProgram, newPlanProgram, planExclude, programCalendar, programForecast, programMonths, programOver, programSummary, planAhead,
  programShare, programWeek, sizeDay, suggestDay, templateOf, weekChanges,
} from '../lib/program.js'
import {
  DAY_TYPES, EQUIPMENT, LEVELS, PLAN_DAYS, PLAN_DEFAULTS, PLAN_MINUTES, PLAN_TEMPLATES, SCHEMES, blocker, configOf, fixFor, plan, scheduleOf,
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
import SwipeCards from './SwipeCards.jsx'
import Equivalents from './Equivalents.jsx'
import { equivalentsOf } from '../lib/equivalents.js'

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
  const sets = picks.reduce((n, p) => n + genSets(p.id, setup, p.slot, p.extra), 0)
  return { count: picks.length, sets, minutes: sessionMinutes(sets) }
}

/* ============================ the weekly goal ============================ */

// The kind of goal, which sets every group's own (goals.js GOAL_SETS), how far along its range
// they all sit (the volume), the days a week, and any group set on its own. Saved on Done.
function GoalSheet({ close }) {
  const S = useStore(s => s.S)
  const [type, setType] = useState(() => goalTypeOf(S))
  const [days, setDays] = useState(() => S.goals?.days || 4)
  const [volume, setVolume] = useState(() => volumeOf(S))
  const [byGroup, setByGroup] = useState(() => ({ ...(S.goals?.byGroup || {}) }))
  const draft = { ...S, goals: { ...S.goals, type, days, volume, byGroup } }
  const est = goalEstimate(draft, goalGroups(draft))
  const programDays = isProgram(S.program) ? S.program.days.length : 0
  const setGroup = (g, v) => setByGroup(x => {
    const out = { ...x }
    if (v === defaultTargetFor(g, type, volume) || v == null) delete out[g]
    else out[g] = v
    return out
  })
  const save = () => {
    update(s => { s.goals = { ...(s.goals || {}), type, days, volume, byGroup } })
    close()
  }
  return <div className="wd-fit">
    <div style={{ flex: 'none' }}>
      <h3>{t('Weekly goal')}</h3>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 6 }}>{t('Hard sets for each muscle group, every week. The one-tap workouts fill what is left.')}</div>
    </div>
    <div className="wd-scroll sheet-scroll">
      <h4 className="sec">{t('Training goal')}</h4>
      <Segmented value={type} onChange={setType} options={Object.keys(SCHEMES).map(k => ({ value: k, label: t(SCHEMES[k].n) }))} />
      <div className="muted small" style={{ marginTop: 8 }}>{t('Each group gets its own number of sets for the goal.')}</div>

      <h4 className="sec">{t('Weekly volume')}</h4>
      <Segmented value={volume} onChange={setVolume} options={VOLUMES.map(v => ({ value: v, label: t(VOLUME_NAME[v]) }))} />
      <div className="muted small" style={{ marginTop: 8 }}>{t('Moves every group along its range, from the least that keeps it growing to the most it recovers from.')}</div>

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
        const v = own ? byGroup[g.id] : defaultTargetFor(g.id, type, volume)
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

const SETTING_NAME = { template: 'Split', goal: 'Training goal', level: 'Level', equipment: 'Equipment', days: 'Days a week', minutes: 'Session length', volume: 'Weekly volume' }
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

// A lift's swipe goes through this many of its equivalents, then See all.
const SWAPS = 8

/** Your pick for a program slot from all of a lift's equivalents (lib/equivalents.js). */
const swapSheet = (ex, pick) => ui().openSheet(close => <>
  <h3 style={{ marginBottom: 2 }}>{t('Instead of {0}', exerciseNameFor(ex))}</h3>
  <div className="muted small">{t('Takes its slot and its sets in the program.')}</div>
  <Equivalents ex={ex} onOpen={e => { pick(e.id); close() }} />
</>)

/**
 * A program day's lift, swiped sideways through the lifts that could take its slot: the planner's
 * pick, its closest equivalents in your list, then See all. `onSwap(from, to)` puts `to` in the
 * slot of the planner's `from`; to `from` itself undoes it.
 */
function SwapLift({ item, day, render, onSwap }) {
  const S = useStore(s => s.S)
  const roles = rolesLoaded()
  const from = item.from || item.ex.id
  const others = day.items.filter(x => x !== item).map(x => x.ex.id).join()
  const ids = useMemo(() => {
    const taken = new Set(others.split(','))
    const eq = equivalentsOf(S, from).map(x => x.ex.id).filter(id => !taken.has(id)).slice(0, SWAPS)
    // A lift picked from See all stays next to the planner's while it is the one in the slot.
    return [from, ...(eq.includes(item.ex.id) || item.ex.id === from ? [] : [item.ex.id]), ...eq]
  }, [S, from, others, item.ex.id, roles])
  const at = ids.indexOf(item.ex.id)
  const go = n => (n === ids.length ? swapSheet(exOr(from), id => onSwap(from, id)) : n >= 0 && n < ids.length && onSwap(from, ids[n]))
  const row = (n, nav) => n === ids.length
    ? <div className="item plan-swap-all"><Icon name="shuffle" /><div className="grow tt">{t('See all equivalents')}</div><Icon name="chevronRight" /></div>
    : render(exOr(ids[n]), { at: n, of: ids.length, from: n > 0 ? exOr(from) : null, nav })
  return <SwipeCards index={at} count={ids.length + 1} revision={item.ex.id} onNavigate={d => go(at + d)} renderPreview={d => row(at + d)}>
    {row(at, { prev: at > 0 ? () => go(at - 1) : null, next: () => go(at + 1), undo: () => onSwap(from, from) })}
  </SwipeCards>
}

/**
 * One day of a plan being set up: its size, folded open to its lifts, each swiped through its
 * equivalents (SwapLift). Editing a program, `change` (program.js weekChanges) marks what the day
 * gains, drops and does other sets of.
 */
function PreviewDay({ day, k, change, onSwap }) {
  const [open, setOpen] = useState(k === 0)
  const added = new Set(change?.added || [])
  const sets = new Map((change?.changed || []).map(c => [c.id, c.from]))
  const moved = change && (change.from == null || change.sets[0] !== change.sets[1] || change.added.length || change.removed.length)
  const color = KIND_COLOR[day.type]
  return <div className={'ahead-day plan-prev' + (open ? ' open' : '')} style={{ '--kind': color }}>
    <button type="button" className="ahead-h" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span className="lrow-i" style={{ background: `color-mix(in srgb,${color} 22%,transparent)`, color }}><Icon name={glyphOf(KIND_ICON[day.type])} /></span>
      <div className="grow">
        <div className="tt">{t('Day {0}', k + 1)} · {t(DAY_NAME[day.type])}</div>
        <div className="ss">{tn('{0} exercise', '{0} exercises', day.items.length)} · {change && change.from != null && change.sets[0] !== day.sets && <><s>{change.sets[0]}</s> → </>}{tn('{0} set', '{0} sets', day.sets)} · {t('≈ {0} min', day.minutes)}</div>
      </div>
      {change && <span className={'plan-tag' + (moved ? ' on' : '')}>{change.from == null ? t('New day') : moved ? t('Changes') : t('Same')}</span>}
      <Icon name="chevronRight" />
    </button>
    {open && <div className="ahead-b"><div className="list">{day.items.map(i => {
      const isNew = change && change.from != null && added.has(i.ex.id)
      return <SwapLift key={i.from || i.ex.id} item={i} day={day} onSwap={(from, to) => onSwap(k, from, to)} render={(ex, sw) =>
        <div className={'item plan-row' + (sw.from ? ' plan-swap-on' : isNew ? ' plan-added' : '')} data-swap={sw.at}>
          <Thumb ex={ex} />
          <div className="plan-row-n"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div></div>
          <div className="ss plan-row-m">{isNew && !sw.from && <span className="plan-tag on">{t('New')}</span>}{groupName(i.ex.p[0])} · {sets.has(i.ex.id) && <><s>{sets.get(i.ex.id)}</s> → </>}{liftLine({ sets: i.sets, ...i.rx })}</div>
          {/* On the card sliding in too (no nav: inert), so it lines up with the one sliding out. */}
          <div className="plan-swap-nav" inert={sw.nav ? undefined : true}>
            {/* Always there, hidden until a swap, so a row keeps its size as you swipe. */}
            <button type="button" className={'iconbtn plan-swap-undo' + (sw.from ? '' : ' off')} aria-label={sw.from ? t('Back to {0}', exerciseNameFor(sw.from)) : undefined} aria-hidden={!sw.from} tabIndex={sw.from ? 0 : -1} onClick={sw.nav?.undo}><Icon name="undo" /></button>
            <button type="button" className="iconbtn" aria-label={t('Previous equivalent')} disabled={!sw.nav?.prev && sw.at === 0} onClick={sw.nav?.prev}><Icon name="chevronLeft" /></button>
            <span className="plan-swap-at">{t('{0} of {1}', sw.at + 1, sw.of)}</span>
            <button type="button" className="iconbtn" aria-label={t('Next equivalent')} onClick={sw.nav?.next}><Icon name="chevronRight" /></button>
          </div>
        </div>} />
    })}{change?.removed.map(id => {
      const ex = exOr(id)
      return <div key={id} className="item plan-removed">
        <Thumb ex={ex} />
        <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
          <div className="ss">{t('Dropped')}</div></div>
      </div>
    })}</div></div>}
  </div>
}

/**
 * A program from settings (lib/planner.js): the split, goal, level, equipment, days, volume, sets
 * and session length, and the week they build, each day's lifts fixed for the program. A setting
 * that can't reach the weekly goal at these days and minutes brings the ones it needs (marked +),
 * or can't be picked when no number of them would. Start makes it the program, and its sets the
 * weekly goal. Editing the running one puts days, length and volume first, the rest folded away,
 * keeps its lifts where they still fit and shows what the week gains and drops before saving.
 */
function PlanBuilder({ template, close }) {
  const S = useStore(s => s.S)
  const running = isPlanProgram(S.program) ? S.program : null
  const updating = !!running && !programOver(S)
  // The lifts the program has, kept where they still fit (planner.js variant); until Other lifts.
  const [keep, setKeep] = useState(() => (updating ? running.week.map(d => d.items.map(i => i.id)) : undefined))
  const [moreOpen, setMoreOpen] = useState(false)
  // The lifts you swiped in, a day at a time: the planner's pick -> yours (planner.js swapIn).
  const [swap, setSwap] = useState([])
  const onSwap = (k, from, to) => setSwap(w => {
    const out = [...w]
    out[k] = { ...out[k], [from]: to }
    if (to === from) delete out[k][from]
    return out
  })
  // What the plan leaves out and the goals it builds to; again once the muscle roles are in, as
  // the planner counts a set the way the app does with them.
  useMuscleRoles()
  const roles = rolesLoaded()
  // Groups set on their own (goals.js byGroup): edited here, saved with the program.
  const [byGroup, setByGroup] = useState(() => ({ ...(S.goals?.byGroup || {}) }))
  const [groupsOpen, setGroupsOpen] = useState(false)
  // While the lifts are kept, a change of the goals alone keeps the week and moves its sets (planner.js baseOf).
  const base = useMemo(() => (updating ? { ...running, plan: { volume: volumeOf(S), ...running.plan }, byGroup: S.goals?.byGroup } : undefined), [running])
  const env = useMemo(() => ({ exclude: planExclude(S), pool: planPool(S), byGroup, keep, base: keep && base, swap }), [S, roles, byGroup, keep, base, swap])
  const [o, setO] = useState(() => {
    const from = running?.template === template ? running.plan : {}
    const start = { ...PLAN_DEFAULTS, volume: volumeOf(S), ...from, template }
    // A running program opens as it is: the days and minutes are the user's, short of the goal or not.
    const fix = !updating && blocker({ ...start, ...env }).length ? fixFor({ ...start, ...env }) : null
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

  // The days and the minutes are the user's time, and neither moves the other: one that falls short
  // shows which groups instead. The other settings, starting a program, take the time they need.
  const free = key => key === 'days' || key === 'minutes' || updating
  const pick = (key, v) => {
    const next = { ...o, [key]: v }
    const fix = !free(key) && blocked(next).length ? fixFor({ ...next, ...env }, undefined, { ...o, ...env }) : null
    setNote(fix ? t('{0} needs more training time, so it also set {1}.', t(SETTING_NAME[key]), fixText(fix, o)) : '')
    setO(fix ? { ...next, ...fix } : next)
  }
  const options = (key, values, label) => values.map(v => {
    const opt = { value: v, label: label(v) }
    if (v === o[key]) return opt
    const next = { ...o, [key]: v }
    if (!blocked(next).length) return opt
    // What only falls short can still be picked, the warning says which groups: the days and the
    // minutes, and anything while editing a running program, not held back by one group's last set.
    if (free(key)) return { ...opt, title: t("Can't reach the weekly goal with this.") }
    const fix = fixFor({ ...next, ...env }, undefined, { ...o, ...env })
    return fix ? { ...opt, needs: true, title: t('Needs {0}. Picking it changes that too.', fixText(fix, o)) }
      : { ...opt, disabled: true, title: t("Can't reach the weekly goal with this.") }
  })
  const seg = (key, values, label) => <>
    <h4 className="sec">{t(SETTING_NAME[key])}</h4>
    <Segmented value={o[key]} onChange={v => pick(key, v)} options={options(key, values, label)} />
  </>
  const short = week.short.filter(x => x.cause !== 'planner')
  // A session length the days don't use: what holds them shorter, so a longer one isn't a mystery.
  const longest = Math.max(0, ...week.days.map(d => d.minutes))
  const spare = cfg.minutes - longest >= 10 && (week.days.some(d => d.limit === 'accessories')
    ? t('Days take up to about {0} min: {1} allows {2} accessories a day, so the rest of the time goes unused.', longest, t(LEVELS[cfg.level].n), cfg.maxAcc)
    : t('Days take up to about {0} min: that reaches the weekly goal, so the rest of the time goes unused.', longest))
  const own = Object.keys(byGroup).length
  const changes = useMemo(() => updating ? weekChanges(running.week, week.days.map(d => ({ type: d.type, minutes: d.minutes, items: d.items.map(i => ({ id: i.ex.id, sets: i.sets })) }))) : null, [updating, running, week])
  const setGroup = (g, v) => setByGroup(x => {
    const out = { ...x }
    if (v == null || v === defaultTargetFor(g, cfg.goal, cfg.volume)) delete out[g]
    else out[g] = v
    return out
  })

  const start = () => {
    const go = () => {
      // An update keeps the weeks already done (the program still starts when it started) and,
      // until Other lifts, the lifts that still fit.
      const program = newPlanProgram({ ...o, byGroup, base: env.base, swap }, { weeks, today: todayISO(), exclude: env.exclude, pool: env.pool, from: updating && keep ? running : undefined })
      if (!program) return
      if (updating) program.startedAt = running.startedAt
      update(s => {
        s.program = program
        s.goals = { ...(s.goals || {}), type: cfg.goal, days: cfg.days, volume: cfg.volume, byGroup }
      })
      ui().toast(updating ? t('Program updated. Your next workout uses it.') : t('Program started. Home shows your next day.'))
    }
    close()
    // A program of another kind (a template one) is replaced, after asking; a plan one is updated.
    if (isProgram(S.program) && !updating) confirmSheet({ title: t('Replace your program?'), message: t('The program running now ends. Your workouts stay as they are.'), confirmText: t('Replace'), onConfirm: go })
    else go()
  }
  const rest = <>
    {seg('template', Object.keys(PLAN_TEMPLATES), v => t(SHORT_TEMPLATE[v]))}
    {seg('goal', Object.keys(SCHEMES), v => t(SCHEMES[v].n))}
    {seg('level', Object.keys(LEVELS), v => t(LEVELS[v].n))}
    {seg('equipment', Object.keys(EQUIPMENT), v => t(EQUIPMENT[v].n))}
  </>
  const groups = <>
    <button type="button" className="plan-adjust" aria-expanded={groupsOpen} onClick={() => setGroupsOpen(v => !v)} data-adjust-groups>
      <span className="grow"><span className="tt">{t('Adjust by muscle group')}</span>
        <span className="ss">{own ? t('Set on their own: {0}', own) : t('All groups follow the goal')}</span></span>
      <Icon name="chevronRight" className={'menu-chev' + (groupsOpen ? ' open' : '')} />
    </button>
    {groupsOpen && <>
      <div className="muted small" style={{ marginTop: 8 }}>{t('Hard sets a week for each group. Each starts at what the goal suggests for it.')}</div>
      <div className="list goal-groups plan-groups">{ADD_GROUPS.map(g => {
        const mine = byGroup[g.id] != null
        return <div key={g.id} className="item" data-group={g.id}>
          <span className="plan-gdot" style={{ background: groupColor(g.id) }} />
          <div className="grow"><div className="tt">{t(g.n)}</div>
            <div className="ss">{mine ? <button type="button" className="linkish" onClick={() => setGroup(g.id, null)}>{t('Set on its own · reset')}</button> : t('Follows the goal')}</div></div>
          <Stepper value={mine ? byGroup[g.id] : defaultTargetFor(g.id, cfg.goal, cfg.volume)} step={1} min={0} max={MAX_GOAL} decimal={false} ariaLabel={t(g.n)} onChange={n => setGroup(g.id, n)} />
        </div>
      })}</div>
    </>}
  </>
  const minutes = <>
    {seg('minutes', PLAN_MINUTES, v => String(v))}
    <div className="muted small" style={{ marginTop: 6 }}>{t('Minutes a session, rests and warm-up sets included.')}</div>
    {spare && <div className="muted small" style={{ marginTop: 6 }} data-spare-time>{spare}</div>}
  </>
  const length = <>
    <h4 className="sec">{t('Length')}</h4>
    <Segmented value={weeks} onChange={setWeeks} options={PROGRAM_WEEKS.map(n => ({ value: n, label: t('{0} wk', n) }))} />
  </>
  // What the edit does to the week: the sets a week then and now, and the groups that move.
  const setsOf = w => w.reduce((n, d) => n + d.items.reduce((m, i) => m + i.sets, 0), 0)
  const moves = changes ? Object.entries(changes.groups).filter(([, [a, b]]) => a !== b) : []
  const liftsIn = changes ? changes.days.reduce((n, d) => n + (d.from == null ? 0 : d.added.length), 0) : 0
  const liftsOut = changes ? changes.days.reduce((n, d) => n + d.removed.length, 0) + changes.gone.reduce((n, d) => n + d.items.length, 0) : 0
  const same = changes && !moves.length && !liftsIn && !liftsOut && !changes.gone.length && changes.days.every(d => d.from === d.k && !d.changed.length)
  // A schedule you have (weekday routines or a loop) is paused while the program runs, not lost.
  const hasSchedule = !!S.queue || Object.values(S.week || {}).some(v => [].concat(v || []).length)
  return <div className="wd-fit">
    <div style={{ flex: 'none' }}>
      <h3>{updating ? t('Edit program') : t(PLAN_TEMPLATES[o.template].n)}</h3>
      <div className="muted small" style={{ marginTop: -8, marginBottom: 6 }}>{updating ? `${t(PLAN_TEMPLATES[o.template].n)} · ${t('Week {0} of {1}', programWeek(S)?.week || 1, weeks)}` : t(PLAN_TEMPLATES[o.template].sub)}</div>
    </div>
    <div className="wd-scroll sheet-scroll plan-build">
      {!updating && rest}
      {seg('days', PLAN_DAYS, v => String(v))}
      {!updating && groups}
      {minutes}
      {seg('volume', VOLUMES, v => t(VOLUME_NAME[v]))}
      <div className="muted small" style={{ marginTop: 6 }}>{t('Sets a week for every group, from the least that keeps it growing to the most it recovers from.')}</div>
      {note && <div className="plan-note" data-plan-note>{note}</div>}
      {updating && <>
        <button type="button" className="plan-adjust" aria-expanded={moreOpen} onClick={() => setMoreOpen(v => !v)} data-more-settings>
          <span className="grow"><span className="tt">{t('More settings')}</span>
            <span className="ss">{[t(SHORT_TEMPLATE[o.template]), t(SCHEMES[o.goal]?.n), t(LEVELS[o.level]?.n), t(EQUIPMENT[o.equipment]?.n), t('{0} wk', weeks)].join(' · ')}</span></span>
          <Icon name="chevronRight" className={'menu-chev' + (moreOpen ? ' open' : '')} />
        </button>
        {moreOpen && <>{rest}{groups}{length}</>}
      </>}
            {!updating && <div className="goal-est" data-goal-estimate>
        {t('{0} days · up to {1} min', cfg.days, cfg.minutes)}
      </div>}
      {short.length > 0 && <div className="plan-note warn">{t('Short of the weekly goal: {0}.', short.map(x => (x.direct != null
        ? t('{0}: {1} of the {2} sets it needs on lifts aimed at it', groupName(x.g), x.direct, x.directGoal)
        : `${groupName(x.g)} ${x.total}/${x.goal}`) + ` (${t(CAUSE[x.cause])})`).join(', '))}</div>}

      <h4 className="sec">{updating ? t('Your week after the change') : t('Each week')}</h4>
      {changes && <div className="plan-diff" data-plan-diff>{same ? t('Nothing changes yet.') : <>
        <div className="tt">{setsOf(running.week) !== week.days.reduce((n, d) => n + d.sets, 0) && <><s>{setsOf(running.week)}</s> → </>}{t('{0} sets a week', week.days.reduce((n, d) => n + d.sets, 0))}</div>
        {moves.length > 0 && <div className="ss">{moves.map(([g, [a, b]]) => `${groupName(g)} ${a} → ${b}`).join(' · ')}</div>}
        <div className="ss">{[liftsIn && t('New lifts: {0}', liftsIn), liftsOut && t('Lifts dropped: {0}', liftsOut), ...changes.gone.map(d => t('Day {0} · {1} dropped', d.j + 1, t(DAY_NAME[d.type])))].filter(Boolean).join(' · ') || t('The same lifts')}</div>
      </>}</div>}
      <div className="ahead-days">{week.days.map((d, k) => <PreviewDay key={`${k}-${d.type}-${d.items.map(i => i.from || i.ex.id).join()}`} day={d} k={k} change={changes?.days[k]} onSwap={onSwap} />)}</div>
      <Button variant="tinted" icon="shuffle" style={{ marginTop: 10 }} onClick={() => {
        // Another week of lifts, as long as it still reaches the goal; an edit stops keeping the old
        // ones and the ones you swiped in.
        if (keep) setKeep(undefined)
        setSwap([])
        for (let seed = o.seed + 1, n = 0; n < 30; seed++, n++) if (!blocked({ ...o, seed }).length) return setO({ ...o, seed })
      }}>{t('Other lifts')}</Button>
      <div className="muted small" style={{ marginTop: 6 }}>{t('Swipe a lift sideways for the ones that could take its place.')} {updating
        ? t('Lifts the program has stay where they still fit, with their progress.')
        : t('Each day keeps its lifts for the whole program; the weight and reps move on as you log them.')}</div>

      {!updating && length}
    </div>
    <div className="wd-foot">
      {hasSchedule && !updating && <div className="muted small" style={{ marginBottom: 8 }} data-schedule-note>{t('Your fixed week or rotation is kept for when you switch back.')}</div>}
      <Button variant="primary" onClick={start}>{updating ? t('Save changes') : t('Start program')}</Button>
      {updating && <div className="muted small" style={{ marginTop: 8, textAlign: 'center' }}>{t('From your next workout. Logged workouts stay as they are.')}</div>}
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
/** The running program's settings in a line, for How you train's Edit program row. */
export function programSettingsLine(S) {
  const p = S.program
  if (!isPlanProgram(p)) return ''
  const pl = p.plan
  return [t(SHORT_TEMPLATE[p.template]), t(SCHEMES[pl.goal]?.n), t('{0} days', pl.days), t('{0} min', pl.minutes)].join(' · ')
}
/** Opens the running program's editor, else the setup for a new one on the first split. */
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
      {isPlanProgram(p) && !over && <Button variant="tinted" icon="pencil" style={{ marginBottom: 12 }} onClick={() => changeProgram(S)} data-edit-program>{t('Edit program')}</Button>}
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
      {isPlanProgram(p) && !over && <Button size="sm" variant="plain" icon="pencil" onClick={() => changeProgram(S)} data-edit-program>{t('Edit')}</Button>}
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
      <Button size="sm" variant="tinted" icon="target" onClick={() => (isProgram(S.program) ? changeProgram(S) : goalSheet())}>{t('Goal: {0}', t(SCHEMES[goalTypeOf(S)].n))}</Button>
    </div>
    <CoverageStrip groups={groups} adds={done} goals={goals}
      label={isProgram(S.program) ? t('Sets per group this week, against your goal') : t('Sets per group over the last 7 days, against your goal')} />
  </div>
}
