interface RefFormProps {
  initialRefs: { referenced_recipe_id: string }[];
  recipes: { id: string; title: string }[];
}

export function RefForm({ initialRefs, recipes }: RefFormProps) {
  return (
    <div>
      {initialRefs.map((ref, i) => (
        <div key={i} class="flex gap-2 mb-2 items-center">
          <select
            name={`refs[${i}][referenced_recipe_id]`}
            class="flex-1"
          >
            <option value="">Select a recipe...</option>
            {recipes.map((r) => (
              <option
                key={r.id}
                value={r.id}
                selected={r.id === ref.referenced_recipe_id}
              >
                {r.title}
              </option>
            ))}
          </select>
        </div>
      ))}
      {initialRefs.length === 0 && (
        <div class="flex gap-2 mb-2 items-center">
          <select
            name="refs[0][referenced_recipe_id]"
            class="flex-1"
          >
            <option value="">Select a recipe...</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <p class="text-xs text-stone-500 mt-2">
        Add more references by saving and re-editing, or use @recipe(slug) in
        the steps.
      </p>
    </div>
  );
}
