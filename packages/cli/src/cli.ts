/**
 * Orquestração do comando.
 *
 * A função `cli` devolve o exit code em vez de chamar `process.exit`: é o que permite
 * testá-la in-process, sem subprocesso, e é o que mantém o `index.ts` (o bin) reduzido a
 * "chama, imprime o que sobrar, sai com o código".
 *
 * A ordem dos portões é deliberada — tudo o que pode recusar recusa ANTES da primeira
 * escrita no disco: parse, coerência da receita, legalidade do nome, estado do diretório de
 * destino, confirmação. Um gerador que descobre no meio da cópia que o slug era palavra
 * reservada do SQL deixa lixo para o usuário limpar.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

import { deriveNames, validateDisplayName, validateSlug } from './naming.ts';
import {
  DEFAULT_PRESET,
  FEATURE_FLAGS,
  FEATURE_INFO,
  PRESETS,
  PRESET_IDS,
  buildCommand,
  parseArgs,
  reconcileRecipe,
  validateRecipe,
} from './recipe.ts';
import { GenerationError, generate } from './generate.ts';
import { findEnclosingRepo } from './util/git.ts';
import {
  banner,
  blank,
  c,
  command,
  createLogger,
  errorBlock,
  heading,
  nextSteps,
  summaryTable,
  warnBlock,
} from './ui.ts';
import {
  CACHE_DRIVERS,
  CAPTCHA_DRIVERS,
  DB_DRIVERS,
  FEATURE_IDS,
  MAIL_DRIVERS,
  OAUTH_PROVIDERS,
  QUEUE_DRIVERS,
  STORAGE_DRIVERS,
  type GeneratorContext,
  type Recipe,
} from './types.ts';

/** Códigos de saída. 130 é a convenção de shell para "morto por SIGINT". */
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_CANCELLED = 130;

export function readVersion(): string {
  // Vale tanto rodando de `src/` (com --experimental-strip-types) quanto de `dist/`: nos
  // dois casos `../package.json` é o do pacote.
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'string') return version;
    }
  } catch {
    // Um bin que não consegue ler o próprio package.json ainda tem que funcionar.
  }
  return '0.0.0';
}

export async function cli(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const logger = createLogger({ debug: parsed.debug });
  const version = readVersion();

  if (parsed.version) {
    process.stdout.write(`${version}\n`);
    return EXIT_OK;
  }

  if (parsed.help) {
    printHelp(version);
    return EXIT_OK;
  }

  if (parsed.errors.length > 0) {
    errorBlock(parsed.errors);
    blank();
    logger.info(`Rode ${c.bold('npx create-dontpanic --help')} para ver as flags.`);
    return EXIT_FAILURE;
  }

  if (parsed.warnings.length > 0) warnBlock(parsed.warnings);

  let recipe: Recipe;
  if (parsed.interactive) {
    // Sem TTY não há questionário possível, e um prompt aqui penduraria o job de CI até o
    // timeout — que é a pior forma de falhar, porque não diz nada. Recusar nomeia a saída.
    if (process.stdin.isTTY !== true) {
      errorBlock([
        'Sem terminal interativo não há como perguntar nada. Passe o nome do projeto e as flags: npx create-dontpanic "Minha Empresa" --yes.',
      ]);
      return EXIT_FAILURE;
    }

    // Import dinâmico: o `@clack/prompts` mexe com o TTY no carregamento e não tem por que
    // ser pago por quem passou todas as flags (o caso do CI).
    const { runPrompts } = await import('./prompts.ts');
    const answered = await runPrompts({ seed: parsed.recipe as Recipe });
    if (answered === null) return EXIT_CANCELLED;
    recipe = answered;
  } else {
    banner(version);
    recipe = parsed.recipe as Recipe;
  }

  // Reconcilia mesmo vindo dos prompts: é idempotente, então custa nada, e é o único lugar
  // que garante a coerência para uma receita que veio por flag, por prompt ou da landing.
  const { recipe: reconciled, applied } = reconcileRecipe(recipe);
  if (applied.length > 0) {
    warnBlock(applied.map((issue) => issue.message));
    blank();
  }
  recipe = reconciled;

  const issues = validateRecipe(recipe);
  const blocking = issues.filter((issue) => issue.level === 'error');
  if (blocking.length > 0) {
    // Chegar aqui significa incoerência sem correção automática (ex.: idioma default fora
    // da lista que o usuário informou). Recusar é a disciplina do boilerplate, que falha o
    // boot em vez de subir meio-configurado.
    errorBlock(blocking.map((issue) => issue.message));
    return EXIT_FAILURE;
  }
  const advisories = issues.filter((issue) => issue.level === 'warning');
  if (advisories.length > 0) {
    warnBlock(advisories.map((issue) => issue.message));
    blank();
  }

  const nameErrors = [
    ...validateDisplayName(recipe.project.displayName),
    ...validateSlug(recipe.project.slug),
  ].filter((issue) => issue.level === 'error');
  if (nameErrors.length > 0) {
    errorBlock(
      nameErrors.map(
        (issue) =>
          `${issue.message}${issue.suggestion !== undefined ? ` Sugestão: ${issue.suggestion}` : ''}`,
      ),
    );
    return EXIT_FAILURE;
  }

  const names = deriveNames(recipe.project.displayName, recipe.project.slug);
  const targetDir = resolveTargetDir(parsed.target, names.slug);

  const destinationError = checkDestination(targetDir, recipe.options.force);
  if (destinationError !== undefined) {
    errorBlock([destinationError]);
    return EXIT_FAILURE;
  }

  const enclosingRepo = await findEnclosingRepo(nearestExistingDir(targetDir));
  if (enclosingRepo !== null) {
    warnBlock([
      `${targetDir} fica dentro do repositório git em ${enclosingRepo}. O projeto gerado é um repo próprio — aninhar os dois embaralha histórico, .gitignore e hooks.`,
    ]);
    const proceed = await confirmOrRefuse(
      'Gerar aqui mesmo assim?',
      parsed.yes,
      recipe.options.git
        ? 'Passe --yes para confirmar, --no-git para não inicializar um repo aninhado, ou escolha outro diretório.'
        : 'Passe --yes para confirmar, ou escolha outro diretório.',
    );
    if (proceed !== true) {
      if (typeof proceed === 'string') errorBlock([proceed]);
      return proceed === false ? EXIT_CANCELLED : EXIT_FAILURE;
    }
  }

  if (!parsed.interactive) {
    summaryTable(recipe, names);
    heading('A linha que reproduz isto');
    command(buildCommand(recipe));
    blank();

    if (!parsed.yes) {
      const proceed = await confirmOrRefuse(
        `Gerar em ${targetDir}?`,
        false,
        'Sem terminal interativo não há como confirmar: passe --yes.',
      );
      if (proceed !== true) {
        if (typeof proceed === 'string') errorBlock([proceed]);
        return proceed === false ? EXIT_CANCELLED : EXIT_FAILURE;
      }
    }
  }

  const ctx: GeneratorContext = {
    recipe,
    names,
    targetDir,
    // templateDir == targetDir depois da cópia; o pipeline copia e então trabalha no lugar.
    templateDir: targetDir,
    logger,
    dryRun: parsed.dryRun,
  };

  let result;
  try {
    result = await generate(ctx);
  } catch (err) {
    // `GenerationError` já traz a explicação e a dica prontas para o terminal: o pipeline
    // falha de propósito em vez de entregar um projeto pela metade (rename incompleto,
    // baseline sem RLS, costura que não casou). Aqui só formatamos.
    if (err instanceof GenerationError) {
      errorBlock(err.hint === undefined ? [err.message] : [err.message, err.hint]);
      return EXIT_FAILURE;
    }
    throw err;
  }

  nextSteps(ctx, result.report);

  // A senha do seed existe em texto claro exatamente aqui e no `.env` gerado. Mostrá-la
  // agora poupa o usuário de abrir o `.env` antes do primeiro login — e é a única vez que
  // ela aparece, porque o gerador não a guarda em lugar nenhum.
  if (!parsed.dryRun) {
    logger.info(`Senha do admin do seed: ${result.seedPassword}`);
  }

  for (const warning of result.report.warnings) {
    logger.warn(warning);
  }

  return EXIT_OK;
}

// ─────────────────────────────────────────────────────────────────────────────
// Destino
// ─────────────────────────────────────────────────────────────────────────────

function resolveTargetDir(target: string | undefined, slug: string): string {
  if (target === undefined) return resolve(process.cwd(), slug);
  return isAbsolute(target) ? target : resolve(process.cwd(), target);
}

/**
 * Recusa diretório existente e não vazio sem `--force`.
 *
 * "Não vazio" ignora `.DS_Store` e `.git`: o primeiro aparece em qualquer pasta que alguém
 * abriu no Finder no macOS, e recusar por causa dele seria recusar por nada. `.git` é
 * tratado separadamente, com confirmação própria, porque o problema ali é outro.
 */
function checkDestination(targetDir: string, force: boolean): string | undefined {
  if (!existsSync(targetDir)) return undefined;

  let entries: string[];
  try {
    entries = readdirSync(targetDir);
  } catch (error) {
    return `Não consegui ler ${targetDir}: ${(error as Error).message}`;
  }

  const meaningful = entries.filter((entry) => entry !== '.DS_Store' && entry !== '.git');
  if (meaningful.length === 0) return undefined;
  if (force) return undefined;

  const sample = meaningful.slice(0, 4).join(', ');
  return `O diretório ${targetDir} não está vazio (${sample}${meaningful.length > 4 ? ', …' : ''}). Escolha outro nome, apague o diretório, ou passe --force para sobrescrever.`;
}

/**
 * O primeiro ancestral que existe — é de onde a pergunta "estou dentro de um repo?" pode
 * ser feita, porque o `git rev-parse` precisa de um cwd que exista. O destino em si
 * costuma não existir ainda, que é justamente o caso normal.
 */
function nearestExistingDir(targetDir: string): string {
  let current = targetDir;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

/**
 * Pergunta ao usuário, ou recusa quando não há com quem falar.
 *
 * Devolve `true` (siga), `false` (o usuário disse não / cancelou) ou a mensagem de erro
 * quando não existe terminal interativo — o caso do CI, onde um prompt travaria o job para
 * sempre. Nessa situação a resposta certa é falhar dizendo qual flag resolve.
 */
async function confirmOrRefuse(
  message: string,
  assumeYes: boolean,
  noTtyHint: string,
): Promise<true | false | string> {
  if (assumeYes) return true;
  if (process.stdin.isTTY !== true) return noTtyHint;

  const { confirm, isCancel } = await import('@clack/prompts');
  const answer = await confirm({ message, initialValue: false });
  if (isCancel(answer)) return false;
  return answer === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Help
// ─────────────────────────────────────────────────────────────────────────────

/** Duas colunas que nunca colam: uma flag mais longa que a coluna empurra o texto. */
function flagLine(flag: string, description: string, width = 30): void {
  const gap = ' '.repeat(Math.max(2, width - flag.length));
  process.stdout.write(`  ${c.green(flag)}${gap}${description}\n`);
}

function printHelp(version: string): void {
  banner(version);

  heading('Uso');
  command('npx create-dontpanic <nome-ou-caminho> [flags]');
  command('npx create-dontpanic', 'sem argumentos: modo interativo');
  blank();

  heading('Presets');
  for (const id of PRESET_IDS) {
    const suffix = id === DEFAULT_PRESET ? c.dim(' (default)') : '';
    flagLine(`--preset=${id}`, `${PRESETS[id].summary}${suffix}`, 20);
  }
  blank();

  heading('Features — liga com --x, desliga com --no-x');
  for (const id of FEATURE_IDS) {
    // `2fa` é o apelido canônico de `twoFactor`; o kebab do id continua valendo.
    const flag = id === 'twoFactor' ? '2fa' : FEATURE_FLAGS[id];
    flagLine(`--${flag}`, FEATURE_INFO[id].summary, 20);
  }
  blank();

  heading('Valores — sempre com "=", nunca com espaço');
  const valueFlags: [string, string][] = [
    ['--i18n=pt,en', 'idiomas (liga i18n). --i18n=false desliga'],
    ['--default-locale=pt', 'idioma default, quando não é o primeiro da lista'],
    [`--oauth=${OAUTH_PROVIDERS.join(',')}`, 'login social (liga a feature). --oauth=false desliga'],
    [
      '--captcha=turnstile',
      `também ${CAPTCHA_DRIVERS.filter((d) => d !== 'none' && d !== 'turnstile').join(', ')}. --captcha=none desliga`,
    ],
    [`--db=${DB_DRIVERS.join('|')}`, 'banco (só Postgres: o RLS é PL/pgSQL puro)'],
    [`--storage=${STORAGE_DRIVERS.join('|')}`, 'arquivos'],
    [`--mail=${MAIL_DRIVERS.join('|')}`, 'e-mail'],
    [`--cache=${CACHE_DRIVERS.join('|')}`, 'cache'],
    [`--queue=${QUEUE_DRIVERS.join('|')}`, 'fila (liga a feature). --no-queue desliga'],
    ['--slug=acme', 'sobrescreve o slug derivado do nome'],
    ['--name="Acme Corp"', 'nome humano, quando o posicional é um caminho'],
    ['--description="..."', 'descrição que vai para o package.json'],
  ];
  for (const [flag, description] of valueFlags) flagLine(flag, description);
  blank();

  heading('Opções');
  const options: [string, string][] = [
    ['--no-git', 'não roda git init'],
    ['--no-install', 'não roda pnpm install'],
    ['--no-docker', 'não emite docker-compose'],
    ['--force', 'sobrescreve diretório existente e não vazio'],
    ['--dry-run', 'mostra o que faria, sem escrever nada'],
    ['-y, --yes', 'aceita os defaults sem perguntar'],
    ['--debug', 'saída detalhada, com stack em caso de erro'],
    ['-h, --help', 'esta tela'],
    ['-v, --version', 'versão do gerador'],
  ];
  for (const [flag, description] of options) flagLine(flag, description);
  blank();

  heading('Exemplos');
  command('npx create-dontpanic "Acme Corp"');
  command('npx create-dontpanic acme --preset=complete --oauth=google,github');
  command('npx create-dontpanic acme --no-2fa --no-plans --i18n=pt');
  command('npx create-dontpanic ./apps/loja --preset=internal --no-docker --yes');
  blank();

  process.stdout.write(
    `  ${c.dim('Combinações fora da matriz de presets são permitidas e não testadas pelo CI de conformidade.')}\n`,
  );
  blank();
}
