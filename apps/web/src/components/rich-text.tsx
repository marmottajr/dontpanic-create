import type { ReactNode } from 'react';

/**
 * Marcação inline mínima para o conteúdo dos dicionários.
 *
 * Três marcas, e nada mais: `` `código` ``, `**forte**` e `*ênfase*`. O motivo de
 * existir é o conteúdo — a seção "A prova" cita identificadores e variáveis de
 * ambiente em quase toda frase, e um `<code>` precisa ser um `<code>` de verdade para
 * o leitor de tela mudar de voz e para a fonte mono entrar. Escrever isso como JSX nos
 * sete dicionários tornaria a tradução um exercício de contar chaves.
 *
 * Não é Markdown e não deve virar: nada de link, lista ou parágrafo. O dia em que um
 * texto precisar de link, ele ganha um campo próprio no tipo.
 */

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

export function RichText({ children }: { children: string }): ReactNode {
  const parts = children.split(TOKEN).filter((part) => part.length > 0);

  return parts.map((part, index) => {
    const key = `${index}-${part.slice(0, 8)}`;

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={key} className="font-mono text-[0.92em] text-amber">
          {part.slice(1, -1)}
        </code>
      );
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-text">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    return <span key={key}>{part}</span>;
  });
}
