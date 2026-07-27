# Known Limitations and Deliberate Boundaries

- This is a PR 86 departmental publication, not an installed replacement for the incumbent `chamber-motion` slot.
- PR 86 exposes camera and projection information but not production block handles. The integration agent must supply the chamber-owned block adapter described in `CHAMBER-CONTRACT.md`.
- The visual director and Effects Department are resolved by the PR 86 department context; this package does not own either service.
- The production chamber renderer determines final face appearance and endpoint continuity. The mock canvas demonstrates the contract but is not production geometry.
- Route reservation is conservative, so a visually possible route may be declined as `no-clear-route` near another large moving cluster.
- Completed sequences restore the original chamber state. Persistent topology from draft PR 77 is not adopted.
- Weather is neither moved nor disturbed. `getActiveGeometry()` exists only for optional occlusion.
- Node acceptance and syntax validation are complete. Combined browser testing against PR 86, the production chamber and Effects Department remains the integration agent’s staged task.
