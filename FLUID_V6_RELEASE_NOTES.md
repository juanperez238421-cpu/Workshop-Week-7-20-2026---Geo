# Fluid Gameplay v6

This release introduces the following classroom gameplay changes:

- Three lives per player before the trigonometry respawn question appears.
- Five ammunition charges per player.
- One ammunition charge is consumed per Spacebar firing action, including team-cohesion volleys.
- Random supply boxes for ammunition, shield, speed, rapid fire, and territory-paint boost.
- Client-side movement prediction and remote-player interpolation.
- Projectile extrapolation using authoritative velocity data.
- A 40 Hz authoritative simulation with 15 Hz compressed state snapshots.
- WebSocket compression, TCP no-delay, single-serialization broadcast, and stale-snapshot backpressure protection.
- Student and master network-quality telemetry.
- Master live-arena visibility for supply boxes, lives, and ammunition.

The existing registration, teacher approval, readiness, room PIN, three-team structure, Spacebar-only shooting, and right-click aiming workflows remain in place.

The pull request workflow compiles the layered authoritative runtime and verifies the gameplay, networking, browser integration, and updated Fluid v6 interface copy before release. Its complete test output is retained as a short-lived CI artifact for diagnostics. The final smoke pass accepts the responsive rule-grid markup used by the student lobby.
