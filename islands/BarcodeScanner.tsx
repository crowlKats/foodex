import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import TbX from "tb-icons/TbX";
import { BarcodeDetector } from "barcode-detector";
import SearchSelect from "./SearchSelect.tsx";
import type { SearchSelectOption } from "./SearchSelect.tsx";
import { UNIT_GROUPS } from "../lib/units.ts";

interface ProductInfo {
  name: string;
  brand: string | null;
  quantity: string | null;
  amount: number | null;
  unit: string | null;
}

interface AddedItem {
  id: number;
  ingredient_id: number | null;
  name: string;
  amount: number | null;
  unit: string | null;
  expires_at: string | null;
}

interface BarcodeScannerProps {
  householdId: number;
  ingredients: { id: string; name: string; unit?: string }[];
  stores: { id: string; name: string }[];
  onAdd: (item: AddedItem) => void;
  onClose: () => void;
}

type Phase = "scanning" | "form";

export default function BarcodeScanner(
  { householdId, ingredients, stores, onAdd, onClose }: BarcodeScannerProps,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const error = useSignal("");
  const status = useSignal("Initializing camera...");
  const phase = useSignal<Phase>("scanning");
  const product = useSignal<ProductInfo | null>(null);

  // Form state
  const selectedIngredient = useSignal<{ id: string; name: string }>({
    id: "",
    name: "",
  });
  const itemName = useSignal("");
  const itemAmount = useSignal("");
  const itemUnit = useSignal("");
  const itemExpiresAt = useSignal("");
  const itemStoreId = useSignal("");
  const itemPrice = useSignal("");
  const saving = useSignal(false);

  const options: SearchSelectOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    detail: i.unit,
  }));

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;

    async function start() {
      try {
        status.value = "Requesting camera access...";
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 } },
        });
        if (stopped || !videoRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        status.value = "Initializing barcode detector...";

        const detector = new BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
        });

        const canvas = document.createElement("canvas");
        const ctx2d = canvas.getContext("2d")!;

        // Warm up the detector
        canvas.width = 1;
        canvas.height = 1;
        await detector.detect(canvas);

        status.value = "Point your camera at a barcode";

        async function scan() {
          if (stopped || !videoRef.current) return;

          const video = videoRef.current;
          if (video.readyState >= video.HAVE_CURRENT_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx2d.drawImage(video, 0, 0);

            try {
              const barcodes = await detector.detect(canvas);
              if (barcodes.length > 0 && !stopped) {
                const code = barcodes[0].rawValue;
                stream?.getTracks().forEach((t) => t.stop());
                status.value = `Looking up ${code}...`;
                await lookupBarcode(code);
                return;
              }
            } catch (err) {
              console.warn("Barcode detect error:", err);
            }
          }

          if (!stopped) setTimeout(scan, 250);
        }

        scan();
      } catch (err) {
        error.value = err instanceof Error
          ? err.message
          : "Could not access camera";
      }
    }

    start();

    return () => {
      stopped = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function lookupBarcode(code: string) {
    try {
      const res = await fetch(
        `/api/barcode?code=${encodeURIComponent(code)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.name) {
          product.value = {
            name: data.name,
            brand: data.brand,
            quantity: data.quantity,
            amount: data.amount,
            unit: data.unit,
          };
          // Pre-fill form with parsed data
          if (data.amount) itemAmount.value = String(data.amount);
          if (data.unit) itemUnit.value = data.unit;

          // Best-effort match against existing ingredients
          const productName = data.name.toLowerCase();
          const productWords = productName.split(/\s+/);
          // Try exact, then substring, then any word overlap
          const match = ingredients.find(
            (i) => i.name.toLowerCase() === productName,
          ) ?? ingredients.find(
            (i) => productName.includes(i.name.toLowerCase()),
          ) ?? ingredients.find(
            (i) => i.name.toLowerCase().includes(productName),
          ) ?? ingredients.find((i) => {
            const ingWords = i.name.toLowerCase().split(/\s+/);
            return ingWords.some((w) =>
              w.length > 2 &&
              productWords.some((pw: string) => pw.length > 2 && pw.includes(w))
            );
          });
          if (match) {
            selectedIngredient.value = { id: match.id, name: match.name };
            itemName.value = match.name;
            if (match.unit) itemUnit.value = match.unit;
          } else {
            itemName.value = data.name;
          }

          phase.value = "form";
          return;
        }
      }
      error.value = `No product found for barcode ${code}.`;
    } catch {
      error.value = "Failed to look up barcode.";
    }
  }

  async function handleAdd() {
    const name = selectedIngredient.value.id
      ? selectedIngredient.value.name
      : itemName.value.trim();
    if (!name) return;

    saving.value = true;

    const isNewIngredient = !selectedIngredient.value.id;
    const payload: Record<string, unknown> = {
      action: "add",
      household_id: householdId,
      ingredient_id: selectedIngredient.value.id
        ? parseInt(selectedIngredient.value.id)
        : null,
      name,
      amount: itemAmount.value ? parseFloat(itemAmount.value) : null,
      unit: itemUnit.value || null,
      expires_at: itemExpiresAt.value || null,
    };

    // Pass brand/store/price for ingredient creation
    if (isNewIngredient) {
      payload.create_ingredient = true;
    }
    if (product.value?.brand) {
      payload.brand = product.value.brand;
    }
    if (itemStoreId.value && itemPrice.value) {
      payload.store_id = parseInt(itemStoreId.value);
      payload.price = parseFloat(itemPrice.value);
    }

    const res = await fetch("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      onAdd({
        id: data.id,
        ingredient_id: data.ingredient_id ?? null,
        name,
        amount: payload.amount as number | null,
        unit: payload.unit as string | null,
        expires_at: payload.expires_at as string | null,
      });
    }
    saving.value = false;
  }

  return (
    <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div class="bg-white dark:bg-stone-900 w-full max-w-md border-2 border-stone-300 dark:border-stone-700 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-3 border-b-2 border-stone-300 dark:border-stone-700">
          <h3 class="font-semibold">
            {phase.value === "scanning" ? "Scan Barcode" : "Add to Pantry"}
          </h3>
          <button
            type="button"
            class="p-1 cursor-pointer text-stone-500 hover:text-stone-700 dark:hover:text-stone-300"
            onClick={onClose}
          >
            <TbX class="size-5" />
          </button>
        </div>

        <div class="p-4 space-y-3">
          {error.value
            ? (
              <div class="space-y-3">
                <p class="text-sm text-red-600 dark:text-red-400">
                  {error.value}
                </p>
                <button
                  type="button"
                  class="btn btn-primary w-full"
                  onClick={onClose}
                >
                  Close
                </button>
              </div>
            )
            : phase.value === "scanning"
            ? (
              <div class="space-y-2">
                <div class="relative bg-black aspect-[4/3] overflow-hidden">
                  <video
                    ref={videoRef}
                    class="w-full h-full object-cover"
                    playsInline
                    muted
                  />
                  <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div class="w-3/4 h-1/3 border-2 border-orange-400 opacity-70" />
                  </div>
                </div>
                <p class="text-sm text-stone-500 text-center">
                  {status.value}
                </p>
              </div>
            )
            : (
              <div class="space-y-3">
                {product.value && (
                  <div class="text-sm bg-stone-50 dark:bg-stone-800 p-3 border-2 border-stone-200 dark:border-stone-700">
                    <p class="font-medium">{product.value.name}</p>
                    {product.value.brand && (
                      <p class="text-stone-500">{product.value.brand}</p>
                    )}
                    {product.value.quantity && (
                      <p class="text-stone-500">{product.value.quantity}</p>
                    )}
                  </div>
                )}

                <div>
                  <label class="block text-sm font-medium mb-1">
                    Ingredient
                  </label>
                  <SearchSelect
                    value={selectedIngredient.value}
                    options={options}
                    placeholder="Search or type ingredient name..."
                    onSelect={(o) => {
                      selectedIngredient.value = { id: o.id, name: o.name };
                      itemName.value = o.name;
                      const ing = ingredients.find((i) => i.id === o.id);
                      if (ing?.unit) {
                        itemUnit.value = ing.unit;
                      }
                    }}
                    onClear={() => {
                      selectedIngredient.value = { id: "", name: "" };
                      itemName.value = "";
                    }}
                    onChange={(text) => {
                      itemName.value = text;
                    }}
                  />
                  {!selectedIngredient.value.id && itemName.value.trim() && (
                    <p class="text-xs text-stone-500 mt-1">
                      New ingredient will be created
                    </p>
                  )}
                </div>

                <div class="flex gap-3">
                  <div class="flex-1">
                    <label class="block text-sm font-medium mb-1">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={itemAmount.value}
                      class="w-full"
                      placeholder="e.g. 500"
                      onInput={(e) => {
                        itemAmount.value = (e.target as HTMLInputElement).value;
                      }}
                    />
                  </div>
                  <div class="flex-1">
                    <label class="block text-sm font-medium mb-1">Unit</label>
                    <select
                      value={itemUnit.value}
                      class="w-full"
                      onChange={(e) => {
                        itemUnit.value = (e.target as HTMLSelectElement).value;
                      }}
                    >
                      <option value="">—</option>
                      {UNIT_GROUPS.map((g) => (
                        <optgroup key={g.label} label={g.label}>
                          {g.units.map((u) => (
                            <option key={u.name} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium mb-1">
                    Best before <span class="text-stone-400">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={itemExpiresAt.value}
                    class="w-full"
                    onInput={(e) => {
                      itemExpiresAt.value =
                        (e.target as HTMLInputElement).value;
                    }}
                  />
                </div>

                {stores.length > 0 && (
                  <div class="border-t-2 border-stone-200 dark:border-stone-700 pt-3 space-y-3">
                    <p class="text-sm font-medium text-stone-500">
                      Price info{" "}
                      <span class="text-stone-400 font-normal">(optional)</span>
                    </p>
                    <div class="flex gap-3">
                      <div class="flex-1">
                        <label class="block text-sm font-medium mb-1">
                          Store
                        </label>
                        <select
                          value={itemStoreId.value}
                          class="w-full"
                          onChange={(e) => {
                            itemStoreId.value =
                              (e.target as HTMLSelectElement).value;
                          }}
                        >
                          <option value="">—</option>
                          {stores.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div class="flex-1">
                        <label class="block text-sm font-medium mb-1">
                          Price
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={itemPrice.value}
                          class="w-full"
                          placeholder="e.g. 2.49"
                          onInput={(e) => {
                            itemPrice.value =
                              (e.target as HTMLInputElement).value;
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  class="btn btn-primary w-full"
                  disabled={saving.value ||
                    (!selectedIngredient.value.id &&
                      !itemName.value.trim())}
                  onClick={handleAdd}
                >
                  {saving.value ? "Adding..." : "Add to Pantry"}
                </button>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
