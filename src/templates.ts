/**
 * Template system for reusable prompts
 * Supports local (.packx/templates/) and global (~/.packx/templates/) templates
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { BUILTIN_TEMPLATES } from "./builtin-templates/index.js";

// ============================================================================
// Types
// ============================================================================

export interface Template {
  name: string;
  description?: string;
  extends?: string;
  variables?: Record<string, string>;
  content: string;
  source: 'builtin' | 'global' | 'local';
  path?: string;
}

export interface TemplateContext {
  filename?: string;
  language?: string;
  date?: string;
  [key: string]: string | undefined;
}

// ============================================================================
// Template Directory Paths
// ============================================================================

function getLocalTemplateDir(cwd: string = process.cwd()): string {
  return path.join(cwd, '.packx', 'templates');
}

function getGlobalTemplateDir(): string {
  return path.join(homedir(), '.packx', 'templates');
}

// ============================================================================
// Template Parsing
// ============================================================================

/**
 * Parse frontmatter from a template file
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];

  const frontmatter: Record<string, any> = {};
  const lines = frontmatterStr.split('\n');
  let inVariables = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'variables:') {
      inVariables = true;
      frontmatter.variables = {};
      continue;
    }

    if (inVariables && line.startsWith('  ')) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        frontmatter.variables[key] = value;
      }
      continue;
    } else if (inVariables && !line.startsWith('  ')) {
      inVariables = false;
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      frontmatter[key] = value;
    }
  }

  return { frontmatter, body };
}

/**
 * Load a template from a file
 */
async function loadTemplateFromFile(filePath: string, source: 'global' | 'local'): Promise<Template | null> {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const { frontmatter, body } = parseFrontmatter(content);
    const name = frontmatter.name || path.basename(filePath, path.extname(filePath));

    return {
      name,
      description: frontmatter.description,
      extends: frontmatter.extends,
      variables: frontmatter.variables,
      content: body.trim(),
      source,
      path: filePath,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Template Loading
// ============================================================================

async function loadTemplatesFromDir(dir: string, source: 'global' | 'local'): Promise<Template[]> {
  const templates: Template[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
        const filePath = path.join(dir, entry.name);
        const template = await loadTemplateFromFile(filePath, source);
        if (template) {
          templates.push(template);
        }
      }
    }
  } catch {
    // Directory doesn't exist or isn't readable
  }

  return templates;
}

/**
 * Load a specific template by name
 * Search order: local -> global -> builtin
 */
export async function loadTemplate(name: string, cwd: string = process.cwd()): Promise<Template | null> {
  const localDir = getLocalTemplateDir(cwd);
  const localTemplate = await loadTemplateFromFile(path.join(localDir, `${name}.md`), 'local')
    || await loadTemplateFromFile(path.join(localDir, `${name}.txt`), 'local');
  if (localTemplate) return localTemplate;

  const globalDir = getGlobalTemplateDir();
  const globalTemplate = await loadTemplateFromFile(path.join(globalDir, `${name}.md`), 'global')
    || await loadTemplateFromFile(path.join(globalDir, `${name}.txt`), 'global');
  if (globalTemplate) return globalTemplate;

  const builtin = BUILTIN_TEMPLATES[name];
  if (builtin) {
    return { ...builtin, source: 'builtin' };
  }

  return null;
}

/**
 * List all available templates
 */
export async function listTemplates(cwd: string = process.cwd()): Promise<Template[]> {
  const templates = new Map<string, Template>();

  for (const [name, template] of Object.entries(BUILTIN_TEMPLATES)) {
    templates.set(name, { ...template, source: 'builtin' });
  }

  const globalTemplates = await loadTemplatesFromDir(getGlobalTemplateDir(), 'global');
  for (const template of globalTemplates) {
    templates.set(template.name, template);
  }

  const localTemplates = await loadTemplatesFromDir(getLocalTemplateDir(cwd), 'local');
  for (const template of localTemplates) {
    templates.set(template.name, template);
  }

  return Array.from(templates.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// ============================================================================
// Template Interpolation
// ============================================================================

async function resolveInheritance(template: Template, cwd: string, visited: Set<string> = new Set()): Promise<Template> {
  if (!template.extends) return template;

  if (visited.has(template.name)) {
    throw new Error(`Circular template inheritance detected: ${Array.from(visited).join(' -> ')} -> ${template.name}`);
  }
  visited.add(template.name);

  const parentTemplate = await loadTemplate(template.extends, cwd);
  if (!parentTemplate) {
    throw new Error(`Template "${template.name}" extends unknown template "${template.extends}"`);
  }

  const resolvedParent = await resolveInheritance(parentTemplate, cwd, visited);

  return {
    ...resolvedParent,
    ...template,
    variables: { ...resolvedParent.variables, ...template.variables },
    source: template.source,
    path: template.path,
  };
}

/**
 * Interpolate variables in template content
 */
export function interpolate(content: string, context: TemplateContext): string {
  let result = content;

  const conditionalRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
  result = result.replace(conditionalRegex, (_, varName, blockContent) => {
    const value = context[varName];
    return value ? blockContent : '';
  });

  const variableRegex = /\{\{(\w+)\}\}/g;
  result = result.replace(variableRegex, (_, varName) => {
    return context[varName] ?? '';
  });

  return result;
}

/**
 * Apply a template with context and variables
 */
export async function applyTemplate(
  templateName: string,
  vars: Record<string, string> = {},
  cwd: string = process.cwd()
): Promise<string> {
  const template = await loadTemplate(templateName, cwd);
  if (!template) {
    throw new Error(`Template "${templateName}" not found`);
  }

  const resolvedTemplate = await resolveInheritance(template, cwd);

  const context: TemplateContext = {
    date: new Date().toISOString().split('T')[0],
    ...resolvedTemplate.variables,
    ...vars,
  };

  return interpolate(resolvedTemplate.content, context);
}

// ============================================================================
// Template Saving
// ============================================================================

export async function saveTemplate(
  name: string,
  content: string,
  options: { description?: string; variables?: Record<string, string>; global?: boolean; cwd?: string } = {}
): Promise<string> {
  const { description, variables, global: isGlobal = false, cwd = process.cwd() } = options;

  let fileContent = '---\n';
  fileContent += `name: ${name}\n`;
  if (description) fileContent += `description: ${description}\n`;
  if (variables && Object.keys(variables).length > 0) {
    fileContent += 'variables:\n';
    for (const [key, value] of Object.entries(variables)) {
      fileContent += `  ${key}: ${value}\n`;
    }
  }
  fileContent += '---\n\n';
  fileContent += content;

  const targetDir = isGlobal ? getGlobalTemplateDir() : getLocalTemplateDir(cwd);
  await fs.mkdir(targetDir, { recursive: true });

  const filePath = path.join(targetDir, `${name}.md`);
  await fs.writeFile(filePath, fileContent, 'utf8');

  return filePath;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function detectLanguage(files: string[]): string | undefined {
  const extCounts = new Map<string, number>();

  for (const file of files) {
    const ext = path.extname(file).toLowerCase().slice(1);
    if (ext) extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
  }

  if (extCounts.size === 0) return undefined;

  let maxCount = 0;
  let dominantExt = '';
  for (const [ext, count] of extCounts) {
    if (count > maxCount) { maxCount = count; dominantExt = ext; }
  }

  const extToLanguage: Record<string, string> = {
    ts: 'TypeScript', tsx: 'TypeScript (React)', js: 'JavaScript', jsx: 'JavaScript (React)',
    py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin',
    swift: 'Swift', cs: 'C#', cpp: 'C++', c: 'C', php: 'PHP', scala: 'Scala',
  };

  return extToLanguage[dominantExt] || dominantExt.toUpperCase();
}

export function formatTemplateList(templates: Template[]): string {
  const lines: string[] = ['Available Templates:', ''];
  const builtins = templates.filter(t => t.source === 'builtin');
  const globals = templates.filter(t => t.source === 'global');
  const locals = templates.filter(t => t.source === 'local');

  if (locals.length > 0) {
    lines.push('  Local (.packx/templates/):');
    for (const t of locals) lines.push(`    ${t.name.padEnd(15)} ${t.description || ''}`);
    lines.push('');
  }

  if (globals.length > 0) {
    lines.push('  Global (~/.packx/templates/):');
    for (const t of globals) lines.push(`    ${t.name.padEnd(15)} ${t.description || ''}`);
    lines.push('');
  }

  if (builtins.length > 0) {
    lines.push('  Built-in:');
    for (const t of builtins) lines.push(`    ${t.name.padEnd(15)} ${t.description || ''}`);
    lines.push('');
  }

  return lines.join('\n');
}
