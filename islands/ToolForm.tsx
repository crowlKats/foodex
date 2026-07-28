import { useSignal } from "@preact/signals";
import SearchSelect from "./SearchSelect.tsx";
import { IconPlus } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";

interface ToolEntry {
  tool_id: string;
  tool_name: string;
  usage_description: string;
  settings: string;
}

interface ToolItem extends ToolEntry {
  _uid: string;
}

interface ToolFormProps {
  initialTools: ToolEntry[];
  tools: { id: string; name: string }[];
}

export default function ToolForm(
  { initialTools, tools }: ToolFormProps,
) {
  const items = useSignal<ToolItem[]>(
    (initialTools.length > 0
      ? initialTools
      : [{ tool_id: "", tool_name: "", usage_description: "", settings: "" }])
      .map((t) => ({ ...t, _uid: crypto.randomUUID() })),
  );

  const options = tools.map((t) => ({ id: t.id, name: t.name }));

  function add() {
    items.value = [...items.value, {
      tool_id: "",
      tool_name: "",
      usage_description: "",
      settings: "",
      _uid: crypto.randomUUID(),
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
        <div key={item._uid} class="space-y-2">
          <div class="flex gap-2 items-center min-w-0">
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
            <Button
              type="button"
              variant="danger-ghost"
              icon={IconTrash}
              title="Remove tool"
              class="shrink-0"
              onClick={() => remove(i)}
            />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              type="text"
              placeholder="Settings (e.g. 180C)"
              value={item.settings}
              onValueChange={(v) => update(i, "settings", v)}
              size="sm"
            />
            <Input
              type="text"
              placeholder="Usage description"
              value={item.usage_description}
              onValueChange={(v) => update(i, "usage_description", v)}
              size="sm"
            />
          </div>
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
        <IconPlus class="size-3.5 inline mr-1" />Add Tool
      </button>
    </div>
  );
}
