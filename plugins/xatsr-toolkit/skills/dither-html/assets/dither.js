/*
 * dither.js — a dependency-free port of the dithercn engine for plain HTML
 * pages (no React, no build step). Ordered dithering on WebGL in your page's
 * colours, with resizing, offscreen pausing, light/dark and reduced motion
 * handled. Ships every dithercn background as a preset.
 *
 * Based on dithercn (https://github.com/opencoredev/dithercn), MIT, (c) Leo.
 *
 * Use it three ways:
 *
 *   1. Markup only. Give an element `data-dither` with a preset name, or the
 *      id of a <script type="x-shader/x-field"> that holds a GLSL `field`:
 *
 *        <div class="hero" data-dither="aurora"></div>
 *        <div class="hero" data-dither="plasma" data-ink="#2f5bea"
 *             data-uniforms='{"plasmaBands": 3}'></div>
 *        <div class="hero" data-dither="#my-field" data-cell="4"></div>
 *
 *   2. JavaScript, live:
 *
 *        const stop = Dither.mount(element, { field: "aurora", cell: 3 });
 *
 *   3. JavaScript, one still frame as a PNG data URL (no live canvas, so it
 *      doesn't count toward the browser's limit on WebGL contexts):
 *
 *        const url = Dither.render({ field: "silk", width: 640, height: 360 });
 *
 * Options (attribute form in brackets). A preset brings its own defaults;
 * anything you pass wins.
 *   field      preset name, or GLSL defining                 [data-dither]
 *              `float field(vec2 uv, vec2 res, float t)` returning 0 (paper) to 1 (ink)
 *   preset     preset whose palette, uniforms and timing a   [data-preset]
 *              custom field borrows
 *   uniforms   values for the field's own uniforms           [data-uniforms]  JSON
 *              (number, or array of 2 to 4 numbers)
 *   palette    colours from paper to ink, 2 or more          [data-palette]   "a | b | c"
 *   ink        sets --dither-ink for this effect              [data-ink]
 *   paper      sets --dither-paper for this effect            [data-paper]
 *   cell       pixel size of one dither cell                 [data-cell]      3
 *   matrix     "bayer2" | "bayer4" | "bayer8" | "blue-noise" [data-matrix]    bayer4
 *   levels     tone steps, 2 to 256                          [data-levels]    matrix steps + 1
 *   speed      time multiplier, 0 for a still image          [data-speed]     1
 *   stillTime  time shown when still or motion is reduced    [data-still]     0
 *
 * Colours: palette entries take any CSS colour, a CSS variable name such as
 * "--dither-ink", or a palette name (ink, blue, purple, green, pink, orange,
 * red, grey). Unset, --dither-ink falls back to the text colour and
 * --dither-paper to transparent, so effects follow your page out of the box.
 *
 * The canvas fills the element (position: absolute; inset: 0), so give the
 * element a size and keep content in a child above it:
 *   .hero > :not(canvas) { position: relative; z-index: 1; }
 */
(function (global) {
  "use strict";

  var HELPERS = `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 dither_permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = dither_permute(dither_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    sum += amp * snoise(p);
    p = rotate * p * 2.02 + vec2(11.3, 4.7);
    amp *= 0.5;
  }
  return clamp(0.5 + 0.5 * sum / 0.9375, 0.0, 1.0);
}

vec3 spectrum(float h) {
  vec3 rgb = clamp(abs(mod(fract(h) * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return rgb * rgb * (3.0 - 2.0 * rgb);
}

vec4 dither_paletteEntry(float index) {
  return texture2D(u_palette, vec2((index + 0.5) / u_paletteSize, 0.5));
}

vec4 paletteColor(float x) {
  float last = u_paletteSize - 1.0;
  float scaled = clamp(x, 0.0, 1.0) * (last - 1.0);
  float index = floor(scaled);
  vec4 from = dither_paletteEntry(1.0 + index);
  vec4 to = dither_paletteEntry(min(2.0 + index, last));
  return mix(from, to, scaled - index);
}
`;

  // Presets. The "dithercn" group is ported from dithercn's background
  // components with their default props; "extra" are made for this port.
  // Each has a palette (paper to ink), uniforms with defaults, and knobs:
  // [uniform, label, min, max, step] or [uniform, label, {value: label}].
  var PRESETS = {
    "aurora": {
      title: "แสงเหนือ",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 30%, var(--dither-paper))", "color-mix(in oklch, var(--dither-ink) 70%, var(--dither-paper))", "--dither-ink", "color-mix(in oklch, var(--dither-ink) 50%, var(--foreground))"],
      matrix: "bayer8",
      uniforms: {"auroraCurtains": 3, "auroraDrift": 0, "auroraFlip": 0, "auroraGlow": 0.9, "auroraHeight": 0.42, "auroraIntensity": 0.95, "auroraLength": 0.45, "auroraMask": 0, "auroraRays": 8, "auroraScale": 1, "auroraShimmer": 0.2, "auroraSpread": 0.11, "auroraSway": 1, "auroraTilt": 0, "auroraTurbulence": 0.6},
      knobs: [["auroraCurtains", "ม่านแสง", 1, 6, 1], ["auroraHeight", "ความสูง", 0, 1, 0.01], ["auroraRays", "ริ้วแสง", 1, 32, 1], ["auroraSway", "การพลิ้ว", 0, 3, 0.1]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  if (auroraFlip > 0.5) {
    p.y = -p.y;
  }
  float c = cos(auroraTilt);
  float s = sin(auroraTilt);
  p = vec2(c * p.x + s * p.y, -s * p.x + c * p.y) + vec2(0.0, 0.5);
  float x = p.x * auroraScale + t * auroraDrift * 0.04;
  float decayBase = mix(15.0, 2.2, auroraLength);
  float light = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    if (fi >= auroraCurtains) {
      break;
    }
    float depth = fi / max(auroraCurtains - 1.0, 1.0);
    float edge = auroraHeight + fi * auroraSpread
      + auroraSway * 0.11 * snoise(vec2(x * 0.55 + fi * 3.1, t * 0.035 + fi * 1.7))
      + auroraTurbulence * 0.05 * snoise(vec2(x * 2.1 - fi * 1.3, t * 0.07 + fi));
    float above = p.y - edge;
    float curtain = above > 0.0
      ? exp(-above * decayBase * (1.0 + fi * 0.4))
      : exp(above * 48.0);
    float bend = snoise(vec2(x * 0.8, t * 0.03 + fi)) * (0.25 + 0.35 * auroraSway);
    float rx = (x + bend) * auroraRays;
    float rays = mix(0.2, 1.0, smoothstep(0.25, 0.75, fbm(vec2(rx + fi * 9.0, t * 0.045 + fi))));
    rays *= 0.75 + 0.25 * snoise(vec2(rx * 3.2, fi * 4.0 + t * 0.02));
    float patch = mix(0.3, 1.0, smoothstep(0.25, 0.7, fbm(vec2(x * 0.45 + fi * 5.0, t * 0.02 + fi * 2.0))));
    float rim = exp(-abs(above) * 34.0) * auroraGlow;
    float haze = above > 0.0 ? exp(-above * 5.0) * 0.09 : exp(above * 14.0) * 0.05;
    light += (curtain * rays + rim * (0.5 + 0.5 * rays) + haze) * patch * mix(1.0, 0.5, depth);
  }
  float ripple = 0.5 + 0.5 * sin(t * 0.8 + p.x * 4.0 + 2.0 * snoise(vec2(p.x * 2.5, t * 0.15)));
  float tone = (1.0 - exp(-light * 1.25)) * auroraIntensity * (1.0 - auroraShimmer * 0.45 * ripple);

  float keep = 1.0;
  if (auroraMask > 2.5) {
    keep = smoothstep(0.0, 0.22, uv.x) * smoothstep(1.0, 0.78, uv.x);
  } else if (auroraMask > 1.5) {
    keep = smoothstep(0.02, 0.4, uv.y);
  } else if (auroraMask > 0.5) {
    keep = smoothstep(0.98, 0.6, uv.y);
  }
  return tone * keep;
}
`,
    },
    "beams": {
      title: "ลำแสง",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 4,
      uniforms: {"beamAngle": 160, "beamOrigin": [0.18, -0.12], "beamRays": 9, "beamReach": 1, "beamSpread": 80, "beamSweep": 6},
      knobs: [["beamAngle", "มุม", 0, 360, 1], ["beamSpread", "ความกว้าง", 1, 359, 1], ["beamRays", "จำนวนลำ", 1, 30, 1], ["beamReach", "ระยะ", 0.05, 3, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 o = vec2(beamOrigin.x * aspect, 1.0 - beamOrigin.y);
  vec2 d = p - o;
  float dist = length(d);
  // Light fades from where it enters the box, so a far origin still lights the near edge.
  vec2 box = vec2(aspect, 1.0) * 0.5;
  float entry = length(max(abs(o - box) - box, 0.0));
  float travelled = max(dist - entry, 0.0);

  // Angle from the cone's axis, in radians. CSS angles: 0 is up, clockwise.
  float sway = radians(beamSweep) * sin(t * 0.11);
  float axis = radians(beamAngle) + sway;
  float a = atan(d.x, d.y) - axis;
  a = mod(a + 3.14159265, 6.28318531) - 3.14159265;

  float halfWidth = radians(beamSpread) * 0.5;
  float cone = smoothstep(halfWidth, 0.0, abs(a));
  cone = sqrt(cone);

  // Rays: noise around the origin, two octaves, sliding slowly sideways.
  float k = beamRays / max(halfWidth, 0.02);
  float r1 = 0.5 + 0.5 * snoise(vec2(a * k * 0.5, t * 0.05));
  float r2 = 0.5 + 0.5 * snoise(vec2(a * k * 1.4 + 7.0, t * 0.08 + 3.0));
  float rays = 0.12 + 1.1 * pow(r1, 2.0) + 0.25 * pow(r2, 3.0);
  // Dust drifting through the light breaks the rays up along their length.
  float dust = 0.88 + 0.12 * fbm(vec2(a * k * 0.3, travelled * 3.0 - t * 0.06));

  float reach = length(vec2(aspect, 1.0)) * beamReach;
  float fall = exp(-travelled / reach * 2.4);
  float core = exp(-travelled * 8.0) * 0.35;
  return clamp(cone * (rays * dust * fall * 1.3 + core), 0.0, 1.0);
}
`,
    },
    "contours": {
      title: "เส้นชั้นความสูง",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 40%, var(--dither-paper))", "--dither-ink"],
      stillTime: 6,
      uniforms: {"contoursIndex": 5, "contoursLines": 14, "contoursRelief": 0.5, "contoursScale": 1},
      knobs: [["contoursLines", "จำนวนเส้น", 4, 32, 1], ["contoursScale", "ขนาดเนิน", 0.1, 4, 0.1], ["contoursRelief", "เงาภูเขา", 0, 1, 0.05]],
      field: `
float contoursHeight(vec2 p, float t) {
  // Low-frequency noise only, so lines stay unbroken; detail comes from the warp.
  vec2 q = p + vec2(4.3 + t * 0.008, 2.9 + t * 0.003);
  q += 0.3 * vec2(snoise(q * 0.45 + vec2(1.7, t * 0.008)), snoise(q * 0.45 + vec2(8.3, -t * 0.006)));
  return 0.5 + 0.34 * snoise(q * 0.85) + 0.14 * snoise(q * 1.9 + 4.1);
}

float contoursLine(float h, float hx, float hy, float count, float width) {
  float v = h * count;
  float offset = abs(fract(v + 0.5) - 0.5);
  float perCell = max(length(vec2(hx - h, hy - h)) * count, 1e-4);
  float d = offset / perCell;
  float line = 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, d);
  return line * (1.0 - smoothstep(0.08, 0.14, offset));
}

float field(vec2 uv, vec2 res, float t) {
  // Hills keep their size in cells, so a phone shows a smaller piece of the same map.
  float unit = contoursScale / 200.0;
  vec2 p = (uv - 0.5) * res * unit;
  vec2 e = vec2(unit, 0.0);
  float h = contoursHeight(p, t);
  float hx = contoursHeight(p + e.xy, t);
  float hy = contoursHeight(p + e.yx, t);

  // Half tone is the middle palette colour exactly, so thin lines come out solid.
  float tone = contoursLine(h, hx, hy, contoursLines, 1.2) * 0.5;
  if (contoursIndex > 0.5) {
    float nearest = floor(h * contoursLines + 0.5);
    float isIndex = 1.0 - step(0.5, mod(nearest, contoursIndex));
    float heavy = contoursLine(h, hx, hy, contoursLines, 2.0);
    tone = mix(tone, heavy, isIndex);
  }

  // Hillshade, lit from the top left: slopes facing away pick up a light stipple.
  vec2 grad = vec2(hx - h, hy - h) / unit;
  vec3 n = normalize(vec3(-grad * 0.9, 1.0));
  float lit = dot(n, normalize(vec3(-0.6, 0.6, 0.6)));
  float shade = contoursRelief * 0.28 * smoothstep(0.6, 0.15, lit);
  return max(tone, shade);
}
`,
    },
    "eclipse": {
      title: "สุริยุปราคา",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 5,
      uniforms: {"eclipseCenter": [0.5, 0.5], "eclipseCorona": 0.5, "eclipseLight": 315, "eclipsePulse": 0.5, "eclipseSize": 0.24},
      knobs: [["eclipseSize", "ขนาด", 0.05, 0.5, 0.01], ["eclipseCorona", "โคโรนา", 0, 1.5, 0.05], ["eclipsePulse", "การเต้น", 0, 1, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 c = vec2(eclipseCenter.x * aspect, 1.0 - eclipseCenter.y);
  vec2 d = p - c;
  float r = length(d);
  float e = r - eclipseSize;
  if (e < 0.0) {
    return 0.0;
  }

  // Direction around the disc as a point on the unit circle, so the noise wraps.
  vec2 around = d / max(r, 0.0001);
  float a = atan(d.x, d.y);
  float facing = 0.5 + 0.5 * cos(a - radians(eclipseLight));

  float breathe = 1.0 + eclipsePulse * 0.12 * sin(t * 0.6);
  float reach = eclipseSize * (0.1 + 0.5 * eclipseCorona) * breathe;

  // A smooth halo whose strength wavers slowly around the rim.
  float streak = fbm(around * 2.2 + vec2(t * 0.02, -t * 0.015));
  float halo = exp(-e / reach) * (1.0 - smoothstep(reach, reach * 3.2, e)) * (0.7 + 0.6 * streak);
  // A thin rim, brightest on the lit side: the crescent of an eclipse.
  float rim = exp(-e / (eclipseSize * 0.03));
  float glow = halo * (0.3 + 0.6 * facing) + rim * (0.3 + pow(facing, 1.5));
  return clamp(glow * breathe, 0.0, 1.0);
}
`,
    },
    "fade": {
      title: "ขอบจาง",
      group: "dithercn",
      palette: ["transparent", "--dither-ink"],
      matrix: "bayer4",
      uniforms: {"fadeSide": 0},
      knobs: [["fadeSide", "ด้าน", {"0": "ล่าง", "1": "บน", "2": "ขวา", "3": "ซ้าย"}]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float s;
  float along;
  if (fadeSide < 0.5) {
    s = 1.0 - uv.y;
    along = uv.x * res.x / res.y;
  } else if (fadeSide < 1.5) {
    s = uv.y;
    along = uv.x * res.x / res.y;
  } else if (fadeSide < 2.5) {
    s = uv.x;
    along = uv.y * res.y / res.x;
  } else {
    s = 1.0 - uv.x;
    along = uv.y * res.y / res.x;
  }
  float drift = (fbm(vec2(along * 1.6 + t * 0.05, s * 1.2 - t * 0.03)) - 0.5) * 0.35;
  return pow(clamp(s + drift * (1.0 - s), 0.0, 1.0), 1.6);
}
`,
    },
    "glow": {
      title: "แสงเรือง",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      uniforms: {"glowCenter": [0.5, -0.05], "glowIntensity": 0.75, "glowRadius": 0.7},
      knobs: [["glowRadius", "รัศมี", 0.1, 2, 0.05], ["glowIntensity", "ความสว่าง", 0, 1, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 c = vec2(glowCenter.x * aspect, 1.0 - glowCenter.y);
  vec2 far = vec2(max(c.x, aspect - c.x), max(c.y, 1.0 - c.y));
  float reach = length(far) * glowRadius;
  float breathe = 1.0 + 0.045 * sin(t * 0.32);
  float warp = fbm(p * 1.6 + vec2(t * 0.035, -t * 0.025)) - 0.5;
  float d = length(p - c) / (reach * breathe) + warp * 0.22;
  d = max(d, 0.0);
  float core = exp(-d * d * 4.5);
  float halo = exp(-d * 2.6) * (1.0 - smoothstep(0.55, 1.25, d));
  return glowIntensity * (core * 0.6 + halo * 0.4);
}
`,
    },
    "gradient": {
      title: "ไล่โทน",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      uniforms: {"gradientAngle": 180, "gradientCenter": [0.5, 0.5], "gradientFrom": 0, "gradientMode": 0, "gradientNoise": 0.12, "gradientRadius": 1, "gradientTo": 1},
      knobs: [["gradientMode", "แบบ", {"0": "เส้นตรง", "1": "วงกลม", "2": "กรวย"}], ["gradientAngle", "มุม", 0, 360, 1], ["gradientNoise", "นอยส์", 0, 0.5, 0.01]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 c = vec2((gradientCenter.x - 0.5) * aspect, 0.5 - gradientCenter.y);
  float a = radians(gradientAngle);
  float s;
  if (gradientMode < 0.5) {
    vec2 dir = vec2(sin(a), cos(a));
    float extent = abs(dir.x) * aspect * 0.5 + abs(dir.y) * 0.5;
    s = dot(p, dir) / (2.0 * extent) + 0.5;
  } else if (gradientMode < 1.5) {
    vec2 corner = vec2(aspect * 0.5 + abs(c.x), 0.5 + abs(c.y));
    s = length(p - c) / (length(corner) * gradientRadius);
  } else {
    vec2 d = p - c;
    s = fract((atan(d.x, d.y) - a) / 6.28318530718);
  }
  float drift = fbm(p * 1.8 + vec2(t * 0.045, -t * 0.03)) - 0.5;
  s = clamp(s + drift * gradientNoise, 0.0, 1.0);
  return mix(gradientFrom, gradientTo, s);
}
`,
    },
    "halftone": {
      title: "ฮาล์ฟโทน",
      group: "dithercn",
      palette: ["--dither-paper", "ink"],
      levels: 2,
      uniforms: {"halftoneAngle": 45, "halftoneCenter": [0.5, 0.5], "halftoneChannels": 1, "halftoneDirection": 0, "halftoneDrift": 1, "halftoneIntensity": 0.9, "halftoneMode": 0, "halftonePitch": 10, "halftoneRadius": 1, "halftoneScale": 1},
      knobs: [["halftoneMode", "แหล่ง", {"0": "นอยส์", "1": "วงกลม", "2": "เส้นตรง"}], ["halftonePitch", "ระยะจุด", 4, 40, 1], ["halftoneAngle", "มุมตะแกรง", 0, 90, 1]],
      field: `
float halftoneBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}

// 4x4 ordered threshold, so dot edges dither instead of stair-stepping.
float halftoneBayer(vec2 a) {
  return halftoneBayer2(0.5 * a) * 0.25 + halftoneBayer2(a) + 0.03125;
}

float halftoneSource(vec2 uv, float aspect, float t, float channel) {
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 phase = vec2(3.7, 1.9) * channel;
  if (halftoneMode < 0.5) {
    // Two broad octaves only: wide, soft swells give the dots room to grade.
    vec2 q = p * 1.1 * halftoneScale + phase;
    float n = snoise(q + vec2(t * 0.05, -t * 0.03)) * 0.75
      + snoise(q * 2.1 + vec2(-t * 0.04, t * 0.06) + 7.3) * 0.25;
    return smoothstep(-0.25, 0.85, n);
  }
  float drift = (fbm(p * 1.4 + phase + vec2(t * 0.04, -t * 0.03)) - 0.5) * 0.22;
  if (halftoneMode < 1.5) {
    vec2 c = vec2((halftoneCenter.x - 0.5) * aspect, 0.5 - halftoneCenter.y);
    vec2 corner = vec2(aspect * 0.5 + abs(c.x), 0.5 + abs(c.y));
    return clamp(1.0 - length(p - c) / (length(corner) * halftoneRadius) + drift, 0.0, 1.0);
  }
  float a = radians(halftoneDirection);
  vec2 dir = vec2(sin(a), cos(a));
  float extent = abs(dir.x) * aspect * 0.5 + abs(dir.y) * 0.5;
  return clamp(dot(p, dir) / (2.0 * extent) + 0.5 + drift, 0.0, 1.0);
}

// 1 when this pixel is inked by the screen of one channel.
float halftoneScreen(vec2 px, vec2 res, float t, float channel) {
  float a = radians(halftoneAngle + 30.0 * channel);
  mat2 toGrid = mat2(cos(a), -sin(a), sin(a), cos(a));
  mat2 fromGrid = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 slide = fromGrid * vec2(t * halftoneDrift * 4.0, 0.0);
  vec2 q = toGrid * (px + slide) / halftonePitch;
  vec2 id = floor(q) + 0.5;
  vec2 local = q - id;

  // Each dot takes one value, sampled at its centre, as in print.
  vec2 centre = (fromGrid * (id * halftonePitch) - slide) / res;
  float value = halftoneSource(centre, res.x / res.y, t, channel);
  float radius = 0.5 * sqrt(value) * halftoneIntensity;
  float cover = clamp((radius - length(local)) * halftonePitch + 0.5, 0.0, 1.0);
  return step(halftoneBayer(px + vec2(2.0, 1.0) * channel), cover);
}

float field(vec2 uv, vec2 res, float t) {
  vec2 px = uv * res - 0.5;
  float index = halftoneScreen(px, res, t, 0.0);
  if (halftoneChannels > 1.5) {
    index += 2.0 * halftoneScreen(px, res, t, 1.0);
  }
  if (halftoneChannels > 2.5) {
    index += 4.0 * halftoneScreen(px, res, t, 2.0);
  }
  // Pick a palette entry exactly: the palette lists every overlap.
  return index / (pow(2.0, halftoneChannels) - 1.0);
}
`,
    },
    "horizon": {
      title: "ขอบฟ้าดาวเคราะห์",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 14,
      uniforms: {"horizonAurora": 1, "horizonCurve": 0.6, "horizonGlow": 1, "horizonHeight": 0.28, "horizonStars": 1},
      knobs: [["horizonHeight", "ระดับขอบฟ้า", 0.05, 0.8, 0.01], ["horizonCurve", "ความโค้ง", 0, 1.5, 0.05], ["horizonStars", "ดาว", 0, 2, 0.1]],
      field: `
float horizonNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float horizonFbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 3; i++) {
    sum += amp * horizonNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return sum / 0.875;
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 world = vec2(uv.x * aspect, uv.y);
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);

  // The planet is a circle in square space whose top touches the horizon.
  float radius = 0.6 * pow(8.0, 1.0 - horizonCurve);
  vec2 centre = vec2(0.0, horizonHeight - radius);
  // Signed distance from the horizon, in box heights.
  float e = length(p - centre) - radius;
  float above = max(e, 0.0);
  float below = max(-e, 0.0);

  // Domain-warped noise, drifting slowly sideways along the horizon.
  vec2 warp = vec2(
    horizonFbm(world * 1.3 + vec2(t * 0.021, 0.0)),
    horizonFbm(world * 1.3 + vec2(5.2, 1.3) - vec2(0.0, t * 0.017))
  );
  float n = horizonFbm(world * vec2(1.1, 2.6) + 1.7 * warp + vec2(t * 0.013, 0.0));

  // Aurora curtains: noise stretched vertically, sliding along the horizon.
  float curtains = horizonFbm(vec2(world.x * 5.0 + 2.0 * warp.x - t * 0.03, above * 6.0 - t * 0.01));
  curtains = mix(0.7, curtains, horizonAurora);
  float lit = 0.35 + 0.9 * n * curtains + 0.25 * n;
  float glow = 1.15 * exp(-above * 11.0) * lit + 0.3 * exp(-above * 5.0) * curtains * curtains;
  glow *= horizonGlow;
  // A lit rim just inside the edge, then the dark planet.
  float rim = exp(-below * 60.0) * (0.85 + 0.4 * n) * mix(0.6, 1.0, horizonGlow);
  float tone = e > 0.0 ? glow : rim;

  // Fixed stars, thinning out towards the glow so the horizon stays clean.
  vec2 cell = floor(uv * res);
  float seed = hash21(vec2(hash21(cell), hash21(cell.yx + 31.7)) * 97.0);
  float star = step(1.0 - 0.0012 * horizonStars, seed) * smoothstep(0.08, 0.3, above);
  return max(tone, star);
}
`,
    },
    "mesh-gradient": {
      title: "ไล่สีหลายก้อน",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 28%, var(--dither-paper))", "color-mix(in oklch, var(--dither-ink) 45%, oklch(0.6 0.22 318))", "--dither-ink", "color-mix(in oklch, var(--dither-ink) 58%, var(--foreground))"],
      matrix: "blue-noise",
      uniforms: {"meshCount": 4, "meshSize": 0.6},
      knobs: [["meshCount", "จำนวนก้อน", 3, 5, 1], ["meshSize", "ขนาดก้อน", 0.2, 1.5, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 warp = vec2(fbm(p * 1.1 + vec2(t * 0.02, 0.0)), fbm(p * 1.1 + vec2(7.3, -t * 0.02)));
  p += (warp - 0.5) * 0.35;
  float weights = 0.32;
  float tones = 0.0;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    if (fi < meshCount) {
      float sx = 0.045 * (1.0 + fi * 0.23);
      float sy = 0.038 * (1.0 + fi * 0.19);
      vec2 c = vec2(
        (0.5 + 0.38 * cos(t * sx + fi * 2.4)) * aspect,
        0.5 + 0.36 * sin(t * sy + fi * 1.7)
      );
      float d = length(p - c) / meshSize;
      float w = exp(-d * d * 2.2);
      weights += w;
      tones += w * (fi + 1.0) / meshCount;
    }
  }
  return tones / weights;
}
`,
    },
    "metaballs": {
      title: "ลาวาแลมป์",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 20,
      uniforms: {"metaballsCount": 5, "metaballsMode": 0, "metaballsSize": 1},
      knobs: [["metaballsMode", "แบบ", {"0": "ก้อนทึบ", "1": "เส้นวง"}], ["metaballsCount", "จำนวน", 1, 8, 1], ["metaballsSize", "ขนาด", 0.3, 2, 0.05]],
      field: `
// Sum of soft falloffs: 1.0 is the edge of a blob, more is inside.
float metaballsSum(vec2 p, float aspect, float unit, float t) {
  float sum = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi >= metaballsCount) break;
    float seed = fi * 1.618;
    // Each blob rises and sinks on its own slow loop, with a little sideways drift.
    vec2 centre = vec2(
      aspect * (0.5 + 0.3 * sin(t * (0.05 + 0.017 * fi) + seed * 2.3)),
      0.5 + 0.34 * sin(t * (0.07 + 0.013 * fi) + seed * 3.1)
    );
    float radius = unit * metaballsSize * (0.14 + 0.06 * fract(seed * 7.3));
    vec2 d = p - centre;
    sum += radius * radius / max(dot(d, d), 1e-5);
  }
  return sum;
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  // In a tall box, size blobs by the width so they still fit.
  float unit = min(aspect, 1.0);
  float f = metaballsSum(p, aspect, unit, t);

  if (metaballsMode > 0.5) {
    // Contour lines of the field, evenly spaced in log space so they ring each blob.
    float cellSize = 1.0 / res.y;
    float h = log(f);
    float hx = log(metaballsSum(p + vec2(cellSize, 0.0), aspect, unit, t));
    float hy = log(metaballsSum(p + vec2(0.0, cellSize), aspect, unit, t));
    float count = 3.2;
    float v = h * count + t * 0.12;
    float offset = abs(fract(v + 0.5) - 0.5);
    float perCell = max(length(vec2(hx - h, hy - h)) * count, 1e-4);
    float line = 1.0 - smoothstep(0.3, 1.3, offset / perCell);
    float inside = smoothstep(0.85, 1.15, f);
    float fade = smoothstep(0.08, 0.6, f);
    return max(line * mix(0.45, 1.0, inside) * fade, inside * 0.14);
  }

  // Shaded inside, densest at the cores, with a soft halo around each edge.
  float inside = smoothstep(0.92, 1.08, f);
  float core = mix(0.55, 0.95, smoothstep(1.0, 3.5, f));
  float halo = 0.24 * smoothstep(0.5, 1.0, f);
  return mix(halo, core, inside);
}
`,
    },
    "noise-field": {
      title: "ลายนอยส์",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      uniforms: {"noiseAngle": 1.5707963267948966, "noiseBands": 8, "noiseContrast": 1.2, "noiseCoverage": 0, "noiseDetail": 4, "noiseFlow": 1, "noiseIntensity": 0.9, "noiseInvert": 0, "noiseMask": 0, "noiseMaskSize": 0.5, "noiseScale": 1.3, "noiseVariant": 0, "noiseWarp": 1.7},
      knobs: [["noiseVariant", "แบบ", {"0": "ควัน", "1": "สันเขา", "2": "เส้นชั้น", "3": "หินอ่อน"}], ["noiseScale", "ขนาด", 0.3, 4, 0.1], ["noiseWarp", "การบิด", 0, 4, 0.1]],
      field: `
const mat2 NF_ROTATE = mat2(0.8, -0.6, 0.6, 0.8);

float nf_fbm(vec2 p, float octaves) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= octaves) {
      break;
    }
    sum += amp * snoise(p);
    norm += amp;
    p = NF_ROTATE * p * 2.02 + vec2(11.3, 4.7);
    amp *= 0.5;
  }
  return clamp(0.5 + 0.5 * sum / norm, 0.0, 1.0);
}

float nf_ridges(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= noiseDetail) {
      break;
    }
    float r = 1.0 - abs(snoise(p));
    sum += amp * r * r;
    norm += amp;
    p = NF_ROTATE * p * 2.02 + vec2(11.3, 4.7);
    amp *= 0.5;
  }
  return sum / norm;
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) * noiseScale;
  vec2 drift = vec2(cos(noiseAngle), sin(noiseAngle)) * t * 0.05 * noiseFlow;
  vec2 q = vec2(
    nf_fbm(p + vec2(0.0, t * 0.02) - drift, noiseDetail),
    nf_fbm(p + vec2(5.2, 1.3) - vec2(t * 0.015, 0.0) - drift * 0.8, noiseDetail)
  );
  vec2 w = p + noiseWarp * q - drift * 0.6;

  float n;
  if (noiseVariant > 2.5) {
    float s = sin(dot(w, vec2(0.35, 1.0)) * noiseBands * 2.4 + nf_fbm(w * 0.7, noiseDetail) * 2.5);
    n = pow(0.5 + 0.5 * s, 1.6);
  } else if (noiseVariant > 1.5) {
    // Lines need a smooth height, so the finest octaves stay out of it.
    float h = nf_fbm(p * 0.6 + noiseWarp * 0.3 * q - drift * 0.6, min(noiseDetail, 2.0));
    float d = abs(fract(h * noiseBands) - 0.5);
    n = max(smoothstep(0.38, 0.47, d), h * h * 0.2);
  } else if (noiseVariant > 0.5) {
    n = pow(nf_ridges(w), 1.4);
  } else {
    n = nf_fbm(w, noiseDetail);
  }

  if (noiseVariant < 1.5 || noiseVariant > 2.5) {
    // Smoke keeps a gentle slope so the folds stay a gradient, not plateaus.
    float slope = noiseVariant < 0.5 ? 1.0 : 1.5;
    n = clamp((n - 0.5 + noiseCoverage) * noiseContrast * slope + 0.5, 0.0, 1.0);
    n = n * n * (3.0 - 2.0 * n);
  } else {
    n = clamp(n + noiseCoverage, 0.0, 1.0);
  }
  if (noiseVariant < 0.5) {
    n = pow(n, 2.8);
  }
  if (noiseInvert > 0.5) {
    n = 1.0 - n;
  }

  float keep = 1.0;
  float size = noiseMaskSize;
  if (noiseMask > 3.5) {
    vec2 d = vec2((uv.x - 0.5) * 0.85, (uv.y - 0.5) * 1.7);
    float r = 0.2 + 0.45 * (1.0 - size);
    keep = 1.0 - smoothstep(r, r + 0.4, length(d));
  } else if (noiseMask > 2.5) {
    keep = smoothstep(size * 0.8, size * 0.8 + 0.55, uv.y);
  } else if (noiseMask > 1.5) {
    keep = smoothstep(size * 0.8, size * 0.8 + 0.55, 1.0 - uv.y);
  } else if (noiseMask > 0.5) {
    vec2 d = vec2((uv.x - 0.5) * 0.85, (uv.y - 0.5) * 1.7);
    float r = 0.36 * size;
    keep = smoothstep(r, r + 0.44, length(d));
  }
  return n * keep * noiseIntensity;
}
`,
    },
    "orb": {
      title: "ลูกแก้ว",
      group: "dithercn",
      palette: ["--dither-paper", "ink"],
      uniforms: {"orbBody": 1, "orbGlow": 0.5, "orbLean": [0, 0], "orbMorph": 1, "orbSize": 0.26},
      knobs: [["orbSize", "ขนาด", 0.1, 0.5, 0.01], ["orbMorph", "การบิด", 0, 3, 0.1], ["orbGlow", "แสงเรือง", 0, 1.5, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  float fit = min(aspect, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) * 2.0 / fit;
  vec2 q = p - orbLean * 0.16;
  float r = length(q);
  float a = atan(q.y, q.x);

  // A slowly breathing outline: two low harmonics plus soft noise.
  float wobble = 0.045 * sin(3.0 * a + t * 0.6)
    + 0.03 * sin(5.0 * a - t * 0.8 + 1.3)
    + 0.05 * snoise(q * 1.2 + vec2(t * 0.12, -t * 0.09));
  float radius = orbSize * 2.0 * (1.0 + orbMorph * wobble);
  float d = r / radius;

  vec3 light = normalize(vec3(-0.5 + orbLean.x * 0.35, 0.55 + orbLean.y * 0.35, 0.8));
  if (d < 1.0) {
    vec3 n = vec3(q / radius, sqrt(1.0 - d * d));
    float diffuse = max(dot(n, light), 0.0);
    float spec = pow(max(dot(reflect(-light, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);
    float rim = pow(1.0 - n.z, 3.0);
    // Faint currents inside the orb so the surface never looks flat.
    float swirl = fbm(n.xy * 1.8 + vec2(t * 0.05, t * 0.03)) - 0.5;
    // Ambient keeps the shadow side readable; a thin rim light outlines it.
    float body = 0.09 + 0.82 * pow(diffuse, 1.4) + 0.28 * rim + 0.14 * swirl * diffuse;
    return clamp(body * orbBody + spec * 0.8, 0.0, 1.0);
  }
  // Outside: a glow that falls off with distance, brighter on the lit side.
  float side = 0.25 + 0.75 * smoothstep(-0.2, 1.0, dot(normalize(q), normalize(light.xy)));
  return orbGlow * 0.4 * exp(-(d - 1.0) * 7.0) * side;
}
`,
    },
    "plasma": {
      title: "พลาสมา",
      group: "dithercn",
      palette: ["--dither-paper", "--chart-5", "--dither-ink"],
      stillTime: 9,
      uniforms: {"plasmaBands": 1.5, "plasmaIntensity": 1, "plasmaScale": 1, "plasmaWarp": 0.3},
      knobs: [["plasmaScale", "ขนาด", 0.2, 3, 0.05], ["plasmaBands", "จำนวนแถบ", 0.5, 4, 0.1], ["plasmaWarp", "การบิด", 0, 1, 0.05]],
      field: `
float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 4.2 * plasmaScale;

  // A slow noise warp keeps the classic sine pattern from looking mechanical.
  vec2 warp = vec2(
    fbm(p * 0.35 + vec2(t * 0.05, 0.0)),
    fbm(p * 0.35 + vec2(3.7, 1.9) - vec2(0.0, t * 0.04))
  ) - 0.5;
  p += warp * 3.0 * plasmaWarp;

  float v = sin(p.x * 0.9 + t * 0.31);
  v += sin(p.y * 1.1 - t * 0.23);
  v += sin((p.x * 0.6 + p.y * 0.8) * 1.2 + t * 0.17);
  vec2 orbit = vec2(sin(t * 0.13) * 1.6, cos(t * 0.11) * 1.2);
  v += sin(length(p - orbit) * 1.4 - t * 0.29);

  float tone = 0.5 + 0.5 * sin(v * 0.785398 * plasmaBands);
  // Bias towards paper so the darks open up and only the crests reach ink.
  tone = pow(smoothstep(0.05, 1.0, tone), 1.7);
  return tone * plasmaIntensity;
}
`,
    },
    "retro-grid": {
      title: "ตารางเรโทร",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 30%, var(--dither-paper))", "color-mix(in oklch, var(--dither-ink) 65%, var(--dither-paper))", "--dither-ink"],
      stillTime: 3,
      uniforms: {"retroColumns": 12, "retroHorizon": 0.42, "retroSun": 0.4},
      knobs: [["retroColumns", "จำนวนเส้น", 4, 32, 1], ["retroHorizon", "ระดับขอบฟ้า", 0.2, 0.8, 0.01], ["retroSun", "พระอาทิตย์", 0, 0.8, 0.01]],
      field: `
// A grid line at every whole value of v, about one cell wide whatever the
// perspective. Lines closer than a couple of cells fade out instead of
// turning into moire.
float retroLine(float v, float vx, float vy) {
  float offset = abs(fract(v + 0.5) - 0.5);
  float perCell = max(length(vec2(vx - v, vy - v)), 1e-4);
  float line = 1.0 - smoothstep(0.35, 1.1, offset / perCell);
  return line * (1.0 - smoothstep(0.2, 0.45, perCell));
}

vec2 retroFloor(vec2 uv, float aspect, float t) {
  float below = max(retroHorizon - uv.y, 1e-4) / max(retroHorizon, 1e-3);
  float depth = 1.0 / below;
  // Squares keep their size against the box height, so a narrow box shows
  // fewer columns rather than thinner ones. Front squares come out a little
  // foreshortened, as seen from a low camera.
  float across = (uv.x - 0.5) * aspect * depth * retroColumns / 1.6;
  float rows = 1.5 * retroHorizon * retroColumns / 1.6;
  return vec2(across, depth * rows + t * 0.35);
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 cellStep = 1.0 / res;
  float tone = 0.0;

  if (uv.y < retroHorizon) {
    vec2 g = retroFloor(uv, aspect, t);
    vec2 gx = retroFloor(uv + vec2(cellStep.x, 0.0), aspect, t);
    vec2 gy = retroFloor(uv + vec2(0.0, cellStep.y), aspect, t);
    float lines = max(retroLine(g.x, gx.x, gy.x), retroLine(g.y, gx.y, gy.y));
    float near = (retroHorizon - uv.y) / max(retroHorizon, 1e-3);
    // Haze at the horizon, the sun's reflection, and lines that brighten towards you.
    float haze = exp(-near * 14.0) * 0.4;
    float glare = exp(-pow((uv.x - 0.5) * aspect * 2.6, 2.0)) * exp(-near * 5.0) * 0.25 * step(0.001, retroSun);
    tone = max(lines * mix(0.6, 1.0, smoothstep(0.0, 0.6, near)), haze + glare);
    tone = max(tone, (1.0 - smoothstep(0.0, 1.6, (retroHorizon - uv.y) * res.y)) * 0.95);
    return clamp(tone, 0.0, 1.0);
  }

  float above = uv.y - retroHorizon;
  float sky = exp(-above * 28.0) * 0.3;
  tone = sky;
  if (retroSun > 0.001) {
    float r = retroSun * 0.5;
    vec2 c = vec2((uv.x - 0.5) * aspect, uv.y - (retroHorizon + r * 0.2));
    float dist = length(c);
    float disc = 1.0 - smoothstep(r - 1.2 / res.y, r, dist);
    // Bright at the top, deeper towards the horizon, so the dither shows inside.
    float body = mix(0.62, 1.0, smoothstep(-r, r, c.y));
    // Slits through the lower half that thicken towards the horizon and drift down.
    float k = clamp((r * 0.6 - c.y) / (r * 0.85), 0.0, 1.0);
    float bands = fract(c.y / r * 6.0 + t * 0.08);
    float cut = step(bands, k * 0.6) * step(0.0001, k);
    float glow = exp(-max(dist - r, 0.0) * 9.0 / max(r * 2.0, 0.2)) * 0.4;
    tone = max(tone, max(disc * body * (1.0 - cut), glow * (1.0 - disc)));
  }
  return clamp(tone, 0.0, 1.0);
}
`,
    },
    "ridgelines": {
      title: "เส้นคลื่นซ้อน",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 8,
      uniforms: {"ridgeAmplitude": 1, "ridgeLines": 32, "ridgeShade": 0.25, "ridgeSpread": 0.5},
      knobs: [["ridgeLines", "จำนวนเส้น", 8, 64, 1], ["ridgeAmplitude", "ความสูงยอด", 0, 3, 0.1], ["ridgeSpread", "การกระจาย", 0, 1, 0.05]],
      field: `
// Height of line fi at x, in line spacings: flat at the ends, peaked in the middle.
float ridgeHeight(float x, float fi, float t, float k) {
  float centred = (x - 0.5) / ridgeSpread;
  float envelope = exp(-centred * centred * 5.5);
  float n1 = snoise(vec2(x * 7.0 * k + fi * 0.37, fi * 0.61 + t * 0.05));
  float n2 = snoise(vec2(x * 17.0 * k - fi * 0.53, fi * 1.3 - t * 0.07));
  float peaks = max(n1 * 0.8 + n2 * 0.25 + 0.1, 0.0);
  float ripple = 0.1 * snoise(vec2(x * 36.0 * k, fi * 2.1 + t * 0.03));
  return envelope * (peaks * peaks * 4.5 + ripple + 0.25) * ridgeAmplitude;
}

float field(vec2 uv, vec2 res, float t) {
  float cellX = 1.0 / res.x;
  // Lines sit between 10% and 86% of the height, front line at the bottom.
  float top = 0.86;
  float bottom = 0.1;
  // Keep at least 4.5 cells between lines, so a short box draws fewer of them.
  float count = min(ridgeLines, floor((top - bottom) * res.y / 4.5) + 1.0);
  float spacing = (top - bottom) / max(count - 1.0, 1.0);
  // Peaks keep their shape in narrow boxes instead of crowding together.
  float freq = clamp(res.x / res.y / 1.3, 0.45, 1.4);
  float tone = 0.0;
  // ridgeHeight never exceeds 6.3 spacings per unit of amplitude.
  float reach = 6.3 * ridgeAmplitude * spacing + cellX * res.x / res.y;

  // Back to front: each line hides the ones behind it under its own paper fill.
  for (int i = 0; i < 64; i++) {
    float fi = float(i);
    if (fi >= count) break;
    float base = top - fi * spacing;
    // Only lines that can reach this cell need their noise. A line whose
    // highest peak stays below the cell leaves it alone, and one more than six
    // spacings above it leaves a shade too faint for any threshold, so it
    // just clears what the lines behind it drew.
    if (uv.y > base + reach) continue;
    if (base - uv.y > 6.0 * spacing) {
      tone = 0.0;
      continue;
    }
    float h = ridgeHeight(uv.x, fi, t, freq);
    float y = base + h * spacing;
    // Under the line, its fill hides the lines behind. Raised peaks get a faint
    // shade that fades downwards, so the ridges read as solid.
    float under = (y - uv.y) / spacing;
    float shade = ridgeShade * smoothstep(0.6, 3.0, h) * exp(-under * 0.7);
    if (under > 1.0) {
      tone = shade;
      continue;
    }
    float yNext = base + ridgeHeight(uv.x + cellX, fi, t, freq) * spacing;
    // Distance to the curve in cells, corrected for its slope so steep peaks keep their width.
    float slope = (yNext - y) * res.y;
    float d = abs(uv.y - y) * res.y / sqrt(1.0 + slope * slope);
    if (uv.y < y) {
      tone = shade;
    }
    // A hard edge keeps each line one crisp cell wide instead of two dithered rows.
    tone = max(tone, step(d, 0.5));
  }
  return tone;
}
`,
    },
    "ripples": {
      title: "ระลอกน้ำ",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 45%, var(--dither-paper))", "--dither-ink"],
      stillTime: 5,
      uniforms: {"ripplesA": [0.28, 0.38, 0.74, 0.66], "ripplesB": [0.28, 0.38, 0.28, 0.38], "ripplesCount": 2, "ripplesDecay": 1, "ripplesIntensity": 1, "ripplesRings": 12},
      knobs: [["ripplesCount", "จุดตก", 1, 4, 1], ["ripplesRings", "จำนวนวง", 2, 32, 1], ["ripplesDecay", "การจาง", 0, 3, 0.1]],
      field: `
// One source: a train of thin rings moving outwards, fading with distance.
float ripplesRing(vec2 p, vec2 at, float aspect, float t, float phase) {
  vec2 o = vec2(at.x * aspect, 1.0 - at.y);
  float d = length(p - o);
  float wave = 0.5 + 0.5 * cos(d * ripplesRings * 6.2831853 - t * 0.8 + phase);
  float envelope = exp(-d * ripplesDecay * 3.4) * smoothstep(0.0, 0.05, d);
  return smoothstep(0.72, 0.92, wave) * envelope;
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  // A slow swell bends the rings slightly, as on real water.
  p += 0.01 * vec2(snoise(p * 1.4 + vec2(t * 0.03, 0.0)), snoise(p * 1.4 + vec2(5.2, t * 0.025)));

  float sum = ripplesRing(p, ripplesA.xy, aspect, t, 0.0);
  if (ripplesCount > 1.5) sum += ripplesRing(p, ripplesA.zw, aspect, t, 2.1);
  if (ripplesCount > 2.5) sum += ripplesRing(p, ripplesB.xy, aspect, t, 4.2);
  if (ripplesCount > 3.5) sum += ripplesRing(p, ripplesB.zw, aspect, t, 1.3);

  // Rings are brightest near their source and fade to the middle colour and out;
  // where two crests cross they add up to ink.
  return ripplesIntensity * clamp(sum * 0.9, 0.0, 1.0);
}
`,
    },
    "silk": {
      title: "ผ้าไหม",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 30%, var(--dither-paper))", "color-mix(in oklch, var(--dither-ink) 65%, var(--dither-paper))", "--dither-ink"],
      matrix: "bayer8",
      stillTime: 7,
      uniforms: {"silkAngle": 110, "silkFolds": 6, "silkIntensity": 1, "silkSheen": 0.6},
      knobs: [["silkFolds", "จำนวนรอยพับ", 1, 16, 1], ["silkAngle", "มุม", 0, 180, 1], ["silkSheen", "ความเงา", 0, 1, 0.05]],
      field: `
// The cloth: a height that rises and falls across the folds, bent by slow waves.
float silkHeight(vec2 p, float t) {
  float bend = 0.55 * sin(p.x * 0.9 + t * 0.09)
    + 0.3 * sin(p.x * 1.7 - p.y * 0.4 + t * 0.06 + 1.3)
    + 0.35 * snoise(p * 0.35 + vec2(t * 0.015, 0.0));
  float across = (p.y + bend) * silkFolds * 0.9;
  // Uneven folds: some pleats bunch up, others hang wide.
  across += 0.6 * sin(across * 0.5 + p.x * 0.3 + t * 0.04);
  return sin(across + 0.4 * sin(p.x * 0.7 - t * 0.05));
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 c = vec2((uv.x - 0.5) * aspect, uv.y - 0.5) * 3.2;
  float a = radians(silkAngle - 90.0);
  vec2 p = mat2(cos(a), sin(a), -sin(a), cos(a)) * c;

  float e = 3.2 / res.y;
  float h = silkHeight(p, t);
  float hx = silkHeight(p + vec2(e, 0.0), t);
  float hy = silkHeight(p + vec2(0.0, e), t);
  // Divide by the fold count so more folds don't mean steeper ones.
  vec2 grad = vec2(hx - h, hy - h) / e / max(silkFolds, 0.5);
  vec3 n = normalize(vec3(-grad * 1.4, 1.0));

  // Wrapped diffuse light, so shadowed sides fall off smoothly instead of
  // cutting to paper, and a tight highlight along each crest.
  vec3 light = normalize(vec3(-0.45, 0.65, 0.6));
  float diffuse = 0.5 + 0.5 * dot(n, light);
  vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
  float shine = pow(max(dot(n, halfway), 0.0), mix(6.0, 48.0, silkSheen));

  // The light falls off across the cloth, so one side sits in shadow.
  float pool = smoothstep(-0.6, 0.9, snoise(c * 0.3 + vec2(t * 0.012, 0.4)) * 0.6 + 0.3 * c.y);
  float tone = pow(smoothstep(0.25, 1.0, diffuse), 2.0) * 0.72 + shine * mix(0.45, 0.85, silkSheen);
  return clamp(tone * mix(0.55, 1.0, pool), 0.0, 1.0) * silkIntensity;
}
`,
    },
    "smoke": {
      title: "ควัน",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 12,
      uniforms: {"smokeAmount": 1, "smokeHeight": 0.8, "smokeScale": 1, "smokeWind": 0.2},
      knobs: [["smokeAmount", "ปริมาณ", 0, 2, 0.05], ["smokeHeight", "ความสูง", 0.2, 1.2, 0.05], ["smokeWind", "ลม", -1, 1, 0.05]],
      field: `
float smokeDensity(vec2 p, float t) {
  // Rising coordinates, stretched upright so the puffs climb in plumes.
  vec2 q = vec2(p.x, p.y * 0.82) - vec2(smokeWind * t * 0.04, t * 0.045);
  // A slow warp curls the plumes as they climb.
  vec2 warp = vec2(
    snoise(q * 0.45 + vec2(0.0, t * 0.012)),
    snoise(q * 0.45 + vec2(5.2, 1.3) - vec2(t * 0.01, 0.0))
  );
  vec2 w = q + warp * 0.6;
  return 0.5 + 0.36 * snoise(w * 0.8) + 0.14 * snoise(w * 1.9 + 3.0);
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y) * 2.2 * smokeScale;

  float d = smokeDensity(p, t);
  // Light from the upper left: smoke that thins that way is lit, the far side in shadow.
  float lit = smokeDensity(p + vec2(-0.2, 0.3), t);
  float light = clamp(0.75 + (d - lit) * 1.6, 0.35, 1.0);

  // Thick at the bottom, thinning out towards smokeHeight.
  float rise = uv.y / max(smokeHeight, 0.05);
  float body = smoothstep(0.3, 0.85, d - rise * 0.5 + 0.25);
  // The top edge follows the plumes, so it never reads as a straight line.
  body *= 1.0 - smoothstep(0.6, 1.2, rise - (d - 0.5) * 0.9);
  // Peaks stop short of solid ink so the dither shows inside the thickest smoke.
  return clamp(body * light * smokeAmount * 0.9, 0.0, 1.0);
}
`,
    },
    "starfield": {
      title: "ทุ่งดาว",
      group: "dithercn",
      palette: ["--dither-paper", "--chart-2", "--dither-ink"],
      matrix: "blue-noise",
      stillTime: 6,
      levels: 33,
      uniforms: {"starAngle": 270, "starDensity": 1, "starDrift": 1.6, "starNebula": 0.5, "starSteps": 2, "starTwinkle": 0.6},
      knobs: [["starDensity", "ความหนาแน่น", 0.2, 3, 0.1], ["starTwinkle", "การกะพริบ", 0, 1, 0.05], ["starNebula", "เนบิวลา", 0, 1, 0.05]],
      field: `
float starLayer(vec2 cell, float grid, vec2 offset, float density, float peak, float t, float seed) {
  vec2 q = cell + offset;
  vec2 id = floor(q / grid);
  vec2 local = floor(q - id * grid);
  if (hash21(id + seed) > density) {
    return 0.0;
  }
  vec2 at = floor(vec2(hash21(id + seed + 7.1), hash21(id + seed + 13.7)) * (grid - 2.0)) + 1.0;
  vec2 d = abs(local - at);
  float rate = 0.5 + 1.7 * hash21(id + seed + 5.3);
  float pulse = 0.5 + 0.5 * sin(t * rate + hash21(id + seed + 2.9) * 40.0);
  float b = peak * (0.45 + 0.55 * hash21(id + seed + 3.3));
  b *= mix(1.0, pulse, starTwinkle);
  float core = step(d.x + d.y, 0.5);
  // The brightest stars get a small cross, one step dimmer than the core.
  float arms = step(d.x + d.y, 1.5) * step(0.82, b) * (b - 1.0 / starSteps);
  return max(core * b, arms);
}

float field(vec2 uv, vec2 res, float t) {
  vec2 cell = uv * res;
  float a = radians(starAngle);
  vec2 dir = vec2(sin(a), cos(a));
  vec2 travel = -dir * t * starDrift;

  float stars = starLayer(cell, 7.0, travel * 0.3, 0.32 * starDensity, 0.55, t, 0.0);
  stars = max(stars, starLayer(cell, 13.0, travel * 0.6, 0.42 * starDensity, 0.85, t, 41.0));
  stars = max(stars, starLayer(cell, 23.0, travel, 0.5 * starDensity, 1.0, t, 83.0));
  // Snap to whole palette steps; any visible star gets at least the first.
  float snapped = max(floor(stars * starSteps + 0.35) / starSteps, 1.0 / starSteps);
  stars = stars > 0.12 ? snapped : 0.0;

  float aspect = res.x / res.y;
  vec2 p = vec2(uv.x * aspect, uv.y) + travel * 0.15 / res.y;
  float haze = smoothstep(0.52, 0.95, fbm(p * 1.4 + vec2(2.3, 7.1)));
  float nebula = haze * 0.22 * starNebula;
  return max(stars, nebula);
}
`,
    },
    "tunnel": {
      title: "อุโมงค์",
      group: "dithercn",
      palette: ["--dither-paper", "--dither-ink"],
      stillTime: 6,
      uniforms: {"tunnelCenter": [0.5, 0.5], "tunnelFog": 1, "tunnelRings": 1, "tunnelShape": 0, "tunnelSpokes": 12, "tunnelSway": 1},
      knobs: [["tunnelShape", "รูปทรง", {"0": "กลม", "1": "เหลี่ยม"}], ["tunnelSpokes", "จำนวนซี่", 0, 32, 1], ["tunnelFog", "หมอก", 0, 2, 0.1]],
      field: `
float tunnelLine(float offset, float perCell, float width) {
  // offset and width are in ring steps; perCell is one cell in ring steps.
  float d = offset / perCell;
  float w = max(width / perCell, 0.55);
  return 1.0 - smoothstep(w - 0.5, w + 0.5, d);
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  vec2 o = vec2(tunnelCenter.x * aspect, 1.0 - tunnelCenter.y);
  o += tunnelSway * vec2(sin(t * 0.07) * 0.05, cos(t * 0.053) * 0.035);
  vec2 c = vec2(uv.x * aspect, uv.y) - o;
  float cellSize = 1.0 / res.y;

  // Distance from the vanishing point: round, or square with max().
  float r = tunnelShape < 0.5 ? length(c) : max(abs(c.x), abs(c.y));
  r = max(r, cellSize * 0.5);

  // Depth goes as 1 / r, so equal steps in depth bunch up towards the centre.
  float density = 7.0 * tunnelRings;
  float depth = 0.32 / r;
  float u = depth * density + t * 0.36;
  float perCell = 0.32 * density / (r * r) * cellSize;
  float ring = tunnelLine(abs(fract(u + 0.5) - 0.5), perCell, 0.045);

  // Spokes along the walls, turning slowly.
  float spoke = 0.0;
  float tile = 0.0;
  if (tunnelSpokes > 0.5) {
    float a = atan(c.y, c.x) / 6.28318531 + t * 0.006;
    if (tunnelShape > 0.5) {
      // Around a square, measure along the walls so spokes run straight into the corners.
      float sideX = c.x / r;
      float sideY = c.y / r;
      if (abs(c.x) >= abs(c.y)) {
        a = c.x > 0.0 ? (sideY + 1.0) * 0.125 : 0.5 + (1.0 - sideY) * 0.125;
      } else {
        a = c.y > 0.0 ? 0.25 + (1.0 - sideX) * 0.125 : 0.75 + (sideX + 1.0) * 0.125;
      }
    }
    float v = a * tunnelSpokes;
    // Every other panel between rings and spokes is lit, like tiles on the walls.
    tile = mod(floor(u) + floor(v), 2.0);
    float perCellA = tunnelSpokes / (mix(6.28318531, 8.0, tunnelShape) * r) * cellSize;
    spoke = tunnelLine(abs(fract(v + 0.5) - 0.5), perCellA, 0.004) * 0.8;
  }

  // Far away the rings crowd closer than a cell: fade them into the fog.
  float fog = smoothstep(0.04 * tunnelFog, 0.4 * tunnelFog, r) * (1.0 - smoothstep(0.25, 0.6, perCell));
  // The walls catch more light as they come closer.
  float wall = tile * 0.2 * smoothstep(0.12, 0.8, r);
  float tone = max(ring * mix(0.5, 1.0, smoothstep(0.1, 0.5, r)), spoke);
  return clamp(max(tone, wall) * fog, 0.0, 1.0);
}
`,
    },
    "waves": {
      title: "คลื่นทะเล",
      group: "dithercn",
      palette: ["--dither-paper", "color-mix(in oklch, var(--dither-ink) 35%, var(--dither-paper))", "--dither-ink", "color-mix(in oklch, var(--dither-ink) 45%, var(--foreground))"],
      uniforms: {"wavesAmplitude": 1, "wavesHorizon": 0.62, "wavesLayers": 6, "wavesMode": 0},
      knobs: [["wavesMode", "แบบ", {"0": "คลื่นซ้อน", "1": "เส้นคลื่นเสียง"}], ["wavesLayers", "จำนวนชั้น", 1, 8, 1], ["wavesHorizon", "ระดับขอบฟ้า", 0.2, 0.9, 0.01]],
      field: `
float wavesHeight(float x, float fi, float k, float t) {
  float freq = mix(7.0, 2.2, k);
  float roll = sin(x * freq + t * (0.32 + 0.22 * k) + fi * 1.9);
  float chop = snoise(vec2(x * freq * 0.45 + fi * 5.0, t * 0.09 + fi));
  return roll * 0.62 + chop * 0.38;
}

float field(vec2 uv, vec2 res, float t) {
  float aspect = res.x / res.y;
  float x = uv.x * aspect;
  float tone = 0.0;

  if (wavesMode < 0.5) {
    float above = uv.y - wavesHorizon;
    tone = above > 0.0 ? 0.5 * exp(-above * 13.0) : 0.0;
    float glint = exp(-pow((uv.x - 0.5) * 3.2, 2.0));
    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      if (fi < wavesLayers) {
        float k = fi / max(wavesLayers - 1.0, 1.0);
        float base = wavesHorizon * pow(1.0 - fi / wavesLayers, 1.45);
        float amp = wavesAmplitude * mix(0.006, 0.075, k);
        float crest = base + amp * wavesHeight(x, fi, k, t);
        float depth = (crest - uv.y) * res.y;
        if (depth > 0.0) {
          float body = mix(0.2, 0.03, k) + 0.16 * glint * (1.0 - k);
          tone = body * (0.4 + 0.6 * exp(-depth * mix(0.5, 0.06, k)));
          if (depth < 1.6) {
            tone = mix(0.95, 0.55, k) * (0.75 + 0.25 * glint);
          }
        }
      }
    }
    return tone;
  }

  float envelope = sin(3.14159265 * clamp(uv.x, 0.0, 1.0));
  envelope *= envelope;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    if (fi < wavesLayers) {
      float k = fi / max(wavesLayers - 1.0, 1.0);
      float y = 0.5 + envelope * wavesAmplitude * mix(0.3, 0.08, k) * wavesHeight(x * 0.8, fi, k, t * 1.4);
      float dist = abs(uv.y - y) * res.y;
      float line = 1.0 - smoothstep(0.4, 1.4, dist);
      float glow = exp(-dist * 0.18) * 0.22;
      tone = max(tone, max(line * mix(1.0, 0.45, k), glow * (1.0 - k * 0.6)));
    }
  }
  return tone;
}
`,
    },
    "clouds": {
      title: "เมฆลอย",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = vec2(uv.x * res.x / res.y, uv.y);
  return fbm(p * 2.5 + vec2(t * 0.03, 0.0)) * smoothstep(0.0, 0.7, 1.0 - uv.y);
}
`,
    },
    "rings": {
      title: "วงแหวน",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float d = length(p);
  float r = 0.5 + 0.5 * sin(d * 40.0 - t * 1.2);
  return r * exp(-d * 2.5);
}
`,
    },
    "spiral": {
      title: "ก้นหอย",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x);
  float s = sin(a * 3.0 + log(r + 0.001) * 8.0 - t * 1.0);
  return (0.5 + 0.5 * s) * (1.0 - smoothstep(0.05, 0.75, r));
}
`,
    },
    "sunset": {
      title: "พระอาทิตย์ตก",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = (uv - vec2(0.5, 0.42)) * vec2(res.x / res.y, 1.0);
  float d = length(p);
  float sun = 1.0 - smoothstep(0.29, 0.3, d);
  float slots = smoothstep(-0.2, 0.2, sin(uv.y * 70.0 + t * 1.5));
  float cut = mix(1.0, slots, 1.0 - smoothstep(0.3, 0.45, uv.y));
  float glow = exp(-d * 4.0) * 0.35;
  return max(sun * cut * (0.55 + 0.45 * uv.y), glow);
}
`,
    },
    "fire": {
      title: "เปลวไฟ",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = vec2(uv.x * res.x / res.y, uv.y);
  float n = fbm(vec2(p.x * 3.0, p.y * 2.0 - t * 0.8));
  float heat = (1.0 - uv.y) * 1.3 - 0.35 + (n - 0.5) * 0.9;
  return clamp(heat, 0.0, 1.0);
}
`,
    },
    "rain": {
      title: "ฝนตก",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  // streaks falling at different speeds, head at the bottom
  float col = floor(uv.x * res.x / 3.0);
  float speed = 0.25 + hash21(vec2(col, 1.0)) * 0.35;
  float y = fract(uv.y + t * speed + hash21(vec2(col, 7.0)));
  float streak = 1.0 - smoothstep(0.0, 0.25, y);
  return streak * step(0.55, hash21(vec2(col, 3.0)));
}
`,
    },
    "stripes": {
      title: "ลายทาง",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = vec2(uv.x * res.x / res.y, uv.y);
  float s = sin((p.x + p.y) * 25.0 - t * 1.5);
  return (0.5 + 0.5 * s) * (0.25 + 0.75 * uv.x);
}
`,
    },
    "static": {
      title: "จอซ่า",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  // TV static, with a soft vignette
  float n = hash21(floor(uv * res) + floor(t * 12.0) * 17.0);
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  return n * (1.0 - smoothstep(0.2, 0.9, length(p))) * 0.9;
}
`,
    },
    "vignette": {
      title: "ขอบมืด",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float edge = smoothstep(0.25, 0.85, length(p));
  return edge * (0.85 + 0.15 * fbm(p * 3.0 + t * 0.05));
}
`,
    },
    "dunes": {
      title: "เนินทราย",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  vec2 p = vec2(uv.x * res.x / res.y, uv.y);
  float warp = fbm(p * 1.2 + vec2(t * 0.02, 0.0));
  float s = sin((p.y + warp * 0.6) * 28.0 + p.x * 2.0);
  return (0.5 + 0.5 * s) * (0.35 + 0.65 * (1.0 - uv.y));
}
`,
    },
    "checker": {
      title: "ตาหมากรุก",
      group: "extra",
      palette: ["--dither-paper", "--dither-ink"],
      matrix: "bayer8",
      levels: 17,
      uniforms: {},
      knobs: [],
      field: `
float field(vec2 uv, vec2 res, float t) {
  // a slowly turning checkerboard that fades at the edges
  vec2 q = (uv - 0.5) * vec2(res.x / res.y, 1.0);
  float a = t * 0.1;
  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * 8.0;
  float c = sin(p.x * 3.14159) * sin(p.y * 3.14159);
  return smoothstep(-0.2, 0.2, c) * (1.0 - smoothstep(0.2, 0.75, length(q)));
}
`,
    },
  };

  // Older names that still work.
  var ALIASES = {"ripple": "ripples", "grid": "retro-grid", "ridges": "ridgelines", "stars": "starfield", "dither-glow": "glow", "dither-gradient": "gradient", "dither-orb": "orb", "dither-fade": "fade"};

  var VERTEX = "attribute vec2 a_position;\nvoid main() { gl_Position = vec4(a_position, 0.0, 1.0); }";

  var GLSL_TYPES = { 1: "float", 2: "vec2", 3: "vec3", 4: "vec4" };
  var IDENTIFIER = /^[A-Za-z][A-Za-z0-9_]*$/;

  var uniformSpecs = function (uniforms) {
    return Object.keys(uniforms).sort().filter(function (name) {
      if (!IDENTIFIER.test(name) || name.indexOf("u_") === 0) {
        console.error('[dither.js] uniform "' + name + '" skipped: names must be GLSL identifiers and not start with "u_"');
        return false;
      }
      return true;
    }).map(function (name) {
      var value = uniforms[name];
      return { name: name, size: typeof value === "number" ? 1 : value.length };
    });
  };

  // Same pipeline as dithercn: quantise the tone to `levels`, then step
  // through the palette with the threshold map deciding between neighbours.
  var fragmentSource = function (field, specs) {
    return [
      "#ifdef GL_FRAGMENT_PRECISION_HIGH",
      "precision highp float;",
      "#else",
      "precision mediump float;",
      "#endif",
      "uniform vec2 u_resolution;",
      "uniform float u_time;",
      "uniform float u_levels;",
      "uniform sampler2D u_thresholds;",
      "uniform float u_matrixSize;",
      "uniform float u_rankStep;",
      "uniform sampler2D u_palette;",
      "uniform float u_paletteSize;",
      specs.map(function (s) { return "uniform " + GLSL_TYPES[s.size] + " " + s.name + ";"; }).join("\n"),
      HELPERS,
      field,
      "void main() {",
      "  vec2 cell = floor(gl_FragCoord.xy);",
      "  vec2 uv = (cell + 0.5) / u_resolution;",
      "  float tone = clamp(field(uv, u_resolution, u_time), 0.0, 1.0);",
      "  float steps = u_levels - 1.0;",
      "  tone = floor(tone * steps + 0.5) / steps;",
      "  vec2 at = (mod(cell, u_matrixSize) + 0.5) / u_matrixSize;",
      "  float stored = floor(texture2D(u_thresholds, at).r * 255.0 + 0.5);",
      "  float threshold = (stored + 0.5 * u_rankStep) / 256.0;",
      "  float scaled = tone * (u_paletteSize - 1.0);",
      "  float index = floor(scaled);",
      "  index = min(index + step(threshold, scaled - index), u_paletteSize - 1.0);",
      "  vec4 color = dither_paletteEntry(index);",
      "  gl_FragColor = vec4(color.rgb * color.a, color.a);",
      "}",
    ].join("\n");
  };

  // Threshold maps as ranks; a cell inks when the tone beats
  // (rank + 0.5) / steps.
  var bayerRanks = function (size) {
    var ranks = new Uint8Array(size * size);
    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var rank = 0;
        for (var bit = 1; bit < size; bit *= 2) {
          var xBit = Math.floor(x / bit) % 2;
          var yBit = Math.floor(y / bit) % 2;
          rank = rank * 4 + 2 * ((xBit + yBit) % 2) + yBit;
        }
        ranks[y * size + x] = rank;
      }
    }
    return ranks;
  };

  // 64x64 void-and-cluster blue noise from dithercn, one rank byte per cell.
  var BLUE_NOISE_64 =
    "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";

  var matrices = {};
  var getMatrix = function (name) {
    if (!matrices[name]) {
      if (name === "blue-noise") {
        var binary = atob(BLUE_NOISE_64);
        var ranks = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) {
          ranks[i] = binary.charCodeAt(i);
        }
        matrices[name] = { size: 64, ranks: ranks, steps: 256 };
      } else {
        var size = { bayer2: 2, bayer4: 4, bayer8: 8 }[name] || 4;
        matrices[name] = { size: size, ranks: bayerRanks(size), steps: size * size };
      }
    }
    return matrices[name];
  };

  // Colours. Unset theme variables fall back to something sensible on a
  // plain page: ink to the text colour, paper to transparent.
  var NAMED = {
    ink: ["--dither-ink", "currentColor"],
    blue: ["--dither-color-blue", "oklch(0.64 0.16 245)"],
    purple: ["--dither-color-purple", "oklch(0.62 0.2 302)"],
    green: ["--dither-color-green", "oklch(0.68 0.16 152)"],
    pink: ["--dither-color-pink", "oklch(0.66 0.19 352)"],
    orange: ["--dither-color-orange", "oklch(0.72 0.16 58)"],
    red: ["--dither-color-red", "oklch(0.62 0.21 26)"],
    grey: ["--dither-color-grey", "oklch(0.6 0 0)"],
  };
  var VAR_FALLBACKS = {
    "--dither-ink": "currentColor",
    "--dither-paper": "transparent",
    "--foreground": "currentColor",
    "--background": "transparent",
    "--primary": "currentColor",
    "--chart-1": "oklch(0.646 0.222 41.116)",
    "--chart-2": "oklch(0.6 0.118 184.704)",
    "--chart-3": "oklch(0.398 0.07 227.392)",
    "--chart-4": "oklch(0.828 0.189 84.429)",
    "--chart-5": "oklch(0.769 0.188 70.08)",
  };
  Object.keys(NAMED).forEach(function (key) {
    VAR_FALLBACKS[NAMED[key][0]] = VAR_FALLBACKS[NAMED[key][0]] || NAMED[key][1];
  });

  var cssColor = function (value) {
    value = String(value).trim();
    if (NAMED[value]) {
      value = "var(" + NAMED[value][0] + ")";
    } else if (value.indexOf("--") === 0) {
      value = "var(" + value + ")";
    }
    return value.replace(/var\((--[\w-]+)\)/g, function (match, name) {
      return VAR_FALLBACKS[name] ? "var(" + name + ", " + VAR_FALLBACKS[name] + ")" : match;
    });
  };

  var probeCanvas = null;
  // Resolves each colour to [r, g, b, a] (straight alpha, 0..1) the way the
  // browser computes it inside `element`, with optional variable overrides.
  var resolvePalette = function (element, palette, vars) {
    var scope = document.createElement("span");
    scope.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
    Object.keys(vars).forEach(function (name) {
      if (vars[name]) {
        scope.style.setProperty(name, vars[name]);
      }
    });
    element.appendChild(scope);
    probeCanvas = probeCanvas || document.createElement("canvas");
    probeCanvas.width = probeCanvas.height = 1;
    var ctx = probeCanvas.getContext("2d", { willReadFrequently: true });
    var colors = palette.map(function (entry) {
      var probe = document.createElement("span");
      probe.style.color = cssColor(entry);
      scope.appendChild(probe);
      var computed = getComputedStyle(probe).color;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgba(0,0,0,0)";
      ctx.fillStyle = computed;
      ctx.fillRect(0, 0, 1, 1);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
    });
    scope.remove();
    return colors;
  };

  var compile = function (gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      if (!gl.isContextLost()) {
        console.error("[dither.js] shader failed to compile\n" + gl.getShaderInfoLog(shader));
      }
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  var splitPalette = function (text) {
    // Split on "|" so colours like color-mix(...) keep their commas.
    return String(text).split("|").map(function (s) { return s.trim(); }).filter(Boolean);
  };

  var normalize = function (options) {
    options = options || {};
    var find = function (name) {
      return name ? PRESETS[ALIASES[name] || name] : undefined;
    };
    // `preset` lends its palette, uniforms and timing to a custom `field`.
    var preset = find(options.preset) || find(options.field);
    var field = options.field && !find(options.field) ? options.field : null;
    var base = preset || {};
    field = field || base.field || PRESETS.aurora.field;
    var uniforms = {};
    var key;
    for (key in base.uniforms || {}) { uniforms[key] = base.uniforms[key]; }
    for (key in options.uniforms || {}) { uniforms[key] = options.uniforms[key]; }
    var matrix = options.matrix || base.matrix || "bayer4";
    var map = getMatrix(matrix);
    var palette = options.palette || base.palette || ["--dither-paper", "--dither-ink"];
    if (typeof palette === "string") {
      palette = splitPalette(palette);
    }
    var pick = function (value, fallback) {
      return value === undefined || value === null || value === "" ? fallback : Number(value);
    };
    return {
      field: field,
      uniforms: uniforms,
      palette: palette.length >= 2 ? palette : ["--dither-paper", "--dither-ink"],
      map: map,
      levels: Math.min(256, Math.max(2, Math.round(pick(options.levels, base.levels || map.steps + 1)))),
      cell: Math.max(1, pick(options.cell, 3)),
      speed: pick(options.speed, 1),
      stillTime: pick(options.stillTime, base.stillTime || 0),
      vars: { "--dither-ink": options.ink, "--dither-paper": options.paper },
    };
  };

  var createTexture = function (gl) {
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  };

  // Compiles a field into a ready-to-draw program on `gl`. Returns null when
  // the field doesn't compile (the reason is logged).
  var createRenderer = function (gl, opts) {
    var specs = uniformSpecs(opts.uniforms);
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(opts.field, specs));
    if (!vertex || !fragment) {
      return null;
    }
    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return null;
    }
    gl.useProgram(program);

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    var u = function (name) { return gl.getUniformLocation(program, name); };
    var uResolution = u("u_resolution");
    var uTime = u("u_time");
    var uPaletteSize = u("u_paletteSize");
    gl.uniform1f(u("u_levels"), opts.levels);
    gl.uniform1i(u("u_thresholds"), 0);
    gl.uniform1i(u("u_palette"), 1);
    var custom = specs.map(function (s) { return { name: s.name, location: u(s.name) }; });

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    var thresholds = createTexture(gl);
    var map = opts.map;
    var rankStep = 256 / map.steps;
    var bytes = new Uint8Array(map.ranks.length);
    for (var i = 0; i < bytes.length; i += 1) {
      bytes[i] = map.ranks[i] * rankStep;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, thresholds);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, map.size, map.size, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes);
    gl.uniform1f(u("u_matrixSize"), map.size);
    gl.uniform1f(u("u_rankStep"), rankStep);

    var paletteTexture = createTexture(gl);

    return {
      setPalette: function (colors) {
        var data = new Uint8Array(colors.length * 4);
        colors.forEach(function (c, index) {
          for (var k = 0; k < 4; k += 1) {
            data[index * 4 + k] = Math.round(c[k] * 255);
          }
        });
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, colors.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.uniform1f(uPaletteSize, colors.length);
      },
      draw: function (columns, rows, time) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, thresholds);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
        gl.viewport(0, 0, columns, rows);
        gl.uniform2f(uResolution, columns, rows);
        gl.uniform1f(uTime, time);
        custom.forEach(function (c) {
          var v = opts.uniforms[c.name];
          if (typeof v === "number") {
            gl.uniform1f(c.location, v);
          } else if (v.length === 2) {
            gl.uniform2f(c.location, v[0], v[1]);
          } else if (v.length === 3) {
            gl.uniform3f(c.location, v[0], v[1], v[2]);
          } else {
            gl.uniform4f(c.location, v[0], v[1], v[2], v[3]);
          }
        });
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose: function () {
        gl.deleteTexture(thresholds);
        gl.deleteTexture(paletteTexture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      },
    };
  };

  var loseContext = function (gl) {
    var ext = gl && gl.getExtension("WEBGL_lose_context");
    if (ext) {
      ext.loseContext();
    }
  };

  var reducedMotion = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  var mount = function (element, options) {
    var opts = normalize(options);

    if (getComputedStyle(element).position === "static") {
      element.style.position = "relative";
    }
    var canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;display:block;" +
      "image-rendering:pixelated;pointer-events:none;z-index:0;";
    element.prepend(canvas);

    var gl = canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false });
    var renderer = gl && createRenderer(gl, opts);
    if (!renderer) {
      loseContext(gl);
      canvas.remove();
      return function () {};
    }

    var columns = 0;
    var rows = 0;
    var visible = true;
    var frame = 0;
    var start = performance.now();

    var applyColors = function () {
      renderer.setPalette(resolvePalette(element, opts.palette, opts.vars));
    };

    var animated = function () {
      return opts.speed !== 0 && !reducedMotion.matches;
    };

    var tick = function (now) {
      frame = 0;
      if (columns && rows) {
        var time = animated() ? opts.stillTime + ((now - start) / 1000) * opts.speed : opts.stillTime;
        renderer.draw(columns, rows, time);
      }
      if (visible && animated()) {
        frame = requestAnimationFrame(tick);
      }
    };

    var schedule = function () {
      if (!frame && visible) {
        frame = requestAnimationFrame(tick);
      }
    };

    var resize = function () {
      var rect = element.getBoundingClientRect();
      columns = Math.max(1, Math.round(rect.width / opts.cell));
      rows = Math.max(1, Math.round(rect.height / opts.cell));
      canvas.width = columns;
      canvas.height = rows;
      schedule();
    };

    var resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(element);

    var intersectionObserver = new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      schedule();
    }, { rootMargin: "100px" });
    intersectionObserver.observe(element);

    // Follow light/dark switches: the OS setting, and a class, data-theme or
    // style change on <html> or <body>.
    var onTheme = function () {
      applyColors();
      schedule();
    };
    var darkQuery = global.matchMedia("(prefers-color-scheme: dark)");
    darkQuery.addEventListener("change", onTheme);
    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener("change", schedule);
    }
    var themeObserver = new MutationObserver(onTheme);
    [document.documentElement, document.body].forEach(function (node) {
      themeObserver.observe(node, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
    });

    applyColors();
    resize();

    return function stop() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      darkQuery.removeEventListener("change", onTheme);
      if (reducedMotion.removeEventListener) {
        reducedMotion.removeEventListener("change", schedule);
      }
      renderer.dispose();
      // Free the context now instead of waiting for garbage collection, so
      // remounting doesn't run into the browser's limit on live contexts.
      loseContext(gl);
      canvas.remove();
    };
  };

  // One shared offscreen context for still frames.
  var shared = null;
  var render = function (options) {
    options = options || {};
    var opts = normalize(options);
    var columns = Math.max(1, Math.round((Number(options.width) || 320) / opts.cell));
    var rows = Math.max(1, Math.round((Number(options.height) || 200) / opts.cell));
    if (!shared || shared.gl.isContextLost()) {
      var canvas = document.createElement("canvas");
      shared = {
        canvas: canvas,
        gl: canvas.getContext("webgl", { premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true }),
      };
    }
    if (!shared.gl) {
      return null;
    }
    shared.canvas.width = columns;
    shared.canvas.height = rows;
    var renderer = createRenderer(shared.gl, opts);
    if (!renderer) {
      return null;
    }
    renderer.setPalette(resolvePalette(options.element || document.body, opts.palette, opts.vars));
    renderer.draw(columns, rows, options.time === undefined ? opts.stillTime : Number(options.time));
    var url = shared.canvas.toDataURL("image/png");
    renderer.dispose();
    return url;
  };

  var mountAll = function (root) {
    (root || document).querySelectorAll("[data-dither]").forEach(function (element) {
      if (element.__ditherStop) {
        return;
      }
      var name = element.getAttribute("data-dither") || "aurora";
      var field = name;
      if (name.charAt(0) === "#") {
        var source = document.querySelector(name);
        field = source ? source.textContent : "aurora";
      }
      var data = element.dataset;
      var uniforms;
      if (data.uniforms) {
        try {
          uniforms = JSON.parse(data.uniforms);
        } catch (error) {
          console.error("[dither.js] data-uniforms is not valid JSON", data.uniforms);
        }
      }
      element.__ditherStop = mount(element, {
        field: field,
        preset: data.preset,
        uniforms: uniforms,
        palette: data.palette,
        cell: data.cell,
        levels: data.levels,
        matrix: data.matrix,
        speed: data.speed,
        stillTime: data.still,
        ink: data.ink,
        paper: data.paper,
      });
    });
  };

  global.Dither = {
    mount: mount,
    mountAll: mountAll,
    render: render,
    presets: PRESETS,
    aliases: ALIASES,
    cssColor: cssColor,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mountAll();
    });
  } else {
    mountAll();
  }
})(window);
