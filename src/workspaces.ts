/**
 * Workspace detection and resolution for monorepo support
 * Supports pnpm, npm/yarn, lerna, nx, and turbo workspace configurations
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { parse as parseYaml } from "yaml";
import { verbose } from "./logger.js";

// ============================================================================
// Types
// ============================================================================

export type MonorepoType = 'pnpm' | 'npm' | 'yarn' | 'lerna' | 'nx' | 'turbo';

export interface Workspace {
  name: string;
  path: string;
  relativePath: string;
  dependencies: string[];
  devDependencies: string[];
}

export interface MonorepoConfig {
  type: MonorepoType;
  root: string;
  workspaces: Workspace[];
}

// ============================================================================
// Workspace Detection
// ============================================================================

/**
 * Detect monorepo configuration from a directory
 * Checks for pnpm-workspace.yaml, package.json workspaces, lerna.json, nx.json, turbo.json
 */
export async function detectMonorepo(cwd: string): Promise<MonorepoConfig | null> {
  const absRoot = path.resolve(cwd);

  // Try each detection method in order of specificity
  const detectors = [
    { type: 'pnpm' as MonorepoType, detect: detectPnpmWorkspaces },
    { type: 'nx' as MonorepoType, detect: detectNxWorkspaces },
    { type: 'turbo' as MonorepoType, detect: detectTurboWorkspaces },
    { type: 'lerna' as MonorepoType, detect: detectLernaWorkspaces },
    { type: 'npm' as MonorepoType, detect: detectNpmWorkspaces }, // Also handles yarn
  ];

  for (const { type, detect } of detectors) {
    try {
      const workspaces = await detect(absRoot);
      if (workspaces && workspaces.length > 0) {
        return {
          type,
          root: absRoot,
          workspaces,
        };
      }
    } catch (err) {
      verbose(`Failed to detect ${type} workspaces`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return null;
}

/**
 * Detect pnpm workspaces from pnpm-workspace.yaml
 */
async function detectPnpmWorkspaces(root: string): Promise<Workspace[] | null> {
  const workspaceFile = path.join(root, 'pnpm-workspace.yaml');

  try {
    await fs.access(workspaceFile);
  } catch {
    return null;
  }

  const content = await fs.readFile(workspaceFile, 'utf8');
  const config = parseYaml(content) as { packages?: string[] };

  if (!config.packages || !Array.isArray(config.packages)) {
    return null;
  }

  return await resolveWorkspaceGlobs(root, config.packages);
}

/**
 * Detect npm/yarn workspaces from package.json
 */
async function detectNpmWorkspaces(root: string): Promise<Workspace[] | null> {
  const pkgFile = path.join(root, 'package.json');

  try {
    await fs.access(pkgFile);
  } catch {
    return null;
  }

  const content = await fs.readFile(pkgFile, 'utf8');
  const pkg = JSON.parse(content) as { workspaces?: string[] | { packages?: string[] } };

  let workspaceGlobs: string[] | undefined;

  if (Array.isArray(pkg.workspaces)) {
    workspaceGlobs = pkg.workspaces;
  } else if (pkg.workspaces?.packages) {
    workspaceGlobs = pkg.workspaces.packages;
  }

  if (!workspaceGlobs || workspaceGlobs.length === 0) {
    return null;
  }

  return await resolveWorkspaceGlobs(root, workspaceGlobs);
}

/**
 * Detect lerna workspaces from lerna.json
 */
async function detectLernaWorkspaces(root: string): Promise<Workspace[] | null> {
  const lernaFile = path.join(root, 'lerna.json');

  try {
    await fs.access(lernaFile);
  } catch {
    return null;
  }

  const content = await fs.readFile(lernaFile, 'utf8');
  const config = JSON.parse(content) as { packages?: string[] };

  if (!config.packages || !Array.isArray(config.packages)) {
    // Lerna defaults to packages/* if not specified
    return await resolveWorkspaceGlobs(root, ['packages/*']);
  }

  return await resolveWorkspaceGlobs(root, config.packages);
}

/**
 * Detect Nx workspaces from nx.json
 */
async function detectNxWorkspaces(root: string): Promise<Workspace[] | null> {
  const nxFile = path.join(root, 'nx.json');

  try {
    await fs.access(nxFile);
  } catch {
    return null;
  }

  // Nx can have projects in workspace.json or project.json files
  // First check for workspace.json
  const workspaceFile = path.join(root, 'workspace.json');
  try {
    await fs.access(workspaceFile);
    const content = await fs.readFile(workspaceFile, 'utf8');
    const config = JSON.parse(content) as { projects?: Record<string, string | { root: string }> };

    if (config.projects) {
      const workspaces: Workspace[] = [];
      for (const [name, project] of Object.entries(config.projects)) {
        const projectRoot = typeof project === 'string' ? project : project.root;
        const absPath = path.join(root, projectRoot);
        const ws = await loadWorkspaceInfo(absPath, name, projectRoot);
        if (ws) workspaces.push(ws);
      }
      return workspaces.length > 0 ? workspaces : null;
    }
  } catch {
    // workspace.json doesn't exist, try scanning for project.json files
  }

  // Scan for project.json files
  const projectJsonFiles = await glob('**/project.json', {
    cwd: root,
    ignore: ['**/node_modules/**'],
    absolute: true,
  });

  if (projectJsonFiles.length === 0) {
    return null;
  }

  const workspaces: Workspace[] = [];
  for (const projectFile of projectJsonFiles) {
    try {
      const content = await fs.readFile(projectFile, 'utf8');
      const project = JSON.parse(content) as { name?: string };
      const projectDir = path.dirname(projectFile);
      const relativePath = path.relative(root, projectDir);
      const name = project.name || path.basename(projectDir);
      const ws = await loadWorkspaceInfo(projectDir, name, relativePath);
      if (ws) workspaces.push(ws);
    } catch {
      // Skip invalid project.json files
    }
  }

  return workspaces.length > 0 ? workspaces : null;
}

/**
 * Detect Turborepo workspaces from turbo.json
 * Turbo uses the same workspace config as npm/yarn/pnpm
 */
async function detectTurboWorkspaces(root: string): Promise<Workspace[] | null> {
  const turboFile = path.join(root, 'turbo.json');

  try {
    await fs.access(turboFile);
  } catch {
    return null;
  }

  // Turbo uses package.json workspaces or pnpm-workspace.yaml
  // Check for pnpm first
  const pnpmWorkspaces = await detectPnpmWorkspaces(root);
  if (pnpmWorkspaces) return pnpmWorkspaces;

  // Fall back to npm/yarn workspaces
  return await detectNpmWorkspaces(root);
}

// ============================================================================
// Workspace Resolution
// ============================================================================

/**
 * Resolve workspace globs to actual workspace directories
 */
async function resolveWorkspaceGlobs(root: string, globs: string[]): Promise<Workspace[]> {
  const workspaceDirs: string[] = [];

  for (const pattern of globs) {
    // Handle negation patterns
    if (pattern.startsWith('!')) {
      continue; // Skip negation patterns for now
    }

    const matches = await glob(pattern, {
      cwd: root,
      ignore: ['**/node_modules/**'],
      absolute: true,
    });

    for (const match of matches) {
      // Only include directories that have a package.json
      const pkgPath = path.join(match, 'package.json');
      try {
        await fs.access(pkgPath);
        workspaceDirs.push(match);
      } catch {
        // Not a valid workspace (no package.json)
      }
    }
  }

  // Load workspace info from each directory
  const workspaces: Workspace[] = [];
  for (const dir of workspaceDirs) {
    const relativePath = path.relative(root, dir);
    const ws = await loadWorkspaceInfo(dir, undefined, relativePath);
    if (ws) workspaces.push(ws);
  }

  return workspaces;
}

/**
 * Load workspace info from a directory
 */
async function loadWorkspaceInfo(
  absPath: string,
  fallbackName?: string,
  relativePath?: string
): Promise<Workspace | null> {
  const pkgPath = path.join(absPath, 'package.json');

  try {
    const content = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(content) as {
      name?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    return {
      name: pkg.name || fallbackName || path.basename(absPath),
      path: absPath,
      relativePath: relativePath || path.basename(absPath),
      dependencies: Object.keys(pkg.dependencies || {}),
      devDependencies: Object.keys(pkg.devDependencies || {}),
    };
  } catch {
    // If no package.json, use directory name
    if (fallbackName) {
      return {
        name: fallbackName,
        path: absPath,
        relativePath: relativePath || path.basename(absPath),
        dependencies: [],
        devDependencies: [],
      };
    }
    return null;
  }
}

/**
 * Resolve a workspace name to its path
 * Supports:
 * - Exact package name: @myorg/ui-components
 * - Shorthand: @ui/button -> packages/ui/button
 * - Directory name: ui-components
 */
export async function resolveWorkspace(
  name: string,
  config: MonorepoConfig
): Promise<Workspace | null> {
  // Try exact name match first
  const exactMatch = config.workspaces.find(ws => ws.name === name);
  if (exactMatch) return exactMatch;

  // Try matching by directory name
  const dirMatch = config.workspaces.find(ws =>
    path.basename(ws.path) === name ||
    ws.relativePath === name
  );
  if (dirMatch) return dirMatch;

  // Handle shorthand: @scope/name -> packages/scope/name or similar
  if (name.startsWith('@')) {
    const withoutAt = name.slice(1);
    const parts = withoutAt.split('/');

    // Try to find by partial path match
    for (const ws of config.workspaces) {
      const relParts = ws.relativePath.split('/');

      // Check if the workspace path ends with the shorthand parts
      if (relParts.length >= parts.length) {
        const endParts = relParts.slice(-parts.length);
        if (endParts.join('/') === parts.join('/')) {
          return ws;
        }
      }

      // Also check if workspace name matches the shorthand
      if (ws.name.includes(withoutAt) || ws.name.endsWith('/' + parts[parts.length - 1])) {
        return ws;
      }
    }
  }

  // Try fuzzy directory match
  const fuzzyMatch = config.workspaces.find(ws =>
    ws.relativePath.includes(name) ||
    ws.path.includes(name)
  );
  if (fuzzyMatch) return fuzzyMatch;

  return null;
}

/**
 * List all workspaces in a monorepo
 */
export function listWorkspaces(config: MonorepoConfig): Workspace[] {
  return [...config.workspaces].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get workspace dependencies (other workspaces this workspace depends on)
 */
export function getWorkspaceDependencies(
  workspace: Workspace,
  config: MonorepoConfig
): Workspace[] {
  const allDeps = [...workspace.dependencies, ...workspace.devDependencies];
  const workspaceNames = new Set(config.workspaces.map(ws => ws.name));

  return config.workspaces.filter(ws =>
    allDeps.includes(ws.name) && ws.name !== workspace.name
  );
}

/**
 * Get all workspaces that a workspace depends on (recursively)
 */
export function getWorkspaceDependencyTree(
  workspace: Workspace,
  config: MonorepoConfig,
  visited = new Set<string>()
): Workspace[] {
  if (visited.has(workspace.name)) {
    return [];
  }
  visited.add(workspace.name);

  const directDeps = getWorkspaceDependencies(workspace, config);
  const allDeps: Workspace[] = [...directDeps];

  for (const dep of directDeps) {
    const transitiveDeps = getWorkspaceDependencyTree(dep, config, visited);
    for (const td of transitiveDeps) {
      if (!allDeps.some(d => d.name === td.name)) {
        allDeps.push(td);
      }
    }
  }

  return allDeps;
}

/**
 * Format workspace list for display
 */
export function formatWorkspaceList(workspaces: Workspace[]): string {
  if (workspaces.length === 0) {
    return 'No workspaces found.';
  }

  const maxNameLen = Math.max(...workspaces.map(ws => ws.name.length));

  const lines = workspaces.map(ws => {
    const name = ws.name.padEnd(maxNameLen + 2);
    return `  ${name} ${ws.relativePath}`;
  });

  return lines.join('\n');
}

/**
 * Check if a path is within a workspace
 */
export function isPathInWorkspace(filePath: string, workspace: Workspace): boolean {
  const absPath = path.resolve(filePath);
  return absPath.startsWith(workspace.path + path.sep) || absPath === workspace.path;
}

/**
 * Find which workspace a file belongs to
 */
export function findWorkspaceForPath(
  filePath: string,
  config: MonorepoConfig
): Workspace | null {
  const absPath = path.resolve(filePath);

  // Sort workspaces by path length (longest first) to find most specific match
  const sortedWorkspaces = [...config.workspaces].sort(
    (a, b) => b.path.length - a.path.length
  );

  for (const ws of sortedWorkspaces) {
    if (isPathInWorkspace(absPath, ws)) {
      return ws;
    }
  }

  return null;
}

/**
 * Group files by workspace
 */
export function groupFilesByWorkspace(
  files: string[],
  config: MonorepoConfig
): Map<Workspace | null, string[]> {
  const groups = new Map<Workspace | null, string[]>();

  for (const file of files) {
    const ws = findWorkspaceForPath(file, config);
    const existing = groups.get(ws) || [];
    existing.push(file);
    groups.set(ws, existing);
  }

  return groups;
}
