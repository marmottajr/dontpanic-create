/**
 * Remoção de um módulo Nest do `app.module.ts`.
 *
 * É a costura mais crítica do gerador e a que mais compensa ter um módulo próprio. O
 * `app.module.ts` do boilerplate tem 16 entradas em `imports` e 6 guards globais em
 * `providers`, e a remoção de uma feature tem que tirar DUAS coisas em concordância: a
 * entrada do array e o `import` que a trouxe. Tirar só uma das duas dá dois defeitos
 * diferentes e igualmente chatos:
 *
 * - entrada sem import  → `TS2304: Cannot find name 'OAuthModule'`, que aponta para a
 *   linha certa mas descreve o sintoma;
 * - import sem entrada  → compila, passa no lint com `noUnusedLocals` desligado, e o
 *   módulo simplesmente não é carregado. É o defeito pior: o projeto sobe, e a feature
 *   que o usuário pediu não existe em runtime sem que nada reclame.
 *
 * Por isso as duas edições são uma operação atômica aqui, e por isso o resultado passa
 * por `assertBalanced` antes de voltar: uma vírgula pendente ou um `]` comido a mais
 * transforma o arquivo de bootstrap inteiro em erro de sintaxe, e o `nest build` reporta
 * isso de um jeito que não aponta para o gerador.
 */

import { collapseBlankRuns, SeamStructureError, unmatched } from './result.ts';
import type { SeamResult } from './result.ts';
import { assertBalanced, dropArrayEntry, findArraySpan } from './typescript-source.ts';

/** Arrays do decorator `@Module({...})` em que uma feature pode aparecer. */
const MODULE_ARRAYS = ['imports', 'providers', 'exports', 'controllers'] as const;

export interface NestModuleRemoval {
  /** Nome da classe do módulo, ex. `OAuthModule`. Aceita regex. */
  moduleName: string;
  /**
   * Só remover o `import`, sem procurar entrada de array.
   *
   * Existe para o caso `main.ts`, que importa helpers de uma feature sem ter decorator
   * `@Module` nenhum.
   */
  importOnly?: boolean;
}

/**
 * Remove a entrada de array e o import correspondente.
 *
 * Procura a entrada em todos os arrays do `@Module`, não só em `imports`: `AuthModule`
 * aparece em `imports` e `TwoFactorGateGuard` em `providers`, e uma costura que só
 * soubesse olhar `imports` deixaria o guard global registrado apontando para uma classe
 * apagada — que é falha de boot do Nest, não erro de compilação.
 *
 * Não exige que as duas metades casem. Um módulo pode legitimamente estar só no import
 * (reexportado) ou só no array (declarado no mesmo arquivo); exigir as duas faria a
 * costura falhar em arquivos válidos. O que ela exige é que ALGO tenha casado — e o
 * `required` do manifesto é quem decide se isso para a geração.
 */
export function removeNestModule(
  content: string,
  removal: NestModuleRemoval,
  file = '<memória>',
): SeamResult {
  const { moduleName, importOnly = false } = removal;
  let next = content;
  let changes = 0;

  if (!importOnly) {
    for (const property of MODULE_ARRAYS) {
      if (findArraySpan(next, property) === undefined) continue;
      // Âncora na entrada inteira: `\b` nas duas pontas impede que `UsersModule` leve
      // `AdminUsersModule` junto, que é exatamente o tipo de remoção a mais que passa no
      // build (a classe existe) e só aparece como feature ausente em runtime.
      const entry = dropArrayEntry(next, property, `\\b${moduleName}\\b`);
      if (entry.matched) {
        next = entry.content;
        changes += entry.changes;
      }
    }
  }

  // O especificador do import é desconhecido aqui (pode ser qualquer caminho), então
  // casamos pelo símbolo importado. É o único jeito de a costura sobreviver a alguém
  // mover o arquivo do módulo sem renomear a classe.
  const imports = dropImportOfSymbol(next, moduleName);
  if (imports.matched) {
    next = imports.content;
    changes += imports.changes;
  }

  if (changes === 0) return unmatched(content);

  next = collapseBlankRuns(next);
  // Só aqui, e sempre: o arquivo de bootstrap inválido é a falha mais cara que uma
  // costura pode produzir, porque nada no projeto gerado sobe.
  assertBalanced(file, next);
  return { matched: true, content: next, changes };
}

/**
 * Apaga o statement de import que traz `symbol`.
 *
 * Diferente de `dropImport`, que casa o MÓDULO: aqui o alvo é o símbolo, porque é ele que
 * o array do `@Module` nomeia e é ele que o manifesto conhece. Quando o import traz mais
 * de um símbolo e só um sai, remove apenas aquele — apagar o statement levaria os outros.
 */
export function dropImportOfSymbol(content: string, symbol: string): SeamResult {
  const named = new RegExp(`^\\s*import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`);
  const lines = content.split('\n');
  const symbolRe = new RegExp(`\\b${symbol}\\b`);

  for (let i = 0; i < lines.length; i += 1) {
    // Reconstrói o statement possivelmente multi-linha antes de decidir: o prettier
    // quebra um import de seis símbolos, e olhar linha a linha veria chaves órfãs.
    if (!/^\s*import\b/.test(lines[i] ?? '')) continue;
    let end = i;
    while (end < lines.length && !/from\s*['"][^'"]+['"]/.test(lines[end] ?? '')) end += 1;
    if (end >= lines.length) continue;

    const text = lines.slice(i, end + 1).join('\n');
    const flat = text.replace(/\s+/g, ' ');
    const match = named.exec(flat);
    if (!match?.[1] || !symbolRe.test(match[1])) {
      i = end;
      continue;
    }

    const survivors = match[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '' && !symbolRe.test(entry));

    if (survivors.length === 0) {
      const kept = [...lines.slice(0, i), ...lines.slice(end + 1)];
      return { matched: true, content: kept.join('\n'), changes: 1 };
    }

    const rebuilt = `${(lines[i] ?? '').match(/^\s*/)?.[0] ?? ''}import ${
      /^\s*import\s+type\b/.test(text) ? 'type ' : ''
    }{ ${survivors.join(', ')} } from '${match[2] ?? ''}';`;
    const kept = [...lines.slice(0, i), rebuilt, ...lines.slice(end + 1)];
    return { matched: true, content: kept.join('\n'), changes: 1 };
  }

  return unmatched(content);
}

/**
 * Reescreve o comentário que justifica a ORDEM dos guards globais.
 *
 * O `app.module.ts` tem, acima do array de `providers`, um comentário explicando por que
 * a ordem dos seis guards é a que é. Remover um guard e deixar o comentário nomeando-o
 * produz documentação que descreve código inexistente — e num arquivo de bootstrap isso
 * é pior que em qualquer outro, porque é o primeiro lugar onde o próximo dev (ou o
 * próximo agente de IA) vai procurar para entender a cadeia de autorização. Remove a
 * linha do guard que saiu e preserva o resto do raciocínio.
 */
export function pruneGuardRationale(content: string, guardName: string): SeamResult {
  const lines = content.split('\n');
  const kept: string[] = [];
  const re = new RegExp(`^\\s*(?://|\\*)[^\\n]*\\b${guardName}\\b`);
  let changes = 0;

  for (const line of lines) {
    if (re.test(line)) {
      changes += 1;
      continue;
    }
    kept.push(line);
  }

  if (changes === 0) return unmatched(content);
  return { matched: true, content: kept.join('\n'), changes };
}

/**
 * Portão de sanidade para o arquivo inteiro depois de todas as costuras.
 *
 * Além do balanceamento, checa o que uma remoção de módulo estraga de um jeito que
 * colchete balanceado não pega: um array que ficou com `,,` (entrada removida no meio por
 * uma costura de linha) ou um `@Module({})` sem `imports`.
 */
export function assertNestModuleValid(file: string, content: string): void {
  assertBalanced(file, content);

  if (/,\s*,/.test(content.replace(/\/\/[^\n]*/g, ''))) {
    throw new SeamStructureError(
      file,
      'sobrou uma vírgula dupla (`,,`) — alguma costura removeu uma entrada de array por ' +
        'linha em vez de por entrada. Use `dropArrayEntry`/`dropNestModule`.',
    );
  }
}
