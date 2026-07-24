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
- category filter rail and classified search
- expanded classified reader
- three-stage classified submission flow
- Unsplash picker and attribution
- Dripfeed live-wall and reader plane roles

Dripfeed does not use terminal-local SAVED or SEEN states. Expiry remains a publication property and may be shown directly on a classified tile.

Dripfeed records must never be adapted into `NCN_ENTRIES` or passed through RedWire's `entryMarkup()` renderer. The terminal application switch changes mounted application roots, not datasets inside one renderer.
