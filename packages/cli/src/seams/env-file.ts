/**
 * Remoção de variável do `.env.example`, com o comentário que a descreve.
 *
 * O `.env.example` do boilerplate não é uma lista de chaves: é documentação executável.
 * Cada variável vem precedida de um ou vários comentários explicando o que ela decide e
 * qual é a armadilha ("`CAPTCHA_DRIVER` e `NEXT_PUBLIC_CAPTCHA_DRIVER` têm que combinar"),
 * organizados em seções com régua (`# ─────`). Remover só a linha `KEY=` deixa um
 * parágrafo órfão explicando uma variável que já não existe — e quem lê um `.env.example`
 * está justamente tentando descobrir o que precisa configurar, então documentação fantasma
 * ali custa uma hora de procura por uma variável que o projeto não lê.
 *
 * A regra de quanto comer para cima: os comentários CONTÍGUOS imediatamente acima da
 * chave. Para na primeira linha em branco e para numa régua de seção — a régua pertence à
 * seção, não à variável, e comê-la deixaria a próxima variável sem cabeçalho.
 */

import { collapseBlankRuns, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';

/** Uma régua/cabeçalho de seção: pertence à seção, nunca à variável logo abaixo. */
const SECTION_RULE = /^#\s*(?:[─\-=_*#]{3,}|.*[─]{3,})/u;

/** `KEY=valor`, `# KEY=valor` (comentada) e `export KEY=valor`. */
function keyLineRe(key: string): RegExp {
  return new RegExp(`^\\s*(?:#\\s*)?(?:export\\s+)?${key}\\s*=`);
}

/**
 * Remove `key` e o bloco de comentário que a precede.
 *
 * Remove TODAS as ocorrências: o `.env.example` declara `NEXT_PUBLIC_*` numa seção
 * separada ("as metades públicas"), então uma variável pode aparecer duas vezes com
 * propósitos diferentes, e parar na primeira deixaria a outra.
 */
export function dropEnvKey(content: string, key: string): SeamResult {
  const re = keyLineRe(key);
  const lines = content.split('\n');
  const doomed = new Set<number>();
  let changes = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (!re.test(lines[i] ?? '')) continue;
    changes += 1;
    doomed.add(i);

    // Um valor multi-linha entre aspas (a `.p8` da Apple é PEM) continua nas linhas
    // seguintes até a aspa fechar.
    const value = (lines[i] ?? '').split('=').slice(1).join('=');
    const quote = /^\s*(['"])/.exec(value)?.[1];
    if (quote !== undefined && !new RegExp(`${quote}\\s*$`).test(value.trim().slice(1))) {
      let scan = i + 1;
      while (scan < lines.length && !(lines[scan] ?? '').includes(quote)) {
        doomed.add(scan);
        scan += 1;
      }
      if (scan < lines.length) doomed.add(scan);
      i = scan;
    }

    // Sobe pelos comentários contíguos.
    let up = i - 1;
    while (up >= 0) {
      const line = lines[up] ?? '';
      if (line.trim() === '') break;
      if (!line.trimStart().startsWith('#')) break;
      if (SECTION_RULE.test(line.trim())) break;
      // Um comentário que já é a linha de outra variável comentada não é descrição.
      if (/^\s*#\s*[A-Z][A-Z0-9_]*\s*=/.test(line)) break;
      doomed.add(up);
      up -= 1;
    }
  }

  if (changes === 0) return unmatched(content);
  const kept = lines.filter((_, i) => !doomed.has(i));
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes };
}

/**
 * Remove uma seção inteira do `.env.example`, da régua/cabeçalho até a próxima régua.
 *
 * Existe porque o mapa descreve várias remoções como "apague o bloco `# Social sign-in
 * (OAuth)` inteiro, régua inclusive" — são 50 linhas com dez variáveis e a prosa que as
 * explica, e enumerar chave por chave deixaria a régua e os parágrafos de contexto.
 */
export function dropEnvSection(content: string, headerPattern: string): SeamResult {
  const header = new RegExp(headerPattern);
  const lines = content.split('\n');
  const kept: string[] = [];
  let changes = 0;
  let i = 0;

  while (i < lines.length) {
    if (!header.test(lines[i] ?? '')) {
      kept.push(lines[i] ?? '');
      i += 1;
      continue;
    }

    // A régua ACIMA do cabeçalho faz parte dele (o formato do arquivo é régua/título/régua).
    while (kept.length > 0 && SECTION_RULE.test((kept[kept.length - 1] ?? '').trim())) {
      kept.pop();
      changes += 1;
    }

    let scan = i + 1;
    // Anda até o próximo cabeçalho de seção. A régua de fechamento da própria seção não
    // conta como próximo cabeçalho, então exigimos que haja conteúdo antes.
    let sawContent = false;
    while (scan < lines.length) {
      const line = lines[scan] ?? '';
      if (SECTION_RULE.test(line.trim()) && sawContent) break;
      if (line.trim() !== '' && !SECTION_RULE.test(line.trim())) sawContent = true;
      scan += 1;
    }

    changes += scan - i;
    i = scan;
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: collapseBlankRuns(kept.join('\n')), changes };
}

/**
 * Reescreve o valor de uma variável sem mexer no comentário.
 *
 * O caso do mapa é I11: em modo single-tenant, `PUBLIC_SIGNUP_ENABLED` e
 * `NEXT_PUBLIC_SIGNUP_ENABLED` têm que ir para `false` — as DUAS. Escrever só uma gera
 * um formulário que renderiza e responde 403 em todo submit, que é a mesma armadilha do
 * captcha meio-ligado, pelo mesmo motivo.
 */
export function setEnvValue(content: string, key: string, value: string): SeamResult {
  const re = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=).*$`, 'gm');
  const changes = [...content.matchAll(re)].length;
  if (changes === 0) return unmatched(content);
  return { matched: true, content: content.replace(re, `$1${value}`), changes };
}
