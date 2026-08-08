import { useEffect, useRef } from "preact/hooks";
import { IconChevronDown, IconMenu2, IconX } from "@tabler/icons-preact";
import { menuPinnedByTour, openMenu } from "../lib/menu-state.ts";

export interface NavDropdownLink {
  href: string;
  label: string;
  /** Anchor id for the welcome walkthrough (data-tour). */
  tour?: string;
  /**
   * Consecutive links sharing a group are wrapped together so the walkthrough
   * can ring them as one (data-tour set to the group name).
   */
  group?: string;
}

type Trigger =
  /** Hamburger, for the narrow-screen menu. */
  | { kind: "hamburger" }
  /** Text label with a chevron, for the desktop overflow menu. */
  | { kind: "text"; label: string }
  /** Avatar (falling back to the name), for the account menu. */
  | { kind: "avatar"; name?: string | null; avatarUrl?: string | null };

function MenuLink(
  { link, currentPath }: { link: NavDropdownLink; currentPath: string },
) {
  return (
    <a
      href={link.href}
      role="menuitem"
      data-tour={link.tour}
      class={`block px-4 py-2.5 text-sm font-medium ${
        currentPath.startsWith(link.href)
          ? "text-orange-400"
          : "text-stone-200 hover:bg-stone-800"
      }`}
    >
      {link.label}
    </a>
  );
}

/** Links in order, with runs of the same group wrapped in one anchored div. */
function renderLinks(links: NavDropdownLink[], currentPath: string) {
  const out = [];
  for (let i = 0; i < links.length;) {
    const group = links[i].group;
    if (!group) {
      out.push(
        <MenuLink
          key={links[i].href}
          link={links[i]}
          currentPath={currentPath}
        />,
      );
      i++;
      continue;
    }
    const run = [];
    while (i < links.length && links[i].group === group) {
      run.push(
        <MenuLink
          key={links[i].href}
          link={links[i]}
          currentPath={currentPath}
        />,
      );
      i++;
    }
    out.push(
      <div key={group} data-tour={group}>
        {run}
      </div>,
    );
  }
  return out;
}

/**
 * Dropdown for the top bar: the narrow-screen menu, the desktop overflow
 * menu, and the account menu are all this component with a different trigger.
 * Keeping the overflow behind a menu is what stops the bar from wrapping on
 * laptop widths.
 *
 * The open state lives in a shared signal, keyed by id, so only one menu is
 * open at a time and the welcome tour can open a menu to ring the items
 * inside it.
 */
export default function NavDropdown(
  { id, trigger, links, currentPath, signOut, class: className }: {
    /** Unique among the top bar's dropdowns. */
    id: string;
    trigger: Trigger;
    links: NavDropdownLink[];
    currentPath: string;
    /** Append a sign-out button below the links. */
    signOut?: boolean;
    class?: string;
  },
) {
  const open = openMenu.value === id;
  const container = useRef<HTMLDivElement>(null);
  // Only menus that hold walkthrough anchors advertise themselves to the tour.
  const holdsTourItems = links.some((l) => l.tour || l.group);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      if (openMenu.peek() === id) openMenu.value = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (menuPinnedByTour.peek()) return;
      if (!container.current?.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (menuPinnedByTour.peek()) return;
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const active = links.some((l) => currentPath.startsWith(l.href));

  return (
    <div ref={container} class={`relative ${className ?? ""}`}>
      <button
        type="button"
        data-tour-menu={holdsTourItems ? id : undefined}
        class={`nav-link flex items-center cursor-pointer ${
          active ? "text-orange-400" : ""
        }`}
        title={trigger.kind === "text" ? trigger.label : "Menu"}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => openMenu.value = open ? null : id}
      >
        {trigger.kind === "hamburger" &&
          (open ? <IconX class="size-5" /> : <IconMenu2 class="size-5" />)}
        {trigger.kind === "text" && (
          <>
            <span class="text-sm font-medium">{trigger.label}</span>
            <IconChevronDown
              class={`size-4 ml-0.5 transition-transform duration-75 ${
                open ? "rotate-180" : ""
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
      {
        /* z 70 clears the bottom tab bar (z 50); the welcome tour draws its
          ring and card above the panel at z 80. */
      }
      {open && (
        <div
          role="menu"
          data-tour-panel
          class="absolute right-0 top-full mt-3 min-w-44 bg-stone-900 border-2 border-orange-600 dark:border-orange-500"
          style={{ zIndex: 70 }}
        >
          {trigger.kind === "avatar" && trigger.name && (
            <div class="px-4 pt-2.5 pb-1 text-xs text-stone-400 truncate">
              {trigger.name}
            </div>
          )}
          {renderLinks(links, currentPath)}
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
