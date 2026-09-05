import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "@tailwindcss/node";

const cssPath = path.resolve(__dirname, "../src/app/globals.css");

// Walks compiled CSS and returns the chain of enclosing at-rules (e.g. "@layer base")
// for every rule whose selector matches `selector`.
function layersOf(css: string, selector: string): string[][] {
  const found: string[][] = [];
  const stack: string[] = [];
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const close = css.indexOf("}", i);
    if (close !== -1 && close < open) {
      stack.pop();
      i = close + 1;
      continue;
    }
    const prelude = css.slice(i, open).trim().replace(/^[^;]*;/g, "").trim();
    if (prelude === selector) found.push([...stack]);
    stack.push(prelude);
    i = open + 1;
  }
  return found;
}

describe("global focus ring", () => {
  it("lives in @layer base so outline-none and rounded-* utilities can override it", async () => {
    const compiler = await compile(readFileSync(cssPath, "utf8"), { base: path.dirname(cssPath), onDependency: () => {} });
    const css = compiler.build(["outline-none", "rounded-xl"]);
    expect(css).toContain(".outline-none");
    const rules = layersOf(css, ":focus-visible");
    expect(rules.length).toBeGreaterThan(0);
    for (const chain of rules) expect(chain).toContain("@layer base");
  });
});
