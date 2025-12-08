#!/usr/bin/env node
/**
 * packx - Smart file filter for AI consumption
 *
 * Usage:
 *   packx -s "setFlags" -s "flaggedValue" -e "ts,tsx" [options...]
 *
 * Examples:
 *   packx -s "foo" -s "bar" -e "ts,tsx" --compress -o filtered.xml --style xml
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { createWriteStream } from "node:fs";
import { glob } from "glob";
import { Minimatch } from "minimatch";
import { checkbox, confirm } from "@inquirer/prompts";
import { createPrompt, useState, useKeypress, isEnterKey, isSpaceKey, isUpKey, isDownKey } from "@inquirer/core";
import pLimit from "p-limit";

import { parseArgs, printHelp, type Argv } from "./cli.js";
import {
  parseCSV,
  toExtSet,
  normalizeStrings,
  parseConfigFile,
  getDefaultExtensions,
  isGitRepository,
  getGitStagedFiles,
  getGitDirtyFiles,
  getGitDiffFiles,
  expandWithRelatedFiles
} from "./core.js";
import { buildPattern, extractContextWindows, formatContextWindows } from "./context.js";
import { scanDirectory, filterByContent, loadGitignore, hasGlobChars, expandPattern, DEFAULT_IGNORE_PATTERNS } from "./scanner.js";
import { countTokens, isBinaryFile, formatTokenCount, getTokenWarning, analyzeFile } from "./analysis.js";
import { StreamFormatter, StringBufferStream, type OutputStyle } from "./formatter.js";

const CONCURRENCY_LIMIT = 50;

// File tree checkbox with folder/extension toggling
type FileChoice = {
  path: string;      // Full path
  relPath: string;   // Relative path for display
  tokens: number;
  ext: string;       // File extension
};

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  depth: number;
  tokens: number;     // For folders: sum of children
  ext: string;        // For files: extension
  children: TreeNode[];
  fileIndices: number[]; // Indices into original files array
};

type TreeCheckboxConfig = {
  message: string;
  files: FileChoice[];
  pageSize?: number;
};

// Build tree structure from flat file list
function buildFileTree(files: FileChoice[]): { tree: TreeNode[], flatNodes: TreeNode[] } {
  const root: Map<string, TreeNode> = new Map();

  // Create folder nodes and file nodes
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parts = file.relPath.split('/');
    let currentPath = '';

    for (let j = 0; j < parts.length; j++) {
      const part = parts[j];
      const isFile = j === parts.length - 1;
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!root.has(currentPath)) {
        const node: TreeNode = {
          name: part,
          path: currentPath,
          isFolder: !isFile,
          depth: j,
          tokens: isFile ? file.tokens : 0,
          ext: isFile ? file.ext : '',
          children: [],
          fileIndices: isFile ? [i] : [],
        };
        root.set(currentPath, node);

        // Add to parent's children
        if (parentPath && root.has(parentPath)) {
          root.get(parentPath)!.children.push(node);
        }
      } else if (isFile) {
        // File already exists (shouldn't happen, but handle it)
        root.get(currentPath)!.fileIndices.push(i);
      }
    }
  }

  // Calculate folder tokens and collect file indices
  function calcFolderTokens(node: TreeNode): { tokens: number; indices: number[] } {
    if (!node.isFolder) {
      return { tokens: node.tokens, indices: node.fileIndices };
    }
    let totalTokens = 0;
    const allIndices: number[] = [];
    for (const child of node.children) {
      const result = calcFolderTokens(child);
      totalTokens += result.tokens;
      allIndices.push(...result.indices);
    }
    node.tokens = totalTokens;
    node.fileIndices = allIndices;
    return { tokens: totalTokens, indices: allIndices };
  }

  // Get top-level nodes and calculate tokens
  const topLevel: TreeNode[] = [];
  for (const [nodePath, node] of root) {
    if (!nodePath.includes('/')) {
      topLevel.push(node);
      calcFolderTokens(node);
    }
  }

  // Flatten tree for display (respecting collapsed state)
  function flattenTree(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
    const result: TreeNode[] = [];
    // Sort: folders first, then by name
    const sorted = [...nodes].sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const node of sorted) {
      result.push(node);
      if (node.isFolder && !collapsed.has(node.path)) {
        result.push(...flattenTree(node.children, collapsed));
      }
    }
    return result;
  }

  return { tree: topLevel, flatNodes: flattenTree(topLevel, new Set()) };
}

const treeCheckbox = createPrompt<string[], TreeCheckboxConfig>((config, done) => {
  const { files, pageSize = 20 } = config;

  // Build initial tree
  const { tree } = buildFileTree(files);

  // State
  const [cursor, setCursor] = useState<number>(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const initialSelected = new Set<number>(files.map((_, i) => i));
  const [selected, setSelected] = useState<Set<number>>(initialSelected);
  const [showExtensions, setShowExtensions] = useState<boolean>(false);

  // Flatten tree with current collapsed state
  function getFlatNodes(): TreeNode[] {
    function flatten(nodes: TreeNode[]): TreeNode[] {
      const result: TreeNode[] = [];
      const sorted = [...nodes].sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      for (const node of sorted) {
        result.push(node);
        if (node.isFolder && !collapsed.has(node.path)) {
          result.push(...flatten(node.children));
        }
      }
      return result;
    }
    return flatten(tree);
  }

  // Get extension summary
  function getExtensionSummary(): { ext: string; count: number; tokens: number; allSelected: boolean; indices: number[] }[] {
    const extMap = new Map<string, { count: number; tokens: number; indices: number[] }>();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.ext || '(no ext)';
      if (!extMap.has(ext)) {
        extMap.set(ext, { count: 0, tokens: 0, indices: [] });
      }
      const entry = extMap.get(ext)!;
      entry.count++;
      entry.tokens += file.tokens;
      entry.indices.push(i);
    }
    return Array.from(extMap.entries())
      .map(([ext, data]) => ({
        ext,
        ...data,
        allSelected: data.indices.every(i => selected.has(i)),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  }

  const flatNodes = getFlatNodes();
  const extSummary = getExtensionSummary();

  useKeypress((key) => {
    if (isEnterKey(key)) {
      const result = files.filter((_, i) => selected.has(i)).map(f => f.path);
      done(result);
      return;
    }

    if (showExtensions) {
      // Extension mode navigation
      if (isUpKey(key)) {
        setCursor(cursor > 0 ? cursor - 1 : extSummary.length - 1);
      } else if (isDownKey(key)) {
        setCursor(cursor < extSummary.length - 1 ? cursor + 1 : 0);
      } else if (isSpaceKey(key)) {
        // Toggle all files of this extension
        const ext = extSummary[cursor];
        if (ext) {
          const next = new Set(selected);
          if (ext.allSelected) {
            ext.indices.forEach(i => next.delete(i));
          } else {
            ext.indices.forEach(i => next.add(i));
          }
          setSelected(next);
        }
      } else if (key.name === 'e' || key.name === 'escape') {
        setShowExtensions(false);
        setCursor(0);
      }
      return;
    }

    // Tree mode navigation
    if (isUpKey(key)) {
      setCursor(cursor > 0 ? cursor - 1 : flatNodes.length - 1);
    } else if (isDownKey(key)) {
      setCursor(cursor < flatNodes.length - 1 ? cursor + 1 : 0);
    } else if (isSpaceKey(key)) {
      // Toggle current item (file or folder)
      const node = flatNodes[cursor];
      if (node) {
        const next = new Set(selected);
        const allSelected = node.fileIndices.every(i => selected.has(i));
        if (allSelected) {
          node.fileIndices.forEach(i => next.delete(i));
        } else {
          node.fileIndices.forEach(i => next.add(i));
        }
        setSelected(next);
      }
    } else if (key.name === 'left') {
      // Collapse folder or go to parent
      const node = flatNodes[cursor];
      if (node?.isFolder && !collapsed.has(node.path)) {
        const next = new Set(collapsed);
        next.add(node.path);
        setCollapsed(next);
      }
    } else if (key.name === 'right') {
      // Expand folder
      const node = flatNodes[cursor];
      if (node?.isFolder && collapsed.has(node.path)) {
        const next = new Set(collapsed);
        next.delete(node.path);
        setCollapsed(next);
      }
    } else if (key.name === 'a') {
      // Toggle all
      if (selected.size === files.length) {
        setSelected(new Set<number>());
      } else {
        setSelected(new Set(files.map((_, i) => i)));
      }
    } else if (key.name === 'e') {
      // Switch to extension mode
      setShowExtensions(true);
      setCursor(0);
    }
  });

  // Calculate totals
  const selectedTokens = files
    .filter((_, i) => selected.has(i))
    .reduce((sum, f) => sum + f.tokens, 0);
  const totalTokens = files.reduce((sum, f) => sum + f.tokens, 0);

  if (showExtensions) {
    // Render extension list
    const lines = extSummary.map((ext, i) => {
      const isCursor = i === cursor;
      const checkbox = ext.allSelected ? '◉' : (ext.indices.some(idx => selected.has(idx)) ? '◐' : '○');
      const pointer = isCursor ? '❯' : ' ';
      const style = isCursor ? '\x1b[36m' : (ext.allSelected ? '\x1b[32m' : '\x1b[90m');
      const reset = '\x1b[0m';
      return `${style}${pointer} ${checkbox} ${ext.ext} (${ext.count} files, ${formatTokenCount(ext.tokens)} tokens)${reset}`;
    });

    const totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;
    const helpLine = '\x1b[90m(↑↓ navigate, space toggle ext, e/esc back to tree, enter confirm)\x1b[0m';

    return `📁 Filter by Extension:\n${lines.join('\n')}${totalLine}\n${helpLine}`;
  }

  // Render tree view with pagination
  const startIdx = Math.max(0, Math.min(cursor - Math.floor(pageSize / 2), flatNodes.length - pageSize));
  const endIdx = Math.min(startIdx + pageSize, flatNodes.length);
  const visibleNodes = flatNodes.slice(startIdx, endIdx);

  const lines = visibleNodes.map((node, i) => {
    const actualIdx = startIdx + i;
    const isCursor = actualIdx === cursor;
    const allSelected = node.fileIndices.every(idx => selected.has(idx));
    const someSelected = node.fileIndices.some(idx => selected.has(idx));
    const checkbox = allSelected ? '◉' : (someSelected ? '◐' : '○');
    const pointer = isCursor ? '❯' : ' ';
    const indent = '  '.repeat(node.depth);

    let icon = '';
    if (node.isFolder) {
      icon = collapsed.has(node.path) ? '▸ ' : '▾ ';
    } else {
      icon = '  ';
    }

    const tokenStr = ` (${formatTokenCount(node.tokens)})`;
    const style = isCursor ? '\x1b[36m' : (allSelected ? '\x1b[32m' : (someSelected ? '\x1b[33m' : '\x1b[90m'));
    const reset = '\x1b[0m';
    const folderStyle = node.isFolder ? '\x1b[1m' : '';

    return `${style}${pointer} ${checkbox} ${indent}${icon}${folderStyle}${node.name}${reset}${style}${tokenStr}${reset}`;
  });

  // Add scroll indicators
  if (startIdx > 0) {
    lines.unshift('\x1b[90m  ↑ more above\x1b[0m');
  }
  if (endIdx < flatNodes.length) {
    lines.push('\x1b[90m  ↓ more below\x1b[0m');
  }

  const totalLine = `\n\x1b[1m📊 Selected: ${formatTokenCount(selectedTokens)} / ${formatTokenCount(totalTokens)} tokens (${selected.size}/${files.length} files)\x1b[0m`;
  const helpLine = '\x1b[90m(↑↓ navigate, ←→ collapse/expand, space toggle, a all, e extensions, enter confirm)\x1b[0m';

  return `${config.message}\n${lines.join('\n')}${totalLine}\n${helpLine}`;
});

async function createConfigTemplate(filename: string = 'pack-config.ini') {
  const template = `# Pack configuration file
# Search for specific strings in your codebase
# Lines starting with # are comments
# Empty lines are ignored

[search]
# Add search strings here, one per line
# Examples:
# console.log
# TODO
# FIXME

[extensions]
# File extensions to include (without dots)
# Leave empty to search all common code files
# Examples:
# ts
# tsx
# js
# jsx

[exclude]
# Exclude patterns using gitignore syntax
# Examples:
# *.d.ts              # All TypeScript declaration files
# *.test.ts           # All test files
# *.spec.ts           # All spec files
# *.min.js            # All minified JS files
# docs/               # Docs directory
# site/               # Site directory
# **/test/**          # Any test directories
# **/*.test.ts        # Test files anywhere
# examples/**         # Everything under examples
# !important.test.ts  # Exception: include this test file
`;

  try {
    try {
      await fs.access(filename);
      console.error(`❌ File '${filename}' already exists. Use a different name or delete the existing file.`);
      process.exit(1);
    } catch {
      // File doesn't exist, proceed
    }

    const dir = path.dirname(filename);
    if (dir && dir !== '.' && dir !== '') {
      try {
        await fs.access(dir);
      } catch {
        console.log(`📁 Directory '${dir}' does not exist.`);

        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('Would you like to create it? (y/n): ', resolve);
        });
        rl.close();

        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          await fs.mkdir(dir, { recursive: true });
          console.log(`✅ Created directory: ${dir}`);
        } else {
          console.log('❌ Directory creation cancelled.');
          process.exit(1);
        }
      }
    }

    await fs.writeFile(filename, template, 'utf8');
    console.log(`✅ Created config template: ${filename}`);
    console.log(`\nEdit the file and then run:`);
    console.log(`  packx -f ${filename}`);
  } catch (error) {
    console.error(`❌ Failed to create config file: ${error}`);
    process.exit(1);
  }
}

/**
 * Generate .ini config content from selected files
 */
function generateIniConfig(selectedFiles: string[], parsed: Argv): string {
  const cwd = process.cwd();
  const relativePaths = selectedFiles.map(f => path.relative(cwd, f));

  // Extract unique extensions from selected files
  const extensions = new Set<string>();
  for (const file of relativePaths) {
    const ext = path.extname(file).toLowerCase().replace('.', '');
    if (ext) extensions.add(ext);
  }

  let config = `# Pack configuration - generated from interactive selection
# ${new Date().toISOString()}

[files]
# Selected files (${selectedFiles.length} total)
${relativePaths.join('\n')}

[extensions]
# Extensions from selected files
${Array.from(extensions).join('\n')}
`;

  // Include search strings if any were used
  const searchStrings = parsed.search || parsed.s;
  if (searchStrings && Array.isArray(searchStrings) && searchStrings.length > 0) {
    config += `
[search]
# Search strings used in original query
${searchStrings.join('\n')}
`;
  }

  // Include exclude patterns if any were used
  const excludePatterns = parsed.exclude || parsed.x;
  if (excludePatterns && Array.isArray(excludePatterns) && excludePatterns.length > 0) {
    config += `
[exclude]
# Exclude patterns used in original query
${excludePatterns.join('\n')}
`;
  }

  return config;
}

async function main() {
  // Check for init command first
  if (process.argv[2] === 'init') {
    let filename = process.argv[3] || 'pack-config.ini';

    if (filename && !path.extname(filename)) {
      filename = `${filename}.ini`;
    }

    await createConfigTemplate(filename);
    process.exit(0);
  }

  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help || parsed.h) {
    printHelp();
    process.exit(0);
  }
  if (parsed.version || parsed.v) {
    console.log("packx v3.4.0");
    process.exit(0);
  }

  let strings: string[] = [];
  let excludeStrings: string[] = [];
  let extensions: Set<string>;
  let excludePatterns: string[] = [];
  const caseSensitive = parsed["case-sensitive"] || parsed.C || false;
  const useRegex = parsed.regex || parsed.R || false;
  const smartContext = Boolean((parsed as any)["smart-context"]);

  // Parse include/ignore patterns
  function toArray(val: any): string[] {
    if (!val) return [];
    return Array.isArray(val) ? val.map(String) : [String(val)];
  }
  const includeRaw = toArray((parsed as any).include);
  const includeList = includeRaw.flatMap(v => parseCSV(v));
  const ignoreRaw = toArray((parsed as any).ignore || (parsed as any).i);
  const ignoreList = ignoreRaw.flatMap(v => parseCSV(v));

  // Classify positional args
  const positionalArgs: string[] = (parsed._ as any[] || []).map(String);
  const positionalRoots: string[] = [];
  const positionalFileIncludes: string[] = [];
  const positionalGlobIncludes: string[] = [];

  for (const arg of positionalArgs) {
    if (!arg) continue;
    if (hasGlobChars(arg)) {
      positionalGlobIncludes.push(arg);
      continue;
    }
    try {
      const st = await fs.stat(arg);
      if (st.isDirectory()) positionalRoots.push(arg);
      else if (st.isFile()) positionalFileIncludes.push(path.resolve(arg));
      else positionalGlobIncludes.push(arg);
    } catch {
      positionalGlobIncludes.push(arg);
    }
  }

  // Combine includes
  const positionalFilePatterns = positionalFileIncludes
    .map((abs) => path.relative(process.cwd(), abs).replace(/\\/g, '/'));
  const combinedIncludeList = [
    ...includeList,
    ...positionalGlobIncludes,
    ...positionalFilePatterns,
  ];

  const includeExpanded = combinedIncludeList.flatMap(p => expandPattern(p));
  const ignoreExpanded = ignoreList.flatMap(p => expandPattern(p));

  const includeExpandedAbs = includeExpanded.filter((p) => path.isAbsolute(p));
  const includeExpandedRel = includeExpanded.filter((p) => !path.isAbsolute(p));
  const includeMatchersAbs = includeExpandedAbs.map(p => new Minimatch(p, { dot: true, nocase: !caseSensitive, noglobstar: false }));
  const includeMatchersRel = includeExpandedRel.map(p => new Minimatch(p, { dot: true, nocase: !caseSensitive, noglobstar: false }));
  const ignoreMatchers = ignoreExpanded.map(p => new Minimatch(p, { dot: true, nocase: !caseSensitive, noglobstar: false }));

  // Parse config file or CLI args
  const configFile = parsed.file || parsed.f;
  if (configFile) {
    const config = await parseConfigFile(configFile);
    strings = config.search;
    extensions = toExtSet(config.extensions);
    excludePatterns = config.exclude;

    strings.push(...normalizeStrings(parsed.strings));
    strings.push(...normalizeStrings(parsed.s));

    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);

    const cliExtensions = parsed.extensions || parsed.e;
    const cliExtList = Array.isArray(cliExtensions)
      ? cliExtensions.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExtensions);
    for (const ext of toExtSet(cliExtList)) {
      extensions.add(ext);
    }

    const cliExclude = parsed["exclude-extensions"] || parsed.x;
    const cliExcludeList = Array.isArray(cliExclude)
      ? cliExclude.flatMap(v => parseCSV(String(v)))
      : parseCSV(cliExclude);

    for (const excl of cliExcludeList) {
      if (excl) {
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  } else {
    strings = [
      ...normalizeStrings(parsed.strings),
      ...normalizeStrings(parsed.s)
    ].filter(Boolean);

    excludeStrings = [
      ...normalizeStrings(parsed["exclude-strings"]),
      ...normalizeStrings(parsed.S)
    ].filter(Boolean);

    const extensionValues = parsed.extensions || parsed.e;
    const extensionsList = Array.isArray(extensionValues)
      ? extensionValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(extensionValues);
    extensions = toExtSet(extensionsList);

    const excludeValues = parsed["exclude-extensions"] || parsed.x;
    const excludeList = Array.isArray(excludeValues)
      ? excludeValues.flatMap(v => parseCSV(String(v)))
      : parseCSV(excludeValues);

    for (const excl of excludeList) {
      if (excl) {
        if (!excl.includes('/') && !excl.includes('*')) {
          excludePatterns.push(`**/*.${excl.replace(/^\./, '')}`);
        } else {
          excludePatterns.push(excl);
        }
      }
    }
  }

  strings = strings.filter(Boolean);

  if (!extensions.size) {
    extensions = getDefaultExtensions();
  }

  const roots = positionalRoots.length ? positionalRoots : ["."];
  const pattern = buildPattern(strings, caseSensitive, useRegex);
  const excludePattern = buildPattern(excludeStrings, caseSensitive, useRegex);

  // Git-aware context
  const useGitStaged = Boolean(parsed.staged);
  const useGitDiff = Boolean(parsed.diff);
  const useGitDirty = Boolean(parsed.dirty);
  const useGitContext = useGitStaged || useGitDiff || useGitDirty;

  // Discover files
  const candidates = new Set<string>();

  if (useGitContext) {
    const isGitRepo = await isGitRepository();
    if (!isGitRepo) {
      console.error("❌ Git-aware options (--staged, --diff, --dirty) require a git repository.");
      process.exit(1);
    }

    let gitFiles: string[] = [];

    if (useGitStaged) {
      console.log("🔍 Finding staged files...");
      gitFiles = await getGitStagedFiles();
    } else if (useGitDirty) {
      console.log("🔍 Finding modified and untracked files...");
      gitFiles = await getGitDirtyFiles();
    } else if (useGitDiff) {
      console.log("🔍 Finding files changed vs main branch...");
      gitFiles = await getGitDiffFiles();
    }

    if (gitFiles.length === 0) {
      if (useGitStaged) {
        console.warn("⚠️  No files are staged. Use 'git add' to stage files first.");
      } else if (useGitDirty) {
        console.warn("⚠️  No modified or untracked files found.");
      } else if (useGitDiff) {
        console.warn("⚠️  No files differ from the main branch.");
      }
      process.exit(0);
    }

    console.log(`📁 Found ${gitFiles.length} file(s) from git`);

    // Filter by extension
    for (const file of gitFiles) {
      const ext = path.extname(file).toLowerCase();
      if (extensions.size === 0 || extensions.has(ext)) {
        const rel = path.relative(process.cwd(), file).replace(/\\/g, '/');
        let excluded = false;
        for (const ep of excludePatterns) {
          if (rel.endsWith(ep) || file.endsWith(ep)) {
            excluded = true;
            break;
          }
        }
        if (!excluded) {
          candidates.add(file);
        }
      }
    }
  } else {
    // Standard file discovery with .gitignore support
    for (const root of roots) {
      const absRoot = path.resolve(root);
      const gitignore = await loadGitignore(absRoot);

      // Build glob patterns
      const patterns: string[] = [];
      for (const ext of extensions) {
        const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
        patterns.push(`**/*.${cleanExt}`);
      }

      const allIgnores = [...DEFAULT_IGNORE_PATTERNS, ...excludePatterns];

      for (const pat of patterns) {
        const files = await glob(pat, {
          cwd: absRoot,
          ignore: allIgnores,
          absolute: true,
          dot: false,
          nodir: true
        });

        for (const file of files) {
          const relPath = path.relative(absRoot, file);
          if (!gitignore.ignores(relPath)) {
            candidates.add(file);
          }
        }
      }

      // Include pattern discovery
      if (includeExpanded.length > 0) {
        for (const inc of includeExpanded) {
          try {
            const isAbs = path.isAbsolute(inc);
            const files = await glob(inc, {
              cwd: isAbs ? undefined : absRoot,
              ignore: allIgnores,
              absolute: true,
              dot: false,
              nodir: true,
            });
            for (const f of files) candidates.add(f);
          } catch {
            // ignore invalid patterns
          }
        }
      }
    }
  }

  // Include explicit files
  if (!useGitContext) {
    for (const f of positionalFileIncludes) candidates.add(f);
  }

  if (!candidates.size) {
    console.warn("⚠️  No files found with the specified extensions in the given roots.");
    process.exit(2);
  }

  // Apply include/ignore matchers
  let filteredCandidates: string[] = [];
  const explicitSet = new Set(positionalFileIncludes);
  const explicitOnly = positionalFileIncludes.length > 0;

  for (const p of candidates) {
    const rel = path.relative(process.cwd(), p).replace(/\\/g, '/');
    const absPosix = p.replace(/\\/g, '/');

    if (explicitOnly && !explicitSet.has(p)) continue;

    if (!explicitOnly) {
      const hasIncludeFilters = (includeMatchersAbs.length + includeMatchersRel.length) > 0;
      if (hasIncludeFilters) {
        const matchRel = includeMatchersRel.length ? includeMatchersRel.some(mm => mm.match(rel)) : false;
        const matchAbs = includeMatchersAbs.length ? includeMatchersAbs.some(mm => mm.match(absPosix)) : false;
        if (!(matchRel || matchAbs)) continue;
      }
    }

    if (ignoreMatchers.length && ignoreMatchers.some(mm => mm.match(rel))) continue;
    filteredCandidates.push(p);
  }

  // Filter by content in parallel
  const matched: string[] = [];
  const foundExtensions = new Set<string>();
  const limit = pLimit(CONCURRENCY_LIMIT);

  const results = await Promise.all(
    filteredCandidates.map(p =>
      limit(async () => {
        try {
          const stat = await fs.stat(p);
          if (stat.size > 10 * 1024 * 1024) return null;
          if (await isBinaryFile(p)) return null;

          const content = await fs.readFile(p, 'utf8');

          if (excludePattern && excludePattern.test(content)) {
            return null;
          }

          if (!pattern || pattern.test(content)) {
            return p;
          }

          return null;
        } catch {
          return null;
        }
      })
    )
  );

  for (const p of results) {
    if (p) {
      matched.push(p);
      const ext = path.extname(p).toLowerCase();
      if (ext) foundExtensions.add(ext);
    }
  }

  // Interactive selection
  const wantInteractive = Boolean(parsed.interactive || parsed.I);
  if (wantInteractive && matched.length > 0 && process.stdin.isTTY) {
    console.log(`\n🎯 Interactive mode: Analyzing ${matched.length} files for token counts...\n`);

    try {
      // Analyze all files for token counts in parallel
      const limit = pLimit(CONCURRENCY_LIMIT);
      const analysisResults = await Promise.all(
        matched.map((file) => limit(async () => {
          const analysis = await analyzeFile(file);
          return { file, tokens: analysis.tokens };
        }))
      );

      // Build a map for quick token lookup
      const tokenMap = new Map(analysisResults.map(r => [r.file, r.tokens]));

      // Build file choices for tree checkbox
      const fileChoices: FileChoice[] = analysisResults.map(({ file, tokens }) => {
        const rel = path.relative(process.cwd(), file);
        const ext = path.extname(file).toLowerCase().replace('.', '');
        return { path: file, relPath: rel, tokens, ext };
      });

      const selected = await treeCheckbox({
        message: "Select files to bundle:",
        files: fileChoices,
        pageSize: 20,
      });

      if (selected.length === 0) {
        console.log("\n⚠️  No files selected. Exiting.");
        process.exit(0);
      }

      // Calculate selected token total
      const selectedTokens = selected.reduce((sum, file) => sum + (tokenMap.get(file) || 0), 0);

      matched.length = 0;
      matched.push(...selected);
      console.log(`\n✅ Selected ${matched.length} file(s) — ${formatTokenCount(selectedTokens)} tokens\n`);

      // Ask about saving .ini config
      const saveConfig = await confirm({
        message: "Save selection as .ini config file?",
        default: false,
      });

      if (saveConfig) {
        const configContent = generateIniConfig(selected, parsed);
        const configPath = path.join(process.cwd(), "pack-selection.ini");
        await fs.writeFile(configPath, configContent, "utf8");
        console.log(`\n💾 Saved config to: ${configPath}`);
        console.log(`   Run again with: packx -f ${path.basename(configPath)}\n`);
      }
    } catch (error: any) {
      if (error.name === "ExitPromptError") {
        console.log("\n⚠️  Selection cancelled.");
        process.exit(0);
      }
      throw error;
    }
  }

  // Related files discovery
  const wantRelated = Boolean(parsed.related || parsed.r);
  if (wantRelated && matched.length > 0) {
    const beforeCount = matched.length;
    const expanded = await expandWithRelatedFiles(matched);

    if (expanded.length > beforeCount) {
      console.log(`🔗 Found ${expanded.length - beforeCount} related file(s)`);
      matched.length = 0;
      matched.push(...expanded);
    }
  }

  if (!matched.length) {
    console.warn("⚠️  No files matched the given strings.");
    process.exit(3);
  }

  if (parsed.preview) {
    console.log("Matched files (sample):");
    const sampleCount = Math.min(matched.length, 50);
    for (const m of matched.slice(0, sampleCount)) console.log(m);
    if (matched.length > sampleCount) {
      console.log(`... and ${matched.length - sampleCount} more`);
    }
    console.log(`\nTotal: ${matched.length} file(s).`);
    process.exit(0);
  }

  // Output setup
  const cwd = process.cwd();
  const relativePaths = matched.map(p => path.relative(cwd, p));

  const rawOutputArg = (parsed.output ?? parsed.o) as any;
  let toStdout = Boolean((parsed as any).stdout);
  if (rawOutputArg === '-' || (parsed.o === true && (parsed._ || []).includes('-'))) {
    toStdout = true;
  }
  const outputFile = typeof rawOutputArg === 'string' ? rawOutputArg : undefined;
  const wantsClipboard = Boolean((parsed as any).copy || (parsed as any).c);
  const summaryOnly = !toStdout && !outputFile && !wantsClipboard;
  const outputStyle: OutputStyle = ((parsed as any).style || "xml") as OutputStyle;
  const log = (msg: string) => (toStdout ? console.error(msg) : console.log(msg));

  log(`🧩 Packing ${matched.length} file(s)...`);

  const hasSearchStrings = strings.length > 0;
  const contextLines = hasSearchStrings ? (parsed.lines || parsed.l) : undefined;

  if (contextLines) {
    log(`📝 Extracting ${contextLines} lines of context around matches...`);
    if (smartContext) {
      log(`   (using smart indentation-aware context)`);
    }
  } else {
    log(`📝 Files selected:`);
    relativePaths.slice(0, 10).forEach(p => log(`  • ${p}`));
    if (relativePaths.length > 10) {
      log(`  ... and ${relativePaths.length - 10} more`);
    }
  }

  // Prepare prompt text
  const promptParts = normalizeStrings((parsed as any).prompt ?? (parsed as any).p).filter(Boolean);
  const promptPathVals = normalizeStrings((parsed as any)["prompt-path"] ?? (parsed as any).P).filter(Boolean);
  const promptFileParts: string[] = [];
  for (const pp of promptPathVals) {
    try {
      const txt = await fs.readFile(pp, 'utf8');
      if (txt && txt.trim()) {
        promptFileParts.push(txt.trim());
      }
    } catch {
      log(`⚠️  Could not read prompt file: ${pp}`);
    }
  }
  const promptText = [...promptParts, ...promptFileParts].join('\n\n').trim();

  // Stream-based output
  let outputStream: NodeJS.WritableStream;
  let outputBuffer: StringBufferStream | null = null;

  if (toStdout) {
    outputStream = process.stdout;
  } else if (outputFile && !summaryOnly) {
    outputStream = createWriteStream(outputFile);
  } else {
    outputBuffer = new StringBufferStream();
    outputStream = outputBuffer;
  }

  const formatter = new StreamFormatter(outputStream as any, outputStyle);

  let totalMatchCount = 0;
  let totalWindowCount = 0;

  if (!summaryOnly) {
    await formatter.writeHeader(matched.length, relativePaths, contextLines);
  }

  // Process files in parallel, write sequentially
  const fileResults = await Promise.all(
    matched.map((filePath, index) =>
      limit(async () => {
        const relPath = relativePaths[index];
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const ext = path.extname(relPath).slice(1) || 'txt';

          let fileOutput = '';
          let matchCount = 0;
          let windowCount = 0;

          if (contextLines && pattern) {
            const windows = extractContextWindows(content, pattern, contextLines, smartContext);
            if (windows.length > 0) {
              windowCount = windows.length;
              matchCount = windows.reduce((sum, w) => sum + w.matches.length, 0);
              const formatted = formatContextWindows(windows, relPath);

              if (outputStyle === "xml") {
                fileOutput = `<file path="${relPath}" matches="${matchCount}" windows="${windowCount}">\n${formatted}</file>\n\n`;
              } else {
                fileOutput = `### ${relPath}\n\n**Matches:** ${matchCount} | **Context windows:** ${windowCount}\n\n\`\`\`${ext}\n${formatted}\`\`\`\n\n`;
              }
            }
          } else {
            if (outputStyle === "xml") {
              fileOutput = `<file path="${relPath}">\n${content}\n</file>\n\n`;
            } else {
              fileOutput = `### ${relPath}\n\n\`\`\`${ext}\n${content}\n\`\`\`\n\n`;
            }
          }

          const tokens = countTokens(fileOutput);
          return { relPath, fileOutput, tokens, size: fileOutput.length, matchCount, windowCount };
        } catch (err) {
          return { relPath, fileOutput: '', tokens: 0, size: 0, matchCount: 0, windowCount: 0, error: err };
        }
      })
    )
  );

  // Write results sequentially
  const fileSizes: { path: string; size: number; tokens: number }[] = [];

  for (const result of fileResults) {
    if (result.fileOutput && !summaryOnly) {
      outputStream.write(result.fileOutput);
    }
    if (result.fileOutput) {
      fileSizes.push({ path: result.relPath, size: result.size, tokens: result.tokens });
      totalMatchCount += result.matchCount;
      totalWindowCount += result.windowCount;
    }
    if (result.error) {
      console.error(`Warning: Could not read file ${result.relPath}: ${result.error}`);
    }
  }

  if (!summaryOnly) {
    await formatter.writeFooter();
    if (promptText) {
      await formatter.writePrompt(promptText);
    }
  }

  // Finalize output
  if (outputFile && !summaryOnly) {
    await new Promise<void>((resolve) => {
      (outputStream as NodeJS.WritableStream).end(() => resolve());
    });
    console.log(`\n✅ Successfully packed ${matched.length} file(s) to ${outputFile}`);
  }

  // Handle clipboard
  const output = outputBuffer?.toString() || '';
  if (wantsClipboard && !toStdout) {
    try {
      const { spawn } = await import('child_process');
      const platform = process.platform;
      let copyProc;

      if (platform === 'darwin') {
        copyProc = spawn('pbcopy');
      } else if (platform === 'win32') {
        copyProc = spawn('clip');
      } else {
        copyProc = spawn('xclip', ['-selection', 'clipboard']);
      }

      copyProc.stdin.write(output);
      copyProc.stdin.end();

      await new Promise((resolve, reject) => {
        copyProc.on('exit', (code) => {
          if (code === 0) {
            console.log('📋 Copied to clipboard!');
            resolve(code);
          } else {
            console.log('⚠️  Could not copy to clipboard');
            reject(new Error(`Copy process exited with code ${code}`));
          }
        });
        copyProc.on('error', () => {
          console.log('⚠️  Could not copy to clipboard (clipboard tool not found)');
          reject();
        });
      });
    } catch {
      // Silently fail if clipboard is not available
    }
  }

  // Summary
  const totalChars = fileSizes.reduce((sum, f) => sum + f.size, 0);
  const totalTokens = fileSizes.reduce((sum, f) => sum + f.tokens, 0);

  log(`\n📊 Pack Summary:`);
  log(`────────────────`);
  log(`  Total Files: ${matched.length} files`);
  if (contextLines) {
    log(`  Context Lines: ${contextLines} around each match`);
    log(`  Total Matches: ${totalMatchCount} matches`);
    log(`  Context Windows: ${totalWindowCount} windows`);
  }
  log(`  Total Tokens: ~${formatTokenCount(totalTokens)} (${totalTokens.toLocaleString()} exact)`);
  log(`  Total Chars: ${totalChars.toLocaleString()} chars`);
  log(`       Output: ${toStdout ? '-' : (outputFile ?? 'none')}`);

  const warning = getTokenWarning(totalTokens);
  if (warning) {
    log(`\n${warning}`);
  }

  if (foundExtensions.size > 0) {
    const sortedExtensions = Array.from(foundExtensions).sort();
    log(`\n📁 Extensions Found:`);
    log(`────────────────────`);
    log(`  ${sortedExtensions.join(', ')}`);
  }

  if (fileSizes.length > 0) {
    const topFiles = fileSizes
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 10);

    log(`\n📂 Top 10 Files (by tokens):`);
    log(`──────────────────────────`);
    for (const file of topFiles) {
      const fileName = path.basename(file.path);
      const dirName = path.dirname(file.path);
      const shortPath = dirName === '.' ? fileName : `${dirName}/${fileName}`;
      log(`  ${formatTokenCount(file.tokens).padStart(8)} - ${shortPath}`);
    }
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(99);
});
