/**
 * Tests for dependencies module: AST-based import parsing and resolution
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  parseImports,
  resolveImportPath,
  extractDependencies,
  discoverDependencies,
  expandWithDependencies,
} from "./dependencies";

describe("parseImports", () => {
  test("parses ES6 default imports", async () => {
    const code = `import React from 'react';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("react");
    expect(imports[0].isRelative).toBe(false);
  });

  test("parses ES6 named imports", async () => {
    const code = `import { useState, useEffect } from 'react';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("react");
  });

  test("parses ES6 relative imports", async () => {
    const code = `import { helper } from './utils';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./utils");
    expect(imports[0].isRelative).toBe(true);
  });

  test("parses ES6 parent directory imports", async () => {
    const code = `import { config } from '../config';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("../config");
    expect(imports[0].isRelative).toBe(true);
  });

  test("parses namespace imports", async () => {
    const code = `import * as utils from './utils';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./utils");
  });

  test("parses side-effect imports", async () => {
    const code = `import './polyfills';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./polyfills");
  });

  test("parses CommonJS require", async () => {
    const code = `const fs = require('fs');`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("fs");
  });

  test("parses CommonJS require with relative path", async () => {
    const code = `const utils = require('./utils');`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./utils");
    expect(imports[0].isRelative).toBe(true);
  });

  test("parses dynamic import", async () => {
    const code = `const module = await import('./dynamic');`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./dynamic");
  });

  test("parses export from", async () => {
    const code = `export { foo, bar } from './module';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./module");
  });

  test("parses export * from", async () => {
    const code = `export * from './types';`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./types");
  });

  test("parses multiple imports", async () => {
    const code = `
import React from 'react';
import { helper } from './utils';
import type { Config } from '../types';
const fs = require('fs');
    `;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(4);
    expect(imports.map(i => i.source)).toEqual([
      "react",
      "./utils",
      "../types",
      "fs",
    ]);
  });

  test("tracks line numbers", async () => {
    const code = `import a from 'a';
import b from './b';
import c from '../c';`;
    const imports = await parseImports(code);
    expect(imports[0].line).toBe(1);
    expect(imports[1].line).toBe(2);
    expect(imports[2].line).toBe(3);
  });

  test("ignores imports in comments", async () => {
    const code = `
// import { foo } from './foo';
/* import { bar } from './bar'; */
import { real } from './real';
    `;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./real");
  });

  test("handles double quotes", async () => {
    const code = `import { foo } from "./foo";`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./foo");
  });

  test("handles imports with .js extension", async () => {
    const code = `import { foo } from "./foo.js";`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./foo.js");
    expect(imports[0].isRelative).toBe(true);
  });

  test("handles type imports", async () => {
    const code = `import type { Config } from "./config.js";`;
    const imports = await parseImports(code);
    expect(imports).toHaveLength(1);
    expect(imports[0].source).toBe("./config.js");
  });
});

describe("resolveImportPath", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-resolve-test-"));

    // Create test file structure
    await fs.writeFile(path.join(tmpDir, "main.ts"), "import { a } from './utils';");
    await fs.writeFile(path.join(tmpDir, "utils.ts"), "export const a = 1;");
    await fs.writeFile(path.join(tmpDir, "helper.js"), "module.exports = {};");
    await fs.writeFile(path.join(tmpDir, "config.json"), "{}");

    // Create subdirectory with index
    await fs.mkdir(path.join(tmpDir, "lib"));
    await fs.writeFile(path.join(tmpDir, "lib", "index.ts"), "export * from './internal';");
    await fs.writeFile(path.join(tmpDir, "lib", "internal.ts"), "export const x = 1;");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("resolves relative import with extension", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./utils", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "utils.ts"));
  });

  test("resolves .js files", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./helper", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "helper.js"));
  });

  test("resolves .json files", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./config", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "config.json"));
  });

  test("resolves directory with index.ts", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./lib", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "lib", "index.ts"));
  });

  test("returns null for non-relative imports", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("react", mainPath);
    expect(resolved).toBeNull();
  });

  test("returns null for non-existent files", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./nonexistent", mainPath);
    expect(resolved).toBeNull();
  });

  test("resolves parent directory imports", async () => {
    const libFile = path.join(tmpDir, "lib", "internal.ts");
    const resolved = await resolveImportPath("../utils", libFile);
    expect(resolved).toBe(path.join(tmpDir, "utils.ts"));
  });

  test("resolves TypeScript ESM convention (.js -> .ts)", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    // Import uses .js extension but file is .ts
    const resolved = await resolveImportPath("./utils.js", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "utils.ts"));
  });

  test("resolves TypeScript ESM convention for .mjs -> .mts", async () => {
    // Create a .mts file for this test
    await fs.writeFile(path.join(tmpDir, "module.mts"), "export const m = 1;");
    const mainPath = path.join(tmpDir, "main.ts");
    const resolved = await resolveImportPath("./module.mjs", mainPath);
    expect(resolved).toBe(path.join(tmpDir, "module.mts"));
  });
});

describe("extractDependencies", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-extract-test-"));

    await fs.writeFile(path.join(tmpDir, "main.ts"), `
import { helper } from './utils';
import React from 'react';
import { config } from './config';
    `);
    await fs.writeFile(path.join(tmpDir, "utils.ts"), "export const helper = () => {};");
    await fs.writeFile(path.join(tmpDir, "config.ts"), "export const config = {};");
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("extracts only local dependencies", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const deps = await extractDependencies(mainPath);

    expect(deps).toHaveLength(2);
    expect(deps.map(d => path.basename(d.resolvedPath)).sort()).toEqual(["config.ts", "utils.ts"]);
  });

  test("includes fromFile reference", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const deps = await extractDependencies(mainPath);

    for (const dep of deps) {
      expect(dep.fromFile).toBe(mainPath);
    }
  });
});

describe("discoverDependencies", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-discover-test-"));

    // Create a dependency chain: main -> utils -> helper -> common
    await fs.writeFile(path.join(tmpDir, "main.ts"), `import { util } from './utils';`);
    await fs.writeFile(path.join(tmpDir, "utils.ts"), `import { helper } from './helper';`);
    await fs.writeFile(path.join(tmpDir, "helper.ts"), `import { common } from './common';`);
    await fs.writeFile(path.join(tmpDir, "common.ts"), `export const common = 1;`);

    // Create a circular dependency
    await fs.writeFile(path.join(tmpDir, "a.ts"), `import { b } from './b';`);
    await fs.writeFile(path.join(tmpDir, "b.ts"), `import { a } from './a';`);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("discovers transitive dependencies", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const deps = await discoverDependencies([mainPath]);

    expect(deps).toHaveLength(3);
    const basenames = deps.map(d => path.basename(d)).sort();
    expect(basenames).toEqual(["common.ts", "helper.ts", "utils.ts"]);
  });

  test("respects maxDepth option", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const deps = await discoverDependencies([mainPath], { maxDepth: 1 });

    expect(deps).toHaveLength(1);
    expect(path.basename(deps[0])).toBe("utils.ts");
  });

  test("handles circular dependencies", async () => {
    const aPath = path.join(tmpDir, "a.ts");
    const deps = await discoverDependencies([aPath]);

    // Should find b.ts but not loop infinitely
    expect(deps).toHaveLength(1);
    expect(path.basename(deps[0])).toBe("b.ts");
  });

  test("excludes already existing files from output", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const utilsPath = path.join(tmpDir, "utils.ts");
    const deps = await discoverDependencies([mainPath], {
      existingFiles: new Set([utilsPath]),
    });

    // utils.ts is already in existingFiles and also in startFiles via main.ts import
    // Since utils.ts is marked as existing, we won't re-add it to the output
    // But we will still traverse through it to find its dependencies
    // Actually, looking at the implementation, existingFiles are added to discovered
    // which means utils.ts won't be traversed since it's already "discovered"
    // This is the expected behavior: if a file is already included, skip it entirely
    const basenames = deps.map(d => path.basename(d)).sort();
    expect(basenames).not.toContain("utils.ts");
  });

  test("starts traversal from all startFiles", async () => {
    const mainPath = path.join(tmpDir, "main.ts");
    const utilsPath = path.join(tmpDir, "utils.ts");
    // Include both main.ts and utils.ts as start files
    const deps = await discoverDependencies([mainPath, utilsPath]);

    // Should find helper.ts and common.ts through utils.ts
    const basenames = deps.map(d => path.basename(d)).sort();
    expect(basenames).toContain("helper.ts");
    expect(basenames).toContain("common.ts");
  });
});

describe("expandWithDependencies", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-expand-test-"));

    await fs.writeFile(path.join(tmpDir, "entry.ts"), `import { foo } from './foo';`);
    await fs.writeFile(path.join(tmpDir, "foo.ts"), `import { bar } from './bar';`);
    await fs.writeFile(path.join(tmpDir, "bar.ts"), `export const bar = 1;`);
    await fs.writeFile(path.join(tmpDir, "standalone.ts"), `export const standalone = 1;`);
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("expands files to include dependencies", async () => {
    const entryPath = path.join(tmpDir, "entry.ts");
    const expanded = await expandWithDependencies([entryPath]);

    expect(expanded).toHaveLength(3);
    expect(expanded[0]).toBe(entryPath); // Original file is first
    const basenames = expanded.map(p => path.basename(p)).sort();
    expect(basenames).toEqual(["bar.ts", "entry.ts", "foo.ts"]);
  });

  test("preserves original files in output", async () => {
    const entryPath = path.join(tmpDir, "entry.ts");
    const standalonePath = path.join(tmpDir, "standalone.ts");
    const expanded = await expandWithDependencies([entryPath, standalonePath]);

    expect(expanded).toContain(entryPath);
    expect(expanded).toContain(standalonePath);
    expect(expanded.length).toBe(4); // 2 original + 2 deps (foo, bar)
  });

  test("returns original files when no dependencies found", async () => {
    const standalonePath = path.join(tmpDir, "standalone.ts");
    const expanded = await expandWithDependencies([standalonePath]);

    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toBe(standalonePath);
  });
});
