/**
 * Content processing utilities: comment stripping, minification, and transforms
 */

import type { TransformRule } from "./types.js";

/**
 * Strip comments from code based on file extension
 * Uses robust regex to distinguish comments from string literals
 */
export function stripComments(content: string, ext: string): string {
  const cleanExt = ext.startsWith('.') ? ext.slice(1).toLowerCase() : ext.toLowerCase();

  // C-style comments (JS, TS, Java, C, C++, C#, Go, Rust, Swift, Kotlin, Scala, PHP, Dart)
  const cStyle = ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'java', 'c', 'cpp', 'h', 'cs', 'go', 'rs', 'swift', 'kt', 'scala', 'php', 'css', 'scss', 'less', 'dart'];

  // Hash-style comments (Python, Ruby, Shell, YAML, TOML, Perl)
  const hashStyle = ['py', 'rb', 'sh', 'bash', 'zsh', 'fish', 'yaml', 'yml', 'toml', 'pl', 'dockerfile'];

  // HTML-style comments (HTML, XML, Markdown, Vue, Svelte)
  const htmlStyle = ['html', 'xml', 'md', 'mdx', 'vue', 'svelte', 'astro', 'svg'];

  // Lua/SQL style
  const luaStyle = ['lua', 'sql'];

  if (cStyle.includes(cleanExt)) {
    // Remove block comments /* ... */
    let text = content.replace(/\/\*[\s\S]*?\*\//g, '');

    // Remove line comments // ...
    // Matches: Double-quoted strings OR Single-quoted strings OR Backtick strings OR Line comments
    // We preserve the strings and replace the comments
    text = text.replace(/("([^"\\]|\\.)*")|('([^'\\]|\\.)*')|(`([^`\\]|\\.)*`)|(\/\/.*)/g, (match, doubleQuoted, _dqInner, singleQuoted, _sqInner, backTick, _btInner, comment) => {
      if (doubleQuoted || singleQuoted || backTick) return match; // Preserve strings
      return ''; // Remove comment
    });
    return text;
  }

  if (hashStyle.includes(cleanExt)) {
    // Remove # comments, preserving strings
    return content.replace(/("([^"\\]|\\.)*")|('([^'\\]|\\.)*')|(#.*)/g, (match, doubleQuoted, _dqInner, singleQuoted, _sqInner, comment) => {
      if (doubleQuoted || singleQuoted) return match;
      return '';
    });
  }

  if (htmlStyle.includes(cleanExt)) {
    return content.replace(/<!--[\s\S]*?-->/g, '');
  }

  if (luaStyle.includes(cleanExt)) {
    return content.replace(/--.*$/gm, '');
  }

  // Default: return as is if unknown format
  return content;
}

/**
 * Minify content by removing empty lines and trimming whitespace
 */
export function minify(content: string): string {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

/**
 * Apply transformation rules to content
 * Useful for redacting sensitive information like API keys, passwords, etc.
 *
 * Transforms are applied in order, each operating on the result of the previous.
 *
 * @param content - The content to transform
 * @param transforms - Array of transform rules (pattern + replacement)
 * @returns Transformed content
 */
export function applyTransforms(content: string, transforms: TransformRule[]): string {
  if (!transforms || transforms.length === 0) {
    return content;
  }

  let result = content;
  for (const { pattern, replacement } of transforms) {
    // Reset lastIndex for global patterns to ensure fresh matching
    if (pattern.global) {
      pattern.lastIndex = 0;
    }
    result = result.replace(pattern, replacement);
  }
  return result;
}
