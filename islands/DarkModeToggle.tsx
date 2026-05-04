import TbSun from "tb-icons/TbSun";
import TbMoon from "tb-icons/TbMoon";

export default function DarkModeToggle() {
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
      aria-label="Toggle dark mode"
    >
      <TbMoon class="size-[18px] dark:hidden" />
      <TbSun class="size-[18px] hidden dark:block" />
    </button>
  );
}
