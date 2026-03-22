import { formatAmount } from "./format.ts";

export interface IngredientVar {
  amount: number;
  unit: string;
  name: string;
}

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "+" }
  | { type: "-" }
  | { type: "*" }
  | { type: "/" }
  | { type: "(" }
  | { type: ")" }
  | { type: "," }
  | { type: "." };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t" || ch === "\n") {
      i++;
    } else if (ch === "+") {
      tokens.push({ type: "+" });
      i++;
    } else if (ch === "-") {
      tokens.push({ type: "-" });
      i++;
    } else if (ch === "*") {
      tokens.push({ type: "*" });
      i++;
    } else if (ch === "/") {
      tokens.push({ type: "/" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "(" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: ")" });
      i++;
    } else if (ch === ",") {
      tokens.push({ type: "," });
      i++;
    } else if (ch === ".") {
      if (
        i + 1 < input.length && input[i + 1] >= "0" && input[i + 1] <= "9" &&
        (tokens.length === 0 || tokens[tokens.length - 1].type !== "ident")
      ) {
        let num = ".";
        i++;
        while (i < input.length && input[i] >= "0" && input[i] <= "9") {
          num += input[i++];
        }
        tokens.push({ type: "number", value: parseFloat(num) });
      } else {
        tokens.push({ type: "." });
        i++;
      }
    } else if (ch >= "0" && ch <= "9") {
      let num = "";
      while (
        i < input.length &&
        (input[i] >= "0" && input[i] <= "9" || input[i] === ".")
      ) {
        num += input[i++];
      }
      tokens.push({ type: "number", value: parseFloat(num) });
    } else if (
      ch >= "a" && ch <= "z" || ch >= "A" && ch <= "Z" || ch === "_"
    ) {
      let ident = "";
      while (
        i < input.length &&
        (input[i] >= "a" && input[i] <= "z" ||
          input[i] >= "A" && input[i] <= "Z" ||
          input[i] >= "0" && input[i] <= "9" || input[i] === "_")
      ) {
        ident += input[i++];
      }
      tokens.push({ type: "ident", value: ident });
    } else {
      throw new Error(`Unexpected character: '${ch}'`);
    }
  }
  return tokens;
}

type Expr =
  | { kind: "number"; value: number }
  | { kind: "var"; name: string }
  | { kind: "prop"; object: string; property: string }
  | { kind: "binary"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "unary"; op: "-"; operand: Expr }
  | { kind: "call"; name: string; args: Expr[] };

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const tok = this.advance();
    if (!tok || tok.type !== type) {
      throw new Error(`Expected '${type}', got '${tok?.type ?? "EOF"}'`);
    }
    return tok;
  }

  parse(): Expr {
    const expr = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token: ${this.tokens[this.pos].type}`);
    }
    return expr;
  }

  private parseExpr(): Expr {
    let left = this.parseTerm();
    while (this.peek()?.type === "+" || this.peek()?.type === "-") {
      const op = this.advance().type as "+" | "-";
      const right = this.parseTerm();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    while (this.peek()?.type === "*" || this.peek()?.type === "/") {
      const op = this.advance().type as "*" | "/";
      const right = this.parseFactor();
      left = { kind: "binary", op, left, right };
    }
    return left;
  }

  private parseFactor(): Expr {
    const tok = this.peek();
    if (!tok) throw new Error("Unexpected end of expression");

    if (tok.type === "-") {
      this.advance();
      const operand = this.parseFactor();
      return { kind: "unary", op: "-", operand };
    }

    if (tok.type === "number") {
      this.advance();
      return { kind: "number", value: tok.value };
    }

    if (tok.type === "(") {
      this.advance();
      const expr = this.parseExpr();
      this.expect(")");
      return expr;
    }

    if (tok.type === "ident") {
      this.advance();
      if (this.peek()?.type === ".") {
        this.advance();
        const propTok = this.expect("ident");
        return {
          kind: "prop",
          object: tok.value,
          property: (propTok as { type: "ident"; value: string }).value,
        };
      }
      if (this.peek()?.type === "(") {
        this.advance();
        const args: Expr[] = [];
        if (this.peek()?.type !== ")") {
          args.push(this.parseExpr());
          while (this.peek()?.type === ",") {
            this.advance();
            args.push(this.parseExpr());
          }
        }
        this.expect(")");
        return { kind: "call", name: tok.value, args };
      }
      return { kind: "var", name: tok.value };
    }

    throw new Error(`Unexpected token: ${tok.type}`);
  }
}

const BUILTINS: Record<string, (...args: number[]) => number> = {
  round: (n: number) => Math.round(n),
  ceil: (n: number) => Math.ceil(n),
  floor: (n: number) => Math.floor(n),
  min: (...args: number[]) => Math.min(...args),
  max: (...args: number[]) => Math.max(...args),
  abs: (n: number) => Math.abs(n),
};

function evaluate(expr: Expr, vars: Record<string, number>): number {
  switch (expr.kind) {
    case "number":
      return expr.value;
    case "var":
      if (expr.name in vars) return vars[expr.name];
      throw new Error(`Unknown variable: '${expr.name}'`);
    case "prop": {
      const key = `${expr.object}_${expr.property}`;
      if (key in vars) return vars[key];
      throw new Error(`Unknown property: '${expr.object}.${expr.property}'`);
    }
    case "binary": {
      const l = evaluate(expr.left, vars);
      const r = evaluate(expr.right, vars);
      switch (expr.op) {
        case "+":
          return l + r;
        case "-":
          return l - r;
        case "*":
          return l * r;
        case "/":
          return r === 0 ? 0 : l / r;
      }
      break;
    }
    case "unary":
      return -evaluate(expr.operand, vars);
    case "call": {
      const fn = BUILTINS[expr.name];
      if (!fn) throw new Error(`Unknown function: '${expr.name}'`);
      const args = expr.args.map((a) => evaluate(a, vars));
      return fn(...args);
    }
  }
}

export { formatAmount } from "./format.ts";

export function evaluateExpression(
  expression: string,
  variables: Record<string, number>,
  ingredients?: Record<string, IngredientVar>,
): string {
  try {
    const tokens = tokenize(expression);
    const ast = new Parser(tokens).parse();

    if (ast.kind === "var" && ingredients && ast.name in ingredients) {
      const ing = ingredients[ast.name];
      return `${
        formatAmount(ing.amount, ing.unit)
      }${ing.unit} ${ing.name.toLowerCase()}`;
    }

    if (ast.kind === "var" && ingredients) {
      const lower = ast.name.charAt(0).toLowerCase() + ast.name.slice(1);
      if (lower in ingredients) {
        const ing = ingredients[lower];
        return `${formatAmount(ing.amount, ing.unit)}${ing.unit} ${
          ing.name.charAt(0).toUpperCase()
        }${ing.name.slice(1).toLowerCase()}`;
      }
    }

    if (ast.kind === "prop" && ingredients && ast.object in ingredients) {
      const ing = ingredients[ast.object];
      if (ast.property === "name") return ing.name.toLowerCase();
    }

    const allVars = { ...variables };
    if (ingredients) {
      for (const [key, ing] of Object.entries(ingredients)) {
        allVars[`${key}_amount`] = ing.amount;
      }
    }

    return formatAmount(evaluate(ast, allVars));
  } catch (err) {
    return `{{ ${expression} }} /* error: ${(err as Error).message} */`;
  }
}

export function evaluateTemplate(
  template: string,
  variables: Record<string, number>,
  ingredients?: Record<string, IngredientVar>,
): string {
  return template.replace(/\{\{\s*(.*?)\s*\}\}/g, (_match, expr: string) => {
    return evaluateExpression(expr, variables, ingredients);
  });
}

export function scaleIngredients(
  ingredients: { key: string; amount: number; unit: string; name: string }[],
  ratio: number,
): Record<string, IngredientVar> {
  const result: Record<string, IngredientVar> = {};
  for (const ing of ingredients) {
    if (!ing.key) continue;
    result[ing.key] = {
      amount: ing.amount * ratio,
      unit: ing.unit,
      name: ing.name,
    };
  }
  return result;
}
