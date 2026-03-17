import { useSignal } from "@preact/signals";
import TbSun from "tb-icons/TbSun";
import TbMoon from "tb-icons/TbMoon";

export default function DarkModeToggle() {
  const dark = useSignal(false);

  if (typeof document !== "undefined") {
    dark.value = document.documentElement.classList.contains("dark");
  }

  function toggle() {
    const next = !dark.value;
    dark.value = next;
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
      {dark.value
        ? <TbSun class="size-[18px]" />
        : <TbMoon class="size-[18px]" />}
    </button>
  );
}
