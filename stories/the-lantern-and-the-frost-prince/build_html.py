#!/usr/bin/env python3
"""Packages scenes.json + the 12 SVGs into one self-contained storybook.

Writes two files from the same content:
  {slug}.html          full standalone document (double-click to read, share as-is)
  {slug}_artifact.html body-only fragment for publishing as an Artifact
Stdlib only. No external assets, no network — the SVGs are inlined as markup.
"""
import html
import json
import pathlib
import re

SLUG = "the-lantern-and-the-frost-prince"
ROOT = pathlib.Path(__file__).resolve().parent

scenes = json.loads((ROOT / f"{SLUG}_scenes.json").read_text())
TITLE = scenes["story_title"]

CSS = """
:root{
  --night:#0B1020; --panel:#141C33; --ink:#F2E9D8; --ink-dim:#A9B6CC;
  --amber:#F4B03C; --amber-hot:#FFE6A8; --frost:#9FD6E8; --edge:#2A3A5E;
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--night); color:var(--ink);
  font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,"Times New Roman",serif;
  min-height:100vh; display:flex; flex-direction:column; align-items:center;
  -webkit-font-smoothing:antialiased;
}
.wrap{width:100%; max-width:1120px; padding:18px 18px 0; flex:1;
      display:flex; flex-direction:column}
header{display:flex; align-items:baseline; justify-content:space-between; gap:12px;
       padding-bottom:14px}
h1{font-size:clamp(17px,2.4vw,23px); font-weight:600; letter-spacing:.02em; margin:0;
   color:var(--ink); text-wrap:balance}
.counter{font-size:13px; color:var(--ink-dim); font-variant-numeric:tabular-nums;
         white-space:nowrap}
.stage{position:relative; aspect-ratio:16/9; border-radius:14px; margin:0 auto;
       width:min(100%, calc((100dvh - 330px) * 16 / 9));
       overflow:hidden; background:var(--panel); border:1px solid var(--edge);
       box-shadow:0 22px 60px rgba(0,0,0,.55); touch-action:pan-y}
.slide{position:absolute; inset:0; opacity:0; visibility:hidden;
       transition:opacity .42s ease}
.slide.on{opacity:1; visibility:visible}
.slide svg{width:100%; height:100%; display:block; isolation:isolate}
.endcard{position:absolute; inset:0; display:flex; flex-direction:column;
         align-items:center; justify-content:center; gap:20px;
         background:radial-gradient(circle at 50% 45%,#243459,#0B1020 72%)}
.endcard p{font-size:clamp(26px,4.4vw,44px); margin:0; letter-spacing:.06em;
           color:var(--amber-hot)}
.again{font:inherit; font-size:15px; color:var(--night); background:var(--amber);
       border:0; border-radius:999px; padding:11px 26px; cursor:pointer}
.again:hover{background:var(--amber-hot)}
.tap{position:absolute; top:0; bottom:0; width:34%; border:0; background:transparent;
     cursor:pointer; -webkit-tap-highlight-color:transparent}
.tap.prev{left:0} .tap.next{right:0}
.caption{min-height:118px; flex:1; display:flex; align-items:center;
         justify-content:center; padding:22px 8px 6px}
.caption p{margin:0; max-width:60ch; text-align:center; text-wrap:pretty;
           font-size:clamp(16px,2.05vw,21px); line-height:1.62; color:var(--ink)}
.caption p.title-line{font-size:clamp(23px,3.6vw,34px); line-height:1.3; color:var(--amber-hot)}
.caption p.title-line small{display:block; margin-top:12px; font-size:15px;
                            color:var(--ink-dim); letter-spacing:.14em; text-transform:uppercase}
footer{width:100%; max-width:1120px; padding:6px 18px 24px; display:flex;
       align-items:center; justify-content:center; gap:16px; flex-wrap:wrap}
.nav{font:inherit; font-size:15px; color:var(--ink); background:transparent;
     border:1px solid var(--edge); border-radius:999px; padding:8px 20px; cursor:pointer;
     min-width:104px}
.nav:hover:not(:disabled){border-color:var(--amber); color:var(--amber-hot)}
.nav:disabled{opacity:.3; cursor:default}
.dots{display:flex; gap:7px; flex-wrap:wrap; justify-content:center; max-width:420px}
.dot{width:9px; height:9px; border-radius:50%; border:0; padding:0; cursor:pointer;
     background:#33456E}
.dot.on{background:var(--amber)}
.dot.seen{background:#5E769F}
@media (max-width:620px){
  .wrap{padding:12px 12px 0}
  .stage{width:min(100%, calc((100dvh - 300px) * 16 / 9))}
  .caption{min-height:140px; padding:16px 4px 4px}
  .dots{order:3; width:100%; max-width:none; margin-top:4px}
  .nav{flex:1}
  .nav{min-width:0; padding:8px 14px}
  footer{gap:10px; padding:4px 12px 18px}
}
:focus-visible{outline:2px solid var(--amber); outline-offset:3px; border-radius:4px}
.tap:focus-visible{outline-offset:-4px}
@media (prefers-reduced-motion:reduce){ .slide{transition:none} }
"""

JS = """
(function(){
  var slides=[].slice.call(document.querySelectorAll('.slide'));
  var caps=[].slice.call(document.querySelectorAll('.cap'));
  var dots=[].slice.call(document.querySelectorAll('.dot'));
  var counter=document.getElementById('counter');
  var prevB=document.getElementById('prev'), nextB=document.getElementById('next');
  var n=slides.length, i=0;
  function show(k){
    i=Math.max(0,Math.min(n-1,k));
    slides.forEach(function(s,j){ s.classList.toggle('on',j===i); });
    caps.forEach(function(c,j){ c.hidden = j!==i; });
    dots.forEach(function(d,j){
      d.classList.toggle('on',j===i);
      d.classList.toggle('seen',j<i);
      d.setAttribute('aria-current', j===i ? 'true':'false');
    });
    prevB.disabled = i===0; nextB.disabled = i===n-1;
    counter.textContent = i===0 ? 'Cover'
      : (i===n-1 ? 'The End' : i + ' / ' + (n-2));
  }
  prevB.onclick=function(){show(i-1)}; nextB.onclick=function(){show(i+1)};
  dots.forEach(function(d,j){ d.onclick=function(){show(j)} });
  document.querySelectorAll('.tap.prev').forEach(function(b){b.onclick=function(){show(i-1)}});
  document.querySelectorAll('.tap.next').forEach(function(b){b.onclick=function(){show(i+1)}});
  var again=document.getElementById('again'); if(again) again.onclick=function(){show(0)};
  document.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'||e.key===' '){show(i+1); e.preventDefault();}
    else if(e.key==='ArrowLeft'){show(i-1); e.preventDefault();}
    else if(e.key==='Home'){show(0);} else if(e.key==='End'){show(n-1);}
  });
  var x0=null,y0=null;
  var stage=document.querySelector('.stage');
  stage.addEventListener('touchstart',function(e){
    x0=e.changedTouches[0].clientX; y0=e.changedTouches[0].clientY;},{passive:true});
  stage.addEventListener('touchend',function(e){
    if(x0===null)return;
    var dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0;
    if(Math.abs(dx)>44 && Math.abs(dx)>Math.abs(dy)) show(dx<0 ? i+1 : i-1);
    x0=null;},{passive:true});
  show(0);
})();
"""


def inline_svg(path, suffix=""):
    """Inline one scene. `suffix` re-namespaces the defs IDs so the same scene can
    appear twice in one document (the cover reuses scene 1) without ID collisions."""
    s = path.read_text()
    s = re.sub(r'\s(width|height)="\d+"', "", s, count=2)
    s = s.replace("<svg ", '<svg preserveAspectRatio="xMidYMid slice" aria-hidden="true" ', 1)
    if suffix:
        for i in sorted(set(re.findall(r'id="([^"]+)"', s)), key=len, reverse=True):
            s = s.replace(f'id="{i}"', f'id="{i}{suffix}"')
            s = s.replace(f"url(#{i})", f"url(#{i}{suffix})")
    return s


def build():
    svg_dir = ROOT / "svg"
    slides, caps, dots = [], [], []

    def add(inner, caption_html, label):
        k = len(slides)
        nav = ('<button class="tap prev" aria-label="Previous page"></button>'
               '<button class="tap next" aria-label="Next page"></button>')
        slides.append(f'<div class="slide" role="group" aria-label="{label}">{inner}{nav}</div>')
        caps.append(f'<div class="cap"{" hidden" if k else ""}>{caption_html}</div>')
        dots.append(f'<button class="dot" aria-label="Go to {label}"></button>')

    # cover — the first illustration clean, title beneath it
    cover = inline_svg(svg_dir / f"{SLUG}_part_01.svg", suffix="c")
    add(cover,
        f'<p class="title-line">{html.escape(TITLE)}'
        f'<small>a story of narnia</small></p>', "Cover")

    for sc in scenes["scenes"]:
        svg = inline_svg(svg_dir / f"{SLUG}_part_{sc['index']:02d}.svg")
        add(svg, f'<p>{html.escape(sc["text"])}</p>', f"Page {sc['index']}")

    add('<div class="endcard"><p>The End</p>'
        '<button class="again" id="again">Read again</button></div>',
        '<p></p>', "The End")

    body = f"""<div class="wrap">
  <header>
    <h1>{html.escape(TITLE)}</h1>
    <span class="counter" id="counter" aria-live="polite">Cover</span>
  </header>
  <div class="stage">{''.join(slides)}</div>
  <div class="caption">{''.join(caps)}</div>
</div>
<footer>
  <button class="nav" id="prev">&#8592; Back</button>
  <div class="dots">{''.join(dots)}</div>
  <button class="nav" id="next">Next &#8594;</button>
</footer>"""

    frag = f"<title>{html.escape(TITLE)}</title>\n<style>{CSS}</style>\n{body}\n<script>{JS}</script>"
    (ROOT / f"{SLUG}_artifact.html").write_text(frag)

    full = (f"<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            f"<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            f"<title>{html.escape(TITLE)}</title>\n<style>{CSS}</style>\n</head>\n"
            f"<body>\n{body}\n<script>{JS}</script>\n</body>\n</html>\n")
    out = ROOT / f"{SLUG}.html"
    out.write_text(full)

    (ROOT / f"{SLUG}_story.json").write_text(json.dumps({
        "story_slug": SLUG, "story_title": TITLE, "language": "en",
        "pages": len(slides), "scenes": scenes["total_scenes"],
        "renderer": "vector-svg", "audio": None,
        "output": {"html": out.name, "bytes": len(full)},
    }, indent=2))

    print(f"{out.name}  {len(full)/1024:.0f} KB  ({len(slides)} pages)")


if __name__ == "__main__":
    build()
