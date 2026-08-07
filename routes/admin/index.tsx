import { handler, page } from "./$index.ts";
import { AdminNav } from "../../components/AdminNav.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { formatBytes } from "../../lib/admin-format.ts";

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

    ctx.state.pageTitle = "Admin";
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
  return (
    <div>
      <PageHeader title="Admin" noSearch />
      <AdminNav currentPath={url.pathname} />

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <StatCard
          label="Households"
          value={String(counts.households)}
          href="/admin/households"
        />
        <StatCard
          label="Recipes"
          value={String(counts.recipes)}
          detail={`${counts.private_recipes} private`}
          href="/admin/recipes"
        />
        <StatCard
          label="Ingredients"
          value={String(counts.ingredients)}
          href="/ingredients"
        />
        <StatCard
          label="Media"
          value={String(counts.media_count)}
          detail={formatBytes(counts.media_bytes)}
          href="/admin/system"
        />
        <StatCard
          label="Assistant chats"
          value={String(counts.agent_sessions)}
        />
        <StatCard label="Collections" value={String(counts.collections)} />
        <StatCard
          label="Stores / Tools / Dishes"
          value={`${counts.stores} / ${counts.tools} / ${counts.dishes}`}
        />
      </div>
    </div>
  );
});
