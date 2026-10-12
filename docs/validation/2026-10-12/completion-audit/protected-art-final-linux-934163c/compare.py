"""Compare final Linux protected actuals with the previous candidate actuals."""

import hashlib
import json
import pathlib

from PIL import Image, ImageChops

HERE = pathlib.Path(__file__).resolve().parent
OLD = HERE.parent / "protected-art-candidate-one-one"
rows = []

for preset in ("overview", "operational", "close"):
    name = f"strategy-{preset}-actual.png"
    previous = OLD / name
    current = HERE / name
    with Image.open(previous) as old_image, Image.open(current) as new_image:
        old_rgb = old_image.convert("RGB")
        new_rgb = new_image.convert("RGB")
        assert old_rgb.size == new_rgb.size == (1280, 720)
        difference = ImageChops.difference(old_rgb, new_rgb)
        changed = sum(any(channel != 0 for channel in pixel) for pixel in difference.getdata())
        bounds = difference.getbbox()
        difference.save(HERE / f"strategy-{preset}-since-candidate-diff.png")
    rows.append(
        {
            "camera": preset,
            "previousSha256": hashlib.sha256(previous.read_bytes()).hexdigest(),
            "finalSha256": hashlib.sha256(current.read_bytes()).hexdigest(),
            "changedExactRgbPixels": changed,
            "changedBounds": bounds,
        }
    )

(HERE / "since-candidate.json").write_text(json.dumps(rows, indent=2) + "\n")
print(json.dumps(rows, indent=2))
