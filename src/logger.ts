/**
 * Structured logging module for packx
 * Provides verbose logging that can be enabled with --verbose flag
 */

import * as util from "node:util";

/**
 * Global verbose flag
 */
let isVerboseEnabled = false;

/**
 * Set the verbose mode
 */
export function setVerbose(enabled: boolean): void {
  isVerboseEnabled = enabled;
}

/**
 * Get the current verbose mode
 */
export function getVerbose(): boolean {
  return isVerboseEnabled;
}

/**
 * Log a verbose message (only when verbose mode is active)
 * Writes to stderr to avoid interfering with stdout output
 */
export function verbose(msg: string, context?: object): void {
  if (!isVerboseEnabled) return;

  const timestamp = new Date().toISOString();
  let output = `[VERBOSE ${timestamp}] ${msg}`;

  if (context) {
    output += `\n  Context: ${util.inspect(context, { depth: 2, colors: true })}`;
  }

  console.error(output);
}

/**
 * Log a warning message (always printed)
 * Writes to stderr
 */
export function warn(msg: string, context?: object): void {
  const timestamp = new Date().toISOString();
  let output = `[WARN ${timestamp}] ${msg}`;

  if (context) {
    output += `\n  Context: ${util.inspect(context, { depth: 2, colors: true })}`;
  }

  console.error(output);
}

/**
 * Log an error message (always printed)
 * Writes to stderr
 */
export function error(msg: string, err?: Error, context?: object): void {
  const timestamp = new Date().toISOString();
  let output = `[ERROR ${timestamp}] ${msg}`;

  if (err) {
    output += `\n  Error: ${err.message}`;
    if (isVerboseEnabled && err.stack) {
      output += `\n  Stack: ${err.stack}`;
    }
  }

  if (context) {
    output += `\n  Context: ${util.inspect(context, { depth: 2, colors: true })}`;
  }

  console.error(output);
}
