import { define } from "../../utils.ts";
import {
  createOAuthStateCookie,
  generateOAuthState,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
} from "../../lib/auth.ts";
import TbBrandGithub from "tb-icons/TbBrandGithub";
import TbBrandGoogle from "tb-icons/TbBrandGoogle";
import TbMail from "tb-icons/TbMail";

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
    ctx.state.pageTitle = "Sign In";
    return {
      data: {
        githubUrl: getGitHubAuthUrl(req, state),
        googleUrl: getGoogleAuthUrl(req, state),
      },
      headers: {
        "Set-Cookie": createOAuthStateCookie(state),
      },
    };
  },
});

export default define.page<typeof handler>(function LoginPage({ data }) {
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">Sign in to Foodex</h1>
      <div class="card space-y-3">
        <a
          href={data.githubUrl}
          class="btn w-full flex items-center justify-center gap-2 bg-stone-800 text-white hover:bg-stone-700"
        >
          <TbBrandGithub class="size-5" />
          Continue with GitHub
        </a>
        <a
          href={data.googleUrl}
          class="btn w-full flex items-center justify-center gap-2 bg-white text-stone-800 border border-stone-300 hover:bg-stone-50"
        >
          <TbBrandGoogle class="size-5" />
          Continue with Google
        </a>
        <div class="flex items-center gap-3 my-1">
          <div class="flex-1 border-t border-stone-300 dark:border-stone-600" />
          <span class="text-sm text-stone-500">or</span>
          <div class="flex-1 border-t border-stone-300 dark:border-stone-600" />
        </div>
        <form method="POST" action="/auth/magic-link" class="space-y-2">
          <input
            type="email"
            name="email"
            placeholder="Email address"
            required
            class="w-full px-3 py-2 border-2 border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            class="btn w-full flex items-center justify-center gap-2"
          >
            <TbMail class="size-5" />
            Continue with email
          </button>
        </form>
      </div>
    </div>
  );
});
