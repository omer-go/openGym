import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { EXIDX, matchExercise, betterWeight, isAssisted, isCardio } from '../lib/exercises.js'
import { lastBW, streakWeeks, setLabel, modeOf, effortOf, entriesForExercise, metricEntriesForExercise, metricModeForEntry, bestWeightForEntry, completedRepsOf, workoutDay, workoutAt } from '../lib/history.js'
import { fmtNum, fmtDate, fmtVol, todayISO, isoOf, exerciseNameText } from '../lib/format.js'
import { speedUnitOf, speedLabel, toSpeed } from '../lib/speed.js'
import { t, exerciseNameFor, exerciseNameClass, getLang } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, dayOverrideSheet, workoutDetailSheet, exerciseHistorySheet, WorkoutRow, bwDeltaColor, weighInsSheet } from '../sheets.jsx'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import Icon from '../components/Icon.jsx'
import BodyMap, { BodyMapLegend } from '../components/BodyMap.jsx'
import { loadOfWeeklyPlan, loadOfWorkouts, doneSetItems, muscleBalanceWindow, rankOf, MUSCLES, MUSCLE_NAME, musclesOf } from '../lib/muscles.js'
import { regionBreakdown } from '../lib/muscle-roles.js'
import { useMuscleRoles } from '../components/MuscleRoles.jsx'
import { fatigueOf, strengthOf, STRENGTH_FLOOR, LB_TO_KG } from '../lib/recovery.js'
import { strengthExerciseRowsForMuscle } from '../lib/strength-exercises.js'
import { fatigueStateOf } from '../lib/recovery-view.js'
import { e1rmSeries, best1RM, formulaOf } from '../lib/onerm.js'
import { currentDbLoad, workoutAs } from '../lib/dumbbells.js'
import { maxRepsSeries } from '../lib/pyramid.js'
import { perSetSessions, perSetLines, dropOffSet } from '../lib/per-set.js'
import {
  hasEffort, hasEstimableEffort, displayScale, scaleName, toScale, avgRir, effortSummary, effortWeeks,
  effortHistogram, isHardSet, HARD_RIR, MIN_RATED
} from '../lib/effort.js'
import { anchorsByWorkout, resolveSetRir } from '../lib/recovery.js'
import { Button, Segmented, SelectRow } from '../components/ui.jsx'
import CoverageStrip, { shown } from '../components/CoverageStrip.jsx'
import { weeklyTargets } from '../lib/goals.js'
import { groupSplitPerWeek, groupSetsOfWeeklyPlan, splitTotals, roundSplit, partSplitOf, partGoalOf, GROUP_PARTS } from '../lib/coverage.js'
import { ADD_GROUPS, groupOfMuscle } from '../lib/add-exercise.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { isWarmupRow } from '../lib/workout-model.js'
import { conditioningWorkouts, strengthWorkouts } from '../lib/conditioning.js'

// Set 1 to 5 on the per-set chart — system colours, so each line keeps its hue in dark mode.
const SET_COLORS = ['var(--blue)', 'var(--green)', 'var(--orange)', 'var(--purple)', 'var(--pink)']

// The date range buttons under Body weight, and since issue #511 under Exercise progress too.
// In days, 0 = everything; a function because the labels follow the current language.
const rangeOptions = () => [{ value: 30, label: '1M' }, { value: 90, label: '3M' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]
// Where a range starts, in ms. Worked out once per pick rather than from each render's clock, so
// the memoised chart arrays below keep their identity (LineChart drops its hover on a new one).
const rangeStart = days => (days ? Date.now() - days * 86400000 : 0)

// Which muscles the training in a window actually hit — and, the point of the card,
// which ones it keeps missing. Shading is relative within the window (lib/muscles.js).
function latestMuscleTraining(workouts) {
  const latest = {}
  for (const workout of workouts || []) {
    const timestamp = workoutAt(workout)
    if (!Number.isFinite(timestamp)) continue
    for (const entry of workout.entries || []) {
      if (!(entry.sets || []).some(set => set?.done === true && !isWarmupRow(set))) continue
      const exercise = EXIDX[entry.id] || entry.exercise || entry
      for (const slug of Object.keys(musclesOf(exercise))) {
        if (latest[slug] == null || timestamp > latest[slug]) latest[slug] = timestamp
      }
    }
  }
  return latest
}

export const FATIGUE_LEVELS = [
  { at: 0, level: 0 },
  { at: 0.15, level: 1 },
  { at: 0.25, level: 2 },
  { at: 0.4, level: 3 },
  { at: 0.55, level: 4, exclusive: true },
]

export const STRENGTH_LEVELS = [
  { at: STRENGTH_FLOOR, level: 0 },
  { at: 0.625, level: 1 },
  { at: 0.75, level: 2 },
  { at: 0.875, level: 3 },
  { at: 1, level: 4 },
]

function useNow() {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(tick => tick + 1), 60000)
    return () => clearInterval(iv)
  }, [])
  return Date.now()
}

/**
 * Return the whole weeks since a completed muscle-training timestamp.
 *
 * @param {number} now Current render-time timestamp in milliseconds.
 * @param {number} lastTrained Timestamp of the latest completed training event.
 * @returns {number} Non-negative whole weeks, including zero for ages under seven days.
 */
export function weeksSinceTraining(now, lastTrained) {
  return Math.max(0, Math.floor((now - lastTrained) / 86400000 / 7))
}

function FatigueLegend() {
  return <div className="hm-legend hm-fatigue" aria-label={t('Fatigue')}>
    <span>{t('Fatigued')}</span><div className="hm-c l4" />
    <span>{t('Recovering')}</span><div className="hm-c l2" />
    <span>{t('Ready')}</span><div className="hm-c l0" />
  </div>
}

function StrengthLegend() {
  return <div className="hm-legend hm-strength" aria-label={t('Strength')}>
    <span>1 <span className="dim">{t('full')}</span></span><div className="hm-c l4" /><div className="hm-c l3" /><div className="hm-c l2" />
    <div className="hm-c l1" /><div className="hm-c l0" /><span>{fmtNum(STRENGTH_FLOOR)} <span className="dim">{t('floor')}</span></span>
  </div>
}

function fatigueLabel(value) {
  const state = fatigueStateOf(value)
  return t(state === 'ready' ? 'Ready' : state === 'recovering' ? 'Recovering' : 'Fatigued')
}

// The user's own last registered bodyweight, in kg: the body-mass part of a bodyweight
// exercise's load for fatigue and for estimated effort, so both read the same set the same way.
function profileBodyweightKg(S) {
  const entries = S.bodyweight || []
  if (!entries.length) return null
  const last = entries.slice().sort((a, b) => String(a.d).localeCompare(String(b.d))).at(-1)
  if (!last || !(last.w > 0)) return null
  return S.unit === 'lb' ? last.w * LB_TO_KG : last.w
}

function MuscleBalance({ S }) {
  const [view, setView] = useState('balance')
  const [back, setBack] = useState(0)  // 7-day windows back from today
  const [hard, setHard] = useState(false)
  const [sel, setSel] = useState(null)
  const [grp, setGrp] = useState(null)
  const now = useNow()
  const lang = getLang()
  useMuscleRoles()  // the per-part breakdown under a tapped group reads them
  const workouts = S.workouts
  // Conditioning combos tire the muscles (fatigue reads them, at a discount) but are not the
  // hard sets a group's volume or strength is counted in: those read the strength workouts, and
  // the week's conditioning sets show as a line of their own under the bars.
  const sw = strengthWorkouts(workouts)
  const bodyweightKg = useMemo(() => profileBodyweightKg(S), [S.bodyweight, S.unit])
  const fatigue = useMemo(() => fatigueOf(workouts, now, { bodyweightKg, unit: S.unit }), [workouts, now, bodyweightKg, S.unit])
  const strength = useMemo(() => strengthOf(sw, now, { bodyweightKg, unit: S.unit }), [sw, now, bodyweightKg, S.unit])
  const muscleExercises = useMemo(() => (sel ? strengthExerciseRowsForMuscle(S, now, sel) : []), [S, now, sel, lang])
  const lastTrained = useMemo(() => latestMuscleTraining(sw), [sw])
  const strengthHint = slug => {
    if (lastTrained[slug] == null) return t('not trained')
    const weeks = weeksSinceTraining(now, lastTrained[slug])
    return t('Weeks since training: {0}', weeks)
  }
  const toggleSel = m => setSel(s => (s === m ? null : m))
  // A week's dose: the 7 days up to today, or the 7 before that, and so on. Longer periods are
  // not offered: sets per muscle are a weekly measure, and how training went over months is the
  // Progress tab's question, not a number per group.
  const end = now - back * 7 * 86400000
  const inWin = muscleBalanceWindow(sw, 7, end)
  // Counting only the sets taken near failure turns the map from "where did the volume go"
  // into "where did the stimulus go" — a muscle can lead on sets and still never be trained
  // hard. Offered only when the window holds ratings at all, since with none the hard map
  // would just be empty and read as "you trained nothing".
  const rated = inWin.some(w => w.entries.some(e => e.sets.some(s => s.done && isHardSet(s))))
  const on = hard && rated
  // The balance view reads by muscle group, the bars the one-tap setup and the routine editor
  // draw (CoverageStrip): the 7 days as they were, each number read as done/goal as the bar is.
  // The plan, the one in place now, shows in a group opened on the current 7 days only. The map
  // colours each region by its group's number, so the two always agree, and a
  // group opens its number split into its regions (they add up to it) and, where the catalogue
  // has muscle roles, the main region into its parts.
  const split = groupSplitPerWeek(sw, 7, end, on ? isHardSet : null)
  const groupSets = splitTotals(split)
  const plannedG = on || back ? null : groupSetsOfWeeklyPlan(S)
  const mapLoad = Object.fromEntries(MUSCLES.map(m => [m, groupSets[groupOfMuscle(m)?.id] || 0]))
  const group = grp ? ADD_GROUPS.find(g => g.id === grp) : null
  const toggleGrp = id => setGrp(g => (g === id ? null : id))
  const bar = { background: on ? 'var(--yellow)' : undefined }
  // The group's main region split into its parts. It counts in full in its group, so the parts
  // speak to the same sets.
  const main = group?.m[0]
  const parts = main && !GROUP_PARTS[group.id] ? regionBreakdown(doneSetItems(inWin, on ? isHardSet : null).filter(x => !isCardio(x.id)), main) : null
  // A group with parts of its own to train (shoulders, back, glutes) shows each against its
  // weekly minimum instead (lib/coverage.js partGoalOf): a set aimed at the part counts in full,
  // one that only helped it at 0.4, so a week of rows reads as rear delts helped, not trained.
  const own = group && GROUP_PARTS[group.id] && (() => {
    const got = partSplitOf(inWin, undefined, on ? isHardSet : null)[group.id] || {}
    const goal = partGoalOf(S, group.id)
    // To the tenth: the minimum is 4.5 sets, and rounded it would read as 5.
    const tenth = v => String(Math.round(v * 10) / 10)
    if (!goal) return null
    return <div className="mparts" data-group-parts={group.id}>
      {GROUP_PARTS[group.id].map(([name]) => {
        const { targeted = 0, helped = 0 } = got[name] || {}
        const sets = targeted + helped
        const pct = Math.min(100, Math.round(sets / goal * 100))
        return <div key={name} data-part={name}>
          <div className="mrow">
            <span className="nm">{t(name)}</span>
            <span className="bar" role="img" aria-label={t('{0}: {1} of a minimum of {2} sets', t(name), tenth(sets), tenth(goal))}>
              <i style={{ width: pct + '%', ...bar, ...(sets < goal ? { opacity: 0.55 } : {}) }} /></span>
            <span className="v">{tenth(sets)}/{tenth(goal)}</span>
          </div>
          {sets > 0 && <div className="muted small" style={{ marginTop: -2, marginBottom: 4 }}>{targeted > 0 && helped > 0
            ? t('{0} aimed at it, {1} from helping in other lifts', tenth(targeted), tenth(helped))
            : targeted > 0 ? t('{0} aimed at it', tenth(targeted)) : t('{0} from helping in other lifts, none aimed at it', tenth(helped))}</div>}
        </div>
      })}
      <div className="muted small" style={{ marginTop: 6 }}>{t('Each part needs {0} sets a week. A lift aimed at it counts in full, one that only helps it 0.4.', tenth(goal))}</div>
    </div>
  })()
  // Bars only: the parts are counted per exercise (a target 1, a helper 0.4) and overlap, so
  // their numbers would not add up to the muscle's. Their lengths say which part lags.
  const partRows = parts && (() => {
    const top = Math.max(...parts.rows.map(r => r.sets)) || 1
    return <div className="mparts" data-muscle-parts={main}>
      {parts.rows.map(r => {
        const pct = Math.round(r.sets / top * 100)
        return <div key={r.name} className="mrow">
          <span className="nm">{t(r.name)}</span>
          <span className="bar" role="img" aria-label={t('{0}: {1}% of the most worked part', t(r.name), pct)}>
            <i style={{ width: pct + '%', ...bar }} /></span>
          <span className="v" />
        </div>
      })}
      {parts.covered < parts.total && <div className="muted small">
        {t('Based on {0} of {1} sets.', shown(parts.covered), shown(parts.total))}</div>}
    </div>
  })()
  const groupSplit = group && (() => {
    // whole sets, as the bar shows them, and the regions rounded so they add up to it
    const total = groupSets[group.id] || 0
    const plan = plannedG?.[group.id] || 0
    const raw = Object.fromEntries(group.m.map(m => [m, split[group.id]?.[m] || 0]))
    const whole = roundSplit(raw)
    const regions = group.m.map(m => ({ m, sets: whole[m], v: whole[m] || raw[m] <= 0 ? String(whole[m]) : '<1' }))
    const top = Math.max(...regions.map(r => r.sets)) || 1
    return <div data-group-split={group.id} style={{ marginTop: 10 }}>
      <div className="mrow" style={{ borderTop: 'var(--hair) solid var(--sep)', paddingTop: 10 }}>
        <span className="nm"><b>{t(group.n)}</b></span>
        <span className="v" style={{ textAlign: 'end' }}>{plan > 0
          ? t('{0} of {1} planned sets', shown(total), shown(plan))
          : total > 0 ? t('{0} sets', shown(total)) : on ? t('no hard sets') : t('not trained')}</span>
      </div>
      {group.m.length > 1 ? <>
        {regions.map(({ m, sets, v }) => <div key={m}>
          <div className="mrow" data-group-region={m}>
            <span className="nm">{t(MUSCLE_NAME[m])}</span>
            <span className="bar"><i style={{ width: Math.round(sets / top * 100) + '%', ...bar }} /></span>
            <span className="v">{v}</span>
          </div>
          {m === main && !own && partRows}
        </div>)}
        <div className="muted small" style={{ marginTop: 6 }}>{t('A set counts once for its group, under the muscle it works most: {0} in full, the others a quarter.', t(MUSCLE_NAME[main]))}</div>
        {own}
      </> : own || partRows}
    </div>
  })()
  // The conditioning layer: the combo sets of the same days, counted apart
  const condIn = conditioningWorkouts(muscleBalanceWindow(workouts, 7, end))
  const condSets = condIn.reduce((n, w) => n + w.entries.reduce((m, e) => m + (e.sets || []).filter(x => x.done && !isWarmupRow(x)).length, 0), 0)
  const groupBars = <div data-group-sets style={{ margin: '14px 0 6px' }}>
    <h4 className="sec" style={{ marginTop: 0 }}>{t('Muscle groups')}</h4>
    <CoverageStrip adds={groupSets} goals={weeklyTargets(S)} ofGoal onGroup={toggleGrp} selected={grp} label={back
      ? t('Sets per group in these 7 days, toward your weekly goal')
      : t('Sets per group in the last 7 days, toward your weekly goal')} />
    {condSets > 0 && <div className="muted small" data-conditioning-sets style={{ marginTop: 6 }}>
      {t('+ {0} conditioning sets in combos, not counted here', shown(condSets))}</div>}
  </div>
  const missed = ADD_GROUPS.filter(g => !(groupSets[g.id] > 0))
  const volWin = sw.filter(w => workoutAt(w) > now - 90 * 86400000)
  const vol90 = loadOfWorkouts(volWin, null)
  const { worked: strengthOrder } = rankOf(strength)
  const detrained = strengthOrder.filter(slug => strength[slug] < 1)
  // The 7 days by their dates: six days back to the last one
  const periodLabel = fmtDate(isoOf(new Date(end - 6 * 86400000))) + ' – ' + fmtDate(isoOf(new Date(end)))
  const completionSummary = <>
    {missed.length > 0 && <>
      <h4 className="sec" style={{ marginTop: 12 }}>{on ? t('No hard sets in this period') : t('Not trained in this period')}</h4>
      <div className="mchips">{missed.map(g => <span key={g.id} className="mchip miss">{t(g.n)}</span>)}</div>
    </>}
    {!missed.length &&
      <div className="muted small" style={{ marginTop: 10 }}>{on
        ? t('Every muscle group got at least one hard set in this period.')
        : t('Every muscle group got some work in this period.')}</div>}
  </>

  // Muscle balance's controls above the map: the title row, the period and the period row.
  // Fatigue and Strength lay the same block out invisibly under their own title and line, so
  // the map sits at the same height in all three views and switching moves nothing.
  const balanceHead = <>
    <div className="row between" style={{ marginBottom: 8 }}>
      <h2 style={{ margin: 0 }}>{t('Muscle balance')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {on ? t('by hard sets') : t('by sets worked')}</span></h2>
      {/* Always there, so the row keeps its height from period to period; it only counts hard
          sets where there are ratings to read. Counting them sets the plan aside, which
          counts every set. */}
      <Button size="sm" icon="gauge" style={on ? { color: 'var(--yellow)' } : undefined} disabled={!rated}
        onClick={() => { setHard(h => !h); setGrp(null) }}>{on ? t('Hard') : t('All')}</Button>
    </div>
    {/* The period row steps back and forth 7 days at a time, up to today. An empty stretch
        still draws its map and bars, so stepping moves nothing. */}
    <div className="row between" data-period style={{ margin: '10px 0 6px' }}>
      <button className="iconbtn sm" aria-label={t('Previous week')}
        onClick={() => { setBack(b => b + 1); setGrp(null) }}><Icon name="chevronLeft" /></button>
      <span className="small" style={{ fontWeight: 600 }}>{periodLabel}</span>
      <button className="iconbtn sm" aria-label={t('Next week')} disabled={back === 0}
        onClick={() => { setBack(b => Math.max(0, b - 1)); setGrp(null) }}><Icon name="chevronRight" /></button>
    </div>
  </>
  const otherHead = (title, line) => <div style={{ display: 'grid' }}>
    <div style={{ gridArea: '1 / 1', visibility: 'hidden' }} aria-hidden="true" inert>{balanceHead}</div>
    <div style={{ gridArea: '1 / 1' }}>
      <h2>{title}</h2>
      <div className="muted small">{line}</div>
    </div>
  </div>

  return <div className="card">
    <Segmented className="seg-range" value={view} onChange={setView}
      options={[{ value: 'balance', label: t('Muscle balance') }, { value: 'fatigue', label: t('Fatigue') }, { value: 'strength', label: t('Strength') }]} />
    {view === 'balance' ? <>
      {balanceHead}
      <div data-weekly-volume-comparison data-back={back}>
        <BodyMap className="tappable" load={mapLoad} body={S.body} selected={group ? group.m : null}
          onMuscle={slug => {
            // the region tapped carries over to Fatigue and Strength, which read by region
            const g = groupOfMuscle(slug)
            if (!g) return
            setSel(grp === g.id ? null : slug)
            toggleGrp(g.id)
          }} />
        <BodyMapLegend />
        {groupBars}
        {groupSplit}
        {inWin.length
          ? <>{!group && <div className="muted small" style={{ marginTop: 10 }}>{t('Tap a group to see how its sets split.')}</div>}{completionSummary}</>
          : <div className="muted small">{t('No workouts in this period yet.')}</div>}
      </div>
    </> : view === 'fatigue' ? <>
      {otherHead(t('Fatigue'), t('Fatigue shows how recently each muscle was trained. High means rest.'))}
      <BodyMap className="tappable hm-fatigue" load={fatigue} thresholds={FATIGUE_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel} />
      <FatigueLegend />
      {sel && <div className="mrow" style={{ borderTop: 'var(--hair) solid var(--sep)', marginTop: 4, paddingTop: 10 }}>
        <span className="nm"><b>{t(MUSCLE_NAME[sel])}</b></span>
        <span className="v">{fatigueLabel(fatigue[sel])}</span>
      </div>}
    </> : <>
      {otherHead(t('Strength'), t('Strength shows retained muscle strength. Train again to reset it.'))}
      <BodyMap className="tappable hm-strength" load={strength} thresholds={STRENGTH_LEVELS} body={S.body} selected={sel} onMuscle={toggleSel} />
      <StrengthLegend />
      {sel && <>
        <h4 className="sec" style={{ marginTop: 14 }}>{t('Exercises')} · {t(MUSCLE_NAME[sel])}</h4>
        {/* A row quotes the exercise's estimated 1RM, so a tap opens the exercise history
            sheet — the curve behind that number plus the last sessions set by set. */}
        {muscleExercises.length ? muscleExercises.map(row => (
          <div key={row.id} className="mrow" style={{ minHeight: 48, alignItems: 'stretch', cursor: 'pointer' }} {...tappable(() => exerciseHistorySheet(row.id))}>
            <span className="nm" style={{ whiteSpace: 'normal', lineHeight: 1.35, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span className={EXIDX[row.id] ? exerciseNameClass(EXIDX[row.id]) : undefined}>{row.name}</span>
                {row.primary === sel
                  ? <span className="dim" style={{ fontSize: 11, marginInlineStart: 6 }}>{t('primary')}</span>
                  : <span className="dim" style={{ fontSize: 11, marginInlineStart: 6 }}>{t('secondary')}</span>}
              </span>
              <span className="small dim" style={{ display: 'block', fontWeight: 400 }}>{t('Est. 1RM')}: {fmtNum(row.est)} {S.unit} · {fmtDate(row.estDate, true)}</span>
            </span>
            {/* Filled by width, like the bars around it, rather than a 'to right' gradient: a block
                starts at the inline start, so in right-to-left it fills from the right. */}
            <span className="bar" style={{ alignSelf: 'center' }}><i style={{ width: Math.round(row.decay * 100) + '%' }} /></span>
            <span className="v" style={{ alignSelf: 'center' }}>{fmtNum(row.current)} {S.unit}<span className="dim"> · {Math.round(row.decay * 100)}%</span></span>
          </div>
        )) : <div className="muted small">{t('No exercises with an estimated 1RM yet.')}</div>}
      </>}
      {!sel && <div className="muted small" style={{ marginTop: 10 }}>{t('Tap a muscle to see its exercises.')}</div>}
      {/* Detrained muscles: the bar is retained strength, the value says how long ago the
          muscle was last trained. Sets in the last 90 days ride along only when there are
          any — a muscle is on this list precisely because it has not been trained lately, so
          that number alone read as "0 sets" all the way down and told nobody anything. */}
      {detrained.map(slug => {
        const sets90 = Math.round((vol90[slug] || 0) * 10) / 10
        return <div key={slug} className="mrow">
          <span className="nm">{t(MUSCLE_NAME[slug])}</span>
          <span className="bar"><i style={{ width: Math.round(strength[slug] * 100) + '%' }} /></span>
          <span className="v" style={{ textAlign: 'end' }}>
            {sets90 ? t('{0} sets', fmtNum(sets90)) : strengthHint(slug)}
            {sets90 ? <span className="dim small" style={{ display: 'block', fontWeight: 400 }}>{strengthHint(slug)}</span> : null}
          </span>
        </div>
      })}
    </>}
  </div>
}


// How hard the training was — the half of the picture a volume chart cannot show. Everything
// is computed in RIR (lib/effort.js) and converted to whichever scale this profile reads.
// Every number carries how much of the training it speaks for: rating is optional and off by
// default, so a partly rated history is the normal case, and an average without its
// denominator would quietly speak for sets that were never rated.
function EffortCard({ S }) {
  const [win, setWin] = useState(90)
  const kind = displayScale(S)
  const hd = scaleName(kind)
  const logged = effortSummary(S, win)
  // Thin or missing ratings fall back to estimates (same precedence fatigue scoring
  // uses), so imported histories get an effort card too. Well-rated windows keep
  // their logged numbers untouched - estimates never dilute a real average.
  const blend = logged.rated < MIN_RATED
  // Same options as the fatigue map (unit + profile bodyweight), so a bodyweight set is
  // estimated against the same body-mass-inclusive anchor in both places.
  const opts = useMemo(() => ({ unit: S.unit, bodyweightKg: profileBodyweightKg(S) }), [S.unit, S.bodyweight])
  const anchors = useMemo(
    () => (blend ? anchorsByWorkout(S.workouts, opts) : new Map()),
    [blend, S.workouts, opts],
  )
  const resolve = (s, w, e) => resolveSetRir(s, s, e, w, anchors.get(w), opts)
  const sum = blend ? effortSummary(S, win, resolve) : logged
  const weeks = blend ? effortWeeks(S, win, resolve) : effortWeeks(S, win)
  const hist = blend ? effortHistogram(S, win, resolve) : effortHistogram(S, win)
  const estimated = blend && sum.est > 0
  const maxBin = Math.max(1, ...hist.map(b => b.n))
  // The week's set count rides along in the tooltip, because the pair is the reading:
  // volume up with effort up is fatigue piling up, volume up with effort flat is adaptation.
  const pts = weeks.map(w => ({ t: w.t, y: toScale(kind, w.rir), note: t('{0} sets', w.sets) }))
  // Bins run hardest-first in both scales: RIR 0 and RPE 10 are the same set.
  const binLabel = b => kind === 'rpe' ? (b.tail ? '≤ 6' : String(10 - b.rir)) : (b.tail ? b.rir + '+' : String(b.rir))

  return <div className="card">
    <h2>{t('Effort')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('how close to failure')}{estimated ? ' · ' + t('estimated') : ''}</span></h2>
    <Segmented className="seg-range" value={win} onChange={setWin}
      options={[{ value: 30, label: '30d' }, { value: 90, label: '90d' }, { value: 365, label: '1Y' }, { value: 0, label: t('All') }]} />
    {sum.rated === 0 && sum.est === 0 ? <div className="muted small">{t('No rated sets in this period.')}</div> : <>
      <div className="row between" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div>
          <div className="stat-v">{sum.avg == null ? '–' : fmtNum(toScale(kind, sum.avg)) + ' ' + hd}</div>
          <div className="small dim">{t('average effort')}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <div className="stat-v" style={{ color: 'var(--yellow)' }}>{sum.hardPct == null ? '–' : Math.round(sum.hardPct * 100) + '%'}</div>
          <div className="small dim">{t('at {0} {1} or harder', hd, fmtNum(toScale(kind, HARD_RIR)))}</div>
        </div>
      </div>
      <div className="small dim" style={{ marginTop: 8 }}>{estimated
        ? t('{0} rated · {1} estimated of {2} sets', sum.rated, sum.est, sum.done)
        : t('{0} of {1} finished sets rated', sum.rated, sum.done)}</div>
      {effortOf(S) === 'none' && <div className="small" style={{ color: 'var(--yellow)', marginTop: 4 }}>
        {t('Effort per set is off. Turn it on in Settings → Workout to keep rating.')}
      </div>}
      {pts.length > 1 && <>
        <h4 className="sec" style={{ marginTop: 12 }}>{t('Week by week')}</h4>
        <div className="chart"><LineChart points={pts} h={140} unit={hd} color="var(--yellow)" invert={kind === 'rir'} /></div>
      </>}
      <h4 className="sec" style={{ marginTop: 12 }}>{t('Where the sets land')}</h4>
      {hist.map(b => <div key={b.rir} className="mrow">
        <span className="nm">{hd} {binLabel(b)}</span>
        <span className="bar"><i style={{ width: Math.round(b.n / maxBin * 100) + '%', background: b.rir <= HARD_RIR ? 'var(--yellow)' : 'var(--label-3)' }} /></span>
        <span className="v">{b.n ? b.n + ' · ' + Math.round(b.pct * 100) + '%' : '–'}</span>
      </div>)}
      <div className="small dim" style={{ marginTop: 8 }}>
        {t('Most working sets belong close to failure, not at it. Half at the floor and half at the top still average out to a healthy-looking middle.')}
      </div>
    </>}
  </div>
}

// Stats = the analytics hub: all charts, progress and history live here.
// The muscle volume your plan programs in a week: every weekday routine once, plus each session
// of a running rotation (lib/coverage.js groupSetsOfWeeklyPlan), by muscle group and in whole
// sets, as the group bars in Muscle balance count it. It used to sit on Plan; it is analysis,
// so it lives here now, next to Muscle balance, and Plan links to it (/stats?focus=weekly-volume).
const PLAN_VOLUME_ROWS = 5
export function WeeklyPlanVolume({ S }) {
  const [all, setAll] = useState(false)
  const sets = groupSetsOfWeeklyPlan(S)
  const groups = ADD_GROUPS.filter(g => sets[g.id] > 0).sort((a, b) => sets[b.id] - sets[a.id])
  const visible = all ? groups : groups.slice(0, PLAN_VOLUME_ROWS)
  const max = groups.length ? sets[groups[0].id] : 0
  return <div className="card" id="weekly-volume" data-weekly-muscle-volume>
    <h2 style={{ marginBottom: 2 }}>{t('Weekly muscle volume')}</h2>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Planned sets per week, from your plan.')}</div>
    {groups.length ? visible.map(g => <div className="mrow" key={g.id} data-plan-group={g.id}>
      <span className="nm">{t(g.n)}</span>
      <span className="bar"><i style={{ width: Math.round(sets[g.id] / max * 100) + '%' }} /></span>
      <span className="v">{t('{0} sets', shown(sets[g.id]))}</span>
    </div>) : <div className="muted small">{t('No muscle volume planned.')}</div>}
    {groups.length > PLAN_VOLUME_ROWS && <>
      <div style={{ height: 8 }} />
      <Button className="weekly-plan-toggle" trailingIcon={all ? 'chevronUp' : 'chevronDown'} aria-expanded={all}
        onClick={() => setAll(v => !v)}>{t(all ? 'Show less' : 'Show more')}</Button>
    </>}
  </div>
}

// Stats is three screens under one header, the muscles first: the body map and the group bars are
// what you come here for. The tab you were on is kept for the session, so a trip to History or
// Structural balance comes back to it; /stats?tab=progress opens one, and Plan's weekly-volume
// link opens Muscles.
const STATS_TABS = ['muscles', 'progress', 'activity']
let lastTab = 'muscles'
function tabOfHash(hash) {
  if (/[?&]focus=weekly-volume\b/.test(hash)) return 'muscles'
  const asked = /[?&]tab=(\w+)/.exec(hash)?.[1]
  return STATS_TABS.includes(asked) ? asked : lastTab
}

export default function Stats() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const [tab, setTabState] = useState(() => tabOfHash(window.location.hash || ''))
  const setTab = next => { lastTab = next; setTabState(next); window.scrollTo?.(0, 0) }
  const [range, setRange] = useState(90)
  // Plan's "Weekly muscle volume" row lands here (/stats?focus=weekly-volume). The router is a
  // HashRouter, so the query sits in the hash; the scroll waits a frame for the page's own
  // scroll-to-top on navigation to have happened first.
  useEffect(() => {
    if (!/[?&]focus=weekly-volume\b/.test(window.location.hash || '')) return
    const frame = window.requestAnimationFrame(() => document.getElementById('weekly-volume')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }))
    return () => window.cancelAnimationFrame(frame)
  }, [])
  const [exId, setExId] = useState(null)
  const [exMetric, setExMetric] = useState('top')
  // Exercise progress over a date range (issue #511), All by default. Only the chart follows it:
  // "Best:" and the recent sessions under it stay all-time.
  const [exRange, setExRange] = useState(0)
  const exFrom = useMemo(() => rangeStart(exRange), [exRange])
  const inExRange = p => p.t >= exFrom
  const now = Date.now()
  const kind = displayScale(S)
  const hd = scaleName(kind)

  const bwPts = S.bodyweight.filter(b => range === 0 || (b.t || new Date(b.d).getTime()) > now - range * 86400000)
    .map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const bw30 = S.bodyweight.filter(b => (b.t || new Date(b.d).getTime()) > now - 30 * 86400000)
  const bwDelta30 = bw30.length > 1 ? bw30[bw30.length - 1].w - bw30[0].w : null
  const workouts = S.workouts
  const monthW = workouts.filter(w => workoutDay(w)?.slice(0, 7) === todayISO().slice(0, 7)).length

  // Dumbbell weights are read in each exercise's current meaning (lib/dumbbells.js), so the
  // chart and its best compare like with like across a switch between per bell and total.
  const meantIn = {}
  const metricDataOf = (workout, id) => {
    const entries = metricEntriesForExercise(workoutAs(workout, id, meantIn[id] ??= currentDbLoad(S, id)), id)
    const mode = entries.at(-1)?.mode || null
    const sameMode = entries.filter(item => item.mode === mode)
    const best = mode === 'reps' ? sameMode.reduce((value, item) => {
      const candidate = bestWeightForEntry(item.entry)
      if (!(candidate > 0)) return value
      return value > 0 ? betterWeight(id, value, candidate) : candidate
    }, 0) : 0
    return { mode, entries: sameMode, rows: sameMode.flatMap(item => item.rows), best }
  }
  const entryOf = id => workouts.flatMap(w => w.entries).find(e => e.id === id)
  const listOf = value => Array.isArray(value) ? value : value == null || value === '' ? [] : [value]
  const firstAvailable = (...values) => {
    for (const value of values) {
      const list = listOf(value)
      if (list.length) return list
    }
    return []
  }
  const nameOf = id => {
    if (EXIDX[id]) return exerciseNameFor(EXIDX[id])
    const entry = entryOf(id)
    return entry?.muscleSnapshot?.n || entry?.n || id
  }
  const matcherOf = id => {
    if (EXIDX[id]) return EXIDX[id]
    const entry = entryOf(id)
    const snapshot = entry?.muscleSnapshot || {}
    const primaries = firstAvailable(snapshot.primaries, entry?.primaries)
    const secondaries = firstAvailable(
      snapshot.sm, snapshot.secondaries, snapshot.muscleGroups,
      entry?.sm, entry?.secondaries, entry?.muscleGroups,
    )
    return {
      n: snapshot.n || entry?.n || id,
      bp: snapshot.bp || entry?.bp || '',
      tg: primaries[0] || snapshot.tg || entry?.tg || '',
      sm: secondaries,
      eq: snapshot.eq || entry?.eq || '',
      desc: snapshot.desc || entry?.desc || '',
    }
  }
  // Cardio is charted and ranked in mph, as stored (lib/speed.js).
  const speedUnit = speedUnitOf(S)
  const currentOf = id => {
    for (let i = workouts.length - 1; i >= 0; i--) {
      const data = metricDataOf(workouts[i], id)
      if (!data.mode) continue
      const mode = data.mode
      const rows = data.rows
      const mx = mode === 'reps'
        ? data.best
        : Math.max(0, ...rows.map(s => mode === 'cardio' ? toSpeed(s.speed || 0, speedUnit) : mode === 'time' ? (s.sec || 0) : (s.w || 0)))
      if (mx > 0) return { mx, unit: mode === 'cardio' ? speedLabel(speedUnit) : mode === 'time' ? 's' : S.unit }
      // Unloaded reps work still has a current figure — its rep count. Without this the whole
      // picker label went blank and the exercise sorted to the bottom as if it had no history.
      if (mode === 'reps') {
        const reps = Math.max(0, ...rows.map(completedRepsOf))
        if (reps > 0) return { mx: reps, unit: t('reps') }
      }
    }
    return { mx: 0, unit: S.unit }
  }
  const exHist = [...new Set(workouts.flatMap(w => w.entries.map(e => e.id)))].filter(id => EXIDX[id] || nameOf(id) !== id)
  const exCurrent = Object.fromEntries(exHist.map(id => [id, currentOf(id)]))
  exHist.sort((a, b) => exCurrent[b].mx - exCurrent[a].mx || nameOf(a).localeCompare(nameOf(b)))
  const curEx = exId && exHist.includes(exId) ? exId : exHist[0] || null
  // A completed reps work row is authoritative for strength metrics, even when the parent
  // target also contains timed/cardio work. Entries without reps rows use their selected mode.
  const curMode = curEx ? (() => {
    for (let i = workouts.length - 1; i >= 0; i--) {
      const data = metricDataOf(workouts[i], curEx)
      if (data.mode) return data.mode
      const entries = entriesForExercise(workouts[i], curEx)
      for (let j = entries.length - 1; j >= 0; j--) {
        const mode = metricModeForEntry(entries[j])
        if (mode) return mode
      }
    }
    return modeOf({ id: curEx })
  })() : 'reps'
  const curCardio = curMode === 'cardio'
  const curTimed = curMode === 'time'
  // A pull-up or a push-up carries no weight, so its "best weight" is 0 — and dropping every
  // zero point left the card reading "No data yet" for exercises with a full history behind
  // them (issue #5). When nothing in an exercise's history was ever loaded, the progress IS
  // the rep count, so plot that. Add a weighted set later and it switches back to weight on
  // its own, which is also the honest reading: that is when load became the thing improving.
  const repsOnly = curEx && curMode === 'reps' && !workouts.some(w =>
    entriesForExercise(w, curEx).some(en => bestWeightForEntry(en) > 0))
  const metric = s => curCardio ? toSpeed(s.speed || 0, speedUnit) : curTimed ? (s.sec || 0) : (s.w || 0)
  const exUnit = curCardio ? speedLabel(speedUnit) : curTimed ? 's' : repsOnly ? t('reps') : S.unit
  let exPts = [], exList = [], exBest = 0
  if (curEx) {
    workouts.forEach(w => {
      const data = metricDataOf(w, curEx)
      if (data.mode === curMode) {
        const doneSets = data.rows
        const representative = data.entries.at(-1)?.entry
        const mx = curMode === 'reps'
          ? (repsOnly ? Math.max(0, ...doneSets.map(completedRepsOf)) : data.best)
          : Math.max(0, ...doneSets.map(metric))
        if (mx > 0) {
          exPts.push({ t: w.start, y: mx, d: w.d, sets: doneSets, target: representative?.target })
          // Weighted work on an assistance machine reads the other way: the smallest load is the
          // best (issue #232). Reps, duration and speed are always "more is better".
          const better = curMode === 'reps' && !repsOnly ? betterWeight(curEx, exBest || mx, mx) : Math.max(exBest, mx)
          exBest = exBest > 0 ? better : mx
        }
      }
    })
    exList = exPts.slice(-5).reverse()
  }
  // Estimated 1RM (issue #18) — only reps-mode training produces one, so cardio and timed
  // work simply have no points and the toggle stays hidden.
  // Both memoised on the same inputs, and it has to start at e1rmSeries: LineChart clears its
  // hover whenever `points` changes identity, so a chart array rebuilt on every render made the
  // tooltip vanish under your finger the moment anything else on this screen re-rendered.
  // Memoising only the .map() would not have helped — its dependency was itself rebuilt each time.
  const e1Pts = useMemo(
    () => (curEx && curMode === 'reps' ? e1rmSeries(S, curEx) : []),
    [S, curEx, curMode],
  )
  const e1ChartPts = useMemo(() => e1Pts.filter(p => p.t >= exFrom).map(p => ({ t: p.t, y: p.y, d: p.d })), [e1Pts, exFrom])
  const e1Best = curEx && curMode === 'reps' ? best1RM(S, curEx) : null
  const showE1 = e1Pts.length > 0
  // Effort on this exercise, per session. It rides on the top-set curve as well as having a
  // curve of its own, because the two only mean something together: the same weight moved
  // with more left in the tank is progress a weight-only chart draws as a flat line.
  const exRir = exPts.map(p => avgRir(p.sets))
  const showEff = exRir.filter(v => v != null).length >= 3
  const effPts = exPts.map((p, i) => (exRir[i] == null ? null : { t: p.t, y: toScale(kind, exRir[i]), d: p.d })).filter(p => p && inExRange(p))
  // Pyramid sets' Max sets: the most reps in one, per workout — the point of a Max set is seeing
  // that number climb, which the top-set weight line does not show.
  const maxPts = useMemo(
    () => (curEx && curMode === 'reps' ? maxRepsSeries(workouts, curEx).map(p => ({ t: p.t, y: p.y, d: p.d, note: p.w > 0 ? fmtNum(p.w) + ' ' + S.unit : undefined })) : []),
    [workouts, curEx, curMode, S.unit],
  )
  const showMax = maxPts.length > 0
  const maxBest = showMax ? Math.max(...maxPts.map(p => p.y)) : 0
  const maxChartPts = useMemo(() => maxPts.filter(p => p.t >= exFrom), [maxPts, exFrom])
  // Per set (issue #145): one line per set number, to see which set you drop off on — often not
  // the last. Offered once two sessions are logged and one of them has two sets or more.
  // Memoised like e1Pts: LineChart drops its hover whenever `points` changes identity.
  // Loaded work is drawn as each set's estimated 1RM, so straight sets at one weight still part
  // where reps were lost. Reps instead for unloaded work, an assistance machine (where a 1RM
  // reads backwards), or a history of sets all past the estimate's rep cap.
  const oneRmFormula = formulaOf(S)
  const perSet = useMemo(() => {
    if (!curEx || curMode !== 'reps') return null
    const usable = list => list.length >= 2 && list.some(s => s.sets.length >= 2)
    let metric = repsOnly || isAssisted(curEx) ? 'reps' : 'e1rm'
    let sessions = perSetSessions(workouts, curEx, { metric, formula: oneRmFormula })
    if (metric === 'e1rm' && !usable(sessions)) sessions = perSetSessions(workouts, curEx, { metric: metric = 'reps' })
    if (!usable(sessions)) return null
    const { lines, hidden } = perSetLines(sessions)
    const shown = new Set(lines.map(l => l.n))
    return {
      series: lines.map(l => ({ n: l.n, points: l.points, color: SET_COLORS[l.n - 1] })),
      anchors: sessions.map(s => ({
        t: s.t, d: s.d, y: Math.max(...s.sets.map(x => x.y)),
        note: s.sets.filter(x => shown.has(x.n)).map(x => x.n + ': ' + (repsOnly ? x.r : fmtNum(x.w) + '×' + x.r)).join(' · '),
      })),
      ns: lines.map(l => l.n),
      hidden,
      metric,
      drop: dropOffSet(sessions),
    }
  }, [workouts, curEx, curMode, repsOnly, oneRmFormula])
  // The same sessions cut to the range; a set number with nothing left in it drops out of the legend.
  const perSetChart = useMemo(() => {
    if (!perSet) return null
    const series = perSet.series.map(s => ({ ...s, points: s.points.filter(p => p.t >= exFrom) })).filter(s => s.points.length)
    return { anchors: perSet.anchors.filter(p => p.t >= exFrom), series, ns: series.map(s => s.n) }
  }, [perSet, exFrom])
  const onSets = !!perSet && exMetric === 'sets'
  const onE1 = showE1 && exMetric === 'e1rm'
  const onEff = showEff && exMetric === 'effort'
  const onMax = showMax && exMetric === 'max'
  const topPts = exPts.map((p, i) => ({
    t: p.t, y: p.y, d: p.d,
    // 0 RIR (nothing left) is a full dot, 4+ a faint one; unrated sessions keep the plain line.
    m: exRir[i] == null ? null : 1 - Math.min(4, Math.max(0, exRir[i])) / 4,
    note: exRir[i] == null ? undefined : hd + ' ' + fmtNum(toScale(kind, exRir[i]))
  })).filter(inExRange)
  const chartPts = onSets ? perSetChart.anchors : onMax ? maxChartPts : onEff ? effPts : onE1 ? e1ChartPts : topPts
  // A line needs two workouts. A range that holds fewer says so, instead of a lone dot or an empty box.
  const rangeTooShort = exRange !== 0 && chartPts.length < 2
  const exOpts = [{ value: 'top', label: t('Top set') }]
  if (perSet) exOpts.push({ value: 'sets', label: t('Per set') })
  if (showE1) exOpts.push({ value: 'e1rm', label: t('Est. 1RM') })
  if (showEff) exOpts.push({ value: 'effort', label: t('Effort') })
  if (showMax) exOpts.push({ value: 'max', label: t('Max reps') })

  return <>
    <div className="hdr"><div><h1>{t('Stats')}</h1><div className="sub">{t('Progress & history')}</div></div>
      <button className="iconbtn" onClick={() => nav('/history')} aria-label={t('History')}><Icon name="history" /></button></div>

    <Segmented className="plan-views stats-tabs" value={tab} onChange={setTab}
      options={[{ value: 'muscles', label: t('Muscles') }, { value: 'progress', label: t('Progress') }, { value: 'activity', label: t('Activity') }]} />

    {tab === 'muscles' && <>
      {(workouts.length > 0 || Object.keys(loadOfWeeklyPlan(S)).length > 0) && <MuscleBalance S={S} />}
      {S.routines.length > 0 && <WeeklyPlanVolume S={S} />}
      {!(workouts.length > 0 || Object.keys(loadOfWeeklyPlan(S)).length > 0 || S.routines.length > 0) && <div className="card muted small">{t('Finish your first workout and your progress curves will show up here.')}</div>}
    </>}

    {tab === 'progress' && <>
      <div className="cols">
        <div className="card">
          <div className="row between bw-head" style={{ marginBottom: 8 }}>
            <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
            <div className="row" style={{ gap: 8 }}>
              <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
              <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
            </div>
          </div>
          <Segmented className="seg-range" value={range} onChange={setRange}
            options={rangeOptions()} />
          <div className="chart"><LineChart points={bwPts} h={160} unit={S.unit} goal={S.targetW} /></div>
          {/* every weigh-in, week by week with its average (Discord 'Weight') */}
          {S.bodyweight.length > 0 && <div className="row" style={{ justifyContent: 'flex-end', marginTop: 4 }}>
            <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={weighInsSheet}>{t('All weigh-ins')}</Button>
          </div>}
        </div>

        <div className="card">
          <h2>{t('Exercise progress')}</h2>
          {exHist.length ? <>
            <div className="sect-b" style={{ marginBottom: 10 }}>
              <SelectRow title={t('Exercise')} sheetTitle={t('Exercise progress')} value={curEx} onChange={setExId} stackedValue
                options={exHist.map(id => ({ value: id, label: (EXIDX[id] ? exerciseNameText(EXIDX[id]) : nameOf(id)) + (exCurrent[id].mx ? ' · ' + fmtNum(exCurrent[id].mx) + ' ' + exCurrent[id].unit : '') }))}
                search={{
                  placeholder: t('Search…'),
                  label: t('Search…'),
                  emptyLabel: t('No match'),
                  match: (option, query) => matchExercise(matcherOf(option.value), query),
                }} />
            </div>
            {exOpts.length > 1 && <Segmented className="seg-range" value={onMax ? 'max' : onEff ? 'effort' : onE1 ? 'e1rm' : onSets ? 'sets' : 'top'} onChange={setExMetric} options={exOpts} />}
            <Segmented className="seg-range" value={exRange} onChange={setExRange} options={rangeOptions()} />
            <div className="chart">
              {rangeTooShort
                ? <div className="empty small">{t('Fewer than two workouts in this period. Pick a longer one.')}</div>
                : onSets
                ? <LineChart points={perSetChart.anchors} series={perSetChart.series} h={150} unit={perSet.metric === 'reps' ? t('reps') : S.unit} />
                : onMax
                ? <LineChart points={maxChartPts} h={150} unit={t('reps')} color="var(--blue)" />
                : onEff
                ? <LineChart points={effPts} h={150} unit={hd} color="var(--yellow)" invert={kind === 'rir'} />
                : <LineChart points={chartPts} h={150} unit={exUnit} color="var(--blue)" />}
            </div>
            {onSets && !rangeTooShort && <div className="row small" style={{ gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
              {perSetChart.ns.map(n => <span key={n} className="row" style={{ gap: 5, alignItems: 'center' }}>
                <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: SET_COLORS[n - 1] }} />{t('Set {0}', n)}
              </span>)}
            </div>}
            <div style={{ marginTop: 8 }}>{exList.map((p, i) => <div key={i} className="row between small" style={{ padding: '6px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
              <span className="muted">{fmtDate(p.d, true)}</span><span>{p.sets.map(s => setLabel(curEx, s, p.target, speedUnit)).join('  ')}</span></div>)}</div>
            <div className="small dim" style={{ marginTop: 8 }}>
              {onSets ? (perSet.metric === 'reps' ? t('Reps in each working set, one line per set number') : t('Estimated 1RM of each working set, one line per set number')) : onMax ? <>{t('Most reps in a Max set per workout')} · {t('Best:')}{' '}<b className="accent">{maxBest} {t('reps')}</b></> : onEff ? t('Average effort per workout') : onE1 ? t('Estimated 1RM per workout') : curCardio ? t('Top speed per workout') : curTimed ? t('Longest hold per workout') : repsOnly ? t('Most reps in a set per workout') : t('Best set weight per workout')}
              {onEff || onMax || onSets ? '' : <> · {t('Best:')}{' '}<b className="accent">{fmtNum(onE1 ? e1Best.est : exBest)} {onE1 ? S.unit : exUnit}</b></>}
            </div>
            {onSets && (perSet.drop || perSet.hidden > 0) && <div className="small dim" style={{ marginTop: 4 }}>
              {perSet.drop && t('Where you most often drop off: set {0} ({1} of {2} workouts)', perSet.drop.n, perSet.drop.count, perSet.drop.of)}
              {perSet.drop && perSet.hidden > 0 ? ' · ' : ''}
              {perSet.hidden > 0 && t('Only the first {0} sets are drawn.', perSet.ns.length)}
            </div>}
            {onE1 && <div className="small dim" style={{ marginTop: 4 }}>
              {t('Best estimate from {0} on {1}. An estimate, not a tested max.', fmtNum(e1Best.w) + ' ' + S.unit + ' × ' + e1Best.r, fmtDate(e1Best.d, true))}
            </div>}
            {!onEff && !onE1 && !onMax && !onSets && showEff && <div className="small dim" style={{ marginTop: 4 }}>
              {t('A fuller dot means less left in the tank. The same weight at a lower {0} is progress the line alone doesn’t show.', hd)}
            </div>}
          </> : <div className="muted small">{t('Finish your first workout and your progress curves will show up here.')}</div>}
        </div>
      </div>

      {(hasEffort(S) || hasEstimableEffort(S)) && <EffortCard S={S} />}

      {workouts.length > 0 && <div className="card row between" style={{ alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{t('Structural balance')}</h2>
          <div className="muted small" style={{ marginTop: 4 }}>{t('See which lift is holding back the rest.')}</div></div>
        <Button size="sm" variant="tinted" trailingIcon="chevronRight" style={{ flexShrink: 0 }} onClick={() => nav('/structural-balance')}>{t('Open')}</Button>
      </div>}
      <div className="card row between" style={{ alignItems: 'center', gap: 12 }}>
        <div style={{ minWidth: 0 }}><h2 style={{ margin: 0 }}>{t('Body measurements')}</h2>
          <div className="muted small" style={{ marginTop: 4 }}>{(S.measurements || []).length
            ? t('Last check-in {0}', fmtDate(S.measurements[S.measurements.length - 1].d, true))
            : t('Waist, arms, body fat and anything else you measure, each with its own curve.')}</div></div>
        <Button size="sm" variant="tinted" trailingIcon="chevronRight" style={{ flexShrink: 0 }} onClick={() => nav('/measurements')}>{t('Open')}</Button>
      </div>
    </>}

    {tab === 'activity' && <>
      <div className="tiles">
        <div className="tile"><div className="l"><Icon name="dumbbell" />{t('Workouts')}</div><div className="v">{workouts.length}</div></div>
        <div className="tile"><div className="l"><Icon name="calendar" />{t('This month')}</div><div className="v">{monthW}</div></div>
        <div className="tile"><div className="l"><Icon name="flame" />{t('Week streak')}</div><div className="v">{streakWeeks(S)}</div></div>
        <div className="tile"><div className="l"><Icon name="scale" />{t('Weight 30d')}</div><div className="v" style={{ fontSize: 22, color: bwDelta30 === null ? 'inherit' : bwDeltaColor(bwDelta30, (lastBW(S) || {}).w || 0) }}>{bwDelta30 === null ? '–' : (bwDelta30 > 0 ? '+' : '') + fmtNum(bwDelta30) + ' ' + S.unit}</div></div>
      </div>

      <div className="card">
        <h2>{t('Activity (last 12 months)')}</h2>
        <Heatmap
          S={S}
          metric={S.heatmapMetric === 'vol' ? 'vol' : 'time'}
          onMetricChange={metric => useStore.getState().update(s => { s.heatmapMetric = metric })}
          onDay={iso => { const ws = workouts.filter(w => workoutDay(w) === iso); if (ws.length === 1) workoutDetailSheet(ws[0]); else if (ws.length) calendarSheet(iso); else dayOverrideSheet(iso) }}
        />
      </div>

      {workouts.length > 0 && <>
        <div className="row between" style={{ marginBottom: 10 }}>
          <h4 className="sec" style={{ margin: 0 }}>{t('Recent workouts')}</h4>
          <Button size="sm" variant="ghost" trailingIcon="chevronRight" onClick={() => nav('/history')}>{t('All')} {workouts.length}</Button>
        </div>
        <div className="list">{[...workouts].reverse().slice(0, 6).map(w => <WorkoutRow key={w.id} w={w} onClick={() => workoutDetailSheet(w)} />)}</div>
      </>}
    </>}
  </>
}
