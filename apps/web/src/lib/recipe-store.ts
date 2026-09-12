/**
 * Persistência da escolha entre visitas.
 *
 * Guarda a mesma query string que a URL usa, de propósito: um formato só, um
 * serializador só, e o que está no `localStorage` pode ser colado na barra de endereço
 * para depurar. Guardar JSON aqui e query string lá criaria dois formatos para manter
 * em sincronia, e o segundo sempre apodrece.
 *
 * Todo acesso é embrulhado em try/catch. Não é zelo decorativo: em aba privada e com
 * cookies de terceiros bloqueados, *o acessor `localStorage` em si* lança — não só o
 * `getItem`. Uma exceção aqui derrubaria a hidratação do configurador inteiro, e a
 * consequência de não ter storage é apenas voltar ao preset padrão.
 */

const STORAGE_KEY = 'dontpanic.recipe.v1';

export function readStoredQuery(): string | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeStoredQuery(query: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, query);
  } catch {
    // Sem storage, a escolha vale só para esta sessão. É uma perda de conveniência,
    // não de funcionalidade: o comando na tela continua correto.
  }
}

export function clearStoredQuery(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // idem
  }
}
