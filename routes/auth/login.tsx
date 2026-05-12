import { define } from "../../utils.ts";
import {
  createOAuthStateCookie,
  generateOAuthState,
  getAuthentikAuthUrl,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
  providers,
} from "../../lib/auth.ts";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import TbBrandGithub from "tb-icons/TbBrandGithub";
import TbBrandGoogle from "tb-icons/TbBrandGoogle";
import TbKey from "tb-icons/TbKey";
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
        githubUrl: providers.github ? getGitHubAuthUrl(req, state) : null,
        googleUrl: providers.google ? getGoogleAuthUrl(req, state) : null,
        authentikUrl: providers.authentik
          ? getAuthentikAuthUrl(req, state)
          : null,
      },
      headers: {
        "Set-Cookie": createOAuthStateCookie(state),
      },
    };
  },
});

export default define.page<typeof handler>(function LoginPage({ data }) {
  const hasOAuthProvider = data.githubUrl || data.googleUrl ||
    data.authentikUrl;
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">Sign in to Foodex</h1>
      <div class="card space-y-3">
        {data.githubUrl && (
          <ButtonLink
            href={data.githubUrl}
            variant="outline"
            class="w-full"
          >
            <TbBrandGithub class="size-5" />
            Continue with GitHub
          </ButtonLink>
        )}
        {data.googleUrl && (
          <ButtonLink
            href={data.googleUrl}
            variant="outline"
            class="w-full"
          >
            <TbBrandGoogle class="size-5" />
            Continue with Google
          </ButtonLink>
        )}
        {data.authentikUrl && (
          <ButtonLink
            href={data.authentikUrl}
            variant="outline"
            class="w-full"
          >
            <TbKey class="size-5" />
            Continue with Authentik
          </ButtonLink>
        )}
        {hasOAuthProvider && (
          <div class="flex items-center gap-3 my-1">
            <div class="flex-1 border-t border-stone-300 dark:border-stone-600" />
            <span class="text-sm text-stone-500">or</span>
            <div class="flex-1 border-t border-stone-300 dark:border-stone-600" />
          </div>
        )}
        <form method="POST" action="/auth/magic-link" class="space-y-2">
          <Input
            type="email"
            name="email"
            placeholder="Email address"
            required
            class="w-full"
          />
          <Button type="submit" variant="outline" class="w-full">
            <TbMail class="size-5" />
            Continue with email
          </Button>
        </form>
      </div>
    </div>
  );
});
