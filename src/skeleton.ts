/**
 * AST-based skeleton extraction for code files
 * Extracts only interface/signatures, removing implementation details
 */

import { parseCode, getLanguageFromExtension, isASTSupported } from "./ast.js";
import type { SyntaxNode } from "web-tree-sitter";

/**
 * Node types that represent function/method bodies to be replaced
 */
const bodyNodeTypes: Record<string, string[]> = {
  typescript: [
    "statement_block", // function body { ... }
  ],
  javascript: [
    "statement_block", // function body { ... }
  ],
  python: [
    "block", // Python function body
  ],
};

/**
 * Node types that are function/method declarations (whose bodies we replace)
 */
const functionNodeTypes: Record<string, string[]> = {
  typescript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
  ],
  javascript: [
    "function_declaration",
    "method_definition",
    "arrow_function",
    "function_expression",
  ],
  python: [
    "function_definition",
  ],
};

/**
 * Node types that are containers we need to recurse into (classes, etc.)
 * These should NOT have their bodies replaced
 */
const containerNodeTypes: Record<string, string[]> = {
  typescript: [
    "class_declaration",
    "interface_declaration",
    "type_alias_declaration",
    "enum_declaration",
    "abstract_class_declaration",
    "class_body",
  ],
  javascript: [
    "class_declaration",
    "class_body",
  ],
  python: [
    "class_definition",
  ],
};

/**
 * Information about a body node to be replaced
 */
type BodyReplacement = {
  startIndex: number;
  endIndex: number;
  replacement: string;
  language: string;
};

/**
 * Find all function/method bodies that should be replaced with placeholders
 */
function findBodies(
  node: SyntaxNode,
  language: string,
  bodies: BodyReplacement[]
): void {
  const funcTypes = functionNodeTypes[language] || [];
  const containerTypes = containerNodeTypes[language] || [];
  const bodyTypes = bodyNodeTypes[language] || [];

  // Check if this is a function/method node (whose body we replace)
  if (funcTypes.includes(node.type)) {
    // Find the body child node
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child && bodyTypes.includes(child.type)) {
        // Determine the appropriate placeholder
        let placeholder: string;
        if (language === "python") {
          placeholder = "...\n";
        } else {
          placeholder = "{ /* ... */ }";
        }

        bodies.push({
          startIndex: child.startIndex,
          endIndex: child.endIndex,
          replacement: placeholder,
          language,
        });
        // Don't recurse into the body - we're replacing it
        continue;
      }
      // Recurse into non-body children (e.g., parameters, return type)
      if (child) {
        findBodies(child, language, bodies);
      }
    }
  } else if (containerTypes.includes(node.type)) {
    // This is a container (class, interface, etc.) - recurse into all children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        findBodies(child, language, bodies);
      }
    }
  } else {
    // Regular node - recurse into all children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        findBodies(child, language, bodies);
      }
    }
  }
}

/**
 * Extract skeleton from code by replacing function bodies with placeholders
 *
 * @param content - The source code content
 * @param ext - File extension (e.g., "ts", "js", "py")
 * @returns Object with result (skeleton code) and usedAST flag
 */
export async function extractSkeleton(
  content: string,
  ext: string
): Promise<{ result: string; usedAST: boolean }> {
  const language = getLanguageFromExtension(ext);
  if (!language) {
    return { result: content, usedAST: false };
  }

  if (!isASTSupported(ext)) {
    return { result: content, usedAST: false };
  }

  const tree = await parseCode(content, ext);
  if (!tree) {
    return { result: content, usedAST: false };
  }

  const bodies: BodyReplacement[] = [];
  findBodies(tree.rootNode, language, bodies);

  if (bodies.length === 0) {
    return { result: content, usedAST: true };
  }

  // Sort by start position in reverse order so we can replace from end to start
  // without affecting earlier indices
  bodies.sort((a, b) => b.startIndex - a.startIndex);

  let result = content;
  for (const body of bodies) {
    const before = result.slice(0, body.startIndex);
    const after = result.slice(body.endIndex);

    if (body.language === "python") {
      // For Python, we need to handle indentation properly
      // Find the indentation level from the line before the body
      const lastNewline = before.lastIndexOf("\n");
      const lineBeforeBody = before.slice(lastNewline + 1);
      // The colon and any trailing content
      // We need to find what indentation the body should have
      // Look at the first line of the original body to get its indentation
      const originalBody = content.slice(body.startIndex, body.endIndex);
      const bodyLines = originalBody.split("\n");
      let bodyIndent = "";
      for (const line of bodyLines) {
        const match = line.match(/^(\s+)/);
        if (match) {
          bodyIndent = match[1];
          break;
        }
      }
      // If we couldn't find indentation, use 4 spaces as default
      if (!bodyIndent) {
        bodyIndent = "    ";
      }
      result = before + bodyIndent + "...\n" + after;
    } else {
      result = before + body.replacement + after;
    }
  }

  return { result, usedAST: true };
}

/**
 * Check if skeleton extraction is supported for a file extension
 */
export function isSkeletonSupported(ext: string): boolean {
  return isASTSupported(ext);
}
