import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { ADD_GROUPS, avatarOf, groupOfMuscle, muscleStatus, suggestedGroups, groupExercises, lastTopSet } from '../lib/add-exercise.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { EXIDX } from '../lib/exercises.js'
import { primaryMuscleOf } from '../lib/strength-exercises.js'
import { fmtNum, fmtDaysAgo } from '../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import BodyMap, { MuscleAvatar } from './BodyMap.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import { Button, Segmented } from './ui.jsx'

// The workout's Add exercise: pick a muscle group (what you have not trained this week is marked
// Suggested), then an exercise from it, its areas in the order you most need them. The full search
// picker — every exercise, filters, Create your own — stays one tap away (`onSearch`).
// Grouping and ranking live in lib/add-exercise.js.
// A swap opens it with a `title` and `like`, the exercise being replaced: it then starts on that
// exercise's group and area, Back still leading to every group.

const PER_AREA = 5       // rows an area shows before its "Show all"
const PAGE = 40          // rows a single list shows before "Show more"

const Dot = ({ st }) => <i className={'ax-dot' + (st ? ' ' + st : '')} />
const Ava = ({ slugs, body, className }) => {
  const a = avatarOf(slugs, body)
  return <MuscleAvatar body={body} view={a.view} on={a.on} vb={a.vb} className={className} />
}

function areaLine({ st, last }) {
  if (st === 'td') return t('In this workout')
  if (st === 'wk') return t('Trained {0}', fmtDaysAgo(last))
  return last ? t('Not this week · last {0}', fmtDaysAgo(last)) : t('Not trained yet')
}

const Legend = () => <div className="ax-legend">
  <span><Dot st="td" />{t('Today')}</span><span><Dot st="wk" />{t('This week')}</span><span><Dot />{t('Not yet')}</span>
</div>

// Where a swap away from `id` starts: its primary muscle's group, narrowed to that muscle when
// the group has more than one.
function startOf(id) {
  const g = id && groupOfMuscle(primaryMuscleOf(EXIDX[id])?.slug)
  if (!g) return { group: null, area: '' }
  return { group: g.id, area: g.m.length > 1 ? primaryMuscleOf(EXIDX[id]).slug : '' }
}

export default function AddExerciseSheet({ onPick, onSearch, title, like }) {
  const S = useStore(s => s.S)
  const body = S.body === 'female' ? 'female' : 'male'
  const [start] = useState(() => startOf(like))
  const [group, setGroup] = useState(start.group)
  const [view, setView] = useState('grid')       // 'grid' | 'map'
  const [area, setArea] = useState(start.area)
  const [sort, setSort] = useState('suggested')  // 'suggested' | 'recent' | 'az'
  const [more, setMore] = useState({})           // area -> rows shown, past the default
  const status = useMemo(() => muscleStatus(S), [S.workouts, S.active, S.weekStart])
  const suggested = useMemo(() => suggestedGroups(status), [status])
  const openGroup = (id, slug = '') => { setGroup(id); setArea(slug); setMore({}) }

  if (!group) {
    const tile = g => <button key={g.id} className="ax-gt" onClick={() => openGroup(g.id)}>
      <Ava slugs={g.m} body={body} />
      <span className="ax-m"><b>{t(g.n)}</b><span className="ax-st">
        <span className="ax-dots">{g.m.map(m => <Dot key={m} st={status[m].st} />)}</span>
        {suggested.includes(g.id) && <span className="ax-badge">{t('Suggested')}</span>}
      </span></span>
    </button>
    // The map shades this week the way the dots do: in the workout strongest, trained this week lighter.
    const load = Object.fromEntries(Object.entries(status).map(([m, s]) => [m, s.st === 'td' ? 2 : s.st === 'wk' ? 1 : 0]))
    return <>
      <div className="row between" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
        <div><h3>{title || t('Add exercise')}</h3><div className="muted small">{t('Suggested means not trained this week')}</div></div>
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
      <Legend />
    </>
  }

  const g = ADD_GROUPS.find(x => x.id === group)
  const { sections, hidden } = groupExercises(S, group, { sort, area, status })
  const single = !!area || sort === 'recent'
  const row = ex => {
    const last = lastTopSet(S, ex.id)
    return <div key={ex.id} className="item" {...tappable(() => onPick(ex))}>
      <Thumb ex={ex} />
      <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
        <div className="ss capitalize">{sort === 'recent' && g.m.length > 1 ? t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp) + ' · ' : ''}{t(ex.eq)}</div></div>
      <div className="ax-last">{last
        ? <><b>{last.w > 0 ? `${fmtNum(last.w)} ${S.unit} × ${last.r ?? '–'}` : `× ${last.r ?? '–'}`}</b><span>{fmtDaysAgo(last.d)}</span></>
        : <span className="ax-new">{t('New')}</span>}</div>
      {/* Same as the search picker's "+": adds at once with last time's (or the default) sets. */}
      <button className="iconbtn chev" aria-label={t('Add “{0}”', exerciseNameFor(ex))} style={{ padding: 8, margin: -8 }}
        onClick={ev => { ev.stopPropagation(); onPick(ex, true) }}><Icon name="plus" /></button>
    </div>
  }
  const list = (key, xs) => {
    const n = more[key] || (single ? PAGE : PER_AREA)
    return <>
      <div className="list">{xs.slice(0, n).map(row)}</div>
      {xs.length > n && <button className="ax-more" onClick={() => setMore(m => ({ ...m, [key]: n + PAGE }))}>
        {single ? t('Show more') : t('Show all {0}', fmtNum(xs.length))}</button>}
    </>
  }
  return <>
    <div className="row" style={{ gap: 8, alignItems: 'flex-start', marginBottom: 12 }}>
      <button className="iconbtn" aria-label={t('Back to muscle groups')} onClick={() => setGroup(null)}><Icon name="chevronLeft" /></button>
      <div className="grow">{title && <div className="muted small">{title}</div>}<h3>{t(g.n)}</h3>{g.m.length > 1 && <div className="muted small">{t('Tap an area to see only its exercises')}</div>}</div>
    </div>
    {g.m.length > 1 && <div className="ax-subs" role="group">
      {['', ...g.m].map(m => <button key={m || 'all'} className={'ax-sub' + (area === m ? ' on' : '')} aria-pressed={area === m}
        onClick={() => { setArea(m); setMore({}) }}>
        <span className="ax-aw"><Ava slugs={m ? [m] : g.m} body={body} className="lg" />{m && <Dot st={status[m].st} />}</span>
        <span className="ax-sl">{m ? t(MUSCLE_NAME[m]) : t('All')}</span>
      </button>)}
    </div>}
    <Segmented options={[{ value: 'suggested', label: t('Suggested') }, { value: 'recent', label: t('Recent') }, { value: 'az', label: t('A to Z') }]}
      value={sort} onChange={v => { setSort(v); setMore({}) }} />
    {sections.length === 0 && <div className="empty">{sort === 'recent' ? t('Nothing logged here yet. Try Suggested or A to Z.') : t('Nothing left here.')}</div>}
    {sections.map((x, k) => x.m
      ? <div key={x.m} className="ax-area">
        <div className="ax-ahd"><Ava slugs={[x.m]} body={body} className="xs" />
          <span className="grow"><b>{t(MUSCLE_NAME[x.m])}</b><small>{areaLine(x)}</small></span>
          {sort === 'suggested' && k === 0 && !x.st && <span className="ax-badge">{t('Do next')}</span>}
        </div>
        {list(x.m, x.list)}
      </div>
      : <div key="recent" className="ax-area">{list('recent', x.list)}</div>)}
    {hidden > 0 && <div className="small dim" style={{ margin: '10px 2px 0' }}>{t('Already in this workout: {0}', hidden)}</div>}
    <div style={{ height: 12 }} />
    <Button variant="ghost" icon="magnifier" onClick={onSearch}>{t('Search all exercises')}</Button>
  </>
}
