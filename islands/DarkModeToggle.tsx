import { IconSun } from "@tabler/icons-preact";
import { IconMoon } from "@tabler/icons-preact";
import { t } from "../locales/shared.ts";

export default function DarkModeToggle() {
  const trans = t.use();
  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={toggle}
      class="nav-link text-sm"
      aria-label={trans("common.darkMode")}
    >
      <IconMoon class="size-[18px] dark:hidden" />
      <IconSun class="size-[18px] hidden dark:block" />
    </button>
  );
}
