#!/usr/bin/env python3
"""
add-svg-in-ot.py — LEGACY, DO NOT RUN.

This generator is retained only to explain and inspect the former font
pipeline.  Runtime fonts must now stay COLRv1/CPAL-only; run
``strip-tajweed-svg.py`` instead.  The old SVG fallback won renderer priority
in WKWebView, did not follow dark-mode foreground colours reliably, and made
the iOS font bundle roughly three times larger.

iOS Safari formally supports COLR v1 from iOS 16.4, but in practice
silently ignores the table and paints only the base glyph outline
(letters appear as a flat white silhouette).  The bug has lingered
for years.  WebKit, however, has shipped SVG-in-OpenType ("SVG ")
support since iOS 13 — so we add a redundant SVG document per
coloured glyph, mirroring the COLR paint tree.

The ordinary calligraphy layer (CPAL index 0) is deliberately emitted
as SVG ``context-fill`` instead of a baked palette colour.  In WebKit's
SVG-in-OpenType renderer this follows the foreground paint of the glyph;
``currentColor`` does not and was observed rendering the base calligraphy
black on both themes in the iOS app.  The React renderers set that foreground
through the shared ``.tajweed-theme-ink`` class, so the same font is white on
dark themes and black on light themes while the Tajweed accents keep their
official baked colours.

Renderer selection at runtime is automatic:
  * Chrome / Edge (Chromium) — uses COLR, ignores SVG (Chromium
    removed SVG-in-OT support in 2017 for security reasons).
  * Firefox — supports both; prefers SVG.
  * Safari (macOS + iOS) — uses SVG (COLR support is unreliable).

Cost / trade-offs:
  * Size: each font grows from ~30 KB to ~250 KB.  604 fonts × 250 KB
    ≈ 150 MB total of static font assets.  Acceptable because they
    are served on demand (one page = one font), not pre-cached.
  * Tajweed accent colours remain BAKED — overriding them via
    @font-palette-values has no effect on the SVG render path.  Only
    the base calligraphy follows the surrounding text paint.  On Chrome desktop,
    @font-palette-values still works through the COLR path.

Idempotent: generated SVG documents carry a version marker.  An old
table without that marker is rebuilt once even when its glyph count
already matches the COLR v1 BaseGlyphList.

Pipeline order: run LAST, after upgrade-tajweed-colr-v1.py.

Usage:
  python3 scripts/gen/add-svg-in-ot.py
  python3 scripts/gen/add-svg-in-ot.py p001
"""

from __future__ import annotations
import sys
from pathlib import Path
from xml.sax.saxutils import escape
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables.otTables import PaintFormat
from fontTools.pens.svgPathPen import SVGPathPen

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
FONTS_DIR = REPO_ROOT / "public" / "fonts"

FOREGROUND_PALETTE_INDEX = 0xFFFF  # special — render with the text foreground
BASE_INK_PALETTE_INDEX = 0
SVG_PALETTE_MARKER = "asr-theme-ink-v4-context-fill"


def cpal_hex(cpal, index: int) -> str:
    """palette[0] entry at `index` as #RRGGBB."""
    palette = cpal.palettes[0]
    if index < 0 or index >= len(palette):
        return "#000000"
    c = palette[index]
    return f"#{c.red:02x}{c.green:02x}{c.blue:02x}"


def paint_solid_color(paint, cpal) -> str:
    """PaintSolid → SVG fill string.

    Foreground (0xFFFF) and the ordinary calligraphy layer (index 0)
    inherit the surrounding text paint.  Every tajweed accent stays baked.
    """
    idx = paint.PaletteIndex
    if idx in (FOREGROUND_PALETTE_INDEX, BASE_INK_PALETTE_INDEX):
        return "context-fill"
    return cpal_hex(cpal, idx)


def collect_paint_glyphs(paint, layer_list, cpal, out: list[tuple[str, str]]) -> None:
    """Walk a COLR v1 paint tree, append (glyph_name, fill_color) for each
    PaintGlyph encountered.  We only handle the subset KFC actually emits:
    PaintColrLayers, PaintGlyph + PaintSolid.  Anything more exotic (gradients,
    transforms) is skipped — fontTools sets `Format` to one of the
    `PaintFormat` enum values."""
    fmt = paint.Format
    if fmt == int(PaintFormat.PaintColrLayers):
        first = paint.FirstLayerIndex
        n = paint.NumLayers
        for i in range(first, first + n):
            collect_paint_glyphs(layer_list[i], layer_list, cpal, out)
    elif fmt == int(PaintFormat.PaintGlyph):
        inner = paint.Paint
        if inner.Format == int(PaintFormat.PaintSolid):
            out.append((paint.Glyph, paint_solid_color(inner, cpal)))
        # Any other inner paint (e.g. gradient) — silently skip.
    # Other formats: not used by KFC; ignore.


def glyph_path_d(font, glyph_name: str) -> str:
    glyph_set = font.getGlyphSet()
    if glyph_name not in glyph_set:
        return ""
    pen = SVGPathPen(glyph_set)
    glyph_set[glyph_name].draw(pen)
    return pen.getCommands()


def build_svg_doc(font, gid: int, layers: list[tuple[str, str]]) -> str:
    """Return one <svg> document string.  Coordinate system flipped on Y
    because font space is y-up and SVG is y-down."""
    paths_xml: list[str] = []
    for glyph_name, fill in layers:
        d = glyph_path_d(font, glyph_name)
        if not d:
            continue
        paths_xml.append(f'<path d="{escape(d)}" fill="{fill}"/>')
    body = "".join(paths_xml)
    # The flip is wrapped in a single <g> so the inner paths can use
    # the font's native coordinates verbatim.  id="glyph{gid}" is
    # required by the SVG-in-OT spec to bind the document to a GID.
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" '
        f'data-asr-palette="{SVG_PALETTE_MARKER}">'
        f'<g id="glyph{gid}" transform="matrix(1 0 0 -1 0 0)">'
        f'{body}'
        '</g></svg>'
    )


def font_paths(filter_stem: str | None) -> list[Path]:
    all_paths = sorted(FONTS_DIR.glob("qpc-v4-tajweed-p*.woff2"))
    if filter_stem:
        all_paths = [p for p in all_paths if filter_stem in p.stem]
    return all_paths


def process_one(path: Path) -> str:
    font = TTFont(str(path))
    if "COLR" not in font or font["COLR"].version != 1:
        return "no-colr-v1"
    colr_table = font["COLR"].table
    if "CPAL" not in font:
        return "no-cpal"
    cpal = font["CPAL"]

    base_records = colr_table.BaseGlyphList.BaseGlyphPaintRecord
    layer_list = colr_table.LayerList.Paint

    if "SVG " in font:
        existing = font["SVG "]
        # Freshness requires both the full glyph set and our theme-aware
        # ink marker.  Older documents have the same count but bake white
        # palette[0], which is unreadable on a light iPhone theme.
        first_doc = existing.docList[0][0] if existing.docList else ""
        if (
            len(existing.docList) == len(base_records)
            and SVG_PALETTE_MARKER in first_doc
        ):
            return "already-has-svg"

    doc_list: list[tuple[str, int, int]] = []
    for rec in base_records:
        gid = font.getGlyphID(rec.BaseGlyph)
        layers: list[tuple[str, str]] = []
        collect_paint_glyphs(rec.Paint, layer_list, cpal, layers)
        if not layers:
            continue
        svg_doc = build_svg_doc(font, gid, layers)
        doc_list.append((svg_doc, gid, gid))

    if not doc_list:
        return "empty-paint-tree"

    svg_table = newTable("SVG ")
    svg_table.docList = doc_list
    # `compressed` controls whether documents are gzipped inside the
    # table; we leave them plain so the woff2 brotli pass can compress
    # the whole table uniformly (better ratios than per-document gzip).
    svg_table.compressed = False
    font["SVG "] = svg_table
    font.save(str(path))
    return "added"


def main() -> int:
    print(
        "disabled: SVG-in-OpenType is not supported by the QuranRu iOS "
        "pipeline; run scripts/gen/strip-tajweed-svg.py instead",
        file=sys.stderr,
    )
    return 2

    # Historical implementation below is intentionally unreachable.  Keep it
    # for forensic comparison with already generated fonts.
    filter_stem = sys.argv[1] if len(sys.argv) > 1 else None
    paths = font_paths(filter_stem)
    if not paths:
        print(f"no fonts found under {FONTS_DIR}", file=sys.stderr)
        return 1
    counts = {"added": 0, "already-has-svg": 0, "no-colr-v1": 0, "no-cpal": 0, "empty-paint-tree": 0}
    for i, p in enumerate(paths, 1):
        try:
            status = process_one(p)
        except Exception as exc:
            print(f"! {p.name}: {exc}", file=sys.stderr)
            counts["error"] = counts.get("error", 0) + 1
            continue
        counts[status] = counts.get(status, 0) + 1
        if i % 25 == 0:
            print(f"  {i}/{len(paths)} processed")
    print(f"SVG-in-OT add — {dict(counts)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
