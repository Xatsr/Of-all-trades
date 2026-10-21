#!/usr/bin/env python3
"""Record or load a ward handoff (ส่งเวร), transcribe it with Typhoon Whisper Turbo,
and summarize it per patient, sorted by bed number.

  python handoff.py live                 # record from the microphone, Ctrl+C to stop
  python handoff.py file recording.m4a   # transcribe an existing file (iPhone Voice Memos, etc.)
  python handoff.py summarize transcript.txt

Outputs go to ./handoffs/<timestamp>/: audio.wav (live only), transcript.txt, summary.md
"""

import argparse
import datetime as dt
import pathlib
import queue
import shutil
import subprocess
import sys
import threading

import numpy as np

SR = 16000
MODEL_ID = "typhoon-ai/typhoon-whisper-turbo"
CLAUDE_MODEL = "claude-opus-5-5"

# Segmenter: cut at a pause so each piece stays under Whisper's 30 s window.
FRAME_S = 0.03
MIN_SEG_S = 3.0
MAX_SEG_S = 25.0
PAUSE_S = 0.7


# ---------------------------------------------------------------- transcription

class Transcriber:
    def __init__(self, language, prompt=None):
        import torch
        from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

        if torch.cuda.is_available():
            self.device, dtype = "cuda", torch.float16
        elif torch.backends.mps.is_available():
            self.device, dtype = "mps", torch.float16
        else:
            self.device, dtype = "cpu", torch.float32
        print(f"Loading {MODEL_ID} on {self.device} ...", file=sys.stderr)
        self.torch = torch
        self.dtype = dtype
        self.processor = AutoProcessor.from_pretrained(MODEL_ID)
        self.model = AutoModelForSpeechSeq2Seq.from_pretrained(
            MODEL_ID, torch_dtype=dtype, low_cpu_mem_usage=True
        ).to(self.device).eval()
        # language=None lets Whisper detect per segment; "th" is the model's home language
        # and still keeps English words it recognises (CBC, IV, O2) in Latin script.
        self.gen_kwargs = {"task": "transcribe"}
        if language != "auto":
            self.gen_kwargs["language"] = language
        if prompt:
            self.gen_kwargs["prompt_ids"] = self.processor.get_prompt_ids(
                prompt, return_tensors="pt"
            ).to(self.device)
        self.prompt = prompt

    def __call__(self, segments):
        """Transcribe a list of float32 mono 16 kHz arrays (each <= 30 s)."""
        feats = self.processor(
            segments, sampling_rate=SR, return_tensors="pt"
        ).input_features.to(self.device, self.dtype)
        with self.torch.inference_mode():
            out = self.model.generate(feats, **self.gen_kwargs)
        texts = self.processor.batch_decode(out, skip_special_tokens=True)
        if self.prompt:
            texts = [t.removeprefix(" " + self.prompt).removeprefix(self.prompt) for t in texts]
        return [t.strip() for t in texts]


def split_on_pauses(audio):
    """Split a long recording into speech segments of MIN_SEG_S..MAX_SEG_S seconds.

    Returns (start_seconds, samples) pairs. Silence is judged against the
    recording's own noise floor, so it works for quiet wards and noisy ones.
    """
    hop = int(FRAME_S * SR)
    n = len(audio) // hop
    if n == 0:
        return []
    rms = np.sqrt(np.mean(audio[: n * hop].reshape(n, hop) ** 2, axis=1) + 1e-12)
    threshold = max(np.percentile(rms, 20) * 2.5, 0.004)
    voiced = rms > threshold

    segments, start, quiet = [], 0, 0
    for i in range(n):
        quiet = 0 if voiced[i] else quiet + 1
        length = (i + 1 - start) * FRAME_S
        if (length >= MIN_SEG_S and quiet * FRAME_S >= PAUSE_S) or length >= MAX_SEG_S:
            segments.append((start, i + 1))
            start, quiet = i + 1, 0
    if n - start > 0:
        segments.append((start, n))

    return [
        (s * FRAME_S, audio[s * hop : e * hop])
        for s, e in segments
        if voiced[s:e].mean() > 0.1  # drop segments that are almost all silence
    ]


def load_audio(path):
    """Decode any audio/video file (m4a, mp3, wav, mp4...) to mono 16 kHz via ffmpeg."""
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found. Install it: macOS `brew install ffmpeg`, Windows `winget install ffmpeg`.")
    raw = subprocess.run(
        ["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.float32)


def stamp(seconds):
    m, s = divmod(int(seconds), 60)
    return f"[{m:02d}:{s:02d}]"


# ---------------------------------------------------------------- live recording

def record_live(asr, out_dir):
    import sounddevice as sd
    import soundfile as sf

    frames = queue.Queue()
    segments = queue.Queue()
    transcript = open(out_dir / "transcript.txt", "w", encoding="utf-8")
    wav = sf.SoundFile(out_dir / "audio.wav", "w", SR, 1, "PCM_16")

    def worker():
        while (item := segments.get()) is not None:
            t0, seg = item
            text = asr([seg])[0]
            if text:
                line = f"{stamp(t0)} {text}"
                print(line, flush=True)
                transcript.write(line + "\n")
                transcript.flush()

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()

    hop = int(FRAME_S * SR)
    buf, total, quiet, floor = [], 0, 0, None
    seg_start = 0.0
    print("Recording... speak now. Ctrl+C to stop.\n", file=sys.stderr)
    try:
        with sd.InputStream(samplerate=SR, channels=1, dtype="float32", blocksize=hop,
                            callback=lambda data, *_: frames.put(data[:, 0].copy())):
            while True:
                chunk = frames.get()
                wav.write(chunk)
                buf.append(chunk)
                total += len(chunk)
                rms = float(np.sqrt(np.mean(chunk ** 2) + 1e-12))
                # Track the noise floor slowly so steady background noise is not "speech".
                floor = rms if floor is None else min(floor * 1.002 + 1e-6, max(floor * 0.98, rms))
                quiet = quiet + 1 if rms < max(floor * 2.5, 0.004) else 0
                length = len(buf) * FRAME_S
                if (length >= MIN_SEG_S and quiet * FRAME_S >= PAUSE_S) or length >= MAX_SEG_S:
                    segments.put((seg_start, np.concatenate(buf)))
                    seg_start = total / SR
                    buf, quiet = [], 0
    except KeyboardInterrupt:
        print("\nStopping, finishing the last segment...", file=sys.stderr)
    if buf:
        segments.put((seg_start, np.concatenate(buf)))
    segments.put(None)
    thread.join()
    wav.close()
    transcript.close()


# ---------------------------------------------------------------- file mode

def transcribe_file(asr, path, out_dir, batch_size):
    audio = load_audio(path)
    pieces = split_on_pauses(audio)
    print(f"{len(audio) / SR / 60:.1f} min of audio, {len(pieces)} segments", file=sys.stderr)
    with open(out_dir / "transcript.txt", "w", encoding="utf-8") as f:
        for i in range(0, len(pieces), batch_size):
            batch = pieces[i : i + batch_size]
            for (t0, _), text in zip(batch, asr([seg for _, seg in batch])):
                if text:
                    line = f"{stamp(t0)} {text}"
                    print(line, flush=True)
                    f.write(line + "\n")


# ---------------------------------------------------------------- summary

SUMMARY_PROMPT = """\
You turn a speech-to-text transcript of a Thai hospital ward handoff (ส่งเวร) into a handoff sheet.

The transcript comes from Thai ASR, so English medical words are often transliterated or misheard
(e.g. "นิวโมเนีย" = pneumonia, "เซฟไตรอะโซน" = ceftriaxone, "Full Roll Semi" = furosemide,
"Intech Output" = intake/output). Write medical terms, drugs, labs and abbreviations in English;
write everything else in Thai, the way a Thai doctor or nurse writes notes.

Rules:
- One section per patient, sorted by bed number (เตียง). Heading: `## เตียง <n> — <name if said>, <age/sex if said>`.
- Patients with no bed number said go last under `## ไม่ระบุเตียง`.
- Under each patient, include only what was said, as short bullets, in this order and skipping empty ones:
  **Dx**, **ปัญหาตอนนี้ / อาการ**, **V/S & O2**, **Lines / tubes / drains**, **Meds สำคัญ**,
  **Lab / imaging ที่ต้องตาม**, **ต้องทำเวรนี้** (as `- [ ]` checkboxes), **⚠️ ต้องระวัง**.
- Never invent findings, doses or numbers. If a word or number is unclear from the transcript, keep your
  best reading and mark it `(?)`.
- Start with a 1-3 line `# สรุปส่งเวร` overview: number of patients and the sickest / most urgent beds.
- End with `## ⚠️ To-do รวมเรียงตามความเร่งด่วน`: every pending task across patients, each prefixed with its bed number.
"""


def summarize(transcript_text, out_path):
    import anthropic

    client = anthropic.Anthropic()
    print("\nSummarizing with Claude...\n", file=sys.stderr)
    try:
        with client.beta.messages.stream(
            model=CLAUDE_MODEL,
            max_tokens=32000,
            output_config={"effort": "high"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=SUMMARY_PROMPT,
            messages=[{"role": "user", "content": f"<transcript>\n{transcript_text}\n</transcript>"}],
        ) as stream:
            for text in stream.text_stream:
                print(text, end="", flush=True)
            message = stream.get_final_message()
    except anthropic.AuthenticationError:
        sys.exit("Claude API key missing or invalid. Set ANTHROPIC_API_KEY (https://platform.claude.com/settings/keys) "
                 "or rerun later with: python handoff.py summarize <transcript.txt>")
    except anthropic.APIConnectionError:
        sys.exit("Could not reach the Claude API. The transcript is saved; rerun `summarize` when online.")
    print()
    if message.stop_reason == "refusal":
        sys.exit("Claude declined to summarize this transcript.")
    summary = "".join(b.text for b in message.content if b.type == "text")
    out_path.write_text(summary, encoding="utf-8")
    print(f"\nSaved {out_path}", file=sys.stderr)


# ---------------------------------------------------------------- CLI

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="mode", required=True)
    for name in ("live", "file"):
        sp = sub.add_parser(name)
        if name == "file":
            sp.add_argument("audio", type=pathlib.Path)
            sp.add_argument("--batch-size", type=int, default=4)
        sp.add_argument("--language", default="th", help="th (default) or auto")
        sp.add_argument("--prompt", help="optional hint text, e.g. ward vocabulary, to bias spelling")
        sp.add_argument("--no-summary", action="store_true", help="transcribe only, do not call Claude")
    sp = sub.add_parser("summarize")
    sp.add_argument("transcript", type=pathlib.Path)
    args = p.parse_args()

    if args.mode == "summarize":
        summarize(args.transcript.read_text(encoding="utf-8"), args.transcript.with_name("summary.md"))
        return

    out_dir = pathlib.Path("handoffs") / dt.datetime.now().strftime("%Y-%m-%d_%H%M")
    out_dir.mkdir(parents=True, exist_ok=True)
    asr = Transcriber(args.language, args.prompt)
    if args.mode == "live":
        record_live(asr, out_dir)
    else:
        transcribe_file(asr, args.audio, out_dir, args.batch_size)
    print(f"\nTranscript: {out_dir / 'transcript.txt'}", file=sys.stderr)

    text = (out_dir / "transcript.txt").read_text(encoding="utf-8")
    if not text.strip():
        sys.exit("Nothing was transcribed.")
    if not args.no_summary:
        summarize(text, out_dir / "summary.md")


if __name__ == "__main__":
    main()
