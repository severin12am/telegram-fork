#!/usr/bin/env python3
"""Build three Russian Opus/OGG voice notes.

Each word is gTTS, then time-stretched so its duration follows syllable
(vowel) count — the same cue Voice Score uses — and concatenated with
comma/period pauses. After the Opus round-trip, JSON timestamps are scaled
to the decoded media duration.
"""
from __future__ import annotations

import json
import re
import struct
import subprocess
import tempfile
from pathlib import Path

from gtts import gTTS

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src/lib/forkFeatures/layoutTest/media"
SAMPLE_RATE = 48000
MS_PER_SYLLABLE = 340
MIN_WORD_MS = 280
MAX_WORD_MS = 2000
VOWELS = set("аеёиоуыэюяaeiouyАЕЁИОУЫЭЮЯAEIOUY")

CLIPS = [
    {
        "id": "peach",
        "transcript": (
            "Почему второе и третье они черного цвета? "
            "Они вот это, которые типа розовые, персиковые, они прикольные. "
            "Ну, в общем, все прикольно, красиво, эстетично."
        ),
        "long_pause_after": None,
    },
    {
        "id": "park",
        "transcript": "Вчера вечером мы гуляли в парке. Потом зашли в кафе и заказали чай.",
        "long_pause_after": "парке.",
    },
    {
        "id": "vpn",
        "transcript": "Нет, если это крысавпн, тогда не бери. Лучше возьми обычный.",
        "long_pause_after": "крысавпн,",
    },
]


def tokenize(text: str) -> list[tuple[str, str]]:
    return [(m.group(1), m.group(2) or "") for m in re.finditer(r"(\S+)(\s*)", text)]


def syllables(word: str) -> int:
    letters = re.sub(r"[^\wа-яА-ЯёЁ]", "", word, flags=re.UNICODE)
    n = sum(1 for ch in letters if ch in VOWELS)
    return max(1, n)


def pause_ms(token: str, trailing: str, long_pause_after: str | None, last: bool) -> int:
    if last:
        return 90
    if long_pause_after and token == long_pause_after:
        return 240
    return 90


def tts_word(word: str, dest: Path) -> None:
    spoken = re.sub(r"[^\wа-яА-ЯёЁ-]+", "", word, flags=re.UNICODE) or word
    gTTS(text=spoken, lang="ru", slow=False).save(str(dest))


def decode_pcm(path: Path, rate: int = SAMPLE_RATE) -> bytes:
    return subprocess.check_output(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", str(rate), "-f", "s16le", "pipe:1"]
    )


def pcm_duration_ms(pcm: bytes, rate: int = SAMPLE_RATE) -> float:
    return len(pcm) / 2 / rate * 1000


def pcm_to_wav(pcm: bytes, dest: Path, rate: int = SAMPLE_RATE) -> None:
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF", 36 + len(pcm), b"WAVE", b"fmt ", 16, 1, 1, rate, rate * 2, 2, 16, b"data", len(pcm),
    )
    dest.write_bytes(header + pcm)


def silence(ms: int, rate: int = SAMPLE_RATE) -> bytes:
    return b"\x00\x00" * int(rate * ms / 1000)


def rms(pcm: bytes, start: int, length: int) -> float:
    if length <= 0 or start < 0 or start + length > len(pcm):
        return 0.0
    total = 0.0
    count = 0
    for i in range(start, start + length, 2):
        sample = struct.unpack_from("<h", pcm, i)[0]
        total += sample * sample
        count += 1
    return (total / max(1, count)) ** 0.5


def peak_rms(pcm: bytes, rate: int = SAMPLE_RATE) -> float:
    frame = rate // 100 * 2
    best = 0.0
    for start in range(0, max(0, len(pcm) - frame) + 1, frame):
        best = max(best, rms(pcm, start, min(frame, len(pcm) - start)))
    return best


def trim_pcm(pcm: bytes, rate: int = SAMPLE_RATE, floor: float | None = None) -> bytes:
    frame = rate // 100 * 2
    gate = floor if floor is not None else max(220.0, peak_rms(pcm, rate) * 0.12)
    start = 0
    while start + frame <= len(pcm) and rms(pcm, start, frame) < gate:
        start += frame
    end = len(pcm)
    while end - frame >= start and rms(pcm, end - frame, frame) < gate:
        end -= frame
    return pcm[start:end] or pcm


def ensure_onset(pcm: bytes, rate: int = SAMPLE_RATE) -> bytes:
    """Keep the first milliseconds clearly voiced so Opus does not swallow the attack."""
    if len(pcm) < 4:
        return pcm
    peak = peak_rms(pcm, rate) or 1.0
    target = max(1800.0, peak * 0.55)
    attack = min(len(pcm), int(rate * 0.025) * 2)
    samples = [struct.unpack_from("<h", pcm, i)[0] for i in range(0, len(pcm), 2)]
    head = samples[: attack // 2]
    if not head:
        return pcm
    current = (sum(s * s for s in head) / len(head)) ** 0.5
    gain = min(6.0, target / max(1.0, current))
    for i in range(len(head)):
        ramp = 0.35 + 0.65 * (i / max(1, len(head) - 1))
        samples[i] = int(max(-32767, min(32767, samples[i] * gain * ramp)))
    return b"".join(struct.pack("<h", s) for s in samples)


def atempo_chain(ratio: float) -> str:
    filters = []
    r = ratio
    while r > 2.0:
        filters.append("atempo=2.0")
        r /= 2.0
    while r < 0.5:
        filters.append("atempo=0.5")
        r /= 0.5
    filters.append(f"atempo={r:.5f}")
    return ",".join(filters)


def stretch_pcm(pcm: bytes, target_ms: float, tmp: Path, tag: str, rate: int = SAMPLE_RATE) -> bytes:
    current = pcm_duration_ms(pcm, rate)
    if current <= 1 or abs(current - target_ms) < 12:
        return pcm
    ratio = current / target_ms
    src = tmp / f"{tag}-in.wav"
    dst = tmp / f"{tag}-out.wav"
    pcm_to_wav(pcm, src, rate)
    subprocess.check_call([
        "ffmpeg", "-y", "-v", "error", "-i", str(src),
        "-filter:a", atempo_chain(ratio),
        str(dst),
    ])
    return decode_pcm(dst, rate)


def encode_opus(wav: Path, ogg: Path) -> None:
    subprocess.check_call([
        "ffmpeg", "-y", "-v", "error", "-i", str(wav),
        "-c:a", "libopus", "-b:a", "32k", "-ar", str(SAMPLE_RATE), "-ac", "1",
        "-application", "voip", str(ogg),
    ])


def build_clip(spec: dict, tmp: Path) -> dict:
    tokens = tokenize(spec["transcript"])
    parts: list[bytes] = []
    words = []
    cursor_bytes = 0
    long_after = spec["long_pause_after"]

    for index, (word, trailing) in enumerate(tokens):
        mp3 = tmp / f"{spec['id']}-{index}.mp3"
        tts_word(word, mp3)
        body = trim_pcm(decode_pcm(mp3))
        target = min(MAX_WORD_MS, max(MIN_WORD_MS, syllables(word) * MS_PER_SYLLABLE))
        body = stretch_pcm(body, target, tmp, f"{spec['id']}-{index}")
        body = ensure_onset(trim_pcm(body))
        start_ms = cursor_bytes / 2 / SAMPLE_RATE * 1000
        parts.append(body)
        cursor_bytes += len(body)
        end_ms = cursor_bytes / 2 / SAMPLE_RATE * 1000
        pad = silence(pause_ms(word, trailing, long_after, index == len(tokens) - 1))
        parts.append(pad)
        cursor_bytes += len(pad)
        words.append({
            "word": word,
            "index": index,
            "startMs": round(start_ms, 1),
            "endMs": round(end_ms, 1),
            "syllables": syllables(word),
        })

    wav_pcm = b"".join(parts) + silence(400)
    wav_path = tmp / f"{spec['id']}-pre.wav"
    pcm_to_wav(wav_pcm, wav_path)
    ogg_path = OUT / f"voice-{spec['id']}.ogg"
    encode_opus(wav_path, ogg_path)

    decoded = decode_pcm(ogg_path)
    pre_ms = pcm_duration_ms(wav_pcm)
    post_ms = pcm_duration_ms(decoded)
    scale = post_ms / max(1.0, pre_ms)
    for item in words:
        item["startMs"] = round(item["startMs"] * scale, 1)
        item["endMs"] = round(item["endMs"] * scale, 1)

    return {
        "id": spec["id"],
        "transcript": spec["transcript"],
        "ogg": ogg_path.name,
        "durationMs": round(post_ms, 1),
        "sampleRate": SAMPLE_RATE,
        "codec": "opus",
        "container": "ogg",
        "words": words,
    }


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as raw:
        tmp = Path(raw)
        clips = [build_clip(spec, tmp) for spec in CLIPS]
    (OUT / "voice-clips.json").write_text(json.dumps({"clips": clips}, ensure_ascii=False, indent=2) + "\n")
    peach = next(c for c in clips if c["id"] == "peach")
    (OUT / "russian-voice-onsets.json").write_text(json.dumps({
        "transcript": peach["transcript"],
        "durationMs": peach["durationMs"],
        "sampleRate": peach["sampleRate"],
        "ogg": peach["ogg"],
        "words": peach["words"],
    }, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps([
        {"id": c["id"], "durationMs": c["durationMs"], "words": len(c["words"]), "file": c["ogg"]}
        for c in clips
    ], indent=2))


if __name__ == "__main__":
    main()
