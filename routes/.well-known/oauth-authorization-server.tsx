import { handler } from "./$oauth-authorization-server.ts";
import { getBaseUrl } from "../../lib/auth.ts";
import {
  authorizationServerMetadata,
  metadataResponse,
} from "../../lib/oauth.ts";

export const handlers = handler({
  GET(ctx) {
    return metadataResponse(authorizationServerMetadata(getBaseUrl(ctx.req)));
  },
});
