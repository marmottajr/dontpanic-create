#!/usr/bin/env node
/**
 * A matriz PROFUNDA do configurador: poucas receitas, escolhidas para cobrir interações.
 *
 * `configurator-matrix.ts` percorre o espaço inteiro do assistente, mas só com
 * verificações estáticas — é o que cabe em milhares de receitas. Compilar, testar e rodar
 * o e2e custa ~12 minutos por projeto, então aqui a pergunta muda: **qual é o menor
 * conjunto de receitas em que toda interação de até três respostas aparece pelo menos
 * uma vez?** Defeito de gerador que subtrai quase sempre mora na interação de duas ou
 * três features (a costura que só quebra com "sem convite" E "com login social"), e um
 * covering array acha essas interações com ~100 projetos em vez de ~4 mil.
 *
 * Duas forças, porque as dimensões não valem o mesmo:
 *
 *   3-wise  entre as perguntas do assistente — elas removem código, e é a remoção
 *           combinada que quebra compilação.
 *   2-wise  incluindo os drivers que um link compartilhado ainda permite — driver em
 *           geral troca env, não poda arquivo; pares bastam para pegar o driver que
 *           depende de uma feature.
 *
 * Cada linha é passada pelo MESMO caminho que o usuário percorre: as respostas viram
 * receita como o `use-configurator` faz (inclusive o `syncPlatform`), a receita vira
 * comando por `toFlags` (o que a landing mostra), e o comando passa por `parseArgs` →
 * `reconcileRecipe` → `validateRecipe` (o que o CLI executa). Uma linha que o CLI recusa
 * não entra na matriz — e é listada, porque "o assistente deixa montar e o CLI recusa" é
 * defeito de produto.
 *
 * A cobertura NÃO é confiada ao algoritmo: depois de gerar, o script relê o JSON, refaz
 * cada resposta pelo caminho do CLI, confere que ela cai mesmo na receita do caso, e
 * recalcula as tuplas do zero. Falta uma tupla, sai com código 1.
 *
 * Uso:
 *   node --experimental-strip-types scripts/configurator-deep-matrix.ts           gera e verifica
 *   node --experimental-strip-types scripts/configurator-deep-matrix.ts --check   só verifica
 *        (cobertura do JSON versionado E se ele ainda é o que o gerador produziria hoje)
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import { validateDisplayName, validateSlug } from '../src/naming.ts';
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
import type {
  CacheDriver,
  CaptchaDriver,
  MailDriver,
  OAuthProvider,
  Recipe,
  StorageDriver,
} from '../src/types.ts';

const CLI_ROOT = resolve(import.meta.dirname, '..');
const OUT_FILE = join(CLI_ROOT, 'conformance/deep-matrix.json');

/** Nome das linhas geradas. Cada caso roda no seu runner, então repetir não colide. */
const DEFAULT_PROJECT_NAME = 'Acme Corp';

/**
 * As flags que a conformidade acrescenta ao chamar o CLI. Entram aqui também para que o
 * argv validado seja o argv executado — `--yes` sem nome, por exemplo, é erro de parse.
 */
const CONFORMANCE_EXTRA_FLAGS = ['--no-install', '--no-git', '--yes'];

// ─────────────────────────────────────────────────────────────────────────────
// As dimensões
// ─────────────────────────────────────────────────────────────────────────────

const ENTRY = ['open', 'invite', 'seed'] as const;
const SOCIAL = ['off', 'google', 'apple', 'github', 'google+apple+github'] as const;
const LANGUAGES = ['one', 'many'] as const;
const STORAGE = ['s3', 'local'] as const satisfies readonly StorageDriver[];
const MAIL = ['smtp', 'ses', 'console'] as const satisfies readonly MailDriver[];
const CACHE = ['redis', 'memory'] as const satisfies readonly CacheDriver[];
const QUEUE = ['bullmq', 'memory', 'off'] as const;
/**
 * `n/a` é o valor de "captcha desligado". Existe como valor, e não como ausência, para a
 * linha ser um vetor de tamanho fixo — mas nenhuma tupla com `n/a` é exigida (ela é o
 * mesmo fato que `captcha=não`), e `n/a` só aparece junto de `captcha=não`.
 */
const CAPTCHA_DRIVER = ['turnstile', 'recaptcha-v2', 'recaptcha-v3', 'n/a'] as const;
const NOT_APPLICABLE = CAPTCHA_DRIVER.indexOf('n/a');
const BOOL = [true, false] as const;

type Entry = (typeof ENTRY)[number];
type Social = (typeof SOCIAL)[number];

/** Uma linha da matriz, já legível: é o que vai para o JSON em `respostas`. */
interface DeepAnswers {
  preset: PresetId;
  multiTenant: boolean;
  entry: Entry;
  social: Social;
  twoFactor: boolean;
  languages: (typeof LANGUAGES)[number];
  plans: boolean;
  files: boolean;
  captcha: boolean;
  storage: (typeof STORAGE)[number];
  mail: (typeof MAIL)[number];
  cache: (typeof CACHE)[number];
  queue: (typeof QUEUE)[number];
  captchaDriver: (typeof CAPTCHA_DRIVER)[number];
}

interface Dimension {
  key: keyof DeepAnswers;
  values: readonly (string | boolean)[];
  /** Pergunta do assistente (entra nas triplas) ou driver de link (só nos pares). */
  wizard: boolean;
}

/** A ordem importa: é a ordem dos índices de uma linha e a ordem canônica das tuplas. */
const DIMENSIONS: readonly Dimension[] = [
  { key: 'preset', values: PRESET_IDS, wizard: true },
  { key: 'multiTenant', values: BOOL, wizard: true },
  { key: 'entry', values: ENTRY, wizard: true },
  { key: 'social', values: SOCIAL, wizard: true },
  { key: 'twoFactor', values: BOOL, wizard: true },
  { key: 'languages', values: LANGUAGES, wizard: true },
  { key: 'plans', values: BOOL, wizard: true },
  { key: 'files', values: BOOL, wizard: true },
  { key: 'captcha', values: BOOL, wizard: true },
  { key: 'storage', values: STORAGE, wizard: false },
  { key: 'mail', values: MAIL, wizard: false },
  { key: 'cache', values: CACHE, wizard: false },
  { key: 'queue', values: QUEUE, wizard: false },
  { key: 'captchaDriver', values: CAPTCHA_DRIVER, wizard: false },
];

const DIM_CAPTCHA = DIMENSIONS.findIndex((d) => d.key === 'captcha');
const DIM_CAPTCHA_DRIVER = DIMENSIONS.findIndex((d) => d.key === 'captchaDriver');
const CAPTCHA_YES = BOOL.indexOf(true);

type Row = number[];

function valueAt<T>(values: readonly T[], index: number | undefined): T {
  const value = index === undefined ? undefined : values[index];
  if (value === undefined) throw new Error(`índice fora da dimensão: ${String(index)}`);
  return value;
}

function toAnswers(row: readonly number[]): DeepAnswers {
  return {
    preset: valueAt(PRESET_IDS, row[0]),
    multiTenant: valueAt(BOOL, row[1]),
    entry: valueAt(ENTRY, row[2]),
    social: valueAt(SOCIAL, row[3]),
    twoFactor: valueAt(BOOL, row[4]),
    languages: valueAt(LANGUAGES, row[5]),
    plans: valueAt(BOOL, row[6]),
    files: valueAt(BOOL, row[7]),
    captcha: valueAt(BOOL, row[8]),
    storage: valueAt(STORAGE, row[9]),
    mail: valueAt(MAIL, row[10]),
    cache: valueAt(CACHE, row[11]),
    queue: valueAt(QUEUE, row[12]),
    captchaDriver: valueAt(CAPTCHA_DRIVER, row[13]),
  };
}

function toRow(a: DeepAnswers): Row {
  return DIMENSIONS.map((d) => {
    const index = d.values.indexOf(a[d.key]);
    if (index < 0) throw new Error(`valor desconhecido em ${d.key}: ${String(a[d.key])}`);
    return index;
  });
}

/** Captcha ligado ⇔ driver de captcha real. É a única restrição estrutural entre dimensões. */
function rowIsConsistent(row: readonly number[]): boolean {
  const captchaOn = row[DIM_CAPTCHA] === CAPTCHA_YES;
  const driverReal = row[DIM_CAPTCHA_DRIVER] !== NOT_APPLICABLE;
  return captchaOn === driverReal;
}

// ─────────────────────────────────────────────────────────────────────────────
// Respostas → receita → comando → CLI
// ─────────────────────────────────────────────────────────────────────────────

/** `entryFeatures` da landing (`apps/web/src/lib/wizard-answers.ts`). */
function entryFeatures(entry: Entry): { publicSignup: boolean; invitations: boolean } {
  if (entry === 'open') return { publicSignup: true, invitations: true };
  if (entry === 'invite') return { publicSignup: false, invitations: true };
  return { publicSignup: false, invitations: false };
}

function socialProviders(social: Social): OAuthProvider[] | null {
  if (social === 'off') return null;
  return social.split('+') as OAuthProvider[];
}

/**
 * As respostas aplicadas como o assistente aplica: mutação direta sobre o preset, SEM
 * reconciliar. Reconciliar aqui esconderia justamente o que queremos ver — o comando que
 * a landing mostra é montado da receita crua, e é o CLI quem corrige ou recusa.
 *
 * Reimplementado (e não importado de `configurator-matrix.ts`) porque aquele script roda
 * o `main` no carregamento. As duas cópias seguem `wizard-steps.tsx` passo a passo; se o
 * assistente mudar, as duas mudam juntas.
 */
function applyAnswers(a: DeepAnswers, projectName: string): Recipe {
  const parsedName = parseArgs([projectName]);
  const project = parsedName.recipe?.project ?? { displayName: projectName, slug: projectName };
  const recipe = cloneRecipe(presetRecipe(a.preset, project));
  const f = recipe.features;

  f.multiTenant = a.multiTenant;
  Object.assign(f, entryFeatures(a.entry));

  const providers = socialProviders(a.social);
  f.oauth = providers !== null;
  if (providers !== null) recipe.oauth.providers = providers;

  f.twoFactor = a.twoFactor;

  if (a.languages === 'one') {
    f.i18n = false;
    recipe.i18n.locales = [recipe.i18n.defaultLocale];
  } else {
    f.i18n = true;
    // Como o passo de idiomas: só completa com `en` quando a lista tem menos de dois.
    if (recipe.i18n.locales.length < 2) {
      recipe.i18n.locales = [...new Set([recipe.i18n.defaultLocale, 'en'])];
    }
  }

  f.plans = a.plans;
  f.files = a.files;

  // O assistente só oferece turnstile; os reCAPTCHA chegam por link compartilhado.
  f.captcha = a.captcha;
  recipe.drivers.captcha = a.captcha ? (a.captchaDriver as CaptchaDriver) : 'none';

  // `syncPlatform`: o painel não é pergunta, vem do preset e segue as quatro de que depende.
  if (PRESETS[a.preset].features.platform) {
    f.platform = f.multiTenant && f.invitations && f.plans && f.audit;
  }

  // Drivers de link compartilhado.
  recipe.drivers.storage = a.storage;
  recipe.drivers.mail = a.mail;
  recipe.drivers.cache = a.cache;
  if (a.queue === 'off') {
    f.queue = false;
    recipe.drivers.queue = 'memory';
  } else {
    f.queue = true;
    recipe.drivers.queue = a.queue;
  }

  return recipe;
}

interface CliOutcome {
  recipe?: Recipe;
  /** Mensagens de erro: não vazio = o CLI recusaria. */
  blocking: string[];
}

/** O caminho de `cli.ts`: parse, reconcilia, valida a receita, valida o nome. */
function throughCli(projectName: string, flags: readonly string[]): CliOutcome {
  const parsed = parseArgs([projectName, ...flags, ...CONFORMANCE_EXTRA_FLAGS]);
  if (parsed.errors.length > 0 || parsed.recipe === undefined) {
    return { blocking: parsed.errors.length > 0 ? parsed.errors : ['parseArgs não produziu receita'] };
  }
  const { recipe } = reconcileRecipe(parsed.recipe);
  const blocking = [
    ...validateRecipe(recipe),
    ...validateDisplayName(recipe.project.displayName),
    ...validateSlug(recipe.project.slug),
  ]
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.message);
  return { recipe, blocking };
}

/**
 * Identidade da receita FINAL, mais o slug.
 *
 * O slug entra porque os casos de nome difícil têm a mesma receita do `preset-saas` e
 * existem justamente para variar o nome. Opções de geração (git, install) ficam de fora:
 * a conformidade força as mesmas em todos.
 */
function caseKey(recipe: Recipe): string {
  return JSON.stringify({
    slug: recipe.project.slug,
    features: recipe.features,
    drivers: recipe.drivers,
    i18n: recipe.i18n,
    oauth: recipe.features.oauth ? [...recipe.oauth.providers].sort() : [],
  });
}

/** O comando que a landing mostra para estas respostas, sem o nome. */
function landingFlags(a: DeepAnswers, projectName: string): string[] {
  return toFlags(applyAnswers(a, projectName), a.preset);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tuplas exigidas
// ─────────────────────────────────────────────────────────────────────────────

function combinations(items: readonly number[], size: number): number[][] {
  if (size === 0) return [[]];
  const out: number[][] = [];
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), size - 1)) out.push([item, ...rest]);
  });
  return out;
}

const WIZARD_DIMS = DIMENSIONS.flatMap((d, i) => (d.wizard ? [i] : []));
const ALL_DIMS = DIMENSIONS.map((_, i) => i);

/** Os grupos de dimensões cujas combinações de valores têm de aparecer. */
const INTERACTIONS: { strength: 2 | 3; dims: number[] }[] = [
  ...combinations(WIZARD_DIMS, 3).map((dims) => ({ strength: 3 as const, dims })),
  // Pares entre duas perguntas já estão contidos nas triplas; exigir de novo só infla a
  // contagem sem mudar a matriz.
  ...combinations(ALL_DIMS, 2)
    .filter((dims) => dims.some((d) => !(DIMENSIONS[d]?.wizard ?? false)))
    .map((dims) => ({ strength: 2 as const, dims })),
];

function tupleKey(dims: readonly number[], values: readonly number[]): string {
  return dims.map((d, i) => `${d}=${String(values[i])}`).join('|');
}

/** Uma tupla exigível: sem `n/a`, e sem driver de captcha real com captcha desligado. */
function tupleIsRequired(dims: readonly number[], values: readonly number[]): boolean {
  const driverAt = dims.indexOf(DIM_CAPTCHA_DRIVER);
  if (driverAt < 0) return true;
  if (values[driverAt] === NOT_APPLICABLE) return false;
  const captchaAt = dims.indexOf(DIM_CAPTCHA);
  return captchaAt < 0 || values[captchaAt] === CAPTCHA_YES;
}

function valueProduct(dims: readonly number[]): number[][] {
  let out: number[][] = [[]];
  for (const d of dims) {
    const size = DIMENSIONS[d]?.values.length ?? 0;
    out = out.flatMap((prefix) => Array.from({ length: size }, (_, v) => [...prefix, v]));
  }
  return out;
}

function requiredTuples(): Map<string, 2 | 3> {
  const out = new Map<string, 2 | 3>();
  for (const { strength, dims } of INTERACTIONS) {
    for (const values of valueProduct(dims)) {
      if (tupleIsRequired(dims, values)) out.set(tupleKey(dims, values), strength);
    }
  }
  return out;
}

function tuplesOfRow(row: readonly number[]): string[] {
  return INTERACTIONS.map(({ dims }) => tupleKey(dims, dims.map((d) => row[d] ?? -1)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Geração: guloso determinístico no estilo AETG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PRNG com semente fixa. A matriz tem de sair idêntica a cada execução — os ids `cfg-NNN`
 * aparecem em nome de job e em artefato, e um id que muda de receita entre duas execuções
 * torna impossível comparar "o cfg-042 quebrou ontem e hoje".
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CANDIDATES_PER_ROW = 40;

/** Tuplas ainda descobertas que atribuir `dim=value` completaria, dado o que já está na linha. */
function gain(row: (number | undefined)[], dim: number, value: number, uncovered: Set<string>): number {
  let count = 0;
  for (const { dims } of INTERACTIONS) {
    if (!dims.includes(dim)) continue;
    const values: number[] = [];
    let complete = true;
    for (const d of dims) {
      const v = d === dim ? value : row[d];
      if (v === undefined) {
        complete = false;
        break;
      }
      values.push(v);
    }
    if (complete && uncovered.has(tupleKey(dims, values))) count += 1;
  }
  return count;
}

function parseTupleKey(key: string): { dims: number[]; values: number[] } {
  const parts = key.split('|').map((p) => p.split('=').map(Number));
  return { dims: parts.map((p) => p[0] ?? -1), values: parts.map((p) => p[1] ?? -1) };
}

/**
 * Uma linha candidata: parte de uma tupla descoberta e preenche o resto, dimensão a
 * dimensão, com o valor que mais cobre. O captcha é sempre decidido antes do driver
 * dele, porque é o captcha que diz se o driver pode ser real.
 */
function buildCandidate(seed: string, order: number[], uncovered: Set<string>): Row {
  const row: (number | undefined)[] = new Array<number | undefined>(DIMENSIONS.length).fill(undefined);
  const { dims, values } = parseTupleKey(seed);
  dims.forEach((d, i) => (row[d] = values[i]));
  if (row[DIM_CAPTCHA_DRIVER] !== undefined && row[DIM_CAPTCHA_DRIVER] !== NOT_APPLICABLE) {
    row[DIM_CAPTCHA] = CAPTCHA_YES;
  }

  for (const dim of order) {
    if (row[dim] !== undefined) continue;
    let options = (DIMENSIONS[dim]?.values ?? []).map((_, v) => v);
    if (dim === DIM_CAPTCHA_DRIVER) {
      options = row[DIM_CAPTCHA] === CAPTCHA_YES ? options.filter((v) => v !== NOT_APPLICABLE) : [NOT_APPLICABLE];
    }
    let best = options[0] ?? 0;
    let bestGain = -1;
    for (const v of options) {
      const g = gain(row, dim, v, uncovered);
      if (g > bestGain) {
        bestGain = g;
        best = v;
      }
    }
    row[dim] = best;
  }
  return row.map((v) => v ?? 0);
}

/** Ordem de preenchimento embaralhada, com o driver de captcha sempre depois do captcha. */
function shuffledOrder(random: () => number): number[] {
  const order = ALL_DIMS.filter((d) => d !== DIM_CAPTCHA_DRIVER);
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] ?? 0, order[i] ?? 0];
  }
  return [...order, DIM_CAPTCHA_DRIVER];
}

/** Completa `seed` com qualquer linha que o CLI aceite — o recurso quando a gulosa foi recusada. */
function findAcceptedCompletion(seed: string, projectName: string): Row | undefined {
  const { dims, values } = parseTupleKey(seed);
  const free = ALL_DIMS.filter((d) => !dims.includes(d));
  let tries = 0;
  for (const freeValues of valueProduct(free)) {
    const row: Row = new Array<number>(DIMENSIONS.length).fill(0);
    dims.forEach((d, i) => (row[d] = values[i] ?? 0));
    free.forEach((d, i) => (row[d] = freeValues[i] ?? 0));
    if (!rowIsConsistent(row)) continue;
    tries += 1;
    if (tries > 20_000) return undefined;
    const answers = toAnswers(row);
    if (throughCli(projectName, landingFlags(answers, projectName)).blocking.length === 0) return row;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Os casos
// ─────────────────────────────────────────────────────────────────────────────

interface DeepCase {
  id: string;
  projectName: string;
  flags: string[];
  e2e: boolean;
  /** Para humanos: a receita final em uma linha. */
  resumo: string;
  /** Toda linha de respostas que desemboca exatamente nesta receita. */
  respostas: DeepAnswers[];
}

interface Refusal {
  answers: DeepAnswers;
  flags: string[];
  messages: string[];
}

/** As respostas que um preset já dá sem ninguém mexer. */
function presetAnswers(preset: PresetId): DeepAnswers {
  const def = PRESETS[preset];
  const f = def.features;
  const providers = [...def.oauth.providers].sort().join('+');
  return {
    preset,
    multiTenant: f.multiTenant,
    entry: f.publicSignup ? 'open' : f.invitations ? 'invite' : 'seed',
    social: f.oauth ? (SOCIAL.find((s) => s.split('+').sort().join('+') === providers) ?? 'google+apple+github') : 'off',
    twoFactor: f.twoFactor,
    languages: f.i18n && def.i18n.locales.length > 1 ? 'many' : 'one',
    plans: f.plans,
    files: f.files,
    captcha: f.captcha,
    storage: def.drivers.storage,
    mail: def.drivers.mail,
    cache: def.drivers.cache,
    queue: f.queue ? def.drivers.queue : 'off',
    captchaDriver: f.captcha && def.drivers.captcha !== 'none' ? def.drivers.captcha : 'n/a',
  };
}

function summarize(recipe: Recipe, preset: PresetId): string {
  const f = recipe.features;
  const entry = f.publicSignup ? 'cadastro aberto' : f.invitations ? 'só convite' : 'só seed';
  const parts = [
    preset,
    f.multiTenant ? 'multi-tenant' : 'single-tenant',
    entry,
    f.oauth ? `oauth=${recipe.oauth.providers.join('+')}` : 'sem oauth',
    f.twoFactor ? '2FA' : 'sem 2FA',
    f.i18n ? recipe.i18n.locales.join('+') : `só ${recipe.i18n.defaultLocale}`,
    f.plans ? 'planos' : 'sem planos',
    f.files ? 'arquivos' : 'sem arquivos',
    f.platform ? 'painel' : 'sem painel',
    f.captcha ? `captcha=${recipe.drivers.captcha}` : 'sem captcha',
    `storage=${recipe.drivers.storage}`,
    `mail=${recipe.drivers.mail}`,
    `cache=${recipe.drivers.cache}`,
    f.queue ? `queue=${recipe.drivers.queue}` : 'sem fila',
  ];
  return parts.join(' · ');
}

interface Generated {
  cases: DeepCase[];
  refusals: Refusal[];
  impossible: string[];
  generatedRows: number;
}

function generate(): Generated {
  const cases: DeepCase[] = [];
  const byKey = new Map<string, DeepCase>();
  const refusals: Refusal[] = [];
  const impossible: string[] = [];
  const required = requiredTuples();
  const uncovered = new Set(required.keys());
  let generatedRows = 0;

  /** Registra uma linha aceita: vira caso novo, ou soma respostas a um caso igual. */
  const accept = (id: string | undefined, projectName: string, answers: DeepAnswers): boolean => {
    const flags = landingFlags(answers, projectName);
    const outcome = throughCli(projectName, flags);
    if (outcome.blocking.length > 0 || outcome.recipe === undefined) {
      refusals.push({ answers, flags, messages: outcome.blocking });
      return false;
    }
    for (const t of tuplesOfRow(toRow(answers))) uncovered.delete(t);
    const key = caseKey(outcome.recipe);
    const existing = byKey.get(key);
    if (existing) {
      existing.respostas.push(answers);
      return true;
    }
    const created: DeepCase = {
      id: id ?? `cfg-${String(generatedRows + 1).padStart(3, '0')}`,
      projectName,
      flags,
      e2e: true,
      resumo: summarize(outcome.recipe, answers.preset),
      respostas: [answers],
    };
    if (id === undefined) generatedRows += 1;
    cases.push(created);
    byKey.set(key, created);
    return true;
  };

  // ── Casos fixos, primeiro: a cobertura deles conta, e os ids não dependem da gulosa ──
  for (const preset of PRESET_IDS) accept(`preset-${preset}`, DEFAULT_PROJECT_NAME, presetAnswers(preset));
  // Os dois caminhos de `slugify` que já quebraram uma vez: acento e camelCase.
  accept('nome-acentuado', 'Ação Rápida', presetAnswers('saas'));
  accept('nome-camelcase', 'MinhaLoja', presetAnswers('saas'));
  // Os exemplos que motivaram a matriz, exatamente como alguém os monta no assistente:
  // parte do preset padrão e muda UMA resposta. No segundo, a porta de entrada continua
  // "aberta" na tela e é o CLI quem desliga o cadastro público — é esse caminho que importa.
  accept('sem-captcha', DEFAULT_PROJECT_NAME, { ...presetAnswers('saas'), captcha: false, captchaDriver: 'n/a' });
  accept('captcha-sem-multi-tenancy', DEFAULT_PROJECT_NAME, { ...presetAnswers('saas'), multiTenant: false });

  // Receitas que só o TERMINAL monta. O assistente não pergunta o idioma default — ele vem
  // do preset, e os quatro são `pt` —, então nenhuma linha de respostas desemboca num
  // projeto só em inglês. E foi exatamente esse projeto que nasceu sem compilar: as
  // costuras de i18n só sabiam descartar o inglês. O caso entra com as flags do CLI e SEM
  // respostas: não soma cobertura de tupla (não responde pergunta nenhuma do assistente),
  // só garante que a combinação é gerada, instalada e testada, e2e incluso.
  const acceptFlags = (id: string, projectName: string, flags: string[], preset: PresetId): void => {
    const outcome = throughCli(projectName, flags);
    // Lança em vez de registrar recusa: um caso fixo que o CLI recusa é defeito deste
    // script, e seguir em silêncio tiraria o caso da matriz sem ninguém notar.
    if (outcome.blocking.length > 0 || outcome.recipe === undefined) {
      throw new Error(`[${id}] o CLI recusa o caso fixo: ${outcome.blocking.join(' / ')}`);
    }
    const key = caseKey(outcome.recipe);
    const existing = byKey.get(key);
    if (existing) throw new Error(`[${id}] o caso fixo repete a receita de ${existing.id}`);
    const created: DeepCase = {
      id,
      projectName,
      flags,
      e2e: true,
      resumo: summarize(outcome.recipe, preset),
      respostas: [],
    };
    cases.push(created);
    byKey.set(key, created);
  };
  acceptFlags('idioma-unico-en', DEFAULT_PROJECT_NAME, ['--default-locale=en', '--i18n=false'], 'saas');

  // ── A gulosa ──
  const random = mulberry32(0x0dec0de);
  while (uncovered.size > 0) {
    const pending = [...uncovered];
    let bestRow: Row | undefined;
    let bestCover = -1;
    let bestSeed = pending[0] ?? '';
    for (let k = 0; k < CANDIDATES_PER_ROW; k += 1) {
      // O primeiro candidato parte da primeira tupla descoberta (triplas vêm antes, na
      // ordem canônica); os demais, de tuplas sorteadas — é a diversidade que tira a
      // gulosa de um mínimo local ruim sem abrir mão do determinismo.
      const seed = k === 0 ? (pending[0] ?? '') : (pending[Math.floor(random() * pending.length)] ?? '');
      const row = buildCandidate(seed, shuffledOrder(random), uncovered);
      const cover = tuplesOfRow(row).filter((t) => uncovered.has(t)).length;
      if (cover > bestCover) {
        bestCover = cover;
        bestRow = row;
        bestSeed = seed;
      }
    }
    if (bestRow === undefined) break;

    if (accept(undefined, DEFAULT_PROJECT_NAME, toAnswers(bestRow))) continue;

    // Recusada pelo CLI. A gulosa escolheria a mesma linha de novo, então procura-se
    // qualquer completude aceita da tupla-semente; se nenhuma existe, a tupla é
    // impossível — e isso é defeito de produto, não de matriz.
    const fallback = findAcceptedCompletion(bestSeed, DEFAULT_PROJECT_NAME);
    if (fallback !== undefined && accept(undefined, DEFAULT_PROJECT_NAME, toAnswers(fallback))) continue;
    impossible.push(bestSeed);
    uncovered.delete(bestSeed);
  }

  return { cases, refusals, impossible, generatedRows };
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialização e verificação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * JSON com uma linha por flag-list e por resposta. `JSON.stringify(_, null, 2)` explodiria
 * cada flag e cada campo de resposta numa linha, e um diff de matriz ficaria ilegível.
 */
function serialize(cases: readonly DeepCase[]): string {
  const blocks = cases.map((c) =>
    [
      '  {',
      `    "id": ${JSON.stringify(c.id)},`,
      `    "projectName": ${JSON.stringify(c.projectName)},`,
      `    "flags": ${JSON.stringify(c.flags)},`,
      `    "e2e": ${String(c.e2e)},`,
      `    "resumo": ${JSON.stringify(c.resumo)},`,
      // Um caso só de CLI não tem respostas; `[` + linha vazia + `]` seria JSON válido e
      // diff feio.
      ...(c.respostas.length === 0
        ? ['    "respostas": []']
        : ['    "respostas": [', c.respostas.map((a) => `      ${JSON.stringify(a)}`).join(',\n'), '    ]']),
      '  }',
    ].join('\n'),
  );
  return `[\n${blocks.join(',\n')}\n]\n`;
}

function tupleLabel(key: string): string {
  const { dims, values } = parseTupleKey(key);
  return dims
    .map((d, i) => {
      const dim = DIMENSIONS[d];
      return `${dim?.key ?? '?'}=${String(dim?.values[values[i] ?? -1])}`;
    })
    .join(', ');
}

interface Verification {
  errors: string[];
  covered: { 2: number; 3: number };
  required: { 2: number; 3: number };
}

/**
 * Recalcula tudo do JSON, sem confiar em nada que a geração anotou.
 *
 * Para cada caso: o comando dele tem de ser aceito pelo CLI; cada resposta listada tem de
 * ser aceita e desembocar na MESMA receita final (senão a cobertura atribuída ao caso é
 * de outro projeto). Só então as tuplas das respostas contam.
 */
function verify(cases: readonly DeepCase[]): Verification {
  const errors: string[] = [];
  const covered = new Set<string>();
  const ids = new Set<string>();

  for (const c of cases) {
    if (ids.has(c.id)) errors.push(`id repetido: ${c.id}`);
    ids.add(c.id);
    const own = throughCli(c.projectName, c.flags);
    if (own.blocking.length > 0 || own.recipe === undefined) {
      errors.push(`[${c.id}] o CLI recusa o comando do caso: ${own.blocking.join(' / ')}`);
      continue;
    }
    const key = caseKey(own.recipe);
    for (const answers of c.respostas) {
      const out = throughCli(c.projectName, landingFlags(answers, c.projectName));
      if (out.recipe === undefined || out.blocking.length > 0) {
        errors.push(`[${c.id}] resposta recusada pelo CLI: ${JSON.stringify(answers)}`);
        continue;
      }
      if (caseKey(out.recipe) !== key) {
        errors.push(`[${c.id}] resposta não desemboca na receita do caso: ${JSON.stringify(answers)}`);
        continue;
      }
      const row = toRow(answers);
      if (!rowIsConsistent(row)) errors.push(`[${c.id}] captcha e driver incoerentes: ${JSON.stringify(answers)}`);
      for (const t of tuplesOfRow(row)) covered.add(t);
    }
  }

  const required = requiredTuples();
  const counts = { covered: { 2: 0, 3: 0 }, required: { 2: 0, 3: 0 } };
  const missing: string[] = [];
  for (const [key, strength] of required) {
    counts.required[strength] += 1;
    if (covered.has(key)) counts.covered[strength] += 1;
    else missing.push(`${strength}-wise: ${tupleLabel(key)}`);
  }
  for (const m of missing.slice(0, 30)) errors.push(`tupla descoberta — ${m}`);
  if (missing.length > 30) errors.push(`... e mais ${missing.length - 30} tupla(s) descoberta(s)`);

  return { errors, ...counts };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────────────────────

/** ~12 min por caso com e2e, 20 runners em paralelo: o que o workflow vai custar. */
function ciEstimate(total: number): string {
  const minutesPerCase = 12;
  const parallel = 20;
  const wall = Math.ceil(total / parallel) * minutesPerCase;
  const runnerHours = ((total * minutesPerCase) / 60).toFixed(1);
  return `~${wall} min de relógio com ${parallel} em paralelo, ~${runnerHours} h de runner`;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const generated = generate();
  const fresh = serialize(generated.cases);

  if (!checkOnly) {
    await mkdir(dirname(OUT_FILE), { recursive: true });
    await writeFile(OUT_FILE, fresh);
  }

  // Verifica o que está NO DISCO: é o arquivo que o workflow lê, não a estrutura em memória.
  const onDisk = await readFile(OUT_FILE, 'utf8').catch(() => undefined);
  if (onDisk === undefined) {
    console.error(`${OUT_FILE} não existe. Rode sem --check para gerá-lo.`);
    process.exit(1);
  }
  const cases = JSON.parse(onDisk) as DeepCase[];
  const result = verify(cases);

  console.log(`Matriz profunda do configurador: ${cases.length} caso(s)`);
  console.log(
    `  fixos: ${cases.length - generated.generatedRows}; gerados pela gulosa: ${generated.generatedRows}; ` +
      `linhas de resposta que colapsaram numa receita já presente: ${cases.reduce((n, c) => n + Math.max(0, c.respostas.length - 1), 0)}`,
  );
  console.log(`  triplas (3-wise, perguntas do assistente): ${result.covered[3]}/${result.required[3]}`);
  console.log(`  pares (2-wise, com drivers de link):       ${result.covered[2]}/${result.required[2]}`);
  console.log(`  estimativa em CI: ${ciEstimate(cases.length)}`);
  if (cases.length > 256) {
    console.log('  acima de 256 casos: o workflow particiona a matriz em lotes (limite do GitHub por matriz).');
  }

  if (generated.refusals.length > 0) {
    // Não derruba a execução: a linha recusada foi trocada por outra que cobre o mesmo.
    // Mas cada uma é um caminho em que a landing monta um comando que o terminal recusa.
    console.log(`\nDEFEITO DE PRODUTO — o assistente permite e o CLI recusa (${generated.refusals.length}):`);
    for (const r of generated.refusals.slice(0, 20)) {
      console.log(`  npx create-dontpanic "${DEFAULT_PROJECT_NAME}" ${r.flags.join(' ')}`);
      for (const m of r.messages) console.log(`    ✖ ${m.slice(0, 200)}`);
    }
  }
  if (generated.impossible.length > 0) {
    console.log(`\nTuplas que NENHUMA receita aceita pelo CLI cobre (${generated.impossible.length}):`);
    for (const t of generated.impossible) console.log(`  ${tupleLabel(t)}`);
  }

  if (checkOnly && onDisk !== fresh) {
    // O JSON é versionado; `recipe.ts` muda sem ele. Uma matriz velha testaria comandos
    // que a landing já não monta — verde e irrelevante. Falhar aqui é o que obriga a
    // regenerar no mesmo commit.
    result.errors.push(
      'deep-matrix.json está desatualizado em relação ao gerador (recipe.ts ou o assistente mudaram). ' +
        'Rode: node --experimental-strip-types packages/cli/scripts/configurator-deep-matrix.ts',
    );
  }

  if (result.errors.length > 0) {
    console.error(`\nVerificação FALHOU (${result.errors.length}):`);
    for (const e of result.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\nCobertura verificada a partir de ${checkOnly ? 'o JSON versionado' : OUT_FILE}.`);
}

await main();
