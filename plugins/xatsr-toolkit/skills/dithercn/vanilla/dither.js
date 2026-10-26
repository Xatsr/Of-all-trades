/*
 * dither.js — a dependency-free port of the dithercn engine's DitherShader
 * for plain HTML pages (no React, no build step). Ordered Bayer dithering on
 * WebGL, in your page's colours, with resizing, offscreen pausing and
 * reduced motion handled.
 *
 * Based on dithercn (https://github.com/opencoredev/dithercn), MIT, (c) Leo.
 *
 * Use it three ways:
 *
 *   1. Markup only. Give an element `data-dither` with a preset name, or the
 *      id of a <script type="x-shader/x-field"> that holds a GLSL `field`:
 *
 *        <div class="hero" data-dither="clouds"></div>
 *        <div class="hero" data-dither="#my-field" data-cell="4"></div>
 *
 *   2. JavaScript, live:
 *
 *        const stop = Dither.mount(element, { field: "...", cell: 3 });
 *
 *   3. JavaScript, one still frame as a PNG data URL (no live canvas, so it
 *      doesn't count toward the browser's limit of ~16 WebGL contexts):
 *
 *        const url = Dither.render({ field: "rings", width: 320, height: 200 });
 *        element.style.background = `url(${url}) center / cover`;
 *        element.style.imageRendering = "pixelated";
 *
 * Options (attribute form in brackets):
 *   field      GLSL source defining `float field(vec2 uv, vec2 res, float t)`,
 *              or a preset name (see Dither.presets)
 *   cell       pixel size of one dither cell            [data-cell]     3
 *   levels     tone steps the field is quantised to     [data-levels]   17
 *   matrix     "bayer2" | "bayer4" | "bayer8"           [data-matrix]   bayer8
 *   speed      time multiplier, 0 for a still image     [data-speed]    1
 *   stillTime  time shown when motion is reduced        [data-still]    4
 *   ink        CSS colour of the dots                   [data-ink]      var(--dither-ink)
 *   paper      CSS colour of the ground, or transparent [data-paper]    transparent
 *
 * Presets: gradient, clouds, waves, rings, glow, aurora, plasma, contours,
 * spiral, ripple, grid, sunset, ridges, orb, tunnel, fire, rain, stars,
 * beams, stripes, static, vignette, dunes, checker.
 *
 * The canvas fills the element (position: absolute; inset: 0), so give the
 * element a size and keep content in a sibling or child above it.
 */
(function (global) {
  "use strict";

  var HELPERS = [
    "float hash21(vec2 p) {",
    "  p = fract(p * vec2(123.34, 456.21));",
    "  p += dot(p, p + 45.32);",
    "  return fract(p.x * p.y);",
    "}",
    "vec3 dither_permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }",
    "float snoise(vec2 v) {",
    "  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);",
    "  vec2 i = floor(v + dot(v, C.yy));",
    "  vec2 x0 = v - i + dot(i, C.xx);",
    "  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);",
    "  vec4 x12 = x0.xyxy + C.xxzz;",
    "  x12.xy -= i1;",
    "  i = mod(i, 289.0);",
    "  vec3 p = dither_permute(dither_permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));",
    "  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);",
    "  m = m * m; m = m * m;",
    "  vec3 x = 2.0 * fract(p * C.www) - 1.0;",
    "  vec3 h = abs(x) - 0.5;",
    "  vec3 ox = floor(x + 0.5);",
    "  vec3 a0 = x - ox;",
    "  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);",
    "  vec3 g;",
    "  g.x = a0.x * x0.x + h.x * x0.y;",
    "  g.yz = a0.yz * x12.xz + h.yz * x12.yw;",
    "  return 130.0 * dot(m, g);",
    "}",
    "float fbm(vec2 p) {",
    "  float sum = 0.0; float amp = 0.5;",
    "  mat2 rotate = mat2(0.8, -0.6, 0.6, 0.8);",
    "  for (int i = 0; i < 4; i++) {",
    "    sum += amp * snoise(p);",
    "    p = rotate * p * 2.02 + vec2(11.3, 4.7);",
    "    amp *= 0.5;",
    "  }",
    "  return clamp(0.5 + 0.5 * sum / 0.9375, 0.0, 1.0);",
    "}",
  ].join("\n");

  var fieldOf = function (body) {
    return ["float field(vec2 uv, vec2 res, float t) {"].concat(body, ["}"]).join("\n");
  };

  // Each preset returns a tone in [0, 1]: 0 paper, 1 ink.
  var PRESETS = {
    gradient: fieldOf([
      "  return smoothstep(0.0, 1.0, 1.0 - uv.y);",
    ]),
    clouds: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  return fbm(p * 2.5 + vec2(t * 0.03, 0.0)) * smoothstep(0.0, 0.7, 1.0 - uv.y);",
    ]),
    waves: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float w = sin(p.x * 6.0 + t * 0.4 + sin(p.y * 4.0 - t * 0.3) * 1.5);",
      "  return (0.5 + 0.5 * w) * (1.0 - uv.y) * 0.9;",
    ]),
    rings: fieldOf([
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float d = length(p);",
      "  float r = 0.5 + 0.5 * sin(d * 40.0 - t * 1.2);",
      "  return r * exp(-d * 2.5);",
    ]),
    glow: fieldOf([
      "  vec2 p = (uv - vec2(0.5, 0.15)) * vec2(res.x / res.y, 1.0);",
      "  float pulse = 1.0 + 0.05 * sin(t * 0.6);",
      "  return exp(-dot(p, p) * 6.0 / pulse);",
    ]),
    aurora: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float sway = fbm(vec2(p.x * 1.2 + t * 0.02, t * 0.03)) - 0.5;",
      "  float y = uv.y - 0.6 - sway * 0.5;",
      "  float band = exp(-y * y * 30.0);",
      "  float rays = 0.6 + 0.4 * fbm(vec2(p.x * 8.0, t * 0.05));",
      "  return band * rays * smoothstep(0.0, 0.4, uv.y);",
    ]),
    plasma: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y) * 3.0;",
      "  float v = sin(p.x + t * 0.5) + sin(p.y * 1.3 - t * 0.4)",
      "    + sin((p.x + p.y) * 0.8 + t * 0.3) + sin(length(p - 1.5) * 2.0 - t * 0.6);",
      "  return 0.5 + 0.125 * v;",
    ]),
    contours: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float h = fbm(p * 1.8 + vec2(t * 0.02, t * 0.01));",
      "  float line = smoothstep(0.38, 0.5, abs(fract(h * 10.0) - 0.5));",
      "  return max(line, h * 0.2);",
    ]),
    spiral: fieldOf([
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float r = length(p);",
      "  float a = atan(p.y, p.x);",
      "  float s = sin(a * 3.0 + log(r + 0.001) * 8.0 - t * 1.0);",
      "  return (0.5 + 0.5 * s) * (1.0 - smoothstep(0.05, 0.75, r));",
    ]),
    ripple: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  vec2 a = vec2(0.35 * res.x / res.y, 0.55);",
      "  vec2 b = vec2(0.7 * res.x / res.y, 0.4);",
      "  float w = sin(length(p - a) * 30.0 - t * 2.0) + sin(length(p - b) * 26.0 - t * 1.7);",
      "  return 0.5 + 0.25 * w;",
    ]),
    grid: fieldOf([
      "  // a retro perspective floor scrolling toward you",
      "  float y = 0.5 - uv.y;",
      "  float depth = 0.12 / max(y, 0.002);",
      "  float x = (uv.x - 0.5) * res.x / res.y * depth;",
      "  float z = depth + t * 0.6;",
      "  float gx = smoothstep(0.42, 0.5, abs(fract(x * 1.5) - 0.5));",
      "  float gz = smoothstep(0.40, 0.5, abs(fract(z) - 0.5));",
      "  float ground = max(gx, gz) * smoothstep(0.0, 0.2, y);",
      "  float sky = exp(-max(-y, 0.0) * 12.0) * 0.35;",
      "  return y > 0.0 ? ground : sky;",
    ]),
    sunset: fieldOf([
      "  vec2 p = (uv - vec2(0.5, 0.42)) * vec2(res.x / res.y, 1.0);",
      "  float d = length(p);",
      "  float sun = 1.0 - smoothstep(0.29, 0.3, d);",
      "  float slots = smoothstep(-0.2, 0.2, sin(uv.y * 70.0 + t * 1.5));",
      "  float cut = mix(1.0, slots, 1.0 - smoothstep(0.3, 0.45, uv.y));",
      "  float glow = exp(-d * 4.0) * 0.35;",
      "  return max(sun * cut * (0.55 + 0.45 * uv.y), glow);",
    ]),
    ridges: fieldOf([
      "  // layered mountain ridgelines, far to near",
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float tone = 0.0;",
      "  for (int i = 0; i < 5; i++) {",
      "    float fi = float(i);",
      "    float base = 0.78 - fi * 0.14;",
      "    float n = fbm(vec2(p.x * 1.4 + fi * 7.3 + t * 0.01 * (fi + 1.0), fi * 3.1));",
      "    float h = base + (n - 0.5) * 0.4;",
      "    tone = uv.y < h ? 0.12 + fi * 0.2 : tone;",
      "  }",
      "  return tone;",
    ]),
    orb: fieldOf([
      "  // a lit sphere; the light circles slowly",
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0) / 0.38;",
      "  float r2 = dot(p, p);",
      "  vec3 n = vec3(p, sqrt(max(1.0 - r2, 0.0)));",
      "  vec3 l = normalize(vec3(-0.5 + 0.4 * sin(t * 0.4), 0.55, 0.7));",
      "  float lit = clamp(dot(n, l), 0.0, 1.0);",
      "  return (1.0 - step(1.0, r2)) * (0.08 + 0.92 * lit);",
    ]),
    tunnel: fieldOf([
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float r = length(p);",
      "  float a = atan(p.y, p.x) / 6.2831853;",
      "  float z = 0.25 / max(r, 0.001) + t * 0.5;",
      "  float tiles = 0.5 + 0.5 * sin(z * 6.2831853) * sin((a + t * 0.03) * 6.2831853 * 8.0);",
      "  return tiles * smoothstep(0.02, 0.45, r);",
    ]),
    fire: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float n = fbm(vec2(p.x * 3.0, p.y * 2.0 - t * 0.8));",
      "  float heat = (1.0 - uv.y) * 1.3 - 0.35 + (n - 0.5) * 0.9;",
      "  return clamp(heat, 0.0, 1.0);",
    ]),
    rain: fieldOf([
      "  // streaks falling at different speeds, head at the bottom",
      "  float col = floor(uv.x * res.x / 3.0);",
      "  float speed = 0.25 + hash21(vec2(col, 1.0)) * 0.35;",
      "  float y = fract(uv.y + t * speed + hash21(vec2(col, 7.0)));",
      "  float streak = 1.0 - smoothstep(0.0, 0.25, y);",
      "  return streak * step(0.55, hash21(vec2(col, 3.0)));",
    ]),
    stars: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y) * 36.0;",
      "  vec2 cell = floor(p);",
      "  float h = hash21(cell);",
      "  vec2 o = vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5;",
      "  float d = length(fract(p) - 0.5 - o * 0.6);",
      "  float star = step(0.86, h) * (1.0 - smoothstep(0.0, 0.14, d));",
      "  float twinkle = 0.55 + 0.45 * sin(t * 2.0 + h * 60.0);",
      "  float haze = fbm(p * 0.04 + vec2(t * 0.01, 0.0)) * 0.18;",
      "  return max(star * twinkle, haze);",
    ]),
    beams: fieldOf([
      "  // god rays from above the top edge",
      "  vec2 p = (uv - vec2(0.5, 1.15)) * vec2(res.x / res.y, 1.0);",
      "  float a = atan(p.x, -p.y);",
      "  float rays = fbm(vec2(a * 4.0, t * 0.08));",
      "  return smoothstep(0.35, 0.8, rays) * exp(-length(p) * 1.3) * 1.3;",
    ]),
    stripes: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float s = sin((p.x + p.y) * 25.0 - t * 1.5);",
      "  return (0.5 + 0.5 * s) * (0.25 + 0.75 * uv.x);",
    ]),
    static: fieldOf([
      "  // TV static, with a soft vignette",
      "  float n = hash21(floor(uv * res) + floor(t * 12.0) * 17.0);",
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  return n * (1.0 - smoothstep(0.2, 0.9, length(p))) * 0.9;",
    ]),
    dunes: fieldOf([
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float warp = fbm(p * 1.2 + vec2(t * 0.02, 0.0));",
      "  float s = sin((p.y + warp * 0.6) * 28.0 + p.x * 2.0);",
      "  return (0.5 + 0.5 * s) * (0.35 + 0.65 * (1.0 - uv.y));",
    ]),
    checker: fieldOf([
      "  // a slowly turning checkerboard that fades at the edges",
      "  vec2 q = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float a = t * 0.1;",
      "  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * 8.0;",
      "  float c = sin(p.x * 3.14159) * sin(p.y * 3.14159);",
      "  return smoothstep(-0.2, 0.2, c) * (1.0 - smoothstep(0.2, 0.75, length(q)));",
    ]),
    vignette: fieldOf([
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float edge = smoothstep(0.25, 0.85, length(p));",
      "  return edge * (0.85 + 0.15 * fbm(p * 3.0 + t * 0.05));",
    ]),
  };

  var VERTEX = [
    "attribute vec2 a_position;",
    "void main() { gl_Position = vec4(a_position, 0.0, 1.0); }",
  ].join("\n");

  var fragmentSource = function (field) {
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
      "uniform vec4 u_ink;",
      "uniform vec4 u_paper;",
      HELPERS,
      field,
      "void main() {",
      "  vec2 cell = floor(gl_FragCoord.xy);",
      "  vec2 uv = (cell + 0.5) / u_resolution;",
      "  float tone = clamp(field(uv, u_resolution, u_time), 0.0, 1.0);",
      "  float steps = u_levels - 1.0;",
      "  tone = floor(tone * steps + 0.5) / steps;",
      "  vec2 at = (mod(cell, u_matrixSize) + 0.5) / u_matrixSize;",
      "  float threshold = texture2D(u_thresholds, at).r;",
      "  vec4 color = tone > threshold ? u_ink : u_paper;",
      "  gl_FragColor = vec4(color.rgb * color.a, color.a);",
      "}",
    ].join("\n");
  };

  // Bayer ranks: interleave the bits of (x xor y) and y, least significant
  // first. Thresholds sit halfway between steps, (rank + 0.5) / cells.
  var bayer = function (size) {
    var bytes = new Uint8Array(size * size);
    var cells = size * size;
    for (var y = 0; y < size; y += 1) {
      for (var x = 0; x < size; x += 1) {
        var rank = 0;
        for (var bit = 1; bit < size; bit *= 2) {
          var xBit = Math.floor(x / bit) % 2;
          var yBit = Math.floor(y / bit) % 2;
          rank = rank * 4 + 2 * ((xBit + yBit) % 2) + yBit;
        }
        bytes[y * size + x] = Math.round(((rank + 0.5) / cells) * 255);
      }
    }
    return bytes;
  };
  var MATRIX_SIZES = { bayer2: 2, bayer4: 4, bayer8: 8 };

  // Any CSS colour (var(), oklch(), named) to [r, g, b, a] in 0..1, by
  // letting the browser compute it and reading one painted pixel back.
  var probeCanvas = null;
  var resolveColor = function (element, value) {
    if (!value || value === "transparent") {
      return [0, 0, 0, 0];
    }
    var probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden;color:" + value;
    element.appendChild(probe);
    var computed = getComputedStyle(probe).color;
    probe.remove();
    probeCanvas = probeCanvas || document.createElement("canvas");
    probeCanvas.width = probeCanvas.height = 1;
    var ctx = probeCanvas.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = computed;
    ctx.fillRect(0, 0, 1, 1);
    var d = ctx.getImageData(0, 0, 1, 1).data;
    var a = d[3] / 255;
    return a === 0 ? [0, 0, 0, 0] : [d[0] / 255 / a, d[1] / 255 / a, d[2] / 255 / a, a];
  };

  var compile = function (gl, type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("[dither.js] shader failed to compile\n" + gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  var normalize = function (options) {
    options = options || {};
    var field = options.field || "clouds";
    return {
      field: PRESETS[field] || field,
      cell: Math.max(1, Number(options.cell) || 3),
      levels: Math.max(2, Number(options.levels) || 17),
      matrixSize: MATRIX_SIZES[options.matrix] || 8,
      speed: options.speed === undefined ? 1 : Number(options.speed),
      stillTime: options.stillTime === undefined ? 4 : Number(options.stillTime),
      ink: options.ink || "var(--dither-ink, currentColor)",
      paper: options.paper || "transparent",
    };
  };

  // Compiles a field into a ready-to-draw program on `gl`. Returns null when
  // the field doesn't compile (the reason is logged).
  var createRenderer = function (gl, opts) {
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(opts.field));
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

    var u = function (name) {
      return gl.getUniformLocation(program, name);
    };
    var uResolution = u("u_resolution");
    var uTime = u("u_time");
    var uInk = u("u_ink");
    var uPaper = u("u_paper");
    gl.uniform1f(u("u_levels"), opts.levels);
    gl.uniform1f(u("u_matrixSize"), opts.matrixSize);
    gl.uniform1i(u("u_thresholds"), 0);

    var texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, opts.matrixSize, opts.matrixSize, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, bayer(opts.matrixSize));

    return {
      setColors: function (ink, paper) {
        gl.uniform4f(uInk, ink[0], ink[1], ink[2], ink[3]);
        gl.uniform4f(uPaper, paper[0], paper[1], paper[2], paper[3]);
      },
      draw: function (columns, rows, time) {
        gl.viewport(0, 0, columns, rows);
        gl.uniform2f(uResolution, columns, rows);
        gl.uniform1f(uTime, time);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose: function () {
        gl.deleteTexture(texture);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
      },
    };
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
      var lost = gl && gl.getExtension("WEBGL_lose_context");
      if (lost) {
        lost.loseContext();
      }
      canvas.remove();
      return function () {};
    }

    var columns = 0;
    var rows = 0;
    var visible = true;
    var frame = 0;
    var start = performance.now();

    var applyColors = function () {
      renderer.setColors(resolveColor(element, opts.ink), resolveColor(element, opts.paper));
    };

    var animated = function () {
      return opts.speed !== 0 && !reducedMotion.matches;
    };

    var tick = function (now) {
      frame = 0;
      if (columns && rows) {
        var time = animated() ? ((now - start) / 1000) * opts.speed : opts.stillTime;
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

    // Follow light/dark switches: the OS setting, and a class or data-theme
    // on <html> or <body>.
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
      var lose = gl.getExtension("WEBGL_lose_context");
      if (lose) {
        lose.loseContext();
      }
      canvas.remove();
    };
  };

  // One shared offscreen context for still frames.
  var shared = null;
  var render = function (options) {
    options = options || {};
    var opts = normalize(options);
    var width = Number(options.width) || 320;
    var height = Number(options.height) || 200;
    var columns = Math.max(1, Math.round(width / opts.cell));
    var rows = Math.max(1, Math.round(height / opts.cell));
    if (!shared) {
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
    var scope = options.element || document.body;
    renderer.setColors(resolveColor(scope, opts.ink), resolveColor(scope, opts.paper));
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
      var name = element.getAttribute("data-dither") || "clouds";
      var field = name;
      if (name.charAt(0) === "#") {
        var source = document.querySelector(name);
        field = source ? source.textContent : "clouds";
      }
      var data = element.dataset;
      element.__ditherStop = mount(element, {
        field: field,
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

  global.Dither = { mount: mount, mountAll: mountAll, render: render, presets: PRESETS };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mountAll();
    });
  } else {
    mountAll();
  }
})(window);
