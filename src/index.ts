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
import { spawn } from "node:child_process";
import { input, select, confirm } from "@inquirer/prompts";

import { printHelp } from "./cli.js";
import { resolveConfig, generatePackignore } from "./config.js";
import { formatTokenCount, getTokenWarning } from "./analysis.js";
import { treeCheckbox, type FileChoice, type InteractiveResult } from "./ui/interactive.js";
import { loadPackignore } from "./scanner.js";
import { Packer } from "./packer.js";
import { startWatcher } from "./watcher.js";
import { runExplainMode } from "./explainer.js";
import { setVerbose, error as logError } from "./logger.js";
import { loadBundles, calculateBundleStats, getBundleFileIndices, saveBundle } from "./bundles.js";

const VERSION = "4.0.0";

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const platform = process.platform;
    let copyProc;

    if (platform === 'darwin') {
      copyProc = spawn('pbcopy');
    } else if (platform === 'win32') {
      copyProc = spawn('clip');
    } else {
      copyProc = spawn('xclip', ['-selection', 'clipboard']);
    }

    copyProc.stdin.write(text);
    copyProc.stdin.end();

    return new Promise((resolve) => {
      copyProc.on('exit', (code) => resolve(code === 0));
      copyProc.on('error', () => resolve(false));
    });
  } catch {
    return false;
  }
}

/**
 * Print pack summary
 */
function printSummary(
  result: { files: any[]; totalTokens: number; totalChars: number; totalMatchCount: number; totalWindowCount: number; matchedFiles: string[]; usedRipgrep?: boolean },
  options: { contextLines?: number; toStdout: boolean; outputFile?: string }
) {
  const log = (msg: string) => (options.toStdout ? console.error(msg) : console.log(msg));

  log(`\n📊 Pack Summary:`);
  log(`────────────────`);
  log(`  Total Files: ${result.matchedFiles.length} files`);
  if (result.usedRipgrep !== undefined) {
    log(`  Search Mode: ${result.usedRipgrep ? 'ripgrep (fast)' : 'glob (fallback)'}`);
  }
  if (options.contextLines) {
    log(`  Context Lines: ${options.contextLines} around each match`);
    log(`  Total Matches: ${result.totalMatchCount} matches`);
    log(`  Context Windows: ${result.totalWindowCount} windows`);
  }
  log(`  Total Tokens: ~${formatTokenCount(result.totalTokens)} (${result.totalTokens.toLocaleString()} exact)`);
  log(`  Total Chars: ${result.totalChars.toLocaleString()} chars`);
  log(`       Output: ${options.toStdout ? '-' : (options.outputFile ?? 'none')}`);

  const warning = getTokenWarning(result.totalTokens);
  if (warning) {
    log(`\n${warning}`);
  }

  // Get unique extensions
  const extensions = new Set<string>();
  for (const file of result.matchedFiles) {
    const ext = path.extname(file).toLowerCase();
    if (ext) extensions.add(ext);
  }

  if (extensions.size > 0) {
    const sortedExtensions = Array.from(extensions).sort();
    log(`\n📁 Extensions Found:`);
    log(`────────────────────`);
    log(`  ${sortedExtensions.join(', ')}`);
  }

  if (result.files.length > 0) {
    const topFiles = [...result.files]
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

async function main() {
  // Resolve configuration
  const { options, parsed, shouldExit } = await resolveConfig(process.argv.slice(2));

  // Initialize logger with verbose flag
  setVerbose(options.verbose);

  // Handle early exits
  if (shouldExit === 'help') {
    printHelp();
    process.exit(0);
  }
  if (shouldExit === 'version') {
    console.log(`packx v${VERSION}`);
    process.exit(0);
  }

  // Handle explain mode (dry run with detailed logging)
  if (options.explainMode) {
    await runExplainMode(options);
    process.exit(0);
  }

  // Create packer
  const packer = new Packer(options);
  const log = (msg: string) => (options.toStdout ? console.error(msg) : console.log(msg));

  // Log git mode
  if (options.gitMode === 'staged') {
    log("🔍 Finding staged files...");
  } else if (options.gitMode === 'dirty') {
    log("🔍 Finding modified and untracked files...");
  } else if (options.gitMode === 'diff') {
    log("🔍 Finding files changed vs main branch...");
  }

  // For interactive mode, we need to get candidates first
  // Disable interactive if --stdout is used (for piping)
  if (options.interactive && process.stdin.isTTY && !options.toStdout) {
    // Use packer to discover files (but not process them yet)
    // Temporarily disable packignore to show all files (they'll start unselected)
    const tempPacker = new Packer({ ...options, interactive: false, usePackignore: false });
    const tempResult = await tempPacker.pack();

    if (tempResult.matchedFiles.length === 0) {
      console.warn("⚠️  No files found matching criteria.");
      process.exit(2);
    }

    log(`\n🎯 Interactive mode: Analyzing ${tempResult.matchedFiles.length} files for token counts...\n`);

    try {
      // Analyze files for token counts
      const analysisResults = await packer.analyzeForInteractive(tempResult.matchedFiles);

      const fileChoices: FileChoice[] = analysisResults.map(r => ({
        path: r.path,
        relPath: r.relPath,
        tokens: r.tokens,
        ext: r.ext,
      }));

      // ---------------------------------------------------------
      // Bundle Selection Dashboard
      // ---------------------------------------------------------
      const bundles = await loadBundles(process.cwd());
      let initialSelectedIndices: Set<number> | undefined;
      let activeBundleName: string | null = null;

      if (bundles.length > 0) {
        // Calculate stats for bundles against current file candidates
        const stats = calculateBundleStats(bundles, fileChoices);
        const validBundles = stats.filter(s => s.matchCount > 0);

        const totalTokens = analysisResults.reduce((sum, f) => sum + f.tokens, 0);

        if (validBundles.length > 0) {
          const selection = await select({
            message: 'Choose starting point:',
            choices: [
              {
                name: `🆕 Start from Scratch (All ${analysisResults.length} files, ${formatTokenCount(totalTokens)})`,
                value: 'scratch',
              },
              ...validBundles.map(b => {
                const bundle = bundles.find(bn => bn.name === b.name)!;
                return {
                  name: `📦 ${b.name} (${b.matchCount} files, ${formatTokenCount(b.tokenCount)})`,
                  value: b.name,
                };
              })
            ]
          });

          if (selection !== 'scratch') {
            const selectedBundle = bundles.find(b => b.name === selection);
            if (selectedBundle) {
              initialSelectedIndices = getBundleFileIndices(selectedBundle, fileChoices);
              activeBundleName = selectedBundle.name;
              log(`\n✅ Loaded bundle "${selectedBundle.name}" (${initialSelectedIndices.size} files selected)`);
            }
          }
        }
      }
      // ---------------------------------------------------------

      // Load packignore patterns to determine which files start unselected
      // Only apply packignore if no bundle was selected
      const packignoreIndices = new Set<number>();
      if (options.usePackignore && !initialSelectedIndices) {
        const packignore = await loadPackignore(options.roots[0] || '.');
        for (let i = 0; i < fileChoices.length; i++) {
          if (packignore.ignores(fileChoices[i].relPath)) {
            packignoreIndices.add(i);
          }
        }
        if (packignoreIndices.size > 0) {
          log(`📋 .packignore: ${packignoreIndices.size} files will start unselected\n`);
        }
      }

      // Get the search pattern for preview highlighting
      const searchPattern = packer.getPattern();

      const result = await treeCheckbox({
        message: activeBundleName ? `Refine bundle "${activeBundleName}":` : "Select files to bundle:",
        files: fileChoices,
        pageSize: 20,
        showPreview: true,
        searchPattern,
        contextLines: options.contextLines,
        packignoreIndices,
        initialSelectedIndices,
      });

      const selected = result.selectedPaths;
      const globPattern = result.globPattern;

      if (selected.length === 0) {
        console.log("\n⚠️  No files selected. Exiting.");
        process.exit(0);
      }

      // Calculate selected token total
      const tokenMap = new Map(analysisResults.map(r => [r.path, r.tokens]));
      const selectedTokens = selected.reduce((sum, file) => sum + (tokenMap.get(file) || 0), 0);
      log(`\n✅ Selected ${selected.length} file(s) — ${formatTokenCount(selectedTokens)} tokens\n`);

      // Determine unselected files for potential .packignore update
      const selectedSet = new Set(selected);
      const unselectedFiles = fileChoices.filter(f => !selectedSet.has(f.path));

      // Offer to save glob pattern to .packignore if one was used
      if (globPattern) {
        const saveGlobToPackignore = await confirm({
          message: `Save glob pattern "${globPattern}" to .packignore?`,
          default: false,
        });

        if (saveGlobToPackignore) {
          const packignorePath = path.join(process.cwd(), '.packignore');
          const patternContent = `\n# Added from interactive filter\n${globPattern}\n`;

          try {
            await fs.access(packignorePath);
            // File exists, append
            await fs.appendFile(packignorePath, patternContent, 'utf8');
            log(`\n📝 Added pattern to: ${packignorePath}`);
          } catch {
            // File doesn't exist, create
            await fs.writeFile(packignorePath, `# Pack exclusions\n${globPattern}\n`, 'utf8');
            log(`\n📝 Created: ${packignorePath}`);
          }
        }
      } else if (unselectedFiles.length > 0) {
        // Offer to save unselected files to .packignore
        const saveToPackignore = await confirm({
          message: `Save ${unselectedFiles.length} excluded file(s) to .packignore?`,
          default: false,
        });

        if (saveToPackignore) {
          const packignorePath = path.join(process.cwd(), '.packignore');
          const excludedPaths = unselectedFiles.map(f => f.path);
          const packignoreContent = generatePackignore(excludedPaths, process.cwd());

          // Append to existing .packignore or create new one
          try {
            await fs.access(packignorePath);
            // File exists, append
            await fs.appendFile(packignorePath, '\n' + packignoreContent, 'utf8');
            log(`\n📝 Appended to: ${packignorePath}`);
          } catch {
            // File doesn't exist, create
            await fs.writeFile(packignorePath, packignoreContent, 'utf8');
            log(`\n📝 Created: ${packignorePath}`);
          }
        }
      }

      // Ask for output destination
      let outputChoice = await select({
        message: 'Output destination:',
        choices: [
          { name: '📋 Copy to clipboard', value: 'clipboard' },
          { name: '📄 Write to file', value: 'file' },
          { name: '💾 Save selection as Bundle', value: 'save_bundle' },
          { name: '🖥️  Print to stdout', value: 'stdout' },
          { name: '⏭️  Skip output', value: 'skip' },
        ],
      });

      // Handle Save Bundle workflow
      if (outputChoice === 'save_bundle') {
        const bundleName = await input({
          message: 'Bundle Name:',
          validate: (v) => v.length > 0 ? true : "Name required"
        });
        const cwd = process.cwd();
        const relativePaths = selected.map(p => path.relative(cwd, p));

        const savedPath = await saveBundle(cwd, bundleName, relativePaths);
        log(`\n✅ Bundle saved to ${savedPath}`);

        // Re-prompt for output after saving
        outputChoice = await select({
          message: 'Output destination:',
          choices: [
            { name: '📋 Copy to clipboard', value: 'clipboard' },
            { name: '📄 Write to file', value: 'file' },
            { name: '🖥️  Print to stdout', value: 'stdout' },
            { name: '⏭️  Skip output', value: 'skip' },
          ],
        });
      }

      if (outputChoice === 'skip') {
        log('\n✅ Selection complete. No output generated.');
        process.exit(0);
      }

      // Get output file path if needed
      let outputFile = options.outputFile;
      if (outputChoice === 'file') {
        outputFile = await input({
          message: 'Output file path:',
          default: 'packed.xml',
        });
      }

      // Create new packer with only selected files
      const selectedOptions = { ...options, explicitFiles: selected, interactive: false };
      const finalPacker = new Packer(selectedOptions);
      const packResult = await finalPacker.pack();

      // Handle output based on user choice
      const outputOptions = {
        ...options,
        toStdout: outputChoice === 'stdout',
        outputFile: outputChoice === 'file' ? outputFile : undefined,
        copyToClipboard: outputChoice === 'clipboard',
      };
      await handleOutput(packResult, outputOptions, log);

    } catch (error: any) {
      if (error.name === "ExitPromptError") {
        console.log("\n⚠️  Selection cancelled.");
        process.exit(0);
      }
      throw error;
    }
  } else if (options.watch) {
    // Watch mode
    if (options.interactive) {
      console.error("Watch mode is not compatible with interactive mode.");
      process.exit(1);
    }

    // Create output handler for watch mode
    const watchOutputHandler = async (result: { output: string; files: any[]; totalTokens: number; totalChars: number; totalMatchCount: number; totalWindowCount: number; matchedFiles: string[] }) => {
      // In watch mode, always write to output file (if specified)
      if (options.outputFile) {
        await fs.writeFile(options.outputFile, result.output, 'utf8');
      }

      // Handle clipboard in watch mode
      if (options.copyToClipboard) {
        await copyToClipboard(result.output);
      }
    };

    // Set up graceful shutdown
    let cleanup: (() => Promise<void>) | null = null;

    const shutdown = async () => {
      if (cleanup) {
        await cleanup();
      }
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Validate that we have an output destination
    if (!options.outputFile && !options.copyToClipboard) {
      console.warn("Watch mode requires --output or --copy flag to be useful.");
      console.warn("Use: packx --watch -o output.xml");
      console.warn("  or: packx --watch --copy");
      process.exit(1);
    }

    // Start the watcher
    cleanup = await startWatcher(options, {
      onPack: watchOutputHandler,
      log: (msg: string) => console.log(msg),
    });

    // Keep the process running
    await new Promise(() => {});
  } else {
    // Non-interactive mode
    const result = await packer.pack();

    if (result.matchedFiles.length === 0) {
      if (result.candidatesFound === 0) {
        console.warn("⚠️  No files found matching criteria.");
        process.exit(2);
      } else {
        console.warn("⚠️  No files matched the search criteria.");
        process.exit(3);
      }
    }

    // Preview mode
    if (options.previewOnly) {
      console.log("Matched files (sample):");
      const sampleCount = Math.min(result.matchedFiles.length, 50);
      for (const m of result.matchedFiles.slice(0, sampleCount)) console.log(m);
      if (result.matchedFiles.length > sampleCount) {
        console.log(`... and ${result.matchedFiles.length - sampleCount} more`);
      }
      console.log(`\nTotal: ${result.matchedFiles.length} file(s).`);
      process.exit(0);
    }

    // Handle output
    await handleOutput(result, options, log);
  }
}

/**
 * Handle output: write to file, stdout, or clipboard
 */
async function handleOutput(
  result: { output: string; files: any[]; totalTokens: number; totalChars: number; totalMatchCount: number; totalWindowCount: number; matchedFiles: string[]; usedRipgrep?: boolean; chunks?: any[]; skippedFiles?: Array<{ path: string; reason: 'oversized'; tokens: number }> },
  options: { toStdout: boolean; outputFile?: string; copyToClipboard: boolean; contextLines?: number; maxTokens?: number },
  log: (msg: string) => void
) {
  const summaryOnly = !options.toStdout && !options.outputFile && !options.copyToClipboard;

  // Print warning for skipped files (to stderr)
  if (result.skippedFiles && result.skippedFiles.length > 0) {
    const errorLog = (msg: string) => console.error(msg);
    errorLog(`\n⚠️  Skipped ${result.skippedFiles.length} file(s) exceeding token limit:`);
    for (const skipped of result.skippedFiles) {
      errorLog(`   ${skipped.path} (${skipped.tokens.toLocaleString()} tokens)`);
    }
    errorLog('');
  }

  log(`🧩 Packing ${result.matchedFiles.length} file(s)...`);

  if (options.contextLines) {
    log(`📝 Extracting ${options.contextLines} lines of context around matches...`);
  } else {
    const cwd = process.cwd();
    const relativePaths = result.matchedFiles.map(p => path.relative(cwd, p));
    log(`📝 Files selected:`);
    relativePaths.slice(0, 10).forEach(p => log(`  • ${p}`));
    if (relativePaths.length > 10) {
      log(`  ... and ${relativePaths.length - 10} more`);
    }
  }

  // Handle chunked output
  if (result.chunks && result.chunks.length > 1) {
    log(`\n📦 Output split into ${result.chunks.length} chunks (max ${options.maxTokens} tokens each)`);

    if (options.toStdout) {
      // For stdout, output all chunks with separators
      for (const chunk of result.chunks) {
        process.stdout.write(`\n${'='.repeat(60)}\n`);
        process.stdout.write(`CHUNK ${chunk.chunkNumber} of ${chunk.totalChunks}\n`);
        process.stdout.write(`${'='.repeat(60)}\n\n`);
        process.stdout.write(chunk.output);
      }
    } else if (options.outputFile && !summaryOnly) {
      // Write multiple files: output-1.xml, output-2.xml, etc.
      const ext = path.extname(options.outputFile);
      const base = options.outputFile.slice(0, -ext.length);

      const writtenFiles: string[] = [];
      for (const chunk of result.chunks) {
        const chunkFile = `${base}-${chunk.chunkNumber}${ext}`;
        await fs.writeFile(chunkFile, chunk.output, 'utf8');
        writtenFiles.push(chunkFile);
      }

      console.log(`\n✅ Successfully packed ${result.matchedFiles.length} file(s) into ${result.chunks.length} chunks:`);
      for (const file of writtenFiles) {
        console.log(`   📄 ${file}`);
      }
    }

    // Handle clipboard for chunked output (copy first chunk only with warning)
    if (options.copyToClipboard && !options.toStdout) {
      const success = await copyToClipboard(result.chunks[0].output);
      if (success) {
        console.log(`📋 Copied chunk 1 of ${result.chunks.length} to clipboard (use output files for all chunks)`);
      } else {
        console.log('⚠️  Could not copy to clipboard');
      }
    }

    // Print chunk summary
    log(`\n📊 Chunk Summary:`);
    log(`────────────────`);
    for (const chunk of result.chunks) {
      log(`  Chunk ${chunk.chunkNumber}: ${formatTokenCount(chunk.tokens)} tokens, ${chunk.files.length} files`);
    }
  } else {
    // Standard single output
    if (options.toStdout) {
      process.stdout.write(result.output);
    } else if (options.outputFile && !summaryOnly) {
      await fs.writeFile(options.outputFile, result.output, 'utf8');
      console.log(`\n✅ Successfully packed ${result.matchedFiles.length} file(s) to ${options.outputFile}`);
    }

    // Handle clipboard
    if (options.copyToClipboard && !options.toStdout) {
      const success = await copyToClipboard(result.output);
      if (success) {
        console.log('📋 Copied to clipboard!');
      } else {
        console.log('⚠️  Could not copy to clipboard');
      }
    }
  }

  // Print summary
  printSummary(result, options);
}

main().catch((err) => {
  logError("Unexpected error during execution", err);
  console.error("\nAn unexpected error occurred. Run with --verbose for detailed error information.");
  process.exit(99);
});
