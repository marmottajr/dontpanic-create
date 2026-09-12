/**
 * Modo interativo.
 *
 * Duas regras desenham este fluxo:
 *
 * 1. **Nada é escrito no disco aqui.** Os prompts só constroem uma `Recipe`; a primeira
 *    escrita acontece depois da confirmação final, no `cli.ts`. É o que garante que um
 *    Ctrl+C no meio não deixe meio projeto no diretório do usuário — não há o que limpar
 *    porque não há o que ter sido criado.
 * 2. **O fluxo termina mostrando a linha de comando equivalente.** Quem gerou um projeto
 *    interativamente vai gerar o próximo num script de CI; entregar a linha pronta é o que
 *    transforma o usuário em alguém que automatiza, em vez de alguém que reabre o wizard.
 */

import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  note,
  select,
  text,
} from '@clack/prompts';

import { deriveNames, hasBlockingIssue, slugify, validateDisplayName, validateSlug } from './naming.ts';
import {
  ALWAYS_ON,
  DEFAULT_PRESET,
  FEATURE_INFO,
  PRESETS,
  PRESET_IDS,
  buildCommand,
  presetRecipe,
  reconcileRecipe,
} from './recipe.ts';
import type { PresetId } from './recipe.ts';
import { c } from './ui.ts';
import {
  CAPTCHA_DRIVERS,
  FEATURE_IDS,
  type CaptchaDriver,
  type FeatureId,
  type OAuthProvider,
  type ProjectIdentity,
  type Recipe,
} from './types.ts';

/**
 * Cancelamento viaja como exceção em vez de um `null` propagado passo a passo. Sete
 * prompts em sequência com `if (cancelado) return null` depois de cada um é onde se esquece
 * um — e o esquecido continua o fluxo com um símbolo do clack no lugar do valor.
 */
class Cancelled extends Error {}

async function ask<T>(prompt: Promise<T | symbol>): Promise<T> {
  const value = await prompt;
  if (isCancel(value)) throw new Cancelled();
  return value;
}

export interface PromptOptions {
  /** Receita de partida: os defaults do preset mais o que veio por flag. */
  seed: Recipe;
}

/**
 * Conduz o questionário. Devolve a receita ou `null` se o usuário desistiu.
 */
export async function runPrompts({ seed }: PromptOptions): Promise<Recipe | null> {
  try {
    intro(c.bold(c.cyan('@dontpanic/create')));

    const project = await askIdentity(seed.project);
    showDerivedNames(project);

    const preset = await askPreset();
    // O preset redefine features e drivers, mas a identidade e as opções já colhidas (ou
    // vindas de flag) sobrevivem: ninguém espera que escolher um preset apague o nome.
    let recipe: Recipe = presetRecipe(preset, project);
    recipe.options = { ...seed.options };

    if (await askYesNo('Quer ajustar as features?', false)) {
      recipe = await askFeatures(recipe);
    }

    recipe = await askConditionals(recipe);
    recipe.options = await askOptions(recipe);

    // Reconcilia ANTES de mostrar o resumo: o resumo tem que descrever o projeto que vai
    // ser gerado, não o que foi pedido. Mostrar "captcha ligado" e gerar sem captcha é
    // pior que não mostrar nada.
    const { recipe: reconciled, applied } = reconcileRecipe(recipe);
    for (const issue of applied) log.warn(issue.message);

    showSummary(reconciled);

    if (!(await askYesNo('Gerar o projeto?', true))) {
      cancel('Nada foi gerado.');
      return null;
    }

    return reconciled;
  } catch (error) {
    if (error instanceof Cancelled) {
      // Nenhuma escrita aconteceu até aqui — por isso a mensagem pode ser seca.
      cancel('Cancelado. Nada foi criado.');
      return null;
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Identidade
// ─────────────────────────────────────────────────────────────────────────────

async function askIdentity(seed: ProjectIdentity): Promise<ProjectIdentity> {
  const displayName = await ask(
    text({
      message: 'Como se chama o projeto?',
      placeholder: 'Acme Corp',
      ...(seed.displayName !== '' ? { initialValue: seed.displayName } : {}),
      validate: (value) => {
        const issues = validateDisplayName(value);
        const blocking = issues.filter((i) => i.level === 'error');
        if (blocking.length > 0) return blocking.map((i) => i.message).join(' ');
        return undefined;
      },
    }),
  );

  const derivedSlug = slugify(displayName);
  const slugIssues = validateSlug(derivedSlug);

  // O slug derivado serve na esmagadora maioria dos casos. Só perguntamos quando ele é
  // inválido (palavra reservada do SQL, longo demais, nome de dispositivo do Windows) ou
  // quando o usuário já mandou um por flag — perguntar sempre viraria ruído.
  if (!hasBlockingIssue(slugIssues) && (seed.slug === derivedSlug || seed.slug === '')) {
    return { displayName, slug: derivedSlug };
  }

  if (hasBlockingIssue(slugIssues)) {
    log.warn(
      `O slug "${derivedSlug}" não serve: ${slugIssues
        .filter((i) => i.level === 'error')
        .map((i) => i.message)
        .join(' ')}`,
    );
  }

  const suggestion =
    slugIssues.find((i) => i.suggestion !== undefined)?.suggestion ??
    (seed.slug !== '' ? seed.slug : derivedSlug);

  const slug = await ask(
    text({
      message: 'Qual slug usar? (pacote npm, banco, bucket, diretório)',
      initialValue: suggestion,
      validate: (value) => {
        const issues = validateSlug(value).filter((i) => i.level === 'error');
        if (issues.length === 0) return undefined;
        const first = issues[0];
        return first === undefined ? 'Slug inválido.' : first.message;
      },
    }),
  );

  return { displayName, slug };
}

/**
 * Passo 2: mostra as treze formas derivadas antes de qualquer outra pergunta.
 *
 * É a surpresa mais cara do gerador. "Acme Corp" produz uma role de Postgres chamada
 * `acme_corp_app` e um escopo pnpm `@acme-corp/*`; quem só descobre isso ao abrir o
 * `.env` gasta uma hora entendendo de onde veio. Custa quatro linhas mostrar antes.
 */
function showDerivedNames(project: ProjectIdentity): void {
  const names = deriveNames(project.displayName, project.slug);
  note(
    [
      `pacotes    @${names.npmScope}/api · @${names.npmScope}/web · @${names.npmScope}/shared`,
      `banco      ${names.dbName}  (role ${names.dbRole} · e2e ${names.dbNameE2e})`,
      `classes    ${names.pascal}Module, ${names.camel}Config`,
      `env        ${names.screaming}_*`,
      `admin      ${names.seedAdminEmail}`,
    ].join('\n'),
    'Como o nome aparece no projeto',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Preset
// ─────────────────────────────────────────────────────────────────────────────

async function askPreset(): Promise<PresetId> {
  return ask(
    select<PresetId>({
      message: 'Por onde começar?',
      initialValue: DEFAULT_PRESET,
      options: PRESET_IDS.map((id) => ({
        value: id,
        label: `${PRESETS[id].label} — ${PRESETS[id].summary}`,
        // O `audience` é o que faz a escolha ser informada; o clack mostra o hint da opção
        // sob o cursor, então ele aparece exatamente quando importa.
        hint: PRESETS[id].audience,
      })),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Features
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Duas features ficam FORA da lista, e por motivos diferentes:
 *
 * - as de `ALWAYS_ON` (hoje `audit`) porque não são removíveis na v1 — oferecer uma caixa
 *   que não desmarca é pior que não oferecer;
 * - `i18n` porque "ligar/desligar" não descreve a escolha: o maquinário fica no código de
 *   qualquer jeito, e o que varia é quantos idiomas. Quem responde isso é a pergunta de
 *   idiomas, logo adiante, e derivar a booleana de lá evita as duas respostas discordarem.
 */
const HIDDEN_FROM_MULTISELECT: readonly FeatureId[] = [...ALWAYS_ON, 'i18n'];

async function askFeatures(recipe: Recipe): Promise<Recipe> {
  const selectable = FEATURE_IDS.filter((id) => !HIDDEN_FROM_MULTISELECT.includes(id));

  const chosen = await ask(
    multiselect<FeatureId>({
      message: 'Quais features? (espaço marca, enter confirma)',
      required: false,
      initialValues: selectable.filter((id) => recipe.features[id]),
      options: selectable.map((id) => ({
        value: id,
        label: FEATURE_INFO[id].label,
        hint: FEATURE_INFO[id].summary,
      })),
    }),
  );

  const next = { ...recipe, features: { ...recipe.features } };
  for (const id of selectable) next.features[id] = chosen.includes(id);
  for (const id of ALWAYS_ON) next.features[id] = true;
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Condicionais
// ─────────────────────────────────────────────────────────────────────────────

async function askConditionals(recipe: Recipe): Promise<Recipe> {
  const next: Recipe = {
    ...recipe,
    drivers: { ...recipe.drivers },
    i18n: { ...recipe.i18n, locales: [...recipe.i18n.locales] },
    oauth: { providers: [...recipe.oauth.providers] },
  };

  if (next.features.oauth) {
    // `required: true` fecha aqui o erro que o `validateRecipe` teria de pegar depois:
    // login social sem provider faz o boilerplate falhar o boot.
    const providers = await ask(
      multiselect<OAuthProvider>({
        message: 'Entrar com quais provedores?',
        required: true,
        initialValues: next.oauth.providers.length > 0 ? next.oauth.providers : ['google'],
        options: [
          { value: 'google', label: 'Google', hint: 'OIDC direto, o menos surpreendente' },
          { value: 'apple', label: 'Apple', hint: 'exige Services ID, Team ID e chave .p8 (conta paga)' },
          { value: 'github', label: 'GitHub', hint: 'sem OIDC: exige chamada extra a /user/emails' },
        ],
      }),
    );
    next.oauth.providers = providers;
  }

  {
    const raw = await ask(
      text({
        message: 'Quais idiomas? (o primeiro é o default; um só = single-language)',
        initialValue: next.i18n.locales.join(','),
        placeholder: 'pt,en',
        validate: (value) => {
          const parts = value
            .split(/[,\s]+/)
            .map((p) => p.trim())
            .filter(Boolean);
          if (parts.length === 0) return 'Informe pelo menos um idioma.';
          const bad = parts.filter((p) => !/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(p));
          if (bad.length > 0) return `Não parece código de idioma: ${bad.join(', ')}. Use pt, en, es, pt-BR.`;
          return undefined;
        },
      }),
    );
    const locales = [
      ...new Set(
        raw
          .split(/[,\s]+/)
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ];
    next.i18n.locales = locales;
    next.i18n.defaultLocale = locales[0] ?? next.i18n.defaultLocale;
    // A feature "múltiplos idiomas" é consequência da resposta, não uma segunda pergunta:
    // um idioma só é a forma "single-language", com o i18n ainda no código.
    next.features.i18n = locales.length > 1;
  }

  if (next.features.captcha) {
    const driver = await ask(
      select<CaptchaDriver>({
        message: 'Qual provedor de captcha?',
        initialValue: next.drivers.captcha === 'none' ? 'turnstile' : next.drivers.captcha,
        options: CAPTCHA_DRIVERS.filter((d) => d !== 'none').map((d) => ({
          value: d,
          label: d,
          hint:
            d === 'turnstile'
              ? 'Cloudflare, passa/não passa'
              : d === 'recaptcha-v2'
                ? 'Google, checkbox'
                : 'Google, invisível, por score',
        })),
      }),
    );
    next.drivers.captcha = driver;
    log.info(
      'Lembre: CAPTCHA_DRIVER e NEXT_PUBLIC_CAPTCHA_DRIVER têm que combinar, ou todo submit vira 400.',
    );
  }

  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Opções
// ─────────────────────────────────────────────────────────────────────────────

type OptionKey = 'git' | 'install' | 'docker';

async function askOptions(recipe: Recipe): Promise<Recipe['options']> {
  const chosen = await ask(
    multiselect<OptionKey>({
      message: 'O que fazer depois de gerar?',
      required: false,
      initialValues: (['git', 'install', 'docker'] as OptionKey[]).filter(
        (key) => recipe.options[key],
      ),
      options: [
        { value: 'git', label: 'git init', hint: 'e um primeiro commit' },
        { value: 'install', label: 'pnpm install', hint: 'demora, mas evita um passo manual' },
        { value: 'docker', label: 'docker-compose', hint: 'só os serviços que a receita usa' },
      ],
    }),
  );

  return {
    git: chosen.includes('git'),
    install: chosen.includes('install'),
    docker: chosen.includes('docker'),
    force: recipe.options.force,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Resumo
// ─────────────────────────────────────────────────────────────────────────────

function showSummary(recipe: Recipe): void {
  const on = FEATURE_IDS.filter((id) => recipe.features[id]).map((id) => FEATURE_INFO[id].label);
  note(
    [
      `features   ${on.length > 0 ? on.join(', ') : 'nenhuma'}`,
      `drivers    db=${recipe.drivers.db} storage=${recipe.drivers.storage} mail=${recipe.drivers.mail} cache=${recipe.drivers.cache} queue=${recipe.drivers.queue} captcha=${recipe.drivers.captcha}`,
      `idiomas    ${recipe.i18n.locales.join(', ')} (default ${recipe.i18n.defaultLocale})`,
    ].join('\n'),
    recipe.project.displayName,
  );

  note(buildCommand(recipe), 'Da próxima vez, use isto');
}

async function askYesNo(message: string, initialValue: boolean): Promise<boolean> {
  return ask(confirm({ message, initialValue }));
}
