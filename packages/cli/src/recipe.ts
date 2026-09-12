/**
 * Presets, receita, parse de argv e validação de coerência.
 *
 * Este módulo é a autoridade sobre o que uma receita significa — e é compartilhado com a
 * landing page, que monta a linha de comando a partir dos mesmos presets. Duas cópias da
 * tabela de presets divergiriam no primeiro ajuste, e a divergência apareceria como "o site
 * prometeu X e o CLI gerou Y", que é o pior lugar para descobrir.
 *
 * Nada aqui toca o disco. O parse, a validação e a reconciliação são funções puras porque
 * a landing roda no browser e os testes precisam exercitar mil combinações sem `mkdtemp`.
 */

import {
  CACHE_DRIVERS,
  CAPTCHA_DRIVERS,
  DB_DRIVERS,
  FEATURE_IDS,
  MAIL_DRIVERS,
  OAUTH_PROVIDERS,
  QUEUE_DRIVERS,
  STORAGE_DRIVERS,
} from './types.ts';
import type {
  CacheDriver,
  CaptchaDriver,
  DbDriver,
  DriverSelection,
  FeatureId,
  FeatureSelection,
  MailDriver,
  OAuthProvider,
  ProjectIdentity,
  QueueDriver,
  Recipe,
  StorageDriver,
} from './types.ts';
import { slugify, validateSlug } from './naming.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

export type PresetId = 'minimal' | 'saas' | 'complete' | 'internal';

export interface PresetDefinition {
  id: PresetId;
  label: string;
  summary: string;
  /** Para quem é este preset, 1-2 frases. Aparece na landing. */
  audience: string;
  features: FeatureSelection;
  drivers: DriverSelection;
  i18n: { locales: string[]; defaultLocale: string };
  oauth: { providers: OAuthProvider[] };
}

/**
 * Ordem de apresentação: do menor para o maior, com `internal` no fim porque é o caso
 * especial (single-tenant e sem porta pública) e não um degrau da mesma escada.
 */
export const PRESET_IDS = ['minimal', 'saas', 'complete', 'internal'] as const;

/** `saas` é o default porque é o que o boilerplate é: um SaaS multi-tenant com convites. */
export const DEFAULT_PRESET: PresetId = 'saas';

/** Constrói uma `FeatureSelection` completa a partir da lista do que está ligado. */
function featuresOn(on: readonly FeatureId[]): FeatureSelection {
  const selection = {} as FeatureSelection;
  // Parte de tudo desligado e liga o que foi pedido: um preset novo que esqueça de
  // mencionar uma feature nasce sem ela, em vez de herdar o que o vizinho tinha.
  for (const id of FEATURE_IDS) selection[id] = false;
  for (const id of on) selection[id] = true;
  return selection;
}

/**
 * Features que a v1 não deixa desligar.
 *
 * `audit` está aqui por três motivos medidos no mapa de features: cinco escritores
 * independentes, ~30 sítios de chamada, e — o que fecha a questão — o export de LGPD
 * RETORNA linhas de auditoria (`users.service.ts:384-401`). Removê-la não é podar uma
 * feature, é reescrever um contrato de resposta. Ver I4 em docs/maps/feature-surface.md §5.
 */
export const ALWAYS_ON: readonly FeatureId[] = ['audit'];

export const PRESETS: Record<PresetId, PresetDefinition> = {
  /**
   * Uma organização só, e ninguém entra sozinho.
   *
   * A cadeia que justifica cada "off" não é gosto, é consequência: single-tenant força
   * `publicSignup: false` (em single-tenant o signup É criação de empresa — I11), o que
   * torna o painel da plataforma sem sentido (I12), o que libera `plans` e `invitations`
   * (o painel é quem os exige, hard), e sem `plans` desligar `invitations` não custa nada
   * porque `assertCanAddUser` não tinha outro chamador.
   *
   * Consequência que precisa estar na cara: `db:seed` passa a ser a ÚNICA porta de entrada
   * do produto (I19). O CLI avisa; o README do gerado abre com isso.
   *
   * `queue` fica LIGADA com driver `memory` — "port + memory". A forma "port com zero jobs"
   * não compila (I8: `JobName` vira `never` e o `JobRouter` quebra em TS2339), então as
   * únicas duas formas legais são manter o port com `mail.send`, ou remover a abstração
   * inteira e injetar `MAIL_PROVIDER` nos três services. O preset mínimo escolhe a primeira,
   * que preserva os três construtores `@Inject(QUEUE_PROVIDER)` intactos.
   *
   * `scaffolding` sai: os blocos prontos são o que se espera achar num boilerplate, mas quem
   * pede o preset mínimo está pedindo um repo sem código que ele não escreveu.
   */
  minimal: {
    id: 'minimal',
    label: 'Mínimo',
    summary: 'Single-tenant, entrada só pelo seed. Auth, auditoria e o port de fila.',
    audience:
      'Para uma organização só, com um punhado de usuários criados pelo seed. É a base de login segura e nada mais — sem cadastro aberto, sem convites, sem cobrança.',
    features: featuresOn(['audit', 'queue']),
    drivers: {
      db: 'postgresql',
      storage: 'local',
      mail: 'smtp',
      // Sem Redis: cache em memória e fila inline. Só vale para UMA instância — o throttler
      // anda no port de cache, então N réplicas dão N× o orçamento de rate limit (I15).
      cache: 'memory',
      queue: 'memory',
      captcha: 'none',
    },
    i18n: { locales: ['pt'], defaultLocale: 'pt' },
    oauth: { providers: [] },
  },

  /**
   * O default, e o que a maioria quer: tudo que paga aluguel, menos as duas coisas que
   * exigem console de terceiro no primeiro dia.
   *
   * `platform` arrasta `invitations`, `plans` e `audit` junto (as três arestas hard de §4),
   * então este é o preset mais BARATO que inclui o painel do operador — não existe "um
   * pouco de painel".
   *
   * `oauth` fora, e isso economiza mais do que parece: `passwordHash` volta a ser NOT NULL
   * (I7, o que apaga também o `ABSENT_PASSWORD_HASH` e o ramo nulo do `verifyPassword`), o
   * `main.ts` mantém o hook de CSRF simples e volta a responder 415 a urlencoded, o
   * `validateEnv` perde 34 linhas de checagem de boot, e o cookie do ticket de 2FA sai do
   * `packages/shared`.
   *
   * Captcha LIGADO porque `saas` significa que existe formulário público de cadastro.
   */
  saas: {
    id: 'saas',
    label: 'SaaS',
    summary: 'Multi-tenant com RLS, painel do operador, convites, planos, 2FA e captcha.',
    audience:
      'Para um SaaS B2B self-service: cada cliente é uma empresa, com assentos, convites e limite de plano. É o default, e é o preset mais barato que já inclui o painel da plataforma.',
    features: featuresOn([
      'multiTenant',
      'twoFactor',
      'invitations',
      'publicSignup',
      'files',
      'platform',
      'audit',
      'plans',
      'i18n',
      'queue',
      'captcha',
      'scaffolding',
    ]),
    drivers: {
      db: 'postgresql',
      storage: 's3',
      mail: 'smtp',
      cache: 'redis',
      queue: 'bullmq',
      captcha: 'turnstile',
    },
    i18n: { locales: ['pt', 'en'], defaultLocale: 'pt' },
    oauth: { providers: [] },
  },

  /**
   * O boilerplate inteiro, como ele é entregue.
   *
   * Acrescenta `oauth` — o que OBRIGA o desvio de 2FA no callback (I5): sem ele, "entrar com
   * o Google" fica estritamente mais fraco que digitar a senha, e o fator que o usuário
   * ligou de propósito nunca é pedido. Não é configuração, é emissão obrigatória.
   *
   * Os três providers, Apple incluída, porque "tudo" quer dizer tudo. O ônus operacional é
   * real e o CLI diz na geração: três consoles de provedor, `OAUTH_CALLBACK_BASE_URL`
   * batendo caractere a caractere, e `NEXT_PUBLIC_OAUTH_PROVIDERS` concordando com
   * `OAUTH_PROVIDERS` — senão o botão extra dá 404. A Apple ainda exige Services ID, Team
   * ID e uma chave `.p8` de conta paga.
   */
  complete: {
    id: 'complete',
    label: 'SaaS completo',
    summary: 'Tudo: login social nos três provedores, captcha, painel e easter eggs.',
    audience:
      'Para ver o boilerplate inteiro, ou para quem já sabe que vai precisar de tudo. Exige três consoles de OAuth e uma chave de captcha antes do primeiro login.',
    features: featuresOn([...FEATURE_IDS]),
    drivers: {
      db: 'postgresql',
      storage: 's3',
      mail: 'smtp',
      cache: 'redis',
      queue: 'bullmq',
      captcha: 'turnstile',
    },
    i18n: { locales: ['pt', 'en'], defaultLocale: 'pt' },
    oauth: { providers: ['google', 'apple', 'github'] },
  },

  /**
   * Multi-tenant, mas venda assistida: ninguém se cadastra sozinho.
   *
   * É o preset para o qual o rework de convites foi feito. Multi-tenancy fica COMPLETA (há
   * muitas empresas clientes), mas as únicas portas são o painel do operador e o convite:
   * `POST /platform/tenants` cria a empresa e convida o primeiro admin, e esse admin
   * convida o resto. Sem registro público, então `signup.service.ts`, `/signup` e o bloco
   * i18n `auth.signup.*` saem — exceto `acceptTerms`, que a tela de aceite de convite
   * renderiza.
   *
   * Captcha fica ligado porque `login` e `forgot-password` continuam sendo formulários
   * públicos. `TWO_FACTOR_REQUIRED=true` é o default natural aqui (é env, não feature).
   * Storage local em vez de S3 combina com deploy on-prem — o que obriga o gerador a
   * acrescentar o wiring de `@fastify/static` (I17).
   */
  internal: {
    id: 'internal',
    label: 'Interno / venda assistida',
    summary: 'Multi-tenant sem cadastro aberto: entra-se por convite do operador.',
    audience:
      'Para produto vendido por time comercial, ou ferramenta usada por várias organizações clientes: o operador cria a empresa no painel e convida o primeiro admin. Nenhum desconhecido se cadastra.',
    features: featuresOn([
      'multiTenant',
      'twoFactor',
      'invitations',
      'files',
      'platform',
      'audit',
      'plans',
      'queue',
      'captcha',
      'scaffolding',
    ]),
    drivers: {
      db: 'postgresql',
      storage: 'local',
      mail: 'smtp',
      cache: 'redis',
      queue: 'bullmq',
      captcha: 'turnstile',
    },
    i18n: { locales: ['pt'], defaultLocale: 'pt' },
    oauth: { providers: [] },
  },
};

/**
 * Rótulos das features para o terminal, os prompts e a landing.
 *
 * TODO(integração): quando `src/features/manifest.ts` existir, `label` e `summary` devem
 * vir de lá — o manifesto é quem descreve a feature, e duas fontes de rótulo divergem. Até
 * então o CLI precisa de texto para o multiselect e para o resumo.
 */
export const FEATURE_INFO: Record<FeatureId, { label: string; summary: string }> = {
  multiTenant: {
    label: 'Multi-tenancy',
    // Desligar NÃO arranca o RLS: gera modo single-tenant, com um tenant fixo semeado e a
    // UI de troca escondida. A garantia do Postgres continua provada pelo e2e (ADR 0002).
    summary: 'Várias empresas isoladas por RLS. Desligado = single-tenant (o RLS fica).',
  },
  twoFactor: { label: '2FA (TOTP)', summary: 'Segundo fator por app, com códigos de backup.' },
  oauth: { label: 'Login social', summary: 'Entrar com Google, Apple ou GitHub.' },
  invitations: { label: 'Convites', summary: 'A porta de entrada de uma empresa que já existe.' },
  publicSignup: { label: 'Registro público', summary: 'Qualquer um cria empresa pelo formulário.' },
  files: { label: 'Arquivos', summary: 'Upload e download por S3/MinIO ou disco local.' },
  platform: {
    label: 'Painel da plataforma',
    summary: 'Área do SUPERADMIN. Exige convites, planos e auditoria — não existe meio painel.',
  },
  audit: {
    label: 'Auditoria',
    summary: 'Trilha de quem fez o quê. Sempre ligada na v1 (o export de LGPD a retorna).',
  },
  plans: { label: 'Planos e limites', summary: 'Assentos e feature flags por empresa.' },
  i18n: {
    label: 'Múltiplos idiomas',
    // Desligar não remove o i18n — ele tem 50 call sites e um segundo sistema bilíngue
    // dentro da API (I9). Desligado significa "um idioma só", com o maquinário no lugar.
    summary: 'Mais de um idioma. Desligado = um idioma só, com o i18n ainda no código.',
  },
  queue: {
    label: 'Fila de jobs',
    summary: 'Port de fila com BullMQ. Desligado remove o port e injeta MAIL_PROVIDER direto.',
  },
  captcha: { label: 'Captcha', summary: 'Turnstile ou reCAPTCHA nas rotas públicas.' },
  easterEggs: { label: 'Easter eggs', summary: 'Marvin, Konami no dashboard, GET /teapot.' },
  scaffolding: {
    label: 'Blocos de construção',
    summary: 'Grid de registros, cards de dashboard, sequence service — prontos e não usados.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Receita
// ─────────────────────────────────────────────────────────────────────────────

/** Cópia profunda. A receita é mutada durante o parse e a reconciliação; compartilhar
 * o array de locales de um preset faria a segunda geração herdar a primeira. */
export function cloneRecipe(recipe: Recipe): Recipe {
  return {
    v: 1,
    project: cloneIdentity(recipe.project),
    features: { ...recipe.features },
    drivers: { ...recipe.drivers },
    i18n: { locales: [...recipe.i18n.locales], defaultLocale: recipe.i18n.defaultLocale },
    oauth: { providers: [...recipe.oauth.providers] },
    options: { ...recipe.options },
  };
}

function cloneIdentity(project: ProjectIdentity): ProjectIdentity {
  // `exactOptionalPropertyTypes` recusa `description: undefined` num campo `description?`,
  // então a ausência tem que ser ausência de chave, não chave com undefined.
  return {
    displayName: project.displayName,
    slug: project.slug,
    ...(project.description !== undefined ? { description: project.description } : {}),
  };
}

/** Receita a partir de um preset + identidade do projeto. */
export function presetRecipe(preset: PresetId, project: ProjectIdentity): Recipe {
  const def = PRESETS[preset];
  return {
    v: 1,
    project: cloneIdentity(project),
    features: { ...def.features },
    drivers: { ...def.drivers },
    i18n: { locales: [...def.i18n.locales], defaultLocale: def.i18n.defaultLocale },
    oauth: { providers: [...def.oauth.providers] },
    // Defaults de opção não moram no preset: preset é sobre o produto gerado, e
    // git/install/docker são sobre a máquina de quem está gerando.
    options: { git: true, install: true, docker: true, force: false },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Nomes de flag — derivados de FEATURE_IDS, nunca escritos à mão
// ─────────────────────────────────────────────────────────────────────────────

function kebab(id: string): string {
  return id.replace(/(?<=[a-z0-9])(?=[A-Z])/g, '-').toLowerCase();
}

/**
 * `FeatureId` → nome de flag em kebab-case, gerado. Uma segunda lista escrita à mão
 * apodrece no dia em que alguém adiciona uma feature e esquece metade.
 */
export const FEATURE_FLAGS: Record<FeatureId, string> = Object.fromEntries(
  FEATURE_IDS.map((id) => [id, kebab(id)]),
) as Record<FeatureId, string>;

/**
 * Apelidos que ninguém adivinharia a partir do id. `--2fa` é como a feature se chama em
 * português falado e é o que aparece na documentação do boilerplate; `--two-factor`
 * continua valendo porque é o kebab do id.
 */
const FEATURE_ALIASES: Record<string, FeatureId> = {
  '2fa': 'twoFactor',
  totp: 'twoFactor',
  multitenant: 'multiTenant',
  tenants: 'multiTenant',
  signup: 'publicSignup',
  'easter-egg': 'easterEggs',
  i18n: 'i18n',
};

/** Nome curto e canônico que `toFlags` emite para cada feature. */
const FEATURE_CANONICAL_FLAG: Record<FeatureId, string> = {
  ...FEATURE_FLAGS,
  twoFactor: '2fa',
};

/** Resolve um nome de flag (kebab ou apelido) para o `FeatureId`. */
function featureFromFlag(name: string): FeatureId | undefined {
  for (const id of FEATURE_IDS) if (FEATURE_FLAGS[id] === name) return id;
  return FEATURE_ALIASES[name];
}

/**
 * Flags que carregam valor. Exigimos `--flag=valor` e recusamos `--flag valor`: quatro
 * destas (`--i18n`, `--oauth`, `--captcha`, `--queue`) também existem como booleanas, e a
 * forma com espaço deixaria `create --i18n acme` engolir o nome do projeto como lista de
 * idiomas. Ambiguidade que o usuário só descobre depois não vale a economia de um `=`.
 */
const VALUE_FLAGS = [
  'preset',
  'i18n',
  'default-locale',
  'oauth',
  'captcha',
  'db',
  'storage',
  'mail',
  'cache',
  'queue',
  'slug',
  'name',
  'description',
] as const;

const META_FLAGS = ['help', 'version', 'yes', 'debug', 'dry-run', 'force'] as const;
const OPTION_FLAGS = ['git', 'install', 'docker'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// toFlags / buildCommand
// ─────────────────────────────────────────────────────────────────────────────

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * As flags mínimas que reproduzem esta receita (só o que difere do preset base).
 *
 * "Mínimo" é medido contra o preset, não contra o vazio: é o que mantém a linha da landing
 * legível — `--preset=saas --no-2fa` em vez de treze booleanas. Cada dimensão que difere
 * rende uma flag; dimensões compostas (feature + valor, como i18n e captcha) rendem a flag
 * de valor, que liga a feature de tabela.
 */
export function toFlags(recipe: Recipe, basePreset?: PresetId): string[] {
  const base = presetRecipe(basePreset ?? chooseBasePreset(recipe), recipe.project);
  const flags: string[] = [];
  const preset = basePreset ?? chooseBasePreset(recipe);

  if (preset !== DEFAULT_PRESET) flags.push(`--preset=${preset}`);

  // A ordem segue FEATURE_IDS para a linha ser estável entre execuções — um comando que
  // muda de ordem sozinho não serve para colar num README nem para diffar num CI.
  for (const id of FEATURE_IDS) {
    switch (id) {
      case 'i18n':
        flags.push(...i18nFlags(recipe, base));
        break;
      case 'oauth':
        flags.push(...oauthFlags(recipe, base));
        break;
      case 'captcha':
        flags.push(...captchaFlags(recipe, base));
        break;
      case 'queue':
        flags.push(...queueFlags(recipe, base));
        break;
      default: {
        if (recipe.features[id] === base.features[id]) break;
        const name = FEATURE_CANONICAL_FLAG[id];
        flags.push(recipe.features[id] ? `--${name}` : `--no-${name}`);
      }
    }
  }

  // Não existe flag `--db=`: `DB_DRIVERS` tem um único valor (`postgresql`), então a
  // comparação com o preset estreita o tipo para `never` e o compilador prova que a linha
  // é inalcançável — foi o lint com informação de tipo que apontou. O banco não é escolha
  // porque o isolamento entre empresas é PL/pgSQL puro (ver o comentário em `types.ts`).
  // Quando existir um segundo adapter de verdade, a flag volta para cá.
  if (recipe.drivers.storage !== base.drivers.storage)
    flags.push(`--storage=${recipe.drivers.storage}`);
  if (recipe.drivers.mail !== base.drivers.mail) flags.push(`--mail=${recipe.drivers.mail}`);
  if (recipe.drivers.cache !== base.drivers.cache) flags.push(`--cache=${recipe.drivers.cache}`);

  // O slug só vale a pena na linha quando o usuário o customizou: derivado do nome, ele é
  // redundante — e um `--slug` redundante convida alguém a editar o nome e esquecer o slug.
  if (recipe.project.slug !== slugify(recipe.project.displayName))
    flags.push(`--slug=${recipe.project.slug}`);
  if (recipe.project.description !== undefined)
    flags.push(`--description=${recipe.project.description}`);

  if (!recipe.options.git) flags.push('--no-git');
  if (!recipe.options.install) flags.push('--no-install');
  if (!recipe.options.docker) flags.push('--no-docker');
  if (recipe.options.force) flags.push('--force');

  return flags;
}

function i18nFlags(recipe: Recipe, base: Recipe): string[] {
  const same =
    recipe.features.i18n === base.features.i18n &&
    sameList(recipe.i18n.locales, base.i18n.locales) &&
    recipe.i18n.defaultLocale === base.i18n.defaultLocale;
  if (same) return [];

  if (!recipe.features.i18n) {
    const out = ['--i18n=false'];
    // Com i18n desligado o idioma único é o `defaultLocale` — é ele que manda, e a
    // reconciliação colapsa `locales` nele. Por isso a flag aqui é `--default-locale`.
    if (recipe.i18n.defaultLocale !== base.i18n.defaultLocale)
      out.push(`--default-locale=${recipe.i18n.defaultLocale}`);
    return out;
  }

  const out = [`--i18n=${recipe.i18n.locales.join(',')}`];
  // `--i18n=pt,en` já implica default `pt` (o primeiro da lista); só emitimos
  // `--default-locale` quando o default não é o primeiro.
  if (recipe.i18n.defaultLocale !== recipe.i18n.locales[0])
    out.push(`--default-locale=${recipe.i18n.defaultLocale}`);
  return out;
}

function oauthFlags(recipe: Recipe, base: Recipe): string[] {
  if (!recipe.features.oauth) return base.features.oauth ? ['--oauth=false'] : [];
  if (!base.features.oauth || !sameList(recipe.oauth.providers, base.oauth.providers))
    return [`--oauth=${recipe.oauth.providers.join(',')}`];
  return [];
}

function captchaFlags(recipe: Recipe, base: Recipe): string[] {
  if (!recipe.features.captcha) return base.features.captcha ? ['--captcha=none'] : [];
  if (!base.features.captcha || recipe.drivers.captcha !== base.drivers.captcha)
    return [`--captcha=${recipe.drivers.captcha}`];
  return [];
}

function queueFlags(recipe: Recipe, base: Recipe): string[] {
  if (!recipe.features.queue) return base.features.queue ? ['--no-queue'] : [];
  if (!base.features.queue || recipe.drivers.queue !== base.drivers.queue)
    return [`--queue=${recipe.drivers.queue}`];
  return [];
}

/**
 * O preset que rende menos flags. Empate fica com o default, que é o preset que o usuário
 * não precisa escrever — uma linha sem `--preset` é mais curta e mais fácil de ler.
 */
function chooseBasePreset(recipe: Recipe): PresetId {
  const order: PresetId[] = [DEFAULT_PRESET, ...PRESET_IDS.filter((p) => p !== DEFAULT_PRESET)];
  let best: PresetId = DEFAULT_PRESET;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const preset of order) {
    const count = toFlags(recipe, preset).length;
    if (count < bestCount) {
      bestCount = count;
      best = preset;
    }
  }
  return best;
}

/** Aspas simples só quando o shell precisaria delas. */
function shellQuote(value: string): string {
  if (/^[A-Za-z0-9._@/=,:+-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** A linha de comando completa e copiável. */
export function buildCommand(recipe: Recipe, basePreset?: PresetId): string {
  const flags = toFlags(recipe, basePreset);
  // O nome vem sempre, mesmo quando é derivável: é o argumento posicional, e um comando
  // sem ele cai em modo interativo — exatamente o que a linha copiável existe para evitar.
  const name = recipe.project.displayName.trim() || recipe.project.slug;
  return ['npx @dontpanic/create', shellQuote(name), ...flags].join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse de argv
// ─────────────────────────────────────────────────────────────────────────────

export interface ParseResult {
  recipe?: Recipe;
  help: boolean;
  version: boolean;
  /** Erros de parse, legíveis, já formatados para o terminal. */
  errors: string[];
  /** Flags reconhecidas mas obsoletas/ignoradas. */
  warnings: string[];
  /** true quando nenhum argumento relevante veio: o CLI deve entrar em modo interativo. */
  interactive: boolean;

  // ── Campos acrescentados sobre o contrato original ──────────────────────────
  // `Recipe` descreve o projeto gerado; estes descrevem a EXECUÇÃO do gerador e não
  // pertencem à receita (uma receita com `dryRun: true` dentro não faz sentido na landing).
  // `GeneratorContext.dryRun` os consome.
  /** `--dry-run`: nada é escrito no disco. */
  dryRun: boolean;
  /** `--debug`: liga o nível debug do logger e mostra stack em erro não tratado. */
  debug: boolean;
  /** `--yes`/`-y`: aceita os defaults sem perguntar. */
  yes: boolean;
  /** Caminho de destino, quando o posicional era um caminho (`./apps/loja`) e não um nome. */
  target?: string;
}

/** Uma flag booleana genérica, já sem o `--` e sem o `no-`. */
interface FlagToken {
  name: string;
  value?: string;
  negated: boolean;
  raw: string;
}

const SHORT_FLAGS: Record<string, string> = { h: 'help', v: 'version', y: 'yes' };

const FALSE_VALUES = new Set(['false', 'none', 'off', 'no', '0', '']);

export function parseArgs(argv: string[]): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const positionals: string[] = [];
  const flags: FlagToken[] = [];

  let help = false;
  let version = false;
  let debug = false;
  let dryRun = false;
  let yes = false;

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      const rawName = eq >= 0 ? body.slice(0, eq) : body;
      const value = eq >= 0 ? body.slice(eq + 1) : undefined;
      const negated = rawName.startsWith('no-');
      flags.push({
        name: negated ? rawName.slice(3) : rawName,
        ...(value !== undefined ? { value } : {}),
        negated,
        raw: arg,
      });
      continue;
    }
    if (arg.startsWith('-') && arg.length > 1) {
      // Só flags curtas isoladas: `-hy` agrupado economizaria nada e abriria a porta para
      // `-y` ser confundido com valor de outra flag.
      const mapped = SHORT_FLAGS[arg.slice(1)];
      if (mapped === undefined) {
        errors.push(unknownFlagMessage(arg));
        continue;
      }
      flags.push({ name: mapped, negated: false, raw: arg });
      continue;
    }
    positionals.push(arg);
  }

  // Primeira passada só pelo preset: ele define a base sobre a qual as outras flags
  // aplicam, e não pode depender de vir antes delas na linha de comando.
  let preset: PresetId = DEFAULT_PRESET;
  for (const flag of flags) {
    if (flag.name !== 'preset') continue;
    const value = flag.value;
    if (value === undefined) {
      errors.push(
        `A flag --preset precisa de um valor: --preset=${PRESET_IDS.join('|')}. (Use "=", a forma com espaço não é aceita.)`,
      );
      continue;
    }
    if (!isPresetId(value)) {
      errors.push(
        `Preset desconhecido: "${value}". Os presets são ${PRESET_IDS.join(', ')}.`,
      );
      continue;
    }
    preset = value;
  }

  // ── identidade ─────────────────────────────────────────────────────────────
  const nameFlag = lastValue(flags, 'name');
  const slugFlag = lastValue(flags, 'slug');
  const descriptionFlag = lastValue(flags, 'description');

  if (positionals.length > 1) {
    errors.push(
      `Só um nome de projeto por vez. Não entendi: ${positionals
        .slice(1)
        .map((p) => `"${p}"`)
        .join(', ')}.`,
    );
  }

  const positional = positionals[0];
  const fromPositional = positional !== undefined ? splitPositional(positional) : undefined;
  const displayName = nameFlag ?? fromPositional?.displayName ?? '';
  const slug = slugFlag ?? slugify(displayName);

  if (slugFlag !== undefined) {
    for (const issue of validateSlug(slugFlag)) {
      if (issue.level !== 'error') continue;
      errors.push(
        `--slug=${slugFlag}: ${issue.message}${issue.suggestion ? ` Tente --slug=${issue.suggestion}.` : ''}`,
      );
    }
  }

  const project: ProjectIdentity = {
    displayName,
    slug,
    ...(descriptionFlag !== undefined ? { description: descriptionFlag } : {}),
  };

  const recipe = presetRecipe(preset, project);

  // ── segunda passada: tudo o mais, na ordem em que veio (o último ganha) ─────
  for (const flag of flags) {
    const { name, value, negated, raw } = flag;

    if (name === 'preset' || name === 'name' || name === 'slug' || name === 'description') {
      if (negated) errors.push(`--no-${name} não existe. Você quis dizer --${name}=...?`);
      else if (value === undefined && name !== 'preset')
        errors.push(`A flag --${name} precisa de um valor: --${name}=... (com "=").`);
      continue;
    }

    if (name === 'help') {
      help = true;
      continue;
    }
    if (name === 'version') {
      version = true;
      continue;
    }
    if (name === 'yes') {
      yes = !negated;
      continue;
    }
    if (name === 'debug') {
      debug = !negated;
      continue;
    }
    if (name === 'dry-run') {
      dryRun = !negated;
      continue;
    }
    if (name === 'force') {
      recipe.options.force = !negated;
      continue;
    }
    if (name === 'git' || name === 'install' || name === 'docker') {
      recipe.options[name] = !negated;
      continue;
    }

    if (name === 'default-locale') {
      if (value === undefined || value === '') {
        errors.push('A flag --default-locale precisa de um valor: --default-locale=pt.');
        continue;
      }
      recipe.i18n.defaultLocale = value;
      // Um default fora da lista é intenção, não erro de digitação: quem escreve
      // `--default-locale=en` quer `en`. Acrescentamos à lista em vez de recusar — e se o
      // projeto for single-language, a reconciliação colapsa a lista nesse idioma, que é
      // exatamente o resultado pedido.
      if (!recipe.i18n.locales.includes(value)) recipe.i18n.locales.push(value);
      continue;
    }

    if (name === 'db' || name === 'storage' || name === 'mail' || name === 'cache') {
      applyDriver(recipe, name, value, errors, raw);
      continue;
    }

    if (name === 'i18n' && value !== undefined) {
      if (FALSE_VALUES.has(value.toLowerCase())) {
        disableI18n(recipe);
      } else {
        const locales = splitList(value);
        recipe.features.i18n = true;
        recipe.i18n.locales = locales;
        recipe.i18n.defaultLocale = locales[0] ?? recipe.i18n.defaultLocale;
      }
      continue;
    }

    if (name === 'oauth' && value !== undefined) {
      if (FALSE_VALUES.has(value.toLowerCase())) {
        disableOAuth(recipe);
      } else {
        const providers: OAuthProvider[] = [];
        for (const candidate of splitList(value)) {
          if (isOAuthProvider(candidate)) providers.push(candidate);
          else
            errors.push(
              `Provider de OAuth desconhecido: "${candidate}". Os suportados são ${OAUTH_PROVIDERS.join(', ')}.`,
            );
        }
        recipe.features.oauth = true;
        recipe.oauth.providers = providers;
      }
      continue;
    }

    if (name === 'captcha' && value !== undefined) {
      if (FALSE_VALUES.has(value.toLowerCase())) {
        disableCaptcha(recipe);
      } else if (isCaptchaDriver(value)) {
        recipe.features.captcha = true;
        recipe.drivers.captcha = value;
      } else {
        errors.push(
          `Driver de captcha desconhecido: "${value}". Os suportados são ${CAPTCHA_DRIVERS.join(', ')}.`,
        );
      }
      continue;
    }

    if (name === 'queue' && value !== undefined) {
      if (FALSE_VALUES.has(value.toLowerCase())) {
        disableQueue(recipe);
      } else if (isQueueDriver(value)) {
        // Escolher driver de fila explicitamente é dizer que quer o código da fila; senão
        // `--queue=bullmq` sobre um preset sem fila geraria um Redis sem ninguém consumindo.
        recipe.features.queue = true;
        recipe.drivers.queue = value;
      } else {
        errors.push(
          `Driver de fila desconhecido: "${value}". Os suportados são ${QUEUE_DRIVERS.join(', ')}.`,
        );
      }
      continue;
    }

    const featureId = featureFromFlag(name);
    if (featureId !== undefined) {
      if (value !== undefined && !VALUE_FLAGS.includes(name as (typeof VALUE_FLAGS)[number])) {
        errors.push(`A flag --${name} é liga/desliga e não aceita valor. Use --${name} ou --no-${name}.`);
        continue;
      }
      applyFeatureToggle(recipe, featureId, !negated, errors);
      continue;
    }

    errors.push(unknownFlagMessage(raw));
  }

  // Sem nome não há como derivar banco, role nem escopo npm — e é o único dado que o CLI
  // não pode inventar. A ausência dele é o que dispara o modo interativo.
  const interactive = positional === undefined && nameFlag === undefined;
  if (interactive && yes) {
    errors.push(
      'Com --yes não há como perguntar o nome do projeto. Passe o nome: npx @dontpanic/create "Minha Empresa" --yes.',
    );
  }

  return {
    ...(errors.length === 0 ? { recipe } : {}),
    help,
    version,
    errors,
    warnings,
    interactive,
    dryRun,
    debug,
    yes,
    ...(fromPositional?.target !== undefined ? { target: fromPositional.target } : {}),
  };
}

/**
 * Liga/desliga uma feature, aplicando junto os campos que a acompanham.
 *
 * Desligar tem que limpar o valor associado NA HORA, não deixar para a reconciliação:
 * `--captcha=turnstile --no-captcha` deve terminar sem captcha. Se só a booleana caísse, a
 * reconciliação veria "driver turnstile com feature desligada", concluiria que o driver é a
 * intenção mais explícita e religaria a feature — invertendo a última palavra do usuário.
 */
function applyFeatureToggle(
  recipe: Recipe,
  id: FeatureId,
  enable: boolean,
  errors: string[],
): void {
  // Recusa aqui, no ponto de entrada, em vez de deixar o `validateRecipe` pegar depois: um
  // `--no-audit` que fosse aceito e "corrigido" no fim ensinaria o usuário que a flag existe.
  if (!enable && ALWAYS_ON.includes(id)) {
    errors.push(
      `--no-${FEATURE_FLAGS[id]} não existe na v1: ${FEATURE_INFO[id].label.toLowerCase()} não é removível. Ver docs/maps/feature-surface.md §5 (I4).`,
    );
    return;
  }

  recipe.features[id] = enable;
  if (enable) {
    switch (id) {
      case 'oauth':
        if (recipe.oauth.providers.length === 0)
          errors.push(
            `--oauth sozinho não diz com quem entrar. Informe os providers: --oauth=${OAUTH_PROVIDERS.join(',')}.`,
          );
        break;
      case 'captcha':
        if (recipe.drivers.captcha === 'none') recipe.drivers.captcha = 'turnstile';
        break;
      case 'queue':
        if (recipe.drivers.queue === 'memory') recipe.drivers.queue = 'bullmq';
        break;
      default:
        break;
    }
    return;
  }
  switch (id) {
    case 'oauth':
      disableOAuth(recipe);
      break;
    case 'captcha':
      disableCaptcha(recipe);
      break;
    case 'queue':
      disableQueue(recipe);
      break;
    case 'i18n':
      disableI18n(recipe);
      break;
    default:
      break;
  }
}

function disableI18n(recipe: Recipe): void {
  recipe.features.i18n = false;
  const keep = recipe.i18n.locales.includes(recipe.i18n.defaultLocale)
    ? recipe.i18n.defaultLocale
    : (recipe.i18n.locales[0] ?? recipe.i18n.defaultLocale);
  recipe.i18n.locales = [keep];
  recipe.i18n.defaultLocale = keep;
}

function disableOAuth(recipe: Recipe): void {
  recipe.features.oauth = false;
  recipe.oauth.providers = [];
}

function disableCaptcha(recipe: Recipe): void {
  recipe.features.captcha = false;
  recipe.drivers.captcha = 'none';
}

function disableQueue(recipe: Recipe): void {
  recipe.features.queue = false;
  recipe.drivers.queue = 'memory';
}

const DRIVER_CHOICES = {
  db: DB_DRIVERS,
  storage: STORAGE_DRIVERS,
  mail: MAIL_DRIVERS,
  cache: CACHE_DRIVERS,
} as const;

function applyDriver(
  recipe: Recipe,
  name: 'db' | 'storage' | 'mail' | 'cache',
  value: string | undefined,
  errors: string[],
  raw: string,
): void {
  const choices: readonly string[] = DRIVER_CHOICES[name];
  if (value === undefined) {
    errors.push(
      `A flag --${name} precisa de um valor: --${name}=${choices.join('|')}. (Use "=", a forma com espaço não é aceita.)`,
    );
    return;
  }
  if (!choices.includes(value)) {
    const suggestion = nearest(value, [...choices]);
    errors.push(
      `Valor inválido em ${raw}: "${value}". Os aceitos são ${choices.join(', ')}.${
        suggestion ? ` Você quis dizer "${suggestion}"?` : ''
      }`,
    );
    return;
  }
  switch (name) {
    case 'db':
      recipe.drivers.db = value as DbDriver;
      break;
    case 'storage':
      recipe.drivers.storage = value as StorageDriver;
      break;
    case 'mail':
      recipe.drivers.mail = value as MailDriver;
      break;
    case 'cache':
      recipe.drivers.cache = value as CacheDriver;
      break;
  }
}

function lastValue(flags: FlagToken[], name: string): string | undefined {
  let found: string | undefined;
  for (const flag of flags) if (flag.name === name && flag.value !== undefined) found = flag.value;
  return found;
}

function splitList(value: string): string[] {
  // Dedupe preservando a ordem: `--i18n=pt,en,pt` não deve gerar dois catálogos `pt`, e o
  // primeiro item é o idioma default.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,\s]+/)) {
    const trimmed = part.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * O posicional é "nome-ou-caminho". `./apps/loja` e `../loja` são caminho; `Minha Loja` é
 * nome. O sinal é a barra ou o prefixo de caminho relativo — um nome de projeto com barra
 * não existe (o slug não aceita), então a heurística não tem falso positivo.
 */
function splitPositional(raw: string): { displayName: string; target?: string } {
  const looksLikePath = raw.includes('/') || raw.includes('\\') || raw === '.' || raw === '..';
  if (!looksLikePath) return { displayName: raw };
  const trimmed = raw.replace(/[/\\]+$/, '');
  const segments = trimmed.split(/[/\\]/).filter((s) => s !== '' && s !== '.' && s !== '..');
  const last = segments[segments.length - 1];
  return { displayName: last ?? '', target: raw };
}

function isPresetId(value: string): value is PresetId {
  return (PRESET_IDS as readonly string[]).includes(value);
}
function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}
function isCaptchaDriver(value: string): value is CaptchaDriver {
  return (CAPTCHA_DRIVERS as readonly string[]).includes(value);
}
function isQueueDriver(value: string): value is QueueDriver {
  return (QUEUE_DRIVERS as readonly string[]).includes(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// Flag desconhecida — sugerir, nunca ignorar
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Todo nome de flag aceito, com as formas negadas. A lista existe para a sugestão por
 * distância de edição: um `--no-2af` silenciosamente ignorado geraria o projeto COM 2FA, e
 * o usuário só descobriria depois de configurar tudo. Errar a flag tem que doer na hora.
 */
function knownFlagNames(): string[] {
  const names = new Set<string>();
  for (const id of FEATURE_IDS) {
    names.add(FEATURE_FLAGS[id]);
    names.add(`no-${FEATURE_FLAGS[id]}`);
  }
  for (const alias of Object.keys(FEATURE_ALIASES)) {
    names.add(alias);
    names.add(`no-${alias}`);
  }
  for (const name of VALUE_FLAGS) names.add(name);
  for (const name of META_FLAGS) names.add(name);
  for (const name of OPTION_FLAGS) {
    names.add(name);
    names.add(`no-${name}`);
  }
  return [...names];
}

function unknownFlagMessage(raw: string): string {
  const bare = raw.replace(/^-+/, '').split('=')[0] ?? '';
  const suggestion = nearest(bare, knownFlagNames());
  return `Flag desconhecida: ${raw}.${suggestion ? ` Você quis dizer --${suggestion}?` : ' Rode com --help para ver as flags.'}`;
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[b.length] ?? Number.POSITIVE_INFINITY;
}

function nearest(input: string, candidates: string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  // Um teto proporcional evita sugerir `--force` para quem digitou `--xyz`: sugestão errada
  // é pior que nenhuma, porque manda o usuário caçar no lugar errado.
  const limit = Math.max(2, Math.floor(input.length / 3));
  return bestDistance <= limit ? best : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Coerência
// ─────────────────────────────────────────────────────────────────────────────

export interface RecipeIssue {
  level: 'error' | 'warning';
  message: string;
  /** Correção aplicável automaticamente. */
  fix?: { feature: FeatureId; enable: boolean };
}

const LOCALE_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

/**
 * Valida coerência: dependências entre features, drivers vs features, oauth vs providers.
 *
 * Esta função é a implementação da seção 5 ("Invalid combinations") do
 * `docs/maps/feature-surface.md`, que enumera 20 combinações inválidas com evidência de
 * arquivo:linha. Os números I1–I20 aparecem nos comentários para que quem mudar uma regra
 * ache o parágrafo que a justifica.
 *
 * A divisão entre `error` e `warning` segue a ordem de implementação do mapa: **recusar**
 * I1–I4, I9, I10 e I14; **auto-corrigir** I6, I7, I11 e I12. Um `error` com `fix` é uma
 * auto-correção; um `error` sem `fix` é uma recusa, e o CLI para.
 *
 * Três combinações do mapa NÃO aparecem aqui porque não são escolhas que a receita possa
 * expressar errado — são obrigações do gerador:
 * - **I5** (oauth ON + 2FA ON) obriga emitir o desvio de 2FA no callback. Não há o que
 *   validar: se os dois estão ligados, o desvio SAI, sempre. Omitir é regressão de
 *   segurança documentada, não opção.
 * - **I7** (oauth OFF ⇒ `passwordHash String` NOT NULL) é poda de schema.
 * - **I8** (port de fila com zero jobs não compila) não é representável: a receita liga ou
 *   desliga o port inteiro, e o port ligado sempre mantém `mail.send`.
 *
 * E sobre `invitations` × `plans`: NÃO há dependência. O limite de assentos é conferido no
 * ACEITE, dentro da transação que cria o usuário, então convite sem planos funciona — só
 * não tem teto. Forçar a dependência obrigaria quem quer convidar colegas a carregar
 * cobrança que não vai usar.
 */
export function validateRecipe(recipe: Recipe): RecipeIssue[] {
  const issues: RecipeIssue[] = [];
  const f = recipe.features;

  // I4 — recusa. Cinco escritores, ~30 sítios, e o export de LGPD retorna linhas de
  // auditoria: sem ela o contrato de resposta muda. Sem `fix`: é recusa, não correção.
  for (const id of ALWAYS_ON) {
    if (f[id]) continue;
    issues.push({
      level: 'error',
      message:
        id === 'audit'
          ? 'Auditoria não é removível na v1: são cinco escritores independentes, ~30 sítios de chamada, e o export de LGPD retorna linhas de auditoria na resposta. Remover não é podar uma feature, é reescrever um contrato.'
          : `A feature "${FEATURE_INFO[id].label}" não é removível na v1.`,
    });
  }

  // I12 — auto-corrige. Um SUPERADMIN sem tenant loga, recebe escopo de plataforma (que
  // atravessa empresas) e não tem UI que o limite. Em single-tenant não há o que atravessar.
  if (f.platform && !f.multiTenant) {
    issues.push({
      level: 'error',
      message:
        'Painel da plataforma em modo single-tenant não faz sentido: ele atravessa empresas, e existe uma só. Desliguei o painel; para mantê-lo, ligue --multi-tenant.',
      fix: { feature: 'platform', enable: false },
    });
  }

  // I11 — auto-corrige. Em single-tenant, signup É criação de empresa.
  if (!f.multiTenant && f.publicSignup) {
    issues.push({
      level: 'error',
      message:
        'Registro público em modo single-tenant é criação de empresa, e há uma só. Desliguei o registro público — quem entra, entra por convite ou pelo seed.',
      fix: { feature: 'publicSignup', enable: false },
    });
  }

  // I1, I2, I3 — recusa. As três são arestas HARD: `POST /platform/tenants` CONVIDA o
  // primeiro admin (não cria usuário), o painel tem CRUD de planos, e o audit do painel é
  // o único cujo erro ABORTA a transação de negócio. Não existe "um pouco de painel".
  if (f.platform && f.multiTenant) {
    const missing: FeatureId[] = (['invitations', 'plans', 'audit'] as FeatureId[]).filter(
      (id) => !f[id],
    );
    if (missing.length > 0) {
      issues.push({
        level: 'error',
        message: `O painel da plataforma exige ${missing
          .map((id) => FEATURE_INFO[id].label.toLowerCase())
          .join(' e ')}: ele cria a empresa e CONVIDA o primeiro admin, faz o CRUD de planos, e grava auditoria numa escrita cujo erro aborta a transação. Ligue ${missing
          .map((id) => `--${FEATURE_FLAGS[id]}`)
          .join(' ')} ou desligue --no-platform.`,
      });
    }
  }

  if (f.oauth && recipe.oauth.providers.length === 0) {
    issues.push({
      level: 'error',
      message: `Login social ligado sem nenhum provider. O boilerplate falha o boot nesse estado (lista inconsistente), então não vale gerar: informe --oauth=${OAUTH_PROVIDERS.join(',')} ou desligue com --no-oauth.`,
      fix: { feature: 'oauth', enable: false },
    });
  }

  if (!f.oauth && recipe.oauth.providers.length > 0) {
    issues.push({
      level: 'warning',
      message: `Login social desligado: os providers (${recipe.oauth.providers.join(', ')}) vão ser ignorados.`,
    });
  }

  // I6 — o terceiro desfecho do callback ("identidade que ninguém tem") perde o destino:
  // ele redireciona para `/signup/complete`, que não vai existir. O gerador recusa a
  // identidade desconhecida com `no_account` em vez de deixar um 404 segurando um ticket
  // de cadastro válido. Aviso porque é comportamento visível, não erro de receita.
  if (f.oauth && !f.publicSignup) {
    issues.push({
      level: 'warning',
      message:
        'Login social com registro público desligado: uma identidade social que ninguém tem é RECUSADA (erro "no_account"), e a tela /signup/complete não é gerada. Quem chega pelo Google precisa já ter conta — ou um convite.',
    });
  }

  if (f.captcha && recipe.drivers.captcha === 'none') {
    issues.push({
      level: 'error',
      message:
        'Captcha ligado com driver "none" é captcha desligado com passos extras. Escolha --captcha=turnstile|recaptcha-v2|recaptcha-v3, ou desligue com --no-captcha.',
      fix: { feature: 'captcha', enable: false },
    });
  }

  if (!f.captcha && recipe.drivers.captcha !== 'none') {
    issues.push({
      level: 'error',
      message: `Driver de captcha "${recipe.drivers.captcha}" escolhido com a feature desligada. Ligar só um lado é a armadilha do CLAUDE.md: a API exige o token e a tela nunca o renderiza.`,
      // O driver explícito é a intenção mais forte que a booleana omitida, então a correção
      // liga a feature em vez de descartar o driver que alguém digitou de propósito.
      fix: { feature: 'captcha', enable: true },
    });
  }

  if (!f.queue) {
    issues.push({
      level: 'warning',
      message:
        'Fila desligada: o port sai inteiro e os três services passam a injetar MAIL_PROVIDER direto. O e-mail é enviado DENTRO do request — sem retry, sem dedup por jobId, e um SMTP lento atrasa a resposta.',
    });
  } else if (recipe.drivers.queue === 'memory') {
    issues.push({
      level: 'warning',
      message:
        'Fila ligada com driver "memory": o trabalho roda inline em quem enfileirou. Serve para testes e para `pnpm dev` sem worker, mas não é fila. Em produção suba o worker com QUEUE_DRIVER=bullmq, ou e-mail NENHUM sai — nem verificação, nem convite, nem reset de senha.',
    });
  }

  // I15 — o throttler anda no port de CACHE (`app.module.ts:102`), não num store próprio.
  // Com cache em memória, N réplicas dão N× o orçamento em toda rota `@SensitiveThrottle()`
  // — e lockout, rotação de refresh, segredo de 2FA pendente e troca de e-mail pendente
  // também viram estado por processo.
  if (recipe.drivers.cache === 'memory') {
    issues.push({
      level: 'warning',
      message:
        'Cache em memória: o rate limit, o lockout por conta, a rotação de refresh e os segredos de 2FA pendentes passam a ser estado POR PROCESSO. Duas réplicas dão dois baldes de tentativas de login. Só use com uma instância; para escalar horizontalmente, --cache=redis.',
    });
  }

  // I19 — tecnicamente válido, e o mapa é explícito: tem que estar na cara, não em nota de
  // rodapé. Sem estas três, `db:seed` é a única criação de conta do produto inteiro.
  if (!f.publicSignup && !f.invitations && !f.platform) {
    issues.push({
      level: 'warning',
      message:
        'Sem registro público, sem convites e sem painel: `pnpm db:seed` é a ÚNICA forma de criar conta neste produto. Rode o seed, ou ninguém consegue entrar.',
    });
  }

  if (!f.files && recipe.drivers.storage === 's3') {
    issues.push({
      level: 'warning',
      message:
        'Arquivos desligado: o driver s3 fica configurado mas nada envia nem lê. Considere --storage=local para o projeto subir sem credencial de object storage.',
    });
  }

  // I17 — `@fastify/static` está declarado no boilerplate mas nunca importado, então
  // `LOCAL_STORAGE_PUBLIC_URL` aponta para uma rota que a API não serve. É bug
  // pré-existente, e o gerador tem de acrescentar o wiring ao emitir storage local.
  if (f.files && recipe.drivers.storage === 'local') {
    issues.push({
      level: 'warning',
      message:
        'Storage local: o gerador acrescenta o wiring de @fastify/static — sem ele o avatar responde 404, porque LOCAL_STORAGE_PUBLIC_URL aponta para uma rota que a API não serve.',
    });
  }

  if (recipe.i18n.locales.length === 0) {
    issues.push({ level: 'error', message: 'A lista de idiomas está vazia.' });
  }

  for (const locale of recipe.i18n.locales) {
    if (!LOCALE_RE.test(locale)) {
      issues.push({
        level: 'error',
        message: `"${locale}" não é um código de idioma válido. Use a forma BCP 47 curta: pt, en, es, pt-BR.`,
      });
    }
  }

  if (!recipe.i18n.locales.includes(recipe.i18n.defaultLocale)) {
    issues.push({
      level: 'error',
      message: `O idioma default "${recipe.i18n.defaultLocale}" não está na lista (${recipe.i18n.locales.join(', ')}).`,
    });
  }

  // I9 — "sem i18n" não existe na v1: 50 arquivos chamam `useTranslations`, 18 harnesses
  // envolvem o provider e a API tem um SEGUNDO sistema bilíngue (EmailLocale). Desligar a
  // feature significa "um idioma só", com o maquinário no lugar.
  if (!f.i18n && recipe.i18n.locales.length > 1) {
    issues.push({
      level: 'warning',
      message: `Um idioma só: o catálogo fica em "${recipe.i18n.defaultLocale}" e os outros não são gerados. O i18n continua no código — é a forma "single-language", não "sem i18n".`,
    });
  }

  const unknownProviders = recipe.oauth.providers.filter((p) => !isOAuthProvider(p));
  if (unknownProviders.length > 0) {
    issues.push({
      level: 'error',
      message: `Provider de OAuth desconhecido: ${unknownProviders.join(', ')}.`,
    });
  }

  return issues;
}

/**
 * Resolve incoerências aplicando os `fix` sugeridos. Devolve a receita corrigida e o que
 * mudou.
 *
 * `applied` contém SÓ o que causou mudança — um aviso que não muda nada (o da fila, por
 * exemplo) não entra. É o que faz a função ser idempotente: reconciliar duas vezes devolve
 * `applied` vazio na segunda, e é isso que o CLI usa para decidir se precisa avisar o
 * usuário de que mexeu na receita dele.
 */
export function reconcileRecipe(recipe: Recipe): { recipe: Recipe; applied: RecipeIssue[] } {
  const current = cloneRecipe(recipe);
  const applied: RecipeIssue[] = [];

  // Corrigir uma incoerência pode revelar outra (desligar `multiTenant` invalida
  // `platform`, que ao sair libera...), então iteramos. O teto é anti-loop, não capacidade:
  // o grafo de dependências é raso e converge em duas passadas.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;

    for (const issue of validateRecipe(current)) {
      const fix = issue.fix;
      if (fix === undefined) continue;
      if (current.features[fix.feature] === fix.enable) continue;
      applyFeatureToggle(current, fix.feature, fix.enable, []);
      applied.push(issue);
      changed = true;
    }

    if (normalize(current, applied)) changed = true;
    if (!changed) break;
  }

  return { recipe: current, applied };
}

/**
 * Campos que uma feature desligada força. Não são "correções" de erro do usuário: são a
 * consequência mecânica da escolha, e existem aqui em vez de espalhados pelo parse para que
 * uma receita vinda da landing (que não passa pelo parse) chegue ao gerador no mesmo estado.
 */
function normalize(recipe: Recipe, applied: RecipeIssue[]): boolean {
  let changed = false;
  const note = (message: string) => {
    applied.push({ level: 'warning', message });
    changed = true;
  };

  if (!recipe.features.queue && recipe.drivers.queue !== 'memory') {
    recipe.drivers.queue = 'memory';
    note('Fila desligada: QUEUE_DRIVER passou para "memory".');
  }

  if (!recipe.features.captcha && recipe.drivers.captcha !== 'none') {
    recipe.drivers.captcha = 'none';
    note('Captcha desligado: CAPTCHA_DRIVER passou para "none".');
  }

  if (!recipe.features.oauth && recipe.oauth.providers.length > 0) {
    recipe.oauth.providers = [];
    note('Login social desligado: a lista de providers foi esvaziada.');
  }

  const deduped = [...new Set(recipe.oauth.providers)];
  if (deduped.length !== recipe.oauth.providers.length) {
    recipe.oauth.providers = deduped;
    note('Providers de OAuth repetidos foram removidos.');
  }

  const dedupedLocales = [...new Set(recipe.i18n.locales)];
  if (dedupedLocales.length !== recipe.i18n.locales.length) {
    recipe.i18n.locales = dedupedLocales;
    note('Idiomas repetidos foram removidos.');
  }

  if (recipe.i18n.locales.length === 0) {
    recipe.i18n.locales = [recipe.i18n.defaultLocale];
    note(`Lista de idiomas vazia: assumi "${recipe.i18n.defaultLocale}".`);
  }

  if (!recipe.i18n.locales.includes(recipe.i18n.defaultLocale)) {
    const first = recipe.i18n.locales[0];
    if (first !== undefined) {
      recipe.i18n.defaultLocale = first;
      note(`Idioma default fora da lista: passou para "${first}".`);
    }
  }

  if (!recipe.features.i18n && recipe.i18n.locales.length > 1) {
    recipe.i18n.locales = [recipe.i18n.defaultLocale];
    note(`i18n desligado: sobrou só "${recipe.i18n.defaultLocale}".`);
  }

  return changed;
}
