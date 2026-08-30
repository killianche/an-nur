#!/usr/bin/env python3
"""Remove the legacy SVG-in-OpenType fallback from QPC V4 Tajweed fonts.

The runtime fonts already contain COLR/CPAL colour data.  Safari/WKWebView
supports palette selection for colour fonts, while an additional ``SVG ``
table takes a different renderer path whose base paint does not reliably
follow CSS theme colours.  It also makes each page font roughly three times
larger and noticeably increases parsing/unmount work on iOS.

Keep COLR + CPAL as the single source of colour and let CSS ``font-palette``
select the dark or light palette.  The script is deliberately idempotent and
refuses to save a font without both required colour tables.

Pipeline order: run LAST, after patch-tajweed-default-palette.py and
upgrade-tajweed-colr-v1.py.

Usage:
  python3 scripts/gen/strip-tajweed-svg.py
  python3 scripts/gen/strip-tajweed-svg.py p001
"""

from __future__ import annotations

import sys
from pathlib import Path

from fontTools.ttLib import TTFont


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FONTS_DIR = REPO_ROOT / "public" / "fonts"


def font_paths(filter_stem: str | None) -> list[Path]:
    paths = sorted(FONTS_DIR.glob("qpc-v4-tajweed-p*.woff2"))
    if filter_stem:
        paths = [path for path in paths if filter_stem in path.stem]
    return paths


def strip_one(path: Path) -> str:
    font = TTFont(str(path))
    if "COLR" not in font or "CPAL" not in font:
        return "missing-colour-tables"
    if "SVG " not in font:
        return "already-colr-only"

    del font["SVG "]
    font.save(str(path))
    return "stripped"


def main() -> int:
    filter_stem = sys.argv[1] if len(sys.argv) > 1 else None
    paths = font_paths(filter_stem)
    if not paths:
        print(f"no fonts found under {FONTS_DIR}", file=sys.stderr)
        return 1

    counts: dict[str, int] = {}
    for index, path in enumerate(paths, 1):
        status = strip_one(path)
        counts[status] = counts.get(status, 0) + 1
        if index % 50 == 0:
            print(f"  {index}/{len(paths)} processed")

    print(f"SVG removal — {counts}")
    return 1 if counts.get("missing-colour-tables") else 0


if __name__ == "__main__":
    raise SystemExit(main())
