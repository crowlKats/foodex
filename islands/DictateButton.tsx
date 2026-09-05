import { useEffect, useRef, useState } from "preact/hooks";
import {
  IconLoader2,
  IconMicrophone,
  IconPlayerStopFilled,
} from "@tabler/icons-preact";
import { Button, type ButtonSize } from "../components/Button.tsx";
import {
  type Recording,
  startRecording,
  transcribeRecording,
} from "../lib/dictation.ts";

/** Long enough for a whole recipe; short enough that a WAV fallback stays under the upload cap. */
const MAX_SECONDS = 5 * 60;

interface Props {
  /** Called with the transcript once the recording has been turned into text. */
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  /** Text next to the icon; omit for an icon-only button. */
  label?: string;
  size?: ButtonSize;
  class?: string;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * One button, three states: press to record, press again to stop, then wait
 * while the recording is transcribed. The transcript is handed to the parent
 * and dropped into a text box the user can edit before anything else happens
 * with it.
 */
export default function DictateButton(
  { onTranscript, onError, disabled, label, size = "sm", class: extra }: Props,
) {
  const [phase, setPhase] = useState<"idle" | "recording" | "transcribing">(
    "idle",
  );
  const [elapsed, setElapsed] = useState(0);
  const recording = useRef<Recording | null>(null);

  // Tick the clock while recording, and stop on the cap.
  useEffect(() => {
    if (phase !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const secs = Math.floor((Date.now() - started) / 1000);
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stop();
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  // Leaving the page mid-recording must not leave the microphone on.
  useEffect(() => () => recording.current?.cancel(), []);

  async function start() {
    onError("");
    try {
      recording.current = await startRecording();
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      onError((err as Error).message);
    }
  }

  async function stop() {
    const rec = recording.current;
    if (!rec) return;
    recording.current = null;
    setPhase("transcribing");
    try {
      const audio = await rec.stop();
      onTranscript(await transcribeRecording(audio));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setPhase("idle");
    }
  }

  if (phase === "recording") {
    return (
      <Button
        type="button"
        variant="danger"
        size={size}
        icon={IconPlayerStopFilled}
        title="Stop recording"
        onClick={stop}
        class={`whitespace-nowrap tabular-nums ${extra ?? ""}`}
      >
        {label ? "Stop " : ""}
        {formatElapsed(elapsed)}
      </Button>
    );
  }

  if (phase === "transcribing") {
    return (
      <Button
        type="button"
        variant="outline"
        size={size}
        disabled
        title="Transcribing"
        onClick={() => {}}
        class={`whitespace-nowrap ${extra ?? ""}`}
      >
        <IconLoader2 class="size-4 shrink-0 animate-spin" />
        {label && "Transcribing…"}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      icon={IconMicrophone}
      title={label ? "Dictate" : "Dictate a message"}
      disabled={disabled}
      onClick={start}
      class={`whitespace-nowrap ${extra ?? ""}`}
    >
      {label}
    </Button>
  );
}
