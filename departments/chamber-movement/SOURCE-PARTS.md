# Publication Source Parts

The validated production source is committed twice:

```text
block-rearrangement.js
source-parts/block-rearrangement.NN.part
```

`block-rearrangement.js` is the ordinary browser-loadable artifact used by the integration agent. The ordered text parts contain a gzip-compressed base64 transport copy, reducing repository noise while preserving reproducible source integrity.

Rebuild the committed artifact with:

```bash
node build-publication.js
```

CI decodes the parts, verifies the source checksum, regenerates the browser artifact, and requires it to be byte-for-byte identical to the committed `block-rearrangement.js` before syntax and acceptance tests run.
