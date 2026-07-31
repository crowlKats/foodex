import { useSignal } from "@preact/signals";
import { IconHeart } from "@tabler/icons-preact";
import { IconHeartFilled } from "@tabler/icons-preact";
import { Button, type IconComponent } from "../components/Button.tsx";

interface Props {
  recipeId: string;
  initialFavorited: boolean;
}

const HeartFilledRed: IconComponent = ({ class: c, ...rest }) => (
  <IconHeartFilled class={`${c} text-red-500`} {...rest} />
);

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
    <Button
      type="button"
      onClick={toggle}
      variant="outline"
      icon={favorited.value ? HeartFilledRed : IconHeart}
      title={favorited.value ? "Remove from favorites" : "Add to favorites"}
    >
      {favorited.value ? "Favorited" : "Favorite"}
    </Button>
  );
}
