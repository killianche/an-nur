#!/usr/bin/env python3
"""
patch-tajweed-default-palette.py — copy palette[1] over palette[0].

The KFC QPC v4 Tajweed font ships with palette[0] tuned for a LIGHT
background (base calligraphy = black, idx 0).  On our dark UI that
makes the base letterforms nearly invisible.  palette[1] is the
original dark-background palette baked in by KFC; copying it into
slot 0 makes the default rendering — used by every browser that
doesn't honour @font-palette-values — readable out of the box.

Why patch the font file instead of overriding via CSS:
  * iOS Safari + COLR v0 has a long-standing bug where the base
    palette[0] colour (idx 0) keeps its original value regardless of
    CSS override-colors.  Patching the file is the only reliable fix.
  * Browsers without @font-palette-values support (older Firefox, etc.)
    fall back to palette[0] verbatim — patching gives them dark-mode
    colours for free.

Side-effect: also sets the USABLE_WITH_DARK_BACKGROUND flag (bit 1)
on paletteType[0] for semantic correctness.

Run after fetch-tajweed-data.ts, before upgrade-tajweed-colr-v1.py.
Idempotent: re-running has no effect once palette[0] already matches
palette[1].

Usage:
  python3 scripts/patch-tajweed-default-palette.py
  python3 scripts/patch-tajweed-default-palette.py p001            # one page only
"""

from __future__ import annotations
import sys
from pathlib import Path
from fontTools.ttLib import TTFont

REPO_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = REPO_ROOT / "web" / "public" / "fonts"

USABLE_WITH_DARK_BACKGROUND = 0x0002


def font_paths(filter_stem: str | None) -> list[Path]:
    all_paths = sorted(FONTS_DIR.glob("qpc-v4-tajweed-p*.woff2"))
    if filter_stem:
        all_paths = [p for p in all_paths if filter_stem in p.stem]
    return all_paths


def patch_one(path: Path) -> str:
    font = TTFont(str(path))
    if "CPAL" not in font:
        return "no-cpal"
    cpal = font["CPAL"]
    num_palettes = len(cpal.palettes)
    if num_palettes < 2:
        return "single-palette"
    palette_0 = cpal.palettes[0]
    palette_1 = cpal.palettes[1]
    n_entries = len(palette_0)
    # idempotent guard — every cmp returns True means already patched
    already = all(
        palette_0[i].red   == palette_1[i].red   and
        palette_0[i].green == palette_1[i].green and
        palette_0[i].blue  == palette_1[i].blue  and
        palette_0[i].alpha == palette_1[i].alpha
        for i in range(n_entries)
    )
    if already:
        # still ensure the flag is set
        if cpal.paletteTypes and not (cpal.paletteTypes[0] & USABLE_WITH_DARK_BACKGROUND):
            cpal.paletteTypes[0] |= USABLE_WITH_DARK_BACKGROUND
            font.save(str(path))
            return "flag-only"
        return "skip"
    # Replace palette[0] with a copy of palette[1].  Color objects in
    # fontTools 4.x are immutable namedtuples, so we rebuild the list
    # rather than mutating individual entries.
    cpal.palettes[0] = list(palette_1)
    # set the dark-background flag for semantic correctness
    if not cpal.paletteTypes:
        cpal.paletteTypes = [0] * num_palettes
    cpal.paletteTypes[0] |= USABLE_WITH_DARK_BACKGROUND
    font.save(str(path))
    return "patched"


def main() -> int:
    filter_stem = sys.argv[1] if len(sys.argv) > 1 else None
    paths = font_paths(filter_stem)
    if not paths:
        print(f"no fonts found under {FONTS_DIR}", file=sys.stderr)
        return 1
    counts = {"patched": 0, "skip": 0, "flag-only": 0, "no-cpal": 0, "single-palette": 0}
    for i, p in enumerate(paths, 1):
        status = patch_one(p)
        counts[status] = counts.get(status, 0) + 1
        if i % 50 == 0:
            print(f"  {i}/{len(paths)} processed")
    print(f"palette patch — {dict(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
