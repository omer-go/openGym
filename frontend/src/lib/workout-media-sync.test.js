// The photos and videos already saved on a logged workout. Nothing adds new ones any more, but the
// record keeps them: what the sync merge keeps of the list, what the history editor does with it,
// and the places that must never carry it (copy as text, a routine saved from the workout, a plan
// file).
import { describe, expect, it } from 'vitest'
import { workoutMediaOf, referencedHashes, referencedFiles, stateMediaRefs } from './media-refs.js'
import { mergeStates, stampWorkout } from './sync-merge.js'
import { editCompletedSession, saveWorkoutEdit } from './session-edit.js'
import { workoutText } from './workout-text.js'
import { saveSessionAsRoutine } from './session-routines.js'
import { buildPlanBundle } from './plan-share.js'

const H = n => String(n).repeat(64).slice(0, 64)
const photo = (h, poster) => ({ kind: 'image', hash: h, mime: 'image/webp', size: 1000, width: 800, height: 600, ...(poster ? { poster: { hash: poster, mime: 'image/webp', size: 100, width: 480, height: 360 } } : {}), at: 1 })
const clip = (h, poster) => ({ kind: 'video', hash: h, mime: 'video/mp4', size: 500000, width: 1280, height: 720, dur: 8, codec: 'avc1', ...(poster ? { poster: { hash: poster, mime: 'image/webp', size: 100, width: 480, height: 270 } } : {}), at: 2 })
const set = (w, r) => ({ w, r, done: true })
const workout = over => ({ id: 'w1', d: '2026-09-20', start: 1000, end: 4000, name: 'Push', routineIds: [], routineId: null, entries: [{ id: 'bench', sets: [set(60, 5)], topW: 60, target: null }], prs: [], vol: 300, ...over })
const state = (...ws) => ({ unit: 'kg', workouts: ws, routines: [], customEx: [], exWeights: {}, bodyweight: [], active: null })

// An edit of the list as another device (or an older version) makes it: the saved record changed
// and stamped, the way any edit of a saved workout is.
const addMedia = (S, ref, now) => { const w = S.workouts[0]; w.media = [...(w.media || []), ref]; stampWorkout(w, now) }
const removeMedia = (S, hash, now) => {
  const w = S.workouts[0]
  const left = (w.media || []).filter(m => m.hash !== hash)
  if (left.length) w.media = left
  else delete w.media
  stampWorkout(w, now)
}

describe('workoutMediaOf / the state walk', () => {
  it('shows only valid refs, each file once, at most six', () => {
    const w = workout({ media: [photo(H(1)), 'x', null, { hash: 'bad' }, photo(H(1)), ...[2, 3, 4, 5, 6, 7, 8].map(n => photo(H(n)))] })
    expect(workoutMediaOf(w).map(m => m.hash)).toEqual([1, 2, 3, 4, 5, 6].map(H))
    expect(workoutMediaOf(workout({ media: photo(H(1)) }))).toEqual([])
    expect(workoutMediaOf(null)).toEqual([])
  })

  it('referencedFiles lists a workout\'s posters first, with what a download is checked against', () => {
    const S = state(workout({ media: [clip(H(1), H(2)), photo(H(3))] }))
    expect(referencedFiles(S)).toEqual([
      { hash: H(2), mime: 'image/webp', size: 100, poster: true },
      { hash: H(1), mime: 'video/mp4', size: 500000, poster: false },
      { hash: H(3), mime: 'image/webp', size: 1000, poster: false },
    ])
  })

  it('the session in progress is not walked (media only live on saved workouts)', () => {
    expect(stateMediaRefs({ active: { media: [photo(H(1))] } })).toEqual([])
  })
})

describe('the sync keeps a media edit', () => {
  it('a photo added on the phone survives the desktop copy that is newer as a whole', () => {
    const base = state(workout({ _ts: 10 }))
    const phone = structuredClone(base)
    addMedia(phone, photo(H(1)), 200)
    phone._ts = 200
    const desktop = structuredClone(base)
    desktop.bodyweight = [{ d: '2026-09-21', w: 80, t: 300 }]
    desktop._ts = 300
    for (const merged of [mergeStates(desktop, phone), mergeStates(phone, desktop)]) {
      expect(merged.workouts[0].media.map(m => m.hash)).toEqual([H(1)])
      expect(merged.bodyweight).toHaveLength(1)
    }
  })

  it('a photo added on one device survives the other device\'s later note edit of the same workout', () => {
    const base = state(workout({ _ts: 10 }))
    const phone = structuredClone(base)
    addMedia(phone, photo(H(1)), 200)
    phone._ts = 200
    const desktop = structuredClone(base)
    desktop.workouts[0].note = 'Felt strong'
    desktop.workouts[0]._ts = 300   // stampWorkout: the note edit is the later edit of this workout
    desktop._ts = 300
    for (const merged of [mergeStates(desktop, phone), mergeStates(phone, desktop)]) {
      expect(merged.workouts[0].note).toBe('Felt strong')
      expect(merged.workouts[0].media.map(m => m.hash)).toEqual([H(1)])
      expect(merged.workouts[0]._ts).toBe(300)
    }
  })

  it('a photo on each device: both are kept, the later-edited copy\'s first', () => {
    const base = state(workout({ _ts: 10, media: [photo(H(1))] }))
    const phone = structuredClone(base)
    addMedia(phone, photo(H(2)), 200)
    phone._ts = 200
    const desktop = structuredClone(base)
    addMedia(desktop, clip(H(3), H(4)), 300)
    desktop._ts = 300
    for (const merged of [mergeStates(desktop, phone), mergeStates(phone, desktop)]) {
      expect(merged.workouts[0].media.map(m => m.hash)).toEqual([H(1), H(3), H(2)])
      expect(merged.workouts[0].media[1]).toEqual(clip(H(3), H(4)))
    }
  })

  it('signing in (prefer) keeps the preferred version but not at the cost of the other\'s photo', () => {
    const base = state(workout({ _ts: 10 }))
    const device = structuredClone(base)
    addMedia(device, photo(H(1)), 200)
    const server = structuredClone(base)
    server.workouts[0].note = 'server'
    const merged = mergeStates(server, device, { prefer: 'a' })
    expect(merged.workouts[0].note).toBe('server')
    expect(merged.workouts[0].media.map(m => m.hash)).toEqual([H(1)])
  })

  it('a removal inside the conflict window comes back from the copy that still lists it (resurrected beats lost); one already pulled sticks', () => {
    const base = state(workout({ _ts: 10, media: [photo(H(1)), photo(H(2))] }))
    const a = structuredClone(base)
    removeMedia(a, H(1), 200)
    a._ts = 200
    const b = structuredClone(base)
    b._ts = 400
    expect(mergeStates(b, a).workouts[0].media.map(m => m.hash)).toEqual([H(2), H(1)])
    // Once the other device has the removal, neither copy lists it and it stays gone.
    const pulled = structuredClone(a)
    pulled.bodyweight = [{ d: '2026-09-21', w: 80, t: 500 }]
    pulled._ts = 500
    expect(mergeStates(pulled, a).workouts[0].media.map(m => m.hash)).toEqual([H(2)])
  })

  it('a media edit does not count as an edit of the sets (the kept loads are left alone)', () => {
    const base = state(workout({ _ts: 10 }))
    base.exWeights = { bench: { w: 60, d: '2026-09-20' } }
    const a = structuredClone(base)
    addMedia(a, photo(H(1)), 200)
    const b = structuredClone(base)
    b.exWeights = { bench: { w: 65, d: '2026-09-22' } }
    b._ts = 300
    expect(mergeStates(b, a).exWeights.bench.w).toBe(65)
  })
})

describe('the history editor (#203) leaves a workout\'s media on the record', () => {
  it('the editor\'s copy carries none, and Save keeps the record\'s', () => {
    const S = state(workout({ media: [photo(H(1))] }))
    editCompletedSession(S, 'w1')
    expect(S.active.media).toBeUndefined()
    S.active.entries[0].sets[0].r = 6
    const saved = saveWorkoutEdit(S, 500)
    expect(saved.media.map(m => m.hash)).toEqual([H(1)])
    expect(referencedHashes(S)).toEqual(new Set([H(1)]))
  })

  it('a photo removed on another device while the editor was open stays removed', () => {
    const S = state(workout({ media: [photo(H(1)), photo(H(2))] }))
    editCompletedSession(S, 'w1')
    removeMedia(S, H(1), 400)
    S.active.entries[0].sets[0].r = 6
    const saved = saveWorkoutEdit(S, 500)
    expect(saved.media.map(m => m.hash)).toEqual([H(2)])
  })
})

describe('workout media never leave through the side doors', () => {
  const S = state(workout({ media: [clip(H(1), H(2))] }))
  const leaks = v => { const s = JSON.stringify(v); return [H(1), H(2)].some(h => s.includes(h)) || /"media"/.test(s) }

  it('Copy as text', () => {
    const txt = workoutText(S.workouts[0], { unit: 'kg', nameOf: e => e.id })
    expect(txt).not.toContain(H(1))
    expect(txt).not.toMatch(/video|photo/i)
  })

  it('a routine saved from the workout, and a plan file built from it', () => {
    const st = structuredClone(S)
    const id = saveSessionAsRoutine(st, st.workouts[0], 'From workout')
    expect(leaks(st.routines.find(r => r.id === id))).toBe(false)
    expect(leaks(buildPlanBundle(st, 'Mine'))).toBe(false)
  })
})
