import { handler } from "./$index.ts";
import { getBaseUrl } from "../../../lib/auth.ts";
import {
  metadataResponse,
  protectedResourceMetadata,
} from "../../../lib/oauth.ts";

export const handlers = handler({
  GET(ctx) {
    return metadataResponse(protectedResourceMetadata(getBaseUrl(ctx.req)));
  },
});
