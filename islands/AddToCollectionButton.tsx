import { useSignal } from "@preact/signals";
import TbBookmark from "tb-icons/TbBookmark";
import TbCheck from "tb-icons/TbCheck";

interface CollectionItem {
  id: number;
  name: string;
  hasRecipe: boolean;
}

interface Props {
  recipeId: number;
  collections: CollectionItem[];
}

export default function AddToCollectionButton(
  { recipeId, collections }: Props,
) {
  const open = useSignal(false);
  const items = useSignal(collections);
  const query = useSignal("");

  async function toggle(collectionId: number, currentlyIn: boolean) {
    const res = await fetch("/api/collections/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: currentlyIn ? "remove" : "add",
        collection_id: collectionId,
        recipe_id: recipeId,
      }),
    });
    if (res.ok) {
      items.value = items.value.map((c) =>
        c.id === collectionId ? { ...c, hasRecipe: !currentlyIn } : c
      );
    }
  }

  if (collections.length === 0) return null;

  const filtered = query.value.trim()
    ? items.value.filter((c) =>
      c.name.toLowerCase().includes(query.value.toLowerCase().trim())
    )
    : items.value;

  return (
    <div class="relative">
      <button
        type="button"
        class="btn btn-outline"
        title="Add to collection"
        onClick={() => {
          open.value = !open.value;
          query.value = "";
        }}
      >
        <TbBookmark class="size-3.5" />
        Collect
      </button>
      {open.value && (
        <div class="absolute z-10 right-0 mt-1 w-64 bg-white dark:bg-stone-800 border-2 border-stone-300 dark:border-stone-600 shadow-lg">
          <div class="p-1.5">
            <input
              type="text"
              placeholder="Search collections..."
              value={query}
              class="w-full text-sm search-input"
              autofocus
              onInput={(e) => {
                query.value = (e.target as HTMLInputElement).value;
              }}
              onBlur={() => {
                setTimeout(() => {
                  open.value = false;
                }, 150);
              }}
            />
          </div>
          <div class="max-h-48 overflow-y-auto">
            {filtered.length === 0
              ? (
                <div class="px-3 py-2 text-sm text-stone-400">
                  No collections found
                </div>
              )
              : filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  class="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm cursor-pointer hover:bg-stone-100 dark:hover:bg-stone-700"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    toggle(c.id, c.hasRecipe);
                  }}
                >
                  <span class="flex-1">{c.name}</span>
                  {c.hasRecipe && (
                    <TbCheck class="size-4 text-green-600 dark:text-green-400" />
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
