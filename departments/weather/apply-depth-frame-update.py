from __future__ import annotations

import base64
import io
import tarfile
from pathlib import Path

root = Path.cwd().resolve()
weather = root / "departments/weather"
chunks = sorted(weather.glob(".depth-payload-*"))
if not chunks:
    raise RuntimeError("Weather depth-frame payload chunks are missing.")

payload = "".join(path.read_text().strip() for path in chunks)
with tarfile.open(fileobj=io.BytesIO(base64.b64decode(payload)), mode="r:gz") as archive:
    for member in archive.getmembers():
        target = (root / member.name).resolve()
        if root not in target.parents and target != root:
            raise RuntimeError(f"Unsafe archive path: {member.name}")
    archive.extractall(root, filter="data")

for transient in [
    *chunks,
    weather / ".depth-frame-scope",
    weather / "apply-depth-frame-update.py",
]:
    transient.unlink(missing_ok=True)

print("Applied immutable Weather depth-frame publication update.")
