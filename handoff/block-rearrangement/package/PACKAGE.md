# Block Rearrangement Publication Archive

The complete department publication is stored here as a ZIP archive encoded into ordered UTF-8 base64 chunks. This staging form exists because the repository connector used for publication writes text files rather than arbitrary binary files.

The encoded chunks are the archive itself, not source files intended for integration.

## Reconstruct and verify

From this directory:

```sh
sh unpack.sh
```

To extract somewhere else:

```sh
sh unpack.sh /path/to/output
```

The script:

1. concatenates every `ncn-block-rearrangement-publication.zip.b64.part*` file in filename order;
2. decodes the combined base64 stream;
3. verifies the ZIP against the expected SHA-256 checksum;
4. extracts the publication folder;
5. prints the acceptance-test command.

Expected archive checksum:

```text
354fb00b21d0d020153b89f5bcb81e16ed954f34944770525cbb100904ba5333
```

## Test after extraction

```sh
node ncn-block-rearrangement/tests/acceptance.js
```

Expected final line:

```text
PASS: NCN block rearrangement acceptance test
```

## Publication contents

The recovered `ncn-block-rearrangement/` directory contains:

- `block-rearrangement.js` — renderer-independent production module;
- `block-rearrangement.css` — optional cleanup and DOM-adapter hooks;
- `demo/` — mock chamber, mock shared runtime and interactive acceptance page;
- `reference/approved-motion-model.html` — accepted visual behaviour reference;
- `tests/acceptance.js` — automated interruption, restoration, suspension and destruction test;
- `README.md` — publication overview;
- `API.md` — methods, return values and emitted events;
- `CHAMBER-CONTRACT.md` — required chamber handles and geometry contract;
- `PERFORMANCE.md` — runtime and reduced-performance notes;
- `LIMITATIONS.md` — known limitations;
- `DEPARTMENT-BRIEF.md` — authoritative department publication guide;
- `INTEGRATION-NOTES.md` — guidance for the eventual consolidation agent.

## Important boundary

The reference and demo chamber code exists only to make the isolated publication observable. The production module must receive blocks and geometry from the central chamber system. It must not construct a second chamber, own a permanent animation loop, move weather, or transform the Optical display hierarchy.

This branch contains handoff material only. No production viewer files have been modified and the package should not be merged as production integration without consolidation review.
