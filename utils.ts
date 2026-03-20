import { createDefine } from "fresh";

export interface User {
  id: number;
  name: string;
  email: string | null;
  avatar_url: string | null;
}

export interface State {
  db: {
    query: (
      text: string,
      params?: unknown[],
    ) => Promise<{ rows: Record<string, unknown>[] }>;
  };
  user: User | null;
  shoppingListCount: number;
  pantryUrl: string | null;
}

export const define = createDefine<State>();
