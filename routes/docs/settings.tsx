import { handler, page } from "./$settings.ts";
import {
  docMuted,
  docProse,
  DocSection,
  DocsPage,
} from "../../components/DocsPage.tsx";

export const handlers = handler({
  GET(ctx) {
    ctx.state.pageTitle = "Settings";
    return { data: {} };
  },
});

export default page(function SettingsDocs({ url }) {
  return (
    <DocsPage
      currentPath={url.pathname}
      title="Settings"
      intro="Your profile, display preferences, notifications, and putting Foodex on your phone."
    >
      <DocSection id="profile" title="Profile">
        <p class={`${docProse} mb-0`}>
          Your <strong>Profile</strong>{" "}
          page (click your name in the top bar) holds your{" "}
          <strong>display name</strong>, which is how your household sees you,
          and the sign-out button. Your avatar and email come from the account
          you sign in with.
        </p>
      </DocSection>

      <DocSection id="units" title="Unit System">
        <p class={`${docProse} mb-0`}>
          Choose <strong>Metric</strong> (g, ml, cm) or{" "}
          <strong>Imperial</strong>{" "}
          (oz, fl oz, inch) on your Profile page. Every amount in the app then
          displays in your system, whatever units a recipe was originally
          written in; the conversion happens on the fly and the recipe itself is
          untouched. Each household member has their own preference.
        </p>
      </DocSection>

      <DocSection id="dark-mode" title="Dark Mode">
        <p class={`${docProse} mb-0`}>
          The sun/moon toggle in the navigation bar switches between light and
          dark. Foodex follows your device's preference until you choose, and
          remembers your choice on that device.
        </p>
      </DocSection>

      <DocSection id="notifications" title="Notifications">
        <p class={`${docProse} mb-3`}>Two separate things can notify you:</p>
        <ul class="list-disc pl-6 space-y-1 mb-3">
          <li class={docProse}>
            <strong>Timers</strong>: starting a recipe timer asks for
            notification permission so the alarm reaches you even if you've
            switched apps.
          </li>
          <li class={docProse}>
            <strong>Expiry warnings</strong>: the bell toggle on the Pantry page
            ("Notify me") subscribes you to a push notification when pantry
            items approach their best-before date, timed to arrive at a sensible
            hour.
          </li>
        </ul>
        <p class={`${docMuted} mb-0`}>
          Both depend on your browser's notification support and permission; if
          you blocked notifications for the site, re-enable them in the
          browser's site settings.
        </p>
      </DocSection>

      <DocSection id="pwa" title="Foodex on Your Phone">
        <p class={`${docProse} mb-3`}>
          Foodex is built for phones: the bottom tab bar covers the everyday
          pages, and the barcode scanner is at its best while you unpack
          groceries. You can install it like an app so it gets its own icon and
          opens full screen:
        </p>
        <ul class="list-disc pl-6 space-y-1 mb-0">
          <li class={docProse}>
            <strong>iPhone / iPad</strong>: in Safari, tap Share, then "Add to
            Home Screen" (Foodex shows a reminder banner with the steps).
          </li>
          <li class={docProse}>
            <strong>Android</strong>: your browser's menu offers "Install app"
            or "Add to Home screen". Once installed, Foodex also appears in the
            system share sheet so you can send a recipe link or photo straight
            to New Recipe.
          </li>
        </ul>
      </DocSection>
    </DocsPage>
  );
});
