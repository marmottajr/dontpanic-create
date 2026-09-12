/**
 * Fixtures compartilhadas pelos testes de config.
 *
 * Não é um `.test.ts` de propósito: o runner (`node --test test/**\/*.test.ts`) não o
 * coleta, e ele existe só para que cada suíte não reinvente uma `Recipe` — e, ao
 * reinventar, teste uma receita diferente da que o teste ao lado testa.
 */

import { deriveNames } from '../src/naming.ts';
import type {
  FeatureId,
  FeatureSelection,
  GeneratorContext,
  Logger,
  NameForms,
  Recipe,
} from '../src/types.ts';
import { FEATURE_IDS } from '../src/types.ts';

export function allFeatures(value: boolean): FeatureSelection {
  return Object.fromEntries(FEATURE_IDS.map((id) => [id, value])) as FeatureSelection;
}

export interface RecipeOverrides {
  features?: Partial<Record<FeatureId, boolean>>;
  drivers?: Partial<Recipe['drivers']>;
  oauth?: Recipe['oauth'];
  displayName?: string;
  slug?: string;
}

/** Receita completa: toda feature ligada, todo driver de infra real. */
export function makeRecipe(overrides: RecipeOverrides = {}): Recipe {
  return {
    v: 1,
    project: {
      displayName: overrides.displayName ?? 'Acme Corp',
      slug: overrides.slug ?? 'acme-corp',
    },
    features: { ...allFeatures(true), ...overrides.features },
    drivers: {
      db: 'postgresql',
      storage: 's3',
      mail: 'smtp',
      cache: 'redis',
      queue: 'bullmq',
      captcha: 'none',
      ...overrides.drivers,
    },
    i18n: { locales: ['pt-BR', 'en-US'], defaultLocale: 'pt-BR' },
    oauth: overrides.oauth ?? { providers: [] },
    options: { git: false, install: false, docker: true, force: false },
  };
}

/**
 * Receita mínima: nenhuma infra externa além do Postgres.
 *
 * É a combinação que o mapa de config apontou como a mais perigosa para o gerador
 * (§6.3), porque é onde os thresholds de cobertura e o compose enxuto se encontram.
 */
export function makeMinimalRecipe(overrides: RecipeOverrides = {}): Recipe {
  return makeRecipe({
    ...overrides,
    features: {
      ...allFeatures(false),
      multiTenant: true,
      ...overrides.features,
    },
    drivers: {
      storage: 'local',
      mail: 'console',
      cache: 'memory',
      queue: 'memory',
      captcha: 'none',
      ...overrides.drivers,
    },
  });
}

export function makeNames(recipe: Recipe = makeRecipe()): NameForms {
  return deriveNames(recipe.project.displayName, recipe.project.slug);
}

/**
 * Segredos determinísticos.
 *
 * Os testes de `.env` e de compose asseveram sobre IGUALDADE entre lugares (o par
 * `S3_ACCESS_KEY` ↔ `MINIO_ROOT_USER`, por exemplo), não sobre entropia — quem testa
 * entropia é `secrets.test.ts`. Valores fixos deixam a falha legível: `esperava
 * ACCESS-FIXO, veio outro` em vez de dois hexes de 64 caracteres.
 */
export function makeSecrets(names: NameForms = makeNames()) {
  return {
    jwtAccessSecret: 'a'.repeat(64),
    jwtRefreshSecret: 'b'.repeat(64),
    csrfSecret: 'c'.repeat(64),
    dbOwnerPassword: names.dbName,
    dbAppPassword: names.dbRole,
    s3AccessKey: 'ACCESSKEYFIXA0000000',
    s3SecretKey: 'SECRETKEYFIXA0000000000000000000000000000',
    seedAdminPassword: 'SenhaDeSeed1',
  };
}

export function silentLogger(): Logger {
  return {
    step: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}

export function makeContext(
  targetDir: string,
  recipe: Recipe = makeRecipe(),
  dryRun = false,
): GeneratorContext {
  return {
    recipe,
    names: makeNames(recipe),
    targetDir,
    templateDir: targetDir,
    logger: silentLogger(),
    dryRun,
  };
}

/**
 * Parser de `.env` minimalista, para provar que o arquivo RENDERIZADO é legível.
 *
 * Testar `envRecord()` prova o modelo em memória; só um parser independente prova que a
 * serialização não perdeu (ou inventou) uma chave — e é a serialização que o `dotenv` do
 * projeto gerado vai ler.
 */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Comentário inline (o marcador de "troque antes de produção").
    if (!value.startsWith('"')) value = value.replace(/\s+#.*$/, '').trim();
    else value = value.slice(1, value.lastIndexOf('"'));
    out[key] = value;
  }
  return out;
}
