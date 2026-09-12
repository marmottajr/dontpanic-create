/**
 * O despachante de costuras: um `SeamKind` entra, o editor certo é chamado.
 *
 * O `switch` aqui é exaustivo de propósito, com `never` no `default`. É o mesmo truque
 * que o `JobRouter` do boilerplate usa: acrescentar um `SeamKind` ao tipo e esquecer de
 * implementá-lo passa a ser erro de COMPILAÇÃO do gerador, não uma costura que não faz
 * nada em silêncio numa geração de madrugada. Uma costura silenciosa é o pior defeito
 * possível deste módulo — ela deixa código órfão num projeto que o usuário acha completo.
 */

import type { SeamEdit, SeamKind } from '../types.ts';
import { dropEnvKey, dropEnvSection, setEnvValue } from './env-file.ts';
import {
  dropDependency,
  dropJsonKey,
  dropJsonKeysMatching,
  upsertDependency,
} from './json-file.ts';
import { dropBullet, dropSection, dropTableRow } from './markdown-doc.ts';
import { removeNestModule } from './nest-module.ts';
import {
  dropBlocks,
  dropEnumValue,
  dropFields,
  tightenField,
} from './prisma-schema.ts';
import { unmatched } from './result.ts';
import type { SeamResult } from './result.ts';
import {
  assertBalanced,
  dropArrayEntry,
  dropBalancedBlock,
  dropBlock,
  dropBlockWithLeadingDoc,
  dropClassMember,
  dropCommentSection,
  dropImport,
  dropImportSpecifier,
  dropLinesMatching,
  insertRelative,
  replaceAll,
} from './typescript-source.ts';

export * from './result.ts';
export * from './typescript-source.ts';
export * from './nest-module.ts';
export * from './prisma-schema.ts';
export * from './json-file.ts';
export * from './env-file.ts';
export * from './markdown-doc.ts';

/**
 * Erro de manifesto: a costura precisava de um campo que não veio.
 *
 * Separado de "não casou" porque a causa é outra e o conserto é outro: aqui o manifesto
 * está incompleto, não envelhecido.
 */
export class SeamContractError extends Error {
  constructor(edit: SeamEdit, missing: string) {
    super(
      `Costura ${edit.kind} em ${edit.file} sem \`${missing}\`.\n` +
        `  Isto é bug no manifesto do gerador. Motivo declarado: ${edit.reason ?? '(nenhum)'}`,
    );
    this.name = 'SeamContractError';
  }
}

function need(edit: SeamEdit, field: 'pattern' | 'replacement' | 'target'): string {
  const value = edit[field];
  if (value === undefined || value === '') throw new SeamContractError(edit, field);
  return value;
}

/**
 * Os pisos de cobertura que o `relaxCoverageThresholds` afrouxa.
 *
 * O mapa (§0, regra 3) diz que os thresholds são pisos ABSOLUTOS fixados nos números
 * alcançados — `apps/api/jest.config.js` em 97/92/100/97 e `apps/web/vitest.config.mts`
 * em 99/88/95/99. Apagar código bem coberto move o agregado do que SOBRA, e o `functions:
 * 100` é o frágil: basta uma função menos coberta no denominador para o CI do projeto
 * gerado ficar vermelho por um motivo que não tem relação aparente com a remoção.
 *
 * Remedir de verdade exigiria rodar a suíte do projeto gerado, o que não é trabalho de um
 * gerador de arquivos — é do passo de conformidade. O que o mapa sanciona explicitamente é
 * a outra metade: "re-measure, or emit slightly lower floors". Então emitimos pisos mais
 * baixos e o aplicador registra um aviso dizendo para re-fixá-los depois do primeiro
 * `pnpm test` verde. Um piso mais baixo continua sendo um portão; um piso impossível é um
 * portão que ensina o usuário a apagar o portão.
 */
export const RELAXED_COVERAGE_FLOOR = 80;

/**
 * Reescreve os números de threshold para um piso alcançável.
 *
 * Casa `chave: número` só dentro de um bloco de thresholds — ancorar no nome da chave
 * sozinho casaria qualquer `functions: 100` do arquivo.
 */
export function relaxCoverageThresholds(content: string): SeamResult {
  const keys = ['statements', 'branches', 'functions', 'lines'];
  let next = content;
  let changes = 0;

  for (const key of keys) {
    const re = new RegExp(`(\\b${key}\\s*:\\s*)(\\d+(?:\\.\\d+)?)`, 'g');
    next = next.replace(re, (whole, head: string, value: string) => {
      const current = Number(value);
      if (!Number.isFinite(current) || current <= RELAXED_COVERAGE_FLOOR) return whole;
      changes += 1;
      return `${head}${RELAXED_COVERAGE_FLOOR}`;
    });
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: next, changes };
}

/**
 * Aplica uma costura a um conteúdo. NÃO toca o disco e NÃO lança por não casar.
 *
 * Quem chama decide o que fazer com `matched: false` — é lá que se sabe se a costura era
 * `required`, e o `reason` do manifesto é o que vai na mensagem de erro.
 */
export interface SeamOptions {
  /**
   * Resolve o conteúdo de um asset embarcado, para `swapVariant`.
   *
   * Injetado em vez de lido aqui porque este módulo é puro — é o que permite testar toda
   * costura sem `mkdtemp`, e o que permite a landing page importar o manifesto sem
   * arrastar `node:fs`.
   */
  asset?: (name: string) => string | undefined;
}

export function applySeam(edit: SeamEdit, content: string, options: SeamOptions = {}): SeamResult {
  const kind: SeamKind = edit.kind;

  switch (kind) {
    // ── TypeScript e texto ──────────────────────────────────────────────────
    case 'dropLinesMatching':
      return dropLinesMatching(content, need(edit, 'pattern'));

    case 'dropBlock': {
      const block = edit.block;
      if (!block) throw new SeamContractError(edit, 'block');
      return dropBlock(content, block.start, block.end, edit.file);
    }

    case 'dropBlockWithLeadingDoc': {
      const block = edit.block;
      if (!block) throw new SeamContractError(edit, 'block');
      return dropBlockWithLeadingDoc(content, block.start, block.end, edit.file);
    }

    case 'dropBalancedBlock':
      return dropBalancedBlock(content, need(edit, 'pattern'));

    case 'dropClassMember':
      return dropClassMember(content, need(edit, 'pattern'));

    case 'dropCommentSection':
      return dropCommentSection(content, need(edit, 'pattern'));

    case 'replace':
      return replaceAll(content, need(edit, 'pattern'), edit.replacement ?? '');

    case 'insertBefore':
      return insertRelative(content, need(edit, 'pattern'), need(edit, 'replacement'), 'before');

    case 'insertAfter':
      return insertRelative(content, need(edit, 'pattern'), need(edit, 'replacement'), 'after');

    case 'dropImport':
      return dropImport(content, need(edit, 'pattern'));

    case 'dropImportSpecifier':
      return dropImportSpecifier(content, need(edit, 'pattern'), edit.target);

    case 'dropArrayEntry':
      return dropArrayEntry(content, need(edit, 'target'), need(edit, 'pattern'));

    // ── Nest ────────────────────────────────────────────────────────────────
    case 'dropNestModule':
      return removeNestModule(content, { moduleName: need(edit, 'pattern') }, edit.file);

    // ── Prisma ──────────────────────────────────────────────────────────────
    case 'dropPrismaBlock':
      return dropBlocks(content, [need(edit, 'pattern')]);

    case 'dropPrismaField':
      return dropFields(content, need(edit, 'target'), [need(edit, 'pattern')]);

    case 'dropPrismaEnumValue':
      return dropEnumValue(content, need(edit, 'target'), need(edit, 'pattern'));

    case 'tightenPrismaField':
      return tightenField(content, need(edit, 'target'), need(edit, 'pattern'));

    // ── JSON ────────────────────────────────────────────────────────────────
    case 'dropJsonKey':
      return dropJsonKey(content, need(edit, 'pattern'), edit.file);

    case 'dropJsonKeysMatching':
      return dropJsonKeysMatching(content, need(edit, 'pattern'), edit.file);

    case 'dropDependency':
      return dropDependency(content, need(edit, 'pattern'), edit.file);

    case 'upsertDependency':
      return upsertDependency(
        content,
        edit.target ?? 'dependencies',
        need(edit, 'pattern'),
        need(edit, 'replacement'),
        edit.file,
      );

    // ── .env ────────────────────────────────────────────────────────────────
    case 'dropEnvKey':
      return dropEnvKey(content, need(edit, 'pattern'));

    case 'dropEnvSection':
      return dropEnvSection(content, need(edit, 'pattern'));

    case 'setEnvValue':
      return setEnvValue(content, need(edit, 'pattern'), edit.replacement ?? '');

    // ── Markdown ────────────────────────────────────────────────────────────
    case 'dropMarkdownSection':
      return dropSection(content, need(edit, 'pattern'));

    case 'dropMarkdownBullet':
      return dropBullet(content, need(edit, 'pattern'));

    case 'dropMarkdownTableRow':
      return dropTableRow(content, need(edit, 'pattern'));

    // ── Cobertura ───────────────────────────────────────────────────────────
    case 'relaxCoverageThresholds':
      return relaxCoverageThresholds(content);

    // ── Fora do alcance de uma regex ────────────────────────────────────────
    case 'swapVariant': {
      const name = need(edit, 'replacement');
      const variant = options.asset?.(name);
      // Asset ausente NÃO é erro de contrato: a variante pode ainda não ter sido escrita,
      // e nesse caso a costura vira um "não casou" que o `required` do manifesto
      // classifica. É a diferença entre "o gerador está incompleto aqui" (aviso alto, com
      // o nome do asset) e "o gerador está quebrado" (para tudo).
      if (variant === undefined) return unmatched(content);
      return { matched: true, content: variant, changes: 1 };
    }

    case 'manualRewrite':
      // Por definição não edita. Devolver "não casou" é o que faz o aplicador registrá-la
      // em `seamsSkipped` com o `reason` — que é exatamente o efeito desejado, porque o
      // `reason` dela é uma instrução para um humano.
      return unmatched(content);

    default: {
      // Exaustividade: acrescentar um `SeamKind` sem implementá-lo quebra o BUILD do
      // gerador aqui, e não a geração de alguém às três da manhã.
      const exhaustive: never = kind;
      throw new Error(`SeamKind sem implementação: ${String(exhaustive)}`);
    }
  }
}

/**
 * Valida o arquivo depois das costuras, pelo formato.
 *
 * Não é um linter: é o portão que pega a classe de dano que uma edição textual realmente
 * produz. Roda por ARQUIVO, depois de todas as costuras dele — verificar entre costuras
 * acusaria estados intermediários legitimamente inválidos (o import já saiu, a entrada do
 * array ainda não).
 */
export function assertFileStillValid(file: string, content: string): void {
  if (/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(file)) {
    assertBalanced(file, content);
  }
}
