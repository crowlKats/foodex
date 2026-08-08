/** A pill-shaped toggle link for filter bars (recipes list, audit log). */
export function FilterChip(
  { label, href, active, capitalize = true }: {
    label: string;
    href: string;
    active: boolean;
    /** Off for values where casing carries meaning (e.g. `tool.create`). */
    capitalize?: boolean;
  },
) {
  return (
    <a
      href={href}
      class={`inline-block text-xs px-2 py-1 rounded-full border transition-colors ${
        capitalize ? "capitalize " : ""
      }${
        active
          ? "bg-orange-100 dark:bg-orange-900 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300"
          : "border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-500"
      }`}
    >
      {label}
    </a>
  );
}
