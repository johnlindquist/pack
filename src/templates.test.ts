import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  loadTemplate,
  listTemplates,
  applyTemplate,
  saveTemplate,
  interpolate,
  detectLanguage,
  formatTemplateList,
} from "./templates";

describe("interpolate", () => {
  test("replaces simple variables", () => {
    const result = interpolate("Hello {{name}}!", { name: "World" });
    expect(result).toBe("Hello World!");
  });

  test("handles missing variables", () => {
    const result = interpolate("Hello {{name}}!", {});
    expect(result).toBe("Hello !");
  });

  test("replaces multiple variables", () => {
    const result = interpolate("{{greeting}} {{name}}!", { greeting: "Hi", name: "Alice" });
    expect(result).toBe("Hi Alice!");
  });

  test("handles conditional blocks - true condition", () => {
    const result = interpolate("Start {{#if show}}visible{{/if}} End", { show: "yes" });
    expect(result).toBe("Start visible End");
  });

  test("handles conditional blocks - false condition", () => {
    const result = interpolate("Start {{#if show}}visible{{/if}} End", {});
    expect(result).toBe("Start  End");
  });

  test("handles nested variables in conditionals", () => {
    const result = interpolate("{{#if lang}}Language: {{lang}}{{/if}}", { lang: "TypeScript" });
    expect(result).toBe("Language: TypeScript");
  });
});

describe("loadTemplate", () => {
  test("loads built-in review template", async () => {
    const template = await loadTemplate("review");
    expect(template).not.toBeNull();
    expect(template!.name).toBe("review");
    expect(template!.source).toBe("builtin");
    expect(template!.content).toContain("Code Quality");
  });

  test("loads built-in tests template", async () => {
    const template = await loadTemplate("tests");
    expect(template).not.toBeNull();
    expect(template!.name).toBe("tests");
    expect(template!.variables).toHaveProperty("framework");
  });

  test("returns null for unknown template", async () => {
    const template = await loadTemplate("nonexistent-template-xyz");
    expect(template).toBeNull();
  });
});

describe("listTemplates", () => {
  test("lists all built-in templates", async () => {
    const templates = await listTemplates();
    expect(templates.length).toBeGreaterThan(0);

    const names = templates.map(t => t.name);
    expect(names).toContain("review");
    expect(names).toContain("tests");
    expect(names).toContain("refactor");
    expect(names).toContain("explain");
    expect(names).toContain("bugs");
  });

  test("templates are sorted by name", async () => {
    const templates = await listTemplates();
    const names = templates.map(t => t.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });
});

describe("applyTemplate", () => {
  test("applies built-in template with defaults", async () => {
    const result = await applyTemplate("tests");
    expect(result).toContain("jest"); // default framework
    expect(result).toContain("unit tests");
  });

  test("applies template with custom variables", async () => {
    const result = await applyTemplate("tests", { framework: "vitest" });
    expect(result).toContain("vitest");
    expect(result).not.toContain("jest");
  });

  test("includes language when provided", async () => {
    const result = await applyTemplate("review", { language: "TypeScript" });
    expect(result).toContain("TypeScript");
  });

  test("throws for unknown template", async () => {
    await expect(applyTemplate("nonexistent")).rejects.toThrow("not found");
  });
});

describe("detectLanguage", () => {
  test("detects TypeScript from .ts files", () => {
    const result = detectLanguage(["file1.ts", "file2.ts", "file3.ts"]);
    expect(result).toBe("TypeScript");
  });

  test("detects most common language", () => {
    const result = detectLanguage(["a.ts", "b.ts", "c.js"]);
    expect(result).toBe("TypeScript");
  });

  test("returns undefined for no files", () => {
    const result = detectLanguage([]);
    expect(result).toBeUndefined();
  });

  test("handles unknown extensions", () => {
    const result = detectLanguage(["file.xyz"]);
    expect(result).toBe("XYZ");
  });
});

describe("formatTemplateList", () => {
  test("formats template list correctly", async () => {
    const templates = await listTemplates();
    const output = formatTemplateList(templates);

    expect(output).toContain("Available Templates:");
    expect(output).toContain("Built-in:");
    expect(output).toContain("review");
  });
});

describe("saveTemplate", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), "packx-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test("saves template to local directory", async () => {
    const savedPath = await saveTemplate("my-template", "Test content", {
      description: "A test template",
      cwd: tempDir,
    });

    expect(savedPath).toContain(".packx/templates/my-template.md");

    const content = await fs.readFile(savedPath, "utf8");
    expect(content).toContain("name: my-template");
    expect(content).toContain("description: A test template");
    expect(content).toContain("Test content");
  });

  test("saved template can be loaded", async () => {
    await saveTemplate("custom", "Custom prompt here", { cwd: tempDir });

    const template = await loadTemplate("custom", tempDir);
    expect(template).not.toBeNull();
    expect(template!.name).toBe("custom");
    expect(template!.content).toBe("Custom prompt here");
    expect(template!.source).toBe("local");
  });

  test("local templates override built-in", async () => {
    await saveTemplate("review", "My custom review", { cwd: tempDir });

    const template = await loadTemplate("review", tempDir);
    expect(template!.source).toBe("local");
    expect(template!.content).toBe("My custom review");
  });
});
