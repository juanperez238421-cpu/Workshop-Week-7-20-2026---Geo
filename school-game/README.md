# Neon Geometry Tactical Pixel Local v48.0.0

A self-contained Windows classroom game for one PC representing exactly three Grade 8 students.

## Visual redesign

The previous illustrated WebP presentation has been replaced in gameplay by a compact, coherent pixel-art system:

- 24 × 24 character frames rendered with nearest-neighbor scaling;
- six simplified armor variants;
- four simplified enemy silhouettes;
- pixel-art power, weapon, tile, effect and classroom-decoration sheets;
- no graphic elimination imagery;
- no copied commercial game characters, logos or level artwork.

## Armor catalog

Students choose one armor before starting:

| Armor | Passive |
|---|---|
| Cadet | Balanced starter armor |
| Scout | 12% faster movement |
| Guardian | Starts each map with one shield |
| Vector | Reduced dash cooldown |
| Solar | Five-round magazine |
| Graphite | Faster reload |

Every armor begins with the same simple **Pulse Pistol** so the first match is easy to read and control.

## Simplified combat

- One projectile per shot.
- Two player projectiles may exist at once.
- Four enemy projectiles may exist at once.
- The complete match therefore has a strict six-projectile maximum.
- Standard magazine: four rounds.
- Solar magazine: five rounds.
- Manual reload: `R`.
- A single dashed trajectory line shows the current firing direction.

## Improved fixed maps

1. **Classroom Crossroads** — central cover and four approach lanes.
2. **Library Lanes** — long shelf corridors and controlled sightlines.
3. **Robotics Workshop** — horizontal workbench rows and crossing spaces.
4. **Geometry Vault** — repeated rectangular cover with tighter tactical transitions.

Each map uses fixed enemy starting positions, visible classroom-safe decorations and local collision geometry.

## Core learning loop

- One training hit registers one strike.
- Strikes 1 and 2 trigger a rapid local reset.
- Strike 3 pauses combat and opens a trigonometry checkpoint.
- Questions rotate Student 1 → Student 2 → Student 3.
- Incorrect answers and timeouts are recorded and produce another question.
- A correct answer clears the three-strike cycle and resumes the map.

## Controls

- `WASD` or arrow keys: movement.
- Mouse: aim.
- Left click or `Space`: fire one Pulse Pistol projectile.
- `Shift`: dash.
- `R`: reload.
- `P`: pause.

## Enemy AI

Enemies retain fixed initial positions but use:

- line-of-sight detection;
- pursuit and retreat;
- lateral strafing;
- velocity-based lead aiming;
- projectile-threat detection;
- perpendicular dodge movement;
- ranged, heavy and close-range roles.

## Trigonometry assessment

The question generator includes:

- sine to find an opposite side;
- cosine to find an adjacent side;
- tangent to find an opposite side;
- SOH-CAH-TOA ratio identification;
- inverse sine to estimate an angle.

## Local results

Every match is auto-saved during play, after checkpoints and at completion to:

```text
Documents\Neon Geometry Tactical Results\results
```

The parent folder contains:

- `LATEST_RESULT.json`
- `LATEST_RESULT.csv`
- `RESULTS_LOCATION.txt`
- `LAST_SAVED_RESULT.txt`
- `OPEN_RESULTS_FOLDER.cmd`

The report now records the selected armor, weapon, magazine, projectile limits, map, wave, combat statistics and each student's complete answer history.
