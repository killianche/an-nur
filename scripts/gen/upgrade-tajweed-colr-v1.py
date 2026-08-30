#!/usr/bin/env python3
"""
upgrade-tajweed-colr-v1.py — LEGACY, DO NOT RUN.

The KFC QPC v4 Tajweed woff2 files ship with a COLR v0 table.  On
iOS Safari 15.4–16.3 the v0 renderer has a bug where the BASE
calligraphy layer (palette index 0) is dropped, and the letters
take on whatever colour the lower decorative layers happen to use
— readers see a "pink/green soup" instead of cleanly-coloured
tajweed rules.  WebKit's COLR v1 renderer is a different code path
and is NOT affected by this bug.

Conversion is mechanical: each base glyph in v0 maps to a flat list
of (layer_glyph, palette_idx) pairs.  We turn each pair into a
PaintGlyph wrapping a PaintSolid, and group them under a
PaintColrLayers per base glyph.  fontTools' colorLib.builder
handles the binary layout — we only describe the paint tree as a
nested tuple.

The CPAL table is preserved as-is.  No glyph outlines change — only
the COLR table is rewritten.  Browsers that already handle COLR v0
fine (Chrome / Firefox on desktop) keep rendering identically; the
visible difference is iOS Safari moving from "pink soup" to clean
colours.

Idempotent: a font already at v1 is skipped.  Re-running is safe.

Pipeline order: run AFTER patch-tajweed-default-palette.py, BEFORE
strip-tajweed-svg.py.

Usage:
  python3 scripts/gen/upgrade-tajweed-colr-v1.py
  python3 scripts/gen/upgrade-tajweed-colr-v1.py p001
"""

from __future__ import annotations
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.colorLib.builder import buildCOLR

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FONTS_DIR = REPO_ROOT / "public" / "fonts"


def font_paths(filter_stem: str | None) -> list[Path]:
    all_paths = sorted(FONTS_DIR.glob("qpc-v4-tajweed-p*.woff2"))
    if filter_stem:
        all_paths = [p for p in all_paths if filter_stem in p.stem]
    return all_paths


def upgrade_one(path: Path) -> str:
    font = TTFont(str(path))
    if "COLR" not in font:
        return "no-colr"
    colr = font["COLR"]
    if colr.version != 0:
        return "already-v1"

    # fontTools 4.x represents COLR v0 as ``colr.ColorLayers`` — a dict
    # of { base_glyph_name: [LayerRecord(.name, .colorID), ...] }.
    v0 = colr.ColorLayers

    # Build the v1 dict that colorLib.builder understands.  Each base
    # glyph gets one PaintColrLayers (or PaintGlyph for the single-
    # layer fast path); each layer becomes PaintGlyph + PaintSolid.
    v1_glyphs: dict[str, tuple] = {}
    for base_glyph_name, layers in v0.items():
        if not layers:
            continue
        paint_glyphs = [
            {
                "Format": 10,                 # PaintGlyph
                "Glyph": layer.name,
                "Paint": {
                    "Format": 2,              # PaintSolid
                    "PaletteIndex": layer.colorID,
                    "Alpha": 1.0,
                },
            }
            for layer in layers
        ]
        if len(paint_glyphs) == 1:
            v1_glyphs[base_glyph_name] = paint_glyphs[0]
        else:
            v1_glyphs[base_glyph_name] = {
                "Format": 1,                  # PaintColrLayers
                "Layers": paint_glyphs,
            }

    # buildCOLR produces a fresh table_C_O_L_R_ with table.Version=1.
    new_colr = buildCOLR(v1_glyphs, version=1)
    font["COLR"] = new_colr
    font.save(str(path))
    return "upgraded"


def main() -> int:
    print(
        "disabled: iOS must use the official Quran Foundation COLR v0 files",
        file=sys.stderr,
    )
    return 2

    # Historical implementation retained only for forensic comparison.
    filter_stem = sys.argv[1] if len(sys.argv) > 1 else None
    paths = font_paths(filter_stem)
    if not paths:
        print(f"no fonts found under {FONTS_DIR}", file=sys.stderr)
        return 1
    counts = {"upgraded": 0, "already-v1": 0, "no-colr": 0}
    for i, p in enumerate(paths, 1):
        try:
            status = upgrade_one(p)
        except Exception as exc:
            print(f"! {p.name}: {exc}", file=sys.stderr)
            counts["error"] = counts.get("error", 0) + 1
            continue
        counts[status] = counts.get(status, 0) + 1
        if i % 50 == 0:
            print(f"  {i}/{len(paths)} processed")
    print(f"COLR upgrade — {dict(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
