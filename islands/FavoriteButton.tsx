import { useSignal } from "@preact/signals";
import { IconHeart } from "@tabler/icons-preact";
import { IconHeartFilled } from "@tabler/icons-preact";
import { Button, type IconComponent } from "../components/Button.tsx";
import { createT } from "../components/Translation.tsx";
import en from "./FavoriteButton.en.mfr";
import it from "./FavoriteButton.it.mfr";

const t = createT({ en, it });

interface Props {
  recipeId: string;
  initialFavorited: boolean;
}

const HeartFilledRed: IconComponent = ({ class: c }) => (
  <IconHeartFilled class={`${c} text-red-500`} />
);

export default function FavoriteButton({ recipeId, initialFavorited }: Props) {
  const trans = t.use();
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
    <Button
      type="button"
      onClick={toggle}
      variant="outline"
      icon={favorited.value ? HeartFilledRed : IconHeart}
      title={favorited.value
        ? trans("recipes.removeFavorite")
        : trans("recipes.addFavorite")}
    >
      {favorited.value ? t("recipes.favorited") : t("recipes.favorite")}
    </Button>
  );
}
