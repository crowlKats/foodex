/**
 * Parser for the recipe step body template.
 *
 * Two layers:
 *
 *   1. `parseTemplate` scans the input character-by-character producing a
 *      sequence of `TemplateNode`s. It is responsible for recognising the
 *      directive markers (`{{`, `@step(`, `@timer(`, `@recipe(`) and for
 *      lifting their content out before any markdown sees them. This is what
 *      makes `*bar {{ foo * 2 }}*` safe: the inner `*` is fully consumed as
 *      part of the interpolation, so by the time markdown looks at the text
 *      only the outer `*…*` italic delimiters remain.
 *
 *   2. `parseExpression` parses the contents of `{{ … }}` as an arithmetic
 *      expression: numbers, variables, ingredient properties (`foo.name`),
 *      function calls, binary and unary operators.
 *
 * Parse errors never throw: they become `Invalid*` nodes that carry the
 * offending text range. The parser always returns an AST covering the full
 * input.
 */

import type {
  DishRefNode,
  Expr,
  InterpolationNode,
  InvalidDirectiveNode,
  InvalidExpr,
  Pos,
  RecipeRefNode,
  StepRefGlobalNode,
  StepRefSectionNode,
  TemplateAst,
  TemplateNode,
  TextNode,
  TimerNode,
} from "./ast.ts";

// ── Public entry points ─────────────────────────────────────────────────────

export function parseTemplate(source: string): TemplateAst {
  const p = new TemplateParser(source);
  const nodes = p.parseAll();
  return {
    kind: "template",
    source,
    nodes,
    start: 0,
    length: source.length,
  };
}

/**
 * Parse a stand-alone expression. `offset` is the absolute position in some
 * outer source where the expression starts (used to make the returned AST's
 * positions absolute). Defaults to 0.
 */
export function parseExpression(source: string, offset = 0): Expr {
  const ep = new ExpressionParser(source, offset);
  return ep.parseTopLevel();
}

// ── Template parser ─────────────────────────────────────────────────────────

class TemplateParser {
  private pos = 0;
  constructor(private readonly src: string) {}

  parseAll(): TemplateNode[] {
    const out: TemplateNode[] = [];
    let textStart = this.pos;
    let textBuf = "";

    const flushText = () => {
      if (textBuf.length === 0) return;
      const node: TextNode = {
        kind: "text",
        value: textBuf,
        start: textStart,
        length: textBuf.length,
      };
      out.push(node);
      textBuf = "";
      textStart = this.pos;
    };

    while (this.pos < this.src.length) {
      // `{{`: interpolation
      if (this.src.startsWith("{{", this.pos)) {
        flushText();
        const node = this.parseInterpolation();
        out.push(node);
        textStart = this.pos;
        continue;
      }
      // `@step(`, `@timer(`, `@recipe(`: recipe directives
      if (this.src[this.pos] === "@") {
        const dirStart = this.pos;
        const dir = this.tryParseDirective();
        if (dir) {
          flushText();
          out.push(dir);
          textStart = this.pos;
          continue;
        }
        // Not a recognised directive; fall through and treat `@` as text.
        this.pos = dirStart;
      }
      textBuf += this.src[this.pos];
      this.pos++;
    }
    flushText();
    return out;
  }

  private parseInterpolation(): InterpolationNode | InvalidDirectiveNode {
    const start = this.pos;
    this.pos += 2; // consume `{{`
    const innerStart = this.pos;

    // Find matching `}}`. Inside `{{ … }}` there are no nested braces in the
    // expression grammar, so a simple forward scan is correct.
    const closeIdx = this.src.indexOf("}}", this.pos);
    if (closeIdx < 0) {
      // Unterminated; consume to EOF as an invalid directive.
      const raw = this.src.slice(start);
      this.pos = this.src.length;
      return {
        kind: "invalid_directive",
        raw,
        message:
          "You opened `{{` but never closed it. Add `}}` where you want the value to end.",
        start,
        length: raw.length,
      };
    }

    const inner = this.src.slice(innerStart, closeIdx);
    // Trim leading/trailing whitespace, tracking how many we ate so the
    // inner expression range stays accurate.
    let lead = 0;
    while (lead < inner.length && isSpace(inner[lead])) lead++;
    let tail = 0;
    while (
      tail < inner.length - lead && isSpace(inner[inner.length - 1 - tail])
    ) {
      tail++;
    }
    const trimmed = inner.slice(lead, inner.length - tail);
    const exprStart = innerStart + lead;
    const exprLen = trimmed.length;

    let expr: Expr;
    if (trimmed.length === 0) {
      expr = {
        kind: "invalid_expr",
        raw: "",
        message: "`{{ }}` is empty. Put an ingredient name or a " +
          "calculation inside, like `{{ flour }}` or `{{ ratio * 2 }}`.",
        start: exprStart,
        length: 0,
      };
    } else {
      expr = parseExpression(trimmed, exprStart);
    }

    this.pos = closeIdx + 2; // consume `}}`
    return {
      kind: "interpolation",
      expr,
      exprRange: { start: exprStart, length: exprLen },
      start,
      length: this.pos - start,
    };
  }

  /**
   * Try to parse a directive starting at `@`. Returns null if the text after
   * `@` is not a recognised directive (in which case the caller should treat
   * `@` as plain text). Returns an invalid-directive node when the prefix
   * matches but the inner content is malformed.
   */
  private tryParseDirective(): TemplateNode | null {
    const start = this.pos;
    // We require `@<name>(`. If the syntax doesn't match we bail.
    const m = /^@([a-zA-Z]+)\(/.exec(this.src.slice(this.pos));
    if (!m) return null;
    const name = m[1];
    if (
      name !== "step" && name !== "timer" && name !== "recipe" &&
      name !== "dish"
    ) return null;

    const argStart = this.pos + m[0].length;
    const closeIdx = this.src.indexOf(")", argStart);
    if (closeIdx < 0) {
      // Unterminated directive; consume up to EOF.
      const raw = this.src.slice(start);
      this.pos = this.src.length;
      return {
        kind: "invalid_directive",
        raw,
        message:
          `You started \`@${name}(\` but never closed it. Add a \`)\` to finish.`,
        start,
        length: raw.length,
      };
    }

    const arg = this.src.slice(argStart, closeIdx);
    this.pos = closeIdx + 1; // consume `)`
    const totalLen = this.pos - start;

    switch (name) {
      case "step":
        return this.buildStepRef(arg, argStart, start, totalLen);
      case "timer":
        return this.buildTimer(arg, argStart, start, totalLen);
      case "recipe":
        return this.buildRecipeRef(arg, argStart, start, totalLen);
      case "dish":
        return this.buildDishRef(arg, argStart, start, totalLen);
    }
    return null;
  }

  private buildStepRef(
    arg: string,
    argStart: number,
    start: number,
    totalLen: number,
  ): StepRefGlobalNode | StepRefSectionNode | InvalidDirectiveNode {
    // `<key>.<number>` (section-relative) or `<number>` (global).
    const sectionMatch = /^([a-z0-9_-]+)\.(\d+)$/.exec(arg);
    if (sectionMatch) {
      const key = sectionMatch[1];
      const num = sectionMatch[2];
      return {
        kind: "step_ref_section",
        sectionKey: key,
        sectionKeyRange: { start: argStart, length: key.length },
        number: parseInt(num, 10),
        numberRange: {
          start: argStart + key.length + 1, // +1 for the `.`
          length: num.length,
        },
        start,
        length: totalLen,
      };
    }
    const globalMatch = /^(\d+)$/.exec(arg);
    if (globalMatch) {
      return {
        kind: "step_ref",
        number: parseInt(globalMatch[1], 10),
        numberRange: { start: argStart, length: globalMatch[1].length },
        start,
        length: totalLen,
      };
    }
    return {
      kind: "invalid_directive",
      raw: this.src.slice(start, start + totalLen),
      message:
        "`@step(...)` should point at another step, either by its number " +
        "(like `@step(3)` for step 3) or by section (like `@step(sauce.2)` " +
        "for step 2 of the sauce section).",
      start,
      length: totalLen,
    };
  }

  private buildTimer(
    arg: string,
    argStart: number,
    start: number,
    totalLen: number,
  ): TimerNode | InvalidDirectiveNode {
    // A duration is only valid if it matches the shape `<n>(h|m|s)…` AND
    // the parsed total is strictly greater than zero. `@timer(1)` (no unit)
    // and `@timer(0s)` (zero) are both "not a length of time", so we collapse
    // them into a single diagnostic.
    const shapeOk = /^\d+[hms](?:\d+[hms])*$/.test(arg);
    const seconds = shapeOk ? parseDurationStrict(arg) : null;
    if (!shapeOk || seconds == null) {
      return {
        kind: "invalid_directive",
        raw: this.src.slice(start, start + totalLen),
        message: arg.length === 0
          ? "`@timer(...)` needs a length of time inside. Try " +
            "`@timer(15m)` for 15 minutes, `@timer(1h30m)` for an hour " +
            "and a half, or `@timer(90s)` for 90 seconds."
          : `\`${arg}\` isn't a valid length of time. Try ` +
            "`15m` (15 minutes), `1h30m` (1 hour 30 minutes), " +
            "or `90s` (90 seconds).",
        start,
        length: totalLen,
      };
    }
    return {
      kind: "timer",
      duration: arg,
      durationRange: { start: argStart, length: arg.length },
      seconds,
      start,
      length: totalLen,
    };
  }

  private buildRecipeRef(
    arg: string,
    argStart: number,
    start: number,
    totalLen: number,
  ): RecipeRefNode | InvalidDirectiveNode {
    if (!/^[a-z0-9_-]+$/.test(arg)) {
      return {
        kind: "invalid_directive",
        raw: this.src.slice(start, start + totalLen),
        message: "`@recipe(...)` needs the slug of another recipe: " +
          "the part at the end of the recipe's web address. " +
          "It uses lowercase letters, numbers, `-` and `_` " +
          "(e.g. `@recipe(tomato-sauce)`).",
        start,
        length: totalLen,
      };
    }
    return {
      kind: "recipe_ref",
      slug: arg,
      slugRange: { start: argStart, length: arg.length },
      start,
      length: totalLen,
    };
  }

  private buildDishRef(
    arg: string,
    argStart: number,
    start: number,
    totalLen: number,
  ): DishRefNode | InvalidDirectiveNode {
    if (!/^[a-z0-9_-]+$/.test(arg)) {
      return {
        kind: "invalid_directive",
        raw: this.src.slice(start, start + totalLen),
        message: "`@dish(...)` needs the slug of a dish: " +
          "the part at the end of the dish's web address. " +
          "It uses lowercase letters, numbers, `-` and `_` " +
          "(e.g. `@dish(pizza-dough)`).",
        start,
        length: totalLen,
      };
    }
    return {
      kind: "dish_ref",
      slug: arg,
      slugRange: { start: argStart, length: arg.length },
      start,
      length: totalLen,
    };
  }
}

// ── Expression parser ──────────────────────────────────────────────────────

interface Token extends Pos {
  type:
    | "number"
    | "ident"
    | "+"
    | "-"
    | "*"
    | "/"
    | "("
    | ")"
    | ","
    | "."
    | "error";
  /** For numbers: the parsed value. For idents: the identifier text. */
  value?: number | string;
  /** Diagnostic message for `error` tokens. */
  message?: string;
}

class ExpressionParser {
  private tokens: Token[];
  private idx = 0;

  constructor(private readonly src: string, private readonly offset: number) {
    this.tokens = tokenize(src, offset);
  }

  parseTopLevel(): Expr {
    const expr = this.parseExpr();
    if (this.idx < this.tokens.length) {
      // Trailing junk after a valid expression: wrap into an invalid node
      // covering the trailing range, but keep the partial expression as the
      // primary parse result.
      const first = this.tokens[this.idx];
      const last = this.tokens[this.tokens.length - 1];
      const start = first.start;
      const length = (last.start + last.length) - start;
      return {
        kind: "invalid_expr",
        raw: this.src.slice(start - this.offset, start - this.offset + length),
        message: `There's an extra \`${tokenLabel(first)}\` here. ` +
          "Did you forget a math symbol like `+`, `-`, `*` or `/`?",
        start,
        length,
      };
    }
    return expr;
  }

  private peek(): Token | undefined {
    return this.tokens[this.idx];
  }

  private advance(): Token | undefined {
    return this.tokens[this.idx++];
  }

  private parseExpr(): Expr {
    let left = this.parseTerm();
    while (
      this.peek()?.type === "+" || this.peek()?.type === "-"
    ) {
      const opTok = this.advance()!;
      const right = this.parseTerm();
      left = {
        kind: "binary",
        op: opTok.type as "+" | "-",
        left,
        right,
        opRange: { start: opTok.start, length: opTok.length },
        start: left.start,
        length: (right.start + right.length) - left.start,
      };
    }
    return left;
  }

  private parseTerm(): Expr {
    let left = this.parseFactor();
    while (
      this.peek()?.type === "*" || this.peek()?.type === "/"
    ) {
      const opTok = this.advance()!;
      const right = this.parseFactor();
      left = {
        kind: "binary",
        op: opTok.type as "*" | "/",
        left,
        right,
        opRange: { start: opTok.start, length: opTok.length },
        start: left.start,
        length: (right.start + right.length) - left.start,
      };
    }
    return left;
  }

  private parseFactor(): Expr {
    const tok = this.peek();
    if (!tok) return this.atEofInvalid();

    if (tok.type === "error") {
      this.advance();
      return this.invalid(
        tok.start,
        tok.length,
        tok.message ?? "Invalid token",
      );
    }

    if (tok.type === "-") {
      this.advance();
      const operand = this.parseFactor();
      return {
        kind: "unary",
        op: "-",
        operand,
        opRange: { start: tok.start, length: tok.length },
        start: tok.start,
        length: (operand.start + operand.length) - tok.start,
      };
    }

    if (tok.type === "number") {
      this.advance();
      return {
        kind: "number",
        value: tok.value as number,
        start: tok.start,
        length: tok.length,
      };
    }

    if (tok.type === "(") {
      this.advance();
      const expr = this.parseExpr();
      const close = this.peek();
      if (close?.type === ")") {
        this.advance();
      } else {
        // Treat the whole `( … ` as invalid but keep the inner expression.
        const last = close ?? this.tokens[this.tokens.length - 1] ?? tok;
        return this.invalid(
          tok.start,
          (last.start + last.length) - tok.start,
          "You opened `(` but never closed it. Add a matching `)`.",
        );
      }
      return expr;
    }

    if (tok.type === "ident") {
      this.advance();
      const name = tok.value as string;
      const nameRange: Pos = { start: tok.start, length: tok.length };
      const next = this.peek();
      if (next?.type === ".") {
        this.advance();
        const prop = this.peek();
        if (prop?.type === "ident") {
          this.advance();
          return {
            kind: "property",
            object: name,
            property: prop.value as string,
            objectRange: nameRange,
            propertyRange: { start: prop.start, length: prop.length },
            start: tok.start,
            length: (prop.start + prop.length) - tok.start,
          };
        }
        return this.invalid(
          tok.start,
          (this.tokens[this.idx - 1].start + this.tokens[this.idx - 1].length) -
            tok.start,
          "After a `.` you need to say which part you want: " +
            "either `.amount` (just the number) or `.name` " +
            "(the ingredient's name).",
        );
      }
      if (next?.type === "(") {
        this.advance();
        const args: Expr[] = [];
        if (this.peek()?.type !== ")") {
          args.push(this.parseExpr());
          while (this.peek()?.type === ",") {
            this.advance();
            args.push(this.parseExpr());
          }
        }
        const close = this.peek();
        if (close?.type === ")") {
          this.advance();
          return {
            kind: "call",
            name,
            nameRange,
            args,
            start: tok.start,
            length: (close.start + close.length) - tok.start,
          };
        }
        const last = close ?? this.tokens[this.tokens.length - 1] ?? tok;
        return this.invalid(
          tok.start,
          (last.start + last.length) - tok.start,
          `\`${name}(\` is missing its closing \`)\`.`,
        );
      }
      return { kind: "variable", name, start: tok.start, length: tok.length };
    }

    // Unexpected token: consume it and produce an invalid expression.
    this.advance();
    return this.invalid(
      tok.start,
      tok.length,
      `\`${tokenLabel(tok)}\` doesn't belong here.`,
    );
  }

  private atEofInvalid(): InvalidExpr {
    const lastEnd = this.offset + this.src.length;
    return {
      kind: "invalid_expr",
      raw: "",
      message:
        "This calculation stops too soon; there should be something here.",
      start: lastEnd,
      length: 0,
    };
  }

  private invalid(start: number, length: number, message: string): InvalidExpr {
    return {
      kind: "invalid_expr",
      raw: this.src.slice(start - this.offset, start - this.offset + length),
      message,
      start,
      length,
    };
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function tokenize(src: string, offset: number): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    const start = i + offset;
    if ("+-*/(),".includes(ch)) {
      out.push({
        type: ch as Token["type"],
        start,
        length: 1,
      });
      i++;
      continue;
    }
    if (ch === ".") {
      // `.5` is a number, `foo.bar` keeps `.` as its own token.
      const prev = out[out.length - 1];
      const next = src[i + 1];
      if ((!prev || prev.type !== "ident") && next >= "0" && next <= "9") {
        let j = i + 1;
        while (j < src.length && src[j] >= "0" && src[j] <= "9") j++;
        const text = src.slice(i, j);
        out.push({
          type: "number",
          value: parseFloat(text),
          start,
          length: j - i,
        });
        i = j;
        continue;
      }
      out.push({ type: ".", start, length: 1 });
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      let j = i;
      let sawDot = false;
      while (j < src.length) {
        const c = src[j];
        if (c >= "0" && c <= "9") j++;
        else if (c === "." && !sawDot) {
          sawDot = true;
          j++;
        } else break;
      }
      const text = src.slice(i, j);
      out.push({
        type: "number",
        value: parseFloat(text),
        start,
        length: j - i,
      });
      i = j;
      continue;
    }
    if (
      (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_"
    ) {
      let j = i + 1;
      while (
        j < src.length &&
        ((src[j] >= "a" && src[j] <= "z") ||
          (src[j] >= "A" && src[j] <= "Z") ||
          (src[j] >= "0" && src[j] <= "9") || src[j] === "_")
      ) {
        j++;
      }
      out.push({
        type: "ident",
        value: src.slice(i, j),
        start,
        length: j - i,
      });
      i = j;
      continue;
    }
    // Unknown character: emit a single error token and continue so the parser
    // can recover.
    out.push({
      type: "error",
      message: `\`${ch}\` isn't allowed inside \`{{ ... }}\`.`,
      start,
      length: 1,
    });
    i++;
  }
  return out;
}

function tokenLabel(tok: Token): string {
  if (tok.type === "number" || tok.type === "ident") return String(tok.value);
  if (tok.type === "error") return tok.message ?? "?";
  return tok.type;
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}

/**
 * Parse a duration string of the form `<num>(h|m|s)(<num>(h|m|s))*` into
 * total seconds. Returns `null` if the components add up to zero.
 */
export function parseDurationStrict(s: string): number | null {
  let total = 0;
  const re = /(\d+)([hms])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const n = parseInt(m[1], 10);
    if (m[2] === "h") total += n * 3600;
    else if (m[2] === "m") total += n * 60;
    else total += n;
  }
  return total > 0 ? total : null;
}
