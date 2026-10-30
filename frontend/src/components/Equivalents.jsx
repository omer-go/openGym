import { useMemo, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import { equivalentsOf, TIERS } from '../lib/equivalents.js'
import { kitOf, KIT_FACET } from '../lib/exercise-facets.js'
import { rolesLoaded } from '../lib/muscle-roles.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { useMuscleRoles } from './MuscleRoles.jsx'
import { Segmented } from './ui.jsx'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'

// A tier shows this many until Show more.
const FIRST = 4
// The kit, as a gym-goer names it: a Smith machine is not the chest-press machine.
export const kitName = ex => (ex.eq === 'smith machine' ? t('Smith') : t(KIT_FACET.name(kitOf(ex))))

/**
 * An exercise's equivalents (lib/equivalents.js), on its card: in your list or in the whole
 * catalogue, by tier. The same lift on other kit is a row of chips; the rest are rows. Tapping one
 * opens it (`onOpen`).
 */
export default function Equivalents({ ex, onOpen }) {
  useMuscleRoles()
  const S = useStore(s => s.S)
  const [scope, setScope] = useState('mine')
  const [more, setMore] = useState({})
  const roles = rolesLoaded()
  const lists = useMemo(() => ({ mine: equivalentsOf(S, ex.id), all: equivalentsOf(S, ex.id, { scope: 'all' }) }), [S, ex.id, roles])
  if (!lists.all.length) return null
  const list = lists[scope]
  return <>
    <div className="row between eqv-h">
      <h4 className="sec">{t('Equivalents')}</h4>
      <Segmented className="eqv-scope" value={scope} onChange={setScope} options={[
        { value: 'mine', label: t('Your list {0}', lists.mine.length) },
        { value: 'all', label: t('All {0}', lists.all.length) },
      ]} />
    </div>
    {!list.length && <div className="muted small">{t('None on your list. All shows the catalogue.')}</div>}
    {TIERS.map(tier => {
      const rows = list.filter(x => x.tier === tier.id)
      if (!rows.length) return null
      if (tier.id === 'lift') return <div key={tier.id} className="eqv-tier" data-tier={tier.id}>
        <div className="eqv-k">{t(tier.n)}</div>
        <div className="eqv-kits">{rows.map(({ ex: e }) => <button key={e.id} type="button" className="tag pill" title={exerciseNameFor(e)} onClick={() => onOpen(e)}>{kitName(e)}</button>)}</div>
      </div>
      const open = more[tier.id], shown = open ? rows : rows.slice(0, FIRST)
      return <div key={tier.id} className="eqv-tier" data-tier={tier.id}>
        <div className="eqv-k">{t(tier.n)}</div>
        <div className="list">{shown.map(({ ex: e }) => <div key={e.id} className="item" role="button" {...tappable(() => onOpen(e))}>
          <Thumb ex={e} />
          <div className="grow"><div className={`tt ${exerciseNameClass(e)}`}>{exerciseNameFor(e)}</div></div>
          <span className="tag">{kitName(e)}</span>
        </div>)}</div>
        {rows.length > FIRST && <button type="button" className="mroles-more" aria-expanded={!!open} onClick={() => setMore(m => ({ ...m, [tier.id]: !open }))}>
          {open ? t('Show fewer') : t('Show {0} more', rows.length - FIRST)} <Icon name="chevronRight" />
        </button>}
      </div>
    })}
  </>
}
