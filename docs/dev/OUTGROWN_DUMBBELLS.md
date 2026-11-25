# Outgrown dumbbells

When the heaviest dumbbell you own is lighter than what a lift needs, a one-tap day or a program
stops picking that lift and gives its place to kit that can still be loaded. A 75 lb pair is a
fine deadlift for someone pulling 185 on the bar and a warm-up for someone pulling 365.

The code is `frontend/src/lib/outgrown.js`, with its tests beside it. This note is the rules and
the arithmetic, so they can be checked without reading the code.

## When the rule runs

- Only with a **dumbbell inventory** (Settings → Equipment → Dumbbells). The heaviest bell in it is the
  **cap**. No inventory, no rule: nothing says how heavy your dumbbells go.
- Only for a **dumbbell** lift logged by weight × reps. A kettlebell, a bodyweight lift with a
  bell added, a hold and a stretch are left alone.
- Only where the planner chooses: one-tap days (`generate.js`) and the program builder
  (`program.js planExclude`). Your routines, the exercise library and the swap list are never
  filtered: a lift you pick yourself is yours.
- An outgrown lift is passed to the planner as an exclusion, the same way a skipped exercise is.
  The planner already keeps an excluded lift when nothing else fits its slot, so a dumbbell-only
  gym still gets its dumbbell deadlift.

## What "outgrown" means

A planned lift has a rep range, and climbs by double progression: once every set reaches the top
of the range, it takes more weight. A dumbbell lift is outgrown when that next weight does not
exist: **you can do the heaviest bell for the top of the range.**

The top of the range `hi` is the lift's own, by its kind and your goal (`engine.js SCHEMES`):

| Goal | Compound | One muscle | Calves, forearms, abs |
|---|---|---|---|
| Strength | 5 | 12 | 15 |
| Muscle | 12 | 15 | 20 |
| Maintain | 12 | 15 | 20 |
| Endurance | 20 | 25 | 30 |

Everything is compared as a **one-rep max per bell**, with your 1RM formula (Epley unless you
chose another). `ratio(r)` is what the formula makes of 100 for `r` reps, over 100: Epley's is
`1 + r / 30`. Past the formula's rep cap Epley's line carries on.

```
need(r) = cap × ratio(r)        the one-rep max that does the heaviest bell for r reps
```

Cap 75 lb, a compound lift under the Muscle goal (`hi` = 12): `need(12) = 75 × 1.4 = 105`.

## Rule 1: your own logs

```
own = the lift's best one-rep max per bell over its last 5 sessions, none older than 12 weeks
outgrown when  own ≥ need(hi)
```

You did the heaviest bell for the top of the range, or its equal at fewer reps.

- 75 × 12 → own 105 ≥ 105: outgrown.
- 70 × 12 → own 98 < 105: not by this rule. One more bell to go.

A weight logged as "both bells together" is halved first (`dumbbells.js`).

## Rule 2: a sibling lift

Most outgrown lifts are never taken to the cap: nobody grinds a 75 lb dumbbell deadlift to prove
a point when the bar is there. So the lift is also read off the **closest lift you do log**.

### Which lifts are siblings

Each exercise is described by three things from the catalogue:

- its **movement** (`exercise-facets.js moveOf`): hinge, squat, lunge, press, overhead press,
  row, curl, shrug…, and for a press its bench **angle**;
- its **target muscle** (the catalogue's `tg`: glutes, hamstrings, quads, pectorals…);
- the **muscles it works** and how hard (`muscles.js musclesOf`: 1 for a prime mover, 0.4 for a
  helper), of which the first is its **main muscle** (`coverage.js slotMuscleOf`).

A logged lift is a sibling of the dumbbell lift at one of three reaches, closest first. The
carry-over is `infer-weight.js REACH`, the same numbers a first weight is guessed with:

| Reach | Sibling | Carries over | Example for the dumbbell lift |
|---|---|---|---|
| 0 | The same lift on other kit: one group of the popular list, or the same name without its kit words | 0.90 | dumbbell deadlift ← barbell deadlift; dumbbell sumo squat ← barbell sumo squat |
| 1 | The same movement and angle, the same target muscle | 0.75 | dumbbell sumo deadlift ← barbell deadlift (hinge, glutes); dumbbell RDL ← barbell stiff-legged deadlift (hinge, hamstrings) |
| 2 | The same movement, and the dumbbell lift's main muscle is a prime mover of the sibling | 0.65 | dumbbell RDL ← barbell deadlift (hinge; glutes and hamstrings both at 1); dumbbell sumo squat ← barbell squat (squat; glutes at 1) |

Reach 2 runs one way. A barbell squat is evidence for a dumbbell sumo squat, since the squat
works the glutes as a prime mover. A barbell sumo squat is no evidence for a dumbbell squat: the
catalogue has the quads as a helper there.

The closest reach wins; inside one reach, the sibling that predicts the most.

### What is never a sibling, either way

- A **one-sided** lift (single-leg deadlift, Bulgarian split squat, one-arm row). Balance limits
  it, not load, so a two-legged lift says little about it. It is judged by rule 1 only.
- A **machine or a cable stack**. Their numbers are their own scale (`infer-weight.js`).
- A lift that is **not plain strength work**: a swing, a jump, a thruster, an overhead squat, a
  hold, a sideways lift (a Cossack or side squat), a combination ("RDL and bent-over row", "squat to overhead press"), an odd variant
  (`exercise-facets.js isTail`). A 400 lb deadlift does not make a dumbbell swing too light.
- A sibling **not trained in the last 12 weeks**.

### The calculation

```
top   = the sibling's best one-rep max over its last 5 sessions
bar   = top ÷ kit(sibling)              what that is on a barbell
pred  = bar × 0.40 × REACH[reach]       per bell, on the dumbbell lift
outgrown when  pred ≥ 1.15 × need(hi + 2)
```

- `kit` is what each kit lets you lift against a barbell (`infer-weight.js KIT`): barbell 1,
  trap bar and Smith machine 1.1, two dumbbells 0.40 of the bar each, two kettlebells 0.35 each.
- `hi + 2`: the top of the range with two reps in the tank, which is how the planner loads a
  lift. Rule 1 has no such allowance because those reps were done.
- `1.15` is the **margin**: a prediction is not a log, so it has to clear the cap by 15 % before
  it takes a lift away.

### The veto: your own logs show room

```
kept when  own exists and own < 0.85 × need(hi)
```

If you do log the dumbbell lift and are well under the cap on it, the sibling is overruled. Your
grip or your back may limit this lift in a way the barbell one does not show.

## Worked examples

Cap 75 lb, Muscle goal, Epley. Compound lifts: `need(12) = 105`, `need(14) = 110`, and a sibling
must predict `1.15 × 110 = 126.5`.

| You log | One-rep max | Dumbbell lift | Reach | pred per bell | Verdict |
|---|---|---|---|---|---|
| Barbell deadlift 315 × 5 | 367.5 | Deadlift | 0 | 367.5 × 0.4 × 0.90 = 132.3 | Outgrown |
| | | Sumo deadlift | 1 | × 0.75 = 110.3 | Kept |
| | | Romanian deadlift | 2 | × 0.65 = 95.6 | Kept |
| Barbell deadlift 405 × 5 | 472.5 | Deadlift | 0 | 170.1 | Outgrown |
| | | Sumo deadlift | 1 | 141.8 | Outgrown |
| | | Romanian deadlift | 2 | 122.9 | Kept, just |
| | | Single-leg deadlift | none | one-sided | Kept |
| | | Swing | none | not plain | Kept |
| Barbell deadlift 225 × 5 | 262.5 | Deadlift | 0 | 94.5 | Kept |
| Barbell squat 315 × 5 | 367.5 | Squat | 0 | 132.3 | Outgrown |
| | | Sumo squat | 2 | 95.6 | Kept |
| Barbell sumo squat 315 × 5 | 367.5 | Sumo squat | 0 | 132.3 | Outgrown |
| | | Squat | none | quads only help | Kept |
| Barbell bench 225 × 5 | 262.5 | Bench press | 0 | 94.5 | Kept |
| Barbell bench 315 × 5 | 367.5 | Bench press | 0 | 132.3 | Outgrown |
| | | Incline bench press | 2 | 95.6 | Kept |

The break-even for the same lift on a bar is a one-rep max of `126.5 ÷ 0.36 ≈ 351 lb`, about
300 × 5. Isolation lifts need `1.15 × 75 × ratio(17) = 135` per bell: a curl or a lateral raise
never gets there, a shrug does once the bar is past roughly 340 × 10.

The goal moves the line. Under Strength a compound lift is planned for 5 reps, so the same bar
asks for a heavier bell: the sibling must predict `1.15 × 75 × ratio(7) = 106.4`, a one-rep max of
about 296 lb on the bar (255 × 5). A 275 × 5 deadlift keeps the dumbbell deadlift under Muscle
and outgrows it under Strength.

With the veto: deadlift 365 × 5 on the bar and the dumbbell deadlift logged at 70 × 12 (own 98,
over `0.85 × 105 = 89.25`) is outgrown. The same bar with the dumbbell deadlift at 50 × 12 (own
70) is kept.

## What you see

The rule says what it did in two places, in the same words:

- **The Start sheet's exercise list.** Under the day's lifts, one line for each dumbbell lift the
  day would have had: "Left out: Dumbbell Romanian Deadlift. Your heaviest dumbbell (75 lb) is
  too light for it, going by your Barbell Romanian Deadlift." Tap it for the lift's sheet. The
  day is built a second time without the rule (`generate.js leftOut`), and the lifts only that
  one has, which the rule judges outgrown, are the ones named: a lift the day would not have
  picked anyway is not listed.
- **The exercise's own sheet** (the library, "How to do it"): "Left out of one-tap workouts."
  and the same reason.

By rule 1 the reason is your own reps ("you can already do that for 12 reps"), by rule 2 the
sibling it was read off.

## Constants

| Name | Value | Meaning |
|---|---|---|
| `RECENT` | 5 sessions | A lift's best is read from its last sessions |
| `FRESH` | 84 days | Older logs say nothing of today |
| `MARGIN` | 1.15 | How far a prediction must clear the cap |
| `ROOM` | 0.85 | Own logs under this share of the need overrule a sibling |
| `RIR` | 2 | Reps in the tank a planned set is loaded with |
| `REACH` | 0.90, 0.75, 0.65 | Carry-over by reach (`infer-weight.js`) |
| `KIT` | see above | Kit against a barbell (`infer-weight.js`) |

## Limits

- The kit ratios are averages. Someone whose grip gives out early is protected by the veto only
  once the dumbbell lift is logged.
- Target muscles come from the catalogue's single `tg` and its muscle weights, not the lazily
  loaded muscle roles, so the siblings are the same before and after those load.
