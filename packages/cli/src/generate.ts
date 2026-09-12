/**
 * O pipeline de geração.
 *
 * Amarra as peças na ordem que importa. A ordem não é preferência de estilo — cada
 * inversão aqui produz uma falha específica e documentada:
 *
 * 1. **Copiar** antes de tudo, óbvio.
 * 2. **Remover features** antes do rename. Os padrões âncora do manifesto são escritos
 *    contra o repo original; depois do rename, `@dontpanic/shared` já não existe para
 *    casar e toda costura falha de uma vez.
 * 3. **Podar o Prisma e montar a baseline** antes do rename. A baseline menciona a role
 *    `dontpanic_app` em treze statements; deixá-la passar pelo motor de rename junto com
 *    todo o resto é o que garante que o SQL e o `.env` concordem sobre o nome da role —
 *    e discordar ali faz o RLS devolver zero linhas sem erro.
 * 4. **Renomear** antes do install. Se o `pnpm install` roda primeiro, os symlinks de
 *    `node_modules/@dontpanic/*` nascem com o nome velho e todo import quebra com
 *    `MODULE_NOT_FOUND`.
 * 5. **Verificar o rename** antes de escrever o `.env`. Se sobrou ocorrência, a geração
 *    falha: entregar um projeto meio renomeado é entregar um `pnpm install` que quebra
 *    por um motivo que o usuário não tem como associar ao gerador.
 * 6. **`.env` e compose depois do rename.** Nascem já com o nome final; passá-los pelo
 *    motor de rename seria reescrever o que acabou de ser escrito certo.
 * 7. **git por último**, para o commit inicial conter o projeto pronto.
 */

import { applyFeatureRemoval } from './features/apply.ts';
import { buildEnv, countEnvKeys, renderEnv } from './env.ts';
import { pruneComposeDevOverride, renderCompose } from './compose.ts';
import { buildBaseline } from './prisma.ts';
import { applyBranding, applyRename, verifyRename } from './rename.ts';
import { copyTemplate } from './template.ts';
import { generateSecrets } from './secrets.ts';
import { initRepo } from './util/git.ts';
import { CommandFailedError, CommandNotFoundError, run } from './util/exec.ts';
import { writeText } from './util/fs.ts';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GenerationReport, GeneratorContext } from './types.ts';

/** Erro que o CLI mostra sem stack: a mensagem já é a explicação. */
export class GenerationError extends Error {
  readonly hint: string | undefined;

  constructor(message: string, hint?: string) {
    super(message);
    this.name = 'GenerationError';
    this.hint = hint;
  }
}

export interface GenerateResult {
  report: GenerationReport;
  /** A senha do admin do seed. Existe em texto claro aqui e no `seed.ts` gerado. */
  seedPassword: string;
  /** `pnpm install` rodou e passou. */
  installed: boolean;
  gitInitialized: boolean;
}

/**
 * `--dry-run` roda o pipeline inteiro num diretório descartável.
 *
 * A alternativa — cada etapa checando `dryRun` e não escrevendo — produz um dry-run que
 * não prova nada: sem os arquivos em disco, o aplicador de costuras não acha o que
 * editar, e as costuras falham com "arquivo ausente" em vez de dizerem se casariam. O
 * relatório mediria a ausência da cópia, não a geração.
 *
 * Copiando para um sandbox, o dry-run exercita tudo — inclusive a verificação de rename
 * e as costuras que envelheceram — e depois apaga. O que ele não faz é `git init` e
 * `pnpm install`, e aí a razão é outra: esses dois agem fora do diretório (a config do
 * git, a rede, o store do pnpm) e não têm como ser ensaiados.
 */
export async function generate(ctx: GeneratorContext): Promise<GenerateResult> {
  const started = Date.now();
  const { logger, dryRun } = ctx;
  const warnings: string[] = [];

  const sandbox = dryRun
    ? await mkdtemp(join(tmpdir(), 'dontpanic-create-dry-'))
    : undefined;
  // O destino real das escritas. O `ctx.targetDir` continua sendo o que aparece nas
  // mensagens: é o caminho que o usuário pediu, e é sobre ele que ele quer ler.
  const workDir = sandbox ?? ctx.targetDir;

  try {
    // `templateDir` vai junto: depois da cópia os dois apontam para o mesmo lugar (é o
    // que o `cli.ts` monta), e trocar só um deixava o aplicador de costuras procurando
    // os arquivos no caminho que o dry-run nunca criou — 96 costuras "obrigatórias"
    // falhando por ausência, o que se lê como manifesto envelhecido e não é.
    return await runPipeline(
      { ...ctx, targetDir: workDir, templateDir: workDir, dryRun: false },
      { started, warnings, dryRun },
    );
  } finally {
    if (sandbox !== undefined) {
      await rm(sandbox, { recursive: true, force: true });
      logger.debug(`dry-run: sandbox ${sandbox} apagado.`);
    }
  }
}

interface PipelineState {
  started: number;
  warnings: string[];
  /** O dry-run pedido pelo usuário — as etapas escrevem no sandbox de todo modo. */
  dryRun: boolean;
}

async function runPipeline(ctx: GeneratorContext, state: PipelineState): Promise<GenerateResult> {
  const { recipe, names, targetDir, logger } = ctx;
  const { started, warnings, dryRun } = state;

  // ── 1. Template ────────────────────────────────────────────────────────────
  logger.step('Copiando o boilerplate...');
  const copied = await copyTemplate(targetDir, { dryRun: false });
  logger.debug(
    `${copied.filesCopied} arquivos, ${copied.dotfilesRestored.length} dotfiles restaurados, ` +
      `${copied.skipped.length} deliberadamente não copiados.`,
  );

  // ── 2. Features ────────────────────────────────────────────────────────────
  const disabled = Object.entries(recipe.features)
    .filter(([, on]) => !on)
    .map(([id]) => id);

  logger.step(
    disabled.length > 0
      ? `Removendo o que você não pediu (${disabled.length}: ${disabled.join(', ')})...`
      : 'Nenhuma feature a remover — mantendo o boilerplate completo.',
  );

  const features = await applyFeatureRemoval(ctx);
  warnings.push(...features.warnings);

  if (features.seamsSkipped.length > 0) {
    // Uma costura que não casou significa que o boilerplate mudou e o manifesto
    // envelheceu. O manifesto marca como `required` tudo que não pode falhar, então o
    // que chega aqui é o que se declarou opcional — mas continua merecendo registro,
    // porque é o primeiro sinal de que a próxima tag vai quebrar.
    logger.debug(`${features.seamsSkipped.length} costura(s) opcional(is) não casaram.`);
  }

  // ── 3. Prisma ──────────────────────────────────────────────────────────────
  logger.step('Montando a migration inicial...');
  const baseline = await buildBaseline(ctx);
  warnings.push(...baseline.warnings);
  logger.debug(
    `baseline com ${baseline.fragments.length} fragmentos; ` +
      `${baseline.removedMigrations.length} migrations do histórico descartadas; ` +
      `RLS ${baseline.rlsRetained ? 'preservado' : 'AUSENTE'}.`,
  );

  // O ADR 0002 é categórico, e um bug que o desfizesse seria invisível: um projeto sem
  // RLS funciona perfeitamente até existir um segundo cliente. Falhar aqui é a única
  // forma de isso não sair pela porta.
  if (!baseline.rlsRetained) {
    throw new GenerationError(
      'A baseline saiu sem Row Level Security.',
      'Isto é bug do gerador, não erro seu — o isolamento entre empresas é preservado em ' +
        'toda configuração, inclusive single-tenant. Reporte com a receita usada.',
    );
  }

  // ── 4. Rename ──────────────────────────────────────────────────────────────
  logger.step(`Renomeando para ${names.human}...`);
  const rename = await applyRename(ctx);
  warnings.push(...rename.warnings);
  logger.debug(
    `${rename.replacements} substituições em ${rename.filesRewritten} arquivos, ` +
      `${rename.pathsRenamed.length} caminhos, ${rename.skippedBinary} binários pulados.`,
  );

  const branding = await applyBranding(ctx);
  warnings.push(...branding.warnings);

  // Uma regra que casou zero vezes é sinal de que a classe de ocorrência que ela cobre
  // desapareceu do boilerplate — ou que ela nunca funcionou. Nos dois casos o aviso vai
  // para o relatório, que é o que o CI de conformidade compara entre execuções.
  const silentRules = rename.byRule.filter((r) => r.occurrences === 0);
  if (silentRules.length > 0) {
    warnings.push(
      `Regras de rename que não casaram nada: ${silentRules.map((r) => r.id).join(', ')}. ` +
        'Se o boilerplate mudou, o mapa de rename envelheceu.',
    );
  }

  // ── 5. Verificação ─────────────────────────────────────────────────────────
  // Roda inclusive em dry-run: "o rename ficaria completo?" é justamente a pergunta que
  // alguém faz um ensaio para responder.
  {
    logger.step('Conferindo que não sobrou nada do nome antigo...');

    // `keepEasterEggs` muda o que conta como sobra: com os easter eggs ligados, a frase
    // "Don't Panic" fica no projeto de propósito, e acusá-la faria o gerador recusar
    // exatamente a configuração que o usuário pediu.
    const verification = await verifyRename(targetDir, {
      keepEasterEggs: recipe.features.easterEggs,
    });

    logger.debug(
      `${verification.filesScanned} arquivos verificados; ` +
        `${verification.accepted.length} ocorrência(s) aceita(s) por exceção declarada.`,
    );

    if (!verification.ok) {
      const shown = verification.blocking.slice(0, 15);
      const rest = verification.blocking.length - shown.length;

      throw new GenerationError(
        `Sobraram ${verification.blocking.length} ocorrência(s) do nome antigo:\n` +
          shown.map((o) => `  ${o.file}:${o.line} — ${o.context.slice(0, 100)}`).join('\n') +
          (rest > 0 ? `\n  ... e outras ${rest}.` : ''),
        'O projeto não é entregue pela metade de propósito: um rename incompleto quebra ' +
          `o \`pnpm install\` com uma mensagem que não aponta para a causa. O diretório ` +
          `ficou em ${targetDir} para inspeção.`,
      );
    }
  }

  // ── 6. Configuração ────────────────────────────────────────────────────────
  logger.step('Gerando .env com segredos novos...');
  const secrets = generateSecrets(names);
  const env = buildEnv(recipe, names, secrets);
  await writeText(join(targetDir, '.env'), renderEnv(env));

  const compose = renderCompose(recipe, names, secrets);
  if (recipe.options.docker) {
    await writeText(join(targetDir, 'docker-compose.yml'), compose.yaml);

    // O override de dev também precisa da poda, e esquecer isto tem um sintoma cruel:
    // um `depends_on: redis: condition: service_healthy` apontando para um serviço que
    // não existe mais faz o `docker compose up` **esperar para sempre**, sem erro e sem
    // timeout. O usuário conclui que o projeto não sobe.
    await pruneComposeDevOverride(targetDir, compose.omitted, { dryRun: false });
  }
  for (const { service, reason } of compose.omitted) {
    logger.debug(`compose sem ${service}: ${reason}`);
  }

  // ── 7. git e install ───────────────────────────────────────────────────────
  let gitInitialized = false;
  if (recipe.options.git && !dryRun) {
    logger.step('Inicializando o repositório...');
    const git = await initRepo(targetDir, names.human);
    gitInitialized = git.initialized;
    if (git.skippedReason !== undefined) warnings.push(git.skippedReason);
  }

  let installed = false;
  if (recipe.options.install && !dryRun) {
    logger.step('Instalando dependências (isto demora)...');
    installed = await install(targetDir, warnings, logger);
  }

  const report: GenerationReport = {
    recipe,
    names,
    filesCopied: copied.filesCopied,
    filesDeleted: features.filesDeleted,
    filesRenamed: rename.pathsRenamed.length,
    replacements: rename.replacements + branding.replacements,
    seamsApplied: features.seamsApplied,
    seamsSkipped: features.seamsSkipped,
    envKeysWritten: countEnvKeys(env),
    secretsGenerated: Object.keys(secrets),
    composeServices: compose.services,
    warnings,
    durationMs: Date.now() - started,
  };

  return { report, seedPassword: rename.seedPassword, installed, gitInitialized };
}

/**
 * Roda o `pnpm install` no projeto gerado.
 *
 * Falha de install **não** aborta a geração: o projeto está escrito e correto em disco, e
 * a causa mais comum é ambiente (pnpm ausente, registry inacessível, rede corporativa).
 * Apagar centenas de arquivos válidos por causa disso seria destruir trabalho bom por um
 * problema que o usuário resolve com um comando.
 */
async function install(
  targetDir: string,
  warnings: string[],
  logger: GeneratorContext['logger'],
): Promise<boolean> {
  try {
    // Sem `--frozen-lockfile`: o projeto nasce sem lockfile de propósito (o do
    // boilerplate descreve os pacotes com o nome velho). Este install é quem o escreve.
    await run('pnpm', ['install'], { cwd: targetDir, timeout: 900_000 });
    return true;
  } catch (err) {
    if (err instanceof CommandNotFoundError) {
      warnings.push(
        'pnpm não está instalado, então as dependências não foram instaladas. ' +
          'Instale com `npm i -g pnpm` e rode `pnpm install` no projeto.',
      );
      return false;
    }

    if (err instanceof CommandFailedError) {
      logger.warn(`O \`pnpm install\` falhou:\n${err.tail}`);
      warnings.push(
        'O `pnpm install` falhou, mas o projeto está completo em disco. ' +
          'Rode `pnpm install` manualmente para ver o erro inteiro.',
      );
      return false;
    }

    throw err;
  }
}
