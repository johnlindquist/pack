/**
 * Watch mode implementation for packx
 * Uses chokidar to monitor file changes and auto-update output
 */

import chokidar from "chokidar";
import * as path from "node:path";
import type { PackerOptions } from "./types.js";
import { Packer, type PackResult } from "./packer.js";
import { formatTokenCount } from "./analysis.js";

export type WatcherCallbacks = {
  onPack: (result: PackResult) => Promise<void>;
  log: (msg: string) => void;
};

/**
 * Debounce helper to avoid rapid-fire rebuilds
 */
function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Format a timestamp for display
 */
function formatTime(): string {
  return new Date().toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Get file extensions from PackerOptions for watching
 */
function getWatchGlobs(options: PackerOptions): string[] {
  const globs: string[] = [];

  // Build globs from extensions
  for (const ext of options.extensions) {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    globs.push(`**/*.${cleanExt}`);
  }

  // Add include patterns
  for (const pattern of options.includePatterns) {
    globs.push(pattern);
  }

  // If explicit files are specified, watch those
  if (options.explicitFiles.length > 0) {
    for (const file of options.explicitFiles) {
      globs.push(file);
    }
  }

  return globs.length > 0 ? globs : ["**/*"];
}

/**
 * Watch for file changes and auto-run packing
 */
export async function startWatcher(
  options: PackerOptions,
  callbacks: WatcherCallbacks
): Promise<() => Promise<void>> {
  const { onPack, log } = callbacks;

  // Clear screen and show initial message
  log("\x1b[2J\x1b[0;0H"); // Clear screen
  log("\x1b[1m[packx]\x1b[0m Watch mode started");
  log(`\x1b[90m[${formatTime()}]\x1b[0m Watching for changes...`);
  log("");

  // Run initial pack
  const packer = new Packer(options);
  let isProcessing = false;
  let pendingRebuild = false;

  const runPack = async (trigger?: string) => {
    if (isProcessing) {
      pendingRebuild = true;
      return;
    }

    isProcessing = true;

    try {
      const startTime = Date.now();

      if (trigger) {
        log(`\x1b[90m[${formatTime()}]\x1b[0m Change detected: ${trigger}`);
      }

      // Create a fresh packer for each run
      const freshPacker = new Packer(options);
      const result = await freshPacker.pack();

      if (result.matchedFiles.length > 0) {
        await onPack(result);

        const elapsed = Date.now() - startTime;
        log(
          `\x1b[32m[${formatTime()}]\x1b[0m Packed ${result.matchedFiles.length} file(s) ` +
          `(~${formatTokenCount(result.totalTokens)} tokens) in ${elapsed}ms`
        );
      } else {
        log(`\x1b[33m[${formatTime()}]\x1b[0m No files matched criteria`);
      }
    } catch (error) {
      log(`\x1b[31m[${formatTime()}]\x1b[0m Error: ${error}`);
    } finally {
      isProcessing = false;

      // Handle queued rebuild
      if (pendingRebuild) {
        pendingRebuild = false;
        await runPack("queued changes");
      }
    }
  };

  // Initial run
  await runPack();

  // Set up the watcher
  const watchPaths = options.roots.map(r => path.resolve(r));
  const watchGlobs = getWatchGlobs(options);

  // Build ignore patterns for chokidar
  const ignorePatterns = [
    /(^|[\/\\])\../, // Dotfiles
    /node_modules/,
    /\.git/,
    ...options.excludePatterns.map(p => new RegExp(p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))),
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignored: ignorePatterns,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  // Debounced rebuild
  const debouncedRebuild = debounce((filePath: string) => {
    const relPath = path.relative(process.cwd(), filePath);
    runPack(relPath);
  }, 150);

  // Watch events
  watcher.on("change", (filePath) => {
    debouncedRebuild(filePath);
  });

  watcher.on("add", (filePath) => {
    debouncedRebuild(filePath);
  });

  watcher.on("unlink", (filePath) => {
    debouncedRebuild(filePath);
  });

  watcher.on("error", (error) => {
    log(`\x1b[31m[${formatTime()}]\x1b[0m Watcher error: ${error}`);
  });

  log(`\x1b[90m[${formatTime()}]\x1b[0m Watching: ${watchPaths.join(", ")}`);
  log(`\x1b[90mPress Ctrl+C to stop\x1b[0m\n`);

  // Return cleanup function
  return async () => {
    log(`\n\x1b[90m[${formatTime()}]\x1b[0m Stopping watcher...`);
    await watcher.close();
    log("\x1b[1m[packx]\x1b[0m Watch mode stopped");
  };
}
