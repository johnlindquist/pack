import { describe, test, expect } from "bun:test";
import {
  parseConfigContent,
  parseTransformRule,
  applyTransforms,
} from "./core";
import type { TransformRule } from "./types";

describe("parseTransformRule", () => {
  test("parses simple pattern = replacement", () => {
    const rule = parseTransformRule("secret = [REDACTED]");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("secret");
    expect(rule!.pattern.global).toBe(true);
    expect(rule!.replacement).toBe("[REDACTED]");
  });

  test("parses pattern with regex characters", () => {
    const rule = parseTransformRule("sk-[a-zA-Z0-9]{48} = [API_KEY]");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("sk-[a-zA-Z0-9]{48}");
    expect(rule!.replacement).toBe("[API_KEY]");
  });

  test("parses explicit regex format with flags", () => {
    const rule = parseTransformRule("/password/i = [HIDDEN]");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("password");
    expect(rule!.pattern.flags).toContain("i");
    expect(rule!.replacement).toBe("[HIDDEN]");
  });

  test("parses regex without flags (uses global)", () => {
    const rule = parseTransformRule("/secret/ = [REDACTED]");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("secret");
    expect(rule!.pattern.global).toBe(true);
  });

  test("returns null for line without equals", () => {
    const rule = parseTransformRule("no equals sign here");
    expect(rule).toBeNull();
  });

  test("returns null for empty pattern", () => {
    const rule = parseTransformRule(" = replacement");
    expect(rule).toBeNull();
  });

  test("handles empty replacement", () => {
    const rule = parseTransformRule("pattern = ");
    expect(rule).not.toBeNull();
    expect(rule!.replacement).toBe("");
  });

  test("returns null for invalid regex pattern", () => {
    const rule = parseTransformRule("[invalid = replacement");
    expect(rule).toBeNull();
  });

  test("handles equals signs in replacement", () => {
    const rule = parseTransformRule("key = value = test");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("key");
    expect(rule!.replacement).toBe("value = test");
  });

  test("trims whitespace around pattern and replacement", () => {
    const rule = parseTransformRule("  pattern   =   replacement  ");
    expect(rule).not.toBeNull();
    expect(rule!.pattern.source).toBe("pattern");
    expect(rule!.replacement).toBe("replacement");
  });
});

describe("parseConfigContent with transforms", () => {
  test("parses [transforms] section", () => {
    const content = `[transforms]
secret = [REDACTED]
password = [HIDDEN]`;
    const config = parseConfigContent(content);
    expect(config.transforms).toHaveLength(2);
    expect(config.transforms[0].pattern.source).toBe("secret");
    expect(config.transforms[0].replacement).toBe("[REDACTED]");
    expect(config.transforms[1].pattern.source).toBe("password");
    expect(config.transforms[1].replacement).toBe("[HIDDEN]");
  });

  test("parses [transform] section (alias)", () => {
    const content = `[transform]
secret = [REDACTED]`;
    const config = parseConfigContent(content);
    expect(config.transforms).toHaveLength(1);
  });

  test("parses [redact] section (alias)", () => {
    const content = `[redact]
secret = [REDACTED]`;
    const config = parseConfigContent(content);
    expect(config.transforms).toHaveLength(1);
  });

  test("ignores comments in transforms section", () => {
    const content = `[transforms]
# This is a comment
secret = [REDACTED]
# Another comment
password = [HIDDEN]`;
    const config = parseConfigContent(content);
    expect(config.transforms).toHaveLength(2);
  });

  test("skips invalid transform rules", () => {
    const content = `[transforms]
valid = replacement
no equals sign
another valid = value`;
    const config = parseConfigContent(content);
    expect(config.transforms).toHaveLength(2);
  });

  test("combines transforms with other sections", () => {
    const content = `[search]
TODO

[transforms]
secret = [REDACTED]

[extensions]
ts`;
    const config = parseConfigContent(content);
    expect(config.search).toEqual(["TODO"]);
    expect(config.extensions).toEqual(["ts"]);
    expect(config.transforms).toHaveLength(1);
  });

  test("initializes empty transforms array by default", () => {
    const content = `[search]
TODO`;
    const config = parseConfigContent(content);
    expect(config.transforms).toEqual([]);
  });
});

describe("applyTransforms", () => {
  test("applies single transform", () => {
    const transforms: TransformRule[] = [
      { pattern: /secret/g, replacement: "[REDACTED]" }
    ];
    const result = applyTransforms("my secret data", transforms);
    expect(result).toBe("my [REDACTED] data");
  });

  test("applies multiple transforms in order", () => {
    const transforms: TransformRule[] = [
      { pattern: /foo/g, replacement: "bar" },
      { pattern: /bar/g, replacement: "baz" }
    ];
    const result = applyTransforms("foo", transforms);
    expect(result).toBe("baz");
  });

  test("applies transform globally", () => {
    const transforms: TransformRule[] = [
      { pattern: /secret/g, replacement: "[REDACTED]" }
    ];
    const result = applyTransforms("secret and more secret", transforms);
    expect(result).toBe("[REDACTED] and more [REDACTED]");
  });

  test("handles regex patterns", () => {
    const transforms: TransformRule[] = [
      { pattern: /sk-[a-zA-Z0-9]{4}/g, replacement: "[API_KEY]" }
    ];
    const result = applyTransforms("key: sk-abcd1234", transforms);
    expect(result).toBe("key: [API_KEY]1234");
  });

  test("handles case-insensitive patterns", () => {
    const transforms: TransformRule[] = [
      { pattern: /password/gi, replacement: "[HIDDEN]" }
    ];
    const result = applyTransforms("PASSWORD and password", transforms);
    expect(result).toBe("[HIDDEN] and [HIDDEN]");
  });

  test("returns original content when transforms is empty", () => {
    const result = applyTransforms("original content", []);
    expect(result).toBe("original content");
  });

  test("returns original content when transforms is undefined", () => {
    const result = applyTransforms("original content", undefined as any);
    expect(result).toBe("original content");
  });

  test("handles multiline content", () => {
    const transforms: TransformRule[] = [
      { pattern: /secret/g, replacement: "[REDACTED]" }
    ];
    const content = `line 1
secret on line 2
line 3 with secret`;
    const result = applyTransforms(content, transforms);
    expect(result).toBe(`line 1
[REDACTED] on line 2
line 3 with [REDACTED]`);
  });

  test("supports capture groups in replacement", () => {
    const transforms: TransformRule[] = [
      { pattern: /(\w+)@(\w+\.com)/g, replacement: "[EMAIL:$1@...]" }
    ];
    const result = applyTransforms("contact: john@example.com", transforms);
    expect(result).toBe("contact: [EMAIL:john@...]");
  });

  test("handles empty replacement (deletion)", () => {
    const transforms: TransformRule[] = [
      { pattern: /secret/g, replacement: "" }
    ];
    const result = applyTransforms("my secret data", transforms);
    expect(result).toBe("my  data");
  });

  test("real-world: redacts API keys", () => {
    const transforms: TransformRule[] = [
      { pattern: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[OPENAI_API_KEY]" }
    ];
    const content = `const apiKey = "sk-abc123def456ghi789jkl012mno345pqr";`;
    const result = applyTransforms(content, transforms);
    expect(result).toBe(`const apiKey = "[OPENAI_API_KEY]";`);
  });

  test("real-world: redacts GitHub tokens", () => {
    const transforms: TransformRule[] = [
      { pattern: /ghp_[a-zA-Z0-9]{36}/g, replacement: "[GITHUB_TOKEN]" }
    ];
    const content = `GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz1234567890`;
    const result = applyTransforms(content, transforms);
    expect(result).toBe(`GITHUB_TOKEN=[GITHUB_TOKEN]`);
  });

  test("real-world: redacts password fields", () => {
    const transforms: TransformRule[] = [
      { pattern: /password\s*=\s*"[^"]+"/gi, replacement: 'password="[REDACTED]"' }
    ];
    const content = `const config = { password = "supersecret123" };`;
    const result = applyTransforms(content, transforms);
    expect(result).toBe(`const config = { password="[REDACTED]" };`);
  });
});
