import { App, staticFiles } from "fresh";
import { define, type State } from "./utils.ts";
import { query } from "./db/mod.ts";

export const app = new App<State>();

app.use(staticFiles());

app.use(define.middleware((ctx) => {
  ctx.state.db = { query };
  return ctx.next();
}));

app.use(define.middleware((ctx) => {
  console.log(`${ctx.req.method} ${ctx.req.url}`);
  return ctx.next();
}));

app.fsRoutes();
