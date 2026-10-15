# Voice sampler: pick a narrator

Everyone reads: "Welcome to Codecaine File Manager, the next-generation developer workstation built on Bun. It is a complete, private, cross-platform power tool for macOS, Windows, and Linux."

| # | Time | Provider | Voice | Style |
|---|------|----------|-------|-------|
| 1 | 0:05 | Google Gemini | `Zephyr` | Bright |
| 2 | 0:20 | Google Gemini | `Puck` | Upbeat |
| 3 | 0:35 | Google Gemini | `Charon` | Informative |
| 4 | 0:49 | Google Gemini | `Kore` | Firm |
| 5 | 1:03 | Google Gemini | `Fenrir` | Excitable |
| 6 | 1:18 | Google Gemini | `Leda` | Youthful |
| 7 | 1:33 | Google Gemini | `Orus` | Firm |
| 8 | 1:47 | Google Gemini | `Aoede` | Breezy |
| 9 | 2:02 | Google Gemini | `Callirrhoe` | Easy-going |
| 10 | 2:16 | Google Gemini | `Autonoe` | Bright |
| 11 | 2:32 | Google Gemini | `Enceladus` | Breathy |
| 12 | 2:46 | Google Gemini | `Iapetus` | Clear |
| 13 | 3:01 | Google Gemini | `Umbriel` | Easy-going |
| 14 | 3:15 | Google Gemini | `Algieba` | Smooth |
| 15 | 3:29 | Google Gemini | `Despina` | Smooth |
| 16 | 3:44 | Google Gemini | `Erinome` | Clear |
| 17 | 3:59 | Google Gemini | `Algenib` | Gravelly |
| 18 | 4:15 | Google Gemini | `Rasalgethi` | Informative |
| 19 | 4:29 | Google Gemini | `Laomedeia` | Upbeat |
| 20 | 4:44 | Google Gemini | `Achernar` | Soft |
| 21 | 4:58 | Google Gemini | `Alnilam` | Firm |
| 22 | 5:11 | Google Gemini | `Schedar` | Even |
| 23 | 5:26 | Google Gemini | `Gacrux` | Mature |
| 24 | 5:42 | Google Gemini | `Pulcherrima` | Forward |
| 25 | 5:58 | Google Gemini | `Achird` | Friendly |
| 26 | 6:14 | Google Gemini | `Zubenelgenubi` | Casual |
| 27 | 6:29 | Google Gemini | `Vindemiatrix` | Gentle |
| 28 | 6:45 | Google Gemini | `Sadachbia` | Lively |
| 29 | 7:00 | Google Gemini | `Sadaltager` | Knowledgeable |
| 30 | 7:14 | Google Gemini | `Sulafat` | Warm |
| 31 | 7:29 | Microsoft Edge | `en-US-AndrewMultilingualNeural` | Male · Warm, Confident, Authentic, Honest |
| 32 | 7:43 | Microsoft Edge | `en-US-AvaMultilingualNeural` | Female · Expressive, Caring, Pleasant, Friendly |
| 33 | 7:58 | Microsoft Edge | `en-US-BrianMultilingualNeural` | Male · Approachable, Casual, Sincere |
| 34 | 8:12 | Microsoft Edge | `en-US-EmmaMultilingualNeural` | Female · Cheerful, Clear, Conversational |
| 35 | 8:26 | Microsoft Edge | `en-US-AndrewNeural` | Male · Warm, Confident, Authentic, Honest |
| 36 | 8:40 | Microsoft Edge | `en-US-AvaNeural` | Female · Expressive, Caring, Pleasant, Friendly |
| 37 | 8:55 | Microsoft Edge | `en-US-BrianNeural` | Male · Approachable, Casual, Sincere |
| 38 | 9:09 | Microsoft Edge | `en-US-EmmaNeural` | Female · Cheerful, Clear, Conversational |
| 39 | 9:22 | Microsoft Edge | `en-US-JennyNeural` | Female · Friendly, Considerate, Comfort |
| 40 | 9:36 | Microsoft Edge | `en-US-AriaNeural` | Female · Positive, Confident |
| 41 | 9:51 | Microsoft Edge | `en-US-GuyNeural` | Male · Passion |
| 42 | 10:05 | Microsoft Edge | `en-US-ChristopherNeural` | Male · Reliable, Authority |
| 43 | 10:21 | Microsoft Edge | `en-US-EricNeural` | Male · Rational |
| 44 | 10:36 | Microsoft Edge | `en-US-MichelleNeural` | Female · Friendly, Pleasant |
| 45 | 10:51 | Microsoft Edge | `en-US-RogerNeural` | Male · Lively |
| 46 | 11:08 | Microsoft Edge | `en-US-SteffanNeural` | Male · Rational |
| 47 | 11:23 | Microsoft Edge | `en-GB-RyanNeural` | Male · Friendly, Positive |
| 48 | 11:38 | Microsoft Edge | `en-GB-SoniaNeural` | Female · Friendly, Positive |
| 49 | 11:52 | Microsoft Edge | `en-GB-LibbyNeural` | Female · Friendly, Positive |
| 50 | 12:08 | Microsoft Edge | `en-GB-ThomasNeural` | Male · Friendly, Positive |
| 51 | 12:22 | Microsoft Edge | `en-AU-NatashaNeural` | Female · Friendly, Positive |

Use a Gemini voice: `GEMINI_TTS_VOICE=<name> bun scripts/build_full_youtube_video.ts`
Use an Edge voice: remove GEMINI_API_KEY from the environment and set `VOICE` in scripts/build_full_youtube_video.ts.
