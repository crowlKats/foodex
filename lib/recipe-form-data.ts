// Convert the recipe edit form's FormData into a recipe-data object. Shared by
// the draft editor and the agent staging edit modal so both read the same form.
// Ingredient links (`ingredient_id`) and stable step ids are preserved so the
// staging diff keys correctly.

function minutes(fd: FormData, name: string): number | null {
  const raw = fd.get(name) as string;
  const unit = fd.get(`${name}_unit`) as string;
  return raw ? Math.round(parseFloat(raw) * (unit === "hr" ? 60 : 1)) : null;
}

function num(fd: FormData, name: string): number | null {
  const v = fd.get(name) as string;
  return v ? parseFloat(v) : null;
}

export function formDataToRecipeData(fd: FormData): Record<string, unknown> {
  const ingredients: Record<string, unknown>[] = [];
  let i = 0;
  while (fd.has(`ingredients[${i}][name]`)) {
    ingredients.push({
      key: String(fd.get(`ingredients[${i}][key]`) ?? ""),
      name: String(fd.get(`ingredients[${i}][name]`) ?? ""),
      amount: String(fd.get(`ingredients[${i}][amount]`) ?? ""),
      unit: String(fd.get(`ingredients[${i}][unit]`) ?? ""),
      ingredient_id: (fd.get(`ingredients[${i}][ingredient_id]`) as string) ||
        null,
      always_on_hand: !!fd.get(`ingredients[${i}][always_on_hand]`),
    });
    i++;
  }

  const sectionsRaw: { title: string; key: string; afterIdx: number[] }[] = [];
  let secIdx = 0;
  while (fd.has(`sections[${secIdx}][title]`)) {
    const afterStr = String(fd.get(`sections[${secIdx}][after]`) ?? "");
    sectionsRaw.push({
      title: String(fd.get(`sections[${secIdx}][title]`) ?? ""),
      key: String(fd.get(`sections[${secIdx}][key]`) ?? ""),
      afterIdx: afterStr
        ? afterStr.split(",").map(Number).filter((n) => !isNaN(n))
        : [],
    });
    secIdx++;
  }
  const sections = sectionsRaw.map((s) => ({
    title: s.title,
    key: s.key,
    after: s.afterIdx.map((i) => sectionsRaw[i]?.key).filter((k): k is string =>
      !!k
    ),
  }));

  const steps: Record<string, unknown>[] = [];
  const stepAfterIdx: number[][] = [];
  let s = 0;
  while (fd.has(`steps[${s}][title]`) || fd.has(`steps[${s}][body]`)) {
    const secIdxRaw = fd.get(`steps[${s}][section]`);
    const sIdx = secIdxRaw && secIdxRaw !== ""
      ? parseInt(secIdxRaw as string)
      : null;
    const media: string[] = [];
    let mi = 0;
    while (fd.has(`steps[${s}][media][${mi}]`)) {
      const m = fd.get(`steps[${s}][media][${mi}]`) as string;
      if (m) media.push(m);
      mi++;
    }
    const afterStr = String(fd.get(`steps[${s}][after]`) ?? "");
    stepAfterIdx.push(
      afterStr ? afterStr.split(",").map(Number).filter((n) => !isNaN(n)) : [],
    );
    steps.push({
      id: (fd.get(`steps[${s}][id]`) as string) || `tmp_${s}`,
      title: String(fd.get(`steps[${s}][title]`) ?? ""),
      body: String(fd.get(`steps[${s}][body]`) ?? ""),
      section: sIdx != null && !isNaN(sIdx) && sections[sIdx]
        ? sections[sIdx].key
        : null,
      media,
    });
    s++;
  }
  steps.forEach((step, i) => {
    step.after = stepAfterIdx[i]
      .map((idx) => steps[idx]?.id)
      .filter((id): id is string => typeof id === "string" && id !== step.id);
  });

  const tools: Record<string, unknown>[] = [];
  let t = 0;
  while (fd.has(`tools[${t}][tool_id]`)) {
    const toolId = (fd.get(`tools[${t}][tool_id]`) as string) || "";
    if (toolId) {
      tools.push({
        tool_id: toolId,
        usage_description:
          (fd.get(`tools[${t}][usage_description]`) as string)?.trim() || null,
        settings: (fd.get(`tools[${t}][settings]`) as string)?.trim() || null,
      });
    }
    t++;
  }

  const refs: Record<string, unknown>[] = [];
  let rf = 0;
  while (fd.has(`refs[${rf}][referenced_recipe_id]`)) {
    const refId = (fd.get(`refs[${rf}][referenced_recipe_id]`) as string) || "";
    if (refId) refs.push({ referenced_recipe_id: refId });
    rf++;
  }

  return {
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    quantity_type: String(fd.get("quantity_type") ?? "servings"),
    quantity_value: Number(fd.get("quantity_value")) || 4,
    quantity_unit: String(fd.get("quantity_unit") ?? "servings"),
    quantity_value2: num(fd, "quantity_value2"),
    quantity_value3: num(fd, "quantity_value3"),
    quantity_unit2: (fd.get("quantity_unit2") as string) || null,
    quantity_servings: fd.get("quantity_servings")
      ? parseInt(fd.get("quantity_servings") as string)
      : null,
    prep_time: minutes(fd, "prep_time"),
    cook_time: minutes(fd, "cook_time"),
    rest_time: minutes(fd, "rest_time"),
    difficulty: (fd.get("difficulty") as string) || null,
    private: fd.get("private") === "on",
    cover_image_id: (fd.get("cover_image_id") as string) || null,
    source_type: (fd.get("source_type") as string) || null,
    source_name: (fd.get("source_name") as string)?.trim() || null,
    source_url: (fd.get("source_url") as string)?.trim() || null,
    meal_types: (fd.getAll("meal_type") as string[]).filter((v) => v.trim()),
    dietary_tags: (fd.getAll("dietary") as string[]).filter((v) => v.trim()),
    ingredients,
    sections,
    steps,
    tools,
    refs,
    output_ingredient_id: (fd.get("output_ingredient_id") as string) || null,
    output_amount: num(fd, "output_amount"),
    output_unit: (fd.get("output_unit") as string) || null,
    output_expires_days: fd.get("output_expires_days")
      ? parseInt(fd.get("output_expires_days") as string)
      : null,
  };
}
