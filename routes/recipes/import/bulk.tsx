import { handler, page } from "./$bulk.ts";
import { BackLink } from "../../../components/BackLink.tsx";
import BulkImport from "../../../islands/BulkImport.tsx";
import { pickBundle } from "../../../lib/i18n/locale.ts";
import en from "./bulk.en.mfr";
import it from "./bulk.it.mfr";

export const handlers = handler({
  GET(ctx) {
    if (!ctx.state.user || !ctx.state.householdId) {
      return new Response(null, {
        status: 303,
        headers: { Location: ctx.state.user ? "/households" : "/auth/login" },
      });
    }
    ctx.state.pageTitle = pickBundle(ctx.state.locale, { en, it }).get(
      "recipes.bulkImportTitle",
    ).format();
    return { data: {} };
  },
});

export default page(function BulkImportPage() {
  return (
    <div>
      <BackLink href="/recipes/import" label="Back to Import" />

      <h1 class="text-2xl font-bold mt-4 mb-2">Bulk Import</h1>
      <p class="text-sm text-stone-500 mb-6">
        Photograph a whole recipe book, drop every page here, and group the
        pages into recipes. Each one is extracted by the assistant and lined up
        for review.
      </p>

      <BulkImport />
    </div>
  );
});
