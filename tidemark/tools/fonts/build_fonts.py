#!/usr/bin/env python3
"""Bake Tidemark's fonts from the Archivo variable font.

What this does, for each style Tidemark uses:
  1. Instances the variable font at a fixed width (wdth) and weight (wght).
  2. Bakes tabular figures in: the cmap for 0-9 now points straight at the
     fixed-width ".tf" digit glyphs, so every number lines up on the numeric
     rail without any fontFeatureSettings (widgets and notifications included).
  3. Subsets to the characters the app actually shows (Latin, currency,
     arrows, punctuation) and drops hinting to keep the APK small.

The baked .ttf files are committed under app/src/main/res/font, so a normal
build never needs Python. Re-run this only when changing the styles:

    pip install fonttools
    python3 tools/fonts/build_fonts.py          (or: ./gradlew bakeFonts)
"""
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "Archivo[wdth,wght].ttf"
OUT = HERE.parent.parent / "app" / "src" / "main" / "res" / "font"

# resource name -> (width, weight, human-readable style name)
STYLES = {
    "archivo_expanded_semibold": (125, 600, "Expanded SemiBold"),
    "archivo_expanded_medium": (125, 500, "Expanded Medium"),
    "archivo_regular": (100, 400, "Regular"),
    "archivo_medium": (100, 500, "Medium"),
    "archivo_semibold": (100, 600, "SemiBold"),
    "archivo_narrow_regular": (75, 400, "Narrow Regular"),
    "archivo_narrow_medium": (75, 500, "Narrow Medium"),
}

UNICODES = (
    list(range(0x20, 0x7F))          # Basic Latin
    + list(range(0xA0, 0x180))       # Latin-1 + Latin Extended-A
    + list(range(0x2010, 0x2028))    # dashes, quotes, bullet, ellipsis
    + list(range(0x2030, 0x203B))    # per mille, primes, guillemets
    + [0x2009, 0x200A, 0x202F, 0x2044, 0x2212, 0x2215, 0x00D7]
    + list(range(0x20A0, 0x20C1))    # currency symbols
    + list(range(0x2190, 0x2194))    # arrows
)


def tabular_map(font: TTFont) -> dict:
    """Glyph -> tabular glyph, read from the font's own 'tnum' feature."""
    gsub = font["GSUB"].table
    mapping = {}
    for record in gsub.FeatureList.FeatureRecord:
        if record.FeatureTag != "tnum":
            continue
        for index in record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for sub in lookup.SubTable:
                if hasattr(sub, "ExtSubTable"):
                    sub = sub.ExtSubTable
                if getattr(sub, "mapping", None):
                    mapping.update(sub.mapping)
    return mapping


def bake_tabular(font: TTFont) -> int:
    mapping = tabular_map(font)
    changed = 0
    for table in font["cmap"].tables:
        for code, glyph in list(table.cmap.items()):
            if glyph in mapping:
                table.cmap[code] = mapping[glyph]
                changed += 1
    return changed


def rename(font: TTFont, style: str) -> None:
    family = "Archivo Tidemark"
    full = f"{family} {style}"
    ps = full.replace(" ", "")
    names = font["name"]
    for rec in list(names.names):
        if rec.nameID in (16, 17, 21, 22, 25):
            names.removeNames(nameID=rec.nameID)
    names.setName(full, 1, 3, 1, 0x409)
    names.setName("Regular", 2, 3, 1, 0x409)
    names.setName(full, 4, 3, 1, 0x409)
    names.setName(ps, 6, 3, 1, 0x409)
    names.setName(f"{ps};tidemark", 3, 3, 1, 0x409)


def build(name: str, wdth: int, wght: int, style: str) -> Path:
    vf = TTFont(SOURCE)
    font = instancer.instantiateVariableFont(vf, {"wdth": wdth, "wght": wght}, updateFontNames=False)
    baked = bake_tabular(font)
    rename(font, style)
    font["OS/2"].usWeightClass = wght
    options = subset.Options()
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk", "case", "zero"]
    options.notdef_outline = True
    sub = subset.Subsetter(options)
    sub.populate(unicodes=UNICODES)
    sub.subset(font)
    if "DSIG" in font:
        del font["DSIG"]
    out = OUT / f"{name}.ttf"
    font.save(out)
    print(f"{out.name:34s} wdth={wdth:3d} wght={wght} digits baked={baked:2d} {out.stat().st_size // 1024} KB")
    return out


def verify(path: Path) -> None:
    font = TTFont(path)
    cmap = font.getBestCmap()
    widths = {font["hmtx"][cmap[ord(d)]][0] for d in "0123456789"}
    assert len(widths) == 1, f"{path.name}: digits are not tabular: {widths}"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (wdth, wght, style) in STYLES.items():
        verify(build(name, wdth, wght, style))
    print("All digits tabular.")


if __name__ == "__main__":
    main()
