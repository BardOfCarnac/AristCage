#!/usr/bin/env sh
set -eu

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUT=${1:-$HERE}
ARCHIVE="$OUT/ncn-block-rearrangement-publication.zip"
EXPECTED="354fb00b21d0d020153b89f5bcb81e16ed954f34944770525cbb100904ba5333"

mkdir -p "$OUT"

decode_base64() {
  if base64 --help 2>&1 | grep -q -- '--decode'; then
    base64 --decode
  else
    base64 -D
  fi
}

cat "$HERE"/ncn-block-rearrangement-publication.zip.b64.part* \
  | decode_base64 > "$ARCHIVE"

if command -v sha256sum >/dev/null 2>&1; then
  ACTUAL=$(sha256sum "$ARCHIVE" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then
  ACTUAL=$(shasum -a 256 "$ARCHIVE" | awk '{print $1}')
else
  echo "Cannot verify package: sha256sum or shasum is required." >&2
  exit 1
fi

if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Checksum failed: expected $EXPECTED, got $ACTUAL" >&2
  rm -f "$ARCHIVE"
  exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
  echo "Package verified, but unzip is required to extract it." >&2
  exit 1
fi

unzip -q -o "$ARCHIVE" -d "$OUT"
echo "Verified archive: $ARCHIVE"
echo "Unpacked module: $OUT/ncn-block-rearrangement"
echo "Acceptance test: node $OUT/ncn-block-rearrangement/tests/acceptance.js"
