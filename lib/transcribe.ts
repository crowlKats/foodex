// Speech to text for dictated recipes. The recording goes to an audio-capable
// model as a file part; the OpenRouter provider turns that into an
// `input_audio` block, whose format it derives from the media type.

import { generateText } from "ai";
import { costOf, getTranscriptionModel } from "./agent/model.ts";

/**
 * Audio media types the transcription request accepts. These are the ones the
 * provider maps to an OpenRouter `input_audio` format; anything else (WebM
 * from Chrome's recorder, notably) is re-encoded as WAV on the client first.
 */
export const TRANSCRIBE_MEDIA_TYPES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/flac",
]);

/** 5 minutes of 16 kHz mono WAV is ~9.6 MB; compressed recordings are far smaller. */
export const MAX_TRANSCRIBE_BYTES = 12 * 1024 * 1024;

const INSTRUCTIONS = [
  "You transcribe a voice recording in which someone dictates a recipe, or",
  "gives instructions about one, for a recipe app.",
  "",
  "Write down what was said, in the language it was spoken, as clean",
  "readable text: add punctuation and paragraph breaks where the speaker",
  'pauses, write numbers as digits ("2 eggs", "200 g", "180 degrees"),',
  "and drop filler sounds and false starts. When the speaker corrects",
  'themselves ("two eggs, no, three"), keep only the correction.',
  "",
  "Do not add, reorder, or restructure anything: no headings, no ingredient",
  "list unless it was dictated as one, no commentary. Output only the",
  "transcript. If nothing intelligible was said, output nothing at all.",
].join("\n");

export interface Transcription {
  text: string;
  /** The model that answered, for usage accounting. */
  model: string;
  cost: number | null;
}

export async function transcribeAudio(
  bytes: Uint8Array,
  mediaType: string,
): Promise<Transcription> {
  const { text, response, finalStep } = await generateText({
    model: getTranscriptionModel(),
    maxOutputTokens: 4096,
    instructions: INSTRUCTIONS,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Transcribe this recording." },
        { type: "file", mediaType, data: bytes },
      ],
    }],
  });
  return {
    text: text.trim(),
    model: response.modelId,
    cost: costOf(finalStep.providerMetadata),
  };
}
