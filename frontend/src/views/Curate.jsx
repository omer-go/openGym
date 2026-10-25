import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { ADD_GROUPS } from '../lib/add-exercise.js'
import { gymOf, gymRows, rowOn, flipRow, gymFit, saveGym, groupPool, pilesOf, progressOf, deckOf, decide, onList, listOf, toggleListed } from '../lib/curate.js'
import { activeProfile } from '../lib/equipment.js'
import { kitOf } from '../lib/exercise-facets.js'
import { isCustomEx } from '../lib/exercises.js'
import { roleChips } from '../lib/muscle-roles.js'
import { groupColor, mcStyle } from '../lib/muscle-colors.js'
import { fmtNum } from '../lib/format.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { exerciseDetailSheet } from '../sheets.jsx'
import { useMuscleRoles } from '../components/MuscleRoles.jsx'
import { Ava } from '../components/AddExerciseSheet.jsx'
import Media, { Thumb } from '../components/Media.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'

// Choose your exercises (Library): say what your gym has, then go through the catalogue one pile
// at a time — a muscle group, then the kit, as Add exercise asks — and swipe each lift: right
// keeps it (a star), left drops it (Not suggested), up passes for now. Your list starts as the
// popular lifts (lib/popular.js); one-tap workouts and program days pick from it. Your list shows
// it whole, a group at a time, to take a lift off or put one back without swiping. The piles,
// their order and what counts as on the list live in lib/curate.js.

const KIT_NAME = { barbell: 'Barbell', dumbbell: 'Dumbbell', kettlebell: 'Kettlebell', cable: 'Cable', machine: 'Machine', body: 'Body weight', band: 'Band', other: 'Other' }
const FLING = 90     // px a card travels before letting go of it decides it
const EDGE = 24      // px from the screen's side where a touch is the phone's back gesture

export default function Curate() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const body = S.body === 'female' ? 'female' : 'male'
  // Each step has its own path, so Back (the header's, the phone's or a swipe from the edge) goes
  // up one step, never out of the deck: /library/pick is the groups (Your gym on a first visit,
  // with no gym saved), /library/pick/gym Your gym, /library/pick/list Your list, /library/pick/<group> its kits and
  // /library/pick/<group>/<kit> the deck; ?all deals the rarer ones too.
  const { group: gp, kit } = useParams()
  const [search, setSearch] = useSearchParams()
  const gymStep = gp === 'gym' || (!gp && !activeProfile(S))
  const listStep = gp === 'list'
  const group = gymStep || listStep ? null : gp
  const step = gymStep ? 'gym' : listStep ? 'list' : !group ? 'groups' : !kit ? 'kits' : 'deck'
  const have = gymOf(S)

  const up = step === 'deck' ? `/library/pick/${group}` : step === 'kits' || gp === 'gym' || listStep ? '/library/pick' : '/library'
  // Back to where we came from when that is in the history, else (opened from a link) one step up.
  const back = () => ((window.history.state?.idx || 0) > 0 ? nav(-1) : nav(up, { replace: true }))
  const g = ADD_GROUPS.find(x => x.id === group)
  const head = (title, sub) => <div className="hdr"><button className="iconbtn" onClick={back} aria-label={t('Back')}><Icon name="chevronLeft" /></button>
    <div style={{ flex: 1, marginInlineStart: 12, minWidth: 0 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div></div>

  if (step === 'gym') return <>
    {head(t('Your gym'), t('Exercises for kit you don’t have won’t come up.'))}
    <GymStep S={S} have={have} onSave={h => { update(s => { saveGym(s, h, t('My gym')) }); if (gp === 'gym') back() }} />
  </>

  if (step === 'list') return <YourList S={S} update={update} have={have} head={head} onGroup={id => nav(`/library/pick/${id}`)} />

  if (step === 'groups') return <>
    {head(t('Choose your exercises'), t('Your list starts with the most popular lifts. One-tap workouts pick from it. Swipe to drop or add lifts.'))}
    <Groups S={S} have={have} body={body} onGym={() => nav('/library/pick/gym')} onList={() => nav('/library/pick/list')} onGroup={id => nav(`/library/pick/${id}`)} />
  </>

  if (!g) return null
  const pool = groupPool(S, group, have)
  if (step === 'kits') return <>
    {head(t(g.n), t('What are you using?'))}
    <div className="ax-gts">
      {pilesOf(S, pool).map(p => <button key={p.id} className="ax-gt" onClick={() => nav(`/library/pick/${group}/${p.id}` + (p.left === 0 ? '?all' : ''))}>
        <span className="ax-m"><b>{t(p.n)}</b><span className="muted small">{p.left > 0
          ? t('{0} to go', fmtNum(p.left))
          : p.rare > 0 ? t('{0} rarer ones', fmtNum(p.rare)) : t('All done')}{p.listed > 0 && ' · ' + t('{0} in your list', fmtNum(p.listed))}</span></span>
        {p.left === 0 && p.rare === 0 && <Icon name="checkCircle" className="cu-done" />}
      </button>)}
    </div>
  </>

  const list = pool.filter(ex => kitOf(ex) === kit)
  return <>
    {head(t(g.n) + ' · ' + t(KIT_NAME[kit] || 'Other'), null)}
    <Deck S={S} update={update} list={list} all={search.has('all')} onAll={() => setSearch({ all: '' }, { replace: true })} onDone={back} />
  </>
}

// The switches of Your gym, each with what it brings, and the rest of the equipment as chips.
function GymStep({ S, have, onSave }) {
  const [h, setH] = useState(() => (activeProfile(S) ? have : []))
  const rows = useMemo(() => gymRows(S), [S.customEx])
  const fit = gymFit(S, h)
  const main = rows.filter(r => !r.more), more = rows.filter(r => r.more)
  return <>
    <div className="ax-gts">
      {main.map(r => { const on = rowOn(h, r); return <button key={r.id} className={'ax-gt cu-kit' + (on ? ' on' : '')} aria-pressed={on} onClick={() => setH(flipRow(h, r))}>
        <span className="ax-m"><b>{t(r.n)}</b><span className="muted small">{t('{0} exercises', fmtNum(r.count))}</span></span>
        <Icon name={on ? 'checkCircle' : 'plusCircle'} className="cu-tick" />
      </button> })}
    </div>
    <h4 className="sec">{t('More equipment')}</h4>
    <div className="chips">
      {more.map(r => <button key={r.id} className={'chip' + (rowOn(h, r) ? ' on' : '')} onClick={() => setH(flipRow(h, r))}>{t(r.n)}</button>)}
    </div>
    <div className="dim small" style={{ marginTop: 10 }}>{t('Body-weight exercises are always available, unless they need a pull-up bar or a bench.')}</div>
    <div className="cu-foot">
      <span className="muted small">{t('{0} of {1} exercises fit', fmtNum(fit.fit), fmtNum(fit.total))}</span>
      <Button variant="primary" onClick={() => onSave(h)}>{t('Save')}</Button>
    </div>
  </>
}

// The muscle groups, each with how far along its common lifts are.
function Groups({ S, have, body, onGym, onList, onGroup }) {
  const prog = useMemo(() => Object.fromEntries(ADD_GROUPS.map(g => {
    const p = progressOf(S, groupPool(S, g.id, have))
    return [g.id, p]
  })), [S.favEx, S.skipEx, have, S.customEx])
  const profile = activeProfile(S)
  const tile = g => { const p = prog[g.id]; return <button key={g.id} className="ax-gt mg" style={mcStyle(groupColor(g.id))} onClick={() => onGroup(g.id)}>
    <Ava slugs={g.m} body={body} />
    <span className="ax-m"><b>{t(g.n)}</b><span className="muted small">{p.left > 0 ? t('{0} to go', fmtNum(p.left)) : t('All done')}
      {p.listed > 0 && ' · ' + t('{0} in your list', fmtNum(p.listed))}</span>
      <span className="cu-bar"><i style={{ width: Math.round(100 * (p.common - p.left) / Math.max(1, p.common)) + '%' }} /></span></span>
  </button> }
  const listed = ADD_GROUPS.reduce((n, g) => n + prog[g.id].listed, 0)
  return <>
    <button className="cu-entry" onClick={onList}>
      <Icon name="list" />
      <span className="ax-m"><b>{t('Your list')}</b><span className="muted small">{t('{0} lifts', fmtNum(listed))}</span></span>
      <Icon name="chevronRight" className="dim" />
    </button>
    <button className="cu-entry" onClick={onGym}>
      <Icon name="kettlebell" />
      <span className="ax-m"><b>{t('Your gym')}</b><span className="muted small">{profile ? profile.name : t('All equipment')}</span></span>
      <Icon name="chevronRight" className="dim" />
    </button>
    <h4 className="sec">{t('Upper body')}</h4>
    <div className="ax-gts">{ADD_GROUPS.filter(g => !g.low).map(tile)}</div>
    <h4 className="sec">{t('Lower body')}</h4>
    <div className="ax-gts">{ADD_GROUPS.filter(g => g.low).map(tile)}</div>
  </>
}

// Your list whole: each group's lifts in the order a pile deals them, each taken off or put
// back with one tap, a group's piles one tap away, and what you have dropped at the end.
function YourList({ S, update, have, head, onGroup }) {
  const groups = useMemo(() => listOf(S, have), [S.favEx, S.skipEx, S.customEx, have])
  const total = groups.reduce((n, g) => n + g.list.length, 0)
  const dropped = groups.flatMap(g => g.dropped)
  const toggle = ex => update(s => { toggleListed(s, ex) })
  const jump = id => document.getElementById('yl-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const row = (ex, on) => <div key={ex.id} className="item" {...tappable(() => exerciseDetailSheet(ex))}>
    <Thumb ex={ex} />
    <div className="grow"><div className={`tt ${exerciseNameClass(ex)}`}>{exerciseNameFor(ex)}</div>
      <div className="ss capitalize">{t(MUSCLE_NAME[ex.tg] || ex.tg || ex.bp)} · {t(ex.eq)}</div></div>
    <button className={'yl-tog' + (on ? ' on' : '')} aria-pressed={on} aria-label={on ? t('Take off your list') : t('Put back on your list')}
      onClick={e => { e.stopPropagation(); toggle(ex) }}><Icon name={on ? 'checkCircle' : 'plusCircle'} /></button>
  </div>
  return <>
    {head(t('Your list'), t('{0} lifts. One-tap workouts and program days pick from these. Tap the tick to take one off.', fmtNum(total)))}
    <div className="chips yl-jump">
      {groups.map(g => <button key={g.id} className="chip nocap" onClick={() => jump(g.id)}>{t(g.n)} <span className="dim">{fmtNum(g.list.length)}</span></button>)}
      {dropped.length > 0 && <button className="chip nocap" onClick={() => jump('dropped')}>{t('Dropped')} <span className="dim">{fmtNum(dropped.length)}</span></button>}
    </div>
    {groups.map(g => <section key={g.id} id={'yl-' + g.id} className="yl-sec" style={mcStyle(groupColor(g.id))}>
      <div className="yl-h"><h4 className="sec">{t(g.n)} <span className="dim">{fmtNum(g.list.length)}</span></h4>
        <Button size="sm" variant="tinted" icon="star" onClick={() => onGroup(g.id)}>{t('Swipe')}</Button></div>
      <div className="list">{g.list.length ? g.list.map(ex => row(ex, true)) : <div className="empty small">{t('Nothing on your list here yet.')}</div>}</div>
    </section>)}
    {dropped.length > 0 && <section id="yl-dropped" className="yl-sec">
      <div className="yl-h"><h4 className="sec">{t('Dropped')} <span className="dim">{fmtNum(dropped.length)}</span></h4></div>
      <div className="list">{dropped.map(ex => row(ex, false))}</div>
    </section>}
  </>
}

// One pile's cards. What you keep or drop is written at once (lib/curate.js decide); what you
// pass on is only left out until you leave the pile. Undo takes back the last card either way.
function Deck({ S, update, list, all, onAll, onDone }) {
  const [passed, setPassed] = useState([])
  const [done, setDone] = useState([])         // [{ id, verdict }], newest last
  const deck = deckOf(S, list, { all, passed })
  const p = progressOf(S, list)
  const ex = deck[0]
  const act = verdict => {
    if (!ex) return
    if (verdict === 'pass') setPassed(x => [...x, ex.id])
    else update(s => { decide(s, ex.id, verdict) })
    setDone(x => [...x, { id: ex.id, verdict }])
  }
  const undo = () => {
    const last = done[done.length - 1]
    if (!last) return
    if (last.verdict === 'pass') setPassed(x => x.filter(id => id !== last.id))
    else update(s => { decide(s, last.id, null) })
    setDone(x => x.slice(0, -1))
  }
  const kept = done.filter(d => d.verdict === 'keep').length, dropped = done.filter(d => d.verdict === 'drop').length

  if (!ex) {
    const rare = all ? 0 : p.rare
    return <div className="card cu-end">
      <Icon name="checkCircle" className="cu-end-ico" />
      <h3>{passed.length ? t('Pile gone through') : t('Pile done')}</h3>
      <div className="muted">{t('{0} kept · {1} dropped', fmtNum(kept), fmtNum(dropped))}{passed.length > 0 && ' · ' + t('{0} for later', fmtNum(passed.length))}</div>
      <div className="cu-end-btns">
        {rare > 0 && <Button variant="tinted" onClick={onAll}>{t('Show {0} rarer ones', fmtNum(rare))}</Button>}
        {passed.length > 0 && <Button variant="tinted" onClick={() => setPassed([])}>{t('Go over the passed ones')}</Button>}
        <Button variant="primary" onClick={onDone}>{t('Next pile')}</Button>
        {done.length > 0 && <Button variant="plain" icon="undo" onClick={undo}>{t('Undo')}</Button>}
      </div>
    </div>
  }
  return <>
    <div className="cu-count muted small">{t('{0} to go', fmtNum(deck.length))}{!all && p.rare > 0 && ' · ' + t('popular lifts first')}</div>
    <Card key={ex.id} ex={ex} onVerdict={act} />
    <div className="cu-btns">
      <button className="cu-b" onClick={undo} disabled={!done.length} aria-label={t('Undo')}><Icon name="undo" /></button>
      <button className="cu-b lg drop" onClick={() => act('drop')} aria-label={t('Not for me')}><Icon name="xmark" /></button>
      <button className="cu-b lg keep" onClick={() => act('keep')} aria-label={t('Keep')}><Icon name="star" /></button>
      <button className="cu-b" onClick={() => act('pass')} aria-label={t('Skip for now')}><Icon name="arrowUp" /></button>
    </div>
    <div className="cu-hint dim small">{t('Swipe right to keep, left if it’s not for you, up to skip for now.')}</div>
  </>
}

// A card: the animation, the name, the kit and the muscles it works. Dragged past FLING it
// decides itself; let go short of that, it springs back.
function Card({ ex, onVerdict }) {
  const roles = roleChips(useMuscleRoles(ex.id))
  const [d, setD] = useState(null)
  const from = useRef(null)
  const down = e => {
    // A touch at the screen's edge is the phone's back gesture, not a swipe of the card.
    if (e.pointerType === 'touch' && (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE)) return
    from.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const move = e => { if (from.current) setD({ x: e.clientX - from.current.x, y: e.clientY - from.current.y }) }
  const up = () => {
    if (!from.current) return
    from.current = null
    const { x = 0, y = 0 } = d || {}
    setD(null)
    if (x > FLING) onVerdict('keep')
    else if (x < -FLING) onVerdict('drop')
    else if (y < -FLING && Math.abs(x) < FLING) onVerdict('pass')
  }
  // The browser took the touch over (a scroll, a gesture): spring back, decide nothing.
  const cancel = () => { from.current = null; setD(null) }
  const x = d?.x || 0, y = d?.y || 0
  const say = x > 40 ? 'keep' : x < -40 ? 'drop' : y < -40 ? 'pass' : null
  return <div className={'card cu-card' + (d ? ' drag' : '')} style={{ transform: d ? `translate(${x}px, ${Math.min(y, 0)}px) rotate(${x / 20}deg)` : undefined }}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}>
    {say && <span className={'cu-say ' + say}>{say === 'keep' ? t('Keep') : say === 'drop' ? t('Not for me') : t('Skip for now')}</span>}
    <div className="cu-media"><Media ex={ex} /></div>
    <div className={'cu-name ' + exerciseNameClass(ex)}>{exerciseNameFor(ex)}</div>
    <div className="cu-tags">
      {isCustomEx(ex) ? null : onList(ex) ? <span className="tag acc">{t('Popular')}</span> : <span className="tag">{t('Variation')}</span>}
      <span className="tag nocap">{t(ex.eq)}</span>
    </div>
    {roles && <div className="cu-roles small">
      <span><b>{t('Targets')}</b> {roles.targets.map(m => t(m)).join(', ')}</span>
      {roles.helpers.length > 0 && <span className="muted"><b>{t('Helped by')}</b> {roles.helpers.map(m => t(m)).join(', ')}</span>}
    </div>}
  </div>
}
