import type { Signal } from "@preact/signals";
import QuantityInput from "../../islands/QuantityInput.tsx";
import IngredientForm from "../../islands/IngredientForm.tsx";
import ToolForm from "../../islands/ToolForm.tsx";
import StepForm from "../../islands/StepForm.tsx";
import SegmentToggle from "../../islands/SegmentToggle.tsx";
import MediaUpload from "../../islands/MediaUpload.tsx";
import MultiSearchSelect from "../../islands/MultiSearchSelect.tsx";
import RecipeOutputForm from "../../islands/RecipeOutputForm.tsx";
import { FormField } from "../FormField.tsx";
import { Input, InputMultiline } from "../Input.tsx";
import { Select } from "../Select.tsx";
import { DurationInput } from "../DurationInput.tsx";
import { RefForm } from "../RefForm.tsx";
import {
  DIETARY_TAGS,
  DIFFICULTY_LEVELS,
  MEAL_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
} from "../../lib/recipe-tags.ts";
import type { RecipeEditData } from "../../lib/recipe-edit-data.ts";

/**
 * The recipe edit form, broken into the smallest groups the layout variants
 * need to rearrange. Every variant composes these same pieces, so a
 * side-by-side comparison only ever differs in arrangement.
 */
export interface FieldProps {
  d: RecipeEditData;
}

export function IdentityFields({ d }: FieldProps) {
  return (
    <>
      <FormField label="Title">
        <Input
          type="text"
          name="title"
          value={d.recipe.title}
          required
          class="w-full"
        />
      </FormField>
      <FormField label="Description">
        <InputMultiline
          name="description"
          rows={2}
          class="w-full"
          value={d.recipe.description ?? ""}
        />
      </FormField>
    </>
  );
}

export function YieldTimingFields({ d }: FieldProps) {
  return (
    <>
      <QuantityInput
        initialType={d.recipe.quantity_type ?? "servings"}
        initialValue={d.recipe.quantity_value ?? 4}
        initialUnit={d.recipe.quantity_unit ?? "servings"}
        initialValue2={d.recipe.quantity_value2 ?? undefined}
        initialValue3={d.recipe.quantity_value3 ?? undefined}
      />
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <DurationInput
          name="prep_time"
          label="Prep time"
          value={d.recipe.prep_time != null ? String(d.recipe.prep_time) : ""}
        />
        <DurationInput
          name="cook_time"
          label="Cook time"
          value={d.recipe.cook_time != null ? String(d.recipe.cook_time) : ""}
        />
        <DurationInput
          name="rest_time"
          label="Rest time"
          value={d.recipe.rest_time != null ? String(d.recipe.rest_time) : ""}
        />
      </div>
    </>
  );
}

export function ClassificationFields({ d }: FieldProps) {
  return (
    <>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <FormField label="Difficulty">
          <Select name="difficulty" class="w-full">
            <option value="">—</option>
            {DIFFICULTY_LEVELS.map((l) => (
              <option key={l} value={l} selected={d.recipe.difficulty === l}>
                {l[0].toUpperCase() + l.slice(1)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Meal Type">
          <MultiSearchSelect
            name="meal_type"
            options={[...MEAL_TYPES]}
            initialSelected={d.mealTypes}
            placeholder="Search meal types..."
          />
        </FormField>
        <FormField label="Dietary">
          <MultiSearchSelect
            name="dietary"
            options={[...DIETARY_TAGS]}
            initialSelected={d.dietaryTags}
            placeholder="Search dietary tags..."
          />
        </FormField>
      </div>
      <label class="flex items-center gap-2 mt-3 w-fit cursor-pointer">
        <input
          type="checkbox"
          name="private"
          checked={d.recipe.private}
          class="size-4 accent-orange-600"
        />
        <span class="text-sm">
          Private (only visible to household members)
        </span>
      </label>
    </>
  );
}

export function SourceFields({ d }: FieldProps) {
  return (
    <>
      <FormField label="Source">
        <Select name="source_type" class="w-full">
          <option value="">—</option>
          {SOURCE_TYPES.map((s) => (
            <option key={s} value={s} selected={d.recipe.source_type === s}>
              {SOURCE_TYPE_LABELS[s]}
            </option>
          ))}
        </Select>
      </FormField>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="Source Name">
          <Input
            type="text"
            name="source_name"
            value={d.recipe.source_name ?? ""}
            placeholder="e.g. Book title, website name, person's name"
            class="w-full"
          />
        </FormField>
        <FormField label="Source URL">
          <Input
            type="url"
            name="source_url"
            value={d.recipe.source_url ?? ""}
            placeholder="https://..."
            class="w-full"
          />
        </FormField>
      </div>
    </>
  );
}

export function CoverField({ d }: FieldProps) {
  return (
    <MediaUpload
      name="cover_image_id"
      accept="image/*"
      initialMedia={d.recipe.cover_media_id
        ? [{
          id: String(d.recipe.cover_media_id),
          url: d.recipe.cover_media_url!,
          filename: d.recipe.cover_media_filename!,
          content_type: d.recipe.cover_media_content_type!,
        }]
        : []}
    />
  );
}

export function IngredientsField({ d }: FieldProps) {
  return (
    <IngredientForm
      initialIngredients={d.ingredients.map((i) => ({
        key: i.key ?? "",
        name: i.name,
        amount: i.amount != null ? String(i.amount) : "",
        unit: i.unit ?? "",
        ingredient_id: i.ingredient_id != null ? String(i.ingredient_id) : "",
        always_on_hand: !!i.always_on_hand,
      }))}
      ingredients={d.allIngredients.map((g) => ({
        id: String(g.id),
        name: g.name,
        unit: g.unit ?? "",
      }))}
    />
  );
}

export function ToolsField({ d }: FieldProps) {
  return (
    <ToolForm
      initialTools={d.tools.map((m) => ({
        tool_id: String(m.tool_id),
        tool_name: m.tool_name ?? "",
        usage_description: m.usage_description ?? "",
        settings: m.settings ?? "",
      }))}
      tools={d.allTools.map((m) => ({ id: String(m.id), name: m.name }))}
    />
  );
}

export function StepsHint() {
  return (
    <p class="text-xs text-stone-500 mb-2">
      Use <code class="code-hint">{"{{ key }}"}</code> for scaled ingredients,
      {" "}
      <code class="code-hint">{"{{ key.amount }}"}</code>{" "}
      for just the number. Supports math and functions.{" "}
      <a href="/docs/templates" class="link text-xs">Full reference</a>
    </p>
  );
}

export function StepsModeToggle({ mode }: { mode: Signal<"list" | "graph"> }) {
  return <SegmentToggle value={mode} options={["list", "graph"]} />;
}

export function StepsField(
  { d, mode }: FieldProps & { mode: Signal<"list" | "graph"> },
) {
  return (
    <StepForm
      initialSteps={d.steps.map((s) => ({
        title: s.title ?? "",
        body: s.body ?? "",
        media: s.media ?? [],
        after: s.after ?? [],
        section: s.section ?? null,
      }))}
      initialSections={d.sections}
      mode={mode}
    />
  );
}

export function OutputField({ d }: FieldProps) {
  return (
    <RecipeOutputForm
      ingredients={d.allIngredients.map((g) => ({
        id: String(g.id),
        name: g.name,
        unit: g.unit ?? "",
      }))}
      initialIngredientId={d.recipe.output_ingredient_id
        ? String(d.recipe.output_ingredient_id)
        : undefined}
      initialIngredientName={d.outputIngredientName || undefined}
      initialAmount={d.recipe.output_amount != null
        ? String(d.recipe.output_amount)
        : undefined}
      initialUnit={d.recipe.output_unit ?? undefined}
      initialExpiresDays={d.recipe.output_expires_days != null
        ? Number(d.recipe.output_expires_days)
        : undefined}
    />
  );
}

export function RefsField({ d }: FieldProps) {
  return (
    <RefForm
      initialRefs={d.refs.map((r) => ({
        referenced_recipe_id: String(r.referenced_recipe_id),
      }))}
      recipes={d.allRecipes.map((r) => ({ id: String(r.id), title: r.title }))}
    />
  );
}

/** Steps default to graph mode only when the recipe actually branches. */
export function stepsDefaultMode(d: RecipeEditData): "list" | "graph" {
  const steps = d.steps;
  const branches = steps.length > 0 &&
    !steps.every((s, i) =>
      i === 0
        ? (s.after ?? []).length === 0
        : ((s.after ?? []).length === 1 && s.after![0] === i - 1)
    );
  return branches ? "graph" : "list";
}

/** Which optional sections hold data — drives auto-expanding disclosures. */
export function filledSections(d: RecipeEditData) {
  return {
    cover: !!d.recipe.cover_media_id,
    tools: d.tools.length > 0,
    output: !!d.recipe.output_ingredient_id,
    refs: d.refs.length > 0,
    source: !!(d.recipe.source_type || d.recipe.source_name ||
      d.recipe.source_url),
  };
}
