import { marked } from "marked";
import { evaluateTemplate } from "./template.ts";

export interface RecipeRef {
  title: string;
  slug: string;
}

export type RecipeResolver = (slug: string) => Promise<RecipeRef | null>;

export async function renderRecipeBody(
  body: string,
  variables: Record<string, number>,
  resolveRecipe?: RecipeResolver,
): Promise<string> {
  // Step 1: Evaluate {= =} template expressions
  let result = evaluateTemplate(body, variables);

  // Step 2: Resolve @recipe(slug) references
  if (resolveRecipe) {
    const recipePattern = /@recipe\(([a-z0-9_-]+)\)/g;
    const matches = [...result.matchAll(recipePattern)];
    for (const match of matches) {
      const slug = match[1];
      const ref = await resolveRecipe(slug);
      if (ref) {
        result = result.replace(
          match[0],
          `[${ref.title}](/recipes/${ref.slug})`,
        );
      } else {
        result = result.replace(match[0], `*unknown recipe: ${slug}*`);
      }
    }
  }

  // Step 3: Render markdown to HTML
  return await marked.parse(result);
}
