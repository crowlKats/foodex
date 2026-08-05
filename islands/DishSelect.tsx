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
 * Clearing the field hands control back to the title.
 *
 * Submits `dish_id` and `dish_manual`; an empty id with `dish_manual=false`
 * means "re-derive from the title on save".
 */
export default function DishSelect(
  { dishes, initialDishId, initialDishName, initialManual }: DishSelectProps,
) {
  const dishId = useSignal(initialDishId ?? "");
  const dishName = useSignal(initialDishName ?? "");
  const manual = useSignal(initialManual);

  return (
    <div>
      <div class="flex items-center gap-2">
        <SearchSelect
          value={{ id: dishId.value, name: dishName.value }}
          options={dishes}
          placeholder="Search dishes..."
          onSelect={(o) => {
            dishId.value = o.id;
            dishName.value = o.name;
            manual.value = true;
          }}
          onClear={() => {
            dishId.value = "";
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
              manual.value = false;
            }}
          >
            Unpin
          </Button>
        )}
      </div>
      <p class="text-xs text-stone-400 mt-1">
        {manual.value
          ? "Pinned — this recipe stays in the chosen dish even if you rename it. Unpin to match from the title again."
          : "Matched from the title automatically. Pick a dish to pin this recipe to it — e.g. to file it under a dish with a different name."}
      </p>
      <input type="hidden" name="dish_id" value={dishId.value} />
      <input
        type="hidden"
        name="dish_manual"
        value={manual.value ? "true" : "false"}
      />
    </div>
  );
}
