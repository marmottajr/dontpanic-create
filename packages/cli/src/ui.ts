/**
 * Saída no terminal.
 *
 * Tudo passa por `out`/`err` (nunca `console.log`) por dois motivos: os testes trocam
 * `process.stdout.write` para capturar, e `stderr` tem que ficar separado de `stdout` para
 * quem faz `create ... > log.txt` ainda ver os erros.
 *
 * Cor é decidida uma vez, no carregamento: `NO_COLOR` manda, `FORCE_COLOR` manda contra,
 * e sem nenhum dos dois vale o `isTTY`. Emitir ANSI num pipe polui log de CI com sequências
 * de escape que ninguém consegue ler, e é o tipo de coisa que só se descobre no CI.
 */

import pc from 'picocolors';

import { FEATURE_INFO } from './recipe.ts';
import { FEATURE_IDS } from './types.ts';
import type { GenerationReport, GeneratorContext, Logger, NameForms, Recipe } from './types.ts';

function decideColor(): boolean {
  // Convenção de no-color.org: qualquer valor não vazio desliga.
  if (process.env['NO_COLOR'] !== undefined && process.env['NO_COLOR'] !== '') return false;
  const force = process.env['FORCE_COLOR'];
  if (force !== undefined && force !== '' && force !== '0') return true;
  return process.stdout.isTTY === true;
}

export const colorEnabled = decideColor();

/** Paleta única do CLI. `createColors(false)` devolve funções identidade. */
export const c = pc.createColors(colorEnabled);

function out(text: string): void {
  process.stdout.write(`${text}\n`);
}

function errOut(text: string): void {
  process.stderr.write(`${text}\n`);
}

export function blank(): void {
  out('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger
// ─────────────────────────────────────────────────────────────────────────────

export interface LoggerOptions {
  /** `--debug`: mostra o nível debug. */
  debug?: boolean;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const debugEnabled = options.debug === true;
  return {
    step(msg) {
      out(`${c.cyan('◆')} ${msg}`);
    },
    info(msg) {
      out(`${c.dim('│')} ${msg}`);
    },
    warn(msg) {
      // Aviso vai para stderr: é informação que não faz parte do resultado, e quem
      // canaliza a saída para um arquivo ainda precisa vê-la.
      errOut(`${c.yellow('▲')} ${msg}`);
    },
    error(msg) {
      errOut(`${c.red('✖')} ${msg}`);
    },
    debug(msg) {
      if (debugEnabled) errOut(`${c.dim(`· ${msg}`)}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Blocos
// ─────────────────────────────────────────────────────────────────────────────

export function banner(version: string): void {
  blank();
  out(`${c.bold(c.cyan('@dontpanic/create'))} ${c.dim(`v${version}`)}`);
  // A voz do Marvin mora nas bordas — aqui, e nunca numa mensagem de erro.
  out(c.dim('Um SaaS inteiro. Não entre em pânico.'));
  blank();
}

const LABEL_WIDTH = 18;

function field(label: string, value: string): void {
  out(`  ${c.dim(label.padEnd(LABEL_WIDTH))}${value}`);
}

export function heading(text: string): void {
  out(`  ${c.bold(text)}`);
}

export function errorBlock(messages: string[]): void {
  for (const message of messages) errOut(`${c.red('✖')} ${message}`);
}

export function warnBlock(messages: string[]): void {
  for (const message of messages) errOut(`${c.yellow('▲')} ${message}`);
}

/** Uma linha de comando para o usuário copiar. */
export function command(text: string, comment?: string): void {
  const suffix = comment === undefined ? '' : `  ${c.dim(`# ${comment}`)}`;
  out(`  ${c.green(text)}${suffix}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mostra a receita e — importante — as formas derivadas do nome.
 *
 * As formas aparecem aqui porque são a surpresa mais comum: quem digita "Acme Corp" não
 * espera uma role de Postgres chamada `acme_corp_app`, e descobrir isso depois do
 * `db:migrate` custa uma hora. Mostrar antes é mais barato que explicar depois.
 */
export function summaryTable(recipe: Recipe, names: NameForms): void {
  heading('Projeto');
  field('nome', names.human);
  field('slug', names.slug);
  field('pacotes', `@${names.npmScope}/api · @${names.npmScope}/web · @${names.npmScope}/shared`);
  field('banco', `${names.dbName}  ${c.dim(`(role ${names.dbRole} · e2e ${names.dbNameE2e})`)}`);
  field('admin do seed', names.seedAdminEmail);
  if (recipe.project.description !== undefined) field('descrição', recipe.project.description);
  blank();

  const on = FEATURE_IDS.filter((id) => recipe.features[id]);
  const off = FEATURE_IDS.filter((id) => !recipe.features[id]);

  heading('Features');
  field('ligadas', on.length > 0 ? on.map((id) => FEATURE_INFO[id].label).join(', ') : c.dim('nenhuma'));
  field(
    'desligadas',
    off.length > 0 ? c.dim(off.map((id) => FEATURE_INFO[id].label).join(', ')) : c.dim('nenhuma'),
  );
  blank();

  heading('Configuração');
  field(
    'drivers',
    [
      `db=${recipe.drivers.db}`,
      `storage=${recipe.drivers.storage}`,
      `mail=${recipe.drivers.mail}`,
      `cache=${recipe.drivers.cache}`,
      `queue=${recipe.drivers.queue}`,
      `captcha=${recipe.drivers.captcha}`,
    ].join('  '),
  );
  field(
    'idiomas',
    recipe.i18n.locales
      .map((l) => (l === recipe.i18n.defaultLocale ? `${l} ${c.dim('(default)')}` : l))
      .join(', '),
  );
  if (recipe.features.oauth) field('login social', recipe.oauth.providers.join(', '));
  field(
    'opções',
    [
      recipe.options.git ? 'git' : c.dim('sem git'),
      recipe.options.install ? 'install' : c.dim('sem install'),
      recipe.options.docker ? 'docker' : c.dim('sem docker'),
    ].join(' · '),
  );
  blank();
}

// ─────────────────────────────────────────────────────────────────────────────
// Próximos passos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serviços de compose que a receita realmente usa.
 *
 * O gerador é a autoridade (ele emite o compose e informa no relatório); isto é o fallback
 * para quando o relatório vem vazio — hoje, com o pipeline em stub, é sempre o caso.
 */
function composeServicesFor(recipe: Recipe): string[] {
  const services: string[] = [];
  // Hoje `DB_DRIVERS` só tem postgres (o RLS é PL/pgSQL puro); o `if` existe para o dia em
  // que outro adapter entrar, e não para cobrir um caso que já existe.
  if (recipe.drivers.db === 'postgresql') services.push('postgres');
  if (recipe.drivers.cache === 'redis' || recipe.drivers.queue === 'bullmq')
    services.push('redis');
  if (recipe.features.files && recipe.drivers.storage === 's3') services.push('minio');
  if (recipe.drivers.mail === 'smtp') services.push('mailpit');
  return services;
}

/**
 * Imprime os comandos exatos para subir o projeto — condicionados à receita.
 *
 * Passo que a receita não tem não aparece: mostrar `worker:dev` num projeto sem fila ensina
 * o usuário a ignorar a lista, e aí ele ignora também a linha que importava.
 */
export function nextSteps(ctx: GeneratorContext, report: GenerationReport): void {
  const { recipe, names } = ctx;
  const scope = names.npmScope;

  if (report.warnings.length > 0) {
    warnBlock(report.warnings);
    blank();
  }

  if (ctx.dryRun) {
    out(`${c.yellow('▲')} ${c.bold('--dry-run')}: nada foi escrito em ${c.underline(ctx.targetDir)}.`);
    blank();
    return;
  }

  out(`${c.green('✔')} ${c.bold(names.human)} criado em ${c.underline(ctx.targetDir)}.`);
  blank();
  heading('Próximos passos');

  command(`cd ${relativeTarget(ctx.targetDir)}`);

  if (recipe.options.docker) {
    const services =
      report.composeServices.length > 0 ? report.composeServices : composeServicesFor(recipe);
    command('docker compose up -d', services.join(', '));
  } else {
    out(
      `  ${c.dim('sem docker: aponte DATABASE_URL (e o resto do .env) para a sua infra antes de migrar')}`,
    );
  }

  if (!recipe.options.install) command('pnpm install');

  command(`pnpm --filter @${scope}/shared build`, 'contratos compartilhados');
  command(`pnpm --filter @${scope}/api db:migrate`, 'cria o schema');
  command(`pnpm --filter @${scope}/api db:seed`, 'cria o admin inicial');
  command('pnpm dev', 'web :4200 · api :4201 · swagger :4201/docs');

  if (recipe.features.queue && recipe.drivers.queue === 'bullmq') {
    // O CLAUDE.md do boilerplate é enfático: sem o worker, e-mail não sai. Então o comando
    // aparece na lista, e não numa nota de rodapé.
    command(`pnpm --filter @${scope}/api worker:dev`, 'noutro terminal — sem ele, e-mail não sai');
  }

  blank();
  out(
    `  ${c.dim('Entre com')} ${names.seedAdminEmail} ${c.dim('— a senha está em SEED_ADMIN_PASSWORD no .env.')}`,
  );
  blank();
}

/** Caminho relativo ao cwd quando isso encurta; absoluto quando não. */
function relativeTarget(targetDir: string): string {
  const cwd = process.cwd();
  if (targetDir.startsWith(`${cwd}/`)) return targetDir.slice(cwd.length + 1);
  return targetDir;
}
