import { useComputed, useSignal } from "@preact/signals";

interface IngredientNameInputProps {
  existing: { id: string; name: string }[];
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 3);
}

function isSimilar(input: string, candidate: string): boolean {
  const a = normalize(input);
  const b = normalize(candidate);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  return tb.some((t) => ta.has(t));
}

export default function IngredientNameInput(
  { existing }: IngredientNameInputProps,
) {
  const value = useSignal("");

  const matches = useComputed(() => {
    const v = value.value.trim();
    if (v.length < 2) return [];
    return existing.filter((g) => isSimilar(v, g.name)).slice(0, 5);
  });

  return (
    <>
      <input
        type="text"
        name="name"
        required
        value={value}
        onInput={(e) => {
          value.value = (e.target as HTMLInputElement).value;
        }}
        class="w-full"
      />
      {matches.value.length > 0 && (
        <div class="mt-2 text-xs rounded border border-yellow-400 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-950 p-2 text-yellow-900 dark:text-yellow-200">
          <div class="font-medium mb-1">
            Similar ingredient{matches.value.length > 1 ? "s" : ""} already
            exist{matches.value.length > 1 ? "" : "s"}:
          </div>
          <ul class="space-y-0.5">
            {matches.value.map((m) => (
              <li key={m.id}>
                <a
                  href={`/ingredients/${m.id}`}
                  target="_blank"
                  class="link"
                >
                  {m.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
