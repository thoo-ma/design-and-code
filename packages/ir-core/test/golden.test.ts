import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parse, print } from "../src/index.js";

import { loginAst } from "./login.ast.js";

const LOGIN_IR = new URL("../../../examples/Login.ir", import.meta.url);
const source = readFileSync(LOGIN_IR, "utf8");

describe("golden : examples/Login.ir (spec §10.1)", () => {
  it("parse donne l'AST écrit à la main en T1", () => {
    const result = parse(source);
    expect(
      result.ok,
      result.ok ? "" : JSON.stringify(result.errors, null, 2),
    ).toBe(true);
    if (result.ok) expect(result.value.screen).toStrictEqual(loginAst);
  });

  it("print(parse(Login.ir)) redonne le fichier à l'octet près", () => {
    const result = parse(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(print(result.value.screen)).toBe(source);
  });

  it("print(loginAst) est le fichier committé", () => {
    expect(print(loginAst)).toBe(source);
  });

  it("la table des positions couvre les dix nœuds", () => {
    const result = parse(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { positions } = result.value;
    expect(positions.size).toBe(10);
    expect(positions.get("/")).toStrictEqual({ line: 2, column: 3 });
    expect(positions.get("/2/0")?.line).toBeGreaterThan(
      positions.get("/2")?.line ?? Infinity,
    );
    expect(positions.get("/3/1")?.column).toBe(7);
  });
});
