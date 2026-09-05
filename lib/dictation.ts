// Client-side dictation: record from the microphone, make sure the bytes are
// in a container the transcription endpoint accepts, and send them off.
// Island-only: must never be imported from server code.

/** Mirrors TRANSCRIBE_MEDIA_TYPES on the server, minus aliases recorders never emit. */
const ACCEPTED = new Set(["audio/mp4", "audio/ogg", "audio/wav", "audio/mpeg"]);

// Most compact first. Safari records mp4, Firefox ogg; Chrome only offers
// webm, which the model side does not take, so those recordings get decoded
// and re-encoded as WAV below.
const PREFERRED_TYPES = [
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
];

const WAV_SAMPLE_RATE = 16_000;

export function canDictate(): boolean {
  return typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
}

export interface Recording {
  /** Stops recording, releases the microphone, and resolves the audio. */
  stop(): Promise<Blob>;
  /** Stops and discards everything. */
  cancel(): void;
}

export async function startRecording(): Promise<Recording> {
  if (!canDictate()) {
    throw new Error("Dictation is not supported in this browser");
  }
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = (err as DOMException).name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      throw new Error("Microphone access was denied");
    }
    if (name === "NotFoundError") throw new Error("No microphone found");
    throw new Error("Could not start the microphone");
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());

  const mimeType = PREFERRED_TYPES.find((t) =>
    MediaRecorder.isTypeSupported(t)
  );
  const recorder = new MediaRecorder(
    stream,
    mimeType ? { mimeType } : undefined,
  );
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });
  // Periodic chunks, so a recorder that dies mid-way still yields something.
  recorder.start(1000);

  return {
    async stop() {
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
      release();
      return new Blob(chunks, { type: recorder.mimeType || mimeType || "" });
    },
    cancel() {
      recorder.onstop = null;
      recorder.ondataavailable = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}

function baseType(blob: Blob): string {
  return blob.type.split(";")[0].trim().toLowerCase();
}

/**
 * Decode any recording the browser can play and re-encode it as 16 kHz mono
 * PCM WAV. Only needed for containers the model side rejects (WebM); the
 * offline context does the resampling as part of decoding.
 */
async function toWav(blob: Blob): Promise<Blob> {
  const ctx = new OfflineAudioContext(1, 1, WAV_SAMPLE_RATE);
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
  const frames = decoded.length;
  const mono = new Float32Array(frames);
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < frames; i++) {
      mono[i] += data[i] / decoded.numberOfChannels;
    }
  }
  const rate = decoded.sampleRate;
  const buf = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buf);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** Send a recording to the transcription endpoint; resolves to the transcript. */
export async function transcribeRecording(recording: Blob): Promise<string> {
  const blob = ACCEPTED.has(baseType(recording))
    ? recording
    : await toWav(recording);
  const type = baseType(blob);
  const fd = new FormData();
  fd.append("file", blob, `dictation.${type.split("/")[1]}`);
  const res = await fetch("/api/transcribe", { method: "POST", body: fd });
  // Never trust the body blindly: server errors can come back as HTML.
  const data = await res.json().catch(() => null);
  if (!res.ok || typeof data?.text !== "string") {
    throw new Error(data?.error ?? `Transcription failed (HTTP ${res.status})`);
  }
  return data.text;
}
