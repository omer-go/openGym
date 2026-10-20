import { useMemo } from 'react'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtDaysAgo, todayISO } from '../lib/format.js'
import { MUSCLE_NAME } from '../lib/muscles.js'
import { generateWorkout, GEN_NAME } from '../lib/generate.js'
import { glyphOf } from '../lib/glyphs.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { startGenerated } from '../sheets.jsx'
import { useMuscleRoles } from './MuscleRoles.jsx'
import { rolesLoaded } from '../lib/muscle-roles.js'
import Icon from './Icon.jsx'

const TILES = [
  { type: 'full', glyph: 'figureStrength', what: 'Every major muscle' },
  { type: 'push', glyph: 'barbell', what: 'Chest, shoulders, triceps' },
  { type: 'pull', glyph: 'pullup', what: 'Back, traps, biceps' },
  { type: 'legs', glyph: 'legs', what: 'Quads, hamstrings, glutes, calves' },
]

// How long a muscle has waited ("last trained 3 days ago").
export const genSince = (last, today = todayISO()) =>
  last ? t('last trained {0}', fmtDaysAgo(last, today)) : t('not trained yet')

// What the first exercise is there for: the muscle the session opens on, and how long it has waited.
export const genReason = (muscle, last, today = todayISO()) => t(MUSCLE_NAME[muscle]) + ' · ' + genSince(last, today)

// One-tap workouts (lib/generate.js): four tiles, each a session built from the muscles you have
// trained least lately. Each tile says which muscle it would open on, so the choice is informed,
// and opens the setup sheet (sheets.jsx GenSetup) before the workout starts.
export default function GenerateCard() {
  const S = useStore(s => s.S)
  useMuscleRoles()  // the picks rotate a muscle's parts by them (coverage.js)
  const firsts = useMemo(() => Object.fromEntries(TILES.map(({ type }) => [type, generateWorkout(S, type, S.genSetup?.[type])[0] || null])),
    // The picks only move with what was logged, the equipment in use, the exercises there are and
    // the setup each tile last started with, and the muscle roles once they are in.
    [S.workouts, S.equipFilterOn, S.activeEquipId, S.equipProfiles, S.customEx, S.genSetup, rolesLoaded()])
  return <div className="card">
    <h2 style={{ marginBottom: 2 }}>{t('One-tap workout')}</h2>
    <div className="muted small" style={{ marginBottom: 10 }}>{t('Built from the muscles you have trained least lately.')}</div>
    <div className="gen-grid">
      {TILES.map(({ type, glyph, what }) => {
        const first = firsts[type]
        return <div key={type} className="gen-tile" role="button" aria-label={t(GEN_NAME[type])} {...tappable(() => startGenerated(type))}>
          <div className="row" style={{ gap: 8 }}>
            <span className="lrow-i" style={{ width: 30, height: 30, borderRadius: 8, fontSize: 17 }}><Icon name={glyphOf(glyph)} /></span>
            <div className="tt">{t(GEN_NAME[type])}</div>
          </div>
          <div className="ss">{t(what)}</div>
          {first && <div className="gen-first">{t('Starts with {0}', genReason(first.muscle, first.last))}</div>}
        </div>
      })}
    </div>
  </div>
}
