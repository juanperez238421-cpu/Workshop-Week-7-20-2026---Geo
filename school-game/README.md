# Neon Geometry Tactical Local v47.1.0

A self-contained Windows classroom game for one PC representing exactly three Grade 8 students.

## Core loop

- Fixed top-down room layouts with local collision geometry.
- Original school-safe neon sprite sheets generated for this project.
- No graphic elimination imagery.
- One training hit registers one strike.
- Strikes 1 and 2 trigger a rapid local reset.
- Strike 3 pauses combat and opens a trigonometry checkpoint.
- Questions rotate Student 1 → Student 2 → Student 3 independently of combat.
- A correct answer clears the three-strike cycle and resumes the room.

## Tactical mechanics

- WASD or arrow keys: movement.
- Mouse: aim.
- Left click or Space: three-ray triangulated training volley.
- Shift: dash.
- P: pause.
- R: restart the current room.

Enemies use fixed room starting positions, line-of-sight checks, predictive aim, velocity lead, strafing, retreat, pursuit, projectile-threat detection, and perpendicular dodge behavior.

## Trigonometry assessment

The question generator uses only trigonometric content:

- sine to find an opposite side;
- cosine to find an adjacent side;
- tangent to find an opposite side;
- SOH-CAH-TOA ratio identification;
- inverse sine to estimate an angle.

## Local results

Every match is auto-saved during play and at completion to:

```text
Documents\Neon Geometry Tactical Results\results
```

The parent folder contains:

- `LATEST_RESULT.json`
- `LATEST_RESULT.csv`
- `RESULTS_LOCATION.txt`
- `LAST_SAVED_RESULT.txt`
- `OPEN_RESULTS_FOLDER.cmd`

The JSON and CSV include group combat performance, each student's assigned checkpoints, attempts, correct and wrong answers, timeouts, response times, accuracy, and full answer history.
