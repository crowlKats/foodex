import QuantityInput from "./QuantityInput.tsx";
import IngredientForm from "./IngredientForm.tsx";
import ToolForm from "./ToolForm.tsx";
import StepForm from "./StepForm.tsx";
import MediaUpload from "./MediaUpload.tsx";
import RecipeOutputForm from "./RecipeOutputForm.tsx";
import DishSelect from "./DishSelect.tsx";
import { Input, InputMultiline } from "../components/Input.tsx";
import { SectionHeader } from "../components/SectionHeader.tsx";
import { Select } from "../components/Select.tsx";
import { DurationInput } from "../components/DurationInput.tsx";
import { RefForm } from "../components/RefForm.tsx";
import MultiSearchSelect from "./MultiSearchSelect.tsx";
import {
  DIETARY_TAGS,
  DIFFICULTY_LEVELS,
  MEAL_TYPES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPES,
} from "../lib/recipe-tags.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

interface CoverMedia {
  id: string;
  url: string;
  filename: string;
  content_type: string;
}

interface DishProps {
  dishes: { id: string; name: string }[];
  initialDishId?: string;
  initialDishName?: string;
  initialManual?: boolean;
}

interface Props {
  /** The recipe to seed the fields from (AgentRecipe / OcrRecipeData shape). */
  r: Any;
  /** Reset key — bump to re-seed all fields (used after AI refine). */
  v?: number;
  coverImage?: CoverMedia | null;
  showCover?: boolean;
  ingredients: { id: string; name: string; unit: string }[];
  allTools: { id: string; name: string }[];
  allRecipes: { id: string; title: string }[];
  /** media id → url, for step media thumbnails. */
  mediaUrls?: Record<string, string>;
  /** Render the dish picker (route editors have dish data, staging doesn't). */
  dish?: DishProps;
}

function formatDuration(
  minutes: number | null | undefined,
): { value: string; unit: string } {
  if (minutes == null) return { value: "", unit: "min" };
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: String(minutes / 60), unit: "hr" };
  }
  return { value: String(minutes), unit: "min" };
}

/** The one recipe edit form, shared by every create/edit/import surface. */
export default function RecipeFields(props: Props) {
  const { r, ingredients, allTools, allRecipes } = props;
  const v = props.v ?? 0;
  const showCover = props.showCover ?? true;
  const prep = formatDuration(r.prep_time);
  const cook = formatDuration(r.cook_time);
  const rest = formatDuration(r.rest_time);

  const sections: Any[] = r.sections ?? [];
  const sectionKeyToIdx = new Map<string, number>();
  sections.forEach((s: Any, i: number) => sectionKeyToIdx.set(s.key ?? "", i));

  const steps: Any[] = r.steps ?? [];
  const stepIdToIdx = new Map<string, number>();
  steps.forEach((s: Any, i: number) => {
    if (s.id) stepIdToIdx.set(s.id, i);
  });
  const initialSteps = steps.map((s: Any, i: number) => {
    const secKey = s.section ?? null;
    const secIdx = secKey != null ? sectionKeyToIdx.get(secKey) ?? -1 : -1;
    // Steps carrying an explicit dependency list keep their graph; shapes
    // without one (plain extraction output) read as a sequential chain.
    const after = s.after != null
      ? (s.after as string[])
        .map((id) => stepIdToIdx.get(id))
        .filter((n): n is number => n != null && n !== i)
      : (i > 0 ? [i - 1] : []);
    return {
      id: s.id,
      title: s.title ?? "",
      body: s.body ?? "",
      media: (s.media ?? []).map((m: Any) =>
        typeof m === "string" ? { id: m, url: props.mediaUrls?.[m] ?? "" } : m
      ),
      after,
      section: secIdx >= 0 ? secIdx : null,
    };
  });
  const branches = initialSteps.length > 0 &&
    !initialSteps.every((s, i) =>
      i === 0
        ? s.after.length === 0
        : (s.after.length === 1 && s.after[0] === i - 1)
    );

  return (
    <div class="space-y-6">
      {showCover && (
        <div class="card">
          <SectionHeader title="Cover Image" />
          <MediaUpload
            key={`cover-${v}`}
            name="cover_image_id"
            accept="image/*"
            initialMedia={props.coverImage ? [props.coverImage] : undefined}
          />
        </div>
      )}

      <div class="card space-y-3">
        <SectionHeader title="Details" />
        <div>
          <label class="block text-sm font-medium mb-1">Title</label>
          <Input
            key={`title-${v}`}
            type="text"
            name="title"
            required
            class="w-full"
            value={r.title ?? ""}
          />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Description</label>
          <InputMultiline
            key={`desc-${v}`}
            name="description"
            rows={2}
            class="w-full"
            value={r.description ?? ""}
          />
        </div>
        {props.dish && (
          <div>
            <label class="block text-sm font-medium mb-1">Dish</label>
            <DishSelect
              key={`dish-${v}`}
              dishes={props.dish.dishes}
              initialDishId={props.dish.initialDishId ?? ""}
              initialDishName={props.dish.initialDishName ?? ""}
              initialManual={props.dish.initialManual ?? false}
            />
          </div>
        )}
        <QuantityInput
          key={`qty-${v}`}
          initialType={r.quantity_type ?? "servings"}
          initialValue={r.quantity_value ?? 4}
          initialUnit={r.quantity_unit ?? "servings"}
          initialValue2={r.quantity_value2 ?? undefined}
          initialValue3={r.quantity_value3 ?? undefined}
        />
        <div class="grid grid-cols-3 gap-3 mt-3" key={`times-${v}`}>
          <DurationInput
            name="prep_time"
            label="Prep time"
            value={prep.value}
            unit={prep.unit}
          />
          <DurationInput
            name="cook_time"
            label="Cook time"
            value={cook.value}
            unit={cook.unit}
          />
          <DurationInput
            name="rest_time"
            label="Rest time"
            value={rest.value}
            unit={rest.unit}
          />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Difficulty</label>
            <Select key={`diff-${v}`} name="difficulty" class="w-full">
              <option value="">—</option>
              {DIFFICULTY_LEVELS.map((l) => (
                <option key={l} value={l} selected={r.difficulty === l}>
                  {l[0].toUpperCase() + l.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Meal Type</label>
            <MultiSearchSelect
              key={`meal-${v}`}
              name="meal_type"
              options={[...MEAL_TYPES]}
              initialSelected={r.meal_types ?? []}
              placeholder="Search meal types..."
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Dietary</label>
            <MultiSearchSelect
              key={`diet-${v}`}
              name="dietary"
              options={[...DIETARY_TAGS]}
              initialSelected={r.dietary_tags ?? []}
              placeholder="Search dietary tags..."
            />
          </div>
        </div>
        <label class="flex items-center gap-2 mt-3 cursor-pointer">
          <input
            key={`private-${v}`}
            type="checkbox"
            name="private"
            checked={r.private ?? false}
            class="size-4 accent-orange-600"
          />
          <span class="text-sm">
            Private (only visible to household members)
          </span>
        </label>
        <div>
          <label class="block text-sm font-medium mb-1">Source</label>
          <Select key={`source-type-${v}`} name="source_type" class="w-full">
            <option value="">—</option>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s} selected={r.source_type === s}>
                {SOURCE_TYPE_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Source Name</label>
            <Input
              key={`source-name-${v}`}
              type="text"
              name="source_name"
              value={r.source_name ?? ""}
              placeholder="e.g. Book title, website name, person's name"
              class="w-full"
            />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Source URL</label>
            <Input
              key={`source-url-${v}`}
              type="url"
              name="source_url"
              value={r.source_url ?? ""}
              placeholder="https://..."
              class="w-full"
            />
          </div>
        </div>
      </div>

      <div class="card">
        <SectionHeader title="Ingredients" />
        <IngredientForm
          key={`ing-${v}`}
          initialIngredients={(r.ingredients ?? []).map((ing: Any) => ({
            key: ing.key ?? "",
            name: ing.name ?? "",
            amount: ing.amount != null ? String(ing.amount) : "",
            unit: ing.unit ?? "",
            ingredient_id: ing.ingredient_id ?? "",
            always_on_hand: !!ing.always_on_hand,
          }))}
          ingredients={ingredients}
        />
      </div>

      <div class="card">
        <SectionHeader title="Tools" />
        <ToolForm
          key={`tools-${v}`}
          initialTools={(r.tools ?? []).map((t: Any) => ({
            tool_id: t.tool_id ?? "",
            tool_name: t.tool_name ??
              allTools.find((at) => at.id === t.tool_id)?.name ?? "",
            usage_description: t.usage_description ?? "",
            settings: t.settings ?? "",
          }))}
          tools={allTools}
        />
      </div>

      <div class="card">
        <SectionHeader title="Steps" />
        <StepForm
          key={`steps-${v}`}
          initialSteps={initialSteps}
          initialSections={sections.map((s: Any) => ({
            title: s.title ?? "",
            key: s.key ?? "",
            after: (s.after ?? [])
              .map((k: string) => sectionKeyToIdx.get(k))
              .filter((n: number | undefined): n is number => n != null),
          }))}
          initialMode={branches ? "graph" : "list"}
        />
      </div>

      <div class="card">
        <SectionHeader title="Output Ingredient" />
        <RecipeOutputForm
          ingredients={ingredients}
          initialIngredientId={(r.output_ingredient_id as string) ?? undefined}
          initialIngredientName={r.output_ingredient_id
            ? ingredients.find((g) => g.id === r.output_ingredient_id)?.name
            : undefined}
          initialAmount={r.output_amount != null
            ? String(r.output_amount)
            : undefined}
          initialUnit={(r.output_unit as string) ?? undefined}
          initialExpiresDays={r.output_expires_days != null
            ? r.output_expires_days
            : undefined}
        />
      </div>

      <div class="card">
        <SectionHeader title="Sub-recipe References" />
        <RefForm
          key={`refs-${v}`}
          initialRefs={(r.refs ?? []).map((ref: Any) => ({
            referenced_recipe_id: String(ref.referenced_recipe_id ?? ""),
          }))}
          recipes={allRecipes}
        />
      </div>
    </div>
  );
}
