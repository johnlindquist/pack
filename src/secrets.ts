/**
 * Secret detection and redaction for packx
 * Scans content for potential secrets and PII, replacing them with redaction markers
 */

import type { TransformRule } from "./types.js";

/**
 * Types of secrets that can be detected
 */
export type SecretType =
  | "AWS_ACCESS_KEY"
  | "AWS_SECRET_KEY"
  | "GITHUB_TOKEN"
  | "OPENAI_KEY"
  | "STRIPE_KEY"
  | "STRIPE_SECRET"
  | "PRIVATE_KEY"
  | "JWT"
  | "CONNECTION_STRING"
  | "GENERIC_SECRET"
  | "GENERIC_API_KEY"
  | "ENV_SECRET"
  | "PASSWORD"
  | "BEARER_TOKEN"
  | "BASIC_AUTH"
  | "SLACK_TOKEN"
  | "DISCORD_TOKEN"
  | "SENDGRID_KEY"
  | "TWILIO_KEY"
  | "GOOGLE_API_KEY"
  | "AZURE_KEY"
  | "HEROKU_KEY"
  | "NPM_TOKEN";

/**
 * A detected secret with its type and location
 */
export type DetectedSecret = {
  type: SecretType;
  match: string;
  line: number;
  column: number;
  redactedValue: string;
};

/**
 * Redaction report summarizing what was found and redacted
 */
export type RedactionReport = {
  totalSecrets: number;
  byType: Record<SecretType, number>;
  files: Map<string, DetectedSecret[]>;
};

/**
 * Secret detection patterns
 * Each pattern is designed to match specific secret formats with high precision
 */
export const SECRET_PATTERNS: Record<SecretType, RegExp> = {
  // AWS Access Key IDs always start with AKIA
  AWS_ACCESS_KEY: /\bAKIA[0-9A-Z]{16}\b/g,

  // AWS Secret Keys are 40 character base64-ish strings
  // Only match when near AWS-related context to reduce false positives
  AWS_SECRET_KEY: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY|secret_?key)\s*[=:]\s*['"]?([A-Za-z0-9/+=]{40})['"]?/gi,

  // GitHub tokens: ghp_ (personal), gho_ (OAuth), ghu_ (user-to-server), ghs_ (server-to-server), ghr_ (refresh)
  GITHUB_TOKEN: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g,

  // OpenAI API keys start with sk-
  OPENAI_KEY: /\bsk-[A-Za-z0-9]{32,}T3BlbkFJ[A-Za-z0-9]{20,}\b/g,

  // Stripe live/test keys
  STRIPE_KEY: /\bsk_live_[A-Za-z0-9]{24,}\b/g,
  STRIPE_SECRET: /\bsk_test_[A-Za-z0-9]{24,}\b/g,

  // Private keys (RSA, EC, DSA, OPENSSH, PGP)
  PRIVATE_KEY: /-----BEGIN\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----[\s\S]*?-----END\s+(?:RSA\s+|EC\s+|DSA\s+|OPENSSH\s+|PGP\s+)?PRIVATE\s+KEY(?:\s+BLOCK)?-----/g,

  // JWT tokens (three base64url parts separated by dots)
  JWT: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\b/g,

  // Database connection strings
  CONNECTION_STRING: /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|rediss|amqp|amqps):\/\/[^\s'"<>]+/gi,

  // Generic high-entropy strings in quotes (potential secrets) - 32+ chars
  GENERIC_SECRET: /(['"])(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])[A-Za-z0-9+/=_-]{32,}\1/g,

  // Generic API key patterns
  GENERIC_API_KEY: /\b(?:api[_-]?key|apikey|api[_-]?secret)\s*[=:]\s*['"]?([A-Za-z0-9_-]{20,})['"]?/gi,

  // Environment variable secret patterns
  ENV_SECRET: /\b(?:SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|PRIVATE)[A-Z_]*\s*[=:]\s*['"]?([^\s'"]{8,})['"]?/gi,

  // Password patterns in config/code
  PASSWORD: /\b(?:password|passwd|pwd)\s*[=:]\s*['"]([^'"]{4,})['"]?/gi,

  // Bearer tokens
  BEARER_TOKEN: /\bBearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?\b/gi,

  // Basic auth credentials
  BASIC_AUTH: /\bBasic\s+[A-Za-z0-9+/=]{20,}\b/gi,

  // Slack tokens
  SLACK_TOKEN: /\bxox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}\b/g,

  // Discord tokens
  DISCORD_TOKEN: /\b[MN][A-Za-z0-9]{23,}\.[A-Za-z0-9-_]{6}\.[A-Za-z0-9-_]{27}\b/g,

  // SendGrid API keys
  SENDGRID_KEY: /\bSG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{40,}\b/g,

  // Twilio API keys
  TWILIO_KEY: /\bSK[a-f0-9]{32}\b/g,

  // Google API keys
  GOOGLE_API_KEY: /\bAIza[A-Za-z0-9_-]{35}\b/g,

  // Azure keys
  AZURE_KEY: /\b[A-Za-z0-9/+]{86}==\b/g,

  // Heroku API keys
  HEROKU_KEY: /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/g,

  // NPM tokens
  NPM_TOKEN: /\bnpm_[A-Za-z0-9]{36}\b/g,
};

/**
 * Create a redaction marker for a given secret type
 */
export function createRedactionMarker(type: SecretType): string {
  return `<REDACTED:${type}>`;
}

/**
 * Patterns ordered by specificity - more specific patterns first
 * This ensures we match specific secret types before generic patterns
 */
const ORDERED_PATTERN_KEYS: SecretType[] = [
  // Most specific patterns first
  "AWS_ACCESS_KEY",
  "GITHUB_TOKEN",
  "OPENAI_KEY",
  "STRIPE_KEY",
  "STRIPE_SECRET",
  "SLACK_TOKEN",
  "DISCORD_TOKEN",
  "SENDGRID_KEY",
  "TWILIO_KEY",
  "GOOGLE_API_KEY",
  "NPM_TOKEN",
  "HEROKU_KEY",
  "AZURE_KEY",
  "PRIVATE_KEY",
  "JWT",
  "CONNECTION_STRING",
  "AWS_SECRET_KEY",
  "BEARER_TOKEN",
  "BASIC_AUTH",
  // Generic patterns last (to avoid masking specific patterns)
  "GENERIC_API_KEY",
  "PASSWORD",
  "ENV_SECRET",
  "GENERIC_SECRET",
];

/**
 * Detect secrets in content and return their locations
 */
export function detectSecrets(content: string): DetectedSecret[] {
  const detected: DetectedSecret[] = [];
  // Track which character positions have already been matched
  const matchedRanges: Array<{ start: number; end: number }> = [];

  const isOverlapping = (start: number, end: number): boolean => {
    return matchedRanges.some(
      (range) =>
        (start >= range.start && start < range.end) ||
        (end > range.start && end <= range.end) ||
        (start <= range.start && end >= range.end)
    );
  };

  // Process patterns in order of specificity
  for (const type of ORDERED_PATTERN_KEYS) {
    const pattern = SECRET_PATTERNS[type];
    if (!pattern) continue;

    // Reset pattern state
    const regex = new RegExp(pattern.source, pattern.flags);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const matchStart = match.index;
      const matchEnd = match.index + match[0].length;

      // Skip if this range overlaps with an already matched range
      if (isOverlapping(matchStart, matchEnd)) {
        // Prevent infinite loop for zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
        continue;
      }

      // Calculate line and column
      const beforeMatch = content.slice(0, match.index);
      const linesBefore = beforeMatch.split("\n");
      const line = linesBefore.length;
      const column = linesBefore[linesBefore.length - 1].length;

      // Get the actual secret value (might be in a capture group)
      const secretValue = match[1] || match[0];

      detected.push({
        type,
        match: secretValue,
        line,
        column,
        redactedValue: createRedactionMarker(type),
      });

      // Mark this range as matched
      matchedRanges.push({ start: matchStart, end: matchEnd });

      // Prevent infinite loop for zero-length matches
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  // Sort by position (line, then column)
  detected.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.column - b.column;
  });

  return detected;
}

/**
 * Redact secrets in content, replacing them with redaction markers
 */
export function redactSecrets(content: string): { content: string; detected: DetectedSecret[] } {
  const detected = detectSecrets(content);

  if (detected.length === 0) {
    return { content, detected };
  }

  let redactedContent = content;

  // Process in reverse order to preserve positions
  const sortedByPosition = [...detected].sort((a, b) => {
    // Sort by match start position in reverse
    const posA = getMatchPosition(content, a.match);
    const posB = getMatchPosition(content, b.match);
    return posB - posA;
  });

  for (const secret of sortedByPosition) {
    // Replace all occurrences of this exact match
    redactedContent = redactedContent.split(secret.match).join(secret.redactedValue);
  }

  return { content: redactedContent, detected };
}

/**
 * Get the position of a match in content
 */
function getMatchPosition(content: string, match: string): number {
  return content.indexOf(match);
}

/**
 * Create TransformRule array for secret redaction
 * This integrates with the existing transform pipeline
 */
export function createSecretTransforms(): TransformRule[] {
  const transforms: TransformRule[] = [];

  for (const [type, pattern] of Object.entries(SECRET_PATTERNS) as [SecretType, RegExp][]) {
    transforms.push({
      pattern: new RegExp(pattern.source, pattern.flags),
      replacement: createRedactionMarker(type as SecretType),
    });
  }

  return transforms;
}

/**
 * Create a redaction report from detected secrets across files
 */
export function createRedactionReport(
  fileSecrets: Map<string, DetectedSecret[]>
): RedactionReport {
  const byType: Record<string, number> = {};
  let totalSecrets = 0;

  for (const secrets of fileSecrets.values()) {
    for (const secret of secrets) {
      byType[secret.type] = (byType[secret.type] || 0) + 1;
      totalSecrets++;
    }
  }

  return {
    totalSecrets,
    byType: byType as Record<SecretType, number>,
    files: fileSecrets,
  };
}

/**
 * Format a redaction report for display
 */
export function formatRedactionReport(report: RedactionReport): string {
  if (report.totalSecrets === 0) {
    return "No secrets detected.";
  }

  const lines: string[] = [
    `\n${"=".repeat(60)}`,
    "SECRET REDACTION REPORT",
    `${"=".repeat(60)}`,
    "",
    `Total secrets redacted: ${report.totalSecrets}`,
    "",
    "By type:",
  ];

  // Sort by count descending
  const sortedTypes = Object.entries(report.byType)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [type, count] of sortedTypes) {
    lines.push(`  ${type}: ${count}`);
  }

  if (report.files.size > 0) {
    lines.push("");
    lines.push("By file:");

    for (const [file, secrets] of report.files) {
      if (secrets.length > 0) {
        lines.push(`  ${file}: ${secrets.length} secret(s)`);
        // Group by type for this file
        const fileByType: Record<string, number> = {};
        for (const s of secrets) {
          fileByType[s.type] = (fileByType[s.type] || 0) + 1;
        }
        for (const [type, count] of Object.entries(fileByType)) {
          lines.push(`    - ${type}: ${count}`);
        }
      }
    }
  }

  lines.push(`${"=".repeat(60)}\n`);

  return lines.join("\n");
}

/**
 * Check if content likely contains secrets (quick check)
 * Used for pre-filtering before full detection
 */
export function mightContainSecrets(content: string): boolean {
  // Quick heuristics for common secret indicators
  const quickPatterns = [
    /AKIA[0-9A-Z]/,
    /gh[pousr]_/,
    /sk-[A-Za-z0-9]/,
    /sk_live_/,
    /sk_test_/,
    /-----BEGIN.*PRIVATE KEY/,
    /eyJ[A-Za-z0-9_-]*\.eyJ/,
    /mongodb(\+srv)?:\/\//i,
    /postgres(ql)?:\/\//i,
    /mysql:\/\//i,
    /redis:\/\//i,
    /api[_-]?key\s*[=:]/i,
    /password\s*[=:]/i,
    /Bearer\s+[A-Za-z0-9]/i,
    /Basic\s+[A-Za-z0-9]/i,
    /xox[baprs]-/,
    /SG\.[A-Za-z0-9]/,
    /AIza[A-Za-z0-9]/,
    /npm_[A-Za-z0-9]/,
  ];

  return quickPatterns.some((p) => p.test(content));
}
