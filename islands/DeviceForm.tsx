import { useSignal } from "@preact/signals";

interface DeviceEntry {
  device_id: string;
  usage_description: string;
  settings: string;
}

interface DeviceFormProps {
  initialDevices: DeviceEntry[];
  devices: { id: string; name: string }[];
}

export default function DeviceForm(
  { initialDevices, devices }: DeviceFormProps,
) {
  const items = useSignal<DeviceEntry[]>(
    initialDevices.length > 0
      ? [...initialDevices]
      : [{ device_id: "", usage_description: "", settings: "" }],
  );

  function add() {
    items.value = [...items.value, {
      device_id: "",
      usage_description: "",
      settings: "",
    }];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: keyof DeviceEntry, value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };
    items.value = next;
  }

  return (
    <div class="space-y-2">
      {items.value.map((item, i) => (
        <div key={i} class="flex gap-2 items-start">
          <div class="flex-1 grid grid-cols-3 gap-2">
            <select
              value={item.device_id}
              onInput={(e) =>
                update(i, "device_id", (e.target as HTMLSelectElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            >
              <option value="">-- Device --</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Settings (e.g. 180C)"
              value={item.settings}
              onInput={(e) =>
                update(i, "settings", (e.target as HTMLInputElement).value)}
              class="border rounded px-2 py-1.5 text-sm"
            />
            <input
              type="text"
              placeholder="Usage description"
              value={item.usage_description}
              onInput={(e) =>
                update(
                  i,
                  "usage_description",
                  (e.target as HTMLInputElement).value,
                )}
              class="border rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            class="text-red-600 hover:text-red-800 px-2 py-1"
          >
            &times;
          </button>
          <input
            type="hidden"
            name={`devices[${i}][device_id]`}
            value={item.device_id}
          />
          <input
            type="hidden"
            name={`devices[${i}][usage_description]`}
            value={item.usage_description}
          />
          <input
            type="hidden"
            name={`devices[${i}][settings]`}
            value={item.settings}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="text-sm text-blue-600 hover:text-blue-800"
      >
        + Add Device
      </button>
    </div>
  );
}
