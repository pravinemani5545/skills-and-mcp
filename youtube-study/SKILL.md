---
name: youtube-study
description: Use when the user shares a YouTube URL or video ID and wants it summarized, analyzed, studied, transcribed, fact-checked, compared, or used as source material — "watch this", "what does this video say", "summarize this talk", "pull the transcript", "what are the comments saying". Also for batches of videos or channel research.
---

# YouTube Study

Convert a YouTube video into text + images Claude can analyze: transcript, metadata, chapters, comments, and (when needed) Whisper audio or Gemini visual analysis. Claude cannot ingest video directly — this pipeline is the substitute. Runs on the local Mac (residential IP), which is what makes it reliable; never move this to a cloud host.

## Workspace

Cache per video so repeat questions skip refetching:

```bash
ID=$(yt-dlp --print id "$URL")   # accepts any YouTube URL form
DIR=~/.cache/youtube-study/$ID && mkdir -p "$DIR" && cd "$DIR"
```

## Tier 1 — transcript + metadata + comments (default, covers ~90%)

```bash
# Captions (manual preferred, auto fallback) + full metadata. en only — "en.*" pulls
# auto-translated tracks and trips 429s.
yt-dlp --skip-download --write-info-json --write-subs --write-auto-subs \
  --sub-langs en --sub-format vtt --sleep-requests 1 -o "vid" "$URL"

# Clean to timestamped text (dedupes rolling ASR captions — feeding raw VTT ~4x token cost):
python3 ~/.claude/skills/youtube-study/scripts/clean_transcript.py vid.en.vtt > transcript.txt

# Comments only if the question involves audience reaction. Field order matters:
# max_comments = total,parents,replies — N,0,0 silently returns ZERO comments.
yt-dlp --skip-download --write-comments \
  --extractor-args "youtube:comment_sort=top;max_comments=100,100,0" -o "vidc" "$URL"
```

Then Read `transcript.txt` and pull metadata from `vid.info.json` with jq: `.title, .channel, .upload_date, .duration_string, .view_count, .like_count, .description, .chapters` (chapters + description are high-signal — use them to structure the analysis). Comments live in `vidc.info.json` → `.comments[] | {author, text, like_count}`.

A 1-hour video ≈ 12k words cleaned. Over ~3 hours, summarize per chapter-range rather than whole-transcript.

## Tier 2 — no captions exist

`vid.en.vtt` missing → transcribe locally (~15x realtime on Apple Silicon):

```bash
yt-dlp -x --audio-format mp3 --sleep-requests 1 -o "audio.%(ext)s" "$URL"
mlx_whisper audio.mp3 --model mlx-community/whisper-large-v3-turbo --output-format vtt
# one-time install: pipx install mlx-whisper   (never pip3)
```

Then clean the VTT as in Tier 1. Whisper hallucinates on music/long silence ("Thank you for watching") — distrust those lines.

## Tier 3 — visual questions (what's on screen, demos, charts, editing)

Gemini is the only API that ingests a YouTube URL directly (public videos only; free ≤8h/day). `GEMINI_API_KEY` is in `~/.env`:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" -H 'Content-Type: application/json' \
  -d "{\"contents\":[{\"parts\":[{\"file_data\":{\"file_uri\":\"$URL\"}},
       {\"text\":\"<visual question — ask for MM:SS timestamps>\"}]}]}" \
  | jq -r '.candidates[0].content.parts[0].text'
```

For frame-level inspection instead: `yt-dlp -f "bv*[height<=720]" -o video.mp4 "$URL"`, then `ffmpeg -i video.mp4 -vf "fps=1/30" frame_%03d.jpg` and Read the frames as images.

## Rules

- **Never use `--cookies-from-browser`** — YouTube permanently bans the logged-in account. Skip age-restricted videos instead.
- Always `--sleep-requests 1`; never fan out parallel yt-dlp calls across many videos — loop sequentially.
- yt-dlp stale = pipeline breaks. On extractor errors, first run `brew upgrade yt-dlp` and retry.
- Don't install YouTube MCP servers for this — most wrap `youtube-transcript-api`, which YouTube blocks; this local pipeline is the reliable path.
