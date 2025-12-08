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
import { spawn } from "node:child_process";
import { input } from "@inquirer/prompts";

import { printHelp } from "./cli.js";
import { resolveConfig, createConfigTemplate, generateIniConfig } from "./config.js";
import { formatTokenCount, getTokenWarning } from "./analysis.js";
import { normalizeStrings } from "./utils.js";
import { treeCheckbox, type FileChoice } from "./ui/interactive.js";
import { Packer } from "./packer.js";

const VERSION = "4.0.0";

/**
 * Write config template to file with directory creation
 */
async function writeConfigTemplate(filename: string) {
  const template = createConfigTemplate();

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
  result: { files: any[]; totalTokens: number; totalChars: number; totalMatchCount: number; totalWindowCount: number; matchedFiles: string[] },
  options: { contextLines?: number; toStdout: boolean; outputFile?: string }
) {
  const log = (msg: string) => (options.toStdout ? console.error(msg) : console.log(msg));

  log(`\n📊 Pack Summary:`);
  log(`────────────────`);
  log(`  Total Files: ${result.matchedFiles.length} files`);
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
  // Check for init command first
  if (process.argv[2] === 'init') {
    let filename = process.argv[3] || 'pack-config.ini';
    if (filename && !path.extname(filename)) {
      filename = `${filename}.ini`;
    }
    await writeConfigTemplate(filename);
    process.exit(0);
  }

  // Resolve configuration
  const { options, parsed, shouldExit } = await resolveConfig(process.argv.slice(2));

  // Handle early exits
  if (shouldExit === 'help') {
    printHelp();
    process.exit(0);
  }
  if (shouldExit === 'version') {
    console.log(`packx v${VERSION}`);
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
  if (options.interactive && process.stdin.isTTY) {
    // Use packer to discover files (but not process them yet)
    const tempPacker = new Packer({ ...options, interactive: false });
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
      const tokenMap = new Map(analysisResults.map(r => [r.path, r.tokens]));
      const selectedTokens = selected.reduce((sum, file) => sum + (tokenMap.get(file) || 0), 0);
      log(`\n✅ Selected ${selected.length} file(s) — ${formatTokenCount(selectedTokens)} tokens\n`);

      // Ask about saving .ini config
      const configFilename = await input({
        message: "Save as .ini config (clear to skip):",
        default: "pack-config.ini",
      });

      if (configFilename && configFilename.trim()) {
        let filename = configFilename.trim();
        if (!filename.endsWith('.ini')) {
          filename += '.ini';
        }
        const searchStrings = normalizeStrings(parsed.strings).concat(normalizeStrings(parsed.s)).filter(Boolean);
        const excludePatterns = normalizeStrings(parsed.exclude).concat(normalizeStrings(parsed.x)).filter(Boolean);
        const configContent = generateIniConfig(selected, process.cwd(), {
          searchStrings: searchStrings.length > 0 ? searchStrings : undefined,
          excludePatterns: excludePatterns.length > 0 ? excludePatterns : undefined,
        });
        const configPath = path.join(process.cwd(), filename);
        await fs.writeFile(configPath, configContent, "utf8");
        log(`\n💾 Saved config to: ${configPath}`);
        log(`   Run again with: packx -f ${filename}\n`);
      }

      // Create new packer with only selected files
      const selectedOptions = { ...options, explicitFiles: selected, interactive: false };
      const finalPacker = new Packer(selectedOptions);
      const result = await finalPacker.pack();

      // Handle output
      await handleOutput(result, options, log);

    } catch (error: any) {
      if (error.name === "ExitPromptError") {
        console.log("\n⚠️  Selection cancelled.");
        process.exit(0);
      }
      throw error;
    }
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
  result: { output: string; files: any[]; totalTokens: number; totalChars: number; totalMatchCount: number; totalWindowCount: number; matchedFiles: string[]; chunks?: any[] },
  options: { toStdout: boolean; outputFile?: string; copyToClipboard: boolean; contextLines?: number; maxTokens?: number },
  log: (msg: string) => void
) {
  const summaryOnly = !options.toStdout && !options.outputFile && !options.copyToClipboard;

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
  console.error("Unexpected error:", err);
  process.exit(99);
});
