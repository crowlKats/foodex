import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IconChevronDown, IconMenu2, IconX } from "@tabler/icons-preact";

export interface NavDropdownLink {
  href: string;
  label: string;
}

type Trigger =
  /** Hamburger, for the narrow-screen menu. */
  | { kind: "hamburger" }
  /** Text label with a chevron, for the desktop overflow menu. */
  | { kind: "text"; label: string }
  /** Avatar (falling back to the name), for the account menu. */
  | { kind: "avatar"; name?: string | null; avatarUrl?: string | null };

/**
 * Dropdown for the top bar: the narrow-screen menu, the desktop overflow
 * menu, and the account menu are all this component with a different trigger.
 * Keeping the overflow behind a menu is what stops the bar from wrapping on
 * laptop widths.
 */
export default function NavDropdown(
  { trigger, links, currentPath, signOut, class: className, tour }: {
    trigger: Trigger;
    links: NavDropdownLink[];
    currentPath: string;
    /** Append a sign-out button below the links. */
    signOut?: boolean;
    class?: string;
    /** Anchor id for the welcome walkthrough (data-tour). */
    tour?: string;
  },
) {
  const open = useSignal(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open.value) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) open.value = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") open.value = false;
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open.value]);

  const active = links.some((l) => currentPath.startsWith(l.href));

  return (
    <div ref={container} class={`relative ${className ?? ""}`}>
      <button
        type="button"
        data-tour={tour}
        class={`nav-link flex items-center cursor-pointer ${
          active ? "text-orange-400" : ""
        }`}
        title={trigger.kind === "text" ? trigger.label : "Menu"}
        aria-expanded={open.value}
        aria-haspopup="menu"
        onClick={() => open.value = !open.value}
      >
        {trigger.kind === "hamburger" &&
          (open.value
            ? <IconX class="size-5" />
            : <IconMenu2 class="size-5" />)}
        {trigger.kind === "text" && (
          <>
            <span class="text-sm font-medium">{trigger.label}</span>
            <IconChevronDown
              class={`size-4 ml-0.5 transition-transform duration-75 ${
                open.value ? "rotate-180" : ""
              }`}
            />
          </>
        )}
        {trigger.kind === "avatar" && (
          trigger.avatarUrl
            ? (
              <img
                src={trigger.avatarUrl}
                alt={trigger.name ?? ""}
                class="size-7 rounded-full"
              />
            )
            : <span class="text-sm">{trigger.name ?? "Account"}</span>
        )}
      </button>
      {/* Panel sits above the welcome tour's overlay (z 60) so it stays usable mid-tour. */}
      {open.value && (
        <div
          role="menu"
          class="absolute right-0 top-full mt-3 min-w-44 bg-stone-900 border-2 border-orange-600 dark:border-orange-500"
          style={{ zIndex: 70 }}
        >
          {trigger.kind === "avatar" && trigger.name && (
            <div class="px-4 pt-2.5 pb-1 text-xs text-stone-400 truncate">
              {trigger.name}
            </div>
          )}
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              role="menuitem"
              class={`block px-4 py-2.5 text-sm font-medium ${
                currentPath.startsWith(l.href)
                  ? "text-orange-400"
                  : "text-stone-200 hover:bg-stone-800"
              }`}
            >
              {l.label}
            </a>
          ))}
          {signOut && (
            <form method="POST" action="/auth/logout">
              <button
                type="submit"
                class="block w-full text-left px-4 py-2.5 text-sm font-medium text-stone-400 hover:bg-stone-800 hover:text-stone-200 cursor-pointer"
              >
                Sign out
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
