import { handler } from "./$mcp.ts";
import { getBaseUrl } from "../../../lib/auth.ts";
import {
  metadataResponse,
  protectedResourceMetadata,
} from "../../../lib/oauth.ts";

// The path-suffixed location RFC 9728 derives from the resource URL /mcp.
// The bare location (index.tsx) serves the same document for clients that
// only look there.

export const handlers = handler({
  GET(ctx) {
    return metadataResponse(protectedResourceMetadata(getBaseUrl(ctx.req)));
  },
});
