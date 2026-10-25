import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { ADD_GROUPS, avatarOf, groupOfMuscle, muscleStatus, suggestedGroups, shortlist, groupFacets, lastTopSet, activityLast, closeness } from '../lib/add-exercise.js'
import { narrow } from '../lib/exercise-facets.js'
import { trainingIndex } from '../lib/generate.js'
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
import { rolesLoaded, partFocus, targetParts, muscleRolesOf } from '../lib/muscle-roles.js'

// The workout's Add exercise: pick a muscle group (what the last 7 days lack most, less what the
// workout already covers, is marked Suggested), then an exercise from it, its areas in the order
// you most need them and its exercises by what they add (lib/coverage.js). The full search
// picker — every exercise, filters, Create your own — stays one tap away (`onSearch`).
// The routine editor opens it with `routineId`: the routine is then the session, and the week is
// left out, since a routine is for any week: Suggested is what the routine covers least.
// Grouping and ranking live in lib/add-exercise.js.
// A swap opens it with a `title` and `like`, the exercise being replaced: it then starts on that
// exercise's group and area, Back still leading to every group, and what works the same part of
// the muscle as `like` (a side-delt raise for a side-delt raise) comes first.
// Otherwise what works the part of a muscle the last two weeks targeted least comes first
// (muscle-roles.js partFocus), as in the one-tap workouts.
// Cardio and Stretching sit below the muscle groups (lib/activities.js): their areas are kinds of
// cardio and parts of the body, with an icon where a muscle group has its avatar, and no
// this-week dots, since nobody needs to run every muscle.

const STEP_ROWS = 10     // rows the list the questions end on shows before "Show more"
const STEP_PAGE = 20

const Dot = ({ st }) => <i className={'ax-dot' + (st ? ' ' + st : '')} />
// A muscle group's picture: the body cropped to its muscles, lit. The one-tap setup (GenSetup) shows it too.
export const Ava = ({ slugs, body, className }) => {
  const a = avatarOf(slugs, body)
  return <MuscleAvatar body={body} view={a.view} on={a.on} vb={a.vb} className={className} />
}

const Legend = ({ routine }) => <div className="ax-legend">
  {routine
    ? <><span><Dot st="td" />{t('In this routine')}</span><span><Dot />{t('Not yet')}</span></>
    : <><span><Dot st="td" />{t('Today')}</span><span><Dot st="wk" />{t('Last 7 days')}</span><span><Dot />{t('Not yet')}</span></>}
</div>

// Where a swap away from `id` starts: the group of its activity or its primary muscle.
function startOf(id) {
  const act = id && activityOf(EXIDX[id])
  if (act) return act.group
  return (id && groupOfMuscle(primaryMuscleOf(EXIDX[id])?.slug)?.id) || null
}

const ALL = ADD_GROUPS.map(g => g.id)
const NONE = []

export default function AddExerciseSheet({ onPick, onSearch, title, like, routineId }) {
  const S = useStore(s => s.S)
  const routine = routineId ? S.routines.find(r => r.id === routineId) || { ex: NONE } : null
  const have = routine ? routine.ex : S.active?.entries || NONE
  const body = S.body === 'female' ? 'female' : 'male'
  const [group, setGroup] = useState(() => startOf(like))
  const [view, setView] = useState('grid')       // 'grid' | 'map'
  const [path, setPath] = useState(null)         // null: the group's shortlist; else "Something else"'s answers so far
  const [rows, setRows] = useState(STEP_ROWS)    // rows the list at the end of the questions shows
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
  // The part of each area to favour: in a swap, the one `like` works; otherwise the one the last
  // 14 days (this session's done sets included) targeted least (muscle-roles.js partFocus), which
  // a routine, having no recent past, goes without.
  const partGaps = useMemo(() => {
    const own = like && primaryMuscleOf(EXIDX[like])?.slug
    const parts = own && targetParts(like, own)
    if (parts?.length) return { [own]: { name: parts[0].name, muscles: parts.flatMap(x => x.muscles), parts, swap: true } }
    if (routine) return {}
    const since = new Date(); since.setDate(since.getDate() - 13)
    const items = doneSetItems([...S.workouts.filter(w => w.d >= isoOf(since)), ...(S.active ? [S.active] : [])])
    return Object.fromEntries(ADD_GROUPS.flatMap(x => x.m).map(m => [m, partFocus(items, m)]).filter(([, v]) => v))
  }, [S.workouts, S.active, !!routine, like, rolesLoaded()])
  const logged = useMemo(() => new Set(Object.keys(trainingIndex(S).exercises)), [S.workouts])
  const openGroup = id => { setGroup(id); setPath(null) }

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
        ? <div className="card" style={{ marginTop: 12 }}><BodyMap className="tappable" body={body} load={load} onMuscle={m => groupOfMuscle(m) && openGroup(groupOfMuscle(m).id)} /></div>
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
  const g = act || ADD_GROUPS.find(x => x.id === group)
  // The part of its muscle to favour that an exercise works (its name, for the row), if any.
  const gapOf = ex => (act ? null : partGaps[primaryMuscleOf(ex)?.slug] || null)
  const worked = (ex, gap = gapOf(ex)) => gap?.parts.filter(x => muscleRolesOf(ex.id)?.target?.some(m => x.muscles.includes(m))) || []
  const partOf = ex => worked(ex)[0]?.name || null
  // A swap with a part to keep lists only your own that work it: the rest are another part.
  const same = !act && Object.values(partGaps).some(x => x.swap)
  // How many of the parts it works, a row for a row (lats and mid-back) before a pulldown (lats);
  // in a swap, the same movement first among those.
  const fills = ex => closeness(!act && like, ex, worked(ex).length, same)
  const { yours, picks, all, hidden } = shortlist(S, group, { status, have, gaps, fills, same })
  const row = ex => {
    const last = lastTopSet(S, ex.id)
    const part = partOf(ex)
    return <div key={ex.id} className="item" {...tappable(() => onPick(ex))}>
      <Thumb ex={ex} />
      <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
        <div className="ss capitalize">{g.m?.length > 1 && !act ? t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) + ' · ' : ''}{act?.id === 'stretching' ? t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) : t(ex.eq)}{part && <b className="ax-fills"> · {t(part)}</b>}</div></div>
      <div className="ax-last">{last && act
        ? <span>{fmtDaysAgo(last.d)}</span>
        : last ? <><b>{last.w > 0 ? `${fmtNum(last.w)} ${S.unit} × ${last.r ?? '–'}` : `× ${last.r ?? '–'}`}</b><span>{fmtDaysAgo(last.d)}</span></>
        : <span className="ax-new">{t('New')}</span>}</div>
      {/* Same as the search picker's "+": adds at once with last time's (or the default) sets. */}
      <button className="iconbtn chev" aria-label={t('Add “{0}”', exerciseNameFor(ex))} style={{ padding: 8, margin: -8 }}
        onClick={ev => { ev.stopPropagation(); onPick(ex, true) }}><Icon name="plus" /></button>
    </div>
  }
  const back = () => (path ? setPath(path.length ? path.slice(0, -1) : null) : setGroup(null))
  const head = sub => <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
    <button className="iconbtn" aria-label={path ? t('Back') : t('Back to muscle groups')} onClick={back}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, minWidth: 0 }}>{title && <div className="muted small">{title}</div>}<h3>{t(g.n)}</h3>{sub && <div className="muted small">{sub}</div>}</div>
    <Button size="sm" variant="tinted" icon="magnifier" onClick={onSearch}>{t('Search')}</Button>
  </div>
  const inSession = hidden > 0 && <div className="small dim" style={{ margin: '10px 2px 0' }}>{routine ? t('Already in this routine: {0}', hidden) : t('Already in this workout: {0}', hidden)}</div>
  // The group's colour reaches its pictures and rows; display: contents leaves the layout alone.
  const wrap = body => <div className="mg" style={{ display: 'contents', ...mcStyle(groupColor(group)) }}>{body}</div>

  if (!path) {
    // The shortlist: what you do here, a couple worth adding, and the rest a few questions away.
    const shown = yours.length + picks.length
    return wrap(<>
      {head(act?.id === 'cardio' ? t('Start a stopwatch on the set, stop it when you are done') : act ? t('Each stretch is timed: start the stopwatch, stop it when you are done') : null)}
      {yours.length > 0 && <><h4 className="sec">{t('Yours')}</h4><div className="list">{yours.map(row)}</div></>}
      {picks.length > 0 && <><h4 className="sec">{yours.length ? (routine ? t('Worth adding') : t('Worth adding this week')) : t('Good places to start')}</h4><div className="list">{picks.map(row)}</div></>}
      {all.length === 0 && <div className="empty">{t('Nothing left here.')}</div>}
      {all.length > shown && <div className="list" style={{ marginTop: 16 }}>
        <div className="item" {...tappable(() => { setPath([]); setRows(STEP_ROWS) })}>
          <div className="grow"><div className="tt ax-else">{t('Something else')}</div></div>
          <span className="muted small">{t('{0} more', fmtNum(all.length - shown))}</span><Icon name="chevronRight" className="chev" />
        </div></div>}
      {inSession}
    </>)
  }

  // "Something else": a question at a time, until a short list is left (exercise-facets.js).
  const facets = groupFacets(group)
  const answers = Object.fromEntries(path.map(p => [p.facet, p.values]))
  const { list, step } = narrow(all, facets, answers, logged)
  const facet = step && facets.find(f => f.id === step.facet)
  const nameOf = (f, id) => (id === '*' ? t('Any') : t(f.name(id)))
  const pick = (f, o) => { setPath([...path, { facet: f.id, id: o.id, values: o.values }]); setRows(STEP_ROWS) }
  const QUESTION = { area: act?.id === 'cardio' ? t('Which kind?') : t('Which part?'), kit: t('What are you using?'), move: t('Which movement?'), angle: t('Which angle?') }
  const picture = (f, id) => f.id !== 'area' ? null : act
    ? <span className="ava ax-ico"><Icon name={act.areas.find(a => a.id === id)?.icon || act.icon} /></span>
    : <Ava slugs={[id]} body={body} />
  return wrap(<>
    {head(null)}
    <div className="ax-crumbs">
      <button className={'ax-crumb' + (path.length ? '' : ' on')} onClick={() => setPath([])}>{t('All {0}', fmtNum(all.length))}</button>
      {path.map((p, i) => { const f = facets.find(x => x.id === p.facet); return <button key={p.facet} className={'ax-crumb' + (i === path.length - 1 ? ' on' : '')} onClick={() => setPath(path.slice(0, i + 1))}>{nameOf(f, p.id)}</button> })}
    </div>
    {step
      ? <>
        <h4 className="ax-q">{QUESTION[facet.id]}</h4>
        <div className="ax-gts">
          {step.options.map(o => <button key={o.id} className="ax-gt" onClick={() => pick(facet, o)}>
            {picture(facet, o.id)}
            <span className="ax-m"><b>{nameOf(facet, o.id)}</b><span className="muted small">{fmtNum(o.count)}{o.done > 0 && ' · ' + t('{0} done', fmtNum(o.done))}</span></span>
          </button>)}
          <button className="ax-gt ax-any" onClick={() => pick(facet, { id: '*', values: '*' })}>
            <span className="ax-m"><b>{t('Any')}</b><span className="muted small">{t('Skip this question')}</span></span>
          </button>
        </div>
      </>
      : <>
        <div className="list">{list.slice(0, rows).map(row)}</div>
        {list.length > rows && <button className="ax-more" onClick={() => setRows(n => n + STEP_PAGE)}>{t('Show more')}</button>}
        <div style={{ height: 12 }} />
        <Button variant="ghost" icon="magnifier" onClick={onSearch}>{t('Search all exercises')}</Button>
      </>}
    {inSession}
  </>)
}
