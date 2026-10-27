---
name: dither-html
description: Add dithered effects (Bayer/halftone/pixel textures, animated backgrounds such as aurora, plasma, beams, starfield, retro grid, silk, smoke, contours) to any plain HTML page, single-file HTML artifact, study page or static site, with no React or build step. Use when the user wants a dither, dithered background, pixel or halftone texture, or "เอฟเฟกต์ dither / ลาย dither" in an HTML file, or asks to add one of the dithercn backgrounds to a page that isn't a React app.
---

# dither-html

`assets/dither.js` is a dependency-free port of the dithercn engine: a GLSL field returns a tone from 0 (paper) to 1 (ink), and the engine draws it as ordered dither dots in the page's colours on WebGL, handling resizing, offscreen pausing, light/dark and reduced motion. It ships 33 presets, 22 of them ported from dithercn's background components. For a React + shadcn app, use the `dithercn` skill instead.

## 1. Pick the effect

Read [references/presets.md](references/presets.md) and match the request to a preset by what it looks like. Change a preset's knobs with `data-uniforms` before writing a new field. Write your own field only when nothing in the catalogue is close; see "Custom field" below.

Done when every effect in the request has a preset (with any knob changes) or a planned custom field.

## 2. Add the engine to the page

Read `assets/dither.js` and include it once per page, just before `</body>`:

- **Single-file HTML or an artifact**: paste the file's full contents into one inline `<script>`. Copy it exactly; never retype, summarise or "simplify" it. To save size you may delete preset entries the page doesn't use from `var PRESETS = { ... }`, each from its `"name": {` line through its closing `},`, and nothing else.
- **A site with several files**: copy `assets/dither.js` next to the page and load it with `<script src="dither.js"></script>`.

Done when the page loads the engine exactly once.

## 3. Place the effect

Give an element a size and a `data-dither` attribute. The engine prepends an absolutely positioned canvas to it (and sets `position: relative` if the element is static), so lift the content above it:

```html
<section class="hero" data-dither="aurora" data-cell="3">
  <h1>Headline</h1>
</section>
```

```css
.hero { min-height: 60vh; display: grid; place-items: center; }
.hero > :not(canvas) { position: relative; z-index: 1; }
```

| Attribute | Default | Use |
| --- | --- | --- |
| `data-dither` | `aurora` | Preset name, or `#id` of a `<script type="x-shader/x-field">` |
| `data-preset` | none | With a custom field: the preset whose palette, uniforms and timing it borrows |
| `data-uniforms` | preset's | JSON of uniform overrides, e.g. `'{"plasmaBands": 3}'` |
| `data-ink` / `data-paper` | `--dither-ink` / `--dither-paper` | Recolour this effect; preset palettes derive their middle steps from these |
| `data-palette` | preset's | Whole palette, paper to ink, separated by `\|`: `"--dither-paper \| blue \| ink"` |
| `data-cell` | `3` | Cell size in CSS px. 2–3 texture, 4–6 pixel look, 8+ pixel art |
| `data-speed` | `1` | Time multiplier; `0` for a still image |
| `data-still` | preset's | Time shown when still or under reduced motion |
| `data-matrix` | preset's | `bayer2`, `bayer4`, `bayer8` or `blue-noise` |
| `data-levels` | matrix steps + 1 | Tone steps, 2 to 256 |

Done when each effect has its element, size and content layer.

## 4. Colour it

Define the ink and paper once, for both themes, so every effect follows light and dark:

```css
:root { --dither-ink: #16181b; --dither-paper: transparent; }
@media (prefers-color-scheme: dark) { :root { --dither-ink: #e4e7ec; } }
```

Unset, ink falls back to the text colour and paper to transparent (the page background shows through). Use the page's existing accent or text tokens rather than new literal colours; reach for `data-palette` only when the user wants specific colours. Named colours `blue`, `purple`, `green`, `pink`, `orange`, `red`, `grey` work in palettes.

Done when the effect reads in both light and dark mode.

## 5. Keep text readable

Text over a dither needs clear ground: 4.5:1 contrast or better.

- Place text where the preset is sparse (aurora and beams leave open sky; glow and vignette leave a clear centre), or lower its strength with an intensity knob where it has one (`auroraHeight`, `glowIntensity`, `plasmaIntensity` in `data-uniforms`).
- Or give the text its own solid backing (a card, a label chip).
- For a custom field, fade the tone to 0.2 or less where text sits.

## Custom field

```html
<script type="x-shader/x-field" id="hero-field">
  float field(vec2 uv, vec2 res, float t) {
    vec2 p = vec2(uv.x * res.x / res.y, uv.y);           // keep circles round
    vec2 c = (uv - 0.5) * vec2(res.x / res.y, 1.0);
    float clear = smoothstep(0.15, 0.55, length(c));     // clear ground for text
    return fbm(p * 2.0 + vec2(t * 0.03, 0.0)) * clear * 0.75;
  }
</script>
<section class="hero" data-dither="#hero-field"></section>
```

- `uv` runs 0 to 1 with y up; `res` is the size in cells; `t` is seconds. Return a smooth tone in [0, 1]; the engine quantises and dithers it, so don't threshold yourself.
- Helpers available: `hash21(p)`, `snoise(p)` in [-1, 1], `fbm(p)` in [0, 1], `spectrum(h)`, `paletteColor(x)`.
- To wrap a preset (for example to clear the centre), copy its `field` from `Dither.presets.<name>.field`, rename it `baseField`, define `field` around it, and add `data-preset="<name>"` so its uniforms and palette still apply.
- Motion is slow: a drift of a few percent of the box per second.

## JavaScript

```js
const stop = Dither.mount(el, { field: "silk", uniforms: { silkFolds: 9 }, cell: 4 });
stop();                       // removes the canvas and frees its WebGL context
Dither.mountAll(container);   // mounts [data-dither] added after load
const url = Dither.render({ field: "starfield", width: 640, height: 360 }); // PNG still
```

Browsers keep about 16 live WebGL contexts per page. For more than a handful of effects (thumbnails, a gallery, list rows), use `Dither.render` to draw still images from one shared context, and set them as `background-image` with `image-rendering: pixelated`.

## 6. Check it

Open the page in a browser if you can, at desktop and phone width, in light and dark, and once with reduced motion. Look for `[dither.js]` errors in the console: "shader failed to compile" means the custom field has a GLSL error. An empty box means the element has no height; a solid block means the field returns 1 everywhere.

Done when the effect renders, text over it stays readable in both themes, and the console has no `[dither.js]` errors.

`assets/example.html` is a working page showing presets, knobs, a recolour and a custom field.
