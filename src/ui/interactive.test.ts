/**
 * Tests for interactive UI module with preview functionality
 */

import { describe, test, expect } from "bun:test";
import { buildFileTree } from "./interactive";
import type { FileChoice } from "../types";

describe("buildFileTree", () => {
  test("builds tree from flat file list", () => {
    const files: FileChoice[] = [
      { path: "/src/index.ts", relPath: "src/index.ts", tokens: 100, ext: "ts" },
      { path: "/src/utils.ts", relPath: "src/utils.ts", tokens: 50, ext: "ts" },
    ];

    const { tree, flatNodes } = buildFileTree(files);

    expect(tree.length).toBe(1); // Just 'src' folder at top level
    expect(tree[0].name).toBe("src");
    expect(tree[0].isFolder).toBe(true);
    expect(tree[0].children.length).toBe(2);
    expect(tree[0].tokens).toBe(150); // Sum of children
  });

  test("handles nested directories", () => {
    const files: FileChoice[] = [
      { path: "/src/ui/interactive.ts", relPath: "src/ui/interactive.ts", tokens: 200, ext: "ts" },
      { path: "/src/core.ts", relPath: "src/core.ts", tokens: 100, ext: "ts" },
    ];

    const { tree } = buildFileTree(files);

    expect(tree.length).toBe(1);
    expect(tree[0].name).toBe("src");
    expect(tree[0].children.length).toBe(2); // ui folder and core.ts file
  });

  test("calculates folder token totals correctly", () => {
    const files: FileChoice[] = [
      { path: "/a/b/c.ts", relPath: "a/b/c.ts", tokens: 100, ext: "ts" },
      { path: "/a/b/d.ts", relPath: "a/b/d.ts", tokens: 200, ext: "ts" },
      { path: "/a/e.ts", relPath: "a/e.ts", tokens: 50, ext: "ts" },
    ];

    const { tree } = buildFileTree(files);

    expect(tree[0].tokens).toBe(350); // a folder total
    expect(tree[0].children[0].tokens).toBe(300); // b folder total
  });

  test("preserves file indices for selection", () => {
    const files: FileChoice[] = [
      { path: "/foo.ts", relPath: "foo.ts", tokens: 100, ext: "ts" },
      { path: "/bar.ts", relPath: "bar.ts", tokens: 50, ext: "ts" },
    ];

    const { flatNodes } = buildFileTree(files);

    // Files should have their original indices
    const fooNode = flatNodes.find(n => n.name === "foo.ts");
    const barNode = flatNodes.find(n => n.name === "bar.ts");

    expect(fooNode?.fileIndices).toEqual([0]);
    expect(barNode?.fileIndices).toEqual([1]);
  });

  test("folders contain all descendant file indices", () => {
    const files: FileChoice[] = [
      { path: "/src/a.ts", relPath: "src/a.ts", tokens: 100, ext: "ts" },
      { path: "/src/b.ts", relPath: "src/b.ts", tokens: 50, ext: "ts" },
    ];

    const { tree } = buildFileTree(files);

    expect(tree[0].fileIndices.sort()).toEqual([0, 1]);
  });

  test("handles single file at root", () => {
    const files: FileChoice[] = [
      { path: "/index.ts", relPath: "index.ts", tokens: 100, ext: "ts" },
    ];

    const { tree, flatNodes } = buildFileTree(files);

    expect(tree.length).toBe(1);
    expect(tree[0].isFolder).toBe(false);
    expect(flatNodes.length).toBe(1);
  });

  test("sorts folders before files", () => {
    const files: FileChoice[] = [
      { path: "/file.ts", relPath: "file.ts", tokens: 100, ext: "ts" },
      { path: "/src/a.ts", relPath: "src/a.ts", tokens: 50, ext: "ts" },
    ];

    const { flatNodes } = buildFileTree(files);

    // First node should be the folder
    expect(flatNodes[0].isFolder).toBe(true);
    expect(flatNodes[0].name).toBe("src");
  });

  test("sorts by token count descending within same type", () => {
    const files: FileChoice[] = [
      { path: "/small.ts", relPath: "small.ts", tokens: 10, ext: "ts" },
      { path: "/large.ts", relPath: "large.ts", tokens: 1000, ext: "ts" },
      { path: "/medium.ts", relPath: "medium.ts", tokens: 100, ext: "ts" },
    ];

    const { flatNodes } = buildFileTree(files);

    expect(flatNodes[0].name).toBe("large.ts");
    expect(flatNodes[1].name).toBe("medium.ts");
    expect(flatNodes[2].name).toBe("small.ts");
  });
});

describe("preview content formatting", () => {
  // Note: The formatPreviewContent function is internal to the module
  // These tests verify the expected behavior through the public interface

  test("tree structure supports file paths for preview lookup", () => {
    const files: FileChoice[] = [
      { path: "/Users/test/project/src/index.ts", relPath: "src/index.ts", tokens: 100, ext: "ts" },
    ];

    const { flatNodes } = buildFileTree(files);
    const fileNode = flatNodes.find(n => !n.isFolder);

    expect(fileNode).toBeDefined();
    expect(fileNode!.path).toBe("src/index.ts");
    expect(fileNode!.fileIndices[0]).toBe(0);
    // The full path is available via files[fileNode.fileIndices[0]].path
    expect(files[fileNode!.fileIndices[0]].path).toBe("/Users/test/project/src/index.ts");
  });
});
