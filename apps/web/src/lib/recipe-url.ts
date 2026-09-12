/**
 * Serialização da receita na query string.
 *
 * Duas decisões governam este arquivo, e as duas são sobre a pessoa que recebe o link,
 * não sobre quem o gerou:
 *
 * 1. **Legível, não base64.** `?preset=saas&no=oauth,captcha` colado num Slack se
 *    explica sozinho; `?r=eyJ2IjoxLCJmZWF0` exige abrir a página para saber o que é.
 *    O link é uma mensagem entre duas pessoas antes de ser entrada de programa.
 *
 * 2. **Só o delta do preset.** Pelo mesmo motivo do comando: 13 features sempre
 *    presentes fariam a URL crescer sem dizer nada. O preset carrega o resto, e o que
 *    aparece na URL é exatamente o que alguém mexeu.
 *
 * Tudo que não for reconhecido é ignorado em silêncio. Um link gerado por uma versão
 * futura, com uma feature que esta página não conhece, tem que abrir e mostrar algo
 * coerente — nunca uma tela de erro. O `reconcileRecipe` de quem chama fecha o resto.
 */

import {
  FEATURE_IDS,
  PRESETS,
  PRESET_IDS,
  presetRecipe,
  FEATURE_FLAGS,
  slugify,
  DEFAULT_PRESET,
  OAUTH_PROVIDERS,
  CAPTCHA_DRIVERS,
  DB_DRIVERS,
  STORAGE_DRIVERS,
  MAIL_DRIVERS,
  CACHE_DRIVERS,
  QUEUE_DRIVERS,
  type FeatureId,
  type OAuthProvider,
  type PresetId,
  type Recipe,
  type DriverSelection,
} from './recipe-bridge';

export interface RecipeUrlState {
  recipe: Recipe;
  preset: PresetId;
}

/** O nome que a página oferece antes de alguém digitar o seu. */
export const SAMPLE_PROJECT = { displayName: 'Acme Corp', slug: 'acme-corp' } as const;

/**
 * Nome curto de cada feature na URL.
 *
 * Usa `FEATURE_FLAGS` do CLI — o mesmo kebab que a flag de linha de comando — para que
 * `?no=multi-tenant` e `--no-multi-tenant` se leiam como a mesma coisa. O CLI tem
 * apelidos próprios para algumas flags (`--no-2fa`); a URL fica no id canônico, porque
 * ela é lida por esta página e não pelo parser de argv, e o id não muda de nome.
 */
const FEATURE_BY_FLAG = new Map<string, FeatureId>(
  FEATURE_IDS.map((id) => [FEATURE_FLAGS[id], id]),
);

/** Lista separada por vírgula, tolerante a espaço e a item vazio. */
function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickDriver<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value);
}

export function defaultState(): RecipeUrlState {
  return {
    preset: DEFAULT_PRESET,
    recipe: presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT }),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Escrita
// ─────────────────────────────────────────────────────────────────────────────

export function serializeRecipe(recipe: Recipe, preset: PresetId): string {
  const base = PRESETS[preset];
  const params = new URLSearchParams();

  params.set('preset', preset);

  if (recipe.project.displayName && recipe.project.displayName !== SAMPLE_PROJECT.displayName) {
    params.set('name', recipe.project.displayName);
  }
  // O slug só vai na URL quando não é o que o nome produziria: repetir o derivado
  // dobraria o tamanho da URL para reafirmar o que a página recalcula de graça.
  if (recipe.project.slug && recipe.project.slug !== slugify(recipe.project.displayName)) {
    params.set('slug', recipe.project.slug);
  }

  const off: string[] = [];
  const on: string[] = [];
  for (const id of FEATURE_IDS) {
    if (recipe.features[id] === base.features[id]) continue;
    (recipe.features[id] ? on : off).push(FEATURE_FLAGS[id]);
  }
  if (off.length > 0) params.set('no', off.join(','));
  if (on.length > 0) params.set('yes', on.join(','));

  const driverKeys: (keyof DriverSelection)[] = [
    'db',
    'storage',
    'mail',
    'cache',
    'queue',
    'captcha',
  ];
  for (const key of driverKeys) {
    if (recipe.drivers[key] !== base.drivers[key]) params.set(key, recipe.drivers[key]);
  }

  if (recipe.oauth.providers.join(',') !== base.oauth.providers.join(',')) {
    params.set('oauth', recipe.oauth.providers.join(','));
  }
  if (recipe.i18n.locales.join(',') !== base.i18n.locales.join(',')) {
    params.set('i18n', recipe.i18n.locales.join(','));
  }
  if (recipe.i18n.defaultLocale !== base.i18n.defaultLocale) {
    params.set('lang', recipe.i18n.defaultLocale);
  }

  const opts: string[] = [];
  if (!recipe.options.git) opts.push('no-git');
  if (!recipe.options.install) opts.push('no-install');
  if (!recipe.options.docker) opts.push('no-docker');
  if (recipe.options.force) opts.push('force');
  if (opts.length > 0) params.set('opts', opts.join(','));

  // `URLSearchParams` codifica espaço como `+`, o que é válido numa query string e
  // mais legível que `%20` para um nome com espaço.
  return params.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

export function parseRecipe(query: string): RecipeUrlState {
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);

  const presetParam = params.get('preset');
  const preset = PRESET_IDS.find((id) => id === presetParam) ?? DEFAULT_PRESET;

  const displayName = (params.get('name') ?? SAMPLE_PROJECT.displayName).trim();
  const slugParam = params.get('slug')?.trim();
  const recipe = presetRecipe(preset, {
    displayName,
    slug: slugParam && slugParam.length > 0 ? slugParam : slugify(displayName),
  });

  for (const flag of splitList(params.get('no'))) {
    const id = FEATURE_BY_FLAG.get(flag);
    if (id) recipe.features[id] = false;
  }
  for (const flag of splitList(params.get('yes'))) {
    const id = FEATURE_BY_FLAG.get(flag);
    if (id) recipe.features[id] = true;
  }

  const db = pickDriver(params.get('db'), DB_DRIVERS);
  if (db) recipe.drivers.db = db;
  const storage = pickDriver(params.get('storage'), STORAGE_DRIVERS);
  if (storage) recipe.drivers.storage = storage;
  const mail = pickDriver(params.get('mail'), MAIL_DRIVERS);
  if (mail) recipe.drivers.mail = mail;
  const cache = pickDriver(params.get('cache'), CACHE_DRIVERS);
  if (cache) recipe.drivers.cache = cache;
  const queue = pickDriver(params.get('queue'), QUEUE_DRIVERS);
  if (queue) recipe.drivers.queue = queue;
  const captcha = pickDriver(params.get('captcha'), CAPTCHA_DRIVERS);
  if (captcha) recipe.drivers.captcha = captcha;

  if (params.has('oauth')) {
    const providers = splitList(params.get('oauth')).filter((item): item is OAuthProvider =>
      (OAUTH_PROVIDERS as readonly string[]).includes(item),
    );
    recipe.oauth.providers = providers;
  }

  if (params.has('i18n')) {
    const locales = splitList(params.get('i18n'));
    if (locales.length > 0) recipe.i18n.locales = locales;
  }
  const lang = params.get('lang');
  if (lang && recipe.i18n.locales.includes(lang)) recipe.i18n.defaultLocale = lang;

  const opts = splitList(params.get('opts'));
  if (opts.includes('no-git')) recipe.options.git = false;
  if (opts.includes('no-install')) recipe.options.install = false;
  if (opts.includes('no-docker')) recipe.options.docker = false;
  if (opts.includes('force')) recipe.options.force = true;

  return { recipe, preset };
}
