import { useSignal } from "@preact/signals";
import { formatAmount } from "../lib/format.ts";

interface SharedLine {
  key: string;
  ingredient_id: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  bought: boolean;
  sources: string[];
}

interface Props {
  initialLines: SharedLine[];
  token: string;
}

export default function SharedShoppingList({ initialLines, token }: Props) {
  const lines = useSignal<SharedLine[]>(initialLines);
  const busy = useSignal<string | null>(null);

  /**
   * A shared shopper's tick is a real purchase: it lands in the household's
   * pantry like any other. Previously this only flipped a flag on the row.
   */
  async function toggle(line: SharedLine) {
    const next = !line.bought;
    busy.value = line.key;
    lines.value = lines.value.map((l) =>
      l.key === line.key ? { ...l, bought: next } : l
    );

    const res = await fetch("/api/shopping-list-shared", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        action: next ? "buy_line" : "unbuy_line",
        match_key: line.key,
        ingredient_id: line.ingredient_id,
        name: line.name,
        amount: line.amount,
        unit: line.unit,
      }),
    });
    if (!res.ok) {
      lines.value = lines.value.map((l) =>
        l.key === line.key ? { ...l, bought: !next } : l
      );
    }
    busy.value = null;
  }

  const outstanding = lines.value.filter((l) => !l.bought);
  const done = lines.value.filter((l) => l.bought);

  if (lines.value.length === 0) {
    return (
      <div class="card text-center py-8">
        <p class="text-stone-500">Nothing left to buy.</p>
      </div>
    );
  }

  function row(line: SharedLine) {
    return (
      <div
        key={line.key}
        class="card flex items-center gap-3 py-3 px-4 cursor-pointer"
        onClick={() => toggle(line)}
      >
        <input
          type="checkbox"
          checked={line.bought}
          disabled={busy.value === line.key}
          class="size-5 cursor-pointer accent-orange-600 shrink-0"
          onChange={() => toggle(line)}
          onClick={(e) => e.stopPropagation()}
        />
        <div class="flex-1 min-w-0">
          <div
            class={`text-base font-medium ${line.bought ? "line-through" : ""}`}
          >
            {line.amount != null && (
              <span class={line.bought ? "mr-1" : "text-orange-600 mr-1"}>
                {formatAmount(line.amount, line.unit ?? "")}
                {line.unit ? ` ${line.unit}` : ""}
              </span>
            )}
            {line.name}
          </div>
          {line.sources.length > 0 && (
            <div class="text-xs text-stone-400">{line.sources.join(", ")}</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="space-y-1">{outstanding.map(row)}</div>

      {done.length > 0 && (
        <div>
          <h3 class="text-sm font-semibold text-stone-400 mb-1">
            Done ({done.length})
          </h3>
          <div class="space-y-1 opacity-50">{done.map(row)}</div>
        </div>
      )}
    </div>
  );
}
