/*
 * dither.js — a dependency-free port of the dithercn engine's DitherShader
 * for plain HTML pages (no React, no build step). Ordered Bayer dithering on
 * WebGL, in your page's colours, with resizing, offscreen pausing and
 * reduced motion handled.
 *
 * Based on dithercn (https://github.com/opencoredev/dithercn), MIT, (c) Leo.
 *
 * Use it two ways:
 *
 *   1. Markup only. Give an element `data-dither` with a preset name, or the
 *      id of a <script type="x-shader/x-field"> that holds a GLSL `field`:
 *
 *        <div class="hero" data-dither="clouds"></div>
 *        <div class="hero" data-dither="#my-field" data-cell="4"></div>
 *
 *   2. JavaScript:
 *
 *        const stop = Dither.mount(element, { field: "...", cell: 3 });
 *
 * Options (attribute form in brackets):
 *   field      GLSL source defining `float field(vec2 uv, vec2 res, float t)`,
 *              or a preset name: gradient, clouds, waves, rings, glow, aurora
 *   cell       pixel size of one dither cell            [data-cell]     3
 *   levels     tone steps the field is quantised to     [data-levels]   17
 *   matrix     "bayer2" | "bayer4" | "bayer8"           [data-matrix]   bayer8
 *   speed      time multiplier, 0 for a still image     [data-speed]    1
 *   stillTime  time shown when motion is reduced        [data-still]    4
 *   ink        CSS colour of the dots                   [data-ink]      var(--dither-ink)
 *   paper      CSS colour of the ground, or transparent [data-paper]    transparent
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

  // Each preset returns a tone in [0, 1]: 0 paper, 1 ink.
  var PRESETS = {
    gradient: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  return smoothstep(0.0, 1.0, 1.0 - uv.y);",
      "}",
    ].join("\n"),
    clouds: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  return fbm(p * 2.5 + vec2(t * 0.03, 0.0)) * smoothstep(0.0, 0.7, 1.0 - uv.y);",
      "}",
    ].join("\n"),
    waves: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float w = sin(p.x * 6.0 + t * 0.4 + sin(p.y * 4.0 - t * 0.3) * 1.5);",
      "  return (0.5 + 0.5 * w) * smoothstep(1.0, 0.0, uv.y) * 0.9;",
      "}",
    ].join("\n"),
    rings: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  vec2 p = (uv - 0.5) * vec2(res.x / res.y, 1.0);",
      "  float d = length(p);",
      "  float r = 0.5 + 0.5 * sin(d * 40.0 - t * 1.2);",
      "  return r * exp(-d * 2.5);",
      "}",
    ].join("\n"),
    glow: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  vec2 p = (uv - vec2(0.5, 0.15)) * vec2(res.x / res.y, 1.0);",
      "  float pulse = 1.0 + 0.05 * sin(t * 0.6);",
      "  return exp(-dot(p, p) * 6.0 / pulse);",
      "}",
    ].join("\n"),
    aurora: [
      "float field(vec2 uv, vec2 res, float t) {",
      "  vec2 p = vec2(uv.x * res.x / res.y, uv.y);",
      "  float sway = fbm(vec2(p.x * 1.2 + t * 0.02, t * 0.03)) - 0.5;",
      "  float y = uv.y - 0.6 - sway * 0.5;",
      "  float band = exp(-y * y * 30.0);",
      "  float rays = 0.6 + 0.4 * fbm(vec2(p.x * 8.0, t * 0.05));",
      "  return band * rays * smoothstep(0.0, 0.4, uv.y);",
      "}",
    ].join("\n"),
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

  var reducedMotion = global.matchMedia
    ? global.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  var mount = function (element, options) {
    options = options || {};
    var field = options.field || "clouds";
    field = PRESETS[field] || field;
    var cell = Math.max(1, Number(options.cell) || 3);
    var levels = Math.max(2, Number(options.levels) || 17);
    var matrixSize = MATRIX_SIZES[options.matrix] || 8;
    var speed = options.speed === undefined ? 1 : Number(options.speed);
    var stillTime = options.stillTime === undefined ? 4 : Number(options.stillTime);
    var inkValue = options.ink || "var(--dither-ink, currentColor)";
    var paperValue = options.paper || "transparent";

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
    if (!gl) {
      canvas.remove();
      return function () {};
    }
    var vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
    var fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(field));
    if (!vertex || !fragment) {
      canvas.remove();
      return function () {};
    }
    var program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
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
    gl.uniform1f(u("u_levels"), levels);
    gl.uniform1f(u("u_matrixSize"), matrixSize);
    gl.uniform1i(u("u_thresholds"), 0);

    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, matrixSize, matrixSize, 0,
      gl.LUMINANCE, gl.UNSIGNED_BYTE, bayer(matrixSize));

    var columns = 0;
    var rows = 0;
    var visible = true;
    var frame = 0;
    var start = performance.now();

    var applyColors = function () {
      var ink = resolveColor(element, inkValue);
      var paper = resolveColor(element, paperValue);
      gl.uniform4f(uInk, ink[0], ink[1], ink[2], ink[3]);
      gl.uniform4f(uPaper, paper[0], paper[1], paper[2], paper[3]);
    };

    var animated = function () {
      return speed !== 0 && !reducedMotion.matches;
    };

    var draw = function (now) {
      if (!columns || !rows) {
        return;
      }
      var time = animated() ? ((now - start) / 1000) * speed : stillTime;
      gl.viewport(0, 0, columns, rows);
      gl.uniform2f(uResolution, columns, rows);
      gl.uniform1f(uTime, time);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    var tick = function (now) {
      frame = 0;
      draw(now);
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
      columns = Math.max(1, Math.round(rect.width / cell));
      rows = Math.max(1, Math.round(rect.height / cell));
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
    reducedMotion.addEventListener && reducedMotion.addEventListener("change", schedule);
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
      reducedMotion.removeEventListener && reducedMotion.removeEventListener("change", schedule);
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      canvas.remove();
    };
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

  global.Dither = { mount: mount, mountAll: mountAll, presets: PRESETS };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      mountAll();
    });
  } else {
    mountAll();
  }
})(window);
