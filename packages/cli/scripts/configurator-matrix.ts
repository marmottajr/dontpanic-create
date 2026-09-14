#!/usr/bin/env node
/**
 * O espaço inteiro do configurador, gerado e verificado.
 *
 * A conformidade prova oito receitas escolhidas à mão. Este script responde a outra
 * pergunta: **existe alguma combinação que a landing deixa montar e que gera um projeto
 * quebrado?** Para isso ele não inventa receitas — ele refaz o que o assistente da
 * landing faz, resposta por resposta, sobre cada preset, e passa o comando resultante
 * pelo MESMO caminho do CLI (`parseArgs` → `reconcileRecipe` → `validateRecipe`).
 *
 * Dois modos:
 *
 *   enumerate   lista as receitas únicas e quantas o CLI recusaria
 *   check       gera cada uma (sem install) e roda as verificações estáticas
 *
 * As verificações estáticas não substituem compilar e testar — isso é o trabalho da
 * matriz profunda, em CI. Elas existem porque são baratas o bastante para rodar sobre
 * TODAS as receitas, e porque a classe de defeito mais comum de um gerador que subtrai
 * é exatamente a que elas enxergam sem instalar nada: um import para um arquivo que a
 * poda apagou, uma dependência removida que alguém ainda importa, uma chave de env
 * lida depois de sair do schema.
 *
 * Uso:
 *   node --experimental-strip-types scripts/configurator-matrix.ts enumerate [--out=f.json]
 *   node --experimental-strip-types scripts/configurator-matrix.ts check --jobs=8 [--limit=N]
 *        [--out=relatorio.json] [--keep-failures]
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  PRESETS,
  PRESET_IDS,
  cloneRecipe,
  parseArgs,
  presetRecipe,
  reconcileRecipe,
  toFlags,
  validateRecipe,
  type PresetId,
} from '../src/recipe.ts';
import { verifyRename } from '../src/rename.ts';
import { OAUTH_PROVIDERS, type OAuthProvider, type Recipe } from '../src/types.ts';

const run = promisify(execFile);
const CLI_ROOT = resolve(import.meta.dirname, '..');
// `CONFIGURATOR_CLI_BIN` aponta para uma cópia congelada do CLI (dist + template), para a
// verificação longa não ler um `dist/` sendo reescrito por um build no meio do caminho.
const CLI_BIN = process.env['CONFIGURATOR_CLI_BIN'] ?? join(CLI_ROOT, 'dist/index.js');

// ─────────────────────────────────────────────────────────────────────────────
// O assistente da landing, resposta por resposta
// ─────────────────────────────────────────────────────────────────────────────

/** Os mesmos da landing (`apps/web/src/components/wizard/wizard-steps.tsx`). */
const PROJECT_LOCALES = ['pt', 'en'] as const;
const PROJECT = { displayName: 'Acme Corp', slug: 'acme-corp' };

type Entry = 'open' | 'invite' | 'seed';
type Languages = { kind: 'one' } | { kind: 'many'; locales: string[] };

interface WizardAnswers {
  preset: PresetId;
  multiTenant: boolean;
  entry: Entry;
  /** `null` = login social desligado. */
  providers: OAuthProvider[] | null;
  twoFactor: boolean;
  languages: Languages;
  plans: boolean;
  files: boolean;
  captcha: boolean;
}

/** `entryFeatures` da landing (`apps/web/src/lib/wizard-answers.ts`). */
function entryFeatures(entry: Entry): { publicSignup: boolean; invitations: boolean } {
  if (entry === 'open') return { publicSignup: true, invitations: true };
  if (entry === 'invite') return { publicSignup: false, invitations: true };
  return { publicSignup: false, invitations: false };
}

/** Aplica as respostas como o `use-configurator` faz: mutação direta, sem reconciliar. */
function applyAnswers(a: WizardAnswers): Recipe {
  const recipe = cloneRecipe(presetRecipe(a.preset, PROJECT));
  recipe.features.multiTenant = a.multiTenant;
  Object.assign(recipe.features, entryFeatures(a.entry));
  recipe.features.oauth = a.providers !== null;
  recipe.oauth.providers = a.providers === null ? recipe.oauth.providers : [...a.providers];
  recipe.features.twoFactor = a.twoFactor;
  if (a.languages.kind === 'one') {
    recipe.features.i18n = false;
    recipe.i18n.locales = [recipe.i18n.defaultLocale];
  } else {
    recipe.features.i18n = true;
    recipe.i18n.locales = [...a.languages.locales];
  }
  recipe.features.plans = a.plans;
  recipe.features.files = a.files;
  recipe.features.captcha = a.captcha;
  recipe.drivers.captcha = a.captcha ? 'turnstile' : 'none';
  // `syncPlatform` da landing (`apps/web/src/lib/wizard-answers.ts`): o painel não é
  // pergunta, vem do preset e segue as respostas de que depende.
  if (PRESETS[a.preset].features.platform) {
    const f = recipe.features;
    f.platform = f.multiTenant && f.invitations && f.plans && f.audit;
  }
  return recipe;
}

function subsets<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let mask = 1; mask < 1 << items.length; mask += 1) {
    out.push(items.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return out;
}

/**
 * Variações de idioma.
 *
 * Todas as combinações de idiomas cruzadas com todo o resto dariam ~100 mil receitas,
 * e o efeito dos idiomas no código gerado (quais catálogos existem) é independente das
 * features. Então: cruzamento COMPLETO dos idiomas só com o preset, e três variações
 * representativas no cruzamento com as demais respostas.
 */
function languageVariants(defaultLocale: string, full: boolean): Languages[] {
  const others = PROJECT_LOCALES.filter((l) => l !== defaultLocale);
  const many = full
    ? subsets(others).map((s) => [defaultLocale, ...s])
    : [[defaultLocale, others[0] ?? 'en'], [defaultLocale, ...others]];
  return [{ kind: 'one' }, ...many.map((locales) => ({ kind: 'many' as const, locales }))];
}

interface Candidate {
  answers: WizardAnswers;
  argv: string[];
}

function* enumerateWizard(): Generator<Candidate> {
  const providerChoices: (OAuthProvider[] | null)[] = [null, ...subsets(OAUTH_PROVIDERS)];
  const bools = [true, false];
  for (const preset of PRESET_IDS) {
    const base = presetRecipe(preset, PROJECT);
    const seenLanguagesOnly = new Set<string>();
    for (const multiTenant of bools)
      for (const entry of ['open', 'invite', 'seed'] as const)
        for (const providers of providerChoices)
          for (const twoFactor of bools)
            for (const plans of bools)
              for (const files of bools)
                for (const captcha of bools) {
                  // O cruzamento completo de idiomas só na primeira combinação do resto.
                  const full = seenLanguagesOnly.size === 0;
                  for (const languages of languageVariants(base.i18n.defaultLocale, full)) {
                    const answers: WizardAnswers = {
                      preset,
                      multiTenant,
                      entry,
                      providers,
                      twoFactor,
                      languages,
                      plans,
                      files,
                      captcha,
                    };
                    const recipe = applyAnswers(answers);
                    // O comando é o que a landing mostra: `buildCommand(recipe, preset)`.
                    const argv = [PROJECT.displayName, ...toFlags(recipe, preset)];
                    yield { answers, argv };
                  }
                  seenLanguagesOnly.add(preset);
                }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// O caminho do CLI
// ─────────────────────────────────────────────────────────────────────────────

interface Resolved {
  id: string;
  argv: string[];
  recipe: Recipe;
  /** Mensagens de erro de validação, quando o CLI recusaria a receita. */
  blocking: string[];
  /** Quantas combinações de respostas colapsaram nesta receita. */
  answers: number;
  exampleAnswers: WizardAnswers;
}

function resolveThroughCli(c: Candidate): Omit<Resolved, 'id' | 'answers'> {
  const parsed = parseArgs(c.argv);
  if (parsed.errors.length > 0 || parsed.recipe === undefined) {
    return {
      argv: c.argv,
      recipe: applyAnswers(c.answers),
      blocking: parsed.errors.length > 0 ? parsed.errors : ['parseArgs não produziu receita'],
      exampleAnswers: c.answers,
    };
  }
  const { recipe } = reconcileRecipe(parsed.recipe);
  const blocking = validateRecipe(recipe)
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.message);
  return { argv: c.argv, recipe, blocking, exampleAnswers: c.answers };
}

/** Identidade da receita FINAL: projeto, features, drivers, idiomas e providers. */
function recipeKey(recipe: Recipe): string {
  const canonical = {
    features: recipe.features,
    drivers: recipe.drivers,
    i18n: recipe.i18n,
    oauth: recipe.features.oauth ? [...recipe.oauth.providers].sort() : [],
  };
  return createHash('sha1').update(JSON.stringify(canonical)).digest('hex').slice(0, 12);
}

function enumerateUnique(): { total: number; unique: Resolved[] } {
  const byKey = new Map<string, Resolved>();
  let total = 0;
  for (const candidate of enumerateWizard()) {
    total += 1;
    const resolved = resolveThroughCli(candidate);
    const key = `${recipeKey(resolved.recipe)}${resolved.blocking.length > 0 ? '-recusada' : ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.answers += 1;
      continue;
    }
    byKey.set(key, { id: key, answers: 1, ...resolved });
  }
  return { total, unique: [...byKey.values()] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificações estáticas sobre o projeto gerado
// ─────────────────────────────────────────────────────────────────────────────

interface Finding {
  check: string;
  file?: string;
  detail: string;
}

const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.turbo']);
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else out.push(abs);
  }
  return out;
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

async function resolvesTo(base: string): Promise<boolean> {
  const candidates = [
    base,
    ...['.ts', '.tsx', '.mts', '.js', '.mjs', '.json', '.css'].map((e) => base + e),
    ...['index.ts', 'index.tsx', 'index.js'].map((e) => join(base, e)),
    // ESM com extensão `.js` apontando para um `.ts`.
    base.replace(/\.js$/, '.ts'),
    base.replace(/\.js$/, '.tsx'),
  ];
  for (const c of candidates) {
    const s = await stat(c).catch(() => undefined);
    if (s?.isFile()) return true;
  }
  return false;
}

/**
 * Especificadores de import de um arquivo.
 *
 * Só em posição de código: linhas que começam com `import`/`export`, e as chamadas
 * `import()`, `require()`, `jest.mock()` e `vi.mock()`. Um exemplo dentro de um
 * doc-comment não é import, e contar isso encheria o relatório de falso positivo.
 */
function specifiers(source: string): string[] {
  const out: string[] = [];
  const staticRe = /^\s*(?:import|export)\b[^;'"`]*?from\s*['"]([^'"]+)['"]/gm;
  const bareRe = /^\s*import\s*['"]([^'"]+)['"]/gm;
  const callRe = /\b(?:import|require|jest\.mock|vi\.mock|jest\.requireActual|vi\.importActual)\(\s*['"]([^'"]+)['"]/g;
  for (const re of [staticRe, bareRe, callRe]) {
    for (const m of source.matchAll(re)) if (m[1]) out.push(m[1]);
  }
  return out;
}

function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? `${parts[0]}/${parts[1]}` : (parts[0] ?? spec);
}

async function nearestPackageJson(file: string, root: string): Promise<string | undefined> {
  let dir = dirname(file);
  while (dir.startsWith(root)) {
    const candidate = join(dir, 'package.json');
    if (await exists(candidate)) return candidate;
    if (dir === root) break;
    dir = dirname(dir);
  }
  return undefined;
}

async function checkProject(dir: string, recipe: Recipe): Promise<Finding[]> {
  const findings: Finding[] = [];
  const files = await walk(dir);

  // JSON válido — várias costuras editam package.json e catálogos.
  const pkgCache = new Map<string, Set<string>>();
  for (const f of files.filter((f) => f.endsWith('.json') && !f.includes('tsconfig'))) {
    try {
      JSON.parse(await readFile(f, 'utf8'));
    } catch (err) {
      findings.push({ check: 'json-invalido', file: relative(dir, f), detail: String(err).slice(0, 120) });
    }
  }

  const workspaceNames = new Set<string>();
  for (const f of files.filter((f) => f.endsWith('package.json'))) {
    try {
      const pkg = JSON.parse(await readFile(f, 'utf8')) as { name?: string };
      if (pkg.name) workspaceNames.add(pkg.name);
    } catch {
      /* já reportado acima */
    }
  }

  async function declared(pkgJsonPath: string): Promise<Set<string>> {
    const cached = pkgCache.get(pkgJsonPath);
    if (cached) return cached;
    const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf8')) as Record<string, Record<string, string>>;
    const names = new Set([
      ...Object.keys(pkg['dependencies'] ?? {}),
      ...Object.keys(pkg['devDependencies'] ?? {}),
      ...Object.keys(pkg['peerDependencies'] ?? {}),
    ]);
    pkgCache.set(pkgJsonPath, names);
    return names;
  }

  const rootDeclared = await declared(join(dir, 'package.json'));

  for (const file of files.filter((f) => SOURCE_EXT.test(f))) {
    const rel = relative(dir, file);
    const source = await readFile(file, 'utf8');
    for (const spec of specifiers(source)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        // `next-env.d.ts` referencia `./.next/types/*`, que o Next só escreve no build.
        if (spec.includes('.next/')) continue;
        const base = spec.startsWith('@/')
          ? join(dir, 'apps/web/src', spec.slice(2))
          : resolve(dirname(file), spec);
        if (!(await resolvesTo(base))) {
          findings.push({ check: 'import-quebrado', file: rel, detail: spec });
        }
        continue;
      }
      if (BUILTINS.has(spec) || BUILTINS.has(packageName(spec))) continue;
      const name = packageName(spec);
      if (workspaceNames.has(name)) continue;
      const pkgJson = await nearestPackageJson(file, dir);
      const local = pkgJson ? await declared(pkgJson) : new Set<string>();
      // pnpm não iça: um pacote tem de estar no package.json do workspace que o importa.
      // O root vale para os arquivos de config da raiz (eslint, prettier, commitlint).
      const atRoot = pkgJson === join(dir, 'package.json');
      if (!local.has(name) && !(atRoot && rootDeclared.has(name))) {
        // `@types/x` declarado cobre `import type` de `x`? Não: o runtime ainda precisa
        // do pacote. Mas imports só de tipo de pacotes que vêm como transitivos oficiais
        // (ex.: `@prisma/client` via `prisma`) aparecem aqui — o relatório agrupa, e a
        // leitura humana decide.
        findings.push({
          check: 'dependencia-nao-declarada',
          file: rel,
          detail: `${name} (em ${pkgJson ? relative(dir, pkgJson) : '?'})`,
        });
      }
    }
  }

  // Toda chave lida via ConfigService na API existe no schema de env.
  const envTs = join(dir, 'apps/api/src/config/env.ts');
  if (await exists(envTs)) {
    const schema = await readFile(envTs, 'utf8');
    const keys = new Set([...schema.matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]));
    for (const file of files.filter((f) => f.includes('/apps/api/src/') && SOURCE_EXT.test(f))) {
      if (file.endsWith('.spec.ts')) continue;
      const source = await readFile(file, 'utf8');
      for (const m of source.matchAll(/\.get(?:OrThrow)?(?:<[^>]*>)?\(\s*'([A-Z][A-Z0-9_]+)'/g)) {
        const key = m[1] ?? '';
        if (!keys.has(key)) {
          findings.push({ check: 'env-sem-schema', file: relative(dir, file), detail: key });
        }
      }
    }
  }

  // Um catálogo de mensagens por idioma pedido, no web.
  const messagesDir = join(dir, 'apps/web/messages');
  if (await exists(messagesDir)) {
    const catalogs = (await readdir(messagesDir)).filter((f) => f.endsWith('.json'));
    for (const locale of recipe.i18n.locales) {
      const hit = catalogs.some((c) => c === `${locale}.json` || c.startsWith(`${locale}-`));
      if (!hit) findings.push({ check: 'catalogo-ausente', detail: `${locale} (há: ${catalogs.join(', ')})` });
    }
  }

  // Nome antigo: a mesma autoridade da conformidade.
  const verification = await verifyRename(dir, { keepEasterEggs: recipe.features.easterEggs });
  for (const o of verification.blocking.slice(0, 5)) {
    findings.push({ check: 'nome-remanescente', file: o.file, detail: o.match });
  }

  return findings;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

interface CaseResult {
  id: string;
  argv: string[];
  ok: boolean;
  generationFailed?: string;
  findings: Finding[];
  ms: number;
}

async function checkOne(r: Resolved, keep: boolean): Promise<CaseResult> {
  const started = Date.now();
  const work = await mkdtemp(join(tmpdir(), 'dp-cfg-'));
  const target = join(work, 'acme-corp');
  try {
    try {
      await run(process.execPath, [CLI_BIN, ...r.argv, '--no-install', '--no-git', '--yes'], {
        cwd: work,
        timeout: 120_000,
        maxBuffer: 20 * 1024 * 1024,
      });
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      const text = `${e.stdout ?? ''}\n${e.stderr ?? ''}`.trim() || String(e.message);
      return {
        id: r.id,
        argv: r.argv,
        ok: false,
        generationFailed: text.split('\n').filter((l) => l.trim() !== '').slice(-12).join('\n'),
        findings: [],
        ms: Date.now() - started,
      };
    }
    const findings = await checkProject(target, r.recipe);
    return { id: r.id, argv: r.argv, ok: findings.length === 0, findings, ms: Date.now() - started };
  } finally {
    if (!keep) await rm(work, { recursive: true, force: true });
  }
}

async function pool<T, R>(items: T[], jobs: number, fn: (item: T) => Promise<R>, onDone: (r: R, i: number) => void): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      const r = await fn(items[i] as T);
      results[i] = r;
      done += 1;
      onDone(r, done);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, worker));
  return results;
}

/** Normaliza uma falha em assinatura: agrupa o que é o mesmo defeito em receitas diferentes. */
function signature(r: CaseResult): string[] {
  if (r.generationFailed) {
    const line =
      r.generationFailed.split('\n').find((l) => /✖|erro|error|sem-casamento|costura/i.test(l)) ??
      r.generationFailed.split('\n').at(-1) ??
      '';
    return [`geração: ${line.replace(/\s+/g, ' ').trim().slice(0, 160)}`];
  }
  return [...new Set(r.findings.map((f) => `${f.check}: ${f.file ?? ''} ${f.detail}`.trim()))];
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  const opt = (name: string): string | undefined =>
    rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

  const { total, unique } = enumerateUnique();
  const refused = unique.filter((u) => u.blocking.length > 0);
  const valid = unique.filter((u) => u.blocking.length === 0);

  if (mode === 'enumerate') {
    console.log(`Combinações de respostas do assistente: ${total}`);
    console.log(`Receitas finais únicas: ${unique.length} (${valid.length} geráveis, ${refused.length} recusadas pelo CLI)`);
    const reasons = new Map<string, number>();
    for (const r of refused) for (const m of r.blocking) reasons.set(m.slice(0, 140), (reasons.get(m.slice(0, 140)) ?? 0) + r.answers);
    for (const [m, n] of [...reasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`  recusa (${n} respostas): ${m}`);
    const out = opt('out');
    if (out) await writeFile(out, JSON.stringify({ total, unique }, null, 2));
    return;
  }

  if (mode !== 'check') {
    console.error('Modo: enumerate | check');
    process.exit(2);
  }

  const limit = Number(opt('limit') ?? valid.length);
  const jobs = Number(opt('jobs') ?? 8);
  const keep = rest.includes('--keep-failures');
  // `--only=id1,id2`: reverificar receitas específicas pelo id que o relatório imprimiu.
  const only = opt('only')?.split(',').filter(Boolean);
  // `--sample=N`: N receitas espaçadas uniformemente pelo espaço inteiro, para uma
  // leitura rápida que atravessa todos os presets (o `--limit` pega só o começo).
  const sample = Number(opt('sample') ?? 0);
  const step = sample > 0 ? Math.max(1, Math.floor(valid.length / sample)) : 1;
  const targets = only
    ? valid.filter((r) => only.includes(r.id))
    : sample > 0
      ? valid.filter((_, i) => i % step === 0).slice(0, sample)
      : valid.slice(0, limit);
  console.log(`Verificando ${targets.length} receita(s) únicas com ${jobs} processo(s)...`);

  const started = Date.now();
  const results = await pool(
    targets,
    jobs,
    (r) => checkOne(r, keep),
    (r, n) => {
      if (!r.ok || n % 100 === 0 || n === targets.length) {
        const rate = (n / ((Date.now() - started) / 1000)).toFixed(1);
        console.log(`  [${n}/${targets.length}] ${r.ok ? 'ok' : 'FALHA'} ${r.id} (${rate}/s)`);
      }
    },
  );

  const failures = results.filter((r) => !r.ok);
  const bySignature = new Map<string, { count: number; example: string[] }>();
  for (const f of failures) {
    for (const s of signature(f)) {
      const entry = bySignature.get(s) ?? { count: 0, example: f.argv };
      entry.count += 1;
      bySignature.set(s, entry);
    }
  }

  const report = {
    geradoEm: new Date().toISOString(),
    combinacoesDeResposta: total,
    receitasUnicas: unique.length,
    recusadasPeloCli: refused.map((r) => ({ argv: r.argv, respostas: r.answers, motivos: r.blocking })),
    verificadas: results.length,
    falhas: failures.length,
    assinaturas: [...bySignature.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([assinatura, v]) => ({ assinatura, receitas: v.count, exemplo: `npx create-dontpanic ${v.example.join(' ')}` })),
    resultados: results,
  };
  const out = opt('out') ?? join(process.cwd(), 'configurator-matrix-report.json');
  await writeFile(out, JSON.stringify(report, null, 2));

  console.log(`\n${results.length - failures.length}/${results.length} receitas sem achado em ${((Date.now() - started) / 60000).toFixed(1)} min.`);
  for (const s of report.assinaturas.slice(0, 40)) console.log(`  ${String(s.receitas).padStart(5)}×  ${s.assinatura}\n          ex.: ${s.exemplo}`);
  console.log(`\nRelatório: ${out}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
