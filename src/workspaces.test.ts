/**
 * Tests for workspace detection and resolution (monorepo support)
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  detectMonorepo,
  resolveWorkspace,
  listWorkspaces,
  formatWorkspaceList,
  getWorkspaceDependencies,
  getWorkspaceDependencyTree,
  findWorkspaceForPath,
  groupFilesByWorkspace,
  isPathInWorkspace,
  type MonorepoConfig,
  type Workspace,
} from "./workspaces";

describe("pnpm workspace detection", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-pnpm-test-"));

    // Create pnpm-workspace.yaml
    await fs.writeFile(path.join(tmpDir, "pnpm-workspace.yaml"), `
packages:
  - 'packages/*'
  - 'apps/*'
`);

    // Create package dirs with package.json
    await fs.mkdir(path.join(tmpDir, "packages", "ui"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "packages", "ui", "package.json"), JSON.stringify({
      name: "@myorg/ui",
      dependencies: { "@myorg/utils": "^1.0.0" }
    }));

    await fs.mkdir(path.join(tmpDir, "packages", "utils"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "packages", "utils", "package.json"), JSON.stringify({
      name: "@myorg/utils"
    }));

    await fs.mkdir(path.join(tmpDir, "apps", "web"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "apps", "web", "package.json"), JSON.stringify({
      name: "@myorg/web",
      dependencies: { "@myorg/ui": "^1.0.0" }
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("detects pnpm workspaces", async () => {
    const config = await detectMonorepo(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.type).toBe("pnpm");
    expect(config!.workspaces.length).toBe(3);
  });

  test("resolves workspace by exact name", async () => {
    const config = await detectMonorepo(tmpDir);
    const ws = await resolveWorkspace("@myorg/ui", config!);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("@myorg/ui");
  });

  test("resolves workspace by directory name", async () => {
    const config = await detectMonorepo(tmpDir);
    const ws = await resolveWorkspace("ui", config!);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("@myorg/ui");
  });

  test("resolves workspace by relative path", async () => {
    const config = await detectMonorepo(tmpDir);
    const ws = await resolveWorkspace("packages/ui", config!);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("@myorg/ui");
  });

  test("returns null for non-existent workspace", async () => {
    const config = await detectMonorepo(tmpDir);
    const ws = await resolveWorkspace("@myorg/nonexistent", config!);
    expect(ws).toBeNull();
  });

  test("lists all workspaces sorted by name", async () => {
    const config = await detectMonorepo(tmpDir);
    const workspaces = listWorkspaces(config!);
    expect(workspaces.length).toBe(3);
    expect(workspaces[0].name).toBe("@myorg/ui");
    expect(workspaces[1].name).toBe("@myorg/utils");
    expect(workspaces[2].name).toBe("@myorg/web");
  });

  test("formats workspace list for display", async () => {
    const config = await detectMonorepo(tmpDir);
    const formatted = formatWorkspaceList(config!.workspaces);
    expect(formatted).toContain("@myorg/ui");
    expect(formatted).toContain("packages/ui");
  });
});

describe("npm/yarn workspace detection", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-npm-test-"));

    // Create package.json with workspaces
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      name: "my-monorepo",
      workspaces: ["packages/*"]
    }));

    await fs.mkdir(path.join(tmpDir, "packages", "lib"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "packages", "lib", "package.json"), JSON.stringify({
      name: "@myorg/lib"
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("detects npm workspaces from package.json", async () => {
    const config = await detectMonorepo(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.type).toBe("npm");
    expect(config!.workspaces.length).toBe(1);
    expect(config!.workspaces[0].name).toBe("@myorg/lib");
  });
});

describe("workspace dependencies", () => {
  let config: MonorepoConfig;

  beforeAll(() => {
    // Create mock config for testing
    config = {
      type: "pnpm",
      root: "/test",
      workspaces: [
        {
          name: "@myorg/app",
          path: "/test/apps/app",
          relativePath: "apps/app",
          dependencies: ["@myorg/ui", "@myorg/utils"],
          devDependencies: [],
        },
        {
          name: "@myorg/ui",
          path: "/test/packages/ui",
          relativePath: "packages/ui",
          dependencies: ["@myorg/utils"],
          devDependencies: [],
        },
        {
          name: "@myorg/utils",
          path: "/test/packages/utils",
          relativePath: "packages/utils",
          dependencies: [],
          devDependencies: [],
        },
      ],
    };
  });

  test("gets direct workspace dependencies", () => {
    const ws = config.workspaces.find(w => w.name === "@myorg/app")!;
    const deps = getWorkspaceDependencies(ws, config);
    expect(deps.length).toBe(2);
    expect(deps.map(d => d.name).sort()).toEqual(["@myorg/ui", "@myorg/utils"]);
  });

  test("gets transitive workspace dependencies", () => {
    const ws = config.workspaces.find(w => w.name === "@myorg/app")!;
    const deps = getWorkspaceDependencyTree(ws, config);
    expect(deps.length).toBe(2);
    expect(deps.map(d => d.name).sort()).toEqual(["@myorg/ui", "@myorg/utils"]);
  });

  test("handles workspace with no dependencies", () => {
    const ws = config.workspaces.find(w => w.name === "@myorg/utils")!;
    const deps = getWorkspaceDependencies(ws, config);
    expect(deps.length).toBe(0);
  });
});

describe("file workspace resolution", () => {
  let config: MonorepoConfig;

  beforeAll(() => {
    config = {
      type: "pnpm",
      root: "/test",
      workspaces: [
        {
          name: "@myorg/ui",
          path: "/test/packages/ui",
          relativePath: "packages/ui",
          dependencies: [],
          devDependencies: [],
        },
        {
          name: "@myorg/utils",
          path: "/test/packages/utils",
          relativePath: "packages/utils",
          dependencies: [],
          devDependencies: [],
        },
      ],
    };
  });

  test("finds workspace for file path", () => {
    const ws = findWorkspaceForPath("/test/packages/ui/src/button.tsx", config);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("@myorg/ui");
  });

  test("returns null for file outside workspaces", () => {
    const ws = findWorkspaceForPath("/test/other/file.ts", config);
    expect(ws).toBeNull();
  });

  test("checks if path is in workspace", () => {
    const ws = config.workspaces[0];
    expect(isPathInWorkspace("/test/packages/ui/src/button.tsx", ws)).toBe(true);
    expect(isPathInWorkspace("/test/packages/utils/index.ts", ws)).toBe(false);
  });

  test("groups files by workspace", () => {
    const files = [
      "/test/packages/ui/button.tsx",
      "/test/packages/ui/input.tsx",
      "/test/packages/utils/helpers.ts",
      "/test/root-file.ts",
    ];
    const groups = groupFilesByWorkspace(files, config);

    // Get workspace objects (or null for root files)
    const uiWs = config.workspaces.find(w => w.name === "@myorg/ui")!;
    const utilsWs = config.workspaces.find(w => w.name === "@myorg/utils")!;

    expect(groups.get(uiWs)?.length).toBe(2);
    expect(groups.get(utilsWs)?.length).toBe(1);
    expect(groups.get(null)?.length).toBe(1);
  });
});

describe("no monorepo detection", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-no-mono-test-"));

    // Create a simple non-monorepo project
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      name: "simple-project"
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("returns null for non-monorepo", async () => {
    const config = await detectMonorepo(tmpDir);
    expect(config).toBeNull();
  });
});

describe("lerna workspace detection", () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "packx-lerna-test-"));

    // Create lerna.json
    await fs.writeFile(path.join(tmpDir, "lerna.json"), JSON.stringify({
      packages: ["packages/*"],
      version: "1.0.0"
    }));

    await fs.mkdir(path.join(tmpDir, "packages", "core"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "packages", "core", "package.json"), JSON.stringify({
      name: "@myorg/core"
    }));
  });

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  test("detects lerna workspaces", async () => {
    const config = await detectMonorepo(tmpDir);
    expect(config).not.toBeNull();
    expect(config!.type).toBe("lerna");
    expect(config!.workspaces.length).toBe(1);
    expect(config!.workspaces[0].name).toBe("@myorg/core");
  });
});

describe("workspace shorthand resolution", () => {
  let config: MonorepoConfig;

  beforeAll(() => {
    config = {
      type: "pnpm",
      root: "/test",
      workspaces: [
        {
          name: "@myorg/ui-components",
          path: "/test/packages/ui/components",
          relativePath: "packages/ui/components",
          dependencies: [],
          devDependencies: [],
        },
        {
          name: "@myorg/button",
          path: "/test/packages/ui/button",
          relativePath: "packages/ui/button",
          dependencies: [],
          devDependencies: [],
        },
      ],
    };
  });

  test("resolves shorthand @ui/button to packages/ui/button", async () => {
    const ws = await resolveWorkspace("@ui/button", config);
    expect(ws).not.toBeNull();
    expect(ws!.name).toBe("@myorg/button");
  });

  test("resolves shorthand button to workspace containing button", async () => {
    const ws = await resolveWorkspace("button", config);
    expect(ws).not.toBeNull();
    expect(ws!.relativePath).toContain("button");
  });
});
