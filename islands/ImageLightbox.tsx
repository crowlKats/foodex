import { useSignal } from "@preact/signals";
import TbX from "tb-icons/TbX";

interface ImageLightboxProps {
  src: string;
  alt: string;
  class?: string;
}

export default function ImageLightbox(
  { src, alt, class: className }: ImageLightboxProps,
) {
  const open = useSignal(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        class={`${className ?? ""} cursor-pointer`}
        onClick={() => {
          open.value = true;
        }}
      />
      {open.value && (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 cursor-pointer"
          onClick={() => {
            open.value = false;
          }}
        >
          <button
            type="button"
            class="absolute top-4 right-4 text-white/70 hover:text-white cursor-pointer"
            onClick={() => {
              open.value = false;
            }}
          >
            <TbX class="size-6" />
          </button>
          <img
            src={src}
            alt={alt}
            class="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
