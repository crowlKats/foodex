const TABS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/households", label: "Households" },
  { href: "/admin/recipes", label: "Recipes" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/system", label: "System" },
];

function isActive(currentPath: string, href: string): boolean {
  if (href === "/admin") return currentPath === "/admin";
  return currentPath.startsWith(href);
}

/** Section tabs shown at the top of every admin page. */
export function AdminNav({ currentPath }: { currentPath: string }) {
  return (
    <div class="tab-bar mb-6">
      {TABS.map((t) => (
        <a
          key={t.href}
          href={t.href}
          class={`tab ${isActive(currentPath, t.href) ? "tab-active" : ""}`}
        >
          {t.label}
        </a>
      ))}
    </div>
  );
}
