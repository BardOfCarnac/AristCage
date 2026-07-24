# Dripfeed application boundary

Dripfeed and RedWire are separate applications running inside the same NCN terminal.

## Shared terminal systems

- permanent chamber
- chamber camera and aperture calculations
- environmental runtime
- terminal rail and identity
- application selection lifecycle

## RedWire-owned systems

- news entry model
- article list renderer
- desktop inspector
- RedWire semantic optical article planes
- news filter and submission panels

## Dripfeed-owned systems

- classified publication model
- mixed-size tile-wall renderer
- live, saved, seen and expired views
- expanded classified reader
- three-stage classified submission flow
- Unsplash picker and attribution
- Dripfeed live, rear and reader plane roles

Dripfeed records must never be adapted into `NCN_ENTRIES` or passed through RedWire's `entryMarkup()` renderer. The terminal application switch changes mounted application roots, not datasets inside one renderer.
