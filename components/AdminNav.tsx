import { createT } from "./Translation.tsx";
import en from "./AdminNav.en.mfr";
import it from "./AdminNav.it.mfr";

const t = createT({ en, it });

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
  return (
    <div class="tab-bar mb-6">
      {TABS.map((tab) => (
        <a
          key={tab.href}
          href={tab.href}
          class={`tab ${isActive(currentPath, tab.href) ? "tab-active" : ""}`}
        >
          {t(`admin.${tab.key}`)}
        </a>
      ))}
    </div>
  );
}
