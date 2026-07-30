# Geometry Tactical Classroom V61

V61 preserves the complete V60 classroom game and corrects the remaining visual merging in Thales similarity figures.

## Identified figure defects in V60

1. `AD` and `AE` labels used fixed normal signs. In mirrored figures those signs could place a label or its leader inside the triangle.
2. Leader lines were painted after the triangle, so a leader could visually merge with or cover a geometric side.
3. The smaller triangle shared `AD` and `AE` with the larger triangle but had no independent visual encoding for those coincident segments.
4. Labels `D` and `E` were only 32–38 px from their vertices, allowing them to cover the line junction or the small 90-degree marker.
5. The `DE ∥ BC` label and four segment labels were positioned independently, without a shared collision registry.

## V61 corrections

- All ten labels (`A`, `B`, `C`, `D`, `E`, `AD`, `AB`, `AE`, `AC`, and `DE ∥ BC`) use one collision registry.
- Callout normals are calculated from the triangle centroid and always point outward.
- Candidate label positions are searched along normal and tangent lanes, then clamped to the figure-only safe rectangle.
- Leader lines use an elbow route and are painted before the geometry, preventing visual line merging.
- `AD` and `AE` retain the complete dark outer side and receive a thin dashed blue overlay to identify the smaller triangle without erasing the larger one.
- `DE` is rendered with a white separator halo and an independent solid blue stroke.
- `D` and `E` labels are moved 82 px away from the small-triangle centroid, clear of the junction and right-angle marker.
- A deterministic audit checks 112 combinations: four mirrored orientations × seven similarity factors × four possible missing segments.

## Preserved classroom behavior

- 30-minute mission;
- maximum three pauses, each up to 30 seconds;
- mission clock and tactical simulation freeze during pauses;
- geometry checkpoints cannot be paused;
- five connected rooms, melee combat, finite weapon throws and final boss;
- procedural right-triangle question bank with repeat protection;
- full-name registration and group 8°A, 8°B or 8°C;
- AES-256-GCM local results with teacher PIN `9109`;
- migration of encrypted V60 and V59 records;
- full per-user Windows x64 NSIS installer.

Validation target: source SHA-256 verification, static contracts, 112-case Thales layout audit, Windows installer build, silent installation, installed renderer launch, encrypted-vault self-test and clean uninstallation.
