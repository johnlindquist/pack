/**
 * E2E test helpers for running packx CLI as a child process
 */

import { spawn } from "node:child_process";
import * as path from "node:path";

export interface CLIResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface CLIOptions {
  cwd?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * Execute the packx CLI as a child process and capture output
 *
 * @param args - Command line arguments to pass to packx
 * @param options - Execution options (cwd, timeout, env)
 * @returns Promise with stdout, stderr, and exit code
 */
export async function runCLI(args: string[], options: CLIOptions = {}): Promise<CLIResult> {
  const CLI_PATH = path.join(process.cwd(), "src/index.ts");
  const timeout = options.timeout || 30000; // 30 second default timeout

  return new Promise((resolve, reject) => {
    const proc = spawn("bun", ["run", CLI_PATH, ...args], {
      cwd: options.cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...options.env },
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    // Set up timeout
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeout);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error(`CLI process timed out after ${timeout}ms`));
      } else {
        resolve({
          stdout,
          stderr,
          code: code || 0,
        });
      }
    });

    proc.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * Get the absolute path to a test fixture directory
 *
 * @param fixtureName - Name of the fixture (e.g., 'simple-project', 'git-project')
 * @returns Absolute path to the fixture directory
 */
export function getFixturePath(fixtureName: string): string {
  return path.join(process.cwd(), "test", "fixtures", fixtureName);
}
