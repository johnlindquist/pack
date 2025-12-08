/**
 * AST-based context extraction utilities
 */

import type { SyntaxNode } from "web-tree-sitter";
import { parseCode, getLanguageFromExtension, blockNodeTypes } from "./ast.js";

export type BlockBoundary = {
  startLine: number; // 0-indexed
  endLine: number; // 0-indexed
  type: string;
  name?: string;
};

/** Find the containing block for a given line using AST */
export async function findContainingBlock(
  content: string,
  ext: string,
  lineIndex: number
): Promise<BlockBoundary | null> {
  const language = getLanguageFromExtension(ext);
  if (!language) return null;

  const tree = await parseCode(content, ext);
  if (!tree) return null;

  const blockTypes = blockNodeTypes[language] || [];
  let bestBlock: BlockBoundary | null = null;

  function traverse(node: SyntaxNode) {
    const startLine = node.startPosition.row;
    const endLine = node.endPosition.row;

    if (startLine <= lineIndex && endLine >= lineIndex) {
      if (blockTypes.includes(node.type)) {
        let name: string | undefined;
        const nameNode = node.childForFieldName("name");
        if (nameNode) name = nameNode.text;

        const block: BlockBoundary = { startLine, endLine, type: node.type, name };

        if (!bestBlock || (endLine - startLine) < (bestBlock.endLine - bestBlock.startLine)) {
          bestBlock = block;
        }
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) traverse(child);
      }
    }
  }

  traverse(tree.rootNode);
  return bestBlock;
}

/** Find all blocks that overlap with a line range */
export async function findBlocksInRange(
  content: string,
  ext: string,
  startLine: number,
  endLine: number
): Promise<BlockBoundary[]> {
  const language = getLanguageFromExtension(ext);
  if (!language) return [];

  const tree = await parseCode(content, ext);
  if (!tree) return [];

  const blockTypes = blockNodeTypes[language] || [];
  const blocks: BlockBoundary[] = [];

  function traverse(node: SyntaxNode) {
    const nodeStart = node.startPosition.row;
    const nodeEnd = node.endPosition.row;

    if (nodeStart <= endLine && nodeEnd >= startLine) {
      if (blockTypes.includes(node.type)) {
        let name: string | undefined;
        const nameNode = node.childForFieldName("name");
        if (nameNode) name = nameNode.text;

        blocks.push({ startLine: nodeStart, endLine: nodeEnd, type: node.type, name });
      }

      for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child) traverse(child);
      }
    }
  }

  traverse(tree.rootNode);
  return blocks;
}

/** Expand context to include full block boundaries (0-indexed) */
export async function expandToBlockBoundaries(
  content: string,
  ext: string,
  startLine: number,
  endLine: number,
  maxExpansion: number = 50
): Promise<{ startLine: number; endLine: number }> {
  const language = getLanguageFromExtension(ext);
  if (!language) return { startLine, endLine };

  const tree = await parseCode(content, ext);
  if (!tree) return { startLine, endLine };

  const blockTypes = blockNodeTypes[language] || [];
  let expandedStart = startLine;
  let expandedEnd = endLine;

  function traverse(node: SyntaxNode) {
    const nodeStart = node.startPosition.row;
    const nodeEnd = node.endPosition.row;

    // Block contains our target range
    if (nodeStart <= startLine && nodeEnd >= endLine && blockTypes.includes(node.type)) {
      if (nodeStart >= startLine - maxExpansion && nodeEnd <= endLine + maxExpansion) {
        expandedStart = Math.min(expandedStart, nodeStart);
        expandedEnd = Math.max(expandedEnd, nodeEnd);
      }
    }

    // Block starts within our range
    if (nodeStart >= startLine && nodeStart <= endLine && blockTypes.includes(node.type)) {
      if (nodeEnd <= endLine + maxExpansion) {
        expandedEnd = Math.max(expandedEnd, nodeEnd);
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) traverse(child);
    }
  }

  traverse(tree.rootNode);
  return { startLine: expandedStart, endLine: expandedEnd };
}

export type Declaration = {
  type: string;
  name: string;
  startLine: number;
  endLine: number;
};

/** Get all top-level declarations in a file */
export async function getDeclarations(content: string, ext: string): Promise<Declaration[]> {
  const language = getLanguageFromExtension(ext);
  if (!language) return [];

  const tree = await parseCode(content, ext);
  if (!tree) return [];

  const declarations: Declaration[] = [];
  const declarationTypes: Record<string, string[]> = {
    typescript: [
      "function_declaration", "class_declaration", "interface_declaration",
      "type_alias_declaration", "enum_declaration", "export_statement", "lexical_declaration",
    ],
    javascript: ["function_declaration", "class_declaration", "export_statement", "lexical_declaration"],
    python: ["function_definition", "class_definition", "decorated_definition"],
  };

  const types = declarationTypes[language] || [];

  for (let i = 0; i < tree.rootNode.childCount; i++) {
    const child = tree.rootNode.child(i);
    if (!child) continue;

    if (types.includes(child.type)) {
      let name = "";
      const nameNode = child.childForFieldName("name");
      if (nameNode) {
        name = nameNode.text;
      } else if (child.type === "export_statement") {
        const declaration = child.childForFieldName("declaration");
        if (declaration) {
          const declName = declaration.childForFieldName("name");
          if (declName) name = declName.text;
        }
      } else if (child.type === "lexical_declaration") {
        const declarator = child.namedChild(0);
        if (declarator) {
          const nameChild = declarator.childForFieldName("name");
          if (nameChild) name = nameChild.text;
        }
      }

      declarations.push({
        type: child.type,
        name,
        startLine: child.startPosition.row,
        endLine: child.endPosition.row,
      });
    }
  }

  return declarations;
}
