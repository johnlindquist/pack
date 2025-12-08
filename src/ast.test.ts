/**
 * Tests for AST-based parsing utilities
 */

import { describe, test, expect } from "bun:test";
import {
  isASTSupported,
  getLanguageFromExtension,
  parseCode,
  stripCommentsAST,
} from "./ast";
import {
  findContainingBlock,
  findBlocksInRange,
  expandToBlockBoundaries,
  getDeclarations,
} from "./ast-context";

describe("isASTSupported", () => {
  test("supports TypeScript", () => {
    expect(isASTSupported("ts")).toBe(true);
    expect(isASTSupported(".ts")).toBe(true);
    expect(isASTSupported("tsx")).toBe(true);
  });

  test("supports JavaScript", () => {
    expect(isASTSupported("js")).toBe(true);
    expect(isASTSupported(".jsx")).toBe(true);
    expect(isASTSupported("mjs")).toBe(true);
  });

  test("supports Python", () => {
    expect(isASTSupported("py")).toBe(true);
    expect(isASTSupported(".py")).toBe(true);
  });

  test("does not support unsupported languages", () => {
    expect(isASTSupported("go")).toBe(false);
    expect(isASTSupported("rs")).toBe(false);
    expect(isASTSupported("java")).toBe(false);
  });
});

describe("getLanguageFromExtension", () => {
  test("maps extensions to languages", () => {
    expect(getLanguageFromExtension("ts")).toBe("typescript");
    expect(getLanguageFromExtension("tsx")).toBe("typescript");
    expect(getLanguageFromExtension("js")).toBe("javascript");
    expect(getLanguageFromExtension("py")).toBe("python");
  });

  test("handles dot prefix", () => {
    expect(getLanguageFromExtension(".ts")).toBe("typescript");
    expect(getLanguageFromExtension(".py")).toBe("python");
  });

  test("returns null for unsupported", () => {
    expect(getLanguageFromExtension("go")).toBeNull();
    expect(getLanguageFromExtension("unknown")).toBeNull();
  });
});

describe("parseCode", () => {
  test("parses TypeScript", async () => {
    const tree = await parseCode("const x = 1;", "ts");
    expect(tree).not.toBeNull();
    expect(tree!.rootNode.type).toBe("program");
  });

  test("parses JavaScript", async () => {
    const tree = await parseCode("function foo() {}", "js");
    expect(tree).not.toBeNull();
  });

  test("parses Python", async () => {
    const tree = await parseCode("def foo():\n  pass", "py");
    expect(tree).not.toBeNull();
  });

  test("returns null for unsupported", async () => {
    const tree = await parseCode("package main", "go");
    expect(tree).toBeNull();
  });
});

describe("stripCommentsAST", () => {
  test("strips line comments from TypeScript", async () => {
    const code = `const x = 1; // comment
const y = 2;`;
    const { result, usedAST } = await stripCommentsAST(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).not.toContain("// comment");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("const y = 2;");
  });

  test("strips block comments from TypeScript", async () => {
    const code = `/* block comment */
const x = 1;`;
    const { result, usedAST } = await stripCommentsAST(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).not.toContain("block comment");
    expect(result).toContain("const x = 1;");
  });

  test("strips comments from JavaScript", async () => {
    const code = `// line comment
function foo() { /* inline */ }`;
    const { result, usedAST } = await stripCommentsAST(code, "js");
    expect(usedAST).toBe(true);
    expect(result).not.toContain("line comment");
    expect(result).not.toContain("inline");
  });

  test("strips comments from Python", async () => {
    const code = `# Python comment
def foo():
    pass`;
    const { result, usedAST } = await stripCommentsAST(code, "py");
    expect(usedAST).toBe(true);
    expect(result).not.toContain("# Python comment");
    expect(result).toContain("def foo():");
  });

  test("preserves strings that look like comments", async () => {
    const code = `const url = "http://example.com";`;
    const { result } = await stripCommentsAST(code, "ts");
    expect(result).toContain("http://example.com");
  });

  test("returns original for unsupported language", async () => {
    const code = `// comment`;
    const { result, usedAST } = await stripCommentsAST(code, "go");
    expect(usedAST).toBe(false);
    expect(result).toBe(code);
  });
});

describe("findContainingBlock", () => {
  test("finds function containing line", async () => {
    const code = `function foo() {
  const x = 1;
  const y = 2;
}`;
    // Line 1 is "const x = 1;" which is a lexical_declaration
    // The function_declaration contains it but lexical_declaration is the smallest block
    const block = await findContainingBlock(code, "ts", 1);
    expect(block).not.toBeNull();
    expect(block!.type).toBe("lexical_declaration");

    // Test that the function is found on line 0
    const funcBlock = await findContainingBlock(code, "ts", 0);
    expect(funcBlock).not.toBeNull();
    expect(funcBlock!.type).toBe("function_declaration");
    expect(funcBlock!.startLine).toBe(0);
    expect(funcBlock!.endLine).toBe(3);
  });

  test("finds class containing line", async () => {
    const code = `class Foo {
  method() {
    return 1;
  }
}`;
    const block = await findContainingBlock(code, "ts", 2);
    expect(block).not.toBeNull();
    // Should find the method as the smallest containing block
    expect(block!.type).toBe("method_definition");
  });

  test("finds Python function", async () => {
    const code = `def foo():
    x = 1
    return x`;
    const block = await findContainingBlock(code, "py", 1);
    expect(block).not.toBeNull();
    expect(block!.type).toBe("function_definition");
  });

  test("returns null for unsupported language", async () => {
    const block = await findContainingBlock("code", "go", 0);
    expect(block).toBeNull();
  });
});

describe("findBlocksInRange", () => {
  test("finds blocks overlapping range", async () => {
    const code = `function foo() {
  if (true) {
    return 1;
  }
}

function bar() {
  return 2;
}`;
    const blocks = await findBlocksInRange(code, "ts", 0, 4);
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.some(b => b.type === "function_declaration")).toBe(true);
  });
});

describe("expandToBlockBoundaries", () => {
  test("expands to include full function", async () => {
    const code = `function foo() {
  const x = 1;
  const y = 2;
  return x + y;
}`;
    const expanded = await expandToBlockBoundaries(code, "ts", 1, 2, 10);
    expect(expanded.startLine).toBe(0);
    expect(expanded.endLine).toBe(4);
  });

  test("respects max expansion", async () => {
    const code = Array.from({ length: 100 }, (_, i) => `line${i}`).join("\n");
    const expanded = await expandToBlockBoundaries(code, "ts", 50, 50, 5);
    // Should not expand too far
    expect(expanded.endLine - expanded.startLine).toBeLessThanOrEqual(10);
  });
});

describe("getDeclarations", () => {
  test("gets TypeScript declarations", async () => {
    const code = `function foo() {}
class Bar {}
const x = 1;`;
    const decls = await getDeclarations(code, "ts");
    expect(decls.length).toBeGreaterThan(0);
    expect(decls.some(d => d.type === "function_declaration")).toBe(true);
  });

  test("gets Python declarations", async () => {
    const code = `def foo():
    pass

class Bar:
    pass`;
    const decls = await getDeclarations(code, "py");
    expect(decls.some(d => d.type === "function_definition")).toBe(true);
    expect(decls.some(d => d.type === "class_definition")).toBe(true);
  });
});
