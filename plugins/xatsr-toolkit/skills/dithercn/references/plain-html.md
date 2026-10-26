# Plain HTML (no React)

For a static page, a single-file HTML artifact, or any site without React and shadcn, use `vanilla/dither.js` next to this skill. It is a dependency-free port of `DitherShader`: the same GLSL `field` contract (tone 0 paper, 1 ink), the same helpers (`hash21`, `snoise`, `fbm`), ordered Bayer dithering on WebGL, with resizing, offscreen pausing, reduced motion and light/dark switching handled. `vanilla/example.html` shows every preset.

Not ported: blue noise, `colorField` and multi-colour palettes, SVG/CSS fills, image dithering, export. For those, use the React engine.

## Add it

Copy `vanilla/dither.js` beside the page and load it once, at the end of `<body>`. For a single-file artifact, paste its contents into an inline `<script>` instead.

```html
<section class="hero" data-dither="clouds" data-cell="3">
  <h1>Headline</h1>
</section>
<script src="dither.js"></script>
```

The script prepends an `absolute inset-0` canvas to each `[data-dither]` element (and sets `position: relative` if the element is static). Give the element a size, and lift content above the canvas:

```css
.hero > :not(canvas) { position: relative; z-index: 1; }
```

## Presets

24 built in, all in `Dither.presets`:

| Group | Presets |
| --- | --- |
| Soft backgrounds | `clouds`, `aurora`, `glow`, `gradient`, `vignette`, `beams`, `fire`, `stars` |
| Patterns | `waves`, `rings`, `ripple`, `plasma`, `stripes`, `checker`, `spiral`, `static` |
| Scenes | `sunset`, `grid`, `ridges`, `dunes`, `contours`, `orb`, `tunnel`, `rain` |

## Attributes

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-dither` | `clouds` | A preset name or `#id` of a `<script type="x-shader/x-field">` holding a `field` |
| `data-cell` | `3` | Cell size in CSS px. 2–3 texture, 4–6 pixel look, 8+ pixel art |
| `data-levels` | `17` | Tone steps |
| `data-matrix` | `bayer8` | `bayer2`, `bayer4` or `bayer8` |
| `data-speed` | `1` | Time multiplier; `0` for a still image |
| `data-still` | `4` | Time shown under `prefers-reduced-motion` |
| `data-ink` | `var(--dither-ink, currentColor)` | Any CSS colour, `var()` and `oklch()` included |
| `data-paper` | `transparent` | Ground colour; transparent lets the page background show |

Define `--dither-ink` on `:root` and again for dark mode so the dots follow the theme. Colours are re-read when the OS scheme changes or when `class`, `data-theme` or `style` changes on `<html>` or `<body>`.

## Custom field

```html
<script type="x-shader/x-field" id="hero-field">
  float field(vec2 uv, vec2 res, float t) {
    vec2 p = vec2(uv.x * res.x / res.y, uv.y);
    vec2 c = (uv - 0.5) * vec2(res.x / res.y, 1.0);
    float clear = smoothstep(0.15, 0.55, length(c));   // clear ground for text
    return fbm(p * 2.0 + vec2(t * 0.03, 0.0)) * clear * 0.75;
  }
</script>
<section class="hero" data-dither="#hero-field"></section>
```

Write fields as in [fields.md](fields.md); every rule in SKILL.md still applies. Compile errors log as `[dither.js] shader failed to compile`.

## From JavaScript

```js
const stop = Dither.mount(element, { field: "aurora", cell: 4, ink: "var(--brand)" });
stop(); // removes the canvas and observers
Dither.mountAll(container); // mounts [data-dither] added after load

// One still frame as a PNG data URL, from a shared context. Use it for
// thumbnails, CSS backgrounds or <img>, and when a page needs more than
// ~16 dithers (browsers cap live WebGL contexts).
const url = Dither.render({ field: "sunset", width: 640, height: 360, cell: 3 });
box.style.backgroundImage = `url(${url})`;
box.style.backgroundSize = "cover";
box.style.imageRendering = "pixelated";
```
