#!/usr/bin/env node
/**
 * A camada de compilação exaustiva do configurador.
 *
 * O `configurator-matrix.ts check` gera TODAS as receitas da landing e roda verificações
 * estáticas — baratas, sem instalar nada. Elas enxergam import para arquivo apagado e
 * dependência removida que alguém ainda importa, mas não enxergam erro de TIPO: um
 * `JobName` que vira `never` quando a poda tira o último job, um campo que some do tipo
 * do Prisma e continua lido num service, um ramo de `switch` que deixa de ser exaustivo.
 * Isso só aparece compilando. Este script compila e passa o lint de cada vetor de
 * features que a landing consegue montar.
 *
 * Por que não `pnpm install` por variante: são ~2 min e ~1,5 GB por instalação, vezes 960
 * vetores. O que torna isto viável é instalar UMA vez por shard, no projeto de maior
 * superfície (preset `complete`), e depois sobrepor cada variante naquele diretório — o
 * `node_modules` fica, o código troca.
 *
 * O preço dessa economia tem nome, e é aceito de propósito:
 *
 *   1. O `node_modules` é um SUPERCONJUNTO. Se uma variante remove uma dependência do
 *      `package.json` e algum arquivo ainda a importa, aqui o import resolve e o tsc
 *      passa — no projeto do usuário, `pnpm install` não baixaria o pacote e a compilação
 *      quebraria. Este script NÃO pega essa classe; quem pega é a camada estática
 *      (`configurator-matrix.ts check`, checagem `dependencia-nao-declarada`), que roda
 *      sobre todas as receitas. As duas camadas se completam; nenhuma substitui a outra.
 *      O inverso (a variante declarar um pacote que a base não tem) invalidaria o
 *      resultado, então é verificado e reportado como `superconjunto` antes de compilar.
 *
 *   2. Estado residual entre variantes. O que o rsync não troca (porque está excluído) e
 *      que muda de variante para variante é limpo à mão antes de cada compilação: o
 *      Prisma client (vive em `node_modules`, é regenerado), `packages/shared/dist`
 *      (rebuildado), `apps/web/.next` (os tipos de rota do Next, regenerados com
 *      `next typegen`) e os `*.tsbuildinfo` (o tsconfig do web é `incremental`, e um
 *      tsbuildinfo de outra variante pode fazer o tsc pular arquivos).
 *
 *   3. Um vetor por combinação de `recipe.features`. Receitas que diferem só nos idiomas,
 *      nos providers de OAuth ou nos drivers colapsam num representante — o que tem mais
 *      providers e mais idiomas, para exercitar a maior superfície de cada vetor. Os
 *      drivers mudam sobretudo compose e `.env`, não TypeScript; `--with-drivers` separa
 *      os vetores também por storage/cache/fila, para quando isso deixar de ser verdade.
 *
 * Os comandos são os scripts DECLARADOS no `package.json` de cada workspace do projeto
 * gerado (`typecheck`, `lint`, `build`), executados direto — sem turbo, porque o cache
 * do turbo devolveria o resultado de outra variante, e sem `pnpm run`, porque o
 * `package.json` da variante diverge do lockfile da base e não queremos que o pnpm
 * opine sobre isso.
 *
 * Uso (de `packages/cli`, com `dist/` e `template/` prontos):
 *   node --experimental-strip-types scripts/configurator-compile.ts list [--shards=20] [--with-drivers]
 *   node --experimental-strip-types scripts/configurator-compile.ts run --shard=0 --shards=20
 *        [--limit=N] [--out=relatorio.json] [--jobs=3] [--base=DIR] [--space=space.json]
 *        [--with-drivers] [--keep-failures] [--only=chave1,chave2]
 *   node --experimental-strip-types scripts/configurator-compile.ts summarize --dir=relatorios
 *        [--shards=20] [--json=resumo.json]
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

import { FEATURE_IDS, type Recipe } from '../src/types.ts';

const exec = promisify(execFile);

const CLI_ROOT = resolve(import.meta.dirname, '..');
const CLI_BIN = join(CLI_ROOT, 'dist/index.js');
const MATRIX_SCRIPT = join(CLI_ROOT, 'scripts/configurator-matrix.ts');

/**
 * O nome do projeto da base e de TODAS as variantes.
 *
 * Tem de ser o mesmo, e não só por estética: o nome vira o escopo `@acme-corp/*` dos
 * workspaces, e o `node_modules` da base tem symlinks com esse escopo. Uma variante com
 * outro nome importaria `@outro-nome/shared`, que não existe ali. É também o nome que o
 * `configurator-matrix.ts` usa, então o `argv[0]` das receitas já vem certo — e é
 * conferido, para que uma mudança lá não vire 960 falhas misteriosas aqui.
 */
const PROJECT_NAME = 'Acme Corp';
const PROJECT_DIR = 'acme-corp';

/**
 * O que o rsync não toca na base.
 *
 * `node_modules` é o ponto do exercício. `pnpm-lock.yaml` é da instalação da base, e a
 * variante (gerada com `--no-install`) não tem lockfile — sem a exclusão, o `--delete`
 * apagaria o da base a cada variante. Os diretórios de saída ficam protegidos do
 * `--delete` só para não custar I/O; o que deles importa é apagado explicitamente em
 * `cleanResidue`.
 */
const RSYNC_EXCLUDES = ['node_modules', '.turbo', '.next', 'dist', 'coverage', 'pnpm-lock.yaml'];

// ─────────────────────────────────────────────────────────────────────────────
// O espaço: receitas → vetores → shards
// ─────────────────────────────────────────────────────────────────────────────

/** O subconjunto de `Resolved` (configurator-matrix.ts) de que este script precisa. */
interface SpaceEntry {
  id: string;
  argv: string[];
  recipe: Recipe;
  blocking: string[];
}

interface Vector {
  /** Chave canônica: um bit por feature, na ordem de `FEATURE_IDS` (+ drivers, se pedido). */
  key: string;
  features: Record<string, boolean>;
  /** A receita escolhida para gerar o vetor. */
  representative: SpaceEntry;
  /** Quantas receitas únicas colapsaram neste vetor. */
  recipes: number;
}

/**
 * Enumera chamando o `configurator-matrix.ts`, não reimplementando.
 *
 * O assistente da landing é modelado lá, resposta por resposta; uma segunda cópia dessa
 * lógica aqui divergiria na primeira pergunta nova do assistente, e a divergência seria
 * silenciosa — compilaríamos um espaço que a landing não produz.
 */
async function loadSpace(spacePath: string | undefined): Promise<SpaceEntry[]> {
  let path = spacePath;
  if (path === undefined) {
    const dir = await mkdtemp(join(tmpdir(), 'dp-compile-space-'));
    path = join(dir, 'space.json');
    await exec(process.execPath, ['--experimental-strip-types', MATRIX_SCRIPT, 'enumerate', `--out=${path}`], {
      cwd: CLI_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
  }
  const parsed = JSON.parse(await readFile(path, 'utf8')) as { unique: SpaceEntry[] };
  return parsed.unique;
}

function vectorKey(recipe: Recipe, withDrivers: boolean): string {
  const bits = FEATURE_IDS.map((f) => (recipe.features[f] ? '1' : '0')).join('');
  if (!withDrivers) return bits;
  // `captcha` e `db` ficam de fora: o primeiro segue a feature, o segundo só tem um valor.
  const d = recipe.drivers;
  return `${bits}|storage=${d.storage},cache=${d.cache},queue=${d.queue},mail=${d.mail}`;
}

/**
 * Qual receita representa o vetor.
 *
 * A de MAIOR superfície dentro do vetor: mais providers de OAuth (cada um tem rota,
 * botão e variável de env próprios) e mais idiomas (cada um tem catálogo). Empate
 * decidido pelo id, para que o representante seja o mesmo em toda execução — um
 * relatório que muda de receita entre duas rodadas não serve para comparar rodadas.
 */
function pickRepresentative(entries: SpaceEntry[]): SpaceEntry {
  const score = (e: SpaceEntry): [number, number] => [
    e.recipe.features.oauth ? e.recipe.oauth.providers.length : 0,
    e.recipe.features.i18n ? e.recipe.i18n.locales.length : 0,
  ];
  return [...entries].sort((a, b) => {
    const [pa, la] = score(a);
    const [pb, lb] = score(b);
    return pb - pa || lb - la || a.id.localeCompare(b.id);
  })[0] as SpaceEntry;
}

function buildVectors(space: SpaceEntry[], withDrivers: boolean): Vector[] {
  const groups = new Map<string, SpaceEntry[]>();
  for (const entry of space) {
    // Receita que o CLI recusa não gera projeto; a matriz estática já as reporta.
    if (entry.blocking.length > 0) continue;
    const key = vectorKey(entry.recipe, withDrivers);
    const list = groups.get(key) ?? [];
    list.push(entry);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entries]) => {
      const representative = pickRepresentative(entries);
      return {
        key,
        features: Object.fromEntries(FEATURE_IDS.map((f) => [f, representative.recipe.features[f]])),
        representative,
        recipes: entries.length,
      };
    });
}

/**
 * Distribuição round-robin sobre a lista ordenada.
 *
 * Fatiar em blocos contíguos poria num shard só os vetores que começam com
 * `multiTenant=0` — que são os mais baratos de compilar — e noutro os mais caros. O
 * round-robin mistura, e o tempo por shard fica parecido. Continua determinístico: a
 * ordem vem da chave canônica, não da ordem de enumeração.
 */
function shardOf(vectors: Vector[], shard: number, shards: number): Vector[] {
  return vectors.filter((_, i) => i % shards === shard);
}

// ─────────────────────────────────────────────────────────────────────────────
// Execução de comandos
// ─────────────────────────────────────────────────────────────────────────────

interface CommandResult {
  ok: boolean;
  output: string;
  ms: number;
}

async function runCommand(
  cmd: string,
  args: string[],
  cwd: string,
  opts: { timeout?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<CommandResult> {
  const started = Date.now();
  try {
    const { stdout, stderr } = await exec(cmd, args, {
      cwd,
      timeout: opts.timeout ?? 900_000,
      maxBuffer: 64 * 1024 * 1024,
      env: opts.env ?? process.env,
    });
    return { ok: true, output: `${stdout}\n${stderr}`, ms: Date.now() - started };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    // stdout E stderr: o tsc e o eslint escrevem os erros no stdout.
    const output = [e.stdout, e.stderr, e.message].filter((t) => Boolean(t?.trim())).join('\n');
    return { ok: false, output, ms: Date.now() - started };
  }
}

/**
 * Roda um script declarado no `package.json` de um workspace, sem pnpm e sem turbo.
 *
 * O PATH ganha os `.bin` do workspace e da raiz, que é o que o `pnpm run` faria. O texto
 * do script vem do projeto gerado, então se a variante mudar o comando, é o comando dela
 * que roda.
 */
async function runScript(projectDir: string, workspace: string, script: string): Promise<CommandResult> {
  const cwd = join(projectDir, workspace);
  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const body = pkg.scripts?.[script];
  if (body === undefined) {
    return { ok: false, output: `script "${script}" não existe em ${workspace}/package.json`, ms: 0 };
  }
  return runBin(projectDir, workspace, 'sh', ['-c', body]);
}

async function runBin(projectDir: string, workspace: string, cmd: string, args: string[]): Promise<CommandResult> {
  const cwd = join(projectDir, workspace);
  const path = [join(cwd, 'node_modules/.bin'), join(projectDir, 'node_modules/.bin'), process.env['PATH'] ?? ''].join(':');
  // `CI=1` desliga prompts e telemetria interativa (Next, Prisma) que travariam o
  // processo esperando um terminal que não existe.
  return runCommand(cmd, args, cwd, { env: { ...process.env, PATH: path, CI: '1', NEXT_TELEMETRY_DISABLED: '1' } });
}

// ─────────────────────────────────────────────────────────────────────────────
// A base: gerar, instalar, reaproveitar
// ─────────────────────────────────────────────────────────────────────────────

const pathExists = (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false,
  );

async function generate(argv: string[], parent: string): Promise<CommandResult> {
  await mkdir(parent, { recursive: true });
  return runCommand(process.execPath, [CLI_BIN, ...argv, '--no-install', '--no-git', '--yes'], parent, {
    timeout: 120_000,
  });
}

/** Dependências declaradas por `package.json`, indexadas pelo caminho relativo. */
async function declaredDeps(projectDir: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const candidates = ['package.json'];
  for (const group of ['apps', 'packages']) {
    const dir = join(projectDir, group);
    if (!(await pathExists(dir))) continue;
    for (const name of await readdir(dir)) candidates.push(join(group, name, 'package.json'));
  }
  for (const rel of candidates) {
    const abs = join(projectDir, rel);
    if (!(await pathExists(abs))) continue;
    const pkg = JSON.parse(await readFile(abs, 'utf8')) as Record<string, Record<string, string> | undefined>;
    out.set(
      rel,
      new Set([...Object.keys(pkg['dependencies'] ?? {}), ...Object.keys(pkg['devDependencies'] ?? {})]),
    );
  }
  return out;
}

interface Base {
  /** Onde se compila: a base instalada, sobre a qual cada variante é sobreposta. */
  dir: string;
  /** As dependências do `complete` recém-gerado — a referência do superconjunto. */
  deps: Map<string, Set<string>>;
  installMs: number;
  reused: boolean;
}

/**
 * Prepara a base do shard.
 *
 * O `complete` é gerado de novo toda vez (1 s) numa pasta de referência, e é ELA que
 * define o superconjunto — não o diretório instalado, que depois da primeira variante
 * contém o `package.json` da última variante compilada.
 *
 * Com `--base=DIR`, uma base já instalada é reaproveitada se as dependências declaradas
 * não mudaram (hash dos `package.json` da referência). Serve para iterar localmente sem
 * pagar o install a cada execução; no CI cada job começa do zero e o hash nunca bate.
 */
async function prepareBase(root: string, log: (m: string) => void): Promise<Base> {
  const referenceParent = join(root, 'referencia');
  await rm(referenceParent, { recursive: true, force: true });
  log(`gerando a base (preset complete, "${PROJECT_NAME}")...`);
  const gen = await generate([PROJECT_NAME, '--preset=complete'], referenceParent);
  if (!gen.ok) throw new Error(`a geração da base falhou:\n${tail(gen.output, 30)}`);
  const reference = join(referenceParent, PROJECT_DIR);
  const deps = await declaredDeps(reference);
  const hash = createHash('sha1')
    .update(JSON.stringify([...deps.entries()].map(([k, v]) => [k, [...v].sort()])))
    .digest('hex');

  const dir = join(root, 'instalado', PROJECT_DIR);
  const marker = join(root, 'instalado', '.deps-hash');
  const previous = await readFile(marker, 'utf8').catch(() => '');
  if (previous === hash && (await pathExists(join(dir, 'node_modules')))) {
    log('base já instalada com as mesmas dependências — reaproveitando.');
    return { dir, deps, installMs: 0, reused: true };
  }

  await rm(join(root, 'instalado'), { recursive: true, force: true });
  await mkdir(dirname(dir), { recursive: true });
  await cp(reference, dir, { recursive: true });
  log('pnpm install na base (uma vez por shard)...');
  // `--no-frozen-lockfile`: o projeto gerado não traz lockfile. É o mesmo comando da
  // conformidade, e o `postinstall` da API já roda o `prisma generate` da base.
  const install = await runCommand('pnpm', ['install', '--no-frozen-lockfile'], dir, { timeout: 1_800_000 });
  if (!install.ok) throw new Error(`pnpm install da base falhou:\n${tail(install.output, 40)}`);
  await writeFile(marker, hash);
  log(`base instalada em ${(install.ms / 1000).toFixed(0)} s.`);
  return { dir, deps, installMs: install.ms, reused: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Uma variante
// ─────────────────────────────────────────────────────────────────────────────

interface StepResult {
  step: string;
  ok: boolean;
  ms: number;
  /** Primeiras linhas de erro normalizadas (tsc, eslint) ou a cauda da saída. */
  errors: string[];
}

interface VariantResult {
  key: string;
  features: Record<string, boolean>;
  recipeId: string;
  argv: string[];
  recipes: number;
  ok: boolean;
  /** Em que fase parou, quando parou antes de compilar. */
  stage: 'geracao' | 'superconjunto' | 'preparo' | 'checagens' | 'ok';
  steps: StepResult[];
  signatures: string[];
  ms: number;
  keptAt?: string;
}

function tail(text: string, n: number): string {
  return text
    .split('\n')
    .filter((l) => l.trim() !== '')
    .slice(-n)
    .join('\n');
}

/**
 * Extrai as linhas de erro que interessam e as normaliza para agrupar.
 *
 * Linha e coluna saem da assinatura: o mesmo defeito numa variante com um import a
 * menos no topo do arquivo cai em outra linha, e agrupar por posição transformaria um
 * defeito em quinhentos.
 */
function extractErrors(output: string, projectDir: string): string[] {
  const errors: string[] = [];
  let currentFile = '';
  for (const raw of output.split('\n')) {
    const line = raw.replace(new RegExp(`${projectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`, 'g'), '');
    // tsc (sem --pretty, que é o default fora de TTY): `src/a.ts(12,5): error TS2339: ...`
    const ts = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
    if (ts) {
      errors.push(`${ts[1]}: ${ts[4]} ${ts[5]}`);
      continue;
    }
    // tsc para erro sem arquivo (tsconfig inválido etc.): `error TS5083: ...`
    const tsGlobal = /^error (TS\d+): (.*)$/.exec(line.trim());
    if (tsGlobal) {
      errors.push(`${tsGlobal[1]} ${tsGlobal[2]}`);
      continue;
    }
    // eslint "stylish": o caminho numa linha, os problemas indentados abaixo dele.
    if (/^\S.*\.(m?[jt]sx?|cjs)$/.test(line.trim()) && !line.startsWith(' ')) {
      currentFile = line.trim();
      continue;
    }
    const es = /^\s+\d+:\d+\s+error\s+(.+?)\s{2,}(\S+)\s*$/.exec(line);
    if (es) errors.push(`${currentFile}: ${es[2]} ${es[1]}`);
  }
  return [...new Set(errors)];
}

function stepErrors(result: CommandResult, projectDir: string): string[] {
  if (result.ok) return [];
  const found = extractErrors(result.output, projectDir);
  // Falha sem linha reconhecível (crash do Next, erro do Prisma, timeout): a cauda.
  return found.length > 0 ? found.slice(0, 40) : [tail(result.output, 12).replace(/\s+/g, ' ').slice(0, 400)];
}

/**
 * Apaga o estado que sobreviveria de uma variante para a próxima.
 *
 * O Prisma client não está aqui porque vive em `node_modules` e é sobrescrito pelo
 * `prisma generate` seguinte — mas ele TEM de ser regenerado, e é o primeiro passo de
 * `prepareVariant`: sem isso a API compilaria contra os modelos da variante anterior.
 */
async function cleanResidue(dir: string): Promise<void> {
  const targets = ['packages/shared/dist', 'apps/api/dist', 'apps/web/.next', '.turbo'];
  for (const t of targets) await rm(join(dir, t), { recursive: true, force: true });
  for (const ws of ['apps/api', 'apps/web', 'packages/shared']) {
    const wsDir = join(dir, ws);
    if (!(await pathExists(wsDir))) continue;
    for (const name of await readdir(wsDir)) {
      if (name.endsWith('.tsbuildinfo')) await rm(join(wsDir, name), { force: true });
    }
    await rm(join(wsDir, '.turbo'), { recursive: true, force: true });
  }
}

/**
 * Os passos que preparam a compilação, em ordem — cada um depende do anterior.
 *
 * `next typegen` não é script do projeto, mas é pré-requisito do typecheck do web: o
 * `next-env.d.ts` importa `.next/types/routes.d.ts`, e com o TS 6 um side-effect import
 * que não resolve é erro. No fluxo normal quem escreve esses tipos é o `next build`;
 * aqui o build do Next seria o passo mais caro de todos e não prova nada que o
 * typecheck não prove.
 */
async function prepareVariant(dir: string): Promise<StepResult[]> {
  const steps: StepResult[] = [];
  const plan: [string, () => Promise<CommandResult>][] = [
    ['api prisma generate', () => runBin(dir, 'apps/api', 'prisma', ['generate'])],
    ['shared build', () => runScript(dir, 'packages/shared', 'build')],
    ['web next typegen', () => runBin(dir, 'apps/web', 'next', ['typegen'])],
  ];
  for (const [step, fn] of plan) {
    const r = await fn();
    steps.push({ step, ok: r.ok, ms: r.ms, errors: stepErrors(r, dir) });
    if (!r.ok) break;
  }
  return steps;
}

/** As checagens de verdade. Independentes entre si, então rodam em paralelo. */
const CHECKS: [string, string, string][] = [
  ['api typecheck', 'apps/api', 'typecheck'],
  ['api lint', 'apps/api', 'lint'],
  ['web typecheck', 'apps/web', 'typecheck'],
  ['web lint', 'apps/web', 'lint'],
  ['shared typecheck', 'packages/shared', 'typecheck'],
  ['shared lint', 'packages/shared', 'lint'],
];

async function compileVariant(
  vector: Vector,
  base: Base,
  opts: { jobs: number; keep: boolean },
): Promise<VariantResult> {
  const started = Date.now();
  const r = vector.representative;
  const result: VariantResult = {
    key: vector.key,
    features: vector.features,
    recipeId: r.id,
    argv: r.argv,
    recipes: vector.recipes,
    ok: false,
    stage: 'geracao',
    steps: [],
    signatures: [],
    ms: 0,
  };
  const finish = (): VariantResult => {
    result.ms = Date.now() - started;
    result.signatures = signaturesOf(result);
    return result;
  };

  const work = await mkdtemp(join(tmpdir(), 'dp-compile-variant-'));
  let keepWork = false;
  try {
    if (r.argv[0] !== PROJECT_NAME) {
      result.steps.push({
        step: 'geracao',
        ok: false,
        ms: 0,
        errors: [`argv[0] é "${r.argv[0]}", esperado "${PROJECT_NAME}" — o escopo dos pacotes não bateria com a base`],
      });
      return finish();
    }

    const gen = await generate(r.argv, work);
    result.steps.push({ step: 'geracao', ok: gen.ok, ms: gen.ms, errors: gen.ok ? [] : [tail(gen.output, 12)] });
    if (!gen.ok) return finish();
    const variantDir = join(work, PROJECT_DIR);

    // Uma dependência que a variante declara e a base não tem: o tsc falharia por
    // "Cannot find module" sem defeito nenhum no gerador. Melhor dizer o motivo certo.
    result.stage = 'superconjunto';
    const missing: string[] = [];
    for (const [rel, names] of await declaredDeps(variantDir)) {
      const inBase = base.deps.get(rel) ?? new Set<string>();
      for (const n of names) if (!inBase.has(n)) missing.push(`${rel}: ${n}`);
    }
    if (missing.length > 0) {
      result.steps.push({ step: 'superconjunto', ok: false, ms: 0, errors: missing.map((m) => `dependência fora da base: ${m}`) });
      return finish();
    }

    result.stage = 'preparo';
    const rsync = await runCommand(
      'rsync',
      ['-a', '--delete', ...RSYNC_EXCLUDES.map((e) => `--exclude=${e}`), `${variantDir}/`, `${base.dir}/`],
      work,
    );
    result.steps.push({ step: 'rsync', ok: rsync.ok, ms: rsync.ms, errors: rsync.ok ? [] : [tail(rsync.output, 8)] });
    if (!rsync.ok) return finish();
    await cleanResidue(base.dir);

    const prep = await prepareVariant(base.dir);
    result.steps.push(...prep);
    if (prep.some((s) => !s.ok)) {
      keepWork = opts.keep;
      return finish();
    }

    result.stage = 'checagens';
    const checks = await pool(CHECKS, opts.jobs, async ([step, ws, script]) => {
      if (!(await pathExists(join(base.dir, ws, 'package.json')))) {
        return { step, ok: true, ms: 0, errors: [] } satisfies StepResult;
      }
      const c = await runScript(base.dir, ws, script);
      return { step, ok: c.ok, ms: c.ms, errors: stepErrors(c, join(base.dir, ws)) } satisfies StepResult;
    });
    result.steps.push(...checks);
    result.ok = checks.every((c) => c.ok);
    if (result.ok) result.stage = 'ok';
    else keepWork = opts.keep;
    return finish();
  } finally {
    if (keepWork) result.keptAt = work;
    else await rm(work, { recursive: true, force: true });
  }
}

/** Uma assinatura por erro distinto, prefixada pelo passo. É o que o resumo agrupa. */
function signaturesOf(r: VariantResult): string[] {
  const out: string[] = [];
  for (const s of r.steps) {
    if (s.ok) continue;
    for (const e of s.errors) out.push(`${s.step}: ${e.replace(/\s+/g, ' ').slice(0, 240)}`);
  }
  return [...new Set(out)];
}

async function pool<T, R>(items: T[], jobs: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(jobs, items.length)) }, worker));
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatório e resumo
// ─────────────────────────────────────────────────────────────────────────────

interface ShardReport {
  geradoEm: string;
  shard: number;
  shards: number;
  comDrivers: boolean;
  template: { tag?: string; commit?: string };
  vetoresNoEspaco: number;
  vetoresNoShard: number;
  verificados: number;
  ok: number;
  falhas: number;
  base: { instalacaoMs: number; reaproveitada: boolean };
  msMedioPorVariante: number;
  duracaoMs: number;
  resultados: VariantResult[];
}

interface SignatureGroup {
  assinatura: string;
  vetores: number;
  /**
   * Features com o MESMO valor em todos os vetores que têm esta assinatura.
   *
   * É a pista de qual combinação provoca o defeito ("oauth=1 twoFactor=0"). Com poucos
   * vetores é sobreajustada — um defeito visto em dois vetores terá muitas features em
   * comum por acaso — então é pista, não diagnóstico.
   */
  emComum: string;
  exemplo: string;
}

function groupSignatures(results: VariantResult[]): SignatureGroup[] {
  const groups = new Map<string, VariantResult[]>();
  for (const r of results) {
    for (const s of r.signatures) {
      const list = groups.get(s) ?? [];
      list.push(r);
      groups.set(s, list);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([assinatura, rs]) => {
      const first = rs[0] as VariantResult;
      const common = FEATURE_IDS.filter((f) => rs.every((r) => r.features[f] === first.features[f]))
        .map((f) => `${f}=${first.features[f] ? 1 : 0}`)
        .join(' ');
      return {
        assinatura,
        vetores: rs.length,
        emComum: common,
        exemplo: `npx create-dontpanic ${first.argv.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`,
      };
    });
}

async function readTemplateInfo(): Promise<{ tag?: string; commit?: string }> {
  try {
    const t = JSON.parse(await readFile(join(CLI_ROOT, 'template.json'), 'utf8')) as { tag?: string; commit?: string };
    return { tag: t.tag, commit: t.commit };
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modos
// ─────────────────────────────────────────────────────────────────────────────

function option(rest: string[], name: string): string | undefined {
  return rest.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function intOption(rest: string[], name: string, fallback: number): number {
  const raw = option(rest, name);
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--${name} precisa ser inteiro não negativo (recebi "${raw}")`);
    process.exit(2);
  }
  return n;
}

async function modeList(rest: string[]): Promise<void> {
  const withDrivers = rest.includes('--with-drivers');
  const shards = Math.max(1, intOption(rest, 'shards', 20));
  const space = await loadSpace(option(rest, 'space'));
  const vectors = buildVectors(space, withDrivers);
  const oauthVectors = vectors.filter((v) => v.features['oauth']);
  const fullOauth = oauthVectors.filter((v) => v.representative.recipe.oauth.providers.length === 3).length;

  console.log(`Receitas únicas no espaço da landing: ${space.length}`);
  console.log(`Vetores de ${withDrivers ? 'features + drivers' : 'features'}: ${vectors.length}`);
  console.log(`  com oauth: ${oauthVectors.length} (${fullOauth} com os três providers no representante)`);
  console.log(`\nPlano de ${shards} shard(s) (round-robin sobre a chave canônica):`);
  for (let i = 0; i < shards; i += 1) {
    const s = shardOf(vectors, i, shards);
    console.log(`  shard ${String(i).padStart(3)}: ${String(s.length).padStart(4)} vetores  (${s[0]?.key ?? '—'} … ${s.at(-1)?.key ?? '—'})`);
  }
  console.log(`\nOrdem dos bits: ${FEATURE_IDS.join(' ')}`);
}

async function modeRun(rest: string[]): Promise<void> {
  const withDrivers = rest.includes('--with-drivers');
  const shards = Math.max(1, intOption(rest, 'shards', 1));
  const shard = intOption(rest, 'shard', 0);
  if (shard >= shards) {
    console.error(`--shard=${shard} fora do intervalo [0, ${shards - 1}]`);
    process.exit(2);
  }
  const limit = intOption(rest, 'limit', 0);
  const jobs = Math.max(1, intOption(rest, 'jobs', 3));
  const keep = rest.includes('--keep-failures');
  const out = resolve(option(rest, 'out') ?? `configurator-compile-shard-${shard}.json`);

  for (const [path, hint] of [
    [CLI_BIN, 'rode `pnpm --filter create-dontpanic build` antes'],
    [join(CLI_ROOT, 'template'), 'rode `pnpm sync-template` antes'],
  ] as const) {
    if (!(await pathExists(path))) {
      console.error(`${relative(CLI_ROOT, path)} não existe — ${hint}.`);
      process.exit(2);
    }
  }

  const started = Date.now();
  const log = (m: string): void => console.log(`[shard ${shard}/${shards}] ${m}`);
  const templateInfo = await readTemplateInfo();

  const space = await loadSpace(option(rest, 'space'));
  const vectors = buildVectors(space, withDrivers);
  // `--only=chave1,chave2`: recompilar vetores específicos pela chave que o relatório
  // imprimiu, sem depender de em qual shard eles caíram. Ignora o fatiamento.
  const only = option(rest, 'only')?.split(',').filter(Boolean);
  const mine = only ? vectors.filter((v) => only.includes(v.key)) : shardOf(vectors, shard, shards);
  const targets = limit > 0 ? mine.slice(0, limit) : mine;
  log(`${vectors.length} vetores no espaço, ${mine.length} neste shard, ${targets.length} a compilar.`);

  const baseOption = option(rest, 'base');
  // `realpath`: no macOS o tmpdir é `/var/...` e o eslint imprime o caminho real
  // `/private/var/...`; sem isso o prefixo não sai das assinaturas e nada agrupa.
  await mkdir(baseOption ?? tmpdir(), { recursive: true });
  const baseRoot = await realpath(
    baseOption !== undefined ? resolve(baseOption) : await mkdtemp(join(tmpdir(), 'dp-compile-base-')),
  );
  const base = await prepareBase(baseRoot, log);

  const results: VariantResult[] = [];
  for (const [i, vector] of targets.entries()) {
    const r = await compileVariant(vector, base, { jobs, keep });
    results.push(r);
    const timing = r.steps.map((s) => `${s.step.replace(/ /g, ':')}=${(s.ms / 1000).toFixed(1)}s`).join(' ');
    log(`[${i + 1}/${targets.length}] ${r.ok ? 'ok   ' : 'FALHA'} ${vector.key} em ${(r.ms / 1000).toFixed(1)} s  (${timing})`);
    for (const s of r.signatures.slice(0, 5)) log(`        ${s}`);
    if (r.keptAt) log(`        variante preservada em ${r.keptAt}`);

    // Relatório parcial a cada variante: se o job estourar o timeout, o artefato ainda
    // diz até onde chegou e o que já falhou.
    await writeFile(out, JSON.stringify(buildReport(), null, 2));
  }

  function buildReport(): ShardReport {
    const failures = results.filter((r) => !r.ok);
    return {
      geradoEm: new Date().toISOString(),
      shard,
      shards,
      comDrivers: withDrivers,
      template: templateInfo,
      vetoresNoEspaco: vectors.length,
      vetoresNoShard: mine.length,
      verificados: results.length,
      ok: results.length - failures.length,
      falhas: failures.length,
      base: { instalacaoMs: base.installMs, reaproveitada: base.reused },
      msMedioPorVariante: results.length > 0 ? Math.round(results.reduce((a, r) => a + r.ms, 0) / results.length) : 0,
      duracaoMs: Date.now() - started,
      resultados: results,
    };
  }

  const report = buildReport();
  await writeFile(out, JSON.stringify(report, null, 2));
  if (baseOption === undefined) await rm(baseRoot, { recursive: true, force: true });

  log(`${report.ok}/${report.verificados} ok em ${(report.duracaoMs / 60000).toFixed(1)} min (média ${(report.msMedioPorVariante / 1000).toFixed(1)} s por variante).`);
  for (const g of groupSignatures(results).slice(0, 20)) {
    log(`  ${String(g.vetores).padStart(4)}×  ${g.assinatura}\n          em comum: ${g.emComum}\n          ex.: ${g.exemplo}`);
  }
  log(`relatório: ${out}`);
  if (report.falhas > 0) process.exitCode = 1;
}

/**
 * Junta os relatórios dos shards em Markdown (para o `$GITHUB_STEP_SUMMARY`).
 *
 * Aponta também os shards SEM relatório: um job que morreu antes de escrever o primeiro
 * relatório parcial (install da base falhou, runner perdido) some da contagem, e um
 * resumo que diz "960/960 ok" sobre 912 vetores é o tipo de verde que engana.
 */
async function modeSummarize(rest: string[]): Promise<void> {
  const dir = resolve(option(rest, 'dir') ?? '.');
  const expectedShards = intOption(rest, 'shards', 0);
  const files = (await readdir(dir, { recursive: true }))
    .map(String)
    .filter((f) => /configurator-compile-shard-\d+\.json$/.test(f));
  const reports: ShardReport[] = [];
  for (const f of files) reports.push(JSON.parse(await readFile(join(dir, f), 'utf8')) as ShardReport);
  reports.sort((a, b) => a.shard - b.shard);

  const results = reports.flatMap((r) => r.resultados);
  const failures = results.filter((r) => !r.ok);
  const expectedVectors = reports.reduce((a, r) => a + r.vetoresNoShard, 0);
  const seen = new Set(reports.map((r) => r.shard));
  const missingShards =
    expectedShards > 0 ? [...Array(expectedShards).keys()].filter((i) => !seen.has(i)) : [];
  const groups = groupSignatures(results);
  const byStage = new Map<string, number>();
  for (const f of failures) byStage.set(f.stage, (byStage.get(f.stage) ?? 0) + 1);

  const md: string[] = [];
  md.push('## Compilação do configurador');
  md.push('');
  md.push(`Template: \`${reports[0]?.template.tag ?? '?'}\` · vetores ${reports[0]?.comDrivers ? 'de features + drivers' : 'de features'} · ${reports.length} relatório(s) de shard`);
  md.push('');
  md.push('| total no espaço | verificados | ok | falhas | média por variante |');
  md.push('|---:|---:|---:|---:|---:|');
  const avg = results.length > 0 ? results.reduce((a, r) => a + r.ms, 0) / results.length / 1000 : 0;
  md.push(`| ${reports[0]?.vetoresNoEspaco ?? 0} | ${results.length} | ${results.length - failures.length} | ${failures.length} | ${avg.toFixed(1)} s |`);
  md.push('');
  if (missingShards.length > 0) {
    md.push(`> **Shards sem relatório:** ${missingShards.join(', ')} — os vetores deles NÃO foram verificados.`);
    md.push('');
  }
  if (results.length < expectedVectors) {
    md.push(`> ${expectedVectors - results.length} vetor(es) dos shards que reportaram não chegaram a rodar (timeout ou \`--limit\`).`);
    md.push('');
  }
  if (failures.length > 0) {
    md.push(`Falhas por fase: ${[...byStage.entries()].map(([s, n]) => `${s} ${n}`).join(' · ')}`);
    md.push('');
    md.push('### Assinaturas mais frequentes');
    md.push('');
    for (const g of groups.slice(0, 30)) {
      md.push(`- **${g.vetores}×** \`${g.assinatura.replace(/`/g, "'")}\``);
      md.push(`  - em comum: \`${g.emComum || '—'}\``);
      md.push(`  - reproduzir: \`${g.exemplo}\``);
    }
    if (groups.length > 30) md.push(`- … e mais ${groups.length - 30} assinatura(s) no artefato \`resumo\`.`);
  }
  console.log(md.join('\n'));

  const json = option(rest, 'json');
  if (json) {
    await writeFile(
      json,
      JSON.stringify(
        { verificados: results.length, ok: results.length - failures.length, falhas: failures.length, shardsSemRelatorio: missingShards, assinaturas: groups },
        null,
        2,
      ),
    );
  }
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'list') return modeList(rest);
  if (mode === 'run') return modeRun(rest);
  if (mode === 'summarize') return modeSummarize(rest);
  console.error('Modo: list | run | summarize');
  process.exit(2);
}

await main();
