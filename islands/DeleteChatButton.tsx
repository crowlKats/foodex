import { useState } from "preact/hooks";
import { IconTrash } from "@tabler/icons-preact";
import { Button } from "../components/Button.tsx";

interface Props {
  sessionId: string;
  /** Where to go after a successful delete (default: the conversation list). */
  redirect?: string;
}

export default function DeleteChatButton({ sessionId, redirect }: Props) {
  const [busy, setBusy] = useState(false);

  async function del(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/agent/${sessionId}`, { method: "DELETE" });
    if (res.ok) {
      globalThis.location.href = redirect ?? "/agent";
    } else {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger-ghost"
      icon={IconTrash}
      title="Delete conversation"
      disabled={busy}
      onClick={del}
    />
  );
}
