#!/usr/bin/env node
import MiniSearch from 'minisearch';
import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import mri from 'mri';

type ConceptOptions = {
  keywords: number;
  topFiles: number;
  preview: boolean;
};

function splitArgsOnDashDash(args: string[]): { conceptArgs: string[]; packArgs: string[] } {
  const dd = args.indexOf('--');
  if (dd === -1) return { conceptArgs: args, packArgs: [] };
  return { conceptArgs: args.slice(0, dd), packArgs: args.slice(dd + 1) };
}

function normalizeToken(raw: string): string[] {
  // break camelCase, snake_case, dot.separated, and trim
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ');
  return spaced
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function tokenizeContent(content: string): string[] {
  // Keep alphanumeric and split; then apply camel/snake splitting
  const rough = content
    .replace(/\r/g, '\n')
    .split(/\s+/);
  const toks: string[] = [];
  for (const t of rough) toks.push(...normalizeToken(t));
  return toks;
}

function extractCommentTokens(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const commentLines = lines.filter(l => /(^\s*\/\/)|(^\s*#)|(^\s*\*)|\/\*|\*\//.test(l));
  const toks: string[] = [];
  for (const l of commentLines) toks.push(...tokenizeContent(l));
  return toks;
}

function makeNGrams(tokens: string[], n: number): string[] {
  const grams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    grams.push(tokens.slice(i, i + n).join(' '));
  }
  return grams;
}

function isNumeric(s: string): boolean { return /^\d+$/.test(s); }

function isNoisyToken(t: string): boolean {
  if (isNumeric(t)) return true;
  // Alphanumeric dominated by digits (e.g., timestamps like 20t00, hashes like sha512)
  const digits = (t.match(/\d/g) || []).length;
  const letters = (t.match(/[a-z]/g) || []).length;
  if (digits > 0 && digits >= letters) return true;
  if (/^sha\d+$/i.test(t)) return true;
  if (/^[a-f0-9]{6,}$/i.test(t)) return true; // hex-ish tokens
  return false;
}

const STOP_WORDS = new Set([
  // Common language keywords and noise
  'const','let','var','function','return','import','export','from','class','new','this','that','with','for','while','do',
  'if','else','switch','case','break','continue','try','catch','finally','throw','async','await','typeof','instanceof','void',
  'null','undefined','true','false','and','or','not','the','is','are','was','were','been','being','have','has','had','will',
  'would','could','should','may','might','must','can','shall','in','on','at','to','of','by','as','it','be','an','a','or',
  'then','end','begin','static','public','private','protected','interface','implements','extends','package','module','enum',
  'use','get','set','map','list','data','file','path','src','dist','node','module','index','main',
  // Repo-generic terms observed during runs
  'script','scripts','name','string','test','tests','env','channel','pnpm','windows','integrity','sha512','kit','lock','log',
  'global','choices'
]);

function scoreKeywordsTFIDF(docs: { id: string; content: string; }[], seedTerms: string[], options: ConceptOptions) {
  // Build per-doc token counts, document frequency across selected docs
  const perDoc = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  const docCount = docs.length || 1;

  const filenameBoost = new Map<string, Set<string>>();

  for (const d of docs) {
    const tokens = tokenizeContent(d.content).filter(t => t.length >= 3 && t.length <= 30 && !STOP_WORDS.has(t) && !isNoisyToken(t));
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) || 0) + 1);
    perDoc.set(d.id, counts);
    for (const k of new Set(tokens)) df.set(k, (df.get(k) || 0) + 1);

    // filename/path tokens as signal
    const base = path.basename(d.id);
    const pathTokens = normalizeToken(base).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    filenameBoost.set(d.id, new Set(pathTokens));
  }

  // Comment n-grams from all docs
  const ngramScores = new Map<string, number>();
  for (const d of docs) {
    const cmt = extractCommentTokens(d.content).filter(t => t.length >= 3 && !STOP_WORDS.has(t));
    const bigrams = makeNGrams(cmt, 2);
    const trigrams = makeNGrams(cmt, 3);
    for (const g of [...bigrams, ...trigrams]) ngramScores.set(g, (ngramScores.get(g) || 0) + 1);
  }

  const seedSet = new Set(seedTerms.map(s => s.toLowerCase()));

  // Compute TF-IDF-like score
  const scores = new Map<string, number>();
  for (const [docId, counts] of perDoc) {
    // File weighting: code > config/docs, penalize tests
    const ext = path.extname(docId).toLowerCase();
    const isTest = /(^|\/)test(s)?\//.test(docId) || /\.(test|spec)\.[a-z]+$/.test(docId);
    let fileWeight = 1.0;
    if (ext === '.md') fileWeight *= 0.5;
    if (ext === '.json' || ext === '.yaml' || ext === '.yml') fileWeight *= 0.6;
    if (ext === '.d.ts') fileWeight *= 0.7;
    if (isTest) fileWeight *= 0.6;
    const fnameTokens = filenameBoost.get(docId) || new Set<string>();
    for (const [term, c] of counts) {
      const idf = Math.log(1 + docCount / (1 + (df.get(term) || 0)));
      let score = c * idf * fileWeight;
      // Affinity boosts
      if (Array.from(seedSet).some(s => term.includes(s))) score *= 1.5;
      if (fnameTokens.has(term)) score *= 1.3;
      scores.set(term, (scores.get(term) || 0) + score);
    }
  }

  // Add n-grams with reduced weight
  for (const [g, c] of ngramScores) {
    let s = c * 0.5;
    if (Array.from(seedSet).some(t => g.includes(t))) s *= 1.2;
    scores.set(g, (scores.get(g) || 0) + s);
  }

  // Rank and return
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
}

export async function runConceptMode(rawArgs: string[]) {
  const { conceptArgs, packArgs } = splitArgsOnDashDash(rawArgs);
  const parsed = mri(conceptArgs, {
    boolean: ['preview'],
    default: { keywords: 4, 'top-files': 8, preview: false, 'max-tokens': 50000 },
    alias: { k: 'keywords', t: 'top-files', m: 'max-tokens' }
  });

  const positionals: string[] = parsed._ || [];
  const searchString = positionals.join(' ').trim();
  if (!searchString) {
    console.error('❌ Please provide a search string for concept mode');
    console.error('Usage: packx concept <search string> [--keywords N] [--top-files M] [--preview] -- [pack flags]');
    process.exit(1);
  }

  const opts: ConceptOptions = {
    keywords: Number(parsed.keywords) || 10,
    topFiles: Number(parsed['top-files']) || 20,
    preview: Boolean(parsed.preview)
  };
  const maxTokens = Number(parsed['max-tokens']) || 0;

  console.log(`Extracting concepts related to: "${searchString}"`);

  // Discover files (common code extensions)
  const extensions = ['ts','tsx','js','jsx','py','java','cpp','c','go','rs','md','json','yml','yaml'];
  const pattern = `**/*.{${extensions.join(',')}}`;
  const files = await glob(pattern, { 
    ignore: [
      '**/node_modules/**','**/dist/**','**/.git/**','**/build/**','**/.next/**',
      '**/pnpm-lock.yaml','**/package-lock.json','**/yarn.lock','**/*.lock','**/*.log',
      '**/*-bundle.md','**/gh-*-bundle.md','**/gh-*.log','**/coverage/**'
    ] 
  });

  console.log(`Found ${files.length} files to index`);

  // Build lexical index (cap per-file bytes for memory safety)
  const miniSearch = new MiniSearch({ fields: ['content'], storeFields: ['path'] });
  const documents: { id: string; path: string; content: string; }[] = [];
  const MAX_PER_FILE = 200_000; // bytes per file to read
  for (const file of files) {
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf-8');
      if (content.length > MAX_PER_FILE) content = content.slice(0, MAX_PER_FILE);
    } catch {}
    documents.push({ id: file, path: file, content });
  }
  miniSearch.addAll(documents.map(d => ({ id: d.id, path: d.path, content: d.content })));

  // Search and rank
  const results = miniSearch.search(searchString, { boost: { content: 2 }, fuzzy: 0.2 });

  // Extract top content/docs
  const topResults = results.slice(0, opts.topFiles);
  const topDocs = topResults
    .map(r => documents.find(d => d.id === r.id))
    .filter((d): d is { id: string; path: string; content: string } => Boolean(d));

  // Seed terms
  const seedTerms = searchString.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  let ranked = scoreKeywordsTFIDF(topDocs, seedTerms, opts);

  // Ensure seeds are present and de-duplicated
  const topKeywords = Array.from(new Set([...seedTerms, ...ranked])).slice(0, opts.keywords);

  // Infer likely code extensions from top docs
  const codeExts = ['.ts','.tsx','.js','.jsx','.py','.go','.rs','.java'];
  const extCounts = new Map<string, number>();
  for (const d of topDocs) {
    const e = path.extname(d.id).toLowerCase();
    if (codeExts.includes(e)) extCounts.set(e, (extCounts.get(e) || 0) + 1);
  }
  const inferredExts = Array.from(extCounts.entries())
    .sort((a,b)=>b[1]-a[1])
    .map(([e])=>e.replace(/^\./,''))
    .slice(0, 4);

  // Determine if user supplied extensions/excludes/lines in pack args
  const userSpecifiedExt = packArgs.some(a => a === '-e' || a === '--extensions');
  const userSpecifiedExcl = packArgs.some(a => a === '-x' || a === '--exclude-extensions');
  const userSpecifiedLines = packArgs.some(a => a === '-l' || a === '--lines');

  function extractLinesArg(): number | null {
    for (let i = 0; i < packArgs.length; i++) {
      if (packArgs[i] === '-l' || packArgs[i] === '--lines') {
        const v = Number(packArgs[i + 1]);
        if (!Number.isNaN(v) && v > 0) return v;
      }
    }
    return null;
  }

  function estimateTokensFor(docs: { id: string; content: string }[], keywords: string[], lines: number): number {
    let total = 0;
    for (const d of docs) {
      const contentLower = d.content.toLowerCase();
      const parts = contentLower.split(/\r?\n/);
      const matchLines: number[] = [];
      for (let i = 0; i < parts.length; i++) {
        const ln = parts[i];
        if (keywords.some(k => k.length >= 3 && ln.includes(k.toLowerCase()))) matchLines.push(i);
      }
      if (matchLines.length === 0) continue;
      // Merge adjacent matches into clusters with gap > lines starting new cluster
      matchLines.sort((a,b)=>a-b);
      let clusters = 0;
      let last = -Infinity;
      for (const m of matchLines) {
        if (m - last > lines) clusters++;
        last = m;
      }
      const tokensInDoc = tokenizeContent(d.content).length;
      const avgTokensPerLine = Math.max(5, Math.round(tokensInDoc / Math.max(1, parts.length)));
      total += clusters * (2 * lines + 1) * avgTokensPerLine;
    }
    return total;
  }

  // If a max token budget is provided, auto-tune lines/keywords/topFiles best-effort
  let tunedLines = userSpecifiedLines ? (extractLinesArg() || 2) : 2;
  let tunedKeywords = opts.keywords;
  let tunedTopFiles = opts.topFiles;
  if (maxTokens > 0) {
    const effectiveBudget = Math.floor(maxTokens * 0.8); // conservative margin
    // Iteratively tighten until under budget or minima reached
    while (true) {
      const docsSubset = topDocs.slice(0, tunedTopFiles);
      const kwSubset = topKeywords.slice(0, tunedKeywords);
      const estimate = estimateTokensFor(docsSubset, kwSubset, tunedLines);
      if (estimate <= effectiveBudget) break;
      // Tighten order: lines -> keywords -> topFiles
      if (tunedLines > 1) {
        tunedLines = Math.max(1, tunedLines - 1);
      } else if (tunedKeywords > 2) {
        tunedKeywords = Math.max(2, tunedKeywords - 1);
      } else if (tunedTopFiles > 3) {
        tunedTopFiles = Math.max(3, tunedTopFiles - 1);
      } else {
        break;
      }
    }
  }

  if (opts.preview) {
    console.log('\nPreview (no bundling performed)');
    console.log('Keywords:', topKeywords.slice(0, tunedKeywords).join(', '));
    console.log('Top files:');
    for (const d of topDocs.slice(0, tunedTopFiles)) console.log(` - ${d.id}`);
    if (inferredExts.length) console.log('Inferred extensions:', inferredExts.join(', '));
    if (packArgs.length) console.log('Pack flags passthrough:', packArgs.join(' '));
    if (!userSpecifiedExt && inferredExts.length) console.log('Note: No -e/--extensions provided; inferred extensions would be applied.');
    if (!userSpecifiedExcl) console.log('Note: No -x/--exclude-extensions provided; default exclude "d.ts" would be applied.');
    if (!userSpecifiedLines) console.log('Note: No -l/--lines provided; default lines "2" would be applied.');
    if (maxTokens > 0) console.log(`Auto-tune target: <= ${maxTokens} tokens (lines=${tunedLines}, keywords=${tunedKeywords}, topFiles=${tunedTopFiles})`);
    process.exit(0);
  }

  // Run packx with keywords and passthrough args
  // Build meta header for reproducibility
  const meta = {
    mode: 'concept',
    concept_query: searchString,
    seed_terms: seedTerms,
    keywords_used: topKeywords.slice(0, tunedKeywords),
    inferred_extensions: (!userSpecifiedExt ? inferredExts : []),
    tuned: { lines: tunedLines, keywords: tunedKeywords, topFiles: tunedTopFiles, max_tokens: maxTokens },
    pack_args: packArgs,
    cwd: process.cwd(),
    timestamp: new Date().toISOString()
  };
  const metaB64 = Buffer.from(JSON.stringify(meta), 'utf8').toString('base64');

  const packxArgs = [
    ...topKeywords.slice(0, tunedKeywords).flatMap(k => ['-s', k]),
    ...(!userSpecifiedExt && inferredExts.length ? ['-e', inferredExts.join(',')] : []),
    ...(!userSpecifiedExcl ? ['-x', 'd.ts,spec.ts,spec.tsx,test.ts,test.tsx'] : []),
    ...(!userSpecifiedLines ? ['-l', String(tunedLines)] : []),
    `--meta-header=${metaB64}`,
    ...packArgs
  ];

  const packxBin = (process.env.PACKX_BIN || '').trim();
  if (packxBin) {
    const argsQuoted = packxArgs.map(a => /\s/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a).join(' ');
    if (/\s/.test(packxBin)) {
      const cmd = `${packxBin} ${argsQuoted}`;
      // Attach exact command for meta reproducibility (best effort)
      meta['exact_command'] = cmd;
      console.log(`Running (PACKX_BIN): ${cmd}`);
      const proc = spawn(cmd, { stdio: 'inherit', shell: true });
      proc.on('close', (code) => process.exit(code || 0));
      return;
    } else {
      const cmd = `${packxBin} ${argsQuoted}`;
      meta['exact_command'] = cmd;
      console.log(`Running (PACKX_BIN): ${cmd}`);
      const proc = spawn(packxBin, packxArgs, { stdio: 'inherit', shell: true });
      proc.on('close', (code) => process.exit(code || 0));
      return;
    }
  }
  const argsQuoted2 = packxArgs.map(a => /\s/.test(a) ? `'${a.replace(/'/g, "'\\''")}'` : a).join(' ');
  meta['exact_command'] = `packx ${argsQuoted2}`;
  console.log(`Running: packx ${argsQuoted2}`);
  const packx = spawn('packx', packxArgs, { stdio: 'inherit', shell: true });
  packx.on('close', (code) => process.exit(code || 0));
}
