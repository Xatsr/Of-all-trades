// Worker: Typhoon ASR Realtime (FastConformer RNN-T, int8 ONNX, ~138 MB) on onnxruntime-web.
// Small enough for iPhone Safari, where the 560 MB Whisper model runs out of memory.
// Features and decoding follow sherpa-onnx's NeMo transducer recipe so the exported model
// sees exactly what it was converted for (checked against sherpa-onnx output).
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
ort.env.wasm.numThreads = 1;  // GitHub Pages is not cross-origin isolated, so no wasm threads

// sherpa-onnx export of scb10x/typhoon-asr-realtime, pinned to a revision.
const REPO = 'https://huggingface.co/edtzforai/typhoon-asr-int8-onnx/resolve/ac0644a741e432bb17772e3b17621de6ea6a599d/';
const FILES = { encoder: 'encoder.int8.onnx', decoder: 'decoder.int8.onnx', joiner: 'joiner.int8.onnx', tokens: 'tokens.txt' };
const SIZES = { 'encoder.int8.onnx': 131113606, 'decoder.int8.onnx': 4611223, 'joiner.int8.onnx': 2067638, 'tokens.txt': 35094 };
const CACHE = 'typhoon-asr-realtime-v1';

// ---------------------------------------------------------------- on-device storage
// Model files go in the Origin Private File System (OPFS), which Safari keeps more reliably than
// the Cache API for large files; the Cache API is the fallback. `saved` records whether every
// file made it to disk, so the page can say when the next visit will have to download again.
let saved = true, fromDisk = true;

async function opfsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(CACHE, { create: true });
}

async function readStored(name) {
  try {
    const file = await (await (await opfsDir()).getFileHandle(name)).getFile();
    if (file.size === SIZES[name]) return new Uint8Array(await file.arrayBuffer());
  } catch {}
  try {
    const hit = await (await caches.open(CACHE)).match(REPO + name);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {}
  return null;
}

async function store(name, bytes) {
  try {
    const handle = await (await opfsDir()).getFileHandle(name, { create: true });
    const access = await handle.createSyncAccessHandle();  // worker-only API, Safari 15.2+
    try {
      access.truncate(0);
      if (access.write(bytes, { at: 0 }) !== bytes.length) throw new Error('short write');
      access.flush();
    } finally { access.close(); }
    return true;
  } catch {}
  try { await (await caches.open(CACHE)).put(REPO + name, new Response(bytes)); return true; } catch {}
  return false;
}

// ---------------------------------------------------------------- download with progress
async function getFile(name) {
  const stored = await readStored(name);
  if (stored) {
    self.postMessage({ type: 'progress', file: name, loaded: stored.length, total: stored.length });
    return stored;
  }
  fromDisk = false;
  const url = REPO + name;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${name}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || SIZES[name];
  const reader = res.body.getReader();
  const buf = new Uint8Array(total);
  let loaded = 0, chunks = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (chunks || loaded + value.length > buf.length) { chunks = chunks || [buf.subarray(0, loaded)]; chunks.push(value); }
    else buf.set(value, loaded);
    loaded += value.length;
    self.postMessage({ type: 'progress', file: name, loaded, total });
  }
  let out = buf.subarray(0, loaded);
  if (chunks) { out = new Uint8Array(loaded); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; } }
  if (!(await store(name, out))) saved = false;
  return out;
}

// ---------------------------------------------------------------- features: 80-bin log-mel (kaldi framing, librosa/slaney mel)
const SR = 16000, WIN = 400, HOP = 160, NFFT = 512, NBINS = 80, PREEMPH = 0.97;
const LOG_FLOOR = 1.1920929e-7;

const window_ = new Float64Array(WIN);
for (let i = 0; i < WIN; i++) window_[i] = Math.pow(0.5 - 0.5 * Math.cos(2 * Math.PI * i / (WIN - 1)), 0.85);  // povey

const melSlaney = f => f <= 1000 ? f * 3 / 200 : 15 + 14.545078505785561 * Math.log(f / 1000);
const invMelSlaney = m => m <= 15 ? 200 / 3 * m : 1000 * Math.exp((m - 15) * 0.06875177742094911);
const melBank = (() => {
  const lo = melSlaney(0), hi = melSlaney(SR / 2 - 400), d = (hi - lo) / (NBINS + 1);
  const bins = [];
  for (let b = 0; b < NBINS; b++) {
    const [l, c, r] = [0, 1, 2].map(k => invMelSlaney(lo + (b + k) * d));
    const w = [];
    let start = -1;
    for (let i = 0; i <= NFFT / 2; i++) {
      const hz = i * SR / NFFT;
      if (hz > l && hz < r) {
        if (start < 0) start = i;
        w.push((hz <= c ? (hz - l) / (c - l) : (r - hz) / (r - c)) * 2 / (r - l));
      }
    }
    bins.push({ start, w: Float64Array.from(w) });
  }
  return bins;
})();

// In-place radix-2 complex FFT of size NFFT.
const bitrev = new Uint16Array(NFFT), cosT = new Float64Array(NFFT / 2), sinT = new Float64Array(NFFT / 2);
for (let i = 0, j = 0; i < NFFT; i++) {
  bitrev[i] = j;
  let bit = NFFT >> 1;
  while (j & bit) { j ^= bit; bit >>= 1; }
  j |= bit;
}
for (let i = 0; i < NFFT / 2; i++) { cosT[i] = Math.cos(2 * Math.PI * i / NFFT); sinT[i] = -Math.sin(2 * Math.PI * i / NFFT); }
function fft(re, im) {
  for (let i = 0; i < NFFT; i++) {
    const j = bitrev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let size = 2; size <= NFFT; size <<= 1) {
    const half = size >> 1, step = NFFT / size;
    for (let i = 0; i < NFFT; i += size) {
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, wr = cosT[k * step], wi = sinT[k * step];
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

// Returns normalized features laid out [NBINS, T] (what the encoder expects) and T.
function features(x) {
  const N = x.length, T = Math.floor((N + HOP / 2) / HOP);
  const feats = new Float32Array(NBINS * T);
  const re = new Float64Array(NFFT), im = new Float64Array(NFFT), power = new Float64Array(NFFT / 2 + 1);
  for (let t = 0; t < T; t++) {
    const start = t * HOP + HOP / 2 - WIN / 2;
    for (let s = 0; s < WIN; s++) {
      let k = start + s;
      while (k < 0 || k >= N) k = k < 0 ? -k - 1 : 2 * N - 1 - k;  // reflect at the edges
      re[s] = x[k];
    }
    for (let s = WIN - 1; s > 0; s--) re[s] -= PREEMPH * re[s - 1];
    re[0] -= PREEMPH * re[0];
    for (let s = 0; s < WIN; s++) re[s] *= window_[s];
    re.fill(0, WIN); im.fill(0);
    fft(re, im);
    for (let i = 0; i <= NFFT / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    for (let b = 0; b < NBINS; b++) {
      const { start: s0, w } = melBank[b];
      let e = 0;
      for (let i = 0; i < w.length; i++) e += w[i] * power[s0 + i];
      feats[b * T + t] = Math.log(Math.max(e, LOG_FLOOR));
    }
  }
  // NeMo per_feature normalization: each mel bin to zero mean, unit variance over time.
  for (let b = 0; b < NBINS; b++) {
    const row = feats.subarray(b * T, (b + 1) * T);
    let mean = 0;
    for (let t = 0; t < T; t++) mean += row[t];
    mean /= T;
    let v = 0;
    for (let t = 0; t < T; t++) v += (row[t] - mean) ** 2;
    const inv = 1 / (Math.sqrt(v / T) + 1e-5);
    for (let t = 0; t < T; t++) row[t] = (row[t] - mean) * inv;
  }
  return { feats, T };
}

// ---------------------------------------------------------------- model + greedy RNN-T decoding
let enc, dec, joi, tokens, blank;

async function load() {
  const [e, d, j, t] = await Promise.all([FILES.encoder, FILES.decoder, FILES.joiner, FILES.tokens].map(getFile));
  self.postMessage({ type: 'progress', status: 'ready' });
  const opts = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
  enc = await ort.InferenceSession.create(e, opts);
  dec = await ort.InferenceSession.create(d, opts);
  joi = await ort.InferenceSession.create(j, opts);
  tokens = new TextDecoder().decode(t).split('\n').filter(Boolean).map(l => l.slice(0, l.lastIndexOf(' ')));
  blank = tokens.length - 1;  // <blk>
}

async function runDecoder(token, state) {
  const out = await dec.run({
    'targets': new ort.Tensor('int32', Int32Array.of(token), [1, 1]),
    'target_length': new ort.Tensor('int32', Int32Array.of(1), [1]),
    'states.1': state[0],
    'onnx::LSTM_3': state[1],
  });
  const [o, , h, c] = dec.outputNames.map(n => out[n]);
  return { out: o, state: [h, c] };
}

async function transcribe(x) {
  if (x.length < HOP * 10) return '';
  const { feats, T } = features(x);
  const e = await enc.run({
    'audio_signal': new ort.Tensor('float32', feats, [1, NBINS, T]),
    'length': new ort.Tensor('int64', BigInt64Array.of(BigInt(T)), [1]),
  });
  const encOut = e[enc.outputNames[0]], frames = Number(e[enc.outputNames[1]].data[0]);
  const D = encOut.dims[1], Tenc = encOut.dims[2], ed = encOut.data;
  const zeros = () => new ort.Tensor('float32', new Float32Array(640), [1, 1, 640]);
  let { out: decOut, state } = await runDecoder(blank, [zeros(), zeros()]);
  const col = new Float32Array(D), ys = [];
  for (let t = 0; t < frames; t++) {
    for (let c = 0; c < D; c++) col[c] = ed[c * Tenc + t];
    const encCol = new ort.Tensor('float32', col.slice(), [1, D, 1]);
    for (let q = 0; q < 10; q++) {
      const lg = (await joi.run({ 'encoder_outputs': encCol, 'decoder_outputs': decOut }))[joi.outputNames[0]].data;
      let y = 0;
      for (let k = 1; k < lg.length; k++) if (lg[k] > lg[y]) y = k;
      if (y === blank) break;
      ys.push(y);
      ({ out: decOut, state } = await runDecoder(y, state));
    }
  }
  return ys.map(i => tokens[i]).join('').replaceAll('▁', ' ').trim();
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      await load();
      await transcribe(new Float32Array(SR));  // warm up
      self.postMessage({ type: 'ready', fromDisk, saved });
    } else if (data.type === 'transcribe') {
      self.postMessage({ type: 'result', id: data.id, text: await transcribe(data.audio) });
    }
  } catch (e) {
    self.postMessage({ type: 'error', id: data.id, message: String(e && e.message || e) });
  }
};
