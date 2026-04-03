import { signal } from "@preact/signals";

export const stepMode = signal<"list" | "graph">("list");
