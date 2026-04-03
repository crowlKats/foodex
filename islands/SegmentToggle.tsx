import type { Signal } from "@preact/signals";

interface SegmentToggleProps<T extends string> {
  value: Signal<T>;
  options: readonly T[];
  labels?: Record<T, string>;
  onChange?: (value: T) => void;
}

export default function SegmentToggle<T extends string>(
  { value, options, labels, onChange }: SegmentToggleProps<T>,
) {
  const activeIdx = options.indexOf(value.value);
  const count = options.length;

  return (
    <div
      class="relative inline-grid border-2 border-stone-300 dark:border-stone-700"
      style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}
    >
      <div
        class="absolute inset-y-0 bg-stone-100 dark:bg-stone-800 transition-all duration-200 ease-in-out"
        style={{
          width: `${100 / count}%`,
          left: `${(activeIdx * 100) / count}%`,
        }}
      />
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            if (value.value !== option) {
              value.value = option;
              onChange?.(option);
            }
          }}
          class={`relative z-10 text-xs px-3 py-1 cursor-pointer transition-colors duration-200 text-center flex items-center justify-center ${
            value.value === option
              ? "text-stone-900 dark:text-stone-100"
              : "text-stone-500 dark:text-stone-400"
          }`}
        >
          {labels?.[option] ?? option[0].toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}
