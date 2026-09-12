/**
 * Poda do schema Prisma: blocos inteiros, campos, valores de enum e nullability.
 *
 * Por que este é o editor com verificação mais pesada do gerador: o `prisma generate`
 * falha com mensagens que NÃO apontam para a causa quando uma relação fica órfã. Apagar
 * `model OAuthAccount` e esquecer o `oauthAccounts OAuthAccount[]` em `Tenant` produz
 *
 *   "Error validating field `oauthAccounts` in model `Tenant`: The relation field
 *    `oauthAccounts` on model `Tenant` is missing an opposite relation field"
 *
 * — que manda quem depura olhar `Tenant`, onde não há nada de errado. Pior: o erro só
 * aparece no `db:migrate` do projeto gerado, depois do `pnpm install`, muitos minutos
 * depois da geração. Então aqui a regra é detectar ANTES de escrever: `findOrphanRelations`
 * varre o schema resultante e a geração para nomeando o campo, o model e o alvo que saiu.
 *
 * O outro cuidado é `tightenField`. Apertar `passwordHash String?` para `String` quando o
 * oauth sai não é estética: o mapa provou que o ÚNICO escritor de `null` era
 * `oauth.service.ts:474`. Deixar opcional compila — e é justamente por isso que é o
 * perigo. Sobra a maquinaria de equalização de tempo do `ABSENT_PASSWORD_HASH` sem
 * nenhuma conta que ela possa descrever, com o piso de `functions: 100` do jest ainda
 * exigindo cobertura dela.
 */

import { collapseBlankRuns, compile, SeamStructureError, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';

/**
 * Tipos que o Prisma resolve sozinho. Um campo cujo tipo não está aqui e não é um bloco
 * declarado no schema é relação órfã.
 */
const SCALAR_TYPES = new Set([
  'String',
  'Boolean',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'DateTime',
  'Json',
  'Bytes',
  'Unsupported',
]);

export type PrismaBlockKind = 'model' | 'enum' | 'type' | 'view' | 'generator' | 'datasource';

export interface PrismaBlock {
  kind: PrismaBlockKind;
  name: string;
  /** Offset do início do bloco, JÁ incluindo os comentários de documentação acima. */
  start: number;
  /** Offset logo depois da `}` de fechamento. */
  end: number;
  /** Offset da palavra-chave (`model`), sem os comentários. */
  keywordStart: number;
  text: string;
}

const BLOCK_HEAD = /^(model|enum|type|view|generator|datasource)\s+([A-Za-z_][\w]*)\s*\{/;

/**
 * Lista os blocos do arquivo, com os comentários de documentação anexados.
 *
 * Os comentários entram no span de propósito: o `tenancy.prisma` documenta cada model com
 * um bloco de `///` que explica a decisão de modelagem. Apagar o model e deixar o
 * comentário produz seis linhas explicando por que um model que não existe é como é — o
 * que é pior que nenhuma documentação, porque manda o próximo dev procurar um model
 * fantasma.
 */
export function parseBlocks(content: string): PrismaBlock[] {
  const lines = content.split('\n');
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }

  const out: PrismaBlock[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const head = BLOCK_HEAD.exec((lines[i] ?? '').trim());
    if (!head?.[1] || !head[2]) continue;

    // Sobe enquanto for comentário colado (sem linha em branco no meio).
    let commentLine = i;
    while (commentLine > 0 && /^\s*(\/\/\/|\/\/)/.test(lines[commentLine - 1] ?? '')) {
      commentLine -= 1;
    }

    let depth = 0;
    let close = -1;
    for (let scan = i; scan < lines.length; scan += 1) {
      for (const ch of lines[scan] ?? '') {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      if (depth === 0) {
        close = scan;
        break;
      }
    }
    if (close === -1) {
      throw new SeamStructureError(
        'prisma/schema',
        `o bloco ${head[1]} ${head[2]} (linha ${i + 1}) não fecha`,
      );
    }

    const start = offsets[commentLine] ?? 0;
    const endLineStart = offsets[close] ?? 0;
    const end = endLineStart + (lines[close] ?? '').length;
    out.push({
      kind: head[1] as PrismaBlockKind,
      name: head[2],
      start,
      end,
      keywordStart: offsets[i] ?? 0,
      text: content.slice(start, end),
    });
    i = close;
  }

  return out;
}

/** Nomes de model/enum/type declarados no schema (o universo de tipos válidos). */
export function declaredTypes(content: string): Set<string> {
  const out = new Set<string>();
  for (const block of parseBlocks(content)) {
    if (block.kind === 'model' || block.kind === 'enum' || block.kind === 'type' || block.kind === 'view') {
      out.add(block.name);
    }
  }
  return out;
}

/**
 * Apaga `model X` / `enum X` inteiros, com os comentários de documentação.
 *
 * NÃO remove as relações inversas nos models que sobrevivem — isso é trabalho de
 * `dropFields`, e o manifesto tem que declarar as duas coisas. A separação é deliberada:
 * adivinhar quais campos referenciam o bloco removido e apagá-los em silêncio esconderia
 * exatamente a informação que `findOrphanRelations` existe para gritar.
 */
export function dropBlocks(content: string, names: readonly string[]): SeamResult {
  const wanted = new Set(names);
  const blocks = parseBlocks(content).filter((block) => wanted.has(block.name));
  if (blocks.length === 0) return unmatched(content);

  // De trás para frente: remover por offset invalida os offsets seguintes.
  let next = content;
  for (const block of [...blocks].sort((a, b) => b.start - a.start)) {
    next = `${next.slice(0, block.start)}${next.slice(block.end)}`;
  }

  return { matched: true, content: collapseBlankRuns(next.trimStart()), changes: blocks.length };
}

/**
 * Remove campos de um model que sobrevive — e os atributos de bloco que os citam.
 *
 * A segunda metade é o que evita uma falha sem causa aparente: um `@@unique([provider,
 * providerAccountId])` cujo campo saiu faz o Prisma recusar o schema inteiro. O mesmo vale
 * para `@@index`. Então remover campo é sempre duas operações, e fazê-las juntas é a única
 * forma de não dar para esquecer a segunda.
 */
export function dropFields(
  content: string,
  model: string,
  fields: readonly string[],
): SeamResult {
  const block = parseBlocks(content).find((b) => b.name === model);
  if (!block) return unmatched(content);

  const doomed = new Set(fields);
  const lines = block.text.split('\n');
  const kept: string[] = [];
  let changes = 0;

  for (const line of lines) {
    const fieldName = /^\s*([A-Za-z_][\w]*)\s+\S/.exec(line)?.[1];
    if (fieldName !== undefined && doomed.has(fieldName)) {
      changes += 1;
      continue;
    }

    // Atributo de bloco que nomeia um campo que saiu. A lista dentro dos colchetes é
    // separada por vírgula e pode ter espaço; casamos o nome com fronteira de palavra
    // para que `userId` não case `userIdOld`.
    const attribute = /^\s*@@(unique|index|id|fulltext)\s*\(/.exec(line);
    if (attribute) {
      const referenced = [...line.matchAll(/\b([A-Za-z_][\w]*)\b/g)].map((m) => m[1]);
      if (referenced.some((name) => name !== undefined && doomed.has(name))) {
        changes += 1;
        continue;
      }
    }

    kept.push(line);
  }

  if (changes === 0) return unmatched(content);
  const rebuilt = kept.join('\n');
  return {
    matched: true,
    content: `${content.slice(0, block.start)}${rebuilt}${content.slice(block.end)}`,
    changes,
  };
}

/**
 * Aperta um campo opcional para obrigatório: `String?` → `String`.
 *
 * Só remove o `?`. NÃO mexe no comentário de documentação acima, porque um comentário que
 * explica a nullability perdeu o assunto e precisa SAIR, não ser reescrito por heurística
 * — e isso é uma costura própria no manifesto, visível no relatório, em vez de um efeito
 * colateral invisível deste.
 *
 * Recusa apertar um campo que já é obrigatório devolvendo `matched: false`: num manifesto
 * `required`, isso falha a geração e avisa que o boilerplate mudou a nullability sozinho —
 * exatamente a situação em que não se deve seguir adiante presumindo.
 */
export function tightenField(content: string, model: string, field: string): SeamResult {
  const block = parseBlocks(content).find((b) => b.name === model);
  if (!block) return unmatched(content);

  const re = compile(`^(\\s*${field}\\s+)([A-Za-z_][\\w]*)\\?(\\s*.*)$`, 'm');
  const match = re.exec(block.text);
  if (!match) return unmatched(content);

  const rebuilt = block.text.replace(re, `$1$2$3`);
  return {
    matched: true,
    content: `${content.slice(0, block.start)}${rebuilt}${content.slice(block.end)}`,
    changes: 1,
  };
}

/**
 * Remove um valor de enum (o caso do mapa: `Role.SUPERADMIN` quando `platform` sai).
 *
 * O valor sai do enum, mas quem o USA no código TypeScript é problema de outras costuras —
 * `tenant-scope.interceptor.ts`, `permission.guard.ts` e mais cinco arquivos comparam
 * contra ele, e o mapa lista cada um. Aqui só o schema; deixar o valor no enum com o código
 * removido seria um valor que o banco aceita e a aplicação nunca produz, o que é inócuo, e
 * o contrário — código comparando contra um valor que o enum não tem — é erro de tipo.
 */
export function dropEnumValue(content: string, enumName: string, value: string): SeamResult {
  const block = parseBlocks(content).find((b) => b.name === enumName && b.kind === 'enum');
  if (!block) return unmatched(content);

  const lines = block.text.split('\n');
  const kept = lines.filter((line) => line.trim() !== value);
  if (kept.length === lines.length) return unmatched(content);

  return {
    matched: true,
    content: `${content.slice(0, block.start)}${kept.join('\n')}${content.slice(block.end)}`,
    changes: lines.length - kept.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação
// ─────────────────────────────────────────────────────────────────────────────

export interface OrphanRelation {
  model: string;
  field: string;
  /** O tipo que o campo declara e que já não existe no schema. */
  missingType: string;
}

/**
 * Acha campos cujo tipo não é escalar nem um bloco declarado.
 *
 * Recebe o schema COMPLETO já concatenado — o boilerplate usa uma PASTA de schema
 * (`prisma.config.ts` → `schema: 'prisma/schema'`, 5 arquivos), e um model em
 * `tenancy.prisma` referencia um enum em `oauth.prisma`. Checar arquivo por arquivo
 * acusaria toda relação entre arquivos como órfã, o que é o falso positivo que faria
 * alguém desligar a checagem.
 */
export function findOrphanRelations(schemas: readonly string[]): OrphanRelation[] {
  const joined = schemas.join('\n\n');
  const known = declaredTypes(joined);
  const out: OrphanRelation[] = [];

  for (const block of parseBlocks(joined)) {
    if (block.kind !== 'model' && block.kind !== 'type' && block.kind !== 'view') continue;

    for (const line of block.text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('@@')) continue;
      if (BLOCK_HEAD.test(trimmed) || trimmed === '}') continue;

      const field = /^([A-Za-z_][\w]*)\s+([A-Za-z_][\w]*)(\[\])?\??/.exec(trimmed);
      if (!field?.[1] || !field[2]) continue;

      const type = field[2];
      if (SCALAR_TYPES.has(type) || known.has(type)) continue;

      out.push({ model: block.name, field: field[1], missingType: type });
    }
  }

  return out;
}

/**
 * Falha a geração se alguma relação ficou órfã, nomeando causa e efeito.
 *
 * A mensagem carrega o que o erro do Prisma não carrega: o TIPO que saiu. É a informação
 * que transforma "campo inválido em Tenant" em "o model OAuthAccount foi removido e
 * ninguém removeu a relação inversa", e a diferença entre cinco minutos e uma tarde.
 */
export function assertNoOrphanRelations(schemas: readonly string[]): void {
  const orphans = findOrphanRelations(schemas);
  if (orphans.length === 0) return;

  const detail = orphans
    .map(
      (orphan) =>
        `  - ${orphan.model}.${orphan.field} referencia "${orphan.missingType}", que não existe mais no schema`,
    )
    .join('\n');

  throw new SeamStructureError(
    'prisma/schema/**',
    `${orphans.length} relação(ões) órfã(s) depois da poda:\n${detail}\n` +
      `O \`prisma generate\` do projeto gerado falharia culpando o model que SOBROU, não o que saiu. ` +
      `Acrescente os campos ao \`prisma.dropFields\` da feature no manifesto do gerador.`,
  );
}
