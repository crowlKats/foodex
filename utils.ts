import { createDefine } from "fresh";

export interface State {
  db: {
    query: (
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
  };
}

export const define = createDefine<State>();
