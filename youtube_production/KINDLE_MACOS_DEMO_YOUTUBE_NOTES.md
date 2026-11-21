# Codecaine File Manager — Kindle Open-Book Reader for macOS · YouTube Upload Notes

## Rendered Master Deliverables

- **Master 1080p MP4**: `youtube_production/codecaine_file_manager_kindle_macos_demo_1080p.mp4`
  - **Resolution & FPS**: 1920×1080 (16:9), 30 fps
  - **Video Codec**: H.264 High Profile, `yuv420p`, CRF 13, `+faststart`
  - **Audio Track**: 320 kbps AAC-LC, 48 kHz stereo (AI Russell mastered + ducked Anthem bed)
  - **Duration & Size**: 3:09 (21.3 MB)
- **YouTube Thumbnail (1280×720)**: `youtube_production/codecaine_file_manager_kindle_macos_demo_thumbnail.png`
- **QA Verification Frames**: `youtube_production/kindle_macos_demo/qa_frames/*.png`
- **Storyboard Script**: `youtube_production/kindle_macos_demo/storyboard.json`

---

## High-CTR YouTube Title Ideas (Under 100 Characters)

1. `Kindle Open-Book Reader for macOS: Read Word-by-Word & Export Synced Read-Along .MP4 (100% Local)`
2. `Turn Any Open Kindle Book into Synced Read-Along .MP4 Videos & .M4B Audiobooks on Apple Silicon`
3. `Codecaine File Manager for macOS: 2-Column Kindle Vision OCR, Book View & Local AI Narration`

---

## YouTube Description (Copy & Paste)

```text
Introducing the macOS-exclusive Kindle Open-Book Reader inside Codecaine File Manager! Turn any open Amazon Kindle or Kindle Cloud Reader book into word-by-word Book View reading, synced 1080p Read-Along .MP4 videos, chaptered .M4B audiobooks, mastered .MP3 audio, .SRT/.VTT subtitles, and clean Markdown — 100% locally on Apple Silicon with zero cloud uploads.

🍎 macOS EXCLUSIVE FEATURE:
• Uses native CoreGraphics (CGWindowListCopyWindowInfo), Apple Vision OCR (VNRecognizeTextRequest), and AppleScript across desktop Spaces — while keeping Linux & Windows builds completely clean and uncluttered.
• Full-Screen Space Detection: Finds open Kindle windows even on other Spaces (e.g. 1728×1084) while ignoring toolbar strips and File Manager itself.
• 2-Column Spread OCR & Header Book Title Extraction: Reads left column completely before right column and auto-fills Output Filename from the clean book title.
• Whole-Book Capture (Up to 5,000 Pages): Skip Cover/Copyright/TOC front fluff (Start at Intro or Chapter 1), recover cleanly with 3-step duplicate page-turn retry, and stop automatically at Acknowledgments / Index back matter.
• In-App Book View + Live Follow-Along Teleprompter: Read and listen word-by-word with local Ollama Phonon TTS (narrated here by AI Russell).
• Real Read-Along .MP4 Cinema Output: Native Cairo + Pango burned-in word highlighting alongside .SRT, .VTT, .MP3, .M4B, and .MD saved directly into your active folder.
• Automated CLI:
  bun run cli:tts kindle --all-pages --start-at intro --skip-fluff --voice Russell -f mp4

⬇️ FREE & OPEN SOURCE DOWNLOAD (MIT License):
• macOS Homebrew Cask: brew install --cask codecaine-file-manager
• GitHub Releases: https://github.com/codecaine-zz/bun_rad_studio/releases/latest
• Source Code: https://github.com/codecaine-zz/bun_rad_studio

⏱️ CHAPTERS (NARRATED BY AI RUSSELL)
00:00 01 · Intro: Kindle Open-Book Reader for macOS
00:20 02 · ⌘K Command Palette → Voice Reader Kindle Panel
00:44 03 · Full-Screen Detection & 2-Column Spread Vision OCR
01:09 04 · Whole-Book Capture, Front-Fluff & Back-Matter Stop
01:35 05 · Card 3 Live Teleprompter & Book View Follow-Along
01:56 06 · Synced Read-Along .MP4 Cinema Clip & Books Outputs
02:27 07 · macOS Permissions, Auto Focus Return & CLI
02:52 08 · Summary & Open Source Download

🎙️ NARRATION CREDIT:
Narrated 100% locally and offline by AI Russell using Ollama Gradium Phonon TTS (`ollama run phonon --voice Russell`).

🎵 MUSIC ATTRIBUTION:
Music by Codecaine — https://github.com/codecaine-zz/bun_rad_studio (CC BY 4.0)

#macOS #AppleSilicon #Kindle #LocalAI #Ollama #PhononTTS #CodecaineFileManager #ReadAlongMP4 #Audiobook #VisionOCR #OpenSource #BunJS
```

---

## YouTube Tags (Under 500 Characters)

```text
kindle reader macos,kindle to mp4,kindle to audiobook,apple vision ocr,local ai tts,ollama phonon,ai russell,read along mp4,book view teleprompter,m4b audiobook creator,codecaine file manager,bun rad studio,apple silicon mlx,open source mac app,offline text to speech
```

---

## Privacy & Verification Checklist

- Synthesized and recorded exclusively inside an isolated `/tmp/fm_kindle_yt_demo` workspace with `SCREENSHOT_MODE=1`.
- Uses 100% synthetic demo book _"The Art of Local-First Computing"_ by _"Alex Rivera"_.
- Zero personal usernames, real Kindle books, local IP addresses, hostnames, or hardware serials appear in any video frame, audio segment, thumbnail, or note.
