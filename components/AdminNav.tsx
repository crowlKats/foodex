import { useMessages } from "../lib/i18n/provider.tsx";

const TABS = [
  { href: "/admin", key: "overview" as const },
  { href: "/admin/users", key: "users" as const },
  { href: "/admin/households", key: "households" as const },
  { href: "/admin/recipes", key: "recipes" as const },
  { href: "/admin/audit", key: "auditLog" as const },
  { href: "/admin/system", key: "system" as const },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(href);
}

/** Section tabs shown at the top of every admin page. */
export function AdminNav({ currentPath }: { currentPath: string }) {
  const m = useMessages();
  return (
    <div class="tab-bar mb-6">
      {TABS.map((t) => (
        <a
          key={t.href}
          href={t.href}
          class={`tab ${isActive(currentPath, t.href) ? "tab-active" : ""}`}
        >
          {m.admin[t.key]()}
        </a>
      ))}
    </div>
  );
}
