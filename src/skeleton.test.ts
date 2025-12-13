/**
 * Tests for AST-based skeleton extraction
 */

import { describe, test, expect } from "bun:test";
import { extractSkeleton, isSkeletonSupported } from "./skeleton";

describe("isSkeletonSupported", () => {
  test("supports TypeScript", () => {
    expect(isSkeletonSupported("ts")).toBe(true);
    expect(isSkeletonSupported(".ts")).toBe(true);
    expect(isSkeletonSupported("tsx")).toBe(true);
  });

  test("supports JavaScript", () => {
    expect(isSkeletonSupported("js")).toBe(true);
    expect(isSkeletonSupported(".jsx")).toBe(true);
    expect(isSkeletonSupported("mjs")).toBe(true);
  });

  test("supports Python", () => {
    expect(isSkeletonSupported("py")).toBe(true);
    expect(isSkeletonSupported(".py")).toBe(true);
  });

  test("does not support unsupported languages", () => {
    expect(isSkeletonSupported("go")).toBe(false);
    expect(isSkeletonSupported("rs")).toBe(false);
    expect(isSkeletonSupported("java")).toBe(false);
  });
});

describe("extractSkeleton - TypeScript", () => {
  test("replaces function body with placeholder", async () => {
    const code = `export function calculateTotal(items: Item[]): number {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total;
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain("export function calculateTotal(items: Item[]): number");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain("let total = 0");
    expect(result).not.toContain("for (const item");
  });

  test("preserves interface declarations", async () => {
    const code = `interface User {
  id: string;
  name: string;
  email: string;
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    // Interfaces don't have "bodies" to replace, they should remain intact
    expect(result).toContain("interface User");
    expect(result).toContain("id: string");
    expect(result).toContain("name: string");
  });

  test("preserves type aliases", async () => {
    const code = `type Status = "pending" | "active" | "completed";`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain('type Status = "pending" | "active" | "completed"');
  });

  test("handles class with methods", async () => {
    const code = `class Calculator {
  private value: number = 0;

  add(n: number): this {
    this.value += n;
    return this;
  }

  subtract(n: number): this {
    this.value -= n;
    return this;
  }

  getResult(): number {
    return this.value;
  }
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain("class Calculator");
    expect(result).toContain("add(n: number): this");
    expect(result).toContain("subtract(n: number): this");
    expect(result).toContain("getResult(): number");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain("this.value += n");
    expect(result).not.toContain("this.value -= n");
  });

  test("handles arrow functions", async () => {
    const code = `const multiply = (a: number, b: number): number => {
  const result = a * b;
  return result;
};`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain("const multiply = (a: number, b: number): number =>");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain("const result = a * b");
  });

  test("handles async functions", async () => {
    const code = `async function fetchData(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch');
  }
  return response;
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain("async function fetchData(url: string): Promise<Response>");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain("await fetch");
    expect(result).not.toContain("throw new Error");
  });

  test("handles export statements", async () => {
    const code = `export const API_URL = "https://api.example.com";

export function getData(): string {
  return API_URL + "/data";
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain('export const API_URL = "https://api.example.com"');
    expect(result).toContain("export function getData(): string");
    expect(result).toContain("{ /* ... */ }");
  });

  test("handles multiple functions", async () => {
    const code = `function first(): void {
  console.log("first");
}

function second(): void {
  console.log("second");
}

function third(): void {
  console.log("third");
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toContain("function first(): void");
    expect(result).toContain("function second(): void");
    expect(result).toContain("function third(): void");
    // Should have 3 placeholder bodies
    const placeholders = result.match(/\{ \/\* \.\.\. \*\/ \}/g);
    expect(placeholders?.length).toBe(3);
    expect(result).not.toContain('console.log');
  });
});

describe("extractSkeleton - JavaScript", () => {
  test("replaces function body with placeholder", async () => {
    const code = `function greet(name) {
  const greeting = "Hello, " + name;
  console.log(greeting);
  return greeting;
}`;
    const { result, usedAST } = await extractSkeleton(code, "js");
    expect(usedAST).toBe(true);
    expect(result).toContain("function greet(name)");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain('const greeting');
    expect(result).not.toContain('console.log');
  });

  test("handles class methods", async () => {
    const code = `class Animal {
  constructor(name) {
    this.name = name;
  }

  speak() {
    console.log(this.name + " makes a sound.");
  }
}`;
    const { result, usedAST } = await extractSkeleton(code, "js");
    expect(usedAST).toBe(true);
    expect(result).toContain("class Animal");
    expect(result).toContain("constructor(name)");
    expect(result).toContain("speak()");
    expect(result).toContain("{ /* ... */ }");
    expect(result).not.toContain("this.name = name");
  });
});

describe("extractSkeleton - Python", () => {
  test("replaces function body with ellipsis", async () => {
    const code = `def calculate_total(items):
    total = 0
    for item in items:
        total += item.price * item.quantity
    return total`;
    const { result, usedAST } = await extractSkeleton(code, "py");
    expect(usedAST).toBe(true);
    expect(result).toContain("def calculate_total(items):");
    expect(result).toContain("...");
    expect(result).not.toContain("total = 0");
    expect(result).not.toContain("for item in items");
  });

  test("handles class with methods", async () => {
    const code = `class Calculator:
    def __init__(self, value=0):
        self.value = value

    def add(self, n):
        self.value += n
        return self

    def subtract(self, n):
        self.value -= n
        return self`;
    const { result, usedAST } = await extractSkeleton(code, "py");
    expect(usedAST).toBe(true);
    expect(result).toContain("class Calculator:");
    expect(result).toContain("def __init__(self, value=0):");
    expect(result).toContain("def add(self, n):");
    expect(result).toContain("def subtract(self, n):");
    expect(result).toContain("...");
    expect(result).not.toContain("self.value = value");
    expect(result).not.toContain("self.value += n");
  });

  test("handles async functions", async () => {
    const code = `async def fetch_data(url):
    response = await aiohttp.get(url)
    data = await response.json()
    return data`;
    const { result, usedAST } = await extractSkeleton(code, "py");
    expect(usedAST).toBe(true);
    expect(result).toContain("async def fetch_data(url):");
    expect(result).toContain("...");
    expect(result).not.toContain("aiohttp.get");
    expect(result).not.toContain("response.json");
  });
});

describe("extractSkeleton - unsupported languages", () => {
  test("returns original content for unsupported extension", async () => {
    const code = `package main

func main() {
    fmt.Println("Hello, World!")
}`;
    const { result, usedAST } = await extractSkeleton(code, "go");
    expect(usedAST).toBe(false);
    expect(result).toBe(code);
  });
});

describe("extractSkeleton - edge cases", () => {
  test("handles empty file", async () => {
    const { result, usedAST } = await extractSkeleton("", "ts");
    expect(usedAST).toBe(true);
    expect(result).toBe("");
  });

  test("handles file with only comments", async () => {
    const code = `// This is a comment
/* Block comment */`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    expect(result).toBe(code);
  });

  test("handles file with only type definitions", async () => {
    const code = `type ID = string | number;
interface Config {
  debug: boolean;
  timeout: number;
}`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    // Type-only files should remain essentially unchanged
    expect(result).toContain("type ID = string | number");
    expect(result).toContain("interface Config");
    expect(result).toContain("debug: boolean");
  });

  test("preserves function with single-line expression body", async () => {
    const code = `const add = (a: number, b: number) => a + b;`;
    const { result, usedAST } = await extractSkeleton(code, "ts");
    expect(usedAST).toBe(true);
    // Arrow function without block body should be preserved as-is
    expect(result).toContain("const add = (a: number, b: number) => a + b");
  });
});
