# Visual Bible — The Lantern and the Frost Prince

**Aspect ratio:** 16:9 · **Model:** `nano-banana-lite` (Pixa) · **Scenes:** 12

## Style block (prepended to every prompt)

Children's picture-book illustration in warm gouache: soft painted edges, visible brush texture,
hand-painted grain. Not photorealistic, not a 3D render. No text, letters, words, signatures or
watermarks anywhere in the image. Cinematic wide composition with generous negative space.

**Palette**

| Role | Hex |
|---|---|
| Midnight night sky | `#16203D` |
| Snow white | `#EDF2F7` |
| Lamp flame amber | `#F4B03C` |
| Frost cyan | `#9FD6E8` |
| Moss green | `#5C8A4A` |
| Nell's scarf red | `#C0453B` |

**Lighting rule (the spine of the whole book).** There is exactly ONE warm light source — the lamp
flame. Everything inside its golden circle is warm; everything outside is cold blue midnight. As the
story turns, the circle shrinks (scenes 8–9) and then the sun replaces it (scenes 10–12).

## Characters

**NELL** — a 12-year-old girl, small and round-cheeked, warm light-brown skin, freckles across her
nose, dark curly hair in two short braids under a knitted rust-red woollen cap, wide dark-brown eyes,
a patched moss-green wool coat several sizes too big for her, a long red scarf, brown mittens, worn
leather boots. She carries a long brass lamplighter's pole with a small flame at its tip.

**AREN — frozen state** — a tall slender young man of about eighteen made of clear pale-blue ice,
translucent and glassy, long silver-white hair frozen in mid-motion, a thin delicate circlet of clear
ice on his brow, a deep-blue traveller's cloak with a torn hem, high boots, rimed with white frost.

**AREN — awake state** — the same young man but warm and alive: fair skin, kind grey eyes, long
silver-white hair, the thin ice circlet, the deep-blue torn cloak, high boots.

**THE LION** (scene 10 only) — a great golden lion seen only as a distant silhouette on a far ridge
at sunrise. Never close, never detailed.

## Locations

- **The lamp-post** — a single black iron Victorian lamp-post with a warm amber flame in its glass,
  alone among snow-laden birch and fir trees. The anchor object of the entire book.
- **The frozen river** — a wide sheet of pale blue-green ice under stars, with dark old bells
  resting far beneath the surface.
- **Nell's hut** — a tiny crooked stone hut with a bent chimney, half buried in snow.

## Reference cascade (how consistency is held)

No dedicated reference plates — the credit budget doesn't allow them. Instead three anchors are
generated first and then passed as attachments to every later scene:

| Anchor | Generated | Locks |
|---|---|---|
| Scene 1 | text-only | Nell's design, the lamp-post, the whole painted style |
| Scene 3 | refs: [1] | Aren's frozen state |
| Scene 5 | refs: [1, 3] | Aren's awake state |

Every remaining scene attaches scene 1 plus whichever Aren anchor matches its `aren_state`.
