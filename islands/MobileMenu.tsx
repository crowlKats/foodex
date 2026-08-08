import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { IconMenu2, IconX } from "@tabler/icons-preact";

/**
 * Hamburger menu in the mobile top bar for the pages the bottom tab bar has
 * no room for. Hidden on sm+ where the full desktop nav shows everything.
 */
export default function MobileMenu(
  { hasHousehold, currentPath }: {
    hasHousehold?: boolean;
    currentPath: string;
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

  const links = [
    ...(hasHousehold
      ? [
        { href: "/agent", label: "Assistant" },
        { href: "/collections", label: "Collections" },
      ]
      : []),
    { href: "/ingredients", label: "Ingredients" },
    { href: "/stores", label: "Stores" },
    { href: "/tools", label: "Tools" },
    { href: "/docs", label: "User guide" },
  ];

  return (
    <div ref={container} class="relative sm:hidden">
      <button
        type="button"
        data-tour="menu"
        class="nav-link flex items-center cursor-pointer"
        title="Menu"
        aria-expanded={open.value}
        onClick={() => open.value = !open.value}
      >
        {open.value ? <IconX class="size-5" /> : <IconMenu2 class="size-5" />}
      </button>
      {/* Panel sits above the welcome tour's overlay (z 60) so it stays usable mid-tour. */}
      {open.value && (
        <div
          class="absolute right-0 top-full mt-3 min-w-44 bg-stone-900 border-2 border-orange-600 dark:border-orange-500"
          style={{ zIndex: 70 }}
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              class={`block px-4 py-2.5 text-sm font-medium ${
                currentPath.startsWith(l.href)
                  ? "text-orange-400"
                  : "text-stone-200 hover:bg-stone-800"
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
