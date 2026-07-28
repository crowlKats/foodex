import { handler, page } from "./$login.ts";
import {
  createOAuthStateCookie,
  generateOAuthState,
  getAuthentikAuthUrl,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
  HCAPTCHA_SITEKEY,
  providers,
} from "../../lib/auth.ts";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { IconBrandGithub } from "@tabler/icons-preact";
import { IconBrandGoogle } from "@tabler/icons-preact";
import { IconKey } from "@tabler/icons-preact";
import { IconMail } from "@tabler/icons-preact";

export const handlers = handler({
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
        hcaptchaSitekey: HCAPTCHA_SITEKEY,
        error: ctx.url.searchParams.get("error"),
      },
      headers: {
        "Set-Cookie": createOAuthStateCookie(state),
      },
    };
  },
});

export default page(function LoginPage({ data }) {
  const hasOAuthProvider = data.githubUrl || data.googleUrl ||
    data.authentikUrl;
  return (
    <div class="max-w-sm mx-auto mt-16">
      <h1 class="text-2xl font-bold text-center mb-8">Sign in to Foodex</h1>
      {data.error === "captcha" && (
        <div class="mb-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Captcha verification failed. Please try again.
        </div>
      )}
      <div class="card space-y-3">
        {data.githubUrl && (
          <ButtonLink
            href={data.githubUrl}
            variant="outline"
            class="w-full"
          >
            <IconBrandGithub class="size-5" />
            Continue with GitHub
          </ButtonLink>
        )}
        {data.googleUrl && (
          <ButtonLink
            href={data.googleUrl}
            variant="outline"
            class="w-full"
          >
            <IconBrandGoogle class="size-5" />
            Continue with Google
          </ButtonLink>
        )}
        {data.authentikUrl && (
          <ButtonLink
            href={data.authentikUrl}
            variant="outline"
            class="w-full"
          >
            <IconKey class="size-5" />
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

          {data.hcaptchaSitekey && (
            <>
              <div
                class="h-captcha flex justify-center"
                data-sitekey={data.hcaptchaSitekey}
              >
              </div>
              {
                /* Match the widget to the active light/dark theme before
                  hCaptcha auto-renders it. Runs during parse, before the
                  async+defer api.js executes. */
              }
              <script
                // deno-lint-ignore react-no-danger
                dangerouslySetInnerHTML={{
                  __html:
                    `document.currentScript.previousElementSibling.dataset.theme=document.documentElement.classList.contains("dark")?"dark":"light";`,
                }}
              >
              </script>
              <script
                src="https://js.hcaptcha.com/1/api.js"
                async
                defer
              >
              </script>
            </>
          )}

          <Button type="submit" variant="outline" class="w-full">
            <IconMail class="size-5" />
            Continue with email
          </Button>
        </form>
      </div>
    </div>
  );
});
