/**
 * File discovery and filtering with .gitignore support and parallel processing
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { glob } from "glob";
import { Minimatch } from "minimatch";
import ignore, { type Ignore } from "ignore";
import pLimit from "p-limit";
import { isBinaryFile } from "./analysis.js";
import { verbose } from "./logger.js";

const DEFAULT_CONCURRENCY_LIMIT = 50;

/**
 * Default ignore patterns (common build artifacts, dependencies, etc.)
 */
export const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/tmp/**',
  '**/temp/**',
  '**/*.log',
  '**/.DS_Store',
  '**/Thumbs.db',
  // Lockfiles
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/bun.lockb',
  '**/bun.lock',
  '**/Gemfile.lock',
  '**/Cargo.lock',
  '**/poetry.lock',
  '**/Pipfile.lock',
  '**/composer.lock'
];

/**
 * Load and parse .gitignore files from a directory and its parents
 */
export async function loadGitignore(dir: string): Promise<Ignore> {
  const ig = ignore();

  // Walk up the directory tree to find all .gitignore files
  let currentDir = path.resolve(dir);
  const gitignoreFiles: string[] = [];

  while (true) {
    const gitignorePath = path.join(currentDir, '.gitignore');
    try {
      await fs.access(gitignorePath);
      gitignoreFiles.unshift(gitignorePath); // Add to front (parent rules first)
    } catch (err) {
      // No .gitignore at this level
      verbose(`No .gitignore found at ${gitignorePath}`, { error: err instanceof Error ? err.message : String(err) });
    }

    // Check if we've reached the repo root or filesystem root
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;

    // Check for .git directory to know we're at repo root
    try {
      await fs.access(path.join(currentDir, '.git'));
      break; // Found repo root
    } catch {
      currentDir = parentDir;
    }
  }

  // Parse all found .gitignore files
  for (const gitignorePath of gitignoreFiles) {
    try {
      const content = await fs.readFile(gitignorePath, 'utf8');
      ig.add(content);
    } catch (err) {
      // Ignore read errors
      verbose(`Failed to read .gitignore file: ${gitignorePath}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return ig;
}

/**
 * Load and parse .packignore file from a directory
 * .packignore rules are applied in addition to .gitignore rules
 */
export async function loadPackignore(dir: string): Promise<Ignore> {
  const ig = ignore();
  const packignorePath = path.join(path.resolve(dir), '.packignore');

  try {
    await fs.access(packignorePath);
    const content = await fs.readFile(packignorePath, 'utf8');
    ig.add(content);
  } catch {
    // No .packignore file - return empty ignore
  }

  return ig;
}

/**
 * Scan directory for files matching extension filters
 */
export async function scanDirectory(
  root: string,
  extensions: Set<string>,
  excludePatterns: string[],
  caseSensitive: boolean = false,
  useGitignore: boolean = true,
  usePackignore: boolean = true
): Promise<string[]> {
  const absRoot = path.resolve(root);
  const candidates: string[] = [];

  // Load .gitignore rules
  const gitignore = useGitignore ? await loadGitignore(absRoot) : ignore();

  // Load .packignore rules (when enabled)
  const packignore = usePackignore ? await loadPackignore(absRoot) : ignore();

  // Build glob patterns for each extension
  const patterns: string[] = [];
  for (const ext of extensions) {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    patterns.push(`**/*.${cleanExt}`);
  }

  // Combine default ignores with user excludes
  const allIgnores = [...DEFAULT_IGNORE_PATTERNS, ...excludePatterns];

  // Run glob for each pattern
  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: absRoot,
      ignore: allIgnores,
      absolute: true,
      dot: false,
      nodir: true
    });

    for (const file of files) {
      // Apply .gitignore filtering
      const relPath = path.relative(absRoot, file);
      if (!gitignore.ignores(relPath) && !packignore.ignores(relPath)) {
        candidates.push(file);
      }
    }
  }

  return [...new Set(candidates)];
}

/**
 * Filter files by content pattern in parallel
 */
export async function filterByContent(
  files: string[],
  pattern: RegExp | null,
  excludePattern: RegExp | null,
  maxFileSize: number = 10 * 1024 * 1024,
  concurrencyLimit: number = DEFAULT_CONCURRENCY_LIMIT
): Promise<string[]> {
  const limit = pLimit(concurrencyLimit);

  const results = await Promise.all(
    files.map(file =>
      limit(async () => {
        try {
          const stat = await fs.stat(file);

          // Skip large files
          if (stat.size > maxFileSize) return null;

          // Skip binary files
          if (await isBinaryFile(file)) return null;

          const content = await fs.readFile(file, 'utf8');

          // Check exclude pattern first
          if (excludePattern && excludePattern.test(content)) {
            return null;
          }

          // Check include pattern (or pass through if no pattern)
          if (!pattern || pattern.test(content)) {
            return file;
          }

          return null;
        } catch (err) {
          verbose(`Failed to read file for content filtering: ${file}`, { error: err instanceof Error ? err.message : String(err) });
          return null;
        }
      })
    )
  );

  return results.filter((f): f is string => f !== null);
}

/**
 * Apply include/ignore matchers on paths
 */
export function applyMatchers(
  files: string[],
  cwd: string,
  includeMatchersRel: Minimatch[],
  includeMatchersAbs: Minimatch[],
  ignoreMatchers: Minimatch[],
  explicitFiles?: Set<string>
): string[] {
  const filtered: string[] = [];
  const explicitOnly = explicitFiles && explicitFiles.size > 0;

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const absPosix = file.replace(/\\/g, '/');

    // If explicit files provided, only include those
    if (explicitOnly && !explicitFiles.has(file)) continue;

    // Apply include matchers
    if (!explicitOnly) {
      const hasIncludeFilters = (includeMatchersAbs.length + includeMatchersRel.length) > 0;
      if (hasIncludeFilters) {
        const matchRel = includeMatchersRel.length ? includeMatchersRel.some(mm => mm.match(rel)) : false;
        const matchAbs = includeMatchersAbs.length ? includeMatchersAbs.some(mm => mm.match(absPosix)) : false;
        if (!(matchRel || matchAbs)) continue;
      }
    }

    // Apply ignore matchers
    if (ignoreMatchers.length && ignoreMatchers.some(mm => mm.match(rel))) continue;

    filtered.push(file);
  }

  return filtered;
}

/**
 * Check if a pattern has glob characters
 */
export function hasGlobChars(s: string): boolean {
  return /[\*\?\[\]\{\}!]/.test(s);
}

/**
 * Expand a simple pattern into multiple glob patterns
 */
export function expandPattern(p: string): string[] {
  // If pattern already has glob characters, keep as-is
  if (hasGlobChars(p)) return [p];

  // Normalize path separators
  let norm = p.replace(/\\/g, '/');
  if (norm.startsWith('./')) {
    norm = norm.slice(2);
  }

  const patterns: string[] = [];
  patterns.push(norm);
  patterns.push(`**/${norm}`);
  patterns.push(`${norm}/**`);
  patterns.push(`**/${norm}/**`);

  return [...new Set(patterns)];
}

// ============================================================================
// Related Files Discovery
// ============================================================================

/**
 * Find related files for a given file path
 * Looks for files with the same base name but different extensions/suffixes
 * (e.g., component.tsx -> component.test.tsx, component.stories.tsx)
 */
export async function findRelatedFiles(
  filePath: string,
  existingFiles?: Set<string>
): Promise<string[]> {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const basename = path.basename(filePath, ext);
  const baseParts = basename.split(".");
  const coreName = baseParts[0];

  const related: string[] = [];

  try {
    const entries = await fs.readdir(dir);

    for (const entry of entries) {
      const entryPath = path.join(dir, entry);

      if (entryPath === filePath) continue;
      if (existingFiles?.has(entryPath)) continue;

      const entryExt = path.extname(entry);
      const entryBasename = path.basename(entry, entryExt);
      const entryCoreName = entryBasename.split(".")[0];

      if (entryCoreName === coreName) {
        try {
          const stat = await fs.stat(entryPath);
          if (stat.isFile()) {
            related.push(entryPath);
          }
        } catch (err) {
          // Skip if can't stat
          verbose(`Failed to stat potential related file: ${entryPath}`, { error: err instanceof Error ? err.message : String(err) });
        }
      }
    }
  } catch (err) {
    // Directory read failed
    verbose(`Failed to read directory for related files: ${dir}`, { error: err instanceof Error ? err.message : String(err) });
  }

  return related;
}

/**
 * Expand a list of files to include their related files
 */
export async function expandWithRelatedFiles(
  files: string[]
): Promise<string[]> {
  const existing = new Set(files);
  const expanded = [...files];

  for (const file of files) {
    const related = await findRelatedFiles(file, existing);
    for (const r of related) {
      if (!existing.has(r)) {
        existing.add(r);
        expanded.push(r);
      }
    }
  }

  return expanded;
}
