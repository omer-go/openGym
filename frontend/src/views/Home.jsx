import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { todayISO, isoOf, weekStartOf, weekDayOffset, DAYS } from '../lib/format.js'
import { t, tn, dateLocale } from '../lib/i18n.js'
import { startFlow, startGenerated, menuSheet, WorkoutRow, DayNoteRow, workoutDetailSheet, logPastWorkoutSheet } from '../sheets.jsx'
import { useUI } from '../store/useUI.js'
import { fmtDate } from '../lib/format.js'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { useConnectionTrouble } from '../components/SyncBanner.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'
import { dayNoteOf } from '../lib/day-notes.js'
import { GEN_NAME } from '../lib/generate.js'
import { KIND_COLOR, workoutsOn } from '../lib/workout-kind.js'
import { NextDayCard, WeekGoalCard, PROGRAM_SHORT } from '../components/Program.jsx'
import { programLayout } from '../lib/program.js'
import { PLAN_VIEW_KEY } from './Plan.jsx'

// A day's label in the week strip: the day type, short, or the routine's own name.
const SHORT = { full: 'Full', pull: 'Pull', push: 'Push', legs: 'Legs', free: 'Free' }
const shortName = ({ w, kind }) => (kind === 'routine' ? w.name || t('Routine') : t(SHORT[kind]))

// The four one-tap tiles (lib/generate.js): a session built from the muscles trained least lately.
const GEN_TILES = [
  { type: 'full', glyph: 'figureStrength', what: 'Every major muscle' },
  { type: 'pull', glyph: 'pullup', what: 'Back, traps, biceps' },
  { type: 'push', glyph: 'barbell', what: 'Chest, shoulders, triceps' },
  { type: 'legs', glyph: 'legs', what: 'Quads, hamstrings, glutes, calves' },
]

// A tile's glyph per kind, so a day's sessions wear the icon of the tile they came from.
const KIND_ICON = { full: 'figureStrength', pull: 'pullup', push: 'barbell', legs: 'legs' }

// A day in the week strip: the sessions actually logged that day, each opening its detail. The
// plan is not this sheet's business; Plan is where it lives. A past day with nothing logged can
// get a session backfilled.
function DayWorkouts({ iso, close }) {
  const S = useStore(s => s.S)
  const day = workoutsOn(S.workouts, iso)
  const note = dayNoteOf(S, iso)
  const open = w => { close(); workoutDetailSheet(w) }
  return <>
    <h3>{fmtDate(iso, true)}</h3>
    {day.length ? <div className="list">
      {day.map(({ w, kind }) => <WorkoutRow key={w.id} w={w} color={KIND_COLOR[kind]}
        icon={KIND_ICON[kind] ? glyphOf(KIND_ICON[kind]) : kind === 'free' ? 'shuffle' : undefined} onClick={() => open(w)} />)}
    </div> : <div className="muted small" style={{ marginBottom: 12 }}>{t('Nothing logged yet')}</div>}
    {note && <div className="list" style={{ marginTop: 8 }}><DayNoteRow iso={iso} note={note} /></div>}
    {!day.length && iso < todayISO() && !S.active && <Button icon="plus" onClick={() => { close(); logPastWorkoutSheet({ iso }) }}>{t('Log a past workout')}</Button>}
  </>
}
const daySheet = iso => useUI.getState().openSheet(close => <DayWorkouts iso={iso} close={close} />)

// Your saved routines, one tap each. With none saved yet, the sheet points at Plan.
function routinesSheet(S, nav) {
  menuSheet({
    title: t('Saved routines'),
    items: S.routines.length
      ? S.routines.map(r => ({ icon: glyphOf(r.emoji), label: r.name, sub: tn('{0} exercise', '{0} exercises', r.ex.length), chevron: true, onClick: () => startFlow([r.id]) }))
      : [{ icon: 'plus', label: t('Build a plan first'), chevron: true, onClick: () => nav('/plan') }],
  })
}

// Home = this week at a glance + starting a workout. Charts, weigh-ins and history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)
  // The banner switched off and the sync stuck: a dot on the gear (Settings → Show connection status).
  const trouble = useConnectionTrouble()
  const [weekOffset, setWeekOffset] = useState(0)

  const today = new Date()
  const ws = weekStartOf(S)
  // The first day of the shown week. Named for the role, not for Monday — which day that is
  // is the setting.
  const wkStart = new Date(today)
  wkStart.setDate(today.getDate() - weekDayOffset(today.getDay(), ws) + weekOffset * 7)
  const strip = []
  let doneInWeek = 0
  // With a program chosen, the days it has left this week show as a forecast (lib/program.js).
  const layout = programLayout(S, isoOf(wkStart))
  for (let i = 0; i < 7; i++) {
    const d = new Date(wkStart); d.setDate(wkStart.getDate() + i)
    const iso = isoOf(d)
    // Each session that day is a dot in its kind's colour, and the first one names the day.
    const day = workoutsOn(S.workouts, iso)
    doneInWeek += day.length
    const ahead = !day.length && layout?.[i].items.find(it => it.state !== 'done')
    strip.push(<div key={i} className={'wday' + (iso === todayISO() ? ' today' : '')} {...tappable(() => daySheet(iso))}>
      <div className="lbl">{t(DAYS[d.getDay()])}</div><div className="num">{d.getDate()}</div>
      <div className="dots">
        {day.length ? day.slice(0, 3).map((x, j) => <span key={j} className="dot" style={{ background: KIND_COLOR[x.kind] }} />)
          : ahead ? <span className="dot planned" style={{ '--kind': KIND_COLOR[ahead.type] }} />
          // A day off with a note (#261) reads as excused.
          : <span className={'dot' + (dayNoteOf(S, iso) ? ' noted' : '')} />}
      </div>
      <div className={'wk-name' + (ahead ? ' planned' : '')} style={day.length ? { color: KIND_COLOR[day[0].kind] } : ahead ? { color: KIND_COLOR[ahead.type] } : undefined}>
        {day.length ? shortName(day[0]) + (day.length > 1 ? ' +' + (day.length - 1) : '') : ahead ? t(PROGRAM_SHORT[ahead.type]) : '\u00a0'}
      </div>
    </div>)
  }
  const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 6)
  const wkLabel = weekOffset === 0 ? t('This week') : `${wkStart.getDate()} ${wkStart.toLocaleDateString(dateLocale(), { month: 'short' })} – ${wkEnd.getDate()} ${wkEnd.toLocaleDateString(dateLocale(), { month: 'short' })}`
  const editingSaved = !!S.active?.editingWorkoutId
  const openPrograms = () => {
    try { localStorage.setItem(PLAN_VIEW_KEY, 'schedule') } catch { /* the view just isn't remembered */ }
    nav('/plan', { state: { programs: true } })
  }

  // Each tile wears its kind's colour, the one its sessions get in the week strip.
  const tile = (key, icon, title, sub, onClick) => <div key={key} className="gen-tile kind" style={{ '--kind': KIND_COLOR[key] }} role="button" aria-label={title} {...tappable(onClick)}>
    <div className="row" style={{ gap: 8 }}>
      <span className="lrow-i" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 17 }}><Icon name={icon} /></span>
      <div className="tt">{title}</div>
    </div>
    <div className="ss">{sub}</div>
  </div>

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1><div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>
      <button className="iconbtn" onClick={() => nav('/settings')} aria-label={trouble ? t('Settings') + ', ' + t('Connection problem') : t('Settings')}><Icon name="gear" />{trouble && <span className="tab-dot" aria-hidden="true" />}</button>
    </div>

    <div className="card">
      <div className="row between" style={{ marginBottom: 8 }}>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w - 1)} aria-label={t('Previous week')}><Icon name="chevronLeft" /></button>
        <div className="small muted" style={{ fontWeight: 500 }}>{wkLabel} · {tn('{0} workout', '{0} workouts', doneInWeek)}</div>
        <button className="iconbtn" style={{ width: 30, height: 30, fontSize: 15 }} onClick={() => setWeekOffset(w => w + 1)} aria-label={t('Next week')}><Icon name="chevronRight" /></button>
      </div>
      <div className="week home-week">{strip}</div>
    </div>

    {/* A session in progress wins: starting another would overwrite it. */}
    {S.active ? <div className="card">
      <div className="today-row" style={{ marginTop: 0 }} {...tappable(() => nav('/workout'))}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: 'var(--orange)' }}><Icon name={editingSaved ? 'pencil' : 'play'} /></span>
          <div style={{ minWidth: 0 }}><div className="ttl">{editingSaved ? S.active.name : t('{0} (in progress)', S.active.name)}</div></div>
        </div>
        <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{editingSaved ? t('Edit') : t('Resume')}</span>
      </div>
    </div> : <>
    {/* The next day: the program's, or the one-tap day the week's goal needs most (lib/program.js). */}
    <NextDayCard onPrograms={openPrograms} />
    <div className="card">
      <h2 style={{ marginBottom: 10 }}>{t('Start workout')}</h2>
      <div className="gen-grid">
        {GEN_TILES.map(({ type, glyph, what }) => tile(type, glyphOf(glyph), t(GEN_NAME[type]), t(what), () => startGenerated(type)))}
        {tile('free', 'shuffle', t('Freestyle'), t('Pick exercises as you go'), () => startFlow([]))}
        {tile('routine', 'clipboard', t('Saved routines'), tn('{0} routine', '{0} routines', S.routines.length), () => routinesSheet(S, nav))}
      </div>
    </div>
    </>}
    <WeekGoalCard />
  </div>
}
