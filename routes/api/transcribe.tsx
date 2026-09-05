import { handler } from "./$transcribe.ts";
import { hasCredentials } from "../../lib/agent/model.ts";
import { recordUsage } from "../../lib/agent/usage.ts";
import { rateLimit } from "../../lib/rate-limit.ts";
import {
  MAX_TRANSCRIBE_BYTES,
  TRANSCRIBE_MEDIA_TYPES,
  transcribeAudio,
} from "../../lib/transcribe.ts";

// Turns a dictated recording into text. The audio is never stored: it goes
// straight from the request body to the model, and only the transcript comes
// back, for the user to read over before it goes anywhere.
export const handlers = handler({
  async POST(ctx) {
    if (!ctx.state.user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (!rateLimit(`transcribe:${ctx.state.user.id}`, 10, 60_000)) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    if (!hasCredentials()) {
      return Response.json({ error: "OPENROUTER_API_KEY not configured" }, {
        status: 500,
      });
    }

    const form = await ctx.req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return Response.json({ error: "No recording provided" }, { status: 400 });
    }
    if (file.size > MAX_TRANSCRIBE_BYTES) {
      return Response.json({ error: "Recording too long" }, { status: 413 });
    }
    // Recorders report codec parameters ("audio/ogg;codecs=opus"); the model
    // only needs the container.
    const mediaType = file.type.split(";")[0].trim().toLowerCase();
    if (!TRANSCRIBE_MEDIA_TYPES.has(mediaType)) {
      return Response.json({ error: `Unsupported audio type ${mediaType}` }, {
        status: 415,
      });
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = await transcribeAudio(bytes, mediaType);
      // Not tied to a chat, so session_id stays null.
      await recordUsage(ctx.state.db.query, {
        userId: ctx.state.user.id,
        model: result.model,
        cost: result.cost,
      });
      if (!result.text) {
        return Response.json({ error: "Nothing was heard in the recording" }, {
          status: 422,
        });
      }
      return Response.json({ text: result.text });
    } catch (err) {
      console.error("transcribe:", err);
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }
  },
});
