/**
 * Dependency tree visualization for packx
 * Shows import relationships with box-drawing characters
 */

import * as path from "node:path";
import { extractDependencies, type ResolvedDependency } from "../dependencies.js";

// ANSI color codes
const colors = {
  green: '\x1b[32m',    // Direct imports
  blue: '\x1b[34m',     // Reverse dependencies (imported by)
  red: '\x1b[31m',      // Circular dependencies
  yellow: '\x1b[33m',   // Warnings
  cyan: '\x1b[36m',     // Current file
  gray: '\x1b[90m',     // UI elements
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
  file: string;           // Absolute file path
  relPath: string;        // Relative path for display
  imports: DependencyNode[];
  importedBy: DependencyNode[];
  isCircular?: boolean;
  depth: number;
}

/**
 * Result from building a dependency graph
 */
export interface DependencyGraph {
  root: DependencyNode;
  allImports: Set<string>;        // All files imported by root (recursively)
  allImportedBy: Set<string>;     // All files that import root (recursively)
  circularPaths: string[][];      // Detected circular dependency chains
}

/**
 * Options for building dependency graph
 */
export interface BuildGraphOptions {
  maxDepth?: number;              // Maximum depth to traverse (default: 2)
  projectRoot?: string;           // Project root for relative paths
  allFiles?: string[];            // All available files to check for reverse deps
}

/**
 * Build a complete dependency graph for a single file
 */
export async function buildDependencyGraph(
  entryFile: string,
  options: BuildGraphOptions = {}
): Promise<DependencyGraph> {
  const maxDepth = options.maxDepth ?? 2;
  const projectRoot = options.projectRoot ?? process.cwd();
  const allFiles = options.allFiles ?? [];

  const visited = new Set<string>();
  const allImports = new Set<string>();
  const allImportedBy = new Set<string>();
  const circularPaths: string[][] = [];

  // Cache for file dependencies to avoid re-parsing
  const depsCache = new Map<string, ResolvedDependency[]>();

  /**
   * Get dependencies for a file (with caching)
   */
  async function getDeps(filePath: string): Promise<ResolvedDependency[]> {
    if (depsCache.has(filePath)) {
      return depsCache.get(filePath)!;
    }
    const deps = await extractDependencies(filePath, projectRoot);
    depsCache.set(filePath, deps);
    return deps;
  }

  /**
   * Build the "imports" subtree (what this file imports)
   */
  async function buildImportsTree(
    filePath: string,
    depth: number,
    ancestors: Set<string>
  ): Promise<DependencyNode> {
    const relPath = path.relative(projectRoot, filePath);
    const node: DependencyNode = {
      file: filePath,
      relPath,
      imports: [],
      importedBy: [],
      depth,
    };

    if (depth >= maxDepth) {
      return node;
    }

    // Check for circular dependency
    if (ancestors.has(filePath)) {
      node.isCircular = true;
      circularPaths.push([...ancestors, filePath]);
      return node;
    }

    const newAncestors = new Set(ancestors);
    newAncestors.add(filePath);

    const deps = await getDeps(filePath);
    for (const dep of deps) {
      allImports.add(dep.resolvedPath);
      const childNode = await buildImportsTree(dep.resolvedPath, depth + 1, newAncestors);
      node.imports.push(childNode);
    }

    return node;
  }

  /**
   * Find all files that import the entry file (reverse dependencies)
   */
  async function findImportedBy(
    targetFile: string,
    depth: number,
    ancestors: Set<string>
  ): Promise<DependencyNode[]> {
    if (depth >= maxDepth) {
      return [];
    }

    const results: DependencyNode[] = [];
    const relPath = path.relative(projectRoot, targetFile);

    for (const file of allFiles) {
      if (file === targetFile || ancestors.has(file)) {
        continue;
      }

      const deps = await getDeps(file);
      const importsTarget = deps.some(d => d.resolvedPath === targetFile);

      if (importsTarget) {
        const fileRelPath = path.relative(projectRoot, file);
        allImportedBy.add(file);

        const newAncestors = new Set(ancestors);
        newAncestors.add(file);

        // Check for circular dependency
        const isCircular = ancestors.has(file);
        if (isCircular) {
          circularPaths.push([...ancestors, file]);
        }

        const node: DependencyNode = {
          file,
          relPath: fileRelPath,
          imports: [],
          importedBy: await findImportedBy(file, depth + 1, newAncestors),
          isCircular,
          depth,
        };

        results.push(node);
      }
    }

    return results;
  }

  // Build the root node with imports
  const root = await buildImportsTree(entryFile, 0, new Set());

  // Find reverse dependencies
  root.importedBy = await findImportedBy(entryFile, 0, new Set([entryFile]));

  return {
    root,
    allImports,
    allImportedBy,
    circularPaths,
  };
}

/**
 * Options for rendering the dependency tree
 */
export interface RenderOptions {
  showImports?: boolean;          // Show what this file imports (default: true)
  showImportedBy?: boolean;       // Show files that import this (default: true)
  maxWidth?: number;              // Maximum width for truncation
  indentSize?: number;            // Spaces per indent level (default: 2)
}

/**
 * Render a dependency tree as an array of styled lines
 */
export function renderDependencyTree(
  graph: DependencyGraph,
  options: RenderOptions = {}
): string[] {
  const {
    showImports = true,
    showImportedBy = true,
    maxWidth = 80,
    indentSize = 2,
  } = options;

  const lines: string[] = [];
  const boxWidth = Math.min(maxWidth, 60);

  // Helper to truncate paths
  const truncatePath = (p: string, maxLen: number): string => {
    if (p.length <= maxLen) return p;
    return '...' + p.slice(-(maxLen - 3));
  };

  // Top border
  const title = ` ${truncatePath(graph.root.relPath, boxWidth - 6)} `;
  const topBorder = `${colors.cyan}${colors.bold}+-${'-'.repeat(title.length)}-+${colors.reset}`;
  lines.push(topBorder);
  lines.push(`${colors.cyan}${colors.bold}| ${title} |${colors.reset}`);
  lines.push(`${colors.cyan}${colors.bold}+-${'-'.repeat(title.length)}-+${colors.reset}`);
  lines.push('');

  // Render "Imported by" section (reverse dependencies)
  if (showImportedBy && graph.root.importedBy.length > 0) {
    lines.push(`${colors.blue}${colors.bold}  <- Imported by:${colors.reset}`);
    renderSubtree(graph.root.importedBy, lines, '    ', true, colors.blue);
    lines.push('');
  } else if (showImportedBy) {
    lines.push(`${colors.gray}  <- Imported by: (none found)${colors.reset}`);
    lines.push('');
  }

  // Render "Imports" section
  if (showImports && graph.root.imports.length > 0) {
    lines.push(`${colors.green}${colors.bold}  -> Imports:${colors.reset}`);
    renderSubtree(graph.root.imports, lines, '    ', false, colors.green);
    lines.push('');
  } else if (showImports) {
    lines.push(`${colors.gray}  -> Imports: (none found)${colors.reset}`);
    lines.push('');
  }

  // Show circular dependency warnings
  if (graph.circularPaths.length > 0) {
    lines.push(`${colors.red}${colors.bold}  ! Circular dependencies detected:${colors.reset}`);
    for (const cycle of graph.circularPaths) {
      const cycleStr = cycle.map(f => path.basename(f)).join(' -> ');
      lines.push(`${colors.red}    ${cycleStr}${colors.reset}`);
    }
    lines.push('');
  }

  // Summary line
  const importCount = graph.allImports.size;
  const importedByCount = graph.allImportedBy.size;
  lines.push(`${colors.gray}  Total: ${importCount} imports, ${importedByCount} reverse deps${colors.reset}`);

  // Help line
  lines.push('');
  lines.push(`${colors.gray}  [Space] Toggle  [Enter] Add all  [a] Add imports  [r] Add reverse  [Esc] Close${colors.reset}`);

  return lines;
}

/**
 * Render a subtree with box-drawing characters
 */
function renderSubtree(
  nodes: DependencyNode[],
  lines: string[],
  prefix: string,
  isReverse: boolean,
  color: string
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '\\-' : '|-';
    const childPrefix = isLast ? '  ' : '| ';

    // Color for this node
    const nodeColor = node.isCircular ? colors.red : color;
    const circularMark = node.isCircular ? ` ${colors.red}(circular!)${colors.reset}` : '';

    lines.push(`${nodeColor}${prefix}${connector} ${node.relPath}${circularMark}${colors.reset}`);

    // Render children (imports for forward deps, importedBy for reverse)
    const children = isReverse ? node.importedBy : node.imports;
    if (children.length > 0) {
      renderSubtree(children, lines, prefix + childPrefix, isReverse, color);
    }
  }
}

/**
 * Render dependency tree for CLI (non-interactive) output
 */
export function renderDependencyTreeCLI(graph: DependencyGraph): string {
  const lines = renderDependencyTree(graph, {
    showImports: true,
    showImportedBy: true,
  });

  // Remove interactive help line for CLI output
  return lines.slice(0, -2).join('\n');
}

/**
 * Get all files from a dependency graph (for selection)
 */
export function getAllGraphFiles(graph: DependencyGraph): {
  imports: string[];
  importedBy: string[];
  all: string[];
} {
  return {
    imports: [...graph.allImports],
    importedBy: [...graph.allImportedBy],
    all: [...new Set([...graph.allImports, ...graph.allImportedBy])],
  };
}
