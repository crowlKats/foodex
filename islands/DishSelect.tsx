import { useSignal } from "@preact/signals";
import SearchSelect from "./SearchSelect.tsx";
import { Button } from "../components/Button.tsx";

interface DishSelectProps {
  dishes: { id: string; name: string }[];
  initialDishId?: string;
  initialDishName?: string;
  initialManual: boolean;
}

/**
 * The recipe's dish. Normally derived from the title automatically; picking
 * one here pins the recipe to that dish, and the pin survives renames.
 * Typing a name no dish has creates that dish on save — the way to split a
 * recipe out of a dish it was wrongly merged into. Clearing the field hands
 * control back to the title.
 *
 * Submits `dish_id`, `dish_new_name` and `dish_manual`; empty ids with
 * `dish_manual=false` mean "re-derive from the title on save".
 */
export default function DishSelect(
  { dishes, initialDishId, initialDishName, initialManual }: DishSelectProps,
) {
  const dishId = useSignal(initialDishId ?? "");
  const dishName = useSignal(initialDishName ?? "");
  const newName = useSignal("");
  const manual = useSignal(initialManual);

  return (
    <div>
      <div class="flex items-center gap-2">
        <SearchSelect
          value={{ id: dishId.value, name: dishName.value }}
          options={dishes}
          placeholder="Search dishes..."
          createLabel="New dish"
          onSelect={(o) => {
            dishId.value = o.id;
            dishName.value = o.name;
            newName.value = "";
            manual.value = true;
          }}
          onCreate={(text) => {
            dishId.value = "";
            dishName.value = text;
            newName.value = text;
            manual.value = true;
          }}
          onClear={() => {
            dishId.value = "";
            newName.value = "";
            manual.value = false;
          }}
        />
        {manual.value && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={() => {
              dishId.value = "";
              dishName.value = "";
              newName.value = "";
              manual.value = false;
            }}
          >
            Unpin
          </Button>
        )}
      </div>
      <p class="text-xs text-stone-400 mt-1">
        {manual.value
          ? newName.value
            ? "Saving creates this dish, pins the recipe to it, and moves recipes with a matching title along."
            : "Pinned — this recipe stays in the chosen dish even if you rename it. Unpin to match from the title again."
          : "Matched from the title automatically. Pick a dish to pin this recipe to it, or type a new name to give it a dish of its own."}
      </p>
      <input type="hidden" name="dish_id" value={dishId.value} />
      <input type="hidden" name="dish_new_name" value={newName.value} />
      <input
        type="hidden"
        name="dish_manual"
        value={manual.value ? "true" : "false"}
      />
    </div>
  );
}
