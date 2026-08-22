import { handler, page } from "./$index.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { formatBytes } from "../../lib/admin-format.ts";
import { catalogFor } from "../../lib/i18n/mod.ts";
import { useMessages } from "../../lib/i18n/provider.tsx";

interface Counts {
  households: number;
  recipes: number;
  private_recipes: number;
  ingredients: number;
  stores: number;
  tools: number;
  dishes: number;
  collections: number;
  media_count: number;
  media_bytes: number;
  agent_sessions: number;
}

export const handlers = handler({
  async GET(ctx) {
    const q = ctx.state.db.query;
    const countsRes = await q<Record<keyof Counts, string>>(
      `SELECT
           (SELECT COUNT(*) FROM households) AS households,
           (SELECT COUNT(*) FROM recipes) AS recipes,
           (SELECT COUNT(*) FROM recipes WHERE private) AS private_recipes,
           (SELECT COUNT(*) FROM ingredients) AS ingredients,
           (SELECT COUNT(*) FROM stores) AS stores,
           (SELECT COUNT(*) FROM tools) AS tools,
           (SELECT COUNT(*) FROM dishes) AS dishes,
           (SELECT COUNT(*) FROM collections) AS collections,
           (SELECT COUNT(*) FROM media) AS media_count,
           (SELECT COALESCE(SUM(size_bytes), 0) FROM media) AS media_bytes,
           (SELECT COUNT(*) FROM agent_sessions) AS agent_sessions`,
    );

    const raw = countsRes.rows[0];
    const counts = Object.fromEntries(
      Object.entries(raw).map(([k, v]) => [k, Number(v)]),
    ) as unknown as Counts;

    ctx.state.pageTitle = catalogFor(ctx.state.locale).admin.title();
    return { data: { counts } };
  },
});

function StatCard(
  { label, value, detail, href }: {
    label: string;
    value: string;
    detail?: string;
    href?: string;
  },
) {
  const body = (
    <>
      <div class="text-2xl font-bold">{value}</div>
      <div class="text-sm text-stone-500">{label}</div>
      {detail && <div class="text-xs text-stone-400 mt-1">{detail}</div>}
    </>
  );
  return href
    ? <a href={href} class="card card-hover block">{body}</a>
    : <div class="card">{body}</div>;
}

export default page(function AdminDashboard({ data, url }) {
  const { counts } = data;
  const m = useMessages();
  return (
    <div>
      <PageHeader title={m.admin.title()} noSearch />
      <AdminNav currentPath={url.pathname} />

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label={m.admin.householdsStat()}
          value={String(counts.households)}
          href="/admin/households"
        />
        <StatCard
          label={m.admin.recipesStat()}
          value={String(counts.recipes)}
          detail={m.admin.privateCount({ count: counts.private_recipes })}
          href="/admin/recipes"
        />
        <StatCard
          label={m.admin.ingredientsStat()}
          value={String(counts.ingredients)}
          href="/ingredients"
        />
        <StatCard
          label={m.admin.mediaStat()}
          value={String(counts.media_count)}
          detail={formatBytes(counts.media_bytes)}
          href="/admin/system"
        />
        <StatCard
          label={m.admin.assistantChats()}
          value={String(counts.agent_sessions)}
        />
        <StatCard
          label={m.admin.collectionsStat()}
          value={String(counts.collections)}
        />
        <StatCard
          label={m.admin.storesToolsDishes()}
          value={`${counts.stores} / ${counts.tools} / ${counts.dishes}`}
        />
      </div>
    </div>
  );
});
