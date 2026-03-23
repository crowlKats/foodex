import { define } from "../../utils.ts";

export const handler = define.handlers({
  async GET(ctx) {
    if (!ctx.state.user) {
      return new Response(null, { status: 401 });
    }

    const code = ctx.url.searchParams.get("code");
    if (!code) {
      return new Response(JSON.stringify({ error: "Missing code" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${
          encodeURIComponent(code)
        }.json?fields=product_name,brands,quantity`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!res.ok) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      const product = data.product;
      const name = product.product_name || null;
      const brand = product.brands || null;
      const quantity = product.quantity || null;

      // Try to parse quantity like "500 g" or "1 L" into amount + unit
      let amount: number | null = null;
      let unit: string | null = null;
      if (quantity) {
        const m = quantity.match(
          /^(\d+(?:[.,]\d+)?)\s*(g|kg|mg|ml|l|cl|dl|oz|lb|fl oz)$/i,
        );
        if (m) {
          amount = parseFloat(m[1].replace(",", "."));
          unit = m[2].toLowerCase();
          // Normalize units
          if (unit === "l") unit = "L";
          else if (unit === "cl") {
            amount *= 10;
            unit = "ml";
          } else if (unit === "dl") {
            amount *= 100;
            unit = "ml";
          }
        }
      }

      return new Response(
        JSON.stringify({ found: true, name, brand, quantity, amount, unit }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch {
      return new Response(JSON.stringify({ found: false }), {
        headers: { "Content-Type": "application/json" },
      });
    }
  },
});
