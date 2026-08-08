import { useSignal } from "@preact/signals";
import SearchSelect from "./SearchSelect.tsx";
import { IconPlus } from "@tabler/icons-preact";
import { IconTrash } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";
import { Input } from "../components/Input.tsx";

interface ToolEntry {
  tool_id: string;
  tool_name: string;
  /** Set when the user typed a name no tool has; saving creates it. */
  new_name: string;
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
    (initialTools.length > 0 ? initialTools : [{
      tool_id: "",
      tool_name: "",
      new_name: "",
      settings: "",
    }])
      .map((t) => ({ ...t, _uid: crypto.randomUUID() })),
  );

  const options = tools.map((t) => ({ id: t.id, name: t.name }));

  function add() {
    items.value = [...items.value, {
      tool_id: "",
      tool_name: "",
      new_name: "",
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
    <div class="space-y-3">
      {items.value.map((item, i) => (
        <div key={item._uid} class="form-row space-y-2">
          <div class="flex gap-2 items-center min-w-0">
            <span class="text-xs text-stone-400 font-mono shrink-0 w-5">
              #{i + 1}
            </span>
            <SearchSelect
              value={{ id: item.tool_id, name: item.tool_name }}
              options={options}
              placeholder="Search tool..."
              createLabel="New tool"
              onSelect={(o) => {
                const next = [...items.value];
                next[i] = {
                  ...next[i],
                  tool_id: o.id,
                  tool_name: o.name,
                  new_name: "",
                };
                items.value = next;
              }}
              onCreate={(text) => {
                const next = [...items.value];
                next[i] = {
                  ...next[i],
                  tool_id: "",
                  tool_name: text,
                  new_name: text,
                };
                items.value = next;
              }}
              onClear={() => {
                const next = [...items.value];
                next[i] = {
                  ...next[i],
                  tool_id: "",
                  tool_name: "",
                  new_name: "",
                };
                items.value = next;
              }}
            />
            <Button
              type="button"
              variant="danger-ghost"
              icon={IconTrash}
              title="Remove tool"
              class="shrink-0"
              onClick={() =>
                remove(i)}
            />
          </div>
          <div class="sm:pl-7">
            <Input
              type="text"
              placeholder="Default settings (e.g. 180C)"
              value={item.settings}
              onValueChange={(v) =>
                update(i, "settings", v)}
              size="sm"
              class="w-full"
            />
          </div>
          {item.new_name && (
            <p class="text-xs text-stone-400 sm:pl-7">
              Saving creates this tool and adds it to your household.
            </p>
          )}
          <input
            type="hidden"
            name={`tools[${i}][tool_id]`}
            value={item.tool_id}
          />
          <input
            type="hidden"
            name={`tools[${i}][tool_name]`}
            value={item.tool_name}
          />
          <input
            type="hidden"
            name={`tools[${i}][new_name]`}
            value={item.new_name}
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
