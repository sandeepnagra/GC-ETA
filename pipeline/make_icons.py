#!/usr/bin/env python3
"""Draw the app icon from the design's geometry.

The app shipped with no icon declared at all, so the home screen showed a blank
white square. The design specifies one: a green card outline on the brand green,
whose third text line is a progress bar with a marker, which is the single
detail that makes it read as "when will this arrive" rather than "identity
card".

No SVG rasteriser exists on this machine, so rather than add a native
dependency for one drawing, the same geometry is drawn with Pillow primitives
and supersampled. Coordinates below are the design's 100x100 viewBox, unchanged,
so the two can be compared line by line.

Supersampling at 4x and reducing with Lanczos is what gives clean edges: Pillow
does not antialias primitives, and a 1024px icon drawn directly has visibly
stepped curves at the corner radius.

Outputs, per Expo's asset conventions:
    app/assets/icon.png            1024, iOS and the store listing
    app/assets/adaptive-icon.png   1024, Android foreground, inside the safe area
    app/assets/splash-icon.png     512, the launch screen mark

Usage:
    python make_icons.py
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "app" / "assets"

BRAND = (14, 107, 99, 255)      # #0E6B63
INK = (255, 255, 255, 255)
TRACK = (156, 203, 195, 255)    # #9CCBC3, the unfilled part of the progress bar
CLEAR = (0, 0, 0, 0)

SUPERSAMPLE = 4


def draw_card(draw: ImageDraw.ImageDraw, s: float, ink, track, dx: float = 0.0, dy: float = 0.0):
    """The green card outline, in the design's 100x100 space scaled by `s`."""

    def X(v: float) -> float:
        return (v + dx) * s

    def Y(v: float) -> float:
        return (v + dy) * s

    # PILLOW STROKES INWARD FROM THE BOUNDING BOX; SVG CENTRES THEM ON THE PATH.
    # Taken literally, the head at radius 4.5 with a 3.5 stroke came out as a
    # ring with a one-unit hole instead of a face, and every outline sat a
    # stroke-width inside where the design put it. Growing each bounding box by
    # half the stroke restores the centred geometry.
    def box(x, y, w, h, r, width):
        half = width / 2
        draw.rounded_rectangle(
            [X(x - half), Y(y - half), X(x + w + half), Y(y + h + half)],
            radius=(r + half) * s,
            outline=ink,
            width=max(1, round(width * s)),
        )

    def circle(cx, cy, r, width=None, fill=None):
        if fill is not None:
            draw.ellipse([X(cx - r), Y(cy - r), X(cx + r), Y(cy + r)], fill=fill)
            return
        half = width / 2
        outer = r + half
        draw.ellipse(
            [X(cx - outer), Y(cy - outer), X(cx + outer), Y(cy + outer)],
            outline=ink,
            width=max(1, round(width * s)),
        )

    def rule(x1, y1, x2, y2, width, colour):
        w = max(1, round(width * s))
        draw.line([X(x1), Y(y1), X(x2), Y(y2)], fill=colour, width=w)
        # Pillow has no line caps, and a butt end against a rounded design reads
        # as a different drawing. Capping each end with a dot restores it.
        for cx, cy in ((x1, y1), (x2, y2)):
            draw.ellipse([X(cx) - w / 2, Y(cy) - w / 2, X(cx) + w / 2, Y(cy) + w / 2], fill=colour)

    box(8, 23, 84, 54, 9, 5)          # the card
    box(17, 41, 22, 26, 3, 4)         # the photo panel
    circle(28, 50, 4.5, width=3.5)    # head
    # Shoulders: the design's cubic is, to the eye, the top half of a circle
    # centred under the head.
    half = 3.5 / 2
    draw.arc(
        [X(20 - half), Y(57 - half), X(36 + half), Y(73 + half)],
        start=180,
        end=360,
        fill=ink,
        width=max(1, round(3.5 * s)),
    )

    rule(47, 45, 79, 45, 4, ink)
    rule(47, 54, 70, 54, 4, ink)
    rule(47, 63, 79, 63, 4, track)    # progress track
    rule(47, 63, 66, 63, 4, ink)      # progress fill
    circle(66, 63, 3.5, fill=ink)     # the marker: this is the "ETA"

    box(74, 30, 9, 7, 1.5, 3)         # chip
    for x in (20, 27, 34, 41, 48):
        circle(x, 33, 2.2, fill=ink)


def render(size: int, background, *, inset: float = 0.0, ink=INK, track=TRACK) -> Image.Image:
    big = size * SUPERSAMPLE
    image = Image.new("RGBA", (big, big), CLEAR)
    draw = ImageDraw.Draw(image)

    if background is not None:
        # iOS applies its own mask, so the square is filled edge to edge and the
        # radius here only matters for platforms that do not mask.
        draw.rounded_rectangle([0, 0, big - 1, big - 1], radius=22 * (big / 100), fill=background)

    # `inset` shrinks the drawing toward the centre, which Android's adaptive
    # icon needs: the outer third of the canvas can be cropped to any shape.
    scale = (big / 100) * (1 - inset)
    offset = (big - 100 * scale) / 2
    layer = Image.new("RGBA", (big, big), CLEAR)
    draw_card(ImageDraw.Draw(layer), scale, ink, track, dx=offset / scale, dy=offset / scale)
    image.alpha_composite(layer)

    return image.resize((size, size), Image.LANCZOS)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)

    render(1024, BRAND).save(OUT / "icon.png")
    # Android masks the foreground to a circle or squircle and can crop the
    # outer third, so the card is inset and the colour is set in app.json.
    render(1024, None, inset=0.34).save(OUT / "adaptive-icon.png")
    render(512, None, inset=0.18, ink=BRAND, track=TRACK).save(OUT / "splash-icon.png")

    for name in ("icon.png", "adaptive-icon.png", "splash-icon.png"):
        path = OUT / name
        with Image.open(path) as image:
            print(f"  {name:22} {image.size[0]}x{image.size[1]}  {path.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
