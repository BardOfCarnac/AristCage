# NCN Chamber Movement Department — Publication Compliance

The module owns selection, connected-cluster choreography, swept-route avoidance, mechanical timing, effect requests, cancellation, settlement and exact restoration.

It does not own application lifecycle, the global scheduler, chamber construction, Optical rendering, weather, general faults or automatic narrative scheduling.

Required controls are present:

```text
init
applyProfile
suspend
resume
reset
destroy
trigger
cancel
settle
snapshot
```

Required movement events identify the sequence, pattern and affected block IDs.

The intake manifest targets `chamber-motion`, declares `visual-director` and `effects`, claims only `environment:chamber-motion`, uses visual channel `chamber`, registers recurring work only in runtime group `chamber`, declares deterministic testing and reduced motion, and lists no protected roots.

No production file, chamber root, RedWire root, Dripfeed root or Optical hierarchy is modified by this publication.
