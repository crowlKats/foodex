import { signal } from "@preact/signals";
import QuantityInput from "./QuantityInput.tsx";
import IngredientForm from "./IngredientForm.tsx";
import ToolForm from "./ToolForm.tsx";
import StepForm from "./StepForm.tsx";
import MediaUpload from "./MediaUpload.tsx";
import RecipeOutputForm from "./RecipeOutputForm.tsx";
import { Input, InputBar, InputMultiline } from "../components/Input.tsx";
import { SectionHeader } from "../components/SectionHeader.tsx";
import { Select } from "../components/Select.tsx";
import MultiSearchSelect from "./MultiSearchSelect.tsx";
import {
  DIETARY_TAGS,
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

interface Props {
  /** The recipe to seed the fields from (OcrRecipeData / AgentRecipe shape). */
  r: Any;
  /** Reset key — bump to re-seed all fields (used after AI refine). */
  v?: number;
  coverImage?: CoverMedia | null;
  showCover?: boolean;
  ingredients: { id: string; name: string; unit: string }[];
  allTools: { id: string; name: string }[];
  allRecipes: { id: string; title: string }[];
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

/** The recipe edit form fields, shared by the draft editor and staging edit. */
export default function RecipeFields(props: Props) {
  const { r, ingredients, allTools, allRecipes } = props;
  const v = props.v ?? 0;
  const showCover = props.showCover ?? true;
  const prep = formatDuration(r.prep_time);
  const cook = formatDuration(r.cook_time);
  const rest = formatDuration(r.rest_time);

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
        <QuantityInput
          key={`qty-${v}`}
          initialType={r.quantity_type ?? "servings"}
          initialValue={r.quantity_value ?? 4}
          initialUnit={r.quantity_unit ?? "servings"}
        />
        <div class="grid grid-cols-3 gap-3 mt-3">
          <div>
            <label class="block text-sm font-medium mb-1">Prep time</label>
            <InputBar>
              <Input
                key={`prep-${v}`}
                type="number"
                name="prep_time"
                min="0"
                value={prep.value}
              />
              <Select
                key={`prepu-${v}`}
                name="prep_time_unit"
                class="w-20"
                size="xs"
              >
                <option value="min" selected={prep.unit === "min"}>min</option>
                <option value="hr" selected={prep.unit === "hr"}>hr</option>
              </Select>
            </InputBar>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Cook time</label>
            <InputBar>
              <Input
                key={`cook-${v}`}
                type="number"
                name="cook_time"
                min="0"
                value={cook.value}
              />
              <Select
                key={`cooku-${v}`}
                name="cook_time_unit"
                class="w-20"
                size="xs"
              >
                <option value="min" selected={cook.unit === "min"}>min</option>
                <option value="hr" selected={cook.unit === "hr"}>hr</option>
              </Select>
            </InputBar>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Rest time</label>
            <InputBar>
              <Input
                key={`rest-${v}`}
                type="number"
                name="rest_time"
                min="0"
                value={rest.value}
              />
              <Select
                key={`restu-${v}`}
                name="rest_time_unit"
                class="w-20"
                size="xs"
              >
                <option value="min" selected={rest.unit === "min"}>min</option>
                <option value="hr" selected={rest.unit === "hr"}>hr</option>
              </Select>
            </InputBar>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-sm font-medium mb-1">Difficulty</label>
            <Select key={`diff-${v}`} name="difficulty" class="w-full">
              <option value="">—</option>
              <option value="easy" selected={r.difficulty === "easy"}>
                Easy
              </option>
              <option value="medium" selected={r.difficulty === "medium"}>
                Medium
              </option>
              <option value="hard" selected={r.difficulty === "hard"}>
                Hard
              </option>
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
          }))}
          ingredients={ingredients}
        />
      </div>

      <div class="card">
        <SectionHeader title="Tools" />
        <ToolForm key={`tools-${v}`} initialTools={[]} tools={allTools} />
      </div>

      <div class="card">
        <SectionHeader title="Steps" />
        <p class="text-xs text-stone-500 mb-2">
          Use <code class="code-hint">{"{{ key }}"}</code>{" "}
          for scaled ingredients,{" "}
          <code class="code-hint">{"{{ key.amount }}"}</code>{" "}
          for just the number.{" "}
          <a href="/docs/templates" class="link text-xs">Full reference</a>
        </p>
        <StepForm
          key={`steps-${v}`}
          initialSteps={(r.steps ?? []).map((s: Any, i: number) => {
            const secKey = s.section ?? null;
            const secIdx = secKey != null
              ? (r.sections ?? []).findIndex((sec: Any) => sec.key === secKey)
              : -1;
            return {
              id: s.id,
              title: s.title ?? "",
              body: s.body ?? "",
              media: (s.media ?? []).map((m: Any) =>
                typeof m === "string" ? { id: m, url: "" } : m
              ),
              after: i > 0 ? [i - 1] : [],
              section: secIdx >= 0 ? secIdx : null,
            };
          })}
          initialSections={(() => {
            const all = r.sections ?? [];
            const keyToIdx = new Map<string, number>();
            all.forEach((s: Any, i: number) => keyToIdx.set(s.key ?? "", i));
            return all.map((s: Any) => ({
              title: s.title ?? "",
              key: s.key ?? "",
              after: (s.after ?? [])
                .map((k: string) => keyToIdx.get(k))
                .filter((v: number | undefined): v is number => v != null),
            }));
          })()}
          mode={signal<"list" | "graph">("list")}
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
        <Select name="refs[0][referenced_recipe_id]" class="w-full" size="sm">
          <option value="">No sub-recipe</option>
          {allRecipes.map((rec) => (
            <option key={rec.id} value={rec.id}>{rec.title}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}
