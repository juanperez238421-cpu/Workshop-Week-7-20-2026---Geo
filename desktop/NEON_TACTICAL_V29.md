# Triad Territory Rush Local — Neon Tactical v29

## Visible local results

Every completed run is saved before any network-delivery attempt.

Primary Windows folder:

```text
Documents\Triad Territory Rush Results\results
```

The parent folder also contains:

```text
LATEST_RESULT.json
LATEST_RESULT.csv
LAST_SAVED_RESULT.txt
RESULTS_LOCATION.txt
OPEN_RESULTS_FOLDER.cmd
```

When the installation directory is writable, a second copy is stored beside the executable under:

```text
Triad Territory Rush Results
```

The in-game **RESULTS / SETTINGS** control and the final **OPEN SAVED RESULTS** button open the exact primary folder. Teacher delivery is optional and never replaces the local JSON/CSV copies.

## Combat rules

- The room, arena dimensions, three-team structure, territory system, controls and five-bot local channel remain intact.
- One confirmed projectile hit removes exactly one life.
- The first and second deaths use a 460 ms automatic redeploy.
- The third death opens the geometry checkpoint.
- Correct answers restore all three lives and restart the player after 360 ms.
- Wrong answers rotate quickly into a new geometry problem.
- Geometry assignment continues independently through Student 1, Student 2 and Student 3.

## Strong local AI

Bots use a 70 ms tactical decision interval and combine:

- nearest-target prioritization with additional pressure on the real player;
- movement prediction based on authoritative target velocity;
- projectile lead calculation;
- incoming-projectile interception prediction and perpendicular dodging;
- short-range retreat, mid-range strafing and long-range pursuit;
- rapid dash reactions;
- ammunition recovery behavior;
- a small deterministic aim error to keep the AI strong without making it mathematically perfect.

## Visual identity

The new presentation is an original neon tactical top-down arcade system. It uses dark rooms, cyan/magenta/yellow HUD accents, scanlines, a vignette, three-strike indicators, kill-chain feedback and fast-restart messaging. It does not include third-party art, music, characters, logos or copied level assets.
