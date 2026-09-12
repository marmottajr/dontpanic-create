/**
 * Remoção de chave em JSON preservando formatação, ordem e comentários.
 *
 * A tentação é `JSON.parse` + `JSON.stringify`. Não faça: reescreve o arquivo INTEIRO.
 * O `package.json` do boilerplate tem ordem de chaves escolhida, indentação de 2 e uma
 * linha em branco entre grupos; o `tsconfig.json` tem comentários explicando por que
 * `allowImportingTsExtensions` existe (e `JSON.parse` nem aceita comentário). Um round-trip
 * transforma "removi uma dependência" em um diff de 60 linhas no PRIMEIRO commit que o
 * usuário do gerador vai ler — e o primeiro commit é onde ele decide se confia no gerador.
 *
 * Então este módulo é um scanner posicional: acha o SPAN de texto do membro e remove só
 * ele, junto com a vírgula que o prendia. Tolera JSONC (comentário de linha e de bloco,
 * vírgula final) porque `tsconfig.json` tem os três.
 */

import { compile, SeamStructureError, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';

interface MemberSpan {
  /** Offset do primeiro caractere da chave (a aspa de abertura). */
  start: number;
  /** Offset logo depois do fim do valor. */
  end: number;
  key: string;
}

/**
 * Caminho pontilhado → segmentos.
 *
 * `\.` escapa um ponto literal, porque chave com ponto existe de verdade: as chaves de
 * i18n são `auth.oauth` como CAMINHO (dois níveis), mas um `package.json` pode ter
 * `exports` com chaves `./features`. Sem escape, os dois casos seriam indistinguíveis e
 * um deles falharia em silêncio.
 */
export function parseKeyPath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (let i = 0; i < path.length; i += 1) {
    const ch = path[i];
    if (ch === '\\' && path[i + 1] === '.') {
      current += '.';
      i += 1;
      continue;
    }
    if (ch === '.') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch ?? '';
  }
  segments.push(current);
  return segments.filter((segment) => segment !== '');
}

/** Avança sobre espaço e comentário (JSONC). */
function skipTrivia(text: string, index: number): number {
  let i = index;
  for (;;) {
    const ch = text[i];
    if (ch === undefined) return i;
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    return i;
  }
}

/** Fim de uma string JSON que começa em `index` (a aspa). Devolve o offset após a aspa final. */
function endOfString(text: string, index: number): number {
  let i = index + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') return i + 1;
    i += 1;
  }
  throw new SeamStructureError('<json>', `string não fechada no offset ${index}`);
}

/** Fim do valor que começa em `index` (objeto, array, string, número, literal). */
function endOfValue(text: string, index: number): number {
  const start = skipTrivia(text, index);
  const ch = text[start];
  if (ch === '"') return endOfString(text, start);

  if (ch === '{' || ch === '[') {
    let depth = 0;
    let i = start;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i = endOfString(text, i);
        continue;
      }
      if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
        i = skipTrivia(text, i);
        continue;
      }
      if (c === '{' || c === '[') depth += 1;
      else if (c === '}' || c === ']') {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    throw new SeamStructureError('<json>', `valor não fechado no offset ${start}`);
  }

  // Número, `true`, `false`, `null`: vai até a vírgula ou o fechamento do pai.
  let i = start;
  while (i < text.length && !',}]'.includes(text[i] ?? '')) i += 1;
  return i;
}

/** Membros de primeiro nível do objeto cujo `{` está em `open`. */
function membersOf(text: string, open: number): MemberSpan[] {
  const out: MemberSpan[] = [];
  let i = skipTrivia(text, open + 1);

  while (i < text.length) {
    if (text[i] === '}') return out;
    if (text[i] === ',') {
      i = skipTrivia(text, i + 1);
      continue;
    }
    if (text[i] !== '"') {
      // Não é um objeto bem formado a partir daqui; para em vez de chutar.
      return out;
    }
    const keyEnd = endOfString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd)) as string;
    const colon = skipTrivia(text, keyEnd);
    if (text[colon] !== ':') return out;
    const valueEnd = endOfValue(text, colon + 1);
    out.push({ start: i, end: valueEnd, key });
    i = skipTrivia(text, valueEnd);
  }

  return out;
}

/** Localiza o membro no caminho dado, ou `undefined`. */
export function locateMember(text: string, path: readonly string[]): MemberSpan | undefined {
  let open = text.indexOf('{');
  if (open === -1) return undefined;

  let found: MemberSpan | undefined;
  for (let depth = 0; depth < path.length; depth += 1) {
    const segment = path[depth];
    const member = membersOf(text, open).find((m) => m.key === segment);
    if (!member) return undefined;
    found = member;
    if (depth === path.length - 1) return member;

    const nested = text.indexOf('{', member.start);
    if (nested === -1 || nested > member.end) return undefined;
    open = nested;
  }

  return found;
}

/**
 * Remove a chave em `keyPath` (caminho pontilhado), com a vírgula que a prendia.
 *
 * Qual vírgula: a que vem DEPOIS, normalmente; a que vem ANTES quando o membro era o
 * último do objeto — senão sobra `{"a": 1,}`, que é JSON inválido para o `JSON.parse` do
 * Node (o `pnpm` reclama do `package.json` com uma mensagem sobre posição, não sobre a
 * chave que o gerador tirou). Se a linha ficar só com espaço, ela sai também, para o diff
 * não mostrar uma linha em branco no meio de `dependencies`.
 */
export function dropJsonKey(content: string, keyPath: string, file = '<json>'): SeamResult {
  const path = parseKeyPath(keyPath);
  if (path.length === 0) return unmatched(content);

  const member = locateMember(content, path);
  if (!member) return unmatched(content);

  let start = member.start;
  let end = member.end;

  const after = skipTrivia(content, end);
  if (content[after] === ',') {
    end = after + 1;
  } else {
    // Era o último: come a vírgula anterior, andando de trás para frente sobre espaço.
    let back = start - 1;
    while (back >= 0 && ' \t\n\r'.includes(content[back] ?? '')) back -= 1;
    if (content[back] === ',') start = back;
  }

  // Absorve o resto da linha se o que sobrou dela é só espaço (dos dois lados).
  const lineStart = content.lastIndexOf('\n', start) + 1;
  const lineEnd = content.indexOf('\n', end);
  const headIsBlank = content.slice(lineStart, start).trim() === '';
  const tailIsBlank = lineEnd === -1 ? true : content.slice(end, lineEnd).trim() === '';
  if (headIsBlank && tailIsBlank && lineEnd !== -1) {
    start = lineStart;
    end = lineEnd + 1;
  }

  const next = `${content.slice(0, start)}${content.slice(end)}`;
  assertParsable(file, next);
  return { matched: true, content: next, changes: 1 };
}

/**
 * Remove uma dependência npm de um `package.json`, onde quer que ela esteja declarada.
 *
 * Procura nas quatro seções em vez de exigir que o manifesto saiba em qual delas a dep
 * está: `@types/*` muda de `dependencies` para `devDependencies` entre versões do
 * boilerplate, e um manifesto que fixasse a seção envelheceria por um motivo que não tem
 * nada a ver com a feature.
 */
export function dropDependency(content: string, name: string, file = 'package.json'): SeamResult {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  let next = content;
  let changes = 0;

  for (const section of sections) {
    // O nome pode conter `.` (`@types/node` não, mas `eslint-plugin-import.js` sim em
    // teoria), então escapamos antes de montar o caminho pontilhado.
    const result = dropJsonKey(next, `${section}.${name.replace(/\./g, '\\.')}`, file);
    if (result.matched) {
      next = result.content;
      changes += 1;
    }
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: next, changes };
}

/**
 * Acrescenta (ou reescreve) uma dependência.
 *
 * O gerador SUBTRAI — esta é a única exceção, e ela tem nome: I17. `@fastify/static` está
 * declarado e nunca importado, então sai com as deps fantasma; mas num build de storage
 * `local` ele precisa VOLTAR e ser registrado, porque `LOCAL_STORAGE_PUBLIC_URL` aponta
 * para uma rota que a API não serve e os avatares dão 404. É bug pré-existente do
 * boilerplate, e o gerador tem a chance de não propagá-lo.
 */
export function upsertDependency(
  content: string,
  section: string,
  name: string,
  version: string,
  file = 'package.json',
): SeamResult {
  const existing = locateMember(content, [section, name]);
  if (existing) {
    const next = `${content.slice(0, existing.start)}${JSON.stringify(name)}: ${JSON.stringify(
      version,
    )}${content.slice(existing.end)}`;
    assertParsable(file, next);
    return { matched: true, content: next, changes: 1 };
  }

  const sectionSpan = locateMember(content, [section]);
  if (!sectionSpan) return unmatched(content);

  const open = content.indexOf('{', sectionSpan.start);
  if (open === -1) return unmatched(content);

  // Insere no topo da seção. Ordem alfabética seria mais bonita, mas exigiria reordenar o
  // que já está lá — e reordenar é justamente o que este módulo existe para não fazer.
  const indentMatch = /\n(\s+)"/.exec(content.slice(open));
  const indent = indentMatch?.[1] ?? '    ';
  const next = `${content.slice(0, open + 1)}\n${indent}${JSON.stringify(name)}: ${JSON.stringify(
    version,
  )},${content.slice(open + 1)}`;
  assertParsable(file, next);
  return { matched: true, content: next, changes: 1 };
}

/**
 * Confere que o resultado ainda é parseável.
 *
 * Só para JSON estrito. Arquivo com comentário (o `tsconfig.json` tem) é pulado, porque
 * `JSON.parse` recusaria o arquivo ORIGINAL e a checagem acusaria a costura pelo defeito
 * de outra pessoa. O balanceamento já foi garantido pelo scanner posicional.
 */
export function assertParsable(file: string, content: string): void {
  if (/^\s*\/\//m.test(content) || content.includes('/*')) return;
  try {
    JSON.parse(content);
  } catch (error) {
    throw new SeamStructureError(
      file,
      `o JSON resultante não parseia: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Remove todas as chaves de primeiro nível que casam com `pattern`.
 *
 * Usado nos catálogos de i18n, onde uma feature é dona de um NAMESPACE inteiro. Os dois
 * arquivos de locale têm que ser podados em lockstep — `messages.test.ts` compara os
 * conjuntos de chaves e nomeia as órfãs —, então quem chama passa o mesmo padrão para os
 * dois, e a paridade se mantém por construção em vez de por atenção.
 */
export function dropJsonKeysMatching(
  content: string,
  pattern: string,
  file = '<json>',
): SeamResult {
  const re = compile(pattern);
  const open = content.indexOf('{');
  if (open === -1) return unmatched(content);

  const doomed = membersOf(content, open)
    .filter((member) => re.test(member.key))
    .map((member) => member.key);
  if (doomed.length === 0) return unmatched(content);

  let next = content;
  for (const key of doomed) {
    next = dropJsonKey(next, key.replace(/\./g, '\\.'), file).content;
  }
  return { matched: true, content: next, changes: doomed.length };
}
