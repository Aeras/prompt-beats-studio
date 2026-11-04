"""Deterministic additive package; never include a config, fixture DB or old writer."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent
output = Path(sys.argv[1]).resolve()
files = {}
# Never glob private/*.php: a future operator may have placed a real config there.
allowed = {
    "private": ["lab-core.php", "lab-service.php", "lab-config.example.php", "lab-backfill.php", "backfill-core.php", "backfill-transport.php", "backfill-config.example.php"],
    "public": ["lab-v1.php"],
}
for directory, names in allowed.items():
    target = "kino-private" if directory == "private" else "kino-api"
    for name in names:
        files[f"{target}/{name}"] = (root / directory / name).read_bytes()
files["README.md"] = (root / "README.md").read_bytes()
manifest = {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()} for name, data in files.items()}
files["MANIFEST.json"] = json.dumps(manifest, indent=2, sort_keys=True).encode()
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
    for name, data in sorted(files.items()):
        info = zipfile.ZipInfo(name, (2026, 11, 4, 0, 0, 0))
        info.external_attr = 0o600 << 16
        archive.writestr(info, data)
print(json.dumps({"path": str(output), "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "files": len(files)}))
