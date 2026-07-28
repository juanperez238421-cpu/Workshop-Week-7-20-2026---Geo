# Geometry Tactical Final School V58

## Release identity

- Version: `58.0.0`
- Edition: `final-boss-clean-hud-v58`
- Windows product: `Geometry Tactical Final School V58`
- Classroom mode: offline, one PC representing three registered students
- Teacher Results PIN: `9109`

## Clean player view

V58 preserves the current pixel-art assets and general game format while replacing the crowded gameplay overlay with a high-contrast essential HUD.

The permanent player view shows only:

- current level;
- real remaining mission time;
- score;
- remaining enemies;
- equipped weapon and ammunition;
- current strike count;
- dash availability;
- a short contextual interaction prompt.

Long instructions remain outside the active combat view. Boss information appears only during the final encounter.

## Assessment fairness corrections

- The 20-minute mission is measured against a wall-clock deadline, so minimizing the application or delaying rendering cannot extend the assessment.
- Each geometry question has a wall-clock 60-second deadline.
- Correct answers, wrong answers and timeouts all advance the Student 1 → Student 2 → Student 3 question rotation before another question is loaded.
- The game does not reveal the correct answer after a failed attempt.
- Existing score rules, encrypted answer records and consolidated three-student reports are preserved.

## Five-room progression

The existing four tactical rooms and assets remain intact. V58 adds:

### Level 5 — Final Archive Warden

The final boss uses three shield/core phases.

1. Normal bullets cannot damage the active shield.
2. Move near a room weapon and press `E` to equip it.
3. Aim at the boss and press `E` again to throw the equipped weapon.
4. Only authored room weapons break the boss shield; an ordinary personal weapon is rejected and the HUD reinforces the clue.
5. When the core opens, use the normal fire control to damage it.
6. Repeat the interaction for all three phases.

Players may throw their currently equipped personal or collected weapon with `E`. A Pulse Pistol is restored as the emergency sidearm after a throw, but the final shield specifically requires the room-weapon clue.

## Controls

- `WASD` or arrow keys: move
- Mouse: aim
- Left click, `Space` or `F`: fire
- `Shift`: dash
- `R`: reload
- `E`: pick up or throw the equipped weapon

## Security and school deployment

- Offline Electron application
- No analytics, telemetry, updater, cloud upload or external navigation
- AES-256-GCM encrypted local results
- Windows-protected local encryption key
- Existing secure results-vault location preserved through the V58 upgrade
- NSIS per-user installer and portable x64 executable
- SHA-256 verification scripts included in the USB package

## Required automated release gates

The Windows workflow validates:

- deterministic V58 source generation;
- JavaScript syntax and DOM wiring;
- five-room identity;
- clean essential HUD;
- wall-clock mission and question deadlines;
- fair retry rotation;
- installed Room 5 boss probe;
- four room weapons and `E`-key pickup/throw interaction;
- three boss phases and room-weapon shield gate;
- encrypted vault save, wrong-PIN rejection and correct-PIN access;
- three-student result consolidation;
- NSIS installation and portable Windows executable structure.
