import { useEffect } from "preact/hooks";

interface Props {
  /** Id of the form to watch (`<form id=...>`). */
  formId: string;
}

/**
 * Reveals the tab holding the first field that fails validation.
 *
 * The tabs are CSS-only (radio inputs + sibling selectors) so every panel
 * stays in the DOM and one submit posts the whole recipe. The cost is that a
 * `required` field on an unselected tab is invisible: the browser refuses to
 * submit and has nothing to point its message at. Listening for `invalid`
 * (which doesn't bubble, hence capture) lets us switch to that panel first.
 */
export default function TabValidation({ formId }: Props) {
  useEffect(() => {
    const form = document.getElementById(formId);
    if (!form) return;

    function onInvalid(e: Event) {
      const panel = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-tab-panel]",
      );
      const tab = panel?.dataset.tabPanel;
      if (!tab) return;
      const radio = document.getElementById(
        `tab-${tab}`,
      ) as HTMLInputElement | null;
      if (radio && !radio.checked) {
        radio.checked = true;
        // The control was display:none when the browser tried to focus it, so
        // re-focus once the panel is painted.
        requestAnimationFrame(() => (e.target as HTMLElement).focus());
      }
    }

    form.addEventListener("invalid", onInvalid, true);
    return () => form.removeEventListener("invalid", onInvalid, true);
  }, [formId]);

  return null;
}
