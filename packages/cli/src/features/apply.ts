/**
 * O aplicador: pega a receita, resolve a ordem e subtrai do template o que não foi pedido.
 *
 * É o passo que executa o manifesto. A ordem interna não é arbitrária — vem do §5 do mapa
 * de superfície, e cada item existe porque o anterior alimenta o seguinte:
 *
 *  1. **Ordem de remoção pelo grafo.** `platform` sai antes de `invitations`, porque as
 *     costuras de um tocam arquivos do outro e precisam achá-los no estado que o mapa
 *     descreve.
 *  2. **Arquivos exclusivos antes das costuras.** Costurar um arquivo que vai ser apagado
 *     é trabalho perdido — e, pior, uma costura `required` que casa num arquivo condenado
 *     dá uma falsa sensação de que o manifesto está em dia.
 *  3. **Costuras agrupadas por ARQUIVO.** Um arquivo é lido uma vez, recebe todas as suas
 *     costuras, é validado uma vez e escrito uma vez. Validar entre costuras acusaria
 *     estados intermediários legitimamente inválidos (o import já saiu, a entrada do array
 *     ainda não).
 *  4. **Deps, compose e docs depois.** Não alimentam nada; são o rabo do processo.
 *
 * Este módulo NÃO renomeia, NÃO monta a baseline SQL e NÃO escreve `.env` — são outros
 * módulos, e a remoção vem antes de todos eles, porque os padrões âncora do manifesto são
 * escritos contra o repo ORIGINAL: depois do rename, `@dontpanic/shared` já não existe
 * para casar.
 */

import { readFile } from 'node:fs/promises';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import { assertWithin, listFiles, pathExists, readText, writeText } from '../util/fs.ts';
import type { FeatureId, GeneratorContext, Recipe, SeamEdit, SeamKind } from '../types.ts';
import { FEATURE_IDS } from '../types.ts';
import { applySeam, assertFileStillValid, findArraySpan, SeamStructureError } from '../seams/index.ts';
import {
  assertNoOrphanRelations,
  dropBlocks as dropPrismaBlocks,
  dropEnumValue as dropPrismaEnumValue,
  dropFields as dropPrismaFields,
  tightenField as tightenPrismaField,
} from '../seams/prisma-schema.ts';
import { FEATURE_MANIFESTS, FILES_ORPHANED_BY_FEATURE_PAIRS, removalOrder } from './manifest.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────────────────────

export interface AppliedSeam {
  file: string;
  kind: SeamKind;
  pattern?: string;
  feature: FeatureId | '(incondicional)';
  changes: number;
}

export interface SkippedSeam {
  file: string;
  kind: SeamKind;
  pattern?: string;
  feature: FeatureId | '(incondicional)';
  reason?: string;
  /**
   * Por que foi pulada.
   *
   * A distinção entre `sem-casamento` e `sobreposta` é a que decide se a geração para, e
   * ela é verificável: uma costura `required` promete casar o boilerplate COMO ELE É
   * ENTREGUE. Então, quando ela não casa o conteúdo atual, testamos contra o conteúdo
   * PRISTINO do arquivo. Se casava lá, outra feature desligada passou primeiro e levou o
   * trecho — `sobreposta`, e o estado final é o desejado. Se não casava nem lá, o
   * template mudou e o manifesto envelheceu — `sem-casamento`, e isso FALHA a geração.
   *
   * Sem essa distinção, toda combinação com duas features que dividem uma frase do
   * `CLAUDE.md` (oauth e public-signup dividem quatro) seria ingerável.
   */
  cause: 'arquivo-ausente' | 'sem-casamento' | 'sobreposta' | 'reescrita-manual';
}

export interface FeatureRemovalResult {
  /** Features desligadas, na ordem em que foram removidas. */
  removed: FeatureId[];
  filesDeleted: string[];
  seamsApplied: AppliedSeam[];
  seamsSkipped: SkippedSeam[];
  depsRemoved: { workspace: string; name: string }[];
  composeServices: string[];
  docSections: string[];
  sqlFragments: string[];
  envKeys: string[];
  warnings: string[];
}

/** Uma costura `required` não casou: o manifesto envelheceu. Para a geração. */
export class SeamMismatchError extends Error {
  readonly failures: SkippedSeam[];

  constructor(failures: SkippedSeam[]) {
    const detail = failures
      .map(
        (failure) =>
          `  - ${failure.file}\n` +
          `      costura: ${failure.kind}${failure.pattern ? ` /${failure.pattern}/` : ''}\n` +
          `      feature: ${failure.feature}\n` +
          `      causa:   ${failure.cause}\n` +
          `      motivo:  ${failure.reason ?? '(o manifesto não declarou)'}`,
      )
      .join('\n');

    super(
      `${failures.length} costura(s) obrigatória(s) não casou/casaram.\n\n${detail}\n\n` +
        `O que isso significa: o template sincronizado mudou e o manifesto do gerador ` +
        `(src/features/*) envelheceu. A geração PARA aqui de propósito — seguir adiante ` +
        `entregaria um projeto com código órfão da feature que você desligou, e a falha ` +
        `apareceria muito depois, num build que não menciona o gerador.\n` +
        `Conserto: atualize o padrão âncora da costura contra a tag nova do template.`,
    );
    this.name = 'SeamMismatchError';
    this.failures = failures;
  }
}

/** Tentaram desligar uma feature que a v1 não sabe remover. */
export class AlwaysOnError extends Error {
  constructor(features: FeatureId[]) {
    const detail = features
      .map((id) => `  - ${id}: ${FEATURE_MANIFESTS[id].summary}`)
      .join('\n');
    super(
      `Estas features não podem ser desligadas na v1:\n${detail}\n\n` +
        `Não é limitação de preguiça: o mapa de superfície mediu o custo e concluiu que a ` +
        `remoção entregaria um projeto que não compila ou que perde uma garantia que o ` +
        `boilerplate existe para dar. Ver os vetos em src/features/manifest.ts.`,
    );
    this.name = 'AlwaysOnError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Templating de costura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Expande os poucos placeholders que uma costura pode carregar.
 *
 * Só o modo single-language precisa disso, e precisa de verdade: QUAL catálogo de locale
 * sobrevive é valor da receita (`recipe.i18n.defaultLocale`), não constante do manifesto.
 * O manifesto não pode nomear `pt-BR.json` nem `en-US.json` — os dois são intercambiáveis,
 * e fixar um faria o gerador apagar o idioma errado para quem pediu inglês.
 *
 * Mantido minúsculo de propósito. Um manifesto com linguagem de template dentro vira o
 * `{{#if}}` que o ADR 0001 rejeitou, só num arquivo diferente.
 */
export function expandPlaceholders(
  text: string,
  recipe: Recipe,
  /**
   * A TAG do catálogo que sobreviveu (`pt-BR`), quando ela é conhecida.
   *
   * A receita fala `pt`; o catálogo e o `locales.ts` falam `pt-BR`. Expandir o
   * placeholder com o valor CRU da receita produzia `defaultLocale: 'pt'` num
   * `locales.ts` cujo array é `['pt-BR']`, e o build do Next quebrava em
   * `i18n/request.ts` com `Can't resolve '../../messages/pt.json'` — um arquivo que nunca
   * existiu. A tag real vem da varredura de `apps/web/messages`.
   */
  localeTag?: string,
): string {
  const surviving = localeTag ?? recipe.i18n.defaultLocale;
  const dropped = recipe.i18n.locales.filter((locale) => locale !== recipe.i18n.defaultLocale);

  return text
    .replace(/\{\{i18n\.defaultLocale\}\}/g, surviving)
    // `EmailLocale` é a chave estreita do segundo sistema bilíngue, o da API
    // (`email-templates.ts:13-32`): `pt-BR` ou `en`, não a tag BCP 47 inteira.
    .replace(/\{\{i18n\.emailLocale\}\}/g, emailLocaleOf(surviving))
    .replace(/\{\{i18n\.droppedEmailLocaleKey\}\}/g, emailLocaleOf(dropped[0] ?? 'en'))
    // A TAG completa do catálogo descartado (`en-US`), para as costuras que removem a
    // entrada dele de um mapa indexado por tag — `localeMeta` em `locales.ts`.
    .replace(/\{\{i18n\.droppedLocaleTag\}\}/g, catalogueTagOf(dropped[0] ?? 'en'));
}

/** `pt-BR` → `pt-BR`; `en-US` → `en`. A tabela `STRINGS` da API usa essas duas chaves. */
function emailLocaleOf(locale: string): string {
  return locale.startsWith('pt') ? 'pt-BR' : 'en';
}

/** `pt` → `pt-BR`; `en` → `en-US`. As tags dos catálogos do template. */
function catalogueTagOf(locale: string): string {
  if (locale.includes('-')) return locale;
  return locale.startsWith('pt') ? 'pt-BR' : 'en-US';
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada principal
// ─────────────────────────────────────────────────────────────────────────────

export async function applyFeatureRemoval(
  ctx: GeneratorContext,
): Promise<FeatureRemovalResult> {
  const { recipe, templateDir, logger, dryRun } = ctx;

  const result: FeatureRemovalResult = {
    removed: [],
    filesDeleted: [],
    seamsApplied: [],
    seamsSkipped: [],
    depsRemoved: [],
    composeServices: [],
    docSections: [],
    sqlFragments: [],
    envKeys: [],
    warnings: [],
  };

  // ── 1. Recusa desligar o que a v1 não sabe remover ────────────────────────
  const illegal = FEATURE_IDS.filter(
    (id) => FEATURE_MANIFESTS[id].alwaysOn === true && !recipe.features[id],
  );
  if (illegal.length > 0) throw new AlwaysOnError(illegal);

  // ── 2. Ordem de remoção pelo grafo ────────────────────────────────────────
  const off = FEATURE_IDS.filter((id) => !recipe.features[id]);
  const order = removalOrder(off);
  result.removed = order;

  if (order.length === 0) {
    logger.info('Nenhuma feature desligada: o template sai completo.');
  } else {
    logger.step(`Removendo ${order.length} feature(s): ${order.join(', ')}`);
  }

  // ── 3. Arquivos exclusivos ────────────────────────────────────────────────
  for (const id of order) {
    for (const path of FEATURE_MANIFESTS[id].deletePaths ?? []) {
      const deleted = await deletePath(templateDir, path, dryRun);
      if (deleted.length === 0) {
        // Caminho ausente não é fatal: o mapa lista arquivos que só existem quando outra
        // feature está instalada, e o `deletePaths` não tem condicionalidade. Mas ENTRA no
        // relatório — uma lista de ausentes que cresce é o sinal de que o template mudou.
        result.warnings.push(
          `[${id}] caminho de remoção não existe no template: ${path} ` +
            `(esperado se outra feature já o levou; investigue se a lista crescer)`,
        );
        continue;
      }
      result.filesDeleted.push(...deleted);
    }
  }

  // Arquivos que só ficam órfãos quando um PAR de features sai junto — o caso do
  // `auth-config.ts`, cujas duas únicas metades são oauth e public-signup. Nenhum dos
  // dois manifestos pode declarar isso sozinho sem apagar o arquivo cedo demais.
  for (const rule of FILES_ORPHANED_BY_FEATURE_PAIRS) {
    if (!rule.when.every((id) => order.includes(id))) continue;
    for (const path of rule.paths) {
      const deleted = await deletePath(templateDir, path, dryRun);
      if (deleted.length === 0) continue;
      result.filesDeleted.push(...deleted);
      result.warnings.push(`Órfão por combinação (${rule.when.join(' + ')}): ${path} — ${rule.reason}`);
    }
  }

  // ── 4. Modo single-tenant e single-language: o que o manifesto não expressa ─
  const localeTag = await pruneLocaleCatalogues(ctx, result);

  // Assimetria conhecida do manifesto de i18n: algumas costuras de spec nomeiam os testes
  // do idioma DESCARTADO, e as âncoras foram escritas assumindo que o descartado é o
  // inglês — o que vale para os quatro presets, todos com `defaultLocale: 'pt'`. Com outro
  // idioma default, aquelas costuras não casam (são `required: false`) e a suíte do projeto
  // gerado nasce vermelha em dois testes de e-mail. Avisar alto é melhor que gerar assim em
  // silêncio; o conserto é escrever as âncoras espelhadas no manifesto.
  if (!recipe.features.i18n && localeTag !== undefined && !localeTag.startsWith('pt')) {
    result.warnings.push(
      `Idioma único "${localeTag}": as costuras de spec de i18n foram escritas para o caso ` +
        `em que o INGLÊS é o idioma descartado (é o dos quatro presets). Com "${localeTag}" ` +
        `como default, revise \`invitation-email.spec.ts\` no projeto gerado — dois testes ` +
        `comparam o assunto do e-mail com string exata e podem falhar.`,
    );
  }

  // ── 5. Costuras, agrupadas por arquivo ────────────────────────────────────
  const byFile = new Map<string, { feature: FeatureId | '(incondicional)'; seam: SeamEdit }[]>();

  for (const id of order) {
    for (const seam of FEATURE_MANIFESTS[id].seams ?? []) {
      const file = expandPlaceholders(seam.file, recipe, localeTag);
      const bucket = byFile.get(file) ?? [];
      bucket.push({ feature: id, seam });
      byFile.set(file, bucket);
    }
  }

  const required: SkippedSeam[] = [];

  for (const [file, edits] of [...byFile.entries()].sort()) {
    const abs = assertWithin(templateDir, file);

    if (!(await pathExists(abs))) {
      // O arquivo pode ter sido apagado por OUTRA feature desligada — é o caso comum, não
      // a exceção: `platform` apaga `modules/platform/**` inteiro, e `invitations` tem 15
      // costuras que tocam arquivos de lá. Nesse caso a costura não tem o que fazer e o
      // estado final é o desejado.
      //
      // Mas "ausente porque nós apagamos" e "ausente porque o manifesto nomeia um arquivo
      // que o template não tem" são coisas opostas, e só a segunda significa manifesto
      // envelhecido. A distinção é `filesDeleted`: se o caminho está lá (ou dentro de um
      // diretório que está lá), a ausência foi obra desta geração.
      const weDeletedIt = result.filesDeleted.some(
        (deleted) => file === deleted || file.startsWith(`${deleted}/`),
      );

      for (const { feature, seam } of edits) {
        const skipped: SkippedSeam = {
          file,
          kind: seam.kind,
          feature,
          cause: 'arquivo-ausente',
          ...(seam.pattern === undefined ? {} : { pattern: seam.pattern }),
          ...(seam.reason === undefined ? {} : { reason: seam.reason }),
        };
        result.seamsSkipped.push(skipped);
        if (weDeletedIt) continue;
        // Em `--dry-run` o template não é copiado para o destino, então TODO arquivo está
        // ausente por construção. Tratar isso como manifesto envelhecido faria o dry-run
        // — cujo propósito é justamente conferir a receita sem escrever nada — ser a única
        // forma de execução que sempre falha.
        if (dryRun) continue;
        if (seam.required !== false && seam.kind !== 'manualRewrite') required.push(skipped);
      }
      continue;
    }

    // O conteúdo PRISTINO fica guardado: é o oráculo que distingue "o manifesto
    // envelheceu" de "outra feature já removeu isto". Ver o comentário em `cause`.
    const original = await readText(abs);
    let content = original;
    let touched = false;

    for (const { feature, seam } of edits) {
      const expanded = expandSeam(seam, recipe, localeTag);
      let outcome;
      try {
        outcome = applySeam(expanded, content, { asset: () => undefined });
      } catch (error) {
        if (error instanceof SeamStructureError) {
          // Numa costura OPCIONAL, falha estrutural é o mesmo fenômeno que "não casou",
          // só detectado mais fundo: o alvo não está no estado que o manifesto descreve
          // porque outra feature já passou por ali. O caso concreto é o
          // `static readonly LOGIN_TICKET_TTL`, que `twoFactor` remove antes de `oauth`
          // tentar usá-lo como fim de bloco. Registrar e seguir é o comportamento certo;
          // abortar faria a combinação "oauth e 2FA fora, os dois" ser ingerável.
          if (seam.required === false) {
            result.seamsSkipped.push({
              file,
              kind: seam.kind,
              feature,
              cause: 'sem-casamento',
              ...(expanded.pattern === undefined ? {} : { pattern: expanded.pattern }),
              ...(seam.reason === undefined ? {} : { reason: seam.reason }),
            });
            result.warnings.push(
              `[${feature}] ${file}: costura opcional falhou estruturalmente ` +
                `(${error.detail}) — provavelmente outra feature já removeu o trecho.`,
            );
            continue;
          }

          // Numa costura OBRIGATÓRIA, é o oposto: o manifesto está ERRADO agora, não
          // envelhecido. Anexa o motivo declarado, que é o que orienta o conserto.
          throw new Error(
            `${error.message}\n  feature: ${feature}\n  motivo da costura: ${
              seam.reason ?? '(não declarado)'
            }`,
          );
        }
        throw error;
      }

      if (outcome.matched) {
        content = outcome.content;
        touched = true;
        result.seamsApplied.push({
          file,
          kind: seam.kind,
          feature,
          changes: outcome.changes,
          ...(expanded.pattern === undefined ? {} : { pattern: expanded.pattern }),
        });
        continue;
      }

      // Casava no arquivo original? Então outra feature desligada chegou antes.
      let cause: SkippedSeam['cause'];
      if (seam.kind === 'manualRewrite') {
        cause = 'reescrita-manual';
      } else if (content !== original && matchedPristine(expanded, original)) {
        cause = 'sobreposta';
      } else {
        cause = 'sem-casamento';
      }

      const skipped: SkippedSeam = {
        file,
        kind: seam.kind,
        feature,
        cause,
        ...(expanded.pattern === undefined ? {} : { pattern: expanded.pattern }),
        ...(seam.reason === undefined ? {} : { reason: seam.reason }),
      };
      result.seamsSkipped.push(skipped);

      if (cause === 'sobreposta') continue;

      if (cause === 'reescrita-manual') {
        // Não falha: é instrução para um humano, e ela precisa ser VISTA.
        result.warnings.push(
          `REESCRITA MANUAL — ${file} (feature ${feature}):\n    ${
            seam.reason ?? 'o manifesto não declarou o motivo'
          }`,
        );
        continue;
      }
      if (seam.required !== false) required.push(skipped);
    }

    if (touched) {
      assertFileStillValid(file, content);
      if (!dryRun) await writeText(abs, content);
    }
  }

  if (required.length > 0) throw new SeamMismatchError(required);

  // ── 6. Schema Prisma: models, enums, campos e nullability ─────────────────
  //
  // DEPOIS das costuras, e a ordem foi aprendida na prática. O §5 do mapa põe a poda do
  // schema como passo 2, antes da poda da API — mas isso é sobre o ESTADO FINAL, porque
  // quem consome o schema é o `prisma generate` e o montador da baseline, os dois depois
  // deste módulo inteiro. A ordem aqui dentro é livre, e há uma razão forte para o
  // estruturado vir por último:
  //
  // as costuras usam o conteúdo PRISTINO do arquivo como oráculo para distinguir
  // "manifesto envelheceu" de "outra feature chegou antes" (ver `cause`). Rodando o passo
  // estruturado primeiro, ele ESCREVE no disco, o pristino deixa de ser pristino, e duas
  // costuras legítimas de `plans` sobre `tenancy.prisma` passaram a ser classificadas
  // como manifesto velho — matando a geração do preset `minimal`.
  await prunePrismaSchema(ctx, order, result);

  // ── 7. A allowlist de @SystemScope() é RECALCULADA, nunca copiada ─────────
  await recomputeSystemScopeAllowlist(ctx, result);

  // ── 8. Prisma: relação órfã antes de escrever qualquer coisa a mais ───────
  await assertPrismaIntact(templateDir, result);

  // ── 9. Deps npm ───────────────────────────────────────────────────────────
  await removeDependencies(ctx, order, result);

  // ── 10. Docs: o projeto gerado não documenta o que não tem ───────────────
  await pruneDocSections(ctx, order, result);

  // ── 11. Inventário que outros passos consomem ────────────────────────────
  for (const id of order) {
    const manifest = FEATURE_MANIFESTS[id];
    result.composeServices.push(...(manifest.composeServices ?? []));
    result.sqlFragments.push(...(manifest.sqlFragments ?? []));
    result.envKeys.push(...(manifest.envKeys ?? []));
  }

  // Regra global 3 do mapa: pisos de cobertura são absolutos e fixados nos números
  // alcançados. Apagar código bem coberto move o agregado do que SOBRA.
  if (order.length > 0) {
    result.warnings.push(
      'Pisos de cobertura: `apps/api/jest.config.js` e `apps/web/vitest.config.mts` foram ' +
        'afrouxados onde o manifesto pediu. Re-fixe os números depois do primeiro `pnpm test` ' +
        'verde do projeto gerado — um piso alto demais ensina o time a apagar o portão.',
    );
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Peças
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A costura casaria o arquivo COMO O TEMPLATE O ENTREGA?
 *
 * É a pergunta que separa manifesto envelhecido de sobreposição entre features. Roda
 * contra o conteúdo pristino e engole qualquer erro estrutural: aqui não interessa se a
 * edição daria certo, só se o ALVO existia antes de esta geração começar a subtrair.
 */
function matchedPristine(edit: SeamEdit, original: string): boolean {
  try {
    return applySeam(edit, original, { asset: () => undefined }).matched;
  } catch {
    // Falhou estruturalmente contra o original: o alvo ESTAVA lá (senão não teria ido
    // tão longe), então conta como sobreposição e não como manifesto velho.
    return true;
  }
}

function expandSeam(seam: SeamEdit, recipe: Recipe, localeTag?: string): SeamEdit {
  const ex = (text: string): string => expandPlaceholders(text, recipe, localeTag);
  const out: SeamEdit = { ...seam, file: ex(seam.file) };
  if (seam.pattern !== undefined) out.pattern = ex(seam.pattern);
  if (seam.replacement !== undefined) out.replacement = ex(seam.replacement);
  if (seam.target !== undefined) out.target = ex(seam.target);
  if (seam.block !== undefined) {
    out.block = { start: ex(seam.block.start), end: ex(seam.block.end) };
  }
  return out;
}

/**
 * Apaga um caminho do manifesto. Devolve os caminhos relativos removidos.
 *
 * Caminho LITERAL primeiro, glob só quando há `*`. A ordem importa por um motivo
 * concreto: `apps/web/src/app/(auth)/signup/complete` tem parênteses, que são sintaxe de
 * grupo em glob. Tratado como glob, `(auth)` viraria uma alternância de um termo e
 * *poderia* casar — ou não, dependendo da biblioteca — e "depende da biblioteca" não é
 * base para uma operação de apagar arquivo. Os caminhos do App Router do Next são cheios
 * de parênteses e colchetes; nenhum deles é glob.
 *
 * Todo caminho passa por `assertWithin`: um `..` num manifesto apagaria arquivo do
 * usuário fora do diretório de destino.
 */
async function deletePath(root: string, path: string, dryRun: boolean): Promise<string[]> {
  if (!path.includes('*')) {
    const abs = assertWithin(root, path);
    if (!(await pathExists(abs))) return [];
    if (!dryRun) await rm(abs, { recursive: true, force: true });
    return [path];
  }

  // Glob: só as formas que o manifesto usa (`dir/**`, `dir/*.ts`, `**/x.spec.ts`).
  const re = globToRegExp(path);
  const entries = await listFiles(root);
  const hits = entries.filter((entry) => re.test(entry.rel));
  for (const hit of hits) {
    const abs = assertWithin(root, hit.rel);
    if (!dryRun) await rm(abs, { force: true });
  }
  return hits.map((hit) => hit.rel);
}

/**
 * Glob → regex, para as formas que o manifesto realmente usa.
 *
 * Deliberadamente pequeno em vez de uma dependência: o gerador publica com duas deps, e
 * um matcher de glob completo traria uma árvore inteira para resolver `dir/**`. Escapa
 * TUDO que é metacaractere de regex antes de traduzir os curingas — inclusive parênteses
 * e colchetes, que aparecem em todo caminho do App Router.
 */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    const ch = glob[i] ?? '';
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        // `**/` casa zero ou mais segmentos; `**` no fim casa o resto.
        if (glob[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
        continue;
      }
      out += '[^/]*';
      continue;
    }
    if (ch === '?') {
      out += '[^/]';
      continue;
    }
    out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/**
 * Reescreve a lista esperada de rotas com `@SystemScope()` a partir do que SOBROU.
 *
 * Isto é a regra 2 do §0 do mapa, e ela é categórica: *"the `@SystemScope()` allowlist
 * test is computed, not copied"*. O spec
 * `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` varre a árvore da API,
 * conta os `@SystemScope()` por arquivo e compara com um array literal. Toda feature que
 * possui uma rota com esse decorator muda a contagem:
 *
 *  - `publicSignup` tira `signup` → `auth.controller.ts` cai de 8 para 7;
 *  - `oauth` tira a linha inteira de `oauth.controller.ts:1`;
 *  - `invitations` tira `public-invitations.controller.ts:2`.
 *
 * Emitir o array do repo num projeto podado dá suíte VERMELHA num clone novo. E o conserto
 * óbvio — apagar o teste — destrói a proteção que impede a lista de crescer sem alguém
 * pensar, que é justamente o que esse teste existe para fazer: `@SystemScope()` ignora o
 * isolamento entre empresas, e o mapa é explícito que numa rota de negócio isso é bug de
 * segurança.
 *
 * Então recalculamos: varremos a árvore gerada exatamente como o spec varre, e reescrevemos
 * o array com o resultado. O teste continua sendo um portão, e passa por construção na
 * primeira execução — que é a única forma de ele não ser editado no primeiro dia.
 */
async function recomputeSystemScopeAllowlist(
  ctx: GeneratorContext,
  result: FeatureRemovalResult,
): Promise<void> {
  const { templateDir, dryRun } = ctx;
  const rel = 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts';
  const abs = assertWithin(templateDir, rel);
  if (!(await pathExists(abs))) return;

  const srcRoot = join(templateDir, 'apps/api/src');
  if (!(await pathExists(srcRoot))) return;

  // A MESMA contagem que o spec faz: ocorrências de `@SystemScope()` no início da linha.
  const entries: string[] = [];
  for (const entry of await listFiles(srcRoot)) {
    if (!entry.rel.endsWith('.ts') || entry.rel.endsWith('.spec.ts')) continue;
    const uses = (await readText(entry.path)).match(/^\s*@SystemScope\(\)/gm);
    if (uses) entries.push(`${entry.rel}:${uses.length}`);
  }
  entries.sort();

  const content = await readText(abs);
  const span = findArraySpan(content, 'toEqual');
  // `findArraySpan` procura `<prop>: [`; aqui a forma é `toEqual([`, então caímos no
  // localizador genérico de `expect(found.sort()).toEqual([ … ])`.
  const open = span?.open ?? content.indexOf('toEqual([');
  if (open === -1) {
    result.warnings.push(
      `Não achei o array esperado em ${rel}: a allowlist de @SystemScope() NÃO foi ` +
        `recalculada, e a suíte do projeto gerado vai falhar nesse teste. ` +
        `Conserto: reabrir a regra 2 do §0 do mapa contra o spec novo.`,
    );
    return;
  }

  const bracket = content.indexOf('[', open);
  const close = matchingBracket(content, bracket);
  if (close === -1) {
    result.warnings.push(`Array de @SystemScope() malformado em ${rel}; não recalculado.`);
    return;
  }

  const indent = '      ';
  const body =
    entries.length === 0
      ? ''
      : `\n${indent}// Recalculado pelo gerador a partir das rotas que sobraram: cada\n` +
        `${indent}// \`@SystemScope()\` ignora o isolamento entre empresas, e esta lista é o\n` +
        `${indent}// portão que impede que ela cresça sem alguém pensar.\n` +
        entries.map((item) => `${indent}'${item}',`).join('\n') +
        `\n    `;

  const next = `${content.slice(0, bracket + 1)}${body}${content.slice(close)}`;
  if (!dryRun) await writeText(abs, next);

  result.seamsApplied.push({
    file: rel,
    kind: 'replace',
    pattern: '@SystemScope() allowlist (recalculada)',
    feature: '(incondicional)',
    changes: entries.length,
  });
  result.warnings.push(
    `Allowlist de @SystemScope() recalculada: ${entries.length} arquivo(s) — ` +
      `${entries.join(', ') || '(nenhum)'}.`,
  );
}

/** Fechamento do `[` em `open`, contando aninhamento. */
function matchingBracket(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Aplica o bloco `prisma` de cada feature removida: arquivos, blocos, campos e nullability.
 *
 * Este passo existia só no manifesto: o campo `prisma` era declarado por seis features e
 * NINGUÉM o consumia, então cada `dropBlocks`/`dropFields`/`tighten` era dado morto. O
 * sintoma foi caro e nada óbvio — o `tighten` do `User.passwordHash` não acontecia, o
 * schema seguia com `passwordHash String?`, o `@prisma/client` tipava a coluna como
 * `string | null`, e as quatro chamadas de `verifyPassword` falhavam com `TS2345` em
 * arquivos que não mencionam oauth. O erro aponta para o CHAMADOR; a causa está no schema.
 *
 * A ordem interna também é forçada:
 *
 *  1. **`dropFiles`** — um arquivo de schema inteiro (`oauth.prisma`, `invitations.prisma`)
 *     sai antes de qualquer edição, senão as relações inversas seriam removidas de um
 *     arquivo que ainda declara o model.
 *  2. **`dropBlocks`** — `model`/`enum` que sobrevivem num arquivo compartilhado.
 *  3. **`dropFields`** — as relações INVERSAS nos models que ficam. O Prisma recusa
 *     validar um campo de relação cujo model-alvo não existe, e o erro culpa o model que
 *     SOBROU. Por isso `assertNoOrphanRelations` roda depois de tudo.
 *  4. **`dropEnumValues`** — valor de enum que perde o dono (`Role.SUPERADMIN` sem
 *     `platform`).
 *  5. **`tighten`** — por último, porque estreitar depende de o campo ainda existir.
 */
async function prunePrismaSchema(
  ctx: GeneratorContext,
  order: readonly FeatureId[],
  result: FeatureRemovalResult,
): Promise<void> {
  const { templateDir, dryRun } = ctx;
  const schemaDir = join(templateDir, 'apps/api/prisma/schema');
  if (!(await pathExists(schemaDir))) return;

  // 1 · arquivos de schema inteiros
  for (const id of order) {
    for (const rel of FEATURE_MANIFESTS[id].prisma?.dropFiles ?? []) {
      const deleted = await deletePath(templateDir, rel, dryRun);
      if (deleted.length === 0) {
        result.warnings.push(`[${id}] arquivo de schema já ausente: ${rel}`);
        continue;
      }
      result.filesDeleted.push(...deleted);
    }
  }

  // Os arquivos que sobraram, editados em memória e escritos uma vez cada.
  const files = (await listFiles(schemaDir)).filter((entry) => entry.rel.endsWith('.prisma'));
  const buffers = new Map<string, { rel: string; abs: string; content: string; touched: boolean }>();
  for (const entry of files) {
    buffers.set(entry.rel, {
      rel: `apps/api/prisma/schema/${entry.rel}`,
      abs: entry.path,
      content: await readText(entry.path),
      touched: false,
    });
  }

  /** Aplica `edit` no primeiro arquivo em que ele casar. */
  const applyToSchema = (
    id: FeatureId,
    kind: SeamKind,
    label: string,
    edit: (content: string) => { matched: boolean; content: string; changes: number },
  ): void => {
    for (const buffer of buffers.values()) {
      const out = edit(buffer.content);
      if (!out.matched) continue;
      buffer.content = out.content;
      buffer.touched = true;
      result.seamsApplied.push({
        file: buffer.rel,
        kind,
        pattern: label,
        feature: id,
        changes: out.changes,
      });
      return;
    }
    // Não casou em arquivo nenhum. Não é fatal: outra feature removida pode ter levado o
    // model inteiro (e aí não há campo a remover). Mas vai ao relatório, porque um
    // `tighten` que não acontece só aparece como `TS2345` no chamador, muito depois.
    result.seamsSkipped.push({
      file: 'apps/api/prisma/schema/**',
      kind,
      pattern: label,
      feature: id,
      cause: 'sem-casamento',
      reason: `nenhum arquivo de schema contém ${label}`,
    });
  };

  for (const id of order) {
    const prisma = FEATURE_MANIFESTS[id].prisma;
    if (!prisma) continue;

    // 2 · models e enums
    for (const name of prisma.dropBlocks ?? []) {
      applyToSchema(id, 'dropPrismaBlock', name, (content) => dropPrismaBlocks(content, [name]));
    }

    // 3 · campos (as relações inversas)
    for (const entry of prisma.dropFields ?? []) {
      for (const field of entry.fields) {
        applyToSchema(id, 'dropPrismaField', `${entry.model}.${field}`, (content) =>
          dropPrismaFields(content, entry.model, [field]),
        );
      }
    }

    // 4 · valores de enum
    for (const entry of prisma.dropEnumValues ?? []) {
      for (const value of entry.values) {
        applyToSchema(id, 'dropPrismaEnumValue', `${entry.enum}.${value}`, (content) =>
          dropPrismaEnumValue(content, entry.enum, value),
        );
      }
    }

    // 5 · nullability
    for (const entry of prisma.tighten ?? []) {
      applyToSchema(id, 'tightenPrismaField', `${entry.model}.${entry.field}`, (content) =>
        tightenPrismaField(content, entry.model, entry.field),
      );
    }
  }

  for (const buffer of buffers.values()) {
    if (!buffer.touched || dryRun) continue;
    await writeText(buffer.abs, buffer.content);
  }
}

/**
 * Modo single-language: apaga os catálogos que não sobrevivem.
 *
 * Não está em `deletePaths` porque o manifesto não pode saber QUAL sobrevive — os dois
 * arquivos são intercambiáveis e a escolha é da receita. E os dois são podados em
 * LOCKSTEP quando ambos sobrevivem, porque `apps/web/src/i18n/messages.test.ts` compara
 * os conjuntos de chaves e nomeia as órfãs: podar um lado só dá suíte vermelha num clone
 * novo, que é a falha que treina o usuário a apagar o teste.
 *
 * `messages.test.ts` só é apagado quando sobra UM catálogo — aí não há paridade a testar.
 */
async function pruneLocaleCatalogues(
  ctx: GeneratorContext,
  result: FeatureRemovalResult,
): Promise<string | undefined> {
  const { recipe, templateDir, dryRun } = ctx;
  const messagesDir = join(templateDir, 'apps/web/messages');
  if (!(await pathExists(messagesDir))) return undefined;

  const catalogues = (await listFiles(messagesDir))
    .filter((entry) => entry.rel.endsWith('.json'))
    .map((entry) => entry.rel.replace(/\.json$/, ''));

  const keep = new Set(
    recipe.features.i18n ? recipe.i18n.locales : [recipe.i18n.defaultLocale],
  );
  // A receita fala `pt`, o catálogo se chama `pt-BR`: casa pelo prefixo de idioma.
  const survivors = catalogues.filter((tag) =>
    [...keep].some((wanted) => tag === wanted || tag.startsWith(`${wanted}-`)),
  );

  if (survivors.length === 0) {
    result.warnings.push(
      `Nenhum catálogo de mensagens casa com os idiomas pedidos (${[...keep].join(', ')}); ` +
        `os catálogos do template (${catalogues.join(', ')}) foram mantidos intactos.`,
    );
    return undefined;
  }

  // A tag do catálogo que corresponde ao idioma DEFAULT da receita — é ela que as
  // costuras precisam, não o `pt` cru.
  const defaultTag = survivors.find(
    (tag) =>
      tag === recipe.i18n.defaultLocale || tag.startsWith(`${recipe.i18n.defaultLocale}-`),
  );

  for (const tag of catalogues) {
    if (survivors.includes(tag)) continue;
    const rel = `apps/web/messages/${tag}.json`;
    const abs = assertWithin(templateDir, rel);
    if (!dryRun) await rm(abs, { force: true });
    result.filesDeleted.push(rel);
  }

  if (survivors.length === 1 && catalogues.length > 1) {
    const rel = 'apps/web/src/i18n/messages.test.ts';
    const abs = assertWithin(templateDir, rel);
    if (await pathExists(abs)) {
      if (!dryRun) await rm(abs, { force: true });
      result.filesDeleted.push(rel);
      result.warnings.push(
        'Sobrou um catálogo de mensagens, então `messages.test.ts` (teste de paridade de ' +
          'chaves) foi removido: não há dois conjuntos para comparar. Se você acrescentar um ' +
          'segundo idioma depois, traga o teste de volta — ele é o que impede uma chave órfã.',
      );
    }
  }

  return defaultTag;
}

/**
 * Checa o schema Prisma inteiro depois da poda.
 *
 * O boilerplate usa uma PASTA de schema (5 arquivos), e um model em `tenancy.prisma`
 * referencia um enum em `oauth.prisma`. Então a checagem tem que ser sobre a
 * concatenação: arquivo por arquivo, toda relação entre arquivos pareceria órfã.
 *
 * Roda ANTES de qualquer passo posterior porque o erro do `prisma generate` culpa o model
 * que SOBROU, não o que saiu — e quando ele aparece, no `db:migrate` do projeto gerado
 * depois do `pnpm install`, ninguém liga mais o defeito ao gerador.
 */
async function assertPrismaIntact(
  templateDir: string,
  result: FeatureRemovalResult,
): Promise<void> {
  const schemaDir = join(templateDir, 'apps/api/prisma/schema');
  if (!(await pathExists(schemaDir))) return;

  const files = (await listFiles(schemaDir)).filter((entry) => entry.rel.endsWith('.prisma'));
  const contents = await Promise.all(
    files.map((entry) => readFile(join(schemaDir, entry.rel), 'utf8')),
  );

  assertNoOrphanRelations(contents);
  result.warnings.push(
    `Schema Prisma verificado: ${files.length} arquivo(s), nenhuma relação órfã.`,
  );
}

/**
 * Remove dependências npm dos `package.json` certos.
 *
 * Por workspace, e não "em todos": `ioredis` é compartilhado pelo adapter de fila e pelo
 * de cache, e uma remoção global tiraria o cache junto. O manifesto declara o workspace
 * exatamente para isso.
 */
async function removeDependencies(
  ctx: GeneratorContext,
  order: readonly FeatureId[],
  result: FeatureRemovalResult,
): Promise<void> {
  const { templateDir, dryRun } = ctx;

  const wanted: { workspace: string; remove: string[] }[] = order.flatMap(
    (id) => FEATURE_MANIFESTS[id].deps ?? [],
  );

  const byWorkspace = new Map<string, Set<string>>();
  for (const entry of wanted) {
    const bucket = byWorkspace.get(entry.workspace) ?? new Set<string>();
    for (const name of entry.remove) bucket.add(name);
    byWorkspace.set(entry.workspace, bucket);
  }

  const { dropDependency } = await import('../seams/json-file.ts');

  for (const [workspace, names] of [...byWorkspace.entries()].sort()) {
    const rel = workspace === '.' ? 'package.json' : `${workspace}/package.json`;
    const abs = assertWithin(templateDir, rel);
    if (!(await pathExists(abs))) {
      result.warnings.push(`package.json ausente para o workspace ${workspace}`);
      continue;
    }

    // O conteúdo PRISTINO fica guardado: é o oráculo que distingue "o manifesto
    // envelheceu" de "outra feature já removeu isto". Ver o comentário em `cause`.
    const original = await readText(abs);
    let content = original;
    let touched = false;
    for (const name of [...names].sort()) {
      const outcome = dropDependency(content, name, rel);
      if (!outcome.matched) {
        // Dep já ausente não é erro: outra feature pode ter levado, ou o template mudou.
        // Mas vale registrar — é assim que se descobre que uma dep fantasma virou usada.
        result.warnings.push(`[deps] ${name} não estava declarada em ${rel}`);
        continue;
      }
      content = outcome.content;
      touched = true;
      result.depsRemoved.push({ workspace, name });
    }
    if (touched && !dryRun) await writeText(abs, content);
  }
}

/**
 * Poda seções do `CLAUDE.md` (e do `README.md`, quando o manifesto pedir) por título.
 *
 * O porquê, escrito por extenso porque é a parte que mais se subestima: o `CLAUDE.md` do
 * boilerplate tem 587 linhas e é dirigido a agentes de IA, com blocos explícitos "Para
 * agentes de IA:" dizendo o que não fazer. Uma seção de 60 linhas explicando o desenho
 * dos convites — token hasheado, índice único parcial, e-mail depois do commit — num
 * projeto SEM convites não é documentação inofensiva: é uma instrução para o próximo dev
 * (ou o próximo agente) implementar contra uma arquitetura que não está ali, com a
 * autoridade de estar no arquivo oficial do repo. Pior que nenhuma documentação.
 */
async function pruneDocSections(
  ctx: GeneratorContext,
  order: readonly FeatureId[],
  result: FeatureRemovalResult,
): Promise<void> {
  const { templateDir, dryRun } = ctx;
  const { dropSection } = await import('../seams/markdown-doc.ts');

  const sections = order.flatMap((id) =>
    (FEATURE_MANIFESTS[id].docSections ?? []).map((title) => ({ id, title })),
  );
  if (sections.length === 0) return;

  for (const rel of ['CLAUDE.md', 'README.md']) {
    const abs = assertWithin(templateDir, rel);
    if (!(await pathExists(abs))) continue;

    // O conteúdo PRISTINO fica guardado: é o oráculo que distingue "o manifesto
    // envelheceu" de "outra feature já removeu isto". Ver o comentário em `cause`.
    const original = await readText(abs);
    let content = original;
    let touched = false;

    for (const { id, title } of sections) {
      // O título vem do mapa como texto exato; aqui ele é usado como âncora de regex, com
      // os metacaracteres escapados. É o que faz `## Login social — decisão de deploy
      // opcional` casar sem que o travessão e os parênteses virem sintaxe.
      const anchor = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const outcome = dropSection(content, anchor);
      if (!outcome.matched) continue;
      content = outcome.content;
      touched = true;
      if (!result.docSections.includes(title)) result.docSections.push(title);
      result.seamsApplied.push({
        file: rel,
        kind: 'dropMarkdownSection',
        pattern: anchor,
        feature: id,
        changes: outcome.changes,
      });
    }

    if (touched && !dryRun) await writeText(abs, content);
  }

  const missing = sections.filter((section) => !result.docSections.includes(section.title));
  for (const section of missing) {
    result.warnings.push(
      `[${section.id}] seção de documentação não encontrada: "${section.title}" — ` +
        `o CLAUDE.md do template foi reescrito? O projeto gerado pode ficar documentando ` +
        `uma feature que não tem.`,
    );
  }
}
