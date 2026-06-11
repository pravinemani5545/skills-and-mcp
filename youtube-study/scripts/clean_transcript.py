#!/usr/bin/env python3
"""Clean a YouTube .vtt/.srt caption file into compact timestamped text.

YouTube auto-captions (ASR) are "rolling": each cue repeats the previous
line before adding the new one, which roughly triples token count if fed
to a model raw. This script strips VTT/SRT headers, inline <c>/<00:00:00>
tags, and rolling duplicates, then emits one paragraph per ~30s window
prefixed with a [MM:SS] timestamp so quotes stay locatable.

Usage: clean_transcript.py CAPTIONS.vtt [> transcript.txt]
"""
import re
import sys

INTERVAL = 30  # seconds between emitted timestamp markers


def ts_to_sec(ts: str) -> float:
    h, m, s = ts.replace(",", ".").split(":")
    return int(h) * 3600 + int(m) * 60 + float(s)


def fmt(sec: float) -> str:
    m, s = divmod(int(sec), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m:02d}:{s:02d}"


def main(path: str) -> None:
    text = open(path, encoding="utf-8").read()
    cue_re = re.compile(
        r"(\d{2}:\d{2}:\d{2}[.,]\d{3}) --> [^\n]*\n(.*?)(?=\n\n|\Z)", re.S
    )
    paragraphs: list[tuple[str, list[str]]] = []  # (timestamp, lines)
    prev_lines: list[str] = []
    window_start = None

    for m in cue_re.finditer(text):
        start = ts_to_sec(m.group(1))
        block = re.sub(r"<[^>]+>", "", m.group(2))
        lines = [
            l.strip()
            for l in block.splitlines()
            if l.strip() and not l.strip().isdigit()
        ]
        fresh = [l for l in lines if l not in prev_lines]
        if lines:
            prev_lines = lines
        if not fresh:
            continue
        if window_start is None or start - window_start >= INTERVAL:
            window_start = start
            paragraphs.append((fmt(start), []))
        # consecutive identical lines inside a window are also ASR noise
        for l in fresh:
            if not paragraphs[-1][1] or paragraphs[-1][1][-1] != l:
                paragraphs[-1][1].append(l)

    for ts, lines in paragraphs:
        print(f"[{ts}] " + " ".join(lines))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
