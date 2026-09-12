/**
 * Edições em código TypeScript: linhas por âncora, blocos, imports e entradas de array.
 *
 * Por que regex e não um parser de verdade: o gerador não pode depender do `typescript`
 * em runtime (é `devDependency`, e o pacote publicado tem duas deps de propósito), e um
 * parser de AST resolveria a localização mas não a IMPRESSÃO — reimprimir o arquivo a
 * partir da AST reescreve formatação em lugares que não mudaram e polui o diff que o
 * usuário lê no primeiro commit. O que fazemos é o contrário: localizar por âncora,
 * remover o mínimo de texto possível, e VERIFICAR o resultado (balanceamento) em vez de
 * confiar nele.
 *
 * A regra que todo padrão daqui obedece: o manifesto escreve âncoras tolerantes a
 * reformatação (`\s*`, `[^;]*`), nunca a string literal com a indentação de hoje. O
 * template é sincronizado de um repo vivo; um `replace` exato apodrece no primeiro
 * `prettier --write`.
 */

import { collapseBlankRuns, compile, SeamStructureError, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Linhas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apaga toda linha que casa com `pattern`.
 *
 * Apaga TODAS as ocorrências, não a primeira: um decorator como `@RequireCaptcha` aparece
 * cinco vezes no mesmo controller, e uma costura que parasse na primeira deixaria quatro
 * referências a um símbolo que já não existe — e o erro de compilação apontaria para o
 * arquivo certo pelo motivo errado.
 */
export function dropLinesMatching(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const kept: string[] = [];
  let changes = 0;

  for (const line of lines) {
    if (re.test(line)) {
      changes += 1;
      continue;
    }
    kept.push(line);
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes };
}

/**
 * Apaga de `start` até `end`, inclusive.
 *
 * O `start` é casado por LINHA; o `end` é casado contra o TEXTO a partir dali, não linha
 * por linha. A distinção não é estilo: vários `end` do manifesto atravessam linhas —
 * `\}\);\s*\}\);\s*\}\);` fecha três callbacks aninhados, e `\n\}` casa o fechamento de
 * uma função na coluna zero. Um casamento linha a linha simplesmente não acha nenhum dos
 * dois, e o sintoma seria uma costura `required` falhando com "o boilerplate mudou"
 * quando o boilerplate está intacto e o motor é que era estreito.
 *
 * O trecho removido é sempre expandido para LINHAS inteiras, para não deixar meia linha
 * de código colada na anterior.
 *
 * Um bloco cujo `end` nunca aparece é erro estrutural, não "não casou": o padrão de
 * início acertou, então o manifesto descreve este arquivo — o que mudou foi o fim, e
 * apagar até o EOF por otimismo destruiria o resto do arquivo em silêncio.
 */
export function dropBlock(
  content: string,
  start: string,
  end: string,
  file = '<memória>',
): SeamResult {
  const startRe = compile(start);
  let next = content;
  let changes = 0;

  // Laço: o mesmo par start/end pode descrever várias ocorrências (um decorator
  // `@RequireCaptcha` por rota, por exemplo).
  for (;;) {
    const lines = next.split('\n');
    const first = lines.findIndex((line) => startRe.test(line));
    if (first === -1) break;

    // Offset do começo da linha que casou.
    let from = 0;
    for (let i = 0; i < first; i += 1) from += (lines[i] ?? '').length + 1;

    // O fim é procurado a partir do começo dessa linha — inclusive nela, porque um bloco
    // de uma linha só (`/** … */`) casa os dois padrões no mesmo lugar.
    const endRe = compile(end, 'm');
    const tail = next.slice(from);

    // ── Primeiro, a interpretação BALANCEADA ────────────────────────────────
    //
    // Quando o manifesto escreve `start: "describe\('oauth'", end: '\}\);'`, o que ele
    // quer dizer é "o bloco do describe", e o `end` é uma descrição do FECHAMENTO, não
    // um marcador independente. Casar o `end` como regex solta encontra o primeiro
    // `});` do arquivo a partir dali — que é o fechamento do primeiro `it` de DENTRO.
    // O resultado é catastrófico e silencioso na direção errada: o bloco é cortado ao
    // meio, sobra o `});` do describe externo, e o arquivo fica sintaticamente inválido.
    // Era a causa de 27 arquivos desbalanceados numa geração "tudo desligado".
    //
    // Então: para cada delimitador que a LINHA DE INÍCIO abre, calculamos o fechamento
    // correspondente por contagem e aceitamos o primeiro cujo fechamento caia numa linha
    // que TAMBÉM casa o `end` do manifesto. Isso mantém o `end` como verificação — se
    // ele não descreve o fechamento real, o autor quis dizer outra coisa e a busca por
    // regex assume — e resolve o aninhamento sem reescrever âncora nenhuma.
    const lineEnd = tail.indexOf('\n');
    const startLine = lineEnd === -1 ? tail : tail.slice(0, lineEnd);
    let to = -1;

    for (let cursor = 0; cursor < startLine.length; cursor += 1) {
      const opener = startLine[cursor];
      if (opener !== '{' && opener !== '[' && opener !== '(') continue;
      // Pula delimitador dentro de string (`describe('@RequireCaptcha()'`).
      if (insideQuote(startLine, cursor)) continue;

      const close = matchingClose(tail, cursor);
      if (close === -1) continue;

      const closeLineStart = tail.lastIndexOf('\n', close) + 1;
      const closeLineEnd = tail.indexOf('\n', close);
      const closeLine = tail.slice(closeLineStart, closeLineEnd === -1 ? tail.length : closeLineEnd);
      if (!compile(end).test(closeLine)) continue;

      to = from + (closeLineEnd === -1 ? tail.length : closeLineEnd + 1);
      break;
    }

    // ── Se nada balanceou, a interpretação por REGEX ─────────────────────────
    if (to === -1) {
      const match = endRe.exec(tail);
      if (!match) {
        // Se JÁ removemos algo, este casamento de `start` é residual: um padrão de início
        // amplo casa outra linha depois do bloco ter saído. O caso real é
        // `start: 'PUBLIC_SIGNUP_ENABLED'`, que também casa `NEXT_PUBLIC_SIGNUP_ENABLED`
        // — depois de remover o bloco certo, a segunda volta do laço achava o início e
        // nenhum fim, e a geração morria por um bloco que já tinha sido removido com
        // sucesso. Parar aqui é o certo: o trabalho está feito.
        if (changes > 0) break;

        // Na PRIMEIRA volta, porém, isto é erro de verdade: o início acertou, então o
        // manifesto descreve este arquivo, e o que mudou foi o fim.
        throw new SeamStructureError(
          file,
          `o bloco que começa em /${start}/ (linha ${first + 1}) nunca fecha em /${end}/. ` +
            `Apagar até o fim do arquivo destruiria o que sobrou, então a geração para aqui.`,
        );
      }
      to = from + match.index + match[0].length;
      // Expande até o fim da linha em que o `end` terminou.
      const eol = next.indexOf('\n', to);
      to = eol === -1 ? next.length : eol + 1;
    }

    changes += next.slice(from, to).split('\n').length - 1;
    next = `${next.slice(0, from)}${next.slice(to)}`;
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: collapseBlankRuns(next), changes };
}

/**
 * Apaga de `pattern` até o delimitador que o FECHA, contado.
 *
 * Existe porque `dropBlock` termina na primeira linha que casa um regex de fim, e isso é
 * inexpressável quando o bloco é uma entrada de objeto literal com objetos dentro: o
 * `globalTypes.locale` do `.storybook/preview.tsx` tem `toolbar` → `items` → dois
 * objetos, e qualquer regex de `\}` casaria o primeiro fechamento interno, cortando a
 * entrada no meio e deixando o arquivo inválido. Aqui o fim é aritmética, não padrão.
 *
 * Leva a vírgula que segue o fechamento (é uma entrada de lista/objeto) e, se a linha
 * ficar vazia, a linha.
 */
export function dropBalancedBlock(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');

  let changes = 0;
  let next = content;

  for (let i = 0; i < lines.length; i += 1) {
    if (!re.test(lines[i] ?? '')) continue;

    // Offset da linha que casou, no texto ATUAL (recalculado porque já pode ter mudado).
    const currentLines = next.split('\n');
    let lineStart = 0;
    let found = -1;
    for (let scan = 0; scan < currentLines.length; scan += 1) {
      if (re.test(currentLines[scan] ?? '')) {
        found = scan;
        break;
      }
      lineStart += (currentLines[scan] ?? '').length + 1;
    }
    if (found === -1) break;

    const opener = /[[{(]/.exec(next.slice(lineStart))?.index;
    if (opener === undefined) return unmatched(content);
    const openAt = lineStart + opener;

    const closers: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
    const openCh = next[openAt] ?? '{';
    const closeCh = closers[openCh] ?? '}';
    let depth = 0;
    let close = -1;
    let quote: string | undefined;

    for (let j = openAt; j < next.length; j += 1) {
      const ch = next[j];
      if (quote !== undefined) {
        if (ch === '\\') {
          j += 1;
          continue;
        }
        if (ch === quote) quote = undefined;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        continue;
      }
      if (ch === openCh) depth += 1;
      else if (ch === closeCh) {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      }
    }
    if (close === -1) {
      throw new SeamStructureError(
        '<memória>',
        `o bloco balanceado que abre em /${pattern}/ nunca fecha — o padrão casou a linha errada`,
      );
    }

    let end = close + 1;
    if (next[end] === ',') end += 1;
    const eol = next.indexOf('\n', end);
    if (eol !== -1 && next.slice(end, eol).trim() === '') end = eol + 1;

    next = `${next.slice(0, lineStart)}${next.slice(end)}`;
    changes += 1;
    break;
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: collapseBlankRuns(next), changes };
}

/**
 * Sobe do índice dado absorvendo comentários colados, e devolve o novo topo.
 *
 * Dois casos, e o segundo é o que custou 13 arquivos desbalanceados numa geração
 * "tudo desligado":
 *
 *  1. A âncora é a DECLARAÇÃO e o doc-comment está acima dela. Sobe-se da linha de
 *     fechamento até a de abertura.
 *  2. **A âncora casou uma linha DENTRO do corpo do comentário** — que é o caso comum no
 *     manifesto, porque o texto mais distintivo de um bloco costuma ser a frase que
 *     explica a decisão ("Deletes password-reset and e-mail-verification rows…"), não a
 *     linha de código. Aqui é preciso subir pelas linhas de continuação e absorver a
 *     linha de ABERTURA do bloco. Não fazer isso deixa um comentário sem fechamento, e o
 *     efeito é bem pior que um comentário órfão: TODO o resto do arquivo passa a ser
 *     comentário, o `}` de fechamento da classe desaparece do ponto de vista do
 *     compilador, e o erro que o usuário vê não tem relação nenhuma com a feature que ele
 *     desligou.
 */
function absorbLeadingComments(lines: readonly string[], index: number): number {
  let top = index;

  for (;;) {
    const previous = (lines[top - 1] ?? '').trim();
    if (previous === '') break;

    // Comentário de linha colado.
    if (previous.startsWith('//')) {
      top -= 1;
      continue;
    }

    // Abertura de bloco: absorve e para — acima dela é outro assunto.
    if (previous.startsWith('/*')) {
      top -= 1;
      break;
    }

    // Corpo do doc-comment (` * texto`), mas NÃO o fechamento (` */`), que pertence a um
    // comentário anterior e já terminado.
    if (previous.startsWith('*') && !previous.startsWith('*/')) {
      top -= 1;
      continue;
    }

    // Fechamento de um comentário que está ACIMA da âncora: é o doc-comment do símbolo,
    // e sobe-se inteiro até a abertura.
    if (previous.endsWith('*/')) {
      let up = top - 1;
      while (up >= 0 && !(lines[up] ?? '').trim().startsWith('/*')) up -= 1;
      if (up < 0) break;
      top = up;
      continue;
    }

    break;
  }

  return top;
}

/**
 * `dropBlock`, mas absorvendo o doc-comment colado acima do início.
 *
 * O boilerplate documenta cada símbolo exportado com um bloco `/** … *\/` que explica a
 * DECISÃO — por que `ABSENT_PASSWORD_HASH` existe, por que o cookie do ticket de 2FA tem
 * o nome que tem. Apagar o símbolo e deixar o comentário produz oito linhas explicando a
 * razão de ser de algo que não está mais no arquivo, e num repo cujo `CLAUDE.md` instrui
 * agentes de IA a confiar nos comentários isso é pior que ruído: é instrução errada.
 */
export function dropBlockWithLeadingDoc(
  content: string,
  start: string,
  end: string,
  file = '<memória>',
): SeamResult {
  const startRe = compile(start);
  const lines = content.split('\n');
  const anchor = lines.findIndex((line) => startRe.test(line));
  if (anchor === -1) return unmatched(content);

  const top = absorbLeadingComments(lines, anchor);

  // Delega o corpo ao `dropBlock` sobre o trecho a partir do início real, e recola.
  const head = lines.slice(0, top).join('\n');
  const tailText = lines.slice(anchor).join('\n');
  const body = dropBlock(tailText, start, end, file);
  if (!body.matched) return unmatched(content);

  const joined = head === '' ? body.content : `${head}\n${body.content}`;
  return {
    matched: true,
    content: collapseBlankRuns(joined),
    changes: body.changes + (anchor - top),
  };
}

/**
 * Apaga um membro de classe — método ou propriedade — COM os decorators acima dele.
 *
 * Esta é a costura em que ser preguiçoso é perigoso, e o mapa deu o exemplo exato. Um
 * handler do `auth.controller.ts` tem esta forma:
 *
 *     @Public()
 *     @SystemScope()
 *     @SensitiveThrottle()
 *     @Post('2fa/verify')
 *     async verifyTwoFactor(...) { ... }
 *
 *     @Post('refresh')
 *     async refresh(...) { ... }
 *
 * Uma costura de bloco ancorada em `@Post\('2fa/verify'\)` apaga a partir dali e deixa
 * `@Public()`, `@SystemScope()` e `@SensitiveThrottle()` pendurados — e decorator pendurado
 * em TypeScript não é erro: ele adere ao PRÓXIMO membro. O resultado compila, passa no
 * lint, e transforma `POST /auth/refresh` numa rota pública em escopo de sistema e sem
 * rate limit apertado. Nenhum teste do boilerplate pegaria isso, porque nenhum teste
 * afirma que `refresh` NÃO é público.
 *
 * Então: sobe absorvendo decorators e o bloco de doc-comment colado, desce contando
 * chaves. Não há versão "quase certa" disto.
 */
export function dropClassMember(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const anchor = lines.findIndex((line) => re.test(line));
  if (anchor === -1) return unmatched(content);

  // Sobe: decorators primeiro (é o que adere ao membro seguinte se ficar), depois
  // comentários, pelo helper compartilhado.
  let start = anchor;
  while ((lines[start - 1] ?? '').trim().startsWith('@')) start -= 1;
  start = absorbLeadingComments(lines, start);
  while ((lines[start - 1] ?? '').trim().startsWith('@')) start -= 1;

  // Desce: o corpo do membro, por contagem de chaves. Uma propriedade sem corpo termina
  // no `;` da própria linha.
  //
  // O parêntese é contado junto, e não é refinamento: sem isso, um decorator de PARÂMETRO
  // com objeto literal fecha a contagem antes do corpo começar. O caso real é
  //
  //     async verifyTwoFactor(
  //       @Body() dto: TwoFactorVerifyDto,
  //       @Res({ passthrough: true }) reply: FastifyReply,   ← abre e fecha `{}`
  //     ): Promise<AuthUserResponse> {                       ← o corpo começa AQUI
  //
  // O `{ passthrough: true }` fazia `opened && depth === 0` virar verdade na linha do
  // `@Res`, o método era cortado na lista de parâmetros, e sobrava um
  // `): Promise<AuthUserResponse> {` órfão. Só conta como abertura do corpo uma `{` com
  // profundidade de parênteses zero.
  let end = anchor;
  let depth = 0;
  let parens = 0;
  let opened = false;
  for (let i = anchor; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    for (const ch of line) {
      if (ch === '(') parens += 1;
      else if (ch === ')') parens -= 1;
      else if (ch === '{') {
        if (parens > 0 && !opened) continue; // decorator de parâmetro, não o corpo
        depth += 1;
        opened = true;
      } else if (ch === '}') {
        if (parens > 0 && !opened) continue;
        depth -= 1;
      }
    }
    if (opened && depth === 0) {
      end = i;
      break;
    }
    if (!opened && parens === 0 && /;\s*$/.test(line)) {
      end = i;
      break;
    }
    end = i;
  }

  if (opened && depth !== 0) {
    throw new SeamStructureError(
      '<memória>',
      `o membro ancorado em /${pattern}/ não fecha — o padrão casou fora de uma classe`,
    );
  }

  // Uma linha em branco logo depois pertencia à separação entre membros.
  let tail = end + 1;
  if ((lines[tail] ?? 'x').trim() === '') tail += 1;

  const kept = [...lines.slice(0, start), ...lines.slice(tail)];
  return {
    matched: true,
    content: collapseBlankRuns(kept.join('\n')),
    changes: tail - start,
  };
}

/**
 * Apaga de um banner de comentário até o banner seguinte, exclusivo.
 *
 * O boilerplate organiza arquivos longos com banners (`// --- social sign-in ---`,
 * `// ─── Isolation ───`), e o mapa descreve várias remoções nessa unidade: "as 26 linhas
 * do bloco `// --- social sign-in ---` do schema Zod". `dropBlock` não serve porque o fim
 * dele é INCLUSIVO — comeria o banner da seção seguinte, fundindo duas seções e deixando
 * o resto do arquivo sob um título errado. E o corpo tem chaves aninhadas, então não há
 * regex de linha que marque o fim.
 */
export function dropCommentSection(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const start = lines.findIndex((line) => re.test(line));
  if (start === -1) return unmatched(content);

  // Um banner é um comentário de linha cuja prosa vem entre réguas de `-`, `─` ou `=`.
  const BANNER = /^\s*(?:\/\/|\/\*)\s*(?:[-─=*]{2,}|.*?[-─=]{3,})/u;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (BANNER.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }

  const kept = [...lines.slice(0, start), ...lines.slice(end)];
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes: end - start };
}

/**
 * Insere texto antes ou depois da linha que casa `pattern`.
 *
 * A ÚNICA operação aditiva do gerador, e ela tem nome: I17. O ADR 0001 diz que o gerador
 * subtrai; a exceção existe porque o boilerplate tem um defeito que só se manifesta numa
 * configuração que o gerador pode escolher — `@fastify/static` declarado e nunca
 * registrado faz `LOCAL_STORAGE_PUBLIC_URL` apontar para uma rota que a API não serve, e
 * os avatares dão 404 num build de storage `local`. Propagar isso seria gerar um projeto
 * com um bug conhecido; corrigi-lo custa duas linhas.
 *
 * Preserva a indentação da linha âncora, para o resultado não sair torto do prettier.
 */
export function insertRelative(
  content: string,
  pattern: string,
  text: string,
  where: 'before' | 'after',
): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const index = lines.findIndex((line) => re.test(line));
  if (index === -1) return unmatched(content);

  // Idempotência: se o texto já está ali, não insere de novo. O aplicador pode rodar duas
  // vezes (dry-run seguido de real, ou um retry), e um registro de plugin duplicado é um
  // erro de boot do Fastify — não um diff feio.
  if (content.includes(text.trim())) return unmatched(content);

  const indent = /^\s*/.exec(lines[index] ?? '')?.[0] ?? '';
  const block = text
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : `${indent}${line}`))
    .join('\n');

  const at = where === 'before' ? index : index + 1;
  lines.splice(at, 0, block);
  return { matched: true, content: lines.join('\n'), changes: 1 };
}

/** `true` se a posição está dentro de uma string literal na linha dada. */
function insideQuote(line: string, index: number): boolean {
  let quote: string | undefined;
  for (let i = 0; i < index; i += 1) {
    const ch = line[i];
    if (quote !== undefined) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') quote = ch;
  }
  return quote !== undefined;
}

/**
 * Offset do delimitador que fecha o aberto em `open`, ou -1.
 *
 * Conta aninhamento e ignora string e comentário. É a aritmética que substitui o
 * "primeiro `}` que eu achar" — a heurística que corta blocos aninhados pela metade.
 */
function matchingClose(text: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const openCh = text[open];
  if (openCh === undefined) return -1;
  const closeCh = pairs[openCh];
  if (closeCh === undefined) return -1;

  let depth = 0;
  let quote: string | undefined;
  let inLine = false;
  let inBlock = false;

  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    const nxt = text[i + 1];

    if (ch === '\n') {
      inLine = false;
      continue;
    }
    if (inLine) continue;
    if (inBlock) {
      if (ch === '*' && nxt === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = undefined;
      continue;
    }
    if (ch === '/' && nxt === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && nxt === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Substitui todas as ocorrências de `pattern` por `replacement`.
 *
 * Existe para os casos em que o mapa manda REESCREVER e não remover — um comentário que
 * diz "três portas levam aqui" e passa a ter duas. Reescrever prosa é preferível a
 * apagá-la: o comentário explica por que o arquivo existe, e o projeto gerado sem ele
 * perde a razão junto.
 */
export function replaceAll(content: string, pattern: string, replacement: string): SeamResult {
  const counter = compile(pattern, 'g');
  const changes = [...content.matchAll(counter)].length;
  if (changes === 0) return unmatched(content);
  // O `replace` nativo com regex global honra `$1` no `replacement` sem que precisemos
  // reimplementar a expansão de grupos — o manifesto pode usar captura.
  return { matched: true, content: content.replace(compile(pattern, 'g'), replacement), changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Acha todo statement `import ... from '<spec>';` do arquivo.
 *
 * Multi-linha incluído: o `prettier` quebra um import de seis símbolos em sete linhas, e
 * uma costura que casasse só a linha do `from` deixaria as chaves órfãs — um erro de
 * sintaxe que o `tsc` do projeto gerado reporta com a coluna certa e a causa errada.
 */
interface ImportStatement {
  /** Índice da primeira linha do statement. */
  start: number;
  /** Índice da última linha (a que tem o `from '...'`). */
  end: number;
  /** O módulo importado, sem as aspas. */
  specifier: string;
  /** O texto completo do statement. */
  text: string;
}

const IMPORT_START = /^\s*import\b/;
const IMPORT_FROM = /from\s*['"]([^'"]+)['"]/;
/** `import './side-effect.ts';` — sem `from`, o especificador é o próprio literal. */
const IMPORT_BARE = /^\s*import\s*['"]([^'"]+)['"]/;

export function findImports(content: string): ImportStatement[] {
  const lines = content.split('\n');
  const out: ImportStatement[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!IMPORT_START.test(line)) continue;

    const bare = IMPORT_BARE.exec(line);
    if (bare?.[1] !== undefined) {
      out.push({ start: i, end: i, specifier: bare[1], text: line });
      continue;
    }

    // Varre até achar o `from`. O teto é o fim do arquivo, mas um `import` sem `from`
    // em 40 linhas é código inválido — não vale defender contra isso aqui.
    let end = -1;
    let match: RegExpExecArray | null = null;
    for (let scan = i; scan < lines.length; scan += 1) {
      match = IMPORT_FROM.exec(lines[scan] ?? '');
      if (match) {
        end = scan;
        break;
      }
      // Outro `import` antes do `from` significa que este não era um import multi-linha.
      if (scan > i && IMPORT_START.test(lines[scan] ?? '')) break;
    }
    if (end === -1 || match?.[1] === undefined) continue;

    out.push({
      start: i,
      end,
      specifier: match[1],
      text: lines.slice(i, end + 1).join('\n'),
    });
    i = end;
  }

  return out;
}

/**
 * Apaga o import inteiro cujo módulo casa com `pattern`.
 *
 * `pattern` casa contra o ESPECIFICADOR (`./modules/auth/oauth/oauth.module`), não contra
 * a linha toda. É a diferença que faz a costura sobreviver a alguém renomear o símbolo
 * importado sem mover o arquivo — e, no sentido contrário, a não casar por acidente um
 * comentário que menciona o mesmo caminho.
 */
export function dropImport(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const imports = findImports(content).filter((imp) => re.test(imp.specifier));
  if (imports.length === 0) return unmatched(content);

  const lines = content.split('\n');
  const doomed = new Set<number>();
  for (const imp of imports) {
    for (let i = imp.start; i <= imp.end; i += 1) doomed.add(i);
  }

  const kept = lines.filter((_, i) => !doomed.has(i));
  return {
    matched: true,
    content: collapseBlankRuns(kept.join('\n')),
    changes: imports.length,
  };
}

/**
 * Remove UM símbolo da lista de um import que sobrevive.
 *
 * O caso do mapa: `login/page.tsx` importa sete símbolos de `@dontpanic/shared` e só dois
 * saem com o oauth. Apagar o import inteiro levaria os cinco que ficam, e reescrevê-lo
 * por string exata quebraria no próximo `prettier`. Quando o último símbolo sai, o
 * statement inteiro vai com ele — um `import {} from '...'` compila e é pior que um erro,
 * porque é um import de efeito colateral que ninguém escreveu de propósito.
 *
 * `target` restringe ao módulo (recomendado): sem ele, um símbolo de nome comum sairia de
 * qualquer import do arquivo.
 */
export function dropImportSpecifier(
  content: string,
  specifierName: string,
  target?: string,
): SeamResult {
  const nameRe = compile(specifierName);
  const moduleRe = target === undefined ? undefined : compile(target);
  const lines = content.split('\n');
  let changes = 0;
  let next = content;

  for (const imp of findImports(content)) {
    if (moduleRe && !moduleRe.test(imp.specifier)) continue;

    const braces = /\{([\s\S]*?)\}/.exec(imp.text);
    if (!braces?.[1]) continue;

    const entries = splitTopLevel(braces[1]);
    const surviving = entries.filter((entry) => {
      // O nome é a parte antes de um eventual `as`, e o `type` de um
      // `import { type X }` não faz parte do nome.
      const bare = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim() ?? '';
      return !(bare !== '' && nameRe.test(bare));
    });
    if (surviving.length === entries.length) continue;

    changes += entries.length - surviving.length;

    if (surviving.length === 0) {
      // Nada sobrou dentro das chaves. Se o import também trazia um default
      // (`import React, { useState }`) isso seria destrutivo, então só apagamos o
      // statement quando as chaves eram tudo que ele tinha.
      const hasDefault = /^\s*import\s+(?:type\s+)?[A-Za-z_$]/.test(imp.text);
      if (!hasDefault) {
        const kept = lines.filter((_, i) => i < imp.start || i > imp.end);
        next = kept.join('\n');
        // Reindexar linhas depois de apagar um statement é trabalho perdido: as costuras
        // do manifesto são independentes e o aplicador roda uma por vez.
        return { matched: true, content: collapseBlankRuns(next), changes };
      }
    }

    const rebuilt = imp.text.replace(
      /\{[\s\S]*?\}/,
      `{ ${surviving.map((entry) => entry.trim()).join(', ')} }`,
    );
    next = next.replace(imp.text, rebuilt);
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: next, changes };
}

// ─────────────────────────────────────────────────────────────────────────────
// Arrays
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quebra o interior de uma lista nos separadores de PRIMEIRO nível.
 *
 * Uma entrada pode ser `{ provide: X, useClass: Y }` ou `ThrottlerModule.forRootAsync({…})`
 * — cortar na vírgula crua partiria essas ao meio. Conta aninhamento de `(){}[]` e ignora
 * vírgula dentro de string.
 */
export function splitTopLevel(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let start = 0;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    const prev = inner[i - 1];

    if (quote !== undefined) {
      if (ch === quote && prev !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  const tail = inner.slice(start);
  // A vírgula final do prettier produz um último pedaço só com espaço/comentário; ele não
  // é uma entrada, mas precisa ser preservado na remontagem — quem chama decide.
  if (tail.trim() !== '') out.push(tail);
  return out;
}

/**
 * Acha o span do array de uma propriedade (`imports: [ … ]`), por contagem de colchetes.
 *
 * Contar colchete em vez de casar `\[[^\]]*\]` é obrigatório: o array `providers` do
 * `app.module.ts` contém objetos com arrays dentro, e a versão preguiçosa fecharia no
 * primeiro `]` interno, cortando o arquivo no meio.
 */
export function findArraySpan(
  content: string,
  property: string,
): { open: number; close: number } | undefined {
  const head = compile(`\\b${property}\\s*:\\s*\\[`, 'g');
  const match = head.exec(content);
  if (!match) return undefined;

  const open = content.indexOf('[', match.index);
  let depth = 0;
  let quote: string | undefined;

  for (let i = open; i < content.length; i += 1) {
    const ch = content[i];
    const prev = content[i - 1];
    if (quote !== undefined) {
      if (ch === quote && prev !== '\\') quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return { open, close: i };
    }
  }
  return undefined;
}

/**
 * Remove entradas de um array literal preservando a formatação das que ficam.
 *
 * Por que não `dropLinesMatching`: funciona enquanto cada entrada está na sua linha, e
 * falha silenciosamente no dia em que o prettier compactar o array numa linha só —
 * apagaria o array inteiro. Aqui a unidade é a ENTRADA, não a linha, então os dois
 * formatos se comportam igual.
 */
export function dropArrayEntry(
  content: string,
  property: string,
  entryPattern: string,
): SeamResult {
  const span = findArraySpan(content, property);
  if (!span) return unmatched(content);

  const inner = content.slice(span.open + 1, span.close);
  const entries = splitTopLevel(inner);
  const re = compile(entryPattern);

  const surviving = entries.filter((entry) => !re.test(entry));
  const changes = entries.length - surviving.length;
  if (changes === 0) return unmatched(content);

  // Multi-linha (o formato normal do `app.module.ts`): remonta preservando a indentação
  // observada, de modo que o diff mostre apenas as linhas removidas.
  const multiline = inner.includes('\n');
  let rebuilt: string;
  if (multiline) {
    const indent = /\n(\s*)\S/.exec(inner)?.[1] ?? '  ';
    const closeIndent = /\n(\s*)$/.exec(inner)?.[1] ?? '';
    const body = surviving.map((entry) => `${indent}${entry.trim()},`).join('\n');
    rebuilt = surviving.length === 0 ? '' : `\n${body}\n${closeIndent}`;
  } else {
    rebuilt = surviving.map((entry) => entry.trim()).join(', ');
  }

  return {
    matched: true,
    content: `${content.slice(0, span.open + 1)}${rebuilt}${content.slice(span.close)}`,
    changes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Confere que delimitadores estão balanceados.
 *
 * Não é um parser, e não pretende ser: é o portão que pega a classe de erro que uma
 * costura textual realmente produz — uma entrada removida pela metade, um import com a
 * chave aberta, um array fechado duas vezes. O `tsc` do projeto gerado pegaria também,
 * mas dez minutos depois, num arquivo que o usuário não sabe que o gerador editou.
 *
 * Ignora conteúdo de string, de template literal, de comentário e de LITERAL DE REGEX.
 *
 * O regex não estava aqui na primeira versão, com a justificativa de que seria raro. Não
 * é: o template tem dois (`/[&<>"']/g` em `email-templates.ts:36` e `/<\\/?strong>/g` em
 * `invitation-email.ts:148`), e os dois faziam o verificador acusar arquivo INTACTO —
 * o `"` dentro da classe de caracteres abria uma string que nunca fechava. Falso positivo
 * aqui não é ruído: `assertFileStillValid` aborta a geração, então dois arquivos que
 * ninguém tocou impediam de gerar qualquer projeto.
 */
export function assertBalanced(file: string, content: string): void {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const stack: string[] = [];
  let quote: string | undefined;
  let inLineComment = false;
  let inBlockComment = false;
  let line = 1;

  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i] ?? '';
    const next = content[i + 1];
    if (ch === '\n') {
      line += 1;
      inLineComment = false;
      continue;
    }

    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = undefined;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }

    // Literal de regex. Distinguir de divisão é o problema clássico, e a heurística que
    // o resolve na prática é o TOKEN ANTERIOR: depois de um valor (`)`, `]`, `}`,
    // identificador, número) uma barra é divisão; depois de `( , = : [ ! & | ? ; {`,
    // de `return` ou do começo da linha, é regex. Errar para o lado de "não é regex"
    // reintroduz o falso positivo; errar para o outro lado pularia uma expressão de
    // divisão até a próxima barra, e é por isso que só aceitamos as posições acima.
    if (ch === '/' && regexCanStartHere(content, i)) {
      const close = endOfRegexLiteral(content, i);
      if (close !== -1) {
        i = close;
        continue;
      }
    }

    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      const expected = pairs[ch];
      const top = stack.pop();
      if (top !== expected) {
        throw new SeamStructureError(
          file,
          `"${ch}" na linha ${line} fecha "${top ?? 'nada'}", esperava "${expected ?? '?'}". ` +
            `Alguma costura removeu texto pela metade.`,
        );
      }
    }
  }

  if (stack.length > 0) {
    throw new SeamStructureError(
      file,
      `${stack.length} delimitador(es) abertos e nunca fechados (${stack.join('')}). ` +
        `Alguma costura removeu a linha de fechamento.`,
    );
  }
}

/** `true` se uma `/` nesta posição só pode abrir um literal de regex, não uma divisão. */
function regexCanStartHere(text: string, index: number): boolean {
  let i = index - 1;
  while (i >= 0 && ' \t'.includes(text[i] ?? '')) i -= 1;
  const previous = text[i];
  if (previous === undefined || previous === '\n') return true;
  if ('(,=:[!&|?;{+-*%~^'.includes(previous)) return true;
  // `return /re/`, `typeof /re/`, `case /re/`
  const word = /(\breturn|\bcase|\btypeof|\bin|\bof|\bdelete|\bvoid)$/.exec(text.slice(0, i + 1));
  return word !== null;
}

/**
 * Offset da barra que fecha o literal de regex aberto em `open`, ou -1.
 *
 * Respeita classe de caracteres: dentro de `[...]` uma `/` não fecha o literal, que é
 * exatamente o caso de `/[&<>"']/g`.
 */
function endOfRegexLiteral(text: string, open: number): number {
  let inClass = false;
  for (let i = open + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') return -1; // regex não atravessa linha: era divisão
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) return i;
  }
  return -1;
}
