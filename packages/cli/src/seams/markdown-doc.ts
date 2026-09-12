/**
 * Poda de seções de markdown — `CLAUDE.md` e `README.md` do projeto gerado.
 *
 * Por que isto é uma das partes mais importantes do gerador, e não cosmética: o
 * `CLAUDE.md` do boilerplate tem 587 linhas e é escrito PARA agentes de IA, com blocos
 * "Para agentes de IA:" instruindo o que não fazer. Uma seção de 60 linhas explicando o
 * desenho dos convites — token hasheado, índice único parcial, e-mail depois do commit —
 * num projeto que não tem convites não é documentação inofensiva: é uma instrução para o
 * próximo dev (ou o próximo agente) implementar contra uma arquitetura que não está ali.
 * Pior que nenhuma documentação, porque tem a autoridade de estar no arquivo oficial.
 *
 * O cuidado técnico é um só e é fácil de errar: apagar uma seção SEM comer a seguinte.
 * Uma seção vai do seu heading até o próximo heading de nível IGUAL OU MAIOR (menor
 * número de `#`), levando as subseções e deixando a irmã intacta.
 */

import { collapseBlankRuns, compile, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';

interface Heading {
  line: number;
  level: number;
  title: string;
}

const ATX = /^(#{1,6})\s+(.*?)\s*$/;
/** Régua horizontal: `---`, `***`, `___`. */
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
/** Cerca de bloco de código: um heading dentro de um ``` não é heading. */
const FENCE = /^\s*(```|~~~)/;

export function listHeadings(content: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;

  content.split('\n').forEach((line, index) => {
    if (FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = ATX.exec(line);
    if (match?.[1] === undefined || match[2] === undefined) return;
    out.push({ line: index, level: match[1].length, title: match[2] });
  });

  return out;
}

/**
 * Remove a seção cujo título casa com `titlePattern`, subseções incluídas.
 *
 * `titlePattern` casa contra o TEXTO do heading, sem os `#`. Aceita regex, e o manifesto
 * usa isso: o título real é `Login social — decisão de deploy opcional`, com travessão
 * unicode, e um padrão como `^Login social` sobrevive a alguém reescrever o subtítulo —
 * que é exatamente o tipo de mudança editorial que acontece num arquivo de documentação
 * sem que ninguém pense no gerador.
 *
 * A régua `---` que fecha a seção vai com ela: o `CLAUDE.md` separa seções com `---`, e
 * deixar a régua produz duas réguas seguidas no lugar onde a seção estava.
 */
export function dropSection(content: string, titlePattern: string): SeamResult {
  const re = compile(titlePattern);
  const lines = content.split('\n');
  const headings = listHeadings(content);

  const doomed = new Set<number>();
  let changes = 0;

  for (let h = 0; h < headings.length; h += 1) {
    const heading = headings[h];
    if (!heading || !re.test(heading.title)) continue;

    // Fim: próximo heading de nível igual ou superior. Sem ele, vai até o EOF.
    let stop = lines.length;
    for (let n = h + 1; n < headings.length; n += 1) {
      const next = headings[n];
      if (next && next.level <= heading.level) {
        stop = next.line;
        break;
      }
    }

    // Recua sobre linhas em branco e sobre a régua de fechamento, que pertencem a esta
    // seção e não à próxima.
    let end = stop;
    while (end > heading.line + 1) {
      const previous = lines[end - 1] ?? '';
      if (previous.trim() === '' || HR.test(previous)) {
        end -= 1;
        continue;
      }
      break;
    }
    // Come a régua imediatamente anterior ao próximo heading (é o separador desta seção).
    for (let scan = end; scan < stop; scan += 1) {
      if (HR.test(lines[scan] ?? '')) {
        end = scan + 1;
        break;
      }
    }

    for (let i = heading.line; i < end; i += 1) doomed.add(i);
    changes += 1;
  }

  if (changes === 0) return unmatched(content);
  const kept = lines.filter((_, i) => !doomed.has(i));
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes };
}

/**
 * Remove um item de lista (um bullet) e suas linhas de continuação.
 *
 * O mapa atribui a PROPRIEDADE de bullets individuais: a seção `## O que NÃO fazer` do
 * `CLAUDE.md` tem 28 bullets, e sete features são donas de um ou dois cada. Um bullet
 * avisando "não emita sessão num callback de OAuth sem checar `twoFactorEnabled`" num
 * projeto sem OAuth manda quem lê procurar um callback que não existe.
 *
 * Continuação: o bullet do boilerplate quebra em várias linhas indentadas (são frases
 * longas). Remover só a primeira deixaria o resto da frase como parágrafo solto,
 * gramaticalmente órfão.
 */
export function dropBullet(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const kept: string[] = [];
  let changes = 0;
  let i = 0;

  const BULLET = /^(\s*)([-*+]|\d+\.)\s/;

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const bullet = BULLET.exec(line);
    if (!bullet || !re.test(line)) {
      kept.push(line);
      i += 1;
      continue;
    }

    const indent = (bullet[1] ?? '').length;
    changes += 1;
    i += 1;
    // Continuação: linha mais indentada que o marcador e que não abre outro bullet.
    while (i < lines.length) {
      const next = lines[i] ?? '';
      if (next.trim() === '') break;
      const nextBullet = BULLET.exec(next);
      if (nextBullet && (nextBullet[1] ?? '').length <= indent) break;
      const nextIndent = /^\s*/.exec(next)?.[0].length ?? 0;
      if (nextIndent <= indent && !nextBullet) break;
      i += 1;
    }
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes };
}

/**
 * Remove linhas de uma tabela markdown cujo conteúdo casa com `pattern`.
 *
 * A tabela de portas do `CLAUDE.md` (`## Arquitetura`) tem uma linha por recurso
 * plugável — `Captcha`, `Jobs`, `Storage`. Quando a feature sai, a linha sai; a tabela e
 * o cabeçalho ficam. Protege o cabeçalho e o separador (`| --- |`) explicitamente, porque
 * um padrão frouxo que os levasse transformaria a tabela num parágrafo de pipes.
 */
export function dropTableRow(content: string, pattern: string): SeamResult {
  const re = compile(pattern);
  const lines = content.split('\n');
  const kept: string[] = [];
  let changes = 0;

  const isSeparatorLine = (line: string | undefined): boolean =>
    line !== undefined && /^\s*\|[\s:|-]+\|?\s*$/.test(line);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const isRow = /^\s*\|/.test(line);
    // O CABEÇALHO é a linha imediatamente acima do separador, e é protegido pelo mesmo
    // motivo que o separador: uma tabela com linhas de dados e sem cabeçalho não é
    // markdown válido, e um padrão frouxo no manifesto (um `\|` solto) levaria as duas.
    const isHeader = isRow && isSeparatorLine(lines[i + 1]);

    if (isRow && !isSeparatorLine(line) && !isHeader && re.test(line)) {
      changes += 1;
      continue;
    }
    kept.push(line);
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: kept.join('\n'), changes };
}
