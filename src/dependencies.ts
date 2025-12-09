/**
 * AST-based dependency resolution for packx
 * Parses import/require statements and resolves local dependencies
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parseCode, type SyntaxNode } from "./ast";

/**
 * Parsed import information
 */
export type ParsedImport = {
  source: string;        // The import path as written (e.g., './utils', '../lib/helper')
  isRelative: boolean;   // True if starts with ./ or ../
  line: number;          // Line number in source
};

/**
 * Resolved dependency
 */
export type ResolvedDependency = {
  importPath: string;    // Original import path
  resolvedPath: string;  // Absolute resolved file path
  fromFile: string;      // File that imported this
};

/**
 * Common file extensions to try when resolving imports
 */
const RESOLVE_EXTENSIONS = [
  '',           // Exact match
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
  '.json',
];

/**
 * Extension mappings for TypeScript ESM convention
 * When importing with .js extension, try .ts first
 */
const EXTENSION_MAPPINGS: Record<string, string[]> = {
  '.js': ['.ts', '.tsx', '.js', '.jsx'],
  '.mjs': ['.mts', '.mjs'],
  '.cjs': ['.cts', '.cjs'],
  '.jsx': ['.tsx', '.jsx'],
};

/**
 * Index file names to check for directory imports
 */
const INDEX_FILES = [
  'index.ts',
  'index.tsx',
  'index.js',
  'index.jsx',
  'index.mts',
  'index.mjs',
];

/**
 * Extract string value from a string node, removing quotes
 */
function extractStringValue(node: SyntaxNode): string | null {
  // Find the string_fragment child which contains the actual text
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === "string_fragment") {
      return child.text;
    }
  }
  // Fallback: strip quotes manually if no string_fragment found
  const text = node.text;
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return null;
}

/**
 * Extract imports from AST by traversing nodes
 */
function extractImportsFromAST(rootNode: SyntaxNode): ParsedImport[] {
  const imports: ParsedImport[] = [];

  function traverse(node: SyntaxNode) {
    // Handle import_statement (ES6 imports)
    if (node.type === "import_statement") {
      // Find the string node containing the source
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === "string") {
          const source = extractStringValue(child);
          if (source) {
            imports.push({
              source,
              isRelative: source.startsWith('./') || source.startsWith('../'),
              line: node.startPosition.row + 1,
            });
          }
          break;
        }
      }
    }
    // Handle export_statement with from clause
    else if (node.type === "export_statement") {
      // Check if it has a "from" keyword (re-export)
      let hasFrom = false;
      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child && child.type === "from") {
          hasFrom = true;
          break;
        }
      }

      if (hasFrom) {
        // Find the string node
        for (let i = 0; i < node.childCount; i++) {
          const child = node.child(i);
          if (child && child.type === "string") {
            const source = extractStringValue(child);
            if (source) {
              imports.push({
                source,
                isRelative: source.startsWith('./') || source.startsWith('../'),
                line: node.startPosition.row + 1,
              });
            }
            break;
          }
        }
      }
    }
    // Handle call_expression (require() or dynamic import())
    else if (node.type === "call_expression") {
      // Check if it's require() or import()
      const firstChild = node.child(0);
      if (firstChild) {
        const isRequire = firstChild.type === "identifier" && firstChild.text === "require";
        const isDynamicImport = firstChild.type === "import";

        if (isRequire || isDynamicImport) {
          // Find the arguments node
          for (let i = 0; i < node.childCount; i++) {
            const child = node.child(i);
            if (child && child.type === "arguments") {
              // Find the string argument
              for (let j = 0; j < child.childCount; j++) {
                const arg = child.child(j);
                if (arg && arg.type === "string") {
                  const source = extractStringValue(arg);
                  if (source) {
                    imports.push({
                      source,
                      isRelative: source.startsWith('./') || source.startsWith('../'),
                      line: node.startPosition.row + 1,
                    });
                  }
                  break;
                }
              }
              break;
            }
          }
        }
      }
    }

    // Recursively traverse children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) traverse(child);
    }
  }

  traverse(rootNode);
  return imports;
}

/**
 * Fallback regex-based parsing for when AST parsing fails or is not supported
 */
function parseImportsRegex(content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  const lines = content.split('\n');

  // Patterns to match various import syntaxes
  const patterns = [
    // ES6 static imports: import ... from "path"
    /import\s+(?:[\w\s{},*]+\s+from\s+)?["']([^"']+)["']/g,
    // ES6 export from: export ... from "path"
    /export\s+(?:[\w\s{},*]+\s+from\s+)?["']([^"']+)["']/g,
    // CommonJS require: require("path") or require('path')
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
    // Dynamic import: import("path") or import('path')
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    // Skip comment lines
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    for (const pattern of patterns) {
      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(line)) !== null) {
        const source = match[1];
        if (source) {
          imports.push({
            source,
            isRelative: source.startsWith('./') || source.startsWith('../'),
            line: lineNum + 1,
          });
        }
      }
    }
  }

  return imports;
}

/**
 * Parse imports from source code using AST-based parsing
 * Handles ES6 imports, CommonJS requires, and dynamic imports
 * Falls back to regex-based parsing if AST parsing fails
 */
export async function parseImports(content: string, ext?: string): Promise<ParsedImport[]> {
  // Determine file extension for AST parsing
  const fileExt = ext || '.ts'; // Default to TypeScript

  // Try AST-based parsing first
  try {
    const tree = await parseCode(content, fileExt);
    if (tree) {
      return extractImportsFromAST(tree.rootNode);
    }
  } catch (error) {
    // AST parsing failed, fall back to regex
  }

  // Fall back to regex-based parsing
  return parseImportsRegex(content);
}

/**
 * Resolve a relative import path to an absolute file path
 * Returns null if the file cannot be resolved
 *
 * Handles TypeScript ESM convention where .ts files are imported with .js extension
 */
export async function resolveImportPath(
  importPath: string,
  fromFile: string,
  projectRoot?: string
): Promise<string | null> {
  // Only handle relative imports
  if (!importPath.startsWith('./') && !importPath.startsWith('../')) {
    return null;
  }

  const fromDir = path.dirname(fromFile);
  const basePath = path.resolve(fromDir, importPath);
  const importExt = path.extname(importPath);

  // If the import has an extension, try extension mappings first (TypeScript ESM convention)
  if (importExt && EXTENSION_MAPPINGS[importExt]) {
    const baseWithoutExt = basePath.slice(0, -importExt.length);
    for (const tryExt of EXTENSION_MAPPINGS[importExt]) {
      const candidate = baseWithoutExt + tryExt;
      try {
        const stat = await fs.stat(candidate);
        if (stat.isFile()) {
          return candidate;
        }
      } catch {
        // File doesn't exist, try next
      }
    }
  }

  // Try exact match first
  try {
    const stat = await fs.stat(basePath);
    if (stat.isFile()) {
      return basePath;
    }
  } catch {
    // File doesn't exist
  }

  // Try each extension
  for (const ext of RESOLVE_EXTENSIONS) {
    if (ext === '') continue; // Already tried exact match
    const candidate = basePath + ext;
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      // File doesn't exist, try next
    }
  }

  // Check if it's a directory with an index file
  try {
    const stat = await fs.stat(basePath);
    if (stat.isDirectory()) {
      for (const indexFile of INDEX_FILES) {
        const indexPath = path.join(basePath, indexFile);
        try {
          const indexStat = await fs.stat(indexPath);
          if (indexStat.isFile()) {
            return indexPath;
          }
        } catch {
          // Index file doesn't exist, try next
        }
      }
    }
  } catch {
    // Not a directory
  }

  return null;
}

/**
 * Extract and resolve all local dependencies from a file
 */
export async function extractDependencies(
  filePath: string,
  projectRoot?: string
): Promise<ResolvedDependency[]> {
  const resolved: ResolvedDependency[] = [];

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const ext = path.extname(filePath);
    const imports = await parseImports(content, ext);

    for (const imp of imports) {
      if (imp.isRelative) {
        const resolvedPath = await resolveImportPath(imp.source, filePath, projectRoot);
        if (resolvedPath) {
          resolved.push({
            importPath: imp.source,
            resolvedPath,
            fromFile: filePath,
          });
        }
      }
    }
  } catch {
    // File read error, skip
  }

  return resolved;
}

/**
 * Recursively discover all dependencies starting from a set of files
 * Uses breadth-first traversal to avoid deep recursion
 */
export async function discoverDependencies(
  startFiles: string[],
  options?: {
    maxDepth?: number;
    projectRoot?: string;
    existingFiles?: Set<string>;
  }
): Promise<string[]> {
  const maxDepth = options?.maxDepth ?? 10;
  const projectRoot = options?.projectRoot ?? process.cwd();
  const discovered = new Set<string>(options?.existingFiles ?? []);
  const newDependencies: string[] = [];

  // Add start files to discovered set
  for (const f of startFiles) {
    discovered.add(f);
  }

  // Queue of files to process with their depth
  const queue: Array<{ file: string; depth: number }> = startFiles.map(f => ({ file: f, depth: 0 }));

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;

    if (depth >= maxDepth) {
      continue;
    }

    const deps = await extractDependencies(file, projectRoot);

    for (const dep of deps) {
      if (!discovered.has(dep.resolvedPath)) {
        discovered.add(dep.resolvedPath);
        newDependencies.push(dep.resolvedPath);
        queue.push({ file: dep.resolvedPath, depth: depth + 1 });
      }
    }
  }

  return newDependencies;
}

/**
 * Expand a list of files to include their import dependencies
 * This is the main entry point for the --follow-imports feature
 */
export async function expandWithDependencies(
  files: string[],
  options?: {
    maxDepth?: number;
    projectRoot?: string;
  }
): Promise<string[]> {
  const existing = new Set(files);
  const dependencies = await discoverDependencies(files, {
    ...options,
    existingFiles: existing,
  });

  return [...files, ...dependencies];
}
