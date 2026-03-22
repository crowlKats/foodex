import { useSignal } from "@preact/signals";
import SearchSelect from "./SearchSelect.tsx";
import TbPlus from "tb-icons/TbPlus";
import TbX from "tb-icons/TbX";

interface ToolEntry {
  tool_id: string;
  tool_name: string;
  usage_description: string;
  settings: string;
}

interface ToolFormProps {
  initialTools: ToolEntry[];
  tools: { id: string; name: string }[];
}

export default function ToolForm(
  { initialTools, tools }: ToolFormProps,
) {
  const items = useSignal<ToolEntry[]>(
    initialTools.length > 0
      ? [...initialTools]
      : [{ tool_id: "", tool_name: "", usage_description: "", settings: "" }],
  );

  const options = tools.map((t) => ({ id: t.id, name: t.name }));

  function add() {
    items.value = [...items.value, {
      tool_id: "",
      tool_name: "",
      usage_description: "",
      settings: "",
    }];
  }

  function remove(index: number) {
    items.value = items.value.filter((_, i) => i !== index);
  }

  function update(index: number, field: keyof ToolEntry, value: string) {
    const next = [...items.value];
    next[index] = { ...next[index], [field]: value };
    items.value = next;
  }

  return (
    <div class="space-y-2">
      {items.value.map((item, i) => (
        <div key={i} class="flex gap-2 items-start">
          <div class="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <SearchSelect
              value={{ id: item.tool_id, name: item.tool_name }}
              options={options}
              placeholder="Search tool..."
              onSelect={(o) => {
                const next = [...items.value];
                next[i] = { ...next[i], tool_id: o.id, tool_name: o.name };
                items.value = next;
              }}
              onClear={() => {
                const next = [...items.value];
                next[i] = { ...next[i], tool_id: "", tool_name: "" };
                items.value = next;
              }}
            />
            <input
              type="text"
              placeholder="Settings (e.g. 180C)"
              value={item.settings}
              onInput={(e) =>
                update(i, "settings", (e.target as HTMLInputElement).value)}
              class="text-sm"
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
              class="text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => remove(i)}
            class="text-red-600 hover:text-red-700 px-2 py-1 cursor-pointer"
          >
            <TbX class="size-4" />
          </button>
          <input
            type="hidden"
            name={`tools[${i}][tool_id]`}
            value={item.tool_id}
          />
          <input
            type="hidden"
            name={`tools[${i}][usage_description]`}
            value={item.usage_description}
          />
          <input
            type="hidden"
            name={`tools[${i}][settings]`}
            value={item.settings}
          />
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        class="link text-sm font-medium"
      >
        <TbPlus class="size-3.5 inline mr-1" />Add Tool
      </button>
    </div>
  );
}
