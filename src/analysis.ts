/**
 * Analysis utilities: token counting and binary file detection
 */

import { promises as fs } from "node:fs";
import { getEncoding, type Tiktoken } from "js-tiktoken";
import type { FileAnalysis } from "./types.js";

// Re-export type for convenience
export type { FileAnalysis } from "./types.js";

// Lazy-loaded tiktoken encoder
let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = getEncoding("cl100k_base"); // GPT-4/Claude tokenizer
  }
  return encoder;
}

/**
 * Count tokens in text using tiktoken (accurate for GPT-4/Claude)
 */
export function countTokens(text: string): number {
  try {
    const enc = getEncoder();
    return enc.encode(text).length;
  } catch {
    // Fallback to heuristic if tiktoken fails
    return Math.round(text.length / 4);
  }
}

/**
 * Count tokens with a fast heuristic (for large texts where accuracy matters less)
 */
export function countTokensHeuristic(text: string): number {
  return Math.round(text.length / 4);
}

/**
 * Detect if a file is binary by inspecting its first bytes
 * Returns true if the file appears to be binary
 */
export async function isBinaryFile(filePath: string, sampleSize: number = 512): Promise<boolean> {
  try {
    const fd = await fs.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(sampleSize);
      const { bytesRead } = await fd.read(buffer, 0, sampleSize, 0);

      if (bytesRead === 0) return false; // Empty file is not binary

      // Check for null bytes (strong indicator of binary)
      for (let i = 0; i < bytesRead; i++) {
        if (buffer[i] === 0) {
          return true;
        }
      }

      // Check for high concentration of non-printable characters
      let nonPrintable = 0;
      for (let i = 0; i < bytesRead; i++) {
        const byte = buffer[i];
        // Allow common control characters (tab, newline, carriage return)
        if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
          nonPrintable++;
        }
        // Check for high bytes that aren't valid UTF-8 continuation bytes
        if (byte >= 128 && byte < 192) {
          // This is a UTF-8 continuation byte, check if it follows a valid start
          if (i === 0 || buffer[i - 1] < 192) {
            nonPrintable++;
          }
        }
      }

      // If more than 10% non-printable, likely binary
      return (nonPrintable / bytesRead) > 0.1;
    } finally {
      await fd.close();
    }
  } catch {
    return false; // If we can't read, assume text
  }
}

/**
 * Check if content appears to be binary
 */
export function isBinaryContent(content: Buffer | string): boolean {
  const buffer = typeof content === 'string' ? Buffer.from(content) : content;
  const sampleSize = Math.min(buffer.length, 512);

  if (sampleSize === 0) return false;

  // Check for null bytes
  for (let i = 0; i < sampleSize; i++) {
    if (buffer[i] === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Analyze a file for size and token count
 */
export async function analyzeFile(filePath: string): Promise<FileAnalysis> {
  const stat = await fs.stat(filePath);
  const isBinary = await isBinaryFile(filePath);

  let tokens = 0;
  if (!isBinary && stat.size < 10 * 1024 * 1024) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      tokens = countTokens(content);
    } catch {
      tokens = Math.round(stat.size / 4);
    }
  }

  return {
    path: filePath,
    size: stat.size,
    tokens,
    isBinary
  };
}

/**
 * Format token count for display
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get token limit warnings for common models
 */
export function getTokenWarning(tokens: number): string | null {
  if (tokens > 200_000) {
    return "⚠️  Exceeds Claude 3.5 context window (200K)";
  }
  if (tokens > 128_000) {
    return "⚠️  Exceeds GPT-4 Turbo context window (128K)";
  }
  if (tokens > 100_000) {
    return "⚠️  Large context - may impact response quality";
  }
  return null;
}
