// Import this first in a tutorial script: it picks the free Edge neural voice (a female voice by default) even when a Gemini key
// is set, because Gemini's text-to-speech allows only 100 requests a day per model and a video needs several hundred.
process.env.TTS_ENGINE ??= "edge";
process.env.EDGE_TTS_VOICE ??= "en-US-AvaMultilingualNeural";
