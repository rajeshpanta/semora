#!/usr/bin/env python3
"""
Derive the submitted Apple Watch screenshots from the untouched captures.

App Store Connect rejects a screenshot that carries an alpha channel, and the
watchOS simulator writes one. Stripping it is the ONLY thing that happens here:
the image is pasted onto an opaque canvas of the same size, so no pixel changes
value, and the script asserts exactly that before writing anything.

That assertion is the point. It is what lets the listing claim the screenshots
show the real Watch UI — if a retouch ever crept into watch/, this fails.

    python3 scripts/build-watch-screenshots.py [--check]

--check verifies the committed files without rewriting them.
"""
import sys
from pathlib import Path

from PIL import Image

RAW = Path("screenshots/store-screenshots/watch-raw")
OUT = Path("screenshots/store-screenshots/watch")
# App Store Connect's APP_WATCH_ULTRA size, which is also the Ultra 2 panel.
EXPECTED_SIZE = (410, 502)


def main() -> int:
    check_only = "--check" in sys.argv
    captures = sorted(p for p in RAW.glob("*.png"))
    if not captures:
        print(f"no captures in {RAW}", file=sys.stderr)
        return 1

    failed = False
    for src in captures:
        raw = Image.open(src)
        if raw.size != EXPECTED_SIZE:
            print(f"FAIL {src.name}: {raw.size[0]}x{raw.size[1]}, expected "
                  f"{EXPECTED_SIZE[0]}x{EXPECTED_SIZE[1]}")
            failed = True
            continue

        flat = Image.new("RGB", raw.size, (0, 0, 0))
        flat.paste(raw.convert("RGB"))
        if list(raw.convert("RGB").getdata()) != list(flat.getdata()):
            print(f"FAIL {src.name}: flattening changed pixels")
            failed = True
            continue

        dest = OUT / src.name
        if check_only:
            if not dest.exists():
                print(f"FAIL {src.name}: missing from {OUT}")
                failed = True
                continue
            shipped = Image.open(dest)
            if shipped.mode != "RGB":
                print(f"FAIL {dest.name}: has an alpha channel")
                failed = True
                continue
            if list(shipped.getdata()) != list(flat.getdata()):
                print(f"FAIL {dest.name}: does not match the raw capture")
                failed = True
                continue
            print(f"ok   {dest.name}: identical to the raw capture, no alpha")
        else:
            OUT.mkdir(parents=True, exist_ok=True)
            flat.save(dest)
            print(f"wrote {dest}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
