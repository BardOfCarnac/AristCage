# Validation Record

## Static checks

```text
node tests/source-integrity.js             PASS
node build-publication.js                  PASS
generated/committed equality               PASS
node --check block-rearrangement.js        PASS
node --check publication.js                PASS
node --check tests/acceptance.js           PASS
node --check tests/publication-contract.js PASS
```

## Deterministic acceptance

```text
node tests/acceptance.js
PASS: NCN PR86 block rearrangement acceptance test
```

The complete suite passed twenty consecutive runs after the live host-quality and reduced-motion correction.

The suite verifies live full → reduced → full preference changes, automatic low-performance policy under reduced host quality, modern `envelope()` and `claim()` use and claim release. A separate legacy asynchronous approval adapter releases ten requests simultaneously: exactly four are admitted, six return `busy`, and frame-by-frame module-owned poses show no inter-sequence cube overlap.

The publication smoke test confirms the API-v1 manifest, slot name, dependency declarations, layer, channel, runtime group, non-installing factory and required public methods.

## Browser status

The committed `block-rearrangement.js` is directly browser-loadable. The dedicated Chamber Movement workflow reconstructs it from checked source parts and rejects any generated-file drift. This publication does not claim a rendered production-browser pass against the combined PR 86 host and chamber.
