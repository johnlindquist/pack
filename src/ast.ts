/**
 * AST-based parsing utilities using web-tree-sitter (WASM)
 * Provides accurate comment stripping and context extraction
 */

import { Parser, Language, type Tree, type SyntaxNode } from "web-tree-sitter";
import { join } from "path";
import { existsSync } from "fs";
import { verbose } from "./logger.js";

// Find WASM directory for language parsers - works in both src and dist contexts
function findWasmDir(): string {
  const candidates = [
    join(process.cwd(), "node_modules", "tree-sitter-wasms", "out"),
    join(__dirname, "..", "node_modules", "tree-sitter-wasms", "out"),
    join(__dirname, "..", "..", "node_modules", "tree-sitter-wasms", "out"),
    join(__dirname, "..", "..", "..", "tree-sitter-wasms", "out"), // global bun install
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]; // fallback
}
const wasmDir = findWasmDir();

// Find tree-sitter.wasm from web-tree-sitter - needed for Parser.init()
function findTreeSitterWasm(fileName: string): string {
  const candidates = [
    join(process.cwd(), "node_modules", "web-tree-sitter", fileName),
    join(__dirname, "..", "node_modules", "web-tree-sitter", fileName),
    join(__dirname, "..", "..", "node_modules", "web-tree-sitter", fileName),
    join(__dirname, "..", "..", "..", "web-tree-sitter", fileName), // global bun install
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  return fileName; // fallback to default behavior
}

// Comment types for each language
const commentTypes: Record<string, string[]> = {
  typescript: ["comment"],
  javascript: ["comment"],
  python: ["comment"],
};

// Extension to language/WASM mapping
const extensionToWasm: Record<string, string> = {
  ts: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-typescript.wasm",
  mts: "tree-sitter-typescript.wasm",
  cts: "tree-sitter-typescript.wasm",
  js: "tree-sitter-javascript.wasm",
  jsx: "tree-sitter-javascript.wasm",
  mjs: "tree-sitter-javascript.wasm",
  cjs: "tree-sitter-javascript.wasm",
  py: "tree-sitter-python.wasm",
};

// Block node types for context extraction
export const blockNodeTypes: Record<string, string[]> = {
  typescript: [
    "function_declaration", "method_definition", "arrow_function",
    "class_declaration", "class_body", "if_statement", "for_statement",
    "for_in_statement", "while_statement", "try_statement", "switch_statement",
    "lexical_declaration", "variable_declaration", "export_statement",
    "interface_declaration", "type_alias_declaration", "enum_declaration",
  ],
  javascript: [
    "function_declaration", "method_definition", "arrow_function",
    "class_declaration", "class_body", "if_statement", "for_statement",
    "for_in_statement", "while_statement", "try_statement", "switch_statement",
    "lexical_declaration", "variable_declaration", "export_statement",
  ],
  python: [
    "function_definition", "class_definition", "if_statement",
    "for_statement", "while_statement", "try_statement",
    "with_statement", "decorated_definition",
  ],
};

// Parser initialization state
let parserInitialized = false;
let parser: Parser | null = null;
const languageCache = new Map<string, Language>();

/** Initialize the parser (must be called before parsing) */
async function initParser(): Promise<Parser> {
  if (parser && parserInitialized) return parser;

  await Parser.init({
    locateFile: findTreeSitterWasm,
  });
  parser = new Parser();
  parserInitialized = true;
  return parser;
}

/** Load a language by WASM filename */
async function loadLanguage(wasmFile: string): Promise<Language | null> {
  const cached = languageCache.get(wasmFile);
  if (cached) return cached;

  try {
    const wasmPath = join(wasmDir, wasmFile);
    const language = await Language.load(wasmPath);
    languageCache.set(wasmFile, language);
    return language;
  } catch (err) {
    verbose(`Failed to load tree-sitter language WASM`, { wasmFile, wasmDir, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Get language name from file extension */
export function getLanguageFromExtension(ext: string): string | null {
  const cleanExt = ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
  if (cleanExt === "ts" || cleanExt === "tsx" || cleanExt === "mts" || cleanExt === "cts") {
    return "typescript";
  }
  if (cleanExt === "js" || cleanExt === "jsx" || cleanExt === "mjs" || cleanExt === "cjs") {
    return "javascript";
  }
  if (cleanExt === "py") return "python";
  return null;
}

/** Check if AST parsing is supported for a file extension */
export function isASTSupported(ext: string): boolean {
  const cleanExt = ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
  return cleanExt in extensionToWasm;
}

/** Parse source code into an AST */
export async function parseCode(content: string, ext: string): Promise<Tree | null> {
  const cleanExt = ext.startsWith(".") ? ext.slice(1).toLowerCase() : ext.toLowerCase();
  const wasmFile = extensionToWasm[cleanExt];
  if (!wasmFile) return null;

  try {
    const p = await initParser();
    const language = await loadLanguage(wasmFile);
    if (!language) return null;

    p.setLanguage(language);
    return p.parse(content);
  } catch (err) {
    verbose(`Failed to parse code with tree-sitter`, { ext, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Collect all comment nodes from an AST */
function collectCommentNodes(node: SyntaxNode, language: string): SyntaxNode[] {
  const types = commentTypes[language] || ["comment"];
  const comments: SyntaxNode[] = [];

  function traverse(n: SyntaxNode) {
    if (types.includes(n.type)) {
      comments.push(n);
    }
    for (let i = 0; i < n.childCount; i++) {
      const child = n.child(i);
      if (child) traverse(child);
    }
  }

  traverse(node);
  return comments;
}

/** Strip comments from code using AST parsing */
export async function stripCommentsAST(
  content: string,
  ext: string
): Promise<{ result: string; usedAST: boolean }> {
  const language = getLanguageFromExtension(ext);
  if (!language) return { result: content, usedAST: false };

  const tree = await parseCode(content, ext);
  if (!tree) return { result: content, usedAST: false };

  const comments = collectCommentNodes(tree.rootNode, language);
  if (comments.length === 0) return { result: content, usedAST: true };

  // Sort comments by start position in reverse order
  comments.sort((a, b) => b.startIndex - a.startIndex);

  let result = content;
  for (const comment of comments) {
    const before = result.slice(0, comment.startIndex);
    const after = result.slice(comment.endIndex);

    const lineStart = before.lastIndexOf("\n") + 1;
    const lineEnd = after.indexOf("\n");
    const beforeOnLine = before.slice(lineStart);
    const afterOnLine = lineEnd === -1 ? after : after.slice(0, lineEnd);

    if (beforeOnLine.trim() === "" && afterOnLine.trim() === "") {
      const removeStart = lineStart;
      const removeEnd = comment.endIndex + (lineEnd === -1 ? 0 : lineEnd + 1);
      result = result.slice(0, removeStart) + result.slice(removeEnd);
    } else {
      result = before + after;
    }
  }

  return { result, usedAST: true };
}

export type { Language, Tree, SyntaxNode };
