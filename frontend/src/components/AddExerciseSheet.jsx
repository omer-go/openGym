import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { ADD_GROUPS, avatarOf, groupOfMuscle, muscleStatus, suggestedGroups, groupExercises, lastTopSet, activityLast } from '../lib/add-exercise.js'
import { ACTIVITY_GROUPS, activityGroup, activityOf } from '../lib/activities.js'
import { MUSCLE_NAME, doneSetItems } from '../lib/muscles.js'
import { EXIDX } from '../lib/exercises.js'
import { primaryMuscleOf } from '../lib/strength-exercises.js'
import { groupColor, mcStyle } from '../lib/muscle-colors.js'
import { fmtNum, fmtDaysAgo, todayISO, isoOf } from '../lib/format.js'
import { weeklyNeed, variantHistory } from '../lib/coverage.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import BodyMap, { MuscleAvatar } from './BodyMap.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'
import { useMuscleRoles } from './MuscleRoles.jsx'
import { rolesLoaded, partGap, muscleRolesOf } from '../lib/muscle-roles.js'

// The workout's Add exercise: pick a muscle group (what the last 7 days lack most, less what the
// workout already covers, is marked Suggested), then an exercise from it, its areas in the order
// you most need them and its exercises by what they add (lib/coverage.js). The full search
// picker — every exercise, filters, Create your own — stays one tap away (`onSearch`).
// The routine editor opens it with `routineId`: the routine is then the session, and the week is
// left out, since a routine is for any week: Suggested is what the routine covers least.
// Grouping and ranking live in lib/add-exercise.js.
// A swap opens it with a `title` and `like`, the exercise being replaced: it then starts on that
// exercise's group and area, Back still leading to every group.
// Cardio and Stretching sit below the muscle groups (lib/activities.js): their areas are kinds of
// cardio and parts of the body, with an icon where a muscle group has its avatar, and no
// this-week dots, since nobody needs to run every muscle.

const PER_AREA = 5       // rows an area shows before its "Show all"
const PAGE = 40          // rows a single list shows before "Show more"

const Dot = ({ st }) => <i className={'ax-dot' + (st ? ' ' + st : '')} />
// A muscle group's picture: the body cropped to its muscles, lit. The one-tap setup (GenSetup) shows it too.
export const Ava = ({ slugs, body, className }) => {
  const a = avatarOf(slugs, body)
  return <MuscleAvatar body={body} view={a.view} on={a.on} vb={a.vb} className={className} />
}

// "Rear delt: no sets in 2 weeks": the part of an area the last two weeks left behind.
function gapLine({ name, sets }) {
  return sets === 0 ? t('{0}: no sets in 2 weeks', t(name)) : sets === 1 ? t('{0}: 1 set in 2 weeks', t(name)) : t('{0}: {1} sets in 2 weeks', t(name), sets)
}

function areaLine({ st, last }, routine) {
  if (routine) return st === 'td' ? t('In this routine') : last ? t('Last {0}', fmtDaysAgo(last)) : t('Not trained yet')
  if (st === 'td') return t('In this workout')
  if (st === 'wk') return t('Trained {0}', fmtDaysAgo(last))
  return last ? t('Last {0}', fmtDaysAgo(last)) : t('Not trained yet')
}

const Legend = ({ routine }) => <div className="ax-legend">
  {routine
    ? <><span><Dot st="td" />{t('In this routine')}</span><span><Dot />{t('Not yet')}</span></>
    : <><span><Dot st="td" />{t('Today')}</span><span><Dot st="wk" />{t('Last 7 days')}</span><span><Dot />{t('Not yet')}</span></>}
</div>

// Where a swap away from `id` starts: its primary muscle's group, narrowed to that muscle when
// the group has more than one.
function startOf(id) {
  const act = id && activityOf(EXIDX[id])
  if (act) return act
  const g = id && groupOfMuscle(primaryMuscleOf(EXIDX[id])?.slug)
  if (!g) return { group: null, area: '' }
  return { group: g.id, area: g.m.length > 1 ? primaryMuscleOf(EXIDX[id]).slug : '' }
}

const ALL = ADD_GROUPS.map(g => g.id)
const NONE = []

export default function AddExerciseSheet({ onPick, onSearch, title, like, routineId }) {
  const S = useStore(s => s.S)
  const routine = routineId ? S.routines.find(r => r.id === routineId) || { ex: NONE } : null
  const have = routine ? routine.ex : S.active?.entries || NONE
  const body = S.body === 'female' ? 'female' : 'male'
  const [start] = useState(() => startOf(like))
  const [group, setGroup] = useState(start.group)
  const [view, setView] = useState('grid')       // 'grid' | 'map'
  const [area, setArea] = useState(start.area)
  const [sort, setSort] = useState('suggested')  // 'suggested' | 'recent' | 'az'
  const [more, setMore] = useState({})           // area -> rows shown, past the default
  const status = useMemo(() => muscleStatus(S, todayISO(), routine && have), [S.workouts, have])
  const actLast = useMemo(() => activityLast(S), [S.workouts])
  // What the week still needs per group; a routine, being for any week, needs everything. The
  // muscle roles say which part of a muscle was done last (coverage.js).
  useMuscleRoles()
  const gaps = useMemo(() => ({
    need: routine ? Object.fromEntries(ALL.map(id => [id, 1])) : weeklyNeed(S, ALL),
    history: variantHistory(S),
  }), [S.workouts, S.unit, !!routine, rolesLoaded()])
  const suggested = useMemo(() => suggestedGroups(gaps.need, have), [gaps, have])
  // Which part of each area the last 14 days (this session's done sets included) left behind,
  // from the muscle roles (muscle-roles.js partGap). Not for a routine: it has no recent past.
  const partGaps = useMemo(() => {
    if (routine) return {}
    const since = new Date(); since.setDate(since.getDate() - 13)
    const items = doneSetItems([...S.workouts.filter(w => w.d >= isoOf(since)), ...(S.active ? [S.active] : [])])
    return Object.fromEntries(ADD_GROUPS.flatMap(x => x.m).map(m => [m, partGap(items, m)]).filter(([, v]) => v))
  }, [S.workouts, S.active, !!routine, rolesLoaded()])
  const openGroup = (id, slug = '') => { setGroup(id); setArea(slug); setMore({}) }

  if (!group) {
    // Each group in its colour (lib/muscle-colors.js): the one its exercises carry in the workout.
    const tile = g => <button key={g.id} className="ax-gt mg" style={mcStyle(groupColor(g.id))} onClick={() => openGroup(g.id)}>
      <Ava slugs={g.m} body={body} />
      <span className="ax-m"><b>{t(g.n)}</b><span className="ax-st">
        <span className="ax-dots">{g.m.map(m => <Dot key={m} st={status[m].st} />)}</span>
        {suggested.includes(g.id) && <span className="ax-badge">{t('Suggested')}</span>}
      </span></span>
    </button>
    const actTile = g => <button key={g.id} className="ax-gt mg" style={mcStyle(groupColor(g.id))} onClick={() => openGroup(g.id)}>
      <span className="ava ax-ico"><Icon name={g.icon} /></span>
      <span className="ax-m"><b>{t(g.n)}</b><span className="ax-st"><span className="muted small">{actLast[g.id] ? t('Last {0}', fmtDaysAgo(actLast[g.id])) : t('Not done yet')}</span></span></span>
    </button>
    // The map shades this week the way the dots do: in the workout strongest, trained this week lighter.
    const load = Object.fromEntries(Object.entries(status).map(([m, s]) => [m, s.st === 'td' ? 2 : s.st === 'wk' ? 1 : 0]))
    return <>
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
        <div><h3>{title || t('Add exercise')}</h3><div className="muted small">{routine ? t('Suggested is what this routine covers least') : t('Suggested is what your last 7 days lack most')}</div></div>
        <Button size="sm" variant="tinted" icon="magnifier" onClick={onSearch}>{t('Search')}</Button>
      </div>
      <Segmented options={[{ value: 'grid', label: t('Groups') }, { value: 'map', label: t('Body map') }]} value={view} onChange={setView} />
      {view === 'map'
        ? <div className="card" style={{ marginTop: 12 }}><BodyMap className="tappable" body={body} load={load} onMuscle={m => groupOfMuscle(m) && openGroup(groupOfMuscle(m).id, groupOfMuscle(m).m.length > 1 ? m : '')} /></div>
        : <>
          <h4 className="sec">{t('Upper body')}</h4>
          <div className="ax-gts">{ADD_GROUPS.filter(g => !g.low).map(tile)}</div>
          <h4 className="sec">{t('Lower body')}</h4>
          <div className="ax-gts">{ADD_GROUPS.filter(g => g.low).map(tile)}</div>
        </>}
      <h4 className="sec">{t('Cardio & stretching')}</h4>
      <div className="ax-gts">{ACTIVITY_GROUPS.map(actTile)}</div>
      <Legend routine={!!routine} />
    </>
  }

  const act = activityGroup(group)
  const g = act ? { ...act, m: act.areas.map(a => a.id) } : ADD_GROUPS.find(x => x.id === group)
  const areaOf = m => act?.areas.find(a => a.id === m)
  const areaName = m => (act ? t(areaOf(m).n) : t(MUSCLE_NAME[m]))
  const { sections, hidden } = groupExercises(S, group, { sort, area, status, have, gaps })
  const single = !!area || sort === 'recent'
  const fills = (ex, gap) => !!gap && !!muscleRolesOf(ex.id)?.target?.some(m => gap.muscles.includes(m))
  const row = (ex, gap) => {
    const last = lastTopSet(S, ex.id)
    return <div key={ex.id} className="item" {...tappable(() => onPick(ex))}>
      <Thumb ex={ex} />
      <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
        <div className="ss capitalize">{sort === 'recent' && g.m.length > 1 && !act ? t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) + ' · ' : ''}{act?.id === 'stretching' ? t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) : t(ex.eq)}{fills(ex, gap) && <b className="ax-fills"> · {t(gap.name)}</b>}</div></div>
      <div className="ax-last">{last && act
        ? <span>{fmtDaysAgo(last.d)}</span>
        : last ? <><b>{last.w > 0 ? `${fmtNum(last.w)} ${S.unit} × ${last.r ?? '–'}` : `× ${last.r ?? '–'}`}</b><span>{fmtDaysAgo(last.d)}</span></>
        : <span className="ax-new">{t('New')}</span>}</div>
      {/* Same as the search picker's "+": adds at once with last time's (or the default) sets. */}
      <button className="iconbtn chev" aria-label={t('Add “{0}”', exerciseNameFor(ex))} style={{ padding: 8, margin: -8 }}
        onClick={ev => { ev.stopPropagation(); onPick(ex, true) }}><Icon name="plus" /></button>
    </div>
  }
  // The best-ranked exercise for the area's gap part leads; the rest keep their order and variety.
  const list = (key, xs, gap) => {
    const lead = gap ? xs.findIndex(ex => fills(ex, gap)) : -1
    if (lead > 0) xs = [xs[lead], ...xs.slice(0, lead), ...xs.slice(lead + 1)]
    const n = more[key] || (single ? PAGE : PER_AREA)
    return <>
      <div className="list">{xs.slice(0, n).map(ex => row(ex, gap))}</div>
      {xs.length > n && <button className="ax-more" onClick={() => setMore(m => ({ ...m, [key]: n + PAGE }))}>
        {single ? t('Show more') : t('Show all {0}', fmtNum(xs.length))}</button>}
    </>
  }
  // The group's colour reaches its pictures and rows; display: contents leaves the layout alone.
  return <div className="mg" style={{ display: 'contents', ...mcStyle(groupColor(group)) }}>
    <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
      <button className="iconbtn" aria-label={t('Back to muscle groups')} onClick={() => setGroup(null)}><Icon name="chevronLeft" /></button>
      <div className="grow">{title && <div className="muted small">{title}</div>}<h3>{t(g.n)}</h3>{g.m.length > 1 && <div className="muted small">{act?.id === 'cardio' ? t('Start a stopwatch on the set, stop it when you are done') : act ? t('Each stretch is timed: start the stopwatch, stop it when you are done') : t('Tap an area to see only its exercises')}</div>}</div>
    </div>
    {g.m.length > 1 && <div className="ax-subs" role="group">
      {['', ...g.m].map(m => <button key={m || 'all'} className={'ax-sub' + (area === m ? ' on' : '')} aria-pressed={area === m}
        onClick={() => { setArea(m); setMore({}) }}>
        {act
          ? <span className="ax-aw"><span className="ava lg ax-ico"><Icon name={m ? areaOf(m).icon : act.icon} /></span></span>
          : <span className="ax-aw"><Ava slugs={m ? [m] : g.m} body={body} className="lg" />{m && <Dot st={status[m].st} />}</span>}
        <span className="ax-sl">{m ? areaName(m) : t('All')}</span>
      </button>)}
    </div>}
    <Segmented options={[{ value: 'suggested', label: t('Suggested') }, { value: 'recent', label: t('Recent') }, { value: 'az', label: t('A to Z') }]}
      value={sort} onChange={v => { setSort(v); setMore({}) }} />
    {sections.length === 0 && <div className="empty">{sort === 'recent' ? t('Nothing logged here yet. Try Suggested or A to Z.') : t('Nothing left here.')}</div>}
    {sections.map((x, k) => {
      const gap = !act && sort === 'suggested' ? partGaps[x.m] : null
      return x.m
      ? <div key={x.m} className="ax-area">
        <div className="ax-ahd">{act ? <span className="ava xs ax-ico"><Icon name={areaOf(x.m).icon} /></span> : <Ava slugs={[x.m]} body={body} className="xs" />}
          <span className="grow"><b>{areaName(x.m)}</b><small>{act ? (x.last ? t('Last {0}', fmtDaysAgo(x.last)) : t('Not done yet')) : areaLine(x, !!routine)}</small></span>
          {!act && sort === 'suggested' && k === 0 && !x.st && <span className="ax-badge">{t('Do next')}</span>}
        </div>
        {gap && <div className="ax-gap"><Icon name="info" />{gapLine(gap)}</div>}
        {list(x.m, x.list, gap)}
      </div>
      : <div key="recent" className="ax-area">{list('recent', x.list)}</div>
    })}
    {hidden > 0 && <div className="small dim" style={{ margin: '10px 2px 0' }}>{routine ? t('Already in this routine: {0}', hidden) : t('Already in this workout: {0}', hidden)}</div>}
    <div style={{ height: 12 }} />
    <Button variant="ghost" icon="magnifier" onClick={onSearch}>{t('Search all exercises')}</Button>
  </div>
}
