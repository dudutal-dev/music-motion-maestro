#!/usr/bin/env python3
"""Vector illustrator for 'The Lantern and the Frost Prince'.

Draws all 12 scenes as SVG from shared primitives. Characters are functions, not
prompts, so Nell and Aren are literally identical geometry in every scene.
Stdlib only. Writes stories/<slug>/svg/<slug>_part_NN.svg
"""
import json
import math
import pathlib

SLUG = "the-lantern-and-the-frost-prince"
ROOT = pathlib.Path(__file__).resolve().parent
W, H = 1600, 900

# ---------------------------------------------------------------- palette ---
NIGHT_TOP = "#0C1226"
NIGHT_MID = "#16203D"
NIGHT_BOT = "#2A3A5E"
SNOW = "#EDF2F7"
SNOW_SHADE = "#C3D2E2"
SNOW_DEEP = "#9DB4CC"
AMBER = "#F4B03C"
AMBER_HOT = "#FFE6A8"
FROST = "#9FD6E8"
MOSS = "#5C8A4A"
RED = "#C0453B"

TREE_FAR = "#1B2542"
TREE_MID = "#141C33"
TREE_NEAR = "#0A0F1E"

NELL_SKIN = "#D9A379"
NELL_HAIR = "#241A16"
COAT = "#4E7A4A"
COAT_DK = "#3A5D37"
CAP = "#B4552F"
MITT = "#7A4A2E"
BOOT = "#402C21"

CLOAK = "#2B3F73"
CLOAK_DK = "#1C2C55"
AREN_HAIR = "#E9EFF6"
AREN_WARM = "#F0C9A6"
AREN_ICE = "#93C9E0"
AREN_ICE_DK = "#7CB9D1"


class R:
    """Tiny deterministic PRNG — same scene always paints identically."""

    def __init__(self, seed):
        self.s = seed * 2654435761 % 2147483647 or 7

    def n(self):
        self.s = (self.s * 1103515245 + 12345) & 0x7FFFFFFF
        return self.s / 0x7FFFFFFF

    def u(self, a, b):
        return a + (b - a) * self.n()

    def i(self, a, b):
        return int(self.u(a, b + 1))


def esc(v):
    return f"{v:.1f}"


# ------------------------------------------------------------------ trees ---
def conifer(rng, x, by, h, w, fill, snow=None, op=1.0):
    """Stacked-triangle fir with jittered edges so it reads as painted."""
    p = [f'<rect x="{esc(x-w*0.045)}" y="{esc(by-h*0.16)}" '
         f'width="{esc(w*0.09)}" height="{esc(h*0.2)}" fill="{fill}" opacity="{op}"/>']
    tiers = 4
    for i in range(tiers):
        ty = by - h * 0.12 - (h * 0.62) * (i / (tiers - 1))
        tw = w * (1 - 0.22 * i)
        th = h * 0.32
        j = lambda k: rng.u(-w * k, w * k)
        pts = (f"{esc(x-tw/2+j(.04))},{esc(ty+j(.02))} "
               f"{esc(x+j(.03))},{esc(ty-th)} "
               f"{esc(x+tw/2+j(.04))},{esc(ty+j(.02))}")
        p.append(f'<polygon points="{pts}" fill="{fill}" opacity="{op}"/>')
        if snow:
            sw = tw * 0.5
            spts = (f"{esc(x-sw/2)},{esc(ty-th*0.42)} "
                    f"{esc(x+j(.02))},{esc(ty-th*0.95)} "
                    f"{esc(x+sw/2)},{esc(ty-th*0.42)}")
            p.append(f'<polygon points="{spts}" fill="{snow}" opacity="{0.75*op}"/>')
    return "".join(p)


def birch(rng, x, by, h, w, fill, op=1.0):
    p = [f'<rect x="{esc(x-w/2)}" y="{esc(by-h)}" width="{esc(w)}" height="{esc(h)}" '
         f'rx="{esc(w*0.4)}" fill="{fill}" opacity="{op}"/>']
    for _ in range(rng.i(2, 4)):
        yy = by - rng.u(h * 0.25, h * 0.9)
        p.append(f'<path d="M {esc(x)} {esc(yy)} q {esc(rng.u(14,34))} {esc(-rng.u(10,26))} '
                 f'{esc(rng.u(26,60))} {esc(-rng.u(22,48))}" stroke="{fill}" '
                 f'stroke-width="{esc(w*0.4)}" fill="none" stroke-linecap="round" opacity="{op}"/>')
    return "".join(p)


def treeline(rng, by, h, fill, n=14, x0=-60, x1=W + 60, snow=None, op=1.0, jitter=0.35):
    out = []
    span = (x1 - x0) / n
    for k in range(n):
        x = x0 + span * (k + rng.u(0.15, 0.85))
        hh = h * rng.u(1 - jitter, 1 + jitter)
        out.append(conifer(rng, x, by + rng.u(-6, 6), hh, hh * rng.u(0.42, 0.56),
                           fill, snow=snow, op=op))
    return "".join(out)


def drift(rng, y, amp, fill, op=1.0, step=210):
    d = f"M -60 {esc(y+rng.u(-amp,amp))}"
    x = -60
    while x < W + 60:
        nx = x + step
        d += (f" Q {esc(x+step*0.5)} {esc(y+rng.u(-amp,amp))} "
              f"{esc(nx)} {esc(y+rng.u(-amp*0.6,amp*0.6))}")
        x = nx
    d += f" L {W+60} {H+40} L -60 {H+40} Z"
    return f'<path d="{d}" fill="{fill}" opacity="{op}"/>'


def stars(rng, n, ymax, op=0.9):
    out = []
    for _ in range(n):
        x, y = rng.u(0, W), rng.u(0, ymax)
        r = rng.u(0.8, 2.2)
        out.append(f'<circle cx="{esc(x)}" cy="{esc(y)}" r="{esc(r)}" fill="#FFFFFF" '
                   f'opacity="{esc(rng.u(0.25, op))}"/>')
    return "".join(out)


def snowfall(rng, n, op=0.5):
    out = []
    for _ in range(n):
        out.append(f'<circle cx="{esc(rng.u(0,W))}" cy="{esc(rng.u(0,H))}" '
                   f'r="{esc(rng.u(1.2,3.4))}" fill="#FFFFFF" opacity="{esc(rng.u(0.12,op))}"/>')
    return "".join(out)


# ------------------------------------------------------------------- lamp ---
def lamp(sid, x, by, s=1.0, lit=True, frost=0.0, dim=1.0):
    """Iron lamp-post. Canonical height 300 at s=1, base at (x, by)."""
    g = [f'<g transform="translate({esc(x)},{esc(by)}) scale({esc(s)})">']
    g.append(f'<ellipse cx="0" cy="2" rx="26" ry="7" fill="#070B16" opacity="0.55"/>')
    g.append('<path d="M -15 0 L -9 -22 L 9 -22 L 15 0 Z" fill="#0B1020"/>')
    g.append('<rect x="-4" y="-250" width="8" height="230" fill="#0B1020"/>')
    g.append('<rect x="-13" y="-232" width="26" height="5" rx="2" fill="#0B1020"/>')
    # lantern housing
    g.append('<path d="M -25 -250 L 25 -250 L 19 -308 L -19 -308 Z" fill="#0B1020"/>')
    if lit:
        g.append(f'<path d="M -20 -254 L 20 -254 L 15 -304 L -15 -304 Z" '
                 f'fill="url(#glass{sid})" opacity="{esc(dim)}"/>')
        g.append(f'<ellipse cx="0" cy="-276" rx="7" ry="13" fill="{AMBER_HOT}" '
                 f'opacity="{esc(dim)}" filter="url(#soft{sid})"/>')
        g.append(f'<ellipse cx="0" cy="-278" rx="3" ry="7" fill="#FFFFFF" opacity="{esc(0.9*dim)}"/>')
    else:
        g.append('<path d="M -20 -254 L 20 -254 L 15 -304 L -15 -304 Z" fill="#16203D"/>')
    g.append('<path d="M -30 -308 L 30 -308 L 0 -338 Z" fill="#0B1020"/>')
    g.append('<circle cx="0" cy="-342" r="5" fill="#0B1020"/>')
    if frost > 0:
        # rime crawling up the post from the base — a translucent sheath, not a solid bar,
        # so the black iron still reads through it
        top = -250 * frost
        g.append(f'<path d="M -12 0 q -3 {esc(top*0.5)} 0 {esc(top)} l 24 0 '
                 f'q 3 {esc(-top*0.5)} 0 {esc(-top)} Z" fill="{FROST}" opacity="0.45"/>')
        g.append(f'<path d="M -12 0 q -3 {esc(top*0.5)} 0 {esc(top)}" stroke="#FFFFFF" '
                 f'stroke-width="2" fill="none" opacity="0.5"/>')
        rr = R(int(frost * 977) + 5)
        for _ in range(int(16 * frost) + 4):
            yy = rr.u(top, 0)
            side = -1 if rr.n() < 0.5 else 1
            g.append(f'<path d="M {esc(side*5)} {esc(yy)} l {esc(side*rr.u(7,18))} '
                     f'{esc(-rr.u(4,13))}" stroke="{FROST}" stroke-width="2.4" '
                     f'stroke-linecap="round" opacity="0.85"/>')
    g.append("</g>")
    return "".join(g)


def lion(x, y, s=1.0, fill="#2A2340"):
    """Distant roaring lion in profile, facing right. Canonical ~150 long, feet at y=0."""
    g = [f'<g transform="translate({esc(x)},{esc(y)}) scale({esc(s)})" fill="{fill}">']
    g.append('<path d="M -66 0 l 0 -30 l 11 0 l 0 30 Z"/>')          # hind leg far
    g.append('<path d="M -48 0 l 0 -32 l 11 0 l 0 32 Z"/>')          # hind leg near
    g.append('<path d="M 22 0 l 0 -34 l 10 0 l 0 34 Z"/>')           # fore leg far
    g.append('<path d="M 38 0 l 0 -36 l 10 0 l 0 36 Z"/>')           # fore leg near
    g.append('<path d="M -60 -28 q -6 -28 16 -34 l 62 -2 q 26 2 30 30 '
             'q -8 14 -34 14 l -50 0 q -18 0 -24 -8 Z"/>')            # body
    g.append('<path d="M -62 -50 q -26 -6 -30 -30 q 10 8 22 6 '
             'q -6 -12 2 -22 q 2 14 14 20 Z"/>')                      # tail + tuft
    g.append('<circle cx="46" cy="-62" r="30"/>')                     # mane
    for a in range(12):                                               # mane spikes
        th = a * (2 * 3.14159 / 12)
        g.append(f'<circle cx="{esc(46+30*math.cos(th))}" cy="{esc(-62+30*math.sin(th))}" r="9"/>')
    g.append('<circle cx="62" cy="-66" r="18"/>')                     # head
    g.append('<path d="M 74 -74 q 22 -4 26 6 q -12 0 -18 6 Z"/>')     # muzzle upper
    g.append('<path d="M 76 -60 q 20 6 24 -2 q -6 12 -22 10 Z"/>')    # open jaw
    g.append('<path d="M 52 -84 q 6 -14 16 -8 q -8 2 -10 10 Z"/>')    # ear
    g.append("</g>")
    return "".join(g)


def glow(sid, x, y, r, op=0.85, grad=None):
    return (f'<circle cx="{esc(x)}" cy="{esc(y)}" r="{esc(r)}" '
            f'fill="url(#{grad or f"warm{sid}"})" opacity="{esc(op)}"/>')


# ------------------------------------------------------------------ NELL ---
# Canonical: feet at (0,0), head crown near y=-104, facing right by default.
def _nell_head(tilt=0):
    return f"""
<g transform="translate(0,-78) rotate({esc(tilt)})">
  <path d="M -16 -6 q 0 -20 16 -20 q 16 0 16 20 q 0 6 -3 10 l -26 0 q -3 -4 -3 -10 Z" fill="{NELL_HAIR}"/>
  <circle cx="0" cy="0" r="14" fill="{NELL_SKIN}"/>
  <path d="M -14 -3 q 2 -13 14 -13 q 12 0 14 13 q -6 -6 -14 -6 q -8 0 -14 6 Z" fill="{NELL_HAIR}"/>
  <ellipse cx="-15" cy="4" rx="5" ry="8" fill="{NELL_HAIR}"/>
  <ellipse cx="15" cy="4" rx="5" ry="8" fill="{NELL_HAIR}"/>
  <ellipse cx="-15" cy="12" rx="4" ry="6" fill="{NELL_HAIR}"/>
  <ellipse cx="15" cy="12" rx="4" ry="6" fill="{NELL_HAIR}"/>
  <circle cx="-5.5" cy="1" r="2" fill="#241A16"/>
  <circle cx="5.5" cy="1" r="2" fill="#241A16"/>
  <circle cx="-9" cy="5.5" r="1" fill="#B5764F" opacity="0.8"/>
  <circle cx="-6" cy="7" r="1" fill="#B5764F" opacity="0.8"/>
  <circle cx="8" cy="5.5" r="1" fill="#B5764F" opacity="0.8"/>
  <path d="M -3 7 q 3 3 6 0" stroke="#8A5638" stroke-width="1.6" fill="none" stroke-linecap="round"/>
  <path d="M -17 -8 q 17 -16 34 0 q 0 -19 -17 -19 q -17 0 -17 19 Z" fill="{CAP}"/>
  <rect x="-17" y="-9" width="34" height="6" rx="3" fill="#9A4526"/>
  <circle cx="0" cy="-29" r="5" fill="{CAP}"/>
</g>"""


def _nell_scarf():
    return f"""
<path d="M -13 -62 q 13 7 26 0 l 0 8 q -13 7 -26 0 Z" fill="{RED}"/>
<path d="M 9 -58 q 12 8 8 24 q -2 8 -9 6 q 4 -14 -5 -26 Z" fill="#A83A31"/>"""


def NELL(pose="stand"):
    b = []
    if pose == "sit":
        b.append(f'<ellipse cx="0" cy="-3" rx="30" ry="7" fill="#050A16" opacity="0.35"/>')
        b.append(f'<path d="M -26 -2 q -3 -34 14 -40 l 24 0 q 14 8 12 40 Z" fill="{COAT}"/>')
        b.append(f'<circle cx="18" cy="-26" r="15" fill="{COAT_DK}"/>')
        b.append(f'<circle cx="6" cy="-30" r="14" fill="{COAT}"/>')
        b.append(f'<rect x="-19" y="-16" width="11" height="9" rx="2" fill="{COAT_DK}"/>')
        b.append(f'<path d="M -6 -40 q 20 -4 26 12" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="21" cy="-28" r="5.5" fill="{MITT}"/>')
        b.append(f'<path d="M 24 -4 l 14 0 l 0 -7 l -14 0 Z" fill="{BOOT}"/>')
        b.append('<g transform="translate(-2,-16)">')
        b.append(f'<path d="M -13 -46 q 13 7 26 0 l 0 8 q -13 7 -26 0 Z" fill="{RED}"/>')
        b.append(_nell_head(-8).replace("translate(0,-78)", "translate(0,-62)"))
        b.append("</g>")
        return "".join(b)

    if pose == "kneel":
        b.append(f'<ellipse cx="4" cy="-2" rx="30" ry="7" fill="#050A16" opacity="0.35"/>')
        b.append(f'<path d="M -14 -3 l 34 0 l 0 -9 l -34 0 Z" fill="{BOOT}"/>')
        b.append(f'<path d="M -20 -10 q -4 -30 12 -36 l 20 0 q 12 8 10 36 Z" fill="{COAT}"/>')
        b.append(f'<rect x="-15" y="-24" width="10" height="8" rx="2" fill="{COAT_DK}"/>')
        b.append(f'<path d="M 2 -44 q 22 4 26 26" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="29" cy="-17" r="5.5" fill="{MITT}"/>')
        b.append('<g transform="translate(0,-22)">')
        b.append(f'<path d="M -13 -40 q 13 7 26 0 l 0 8 q -13 7 -26 0 Z" fill="{RED}"/>')
        b.append(_nell_head(10).replace("translate(0,-78)", "translate(0,-56)"))
        b.append("</g>")
        return "".join(b)

    # upright family: stand / reach / reach_out
    b.append(f'<ellipse cx="0" cy="1" rx="24" ry="6" fill="#050A16" opacity="0.35"/>')
    b.append(f'<path d="M -10 0 l 0 -12 l 8 0 l 0 12 Z" fill="{BOOT}"/>')
    b.append(f'<path d="M 2 0 l 0 -12 l 8 0 l 0 12 Z" fill="{BOOT}"/>')
    b.append(f'<path d="M -17 -8 q -2 -38 5 -52 l 24 0 q 7 14 5 52 Z" fill="{COAT}"/>')
    b.append(f'<rect x="-13" y="-30" width="10" height="8" rx="2" fill="{COAT_DK}"/>')
    b.append(f'<rect x="4" y="-19" width="8" height="7" rx="2" fill="{COAT_DK}"/>')
    if pose == "reach":
        b.append(f'<path d="M 6 -54 q 20 -14 26 -34" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="33" cy="-90" r="5.5" fill="{MITT}"/>')
        b.append(f'<path d="M -6 -54 q -14 8 -16 22" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-23" cy="-30" r="5.5" fill="{MITT}"/>')
    elif pose == "reach_out":
        b.append(f'<path d="M 6 -54 q 20 2 30 -4" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="38" cy="-59" r="5.5" fill="{MITT}"/>')
        b.append(f'<path d="M -6 -54 q -13 10 -14 24" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-21" cy="-28" r="5.5" fill="{MITT}"/>')
    elif pose == "both_up":
        b.append(f'<path d="M 6 -54 q 18 -16 20 -32" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="27" cy="-88" r="5.5" fill="{MITT}"/>')
        b.append(f'<path d="M -6 -54 q -16 -14 -18 -28" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-25" cy="-84" r="5.5" fill="{MITT}"/>')
    else:
        b.append(f'<path d="M 7 -54 q 10 12 8 26" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="16" cy="-26" r="5.5" fill="{MITT}"/>')
        b.append(f'<path d="M -7 -54 q -10 12 -8 26" stroke="{COAT_DK}" stroke-width="9" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-16" cy="-26" r="5.5" fill="{MITT}"/>')
    b.append(_nell_scarf())
    b.append(_nell_head(-4 if pose in ("reach", "both_up") else 0))
    return "".join(b)


def nell(x, y, s=1.0, pose="stand", flip=False):
    f = " scale(-1,1)" if flip else ""
    return (f'<g transform="translate({esc(x)},{esc(y)}) scale({esc(s)})">'
            f'<g transform="{f or "translate(0,0)"}">{NELL(pose)}</g></g>')


def pole(x, y, s=1.0, angle=-34, length=150):
    return (f'<g transform="translate({esc(x)},{esc(y)}) scale({esc(s)}) rotate({esc(angle)})">'
            f'<rect x="0" y="-2.6" width="{esc(length)}" height="5.2" rx="2.6" fill="#B98A3E"/>'
            f'<circle cx="{esc(length+5)}" cy="0" r="7" fill="{AMBER_HOT}" opacity="0.95"/>'
            f'<circle cx="{esc(length+5)}" cy="0" r="15" fill="{AMBER}" opacity="0.35"/></g>')


# ------------------------------------------------------------------ AREN ---
# Canonical: feet at (0,0), crown near y=-132.
def _aren_head(state, tilt=0):
    awake = state == "awake"
    skin = AREN_WARM if awake else AREN_ICE
    hair = AREN_HAIR if awake else "#F0FAFE"
    hair_dk = "#CBD8E8" if awake else "#C4E4F0"
    eye = "#3E4A63" if awake else "#4A7F9B"
    edge = "none" if awake else "#6FA8C2"
    return f"""
<g transform="translate(0,-104) rotate({esc(tilt)})">
  <path d="M -17 -8 q -4 16 -2 22 q 19 4 38 0 q 2 -6 -2 -22 Z" fill="{hair_dk}"/>
  <circle cx="0" cy="0" r="14" fill="{skin}" stroke="{edge}" stroke-width="1.2"/>
  <path d="M -14 -3 q 1 -14 14 -14 q 13 0 14 14 q -4 -9 -13 -9 q -9 0 -11 6
           q -2 4 -4 3 Z" fill="{hair}"/>
  <path d="M -1 -16 q 10 1 13 9 q -6 -5 -14 -4 Z" fill="{hair_dk}"/>
  <circle cx="-5.5" cy="1" r="2" fill="{eye}"/>
  <circle cx="5.5" cy="1" r="2" fill="{eye}"/>
  <path d="M -3 8 q 3 2.5 6 0" stroke="{eye}" stroke-width="1.5" fill="none"
        stroke-linecap="round" opacity="0.75"/>
  <path d="M -12 -8 q 12 -6 24 0" stroke="{FROST}" stroke-width="2.4" fill="none"
        stroke-linecap="round"/>
  <path d="M -6 -9 l -1 -4 M 0 -10.5 l 0 -5 M 6 -9 l 1 -4" stroke="{FROST}"
        stroke-width="2" stroke-linecap="round"/>
</g>"""


def AREN(state="frozen", pose="stride"):
    ice = state != "awake"
    cloak = "#3A5A88" if ice else CLOAK
    cloak_dk = "#2A4570" if ice else CLOAK_DK
    limb = AREN_ICE_DK if ice else "#D9B08C"
    b = []
    b.append('<ellipse cx="0" cy="1" rx="30" ry="7" fill="#050A16" opacity="0.35"/>')
    if pose == "stride":
        b.append(f'<path d="M -22 0 l 12 -4 l 8 -42 l -10 0 Z" fill="{cloak_dk}"/>')
        b.append(f'<path d="M 8 0 l 16 -2 l 2 -44 l -12 0 Z" fill="{cloak_dk}"/>')
    else:
        b.append(f'<path d="M -13 0 l 0 -44 l 10 0 l 0 44 Z" fill="{cloak_dk}"/>')
        b.append(f'<path d="M 3 0 l 0 -44 l 10 0 l 0 44 Z" fill="{cloak_dk}"/>')
    # cloak with torn hem — narrow, so he reads as a slender figure, not a bulky one
    hem = ("M -23 -30 l 5 12 l 6 -10 l 5 13 l 6 -11 l 5 12 l 6 -9 l 5 11 "
           "l 4 -13 l 0 -46 q -10 -18 -21 -18 q -11 0 -21 18 Z")
    b.append(f'<path d="{hem}" transform="translate(-1,-6)" fill="{cloak}"/>')
    b.append(f'<path d="M -8 -84 q 8 26 4 58" stroke="{cloak_dk}" stroke-width="4" '
             f'fill="none" opacity="0.6"/>')
    b.append(f'<path d="M -13 -86 q 13 8 26 0 l 2 10 q -15 9 -30 0 Z" fill="{cloak_dk}"/>')
    if pose == "stride":
        b.append(f'<path d="M 10 -80 q 22 4 34 -4" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="47" cy="-85" r="6" fill="{limb}"/>')
        b.append(f'<path d="M -10 -80 q -14 14 -12 30" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
    elif pose == "hold":
        b.append(f'<path d="M 10 -80 q 20 8 26 20" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="38" cy="-58" r="6" fill="{limb}"/>')
        b.append(f'<path d="M -10 -80 q 16 12 22 26" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round" opacity="0.9"/>')
        b.append(f'<circle cx="14" cy="-52" r="6" fill="{limb}"/>')
    elif pose == "reach_back":
        b.append(f'<path d="M 10 -80 q 24 -2 30 -14" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="43" cy="-96" r="6" fill="{limb}"/>')
        b.append(f'<path d="M -10 -80 q -18 6 -20 22" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-31" cy="-56" r="6" fill="{limb}"/>')
    else:
        b.append(f'<path d="M 10 -80 q 14 16 12 32" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="22" cy="-46" r="6" fill="{limb}"/>')
        b.append(f'<path d="M -10 -80 q -14 16 -12 32" stroke="{limb}" stroke-width="8" '
                 f'fill="none" stroke-linecap="round"/>')
        b.append(f'<circle cx="-22" cy="-46" r="6" fill="{limb}"/>')
    b.append(_aren_head(state, -6 if pose == "stride" else 0))
    return "".join(b)


def aren(x, y, s=1.0, state="frozen", pose="stride", flip=False, ice_from=None, sid=""):
    """ice_from: 0..1 — how far ice has climbed from the feet (partial freeze)."""
    inner = AREN(state, pose)
    body = (f'<g transform="translate({esc(x)},{esc(y)}) scale({esc(s)})">'
            f'<g transform="{"scale(-1,1)" if flip else "translate(0,0)"}">{inner}')
    if state == "frozen":
        # glassy highlights ON the figure — never a bounding box
        rr = R(41)
        for _ in range(13):
            body += (f'<path d="M {esc(rr.u(-20,26))} {esc(rr.u(-118,-14))} l {esc(rr.u(5,11))} '
                     f'{esc(-rr.u(4,9))}" stroke="#FFFFFF" stroke-width="1.8" '
                     f'stroke-linecap="round" opacity="{esc(rr.u(0.25,0.7))}"/>')
        body += (f'<path d="M -20 -34 q 4 -50 10 -74" stroke="#FFFFFF" stroke-width="3.5" '
                 f'fill="none" stroke-linecap="round" opacity="0.35"/>')
    if ice_from:
        # ice climbing the body as crystal shards, following the silhouette
        top = -132 * ice_from
        rr = R(83)
        n = max(5, int(18 * ice_from))
        for k in range(n):
            f = k / max(1, n - 1)
            yy = -4 + (top + 4) * f
            hw = 22 - 9 * f
            body += (f'<polygon points="{esc(-hw)},{esc(yy)} {esc(-hw+rr.u(5,10))},'
                     f'{esc(yy-rr.u(9,20))} {esc(-hw+rr.u(11,18))},{esc(yy)}" '
                     f'fill="{FROST}" opacity="{esc(rr.u(0.45,0.8))}"/>')
            body += (f'<polygon points="{esc(hw)},{esc(yy)} {esc(hw-rr.u(5,10))},'
                     f'{esc(yy-rr.u(9,20))} {esc(hw-rr.u(11,18))},{esc(yy)}" '
                     f'fill="{FROST}" opacity="{esc(rr.u(0.45,0.8))}"/>')
        body += (f'<path d="M -24 -2 q 24 {esc(top*0.35)} 0 {esc(top)} q 24 {esc(-top*0.35)} '
                 f'24 {esc(-top)} l 0 2 Z" fill="{FROST}" opacity="0.28"/>')
        body += (f'<ellipse cx="0" cy="-2" rx="30" ry="9" fill="{FROST}" opacity="0.6"/>')
    return body + "</g></g>"


# ------------------------------------------------------------------ frame ---
def defs(sid, sky, warm=(AMBER, 0.55), extra=""):
    return f"""<defs>
  <linearGradient id="sky{sid}" x1="0" y1="0" x2="0" y2="1">
    {''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in sky)}
  </linearGradient>
  <radialGradient id="warm{sid}">
    <stop offset="0%" stop-color="{warm[0]}" stop-opacity="{warm[1]}"/>
    <stop offset="45%" stop-color="{warm[0]}" stop-opacity="{warm[1]*0.38:.2f}"/>
    <stop offset="100%" stop-color="{warm[0]}" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="glass{sid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="{AMBER_HOT}"/><stop offset="100%" stop-color="{AMBER}"/>
  </linearGradient>
  <radialGradient id="vig{sid}">
    <stop offset="55%" stop-color="#000000" stop-opacity="0"/>
    <stop offset="100%" stop-color="#000814" stop-opacity="0.55"/>
  </radialGradient>
  <filter id="soft{sid}" x="-120%" y="-120%" width="340%" height="340%">
    <feGaussianBlur stdDeviation="7"/>
  </filter>
  <filter id="grain{sid}" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="{sid or 1}"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  {extra}
</defs>"""


def frame(sid, sky, body, warm=(AMBER, 0.55), extra_defs="", grain=0.07):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
            f'width="{W}" height="{H}" role="img">'
            f'{defs(sid, sky, warm, extra_defs)}'
            f'<rect width="{W}" height="{H}" fill="url(#sky{sid})"/>'
            f'{body}'
            f'<rect width="{W}" height="{H}" fill="url(#vig{sid})"/>'
            f'<rect width="{W}" height="{H}" filter="url(#grain{sid})" opacity="{grain}" '
            f'style="mix-blend-mode:overlay"/>'
            f'</svg>')


NIGHT_SKY = [("0%", NIGHT_TOP), ("58%", NIGHT_MID), ("100%", NIGHT_BOT)]
DAWN_SKY = [("0%", "#1B2450"), ("42%", "#6B4E7A"), ("72%", "#D08A6A"), ("100%", "#F6C98A")]
MORNING_SKY = [("0%", "#4E7BAC"), ("48%", "#9FC0DC"), ("100%", "#F5D9AE")]
DUSK_SKY = [("0%", "#2B3E63"), ("46%", "#7C6C8E"), ("78%", "#E0A277"), ("100%", "#F3D3A2")]


# ----------------------------------------------------------------- scenes ---
def scene_01():
    r = R(1)
    b = [stars(r, 130, 520), snowfall(r, 60, 0.4)]
    b.append(treeline(r, 600, 230, TREE_FAR, n=15, op=0.85))
    b.append(drift(r, 612, 12, "#1E2A4A"))
    b.append(treeline(r, 690, 330, TREE_MID, n=10, snow="#3C4E74"))
    b.append(drift(r, 712, 16, SNOW_DEEP, op=0.95))
    b.append(drift(r, 780, 20, SNOW_SHADE))
    b.append(glow(1, 1010, 560, 330, 0.9))
    b.append(drift(r, 838, 18, SNOW))
    b.append(lamp(1, 1010, 848, 0.86))
    b.append(nell(880, 856, 1.45, "reach"))
    b.append(pole(925, 730, 1.35, -44, 118))
    b.append(conifer(r, 150, 900, 470, 210, TREE_NEAR, snow="#2A3A5E"))
    b.append(conifer(r, 1500, 905, 420, 190, TREE_NEAR, snow="#2A3A5E"))
    return frame(1, NIGHT_SKY, "".join(b))


def scene_02():
    r = R(2)
    b = [stars(r, 150, 470), snowfall(r, 45, 0.35)]
    b.append(treeline(r, 560, 260, TREE_FAR, n=13, op=0.8))
    b.append(drift(r, 596, 12, "#1C2747"))
    b.append(treeline(r, 668, 360, TREE_MID, n=9, snow="#3C4E74"))
    b.append(drift(r, 700, 14, SNOW_DEEP))
    # the empty path receding into the trees — a faint trodden trough, no footprints in it
    b.append(f'<path d="M 980 706 q 60 90 300 194 l -560 0 q 180 -104 232 -194 Z" '
             f'fill="#8AA2BE" opacity="0.35"/>')
    b.append(drift(r, 786, 20, SNOW_SHADE))
    b.append(glow(2, 470, 600, 340, 0.95))
    b.append(drift(r, 850, 16, SNOW))
    b.append(lamp(2, 470, 862, 0.92))
    b.append(nell(572, 872, 1.7, "sit"))
    b.append(conifer(r, 1440, 930, 520, 240, TREE_NEAR, snow="#2A3A5E"))
    b.append(conifer(r, 90, 950, 430, 200, TREE_NEAR))
    return frame(2, NIGHT_SKY, "".join(b))


def scene_03():
    r = R(3)
    b = [stars(r, 110, 420)]
    b.append(treeline(r, 600, 300, TREE_FAR, n=11, op=0.75))
    b.append(treeline(r, 700, 400, TREE_MID, n=8, snow="#3C4E74"))
    b.append(drift(r, 740, 16, SNOW_DEEP))
    b.append(drift(r, 812, 18, SNOW_SHADE))
    b.append(glow(3, 400, 560, 400, 1.0))
    b.append(drift(r, 866, 14, SNOW))
    b.append(lamp(3, 360, 884, 1.15))
    # the ice figure standing at the very edge of the light
    b.append(f'<ellipse cx="1000" cy="882" rx="180" ry="34" fill="{FROST}" opacity="0.22"/>')
    b.append(aren(1000, 880, 2.9, "frozen", "stride"))
    rr = R(33)
    for _ in range(26):
        b.append(f'<circle cx="{esc(rr.u(830,1200))}" cy="{esc(rr.u(430,860))}" '
                 f'r="{esc(rr.u(1,2.6))}" fill="{FROST}" opacity="{esc(rr.u(0.3,0.85))}"/>')
    b.append(conifer(r, 1520, 940, 470, 210, TREE_NEAR))
    return frame(3, NIGHT_SKY, "".join(b))


def scene_04():
    r = R(4)
    b = [stars(r, 90, 400)]
    b.append(treeline(r, 620, 320, TREE_FAR, n=10, op=0.7))
    b.append(treeline(r, 720, 420, TREE_MID, n=7, snow="#3C4E74"))
    b.append(drift(r, 780, 16, SNOW_DEEP))
    b.append(glow(4, 700, 520, 470, 1.0))
    b.append(drift(r, 852, 16, SNOW))
    b.append(lamp(4, 240, 886, 0.95))
    b.append(aren(930, 880, 2.5, "frozen", "stride"))
    b.append(nell(700, 884, 2.0, "reach_out"))
    # the blink — a warm spark caught in the ice eye
    b.append(f'<circle cx="{esc(930-13.8)}" cy="{esc(880-2.5*103)}" r="11" fill="{AMBER_HOT}" '
             f'opacity="0.95" filter="url(#soft4)"/>')
    b.append(f'<circle cx="{esc(930-13.8)}" cy="{esc(880-2.5*103)}" r="4" fill="#FFFFFF"/>')
    b.append(conifer(r, 1500, 950, 430, 200, TREE_NEAR))
    return frame(4, NIGHT_SKY, "".join(b))


def scene_05():
    r = R(5)
    b = [stars(r, 100, 430), snowfall(r, 40, 0.3)]
    b.append(treeline(r, 590, 280, TREE_FAR, n=12, op=0.75))
    b.append(treeline(r, 690, 380, TREE_MID, n=8, snow="#3C4E74"))
    b.append(drift(r, 748, 16, SNOW_DEEP))
    b.append(drift(r, 820, 18, SNOW_SHADE))
    b.append(glow(5, 760, 540, 430, 1.0))
    b.append(drift(r, 866, 14, SNOW))
    # the warm circle drawn on the snow — the edge is the whole point of this scene
    b.append(f'<ellipse cx="760" cy="866" rx="330" ry="62" fill="{AMBER}" opacity="0.2"/>')
    b.append(f'<ellipse cx="760" cy="866" rx="330" ry="62" fill="none" stroke="{AMBER_HOT}" '
             f'stroke-width="3" opacity="0.45"/>')
    b.append(lamp(5, 770, 880, 1.05))
    b.append(aren(985, 882, 2.15, "awake", "reach_back"))
    # his trailing hand is past the light's edge — still frost
    b.append(f'<circle cx="{esc(985+43*2.15)}" cy="{esc(882-96*2.15)}" r="18" fill="{FROST}" '
             f'opacity="0.75"/>')
    rr = R(57)
    for _ in range(9):
        b.append(f'<path d="M {esc(985+43*2.15+rr.u(-11,11))} {esc(882-96*2.15+rr.u(-11,11))} '
                 f'l {esc(rr.u(7,15))} {esc(-rr.u(5,12))}" stroke="{FROST}" stroke-width="2.4" '
                 f'stroke-linecap="round" opacity="0.9"/>')
    b.append(nell(600, 886, 1.7, "reach"))
    b.append(pole(639, 740, 1.55, -40, 104))
    b.append(conifer(r, 110, 950, 460, 215, TREE_NEAR))
    return frame(5, NIGHT_SKY, "".join(b))


def scene_06():
    r = R(6)
    ice_grad = ('<linearGradient id="ice6" x1="0" y1="0" x2="0" y2="1">'
                '<stop offset="0%" stop-color="#6E9DC0"/>'
                '<stop offset="45%" stop-color="#3D6A93"/>'
                '<stop offset="100%" stop-color="#1B3A5C"/></linearGradient>')
    b = [stars(r, 190, 500)]
    b.append(f'<circle cx="1300" cy="150" r="46" fill="#E8F0FA" opacity="0.92"/>')
    b.append(f'<circle cx="1300" cy="150" r="110" fill="#E8F0FA" opacity="0.1"/>')
    b.append(treeline(r, 540, 200, TREE_FAR, n=17, op=0.8))
    b.append(drift(r, 552, 10, "#1D2848"))
    b.append(treeline(r, 596, 240, TREE_MID, n=12, snow="#3C4E74", op=0.95))
    # the river fills the lower two-thirds
    b.append(f'<path d="M -40 616 L {W+40} 600 L {W+40} {H+40} L -40 {H+40} Z" fill="url(#ice6)"/>')
    # moonlight running down the ice toward us
    b.append(f'<path d="M 1268 606 l 74 0 l 210 294 l -420 0 Z" fill="#DCEBF7" opacity="0.13"/>')
    # drowned bells sleeping under the surface — bigger and darker so they read
    for bx, by_, bs, op in ((360, 830, 2.5, 0.58), (640, 712, 1.5, 0.42),
                            (1010, 792, 2.1, 0.5), (1300, 690, 1.2, 0.34),
                            (196, 690, 1.3, 0.36)):
        b.append(f'<g transform="translate({bx},{by_}) scale({bs})" opacity="{op}">'
                 f'<path d="M -34 26 q 0 -56 34 -56 q 34 0 34 56 Z" fill="#08121F"/>'
                 f'<rect x="-40" y="24" width="80" height="10" rx="5" fill="#08121F"/>'
                 f'<circle cx="0" cy="42" r="8" fill="#08121F"/>'
                 f'<rect x="-3" y="-38" width="6" height="12" fill="#08121F"/>'
                 f'<path d="M -24 -10 q 10 -22 24 -22" stroke="#7FA8C6" stroke-width="4" '
                 f'fill="none" opacity="0.5"/></g>')
    # surface: sheen, scratches, a few frozen bubbles
    rr = R(61)
    for _ in range(26):
        y0 = rr.u(630, 890)
        b.append(f'<path d="M {esc(rr.u(-20,1400))} {esc(y0)} l {esc(rr.u(110,300))} '
                 f'{esc(rr.u(-8,8))}" stroke="#FFFFFF" stroke-width="2" opacity="0.16"/>')
    for _ in range(30):
        b.append(f'<circle cx="{esc(rr.u(0,W))}" cy="{esc(rr.u(640,890))}" '
                 f'r="{esc(rr.u(2,6))}" fill="#CFE6F5" opacity="{esc(rr.u(0.1,0.3))}"/>')
    b.append(f'<path d="M -40 616 L {W+40} 600 L {W+40} 640 L -40 660 Z" fill="#FFFFFF" opacity="0.2"/>')
    # the two of them out on the ice, looking down through it
    b.append(f'<ellipse cx="880" cy="726" rx="210" ry="34" fill="{AMBER}" opacity="0.13"/>')
    b.append(aren(936, 726, 1.7, "awake", "stand"))
    b.append(nell(838, 730, 1.35, "stand"))
    # near bank, foreground left: the one green thing in the wood
    b.append(f'<path d="M -40 812 q 210 -70 430 -22 l 40 150 l -510 0 Z" fill="{SNOW_SHADE}"/>')
    b.append(f'<path d="M -40 826 q 200 -62 410 -18 l 6 26 q -206 -46 -416 16 Z" fill="{SNOW}"/>')
    b.append(f'<circle cx="212" cy="836" r="120" fill="{MOSS}" opacity="0.2"/>')
    b.append(f'<path d="M 96 828 q 56 -46 120 -14 l 62 44 l -196 12 Z" fill="{SNOW}"/>')
    b.append(f'<ellipse cx="228" cy="852" rx="78" ry="26" fill="{MOSS}"/>')
    b.append(f'<ellipse cx="222" cy="846" rx="52" ry="16" fill="#7FB061"/>')
    rr2 = R(66)
    for _ in range(26):
        b.append(f'<circle cx="{esc(228+rr2.u(-70,70))}" cy="{esc(852+rr2.u(-18,14))}" '
                 f'r="{esc(rr2.u(2,5))}" fill="#93C471" opacity="{esc(rr2.u(0.4,0.9))}"/>')
    b.append(conifer(r, 1530, 940, 420, 195, TREE_NEAR))
    return frame(6, NIGHT_SKY, "".join(b), warm=(AMBER, 0.5), extra_defs=ice_grad)


def scene_07():
    r = R(7)
    b = [stars(r, 80, 380)]
    b.append(treeline(r, 600, 300, TREE_FAR, n=11, op=0.7))
    b.append(treeline(r, 690, 380, TREE_MID, n=8, snow="#3C4E74"))
    b.append(drift(r, 760, 16, SNOW_DEEP))
    b.append(glow(7, 800, 560, 460, 1.0))
    b.append(drift(r, 838, 16, SNOW))
    # the little stone hut
    b.append(f'<path d="M 1120 880 l 0 -180 l 250 0 l 0 180 Z" fill="#3A4560"/>')
    b.append(f'<path d="M 1092 704 l 153 -104 l 153 104 Z" fill="#2A3348"/>')
    b.append(f'<path d="M 1092 704 l 153 -104 l 153 104 Z" fill="{SNOW}" opacity="0.22"/>')
    b.append(f'<rect x="1300" y="560" width="34" height="70" fill="#2A3348"/>')
    b.append(f'<rect x="1178" y="762" width="72" height="118" rx="6" fill="{AMBER}" opacity="0.75"/>')
    b.append(f'<rect x="1178" y="762" width="72" height="118" rx="6" fill="none" stroke="#2A3348" stroke-width="7"/>')
    rr = R(71)
    for _ in range(26):
        b.append(f'<rect x="{esc(rr.u(1124,1350))}" y="{esc(rr.u(710,870))}" '
                 f'width="{esc(rr.u(20,44))}" height="{esc(rr.u(12,20))}" rx="4" '
                 f'fill="#46536F" opacity="0.55"/>')
    b.append(lamp(7, 800, 872, 0.92))
    # the pile she is feeding it: books and a wooden shoe, mid-air
    b.append(f'<g transform="translate(742,690) rotate(-18)">'
             f'<rect x="0" y="0" width="52" height="14" rx="2" fill="#8C4A3A"/>'
             f'<rect x="0" y="2" width="52" height="4" fill="#E4D9C2"/></g>')
    b.append(f'<g transform="translate(700,742) rotate(24)">'
             f'<rect x="0" y="0" width="46" height="13" rx="2" fill="#5E6B8C"/>'
             f'<rect x="0" y="2" width="46" height="4" fill="#E4D9C2"/></g>')
    b.append(f'<g transform="translate(806,700) rotate(12)">'
             f'<path d="M 0 12 q 4 -16 22 -14 l 20 2 q 8 6 -2 14 Z" fill="#A87C4A"/></g>')
    b.append(f'<circle cx="800" cy="600" r="26" fill="{AMBER_HOT}" opacity="0.6" filter="url(#soft7)"/>')
    rr2 = R(72)
    for _ in range(22):
        b.append(f'<circle cx="{esc(rr2.u(720,880))}" cy="{esc(rr2.u(430,660))}" '
                 f'r="{esc(rr2.u(1.5,4))}" fill="{AMBER_HOT}" opacity="{esc(rr2.u(0.3,0.9))}"/>')
    b.append(aren(986, 886, 1.85, "awake", "stand"))
    b.append(nell(620, 890, 1.75, "reach_out"))
    b.append(conifer(r, 120, 960, 480, 220, TREE_NEAR))
    return frame(7, NIGHT_SKY, "".join(b))


def scene_08():
    r = R(8)
    b = [stars(r, 150, 470), snowfall(r, 130, 0.7)]
    b.append(treeline(r, 590, 300, TREE_FAR, n=12, op=0.6))
    b.append(treeline(r, 690, 390, TREE_MID, n=8, snow="#2E3D5E", op=0.9))
    b.append(drift(r, 762, 16, "#7F97B4"))
    b.append(glow(8, 560, 570, 300, 0.6))
    b.append(drift(r, 846, 16, SNOW_SHADE))
    b.append(lamp(8, 560, 884, 1.1, frost=0.62, dim=0.45))
    b.append(aren(930, 888, 2.1, "awake", "reach_back", ice_from=0.55))
    b.append(nell(720, 892, 1.75, "reach_out"))
    # frost creeping across the ground toward them
    rr = R(88)
    for _ in range(34):
        x0, y0 = rr.u(560, 1200), rr.u(800, 895)
        b.append(f'<path d="M {esc(x0)} {esc(y0)} l {esc(rr.u(20,60))} {esc(rr.u(-14,14))}" '
                 f'stroke="{FROST}" stroke-width="{esc(rr.u(1.5,3.2))}" stroke-linecap="round" '
                 f'opacity="{esc(rr.u(0.25,0.7))}"/>')
    b.append(conifer(r, 1490, 960, 470, 215, TREE_NEAR))
    return frame(8, NIGHT_SKY, "".join(b), warm=(AMBER, 0.42))


def scene_09():
    r = R(9)
    b = [stars(r, 200, 560), snowfall(r, 90, 0.5)]
    b.append(treeline(r, 600, 320, "#151E38", n=11, op=0.55))
    b.append(treeline(r, 700, 400, "#0D1428", n=8, op=0.9))
    b.append(drift(r, 772, 16, "#6E86A6"))
    b.append(drift(r, 848, 16, "#8FA6C2"))
    b.append(lamp(9, 390, 888, 1.05, lit=False, frost=0.95))
    # one small spark in the moss — the only warm thing left in the frame
    b.append(glow(9, 815, 838, 200, 0.95))
    b.append(f'<ellipse cx="815" cy="856" rx="40" ry="14" fill="{MOSS}"/>')
    b.append(f'<circle cx="815" cy="844" r="11" fill="{AMBER_HOT}" filter="url(#soft9)"/>')
    b.append(f'<circle cx="815" cy="844" r="4" fill="#FFFFFF"/>')
    b.append(aren(1010, 886, 2.05, "awake", "hold", ice_from=0.72))
    b.append(nell(830, 890, 1.9, "kneel"))
    rr = R(99)
    for _ in range(10):
        b.append(f'<circle cx="{esc(815+rr.u(-40,40))}" cy="{esc(800-rr.u(0,80))}" '
                 f'r="{esc(rr.u(1.4,3.4))}" fill="{AMBER_HOT}" opacity="{esc(rr.u(0.3,0.85))}"/>')
    b.append(conifer(r, 1520, 980, 500, 230, "#070C18"))
    b.append(conifer(r, 80, 990, 460, 215, "#070C18"))
    return frame(9, DAWN_SKY[:1] + NIGHT_SKY[1:], "".join(b), warm=(AMBER, 0.6), grain=0.09)


def scene_10():
    r = R(10)
    b = []
    b.append(f'<circle cx="1180" cy="330" r="120" fill="#FFE9B8" opacity="0.5" filter="url(#soft10)"/>')
    b.append(f'<circle cx="1180" cy="330" r="58" fill="#FFF3D2" opacity="0.95"/>')
    # far ridges
    b.append(f'<path d="M -40 470 q 260 -120 520 -50 q 300 80 560 -70 q 300 -170 600 -20 '
             f'l 0 620 l -1680 0 Z" fill="#5A4A76" opacity="0.9"/>')
    b.append(f'<path d="M -40 560 q 300 -110 620 -30 q 320 80 620 -60 q 200 -90 440 -10 '
             f'l 0 520 l -1680 0 Z" fill="#3E3A63"/>')
    # the lion, distant silhouette on the ridge
    b.append(lion(1108, 486, 1.05))
    b.append(f'<circle cx="1188" cy="418" r="180" fill="#FFD79A" opacity="0.2" filter="url(#soft10)"/>')
    # the valley of ice below, splitting
    b.append(f'<path d="M -40 640 L {W+40} 618 L {W+40} {H+40} L -40 {H+40} Z" fill="#A9C4DC"/>')
    b.append(f'<path d="M -40 640 L {W+40} 618 L {W+40} 760 L -40 786 Z" fill="{SNOW}" opacity="0.7"/>')
    rr = R(110)
    for _ in range(9):
        x, y = rr.u(-40, 1500), rr.u(660, 890)
        d = f"M {esc(x)} {esc(y)}"
        for _ in range(7):
            x += rr.u(50, 130)
            y += rr.u(-34, 34)
            d += f" L {esc(x)} {esc(y)}"
        b.append(f'<path d="{d}" stroke="#4A6E90" stroke-width="{esc(rr.u(2.5,6))}" '
                 f'fill="none" opacity="0.8" stroke-linecap="round"/>')
    b.append(treeline(r, 700, 190, "#2E3A5C", n=18, op=0.85, jitter=0.3))
    b.append(glow(10, 300, 690, 150, 0.85))
    b.append(lamp(10, 300, 726, 0.42))
    b.append(f'<g opacity="0.95">{aren(430, 730, 0.5, "awake", "stand")}</g>')
    b.append(f'<g opacity="0.95">{nell(392, 732, 0.42, "stand")}</g>')
    b.append(conifer(r, 90, 940, 430, 200, "#1B2540", snow="#5A6C8E"))
    b.append(conifer(r, 1530, 950, 400, 190, "#1B2540", snow="#5A6C8E"))
    return frame(10, DAWN_SKY, "".join(b), warm=(AMBER, 0.5))


def scene_11():
    r = R(11)
    b = []
    b.append(f'<circle cx="1120" cy="250" r="150" fill="#FFF0C8" opacity="0.55" filter="url(#soft11)"/>')
    b.append(f'<circle cx="1120" cy="250" r="70" fill="#FFFAE8" opacity="0.95"/>')
    b.append(treeline(r, 620, 300, "#6F89A6", n=13, op=0.7))
    b.append(treeline(r, 720, 400, "#3E566F", n=9, op=0.92))
    # sun shafts through the thawing trees
    rr = R(112)
    for _ in range(9):
        x = rr.u(300, 1500)
        b.append(f'<path d="M {esc(x)} 120 l {esc(rr.u(60,150))} 0 l {esc(-rr.u(180,340))} 780 '
                 f'l {esc(-rr.u(50,120))} 0 Z" fill="#FFE9B8" opacity="{esc(rr.u(0.03,0.08))}"/>')
    b.append(drift(r, 780, 18, "#B9CFE2"))
    b.append(drift(r, 846, 16, "#F2F7FB"))
    # meltwater patches showing wet dark ground
    for cx, cy, rx in ((330, 862, 96), (700, 886, 130), (1210, 870, 110)):
        b.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{esc(rx*0.2)}" fill="#5E6E63" opacity="0.5"/>')
    b.append(glow(11, 860, 560, 440, 0.55))
    b.append(aren(925, 884, 2.35, "awake", "hold"))
    b.append(nell(700, 890, 1.95, "reach_out"))
    # drips
    for _ in range(20):
        x, y = rr.u(200, 1500), rr.u(300, 640)
        b.append(f'<ellipse cx="{esc(x)}" cy="{esc(y)}" rx="2.4" ry="7" fill="#DFF1FA" '
                 f'opacity="{esc(rr.u(0.4,0.9))}"/>')
    b.append(conifer(r, 120, 960, 470, 215, "#3E5670", snow="#EAF2F8"))
    b.append(conifer(r, 1510, 970, 440, 205, "#3E5670", snow="#EAF2F8"))
    return frame(11, MORNING_SKY, "".join(b), warm=(AMBER, 0.42))


def scene_12():
    r = R(12)
    b = [stars(r, 60, 240, op=0.6)]
    b.append(f'<circle cx="250" cy="210" r="42" fill="#FFF6DC" opacity="0.85"/>')
    b.append(treeline(r, 600, 260, "#3F5C4A", n=14, op=0.8))
    b.append(treeline(r, 690, 350, "#2C4437", n=9, op=0.95))
    # spring ground
    b.append(drift(r, 740, 14, "#4A6E4A"))
    b.append(drift(r, 806, 18, "#5C8A4A"))
    b.append(drift(r, 866, 14, "#6E9C58"))
    b.append(glow(12, 900, 560, 400, 0.95))
    b.append(lamp(12, 918, 880, 1.05))
    # snowdrops carpeting the wood
    rr = R(121)
    for _ in range(150):
        x, y = rr.u(-20, W + 20), rr.u(724, 900)
        s = rr.u(0.5, 1.15) * (0.6 + (y - 700) / 300)
        b.append(f'<g transform="translate({esc(x)},{esc(y)}) scale({esc(s)})">'
                 f'<path d="M 0 0 l 0 -14" stroke="#3E6B3E" stroke-width="2"/>'
                 f'<path d="M -5 -14 q 5 -12 10 0 q -5 7 -10 0 Z" fill="#F4FAFF"/>'
                 f'<circle cx="0" cy="-16" r="2.4" fill="#FFFFFF"/></g>')
    b.append(aren(1046, 886, 1.95, "awake", "reach_back", flip=True))
    b.append(nell(792, 890, 1.7, "both_up"))
    b.append(pole(838, 748, 1.5, -50, 92))
    b.append(conifer(r, 110, 960, 470, 215, "#1E3327"))
    b.append(conifer(r, 1520, 970, 430, 200, "#1E3327"))
    return frame(12, DUSK_SKY, "".join(b))


SCENES = [scene_01, scene_02, scene_03, scene_04, scene_05, scene_06,
          scene_07, scene_08, scene_09, scene_10, scene_11, scene_12]


def main():
    out = ROOT / "svg"
    out.mkdir(exist_ok=True)
    reg = []
    for i, fn in enumerate(SCENES, start=1):
        svg = fn()
        p = out / f"{SLUG}_part_{i:02d}.svg"
        p.write_text(svg)
        reg.append({"index": i, "file": p.name, "bytes": len(svg)})
        print(f"  {p.name}  {len(svg):>7,} bytes")
    (ROOT / f"{SLUG}_images.json").write_text(json.dumps(
        {"story_slug": SLUG, "renderer": "vector-svg", "aspect_ratio": "16:9",
         "width": W, "height": H, "shots": reg}, indent=2))
    print(f"\n{len(reg)} scenes -> {out}")


if __name__ == "__main__":
    main()
