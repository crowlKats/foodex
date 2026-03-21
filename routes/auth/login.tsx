import { page } from "fresh";
import { define } from "../../utils.ts";
import {
  createOAuthStateCookie,
  generateOAuthState,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
} from "../../lib/auth.ts";
import TbBrandGithub from "tb-icons/TbBrandGithub";
import TbBrandGoogle from "tb-icons/TbBrandGoogle";

export const handler = define.handlers({
  GET(ctx) {
    if (ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: "/" },
      });
    }
    const state = generateOAuthState();
    const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
    const req = new Request(baseUrl);
    ctx.resp.headers.set("Set-Cookie", createOAuthStateCookie(state));
    ctx.state.pageTitle = "Sign In";
    return page({
      githubUrl: getGitHubAuthUrl(req, state),
      googleUrl: getGoogleAuthUrl(req, state),
    });
  },
});

export default define.page<typeof handler>(function LoginPage({ data }) {
  const { githubUrl, googleUrl } = data as {
    githubUrl: string;
    googleUrl: string;
  };

  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">Sign in to Foodex</h1>
      <div class="card space-y-3">
        <a
          href={githubUrl}
          class="btn w-full flex items-center justify-center gap-2 bg-stone-800 text-white hover:bg-stone-700"
        >
          <TbBrandGithub class="size-5" />
          Continue with GitHub
        </a>
        <a
          href={googleUrl}
          class="btn w-full flex items-center justify-center gap-2 bg-white text-stone-800 border border-stone-300 hover:bg-stone-50"
        >
          <TbBrandGoogle class="size-5" />
          Continue with Google
        </a>
      </div>
    </div>
  );
});
