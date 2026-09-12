/**
 * O resultado de uma costura, e o erro que ela levanta quando não casa.
 *
 * Toda costura devolve o mesmo par de informações — "casou?" e "como ficou o texto" — e
 * NUNCA lança por não ter casado. A decisão de falhar a geração é de quem chamou, porque
 * é lá que se sabe se a costura era `required`. Isso mantém as costuras testáveis
 * isoladamente: um teste pode afirmar `matched === false` sem montar um try/catch.
 */

export interface SeamResult {
  /** `false` significa que o padrão âncora não achou nada para editar. */
  matched: boolean;
  /** O conteúdo depois da edição. Igual ao de entrada quando `matched` é `false`. */
  content: string;
  /**
   * Quantas ocorrências foram afetadas (linhas apagadas, chaves removidas, entradas de
   * array retiradas). Entra no relatório porque "casou" não distingue uma costura que
   * removeu a linha certa de uma que varreu meio arquivo — e um número inesperado é o
   * primeiro sinal de um padrão frouxo demais.
   */
  changes: number;
}

/** Nada casou. */
export function unmatched(content: string): SeamResult {
  return { matched: false, content, changes: 0 };
}

/**
 * Erro estrutural de uma costura: o padrão casou, mas aplicá-lo deixaria o arquivo
 * inválido (import órfão, relação Prisma apontando para model que saiu, colchete
 * desbalanceado).
 *
 * É separado de "não casou" de propósito. "Não casou" quer dizer que o boilerplate mudou
 * e o manifesto envelheceu; isto quer dizer que o manifesto está ERRADO agora, e a
 * diferença muda completamente o que quem depura vai procurar.
 */
export class SeamStructureError extends Error {
  readonly file: string;
  readonly detail: string;

  constructor(file: string, detail: string) {
    super(`Costura deixaria ${file} inválido: ${detail}`);
    this.name = 'SeamStructureError';
    this.file = file;
    this.detail = detail;
  }
}

/**
 * Compila o `pattern` do manifesto.
 *
 * Os padrões vêm como fonte sem flags (é o que o `SeamEdit` documenta) porque uma flag
 * embutida na string viraria parte do contrato sem estar no tipo. Um padrão inválido é
 * bug de manifesto, e a mensagem precisa dizer isso — um `SyntaxError` cru do
 * `RegExp` faz quem depura procurar no arquivo do projeto gerado, que está intacto.
 */
export function compile(pattern: string, flags = ''): RegExp {
  try {
    return new RegExp(pattern, flags);
  } catch (error) {
    throw new Error(
      `Padrão inválido no manifesto do gerador: /${pattern}/${flags}\n` +
        `  ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Normaliza sequências de linhas em branco deixadas por uma remoção.
 *
 * Apagar um bloco quase sempre deixa duas linhas vazias coladas, e o resultado é um diff
 * cheio de ruído justamente no primeiro commit que o usuário vai ler. Colapsa 3+ em 2 —
 * nunca em 1, porque uma linha em branco dupla é separador legítimo em muitos arquivos
 * (entre blocos do Prisma, entre seções do `.env`).
 */
export function collapseBlankRuns(content: string): string {
  return content.replace(/\n{4,}/g, '\n\n\n');
}
