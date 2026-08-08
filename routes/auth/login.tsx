import { handler, page } from "./$login.ts";
import {
  captchaEnabled,
  clearOAuthRedirectCookie,
  createOAuthRedirectCookie,
  createOAuthStateCookie,
  generateOAuthState,
  getAuthentikAuthUrl,
  getGitHubAuthUrl,
  getGoogleAuthUrl,
  HCAPTCHA_SITEKEY,
  providers,
  sanitizeRedirect,
} from "../../lib/auth.ts";
import { Button, ButtonLink } from "../../components/Button.tsx";
import { Input } from "../../components/Input.tsx";
import { IconBrandGithub } from "@tabler/icons-preact";
import { IconBrandGoogle } from "@tabler/icons-preact";
import { IconKey } from "@tabler/icons-preact";
import { IconMail } from "@tabler/icons-preact";

export const handlers = handler({
  GET(ctx) {
    const redirectTo = sanitizeRedirect(ctx.url.searchParams.get("redirect"));

    if (ctx.state.user) {
      return new Response(null, {
        status: 303,
        headers: { Location: redirectTo ?? "/" },
      });
    }
    const state = generateOAuthState();
    const baseUrl = `${ctx.url.protocol}//${ctx.url.host}`;
    const req = new Request(baseUrl);
    ctx.state.pageTitle = "Sign In";
    const headers = new Headers();
    headers.append("Set-Cookie", createOAuthStateCookie(state));
    // Always write the redirect cookie, so a plain visit to the login page
    // clears a destination left over from an abandoned invite.
    headers.append(
      "Set-Cookie",
      redirectTo
        ? createOAuthRedirectCookie(redirectTo)
        : clearOAuthRedirectCookie(),
    );
    return {
      data: {
        githubUrl: providers.github ? getGitHubAuthUrl(req, state) : null,
        googleUrl: providers.google ? getGoogleAuthUrl(req, state) : null,
        authentikUrl: providers.authentik
          ? getAuthentikAuthUrl(req, state)
          : null,
        hcaptchaSitekey: captchaEnabled ? HCAPTCHA_SITEKEY : "",
        error: ctx.url.searchParams.get("error"),
        redirectTo,
      },
      headers,
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
      {data.error === "invite_required" && (
        <div class="mb-4 rounded-md bg-red-50 dark:bg-red-900/30 border border-red-300 dark:border-red-700 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          New accounts on this Foodex instance can only be created through an
          invite link. If someone invited you, open their invite link and sign
          in from there.
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
          {data.redirectTo && (
            <input type="hidden" name="redirect" value={data.redirectTo} />
          )}
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
                data-callback="onCaptchaSolved"
                data-expired-callback="onCaptchaCleared"
                data-error-callback="onCaptchaCleared"
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
              {
                /* The server rejects a submit with no captcha token, so keep
                  the button disabled until hCaptcha hands us one. */
              }
              <script
                // deno-lint-ignore react-no-danger
                dangerouslySetInnerHTML={{
                  __html:
                    `function onCaptchaSolved(){var b=document.getElementById("magic-link-submit");if(b)b.disabled=false}` +
                    `function onCaptchaCleared(){var b=document.getElementById("magic-link-submit");if(b)b.disabled=true}`,
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

          <Button
            type="submit"
            variant="outline"
            class="w-full"
            id="magic-link-submit"
            disabled={!!data.hcaptchaSitekey}
          >
            <IconMail class="size-5" />
            Continue with email
          </Button>
        </form>
      </div>
    </div>
  );
});
