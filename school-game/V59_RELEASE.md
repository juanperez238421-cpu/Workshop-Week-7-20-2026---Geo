# Geometry Tactical Classroom V59

This release resolves the classroom-login, weapon-throw, melee-combat and repeated-question issues reported after V58.

## Registration

- Spacebar works normally inside all student-name fields, so surnames can be entered.
- The team must select `8°A`, `8°B` or `8°C` before starting.
- Grade and group are included in the encrypted result record and teacher table.

## Combat

- Pressing `E` throws the equipped weapon and removes it from the player's hand.
- No emergency pistol is generated after a throw.
- Unarmed attacks use `Space`, `F` or `Q` with range, facing and cooldown checks.
- New humanoid melee opponents use training batons and practice staffs.
- Existing ranged enemies, tactical hounds, five rooms and final boss are preserved.

## Geometry assessment

- Every generated figure is a right triangle.
- The bank uses at least 24 Pythagorean triples, six scales, four visual orientations, changing missing sides and changing Thales proportions.
- A 96-question recent-memory guard reduces repetitions and fixed answer patterns.
- Sine, cosine, Pythagoras and Thales remain the assessed topics.

## Protected results

- Student names, selected answers, correct answers and scores are stored only inside an AES-256-GCM encrypted local vault.
- The key is derived with scrypt and the teacher screen remains protected by PIN `9109`.
- Incorrect PIN attempts are throttled and the vault is replaced atomically.
- No plaintext student JSON or CSV files are written.

## Portable package

- GitHub Actions validates the real Windows runtime and encrypted vault before publishing the downloadable x64 package.
