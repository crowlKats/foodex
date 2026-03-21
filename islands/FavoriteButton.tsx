import { useSignal } from "@preact/signals";
import TbHeart from "tb-icons/TbHeart";
import TbHeartFilled from "tb-icons/TbHeartFilled";

interface Props {
  recipeId: number;
  initialFavorited: boolean;
}

export default function FavoriteButton({ recipeId, initialFavorited }: Props) {
  const favorited = useSignal(initialFavorited);
  const loading = useSignal(false);

  async function toggle() {
    if (loading.value) return;
    loading.value = true;
    try {
      const res = await fetch("/api/recipes/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe_id: recipeId }),
      });
      if (res.ok) {
        const data = await res.json();
        favorited.value = data.favorited;
      }
    } finally {
      loading.value = false;
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      class="btn btn-outline"
      title={favorited.value ? "Remove from favorites" : "Add to favorites"}
    >
      {favorited.value
        ? <TbHeartFilled class="size-4 text-red-500" />
        : <TbHeart class="size-4" />}
    </button>
  );
}
