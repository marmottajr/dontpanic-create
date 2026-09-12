/**
 * Baseline de migration do projeto gerado.
 *
 * O projeto gerado NÃO recebe as 6 migrations do histórico do boilerplate. Recebe uma
 * baseline: um único `prisma/migrations/0_init/migration.sql` que produz, num banco
 * vazio, exatamente o schema que a receita pediu.
 *
 * Por que não herdar o histórico: um projeto gerado sem convites nunca teve convites.
 * Um histórico que cria a tabela `invitations` numa migration de setembro de 2026, com
 * o nome e o timestamp de outro projeto, é uma mentira sobre o passado — e uma mentira
 * operacional, porque `prisma migrate dev` compara o estado final do histórico com o
 * schema: com a tabela criada no histórico e ausente do schema podado, o primeiro
 * `db:migrate` do usuário geraria uma migration de DROP TABLE para desfazer o que a
 * própria baseline acabou de fazer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * DECISÃO DE ARQUITETURA — de onde vem o DDL  (ver docs/decisions/0004)
 * ═══════════════════════════════════════════════════════════════════════════════
 * Duas opções estavam na mesa:
 *
 * **(a) `prisma migrate diff --from-empty --to-schema-datamodel`**, rodado no projeto
 * gerado. É a ferramenta certa e produz o DDL canônico para o schema podado. Mas exige
 * o CLI do Prisma **com os engines baixados**, ou seja, acontece depois do
 * `pnpm install` — que é opcional (`--no-install`) e que pode falhar por rede. Isso
 * inverte a ordem do pipeline (env e git passariam a depender do install), e produz um
 * modo de falha novo e desagradável: um projeto gerado, com todos os arquivos no lugar,
 * sem migration nenhuma — e o usuário descobre no `db:migrate`.
 *
 * **(b) Montar a baseline a partir do SQL que o boilerplate já tem**, filtrando o que a
 * poda de features tirou. É o caminho escolhido.
 *
 * O que torna (b) seguro é uma propriedade do gerador de migrations do Prisma: ele
 * **rotula cada statement** (`-- CreateTable`, `-- CreateEnum`, `-- CreateIndex`,
 * `-- AddForeignKey`, `-- AlterTable`) e emite um statement por objeto, com o nome do
 * objeto entre aspas. Não estamos fazendo parsing de SQL arbitrário: estamos
 * reagrupando uma saída de gerador, e o que sobra (RLS, role restrita, índices
 * parciais) é SQL escrito à mão que passa inteiro, verbatim.
 *
 * E o que torna (b) honesto é que o DDL não é versionado aqui: ele vem do template, que
 * o `sync-template` materializa de uma **tag** do boilerplate. Se o boilerplate mudar
 * uma coluna, a baseline do próximo `sync-template` muda junto. Não há fragmento de SQL
 * mantido à mão neste repo para apodrecer.
 *
 * A opção (a) continua valendo — como VERIFICAÇÃO, no CI de conformidade: gerar,
 * instalar, rodar `migrate diff --from-migrations … --to-schema-datamodel` e exigir
 * saída vazia. É lá que ela não custa nada e prova tudo.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * O que NÃO dá para derivar do schema, e por isso é fragmento próprio
 * ═══════════════════════════════════════════════════════════════════════════════
 *   · o schema `app` e as funções de contexto (`current_tenant_id`, `is_system`, …)
 *   · `app.apply_tenant_rls()` — a varredura que protege toda tabela com `tenantId`
 *   · `ENABLE`/`FORCE ROW LEVEL SECURITY` e as políticas
 *   · os índices parciais (o `UNIQUE(tenantId,email) WHERE status='PENDING'` dos
 *     convites), que a linguagem do Prisma não sabe expressar
 *   · a role restrita, seus GRANTs e os ALTER DEFAULT PRIVILEGES
 *
 * Nenhum deles é gerável por `migrate diff`, então mesmo na opção (a) eles teriam de
 * ser concatenados à mão — o que reduz a diferença entre (a) e (b) a "de onde vem o
 * CREATE TABLE".
 */

import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { assertWithin, pathExists, writeText } from './util/fs.ts';
import type { GeneratorContext } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Caminhos
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_DIR = 'apps/api/prisma/schema';
const MIGRATIONS_DIR = 'apps/api/prisma/migrations';

/**
 * `0_init` e não um timestamp.
 *
 * É o nome que a documentação do Prisma usa para baseline, e o prefixo `0_` garante que
 * ela ordena antes de qualquer migration que o usuário criar depois — o Prisma aplica
 * em ordem lexicográfica do nome do diretório, e uma baseline chamada
 * `20260101000000_init` perderia dessa ordem para nada.
 */
const BASELINE_NAME = '0_init';

const LOCK_FILE = 'migration_lock.toml';

// ─────────────────────────────────────────────────────────────────────────────
// Fragmentos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As fases da baseline, em ordem de dependência.
 *
 * A ordem não é estética, cada aresta é uma falha real se invertida:
 *
 *   enums       → `CREATE TABLE` referencia o tipo no DEFAULT da coluna
 *   tables      → índice, FK e política precisam da tabela
 *   alters      → `ADD COLUMN`/`DROP NOT NULL` precisam da tabela
 *   indexes     → nada depende deles, mas vêm antes das FKs como o Prisma emite
 *   constraints → FK precisa das duas tabelas e do índice do lado referenciado
 *   rls         → as políticas nomeiam tabelas e colunas que já têm de existir
 *   app-role    → `GRANT … ON ALL TABLES IN SCHEMA public` só alcança o que existe
 *                 AGORA; rodar antes das tabelas concede permissão sobre o vazio, o
 *                 install termina "com sucesso" e a API recusa toda query em runtime
 *   final-sweep → `SELECT app.apply_tenant_rls()` idempotente, por último, para que
 *                 nenhuma tabela criada acima fique fora do isolamento
 */
export const BASELINE_FRAGMENT_IDS = [
  'enums',
  'tables',
  'alters',
  'indexes',
  'constraints',
  'rls',
  'app-role',
  'final-sweep',
] as const;

export type BaselineFragmentId = (typeof BASELINE_FRAGMENT_IDS)[number];

const FRAGMENT_TITLES: Record<BaselineFragmentId, string> = {
  enums: 'Tipos enumerados',
  tables: 'Tabelas',
  alters: 'Ajustes de coluna',
  indexes: 'Índices (inclusive os parciais, que o Prisma não sabe expressar)',
  constraints: 'Chaves estrangeiras',
  rls: 'Isolamento entre empresas — Row Level Security (SQL manual)',
  'app-role': 'A role restrita da aplicação (SQL manual)',
  'final-sweep': 'Varredura final: nenhuma tabela fica fora do isolamento',
};

export interface BaselineResult {
  /** Caminho do arquivo, relativo à raiz do projeto gerado. */
  relPath: string;
  sql: string;
  fragments: { id: BaselineFragmentId; statements: number }[];
  /** Diretórios de migration do boilerplate que foram removidos. */
  removedMigrations: string[];
  droppedTables: string[];
  droppedEnums: string[];
  droppedColumns: { table: string; column: string }[];
  /** Statements descartados por referenciarem objeto podado. */
  droppedStatements: number;
  /** Sempre `true`: `--no-multi-tenant` esconde a UI, não arranca o RLS (ADR 0002). */
  rlsRetained: boolean;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura do schema podado
// ─────────────────────────────────────────────────────────────────────────────

interface SchemaField {
  name: string;
  /** Nome da coluna: `@map("x")` quando existe, senão o próprio nome do campo. */
  column: string;
  optional: boolean;
}

interface SchemaModel {
  model: string;
  /** Nome da tabela: `@@map("x")` quando existe, senão o nome do model. */
  table: string;
  fields: Map<string, SchemaField>;
}

interface PrunedSchema {
  tables: Map<string, SchemaModel>;
  enums: Set<string>;
}

/**
 * Lê os models e enums que SOBRARAM no schema.
 *
 * Parser deliberadamente pequeno: reconhece `model X { … }`, `enum Y { … }`, `@@map`,
 * `@map` e o `?` de opcional. Não precisa entender relação, atributo de bloco nem tipo
 * nativo, porque a única pergunta que fazemos é "este objeto ainda existe?".
 *
 * Campo de relação (`tenant Tenant @relation(fields: [tenantId], …)`) não gera coluna, e
 * isso não incomoda: o campo escalar que gera a coluna (`tenantId`) está sempre
 * declarado ao lado, e é por ele que o filtro de colunas casa.
 */
export function parsePrunedSchema(sources: string[]): PrunedSchema {
  const tables = new Map<string, SchemaModel>();
  const enums = new Set<string>();

  for (const source of sources) {
    // Comentários de documentação (`///`) e de linha (`//`) fora, para não confundir
    // uma linha comentada com um campo vivo.
    const lines = source.split('\n').map((line) => line.replace(/\/\/.*$/, ''));

    let current: SchemaModel | null = null;
    let currentEnum: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (current === null && currentEnum === null) {
        const model = /^model\s+([A-Za-z0-9_]+)\s*\{/.exec(trimmed);
        if (model) {
          current = { model: model[1]!, table: model[1]!, fields: new Map() };
          continue;
        }
        const enumMatch = /^enum\s+([A-Za-z0-9_]+)\s*\{/.exec(trimmed);
        if (enumMatch) {
          currentEnum = enumMatch[1]!;
          continue;
        }
        continue;
      }

      if (trimmed === '}') {
        if (current) tables.set(current.table, current);
        if (currentEnum) enums.add(currentEnum);
        current = null;
        currentEnum = null;
        continue;
      }

      if (currentEnum !== null) continue;
      if (!current) continue;

      const map = /^@@map\("([^"]+)"\)/.exec(trimmed);
      if (map) {
        current.table = map[1]!;
        continue;
      }

      if (trimmed.startsWith('@@') || trimmed === '') continue;

      // `nome  Tipo?  @atributos`
      const field = /^([A-Za-z0-9_]+)\s+([A-Za-z0-9_[\]]+)(\?)?/.exec(trimmed);
      if (!field) continue;

      const fieldMap = /@map\("([^"]+)"\)/.exec(trimmed);
      const name = field[1]!;
      current.fields.set(fieldMap?.[1] ?? name, {
        name,
        column: fieldMap?.[1] ?? name,
        optional: field[3] === '?',
      });
    }

    // Arquivo terminando sem `}` de fechamento não deveria acontecer; se acontecer, é
    // melhor perder o último model do que fechar um bloco imaginário.
  }

  return { tables, enums };
}

async function readPrunedSchema(templateDir: string): Promise<PrunedSchema> {
  const dir = assertWithin(templateDir, SCHEMA_DIR);
  const entries = await readdir(dir).catch(() => {
    throw new Error(
      `Schema do Prisma não encontrado em ${SCHEMA_DIR}.\n` +
        'A baseline é montada a partir do schema já podado; sem ele não há como saber o ' +
        'que sobrou. Isto é bug no pipeline do gerador (a poda roda antes da baseline).',
    );
  });

  const sources = await Promise.all(
    entries
      .filter((name) => name.endsWith('.prisma'))
      .sort()
      .map((name) => readFile(join(dir, name), 'utf8')),
  );

  const schema = parsePrunedSchema(sources);

  // Guarda contra o pior modo de falha deste módulo: um parser que não entendeu o
  // arquivo devolve conjunto vazio, e o filtro "objeto não está no schema → descarta"
  // apagaria a baseline inteira, deixando um `0_init` com só o RLS dentro. O
  // boilerplate tem 15 models; menos de 5 é sinal de que a leitura falhou, não de que
  // a poda foi agressiva.
  if (schema.tables.size < 5) {
    throw new Error(
      `Só ${schema.tables.size} model(s) lidos de ${SCHEMA_DIR}. Isso não é poda, é ` +
        'falha de leitura do schema — abortando antes de gerar uma baseline vazia.',
    );
  }

  return schema;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divisão do SQL em statements
// ─────────────────────────────────────────────────────────────────────────────

export interface SqlStatement {
  /** Comentários que precediam o statement, preservados. */
  comments: string[];
  /** O SQL, sem o `;` final. */
  code: string;
  /** O rótulo do Prisma (`CreateTable`, `AddForeignKey`, …), quando havia. */
  tag?: string;
}

/**
 * Divide um arquivo de migration em statements.
 *
 * Precisa ser ciente de **dollar quoting**: as migrations manuais do boilerplate são
 * blocos `DO $$ … END $$;` e `CREATE FUNCTION … $$ … $$;` cheios de `;` internos. Um
 * `split(';')` os partiria no meio e produziria SQL inválido — e o sintoma seria um
 * erro de sintaxe do Postgres no meio de um `format(...)`, longe da causa.
 *
 * Também preserva os comentários: os blocos de `--` das migrations de RLS e de role
 * explicam POR QUE aquele SQL existe, e são a melhor documentação que o projeto gerado
 * pode ter no lugar onde ela importa.
 */
export function splitStatements(sql: string): SqlStatement[] {
  const out: SqlStatement[] = [];
  let buffer = '';
  let i = 0;

  const push = () => {
    const raw = buffer;
    buffer = '';
    if (raw.trim() === '') return;

    const lines = raw.split('\n');
    const comments: string[] = [];
    let start = 0;
    for (; start < lines.length; start += 1) {
      const line = lines[start]!;
      const trimmed = line.trim();
      if (trimmed === '') {
        // Linha em branco entre comentários mantém o bloco junto.
        if (comments.length > 0) comments.push('');
        continue;
      }
      if (trimmed.startsWith('--')) {
        comments.push(line);
        continue;
      }
      break;
    }

    const code = lines.slice(start).join('\n').trim();
    if (code === '') {
      // Comentário solto no fim do arquivo: vira comentário do statement anterior.
      const last = out[out.length - 1];
      if (last) last.comments.push(...comments);
      return;
    }

    while (comments.length > 0 && comments[comments.length - 1] === '') comments.pop();

    const tag = /^--\s*([A-Za-z]+)\s*$/.exec(comments[comments.length - 1]?.trim() ?? '')?.[1];
    out.push({ comments, code, ...(tag ? { tag } : {}) });
  };

  while (i < sql.length) {
    const char = sql[i]!;

    // Comentário de linha: copiado inteiro, sem interpretar nada dentro.
    if (char === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end + 1;
      buffer += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // Dollar quoting: `$$` ou `$tag$`.
    const dollar = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
    if (char === '$' && dollar) {
      const marker = dollar[0];
      const end = sql.indexOf(marker, i + marker.length);
      const stop = end === -1 ? sql.length : end + marker.length;
      buffer += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // String literal.
    if (char === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") break;
        j += 1;
      }
      buffer += sql.slice(i, Math.min(j + 1, sql.length));
      i = j + 1;
      continue;
    }

    if (char === ';') {
      buffer += ';';
      push();
      i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  push();
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classificação e filtragem
// ─────────────────────────────────────────────────────────────────────────────

interface Classified {
  fragment: BaselineFragmentId;
  statement: SqlStatement;
  /** Tabelas/enums que o statement exige que existam. */
  requires: string[];
}

const IDENT = '"([^"]+)"';

function classify(statement: SqlStatement): Classified {
  const code = statement.code;
  const head = code.replace(/\s+/g, ' ').trim();

  // Manual antes de tudo, e a ordem DESTES testes também importa.
  //
  // `GRANT`/`REVOKE` são procurados em qualquer posição, não só no início: o último
  // statement da migration de role é um `DO $$ … REVOKE ALL ON public._prisma_migrations
  // … $$`, que começa com `DO`. Classificado pelo início, ele cairia no fragmento de
  // RLS — que roda ANTES do de role — e o REVOKE falharia porque a role ainda não
  // existe. Um erro que o `migrate deploy` reporta como "role does not exist", numa
  // linha que não menciona a criação da role.
  if (
    /\b(CREATE|ALTER|DROP)\s+ROLE\b/i.test(code) ||
    /\bALTER\s+DEFAULT\s+PRIVILEGES\b/i.test(code) ||
    /\b(GRANT|REVOKE)\b/i.test(code)
  ) {
    return { fragment: 'app-role', statement, requires: [] };
  }

  if (/^SELECT\s+app\.apply_(tenant|user_owned)_rls\(\)/i.test(head)) {
    return { fragment: 'final-sweep', statement, requires: [] };
  }

  if (
    /^CREATE\s+SCHEMA\b/i.test(head) ||
    /^CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\b/i.test(head) ||
    /^DO\b/i.test(head) ||
    /ROW\s+LEVEL\s+SECURITY/i.test(code) ||
    /^CREATE\s+POLICY\b/i.test(head)
  ) {
    return { fragment: 'rls', statement, requires: [] };
  }

  const createEnum = new RegExp(`^CREATE\\s+TYPE\\s+${IDENT}\\s+AS\\s+ENUM`, 'i').exec(head);
  if (createEnum) return { fragment: 'enums', statement, requires: [createEnum[1]!] };

  const alterEnum = new RegExp(`^ALTER\\s+TYPE\\s+${IDENT}\\s+ADD\\s+VALUE`, 'i').exec(head);
  if (alterEnum) return { fragment: 'enums', statement, requires: [alterEnum[1]!] };

  const createTable = new RegExp(`^CREATE\\s+TABLE\\s+${IDENT}`, 'i').exec(head);
  if (createTable) return { fragment: 'tables', statement, requires: [createTable[1]!] };

  // Grupo 3, não 2: o grupo 1 é o `UNIQUE` opcional e o 2 é o NOME do índice. Pegar o
  // nome do índice como se fosse o da tabela faz todo índice ser descartado por
  // "tabela inexistente" — inclusive o índice parcial dos convites, que é o único lugar
  // onde a restrição "no máximo um convite PENDING por (empresa, e-mail)" existe.
  const createIndex = new RegExp(
    `^CREATE\\s+(UNIQUE\\s+)?INDEX\\s+${IDENT}\\s+ON\\s+${IDENT}`,
    'i',
  ).exec(head);
  if (createIndex) return { fragment: 'indexes', statement, requires: [createIndex[3]!] };

  const alterTable = new RegExp(`^ALTER\\s+TABLE\\s+${IDENT}`, 'i').exec(head);
  if (alterTable) {
    const table = alterTable[1]!;
    const fk = new RegExp(`REFERENCES\\s+${IDENT}`, 'i').exec(head);
    if (/ADD\s+CONSTRAINT/i.test(head) && fk) {
      return { fragment: 'constraints', statement, requires: [table, fk[1]!] };
    }
    return { fragment: 'alters', statement, requires: [table] };
  }

  // Qualquer coisa que o boilerplate acrescente e este módulo não conheça vai para
  // `alters` — depois das tabelas, antes do RLS. Passar adiante sem entender é melhor
  // que descartar: descartar silenciosamente perderia DDL, e o sintoma seria uma coluna
  // que falta, num lugar sem pista de quem a removeu.
  return { fragment: 'alters', statement, requires: [] };
}

/** As colunas que um statement exige que existam, por tabela. */
function requiredColumns(code: string): string[] {
  const out: string[] = [];
  // Colunas citadas em índice (`ON "t"("a", "b")`), em WHERE de índice parcial e em FK.
  const onClause = /\bON\s+"[^"]+"\s*\(([^)]*)\)/i.exec(code);
  if (onClause) out.push(...[...onClause[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
  const where = /\bWHERE\b([\s\S]*)$/i.exec(code);
  if (where) out.push(...[...where[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
  const fk = /FOREIGN\s+KEY\s*\(([^)]*)\)/i.exec(code);
  if (fk) out.push(...[...fk[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!));
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reescrita de CREATE TABLE e ALTER TABLE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove do `CREATE TABLE` as colunas que a poda tirou do model.
 *
 * Erra de propósito para o lado de MANTER: se o model não foi lido, ou se a coluna não
 * pôde ser casada com campo nenhum, ela fica. Uma coluna a mais faz o `prisma migrate
 * dev` do usuário oferecer um `DROP COLUMN` — chato, visível, corrigível. Uma coluna a
 * menos faz a aplicação quebrar em runtime, num INSERT, com erro do Prisma sobre um
 * campo que o schema promete.
 */
export function filterTableColumns(
  code: string,
  model: SchemaModel | undefined,
): { code: string; dropped: string[] } {
  if (!model || model.fields.size === 0) return { code, dropped: [] };

  const open = code.indexOf('(');
  const close = code.lastIndexOf(')');
  if (open === -1 || close === -1 || close < open) return { code, dropped: [] };

  const header = code.slice(0, open + 1);
  const tail = code.slice(close);
  const body = code.slice(open + 1, close);

  const columns: string[] = [];
  const constraints: string[] = [];
  const dropped: string[] = [];

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (line === '') continue;

    if (/^CONSTRAINT\b/i.test(line)) {
      constraints.push(line);
      continue;
    }

    const name = /^"([^"]+)"/.exec(line)?.[1];
    if (!name) {
      // Linha que não é coluna nem constraint reconhecível: passa adiante intacta.
      columns.push(line);
      continue;
    }

    if (model.fields.has(name)) {
      columns.push(line);
    } else {
      dropped.push(name);
    }
  }

  const parts = [...columns];
  const rendered =
    constraints.length > 0
      ? `${parts.map((c) => `    ${c}`).join(',\n')},\n\n${constraints.map((c) => `    ${c}`).join(',\n')}\n`
      : `${parts.map((c) => `    ${c}`).join(',\n')}\n`;

  return { code: `${header}\n${rendered}${tail}`, dropped };
}

/**
 * Filtra as cláusulas de um `ALTER TABLE`.
 *
 * O Prisma junta várias colunas num único statement:
 *
 *     ALTER TABLE "users" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
 *     ADD COLUMN "profileId" UUID;
 *
 * Descartar o statement inteiro porque UMA das colunas saiu perderia as outras. E há um
 * caso que exige olhar o schema, não só a existência da coluna: `ALTER COLUMN "x" DROP
 * NOT NULL`. O boilerplate afrouxa `users.passwordHash` porque conta social não tem
 * senha; se a receita não tem login social, o campo volta a ser obrigatório no schema, e
 * manter o `DROP NOT NULL` deixaria a coluna nullable contra um schema que a promete
 * NOT NULL — drift silencioso que só aparece no primeiro `migrate dev` do usuário.
 */
export function filterAlterClauses(
  code: string,
  model: SchemaModel | undefined,
): { code: string | null; dropped: string[] } {
  const prefix = /^(ALTER\s+TABLE\s+"[^"]+"\s*)/i.exec(code);
  if (!prefix || !model) return { code, dropped: [] };

  const rest = code.slice(prefix[1]!.length).replace(/;?\s*$/, '');
  const clauses = rest.split(/,\s*\n(?=\s*(?:ADD|ALTER|DROP)\b)/i);
  const kept: string[] = [];
  const dropped: string[] = [];

  for (const clause of clauses) {
    const column = /\b(?:ADD|ALTER|DROP)\s+COLUMN\s+"([^"]+)"/i.exec(clause)?.[1];
    if (!column) {
      kept.push(clause);
      continue;
    }

    const field = model.fields.get(column);
    if (!field) {
      dropped.push(column);
      continue;
    }

    // A coluna existe; falta decidir o afrouxamento de nulidade.
    if (/DROP\s+NOT\s+NULL/i.test(clause) && !field.optional) {
      dropped.push(`${column} (DROP NOT NULL descartado: o campo voltou a obrigatório)`);
      continue;
    }

    kept.push(clause);
  }

  if (kept.length === 0) return { code: null, dropped };
  return { code: `${prefix[1]!}${kept.join(',\n')};`, dropped };
}

/**
 * Dobra `ALTER TYPE … ADD VALUE` dentro do `CREATE TYPE` correspondente.
 *
 * No histórico, `Role` nasce com `('ADMIN','USER')` e ganha `'SUPERADMIN'` numa
 * migration posterior — dois statements, duas transações. Na baseline os dois cairiam na
 * MESMA transação, e `ALTER TYPE … ADD VALUE` dentro de transação é território de
 * pegadinha do Postgres (o valor novo não pode ser usado antes do commit, exceto se o
 * tipo nasceu na mesma transação — regra que mudou entre versões). Dobrar elimina a
 * questão: o enum nasce completo, e a baseline fica mais legível de brinde.
 */
export function foldEnumValues(statements: SqlStatement[]): {
  statements: SqlStatement[];
  folded: number;
} {
  const creates = new Map<string, SqlStatement>();
  const out: SqlStatement[] = [];
  let folded = 0;

  for (const statement of statements) {
    const create = new RegExp(`^CREATE\\s+TYPE\\s+${IDENT}\\s+AS\\s+ENUM`, 'i').exec(
      statement.code.replace(/\s+/g, ' '),
    );
    if (create) {
      creates.set(create[1]!, statement);
      out.push(statement);
      continue;
    }

    const add = new RegExp(`^ALTER\\s+TYPE\\s+${IDENT}\\s+ADD\\s+VALUE\\s+'([^']+)'`, 'i').exec(
      statement.code.replace(/\s+/g, ' '),
    );
    const target = add ? creates.get(add[1]!) : undefined;
    if (add && target) {
      const close = target.code.lastIndexOf(')');
      target.code = `${target.code.slice(0, close)}, '${add[2]!}'${target.code.slice(close)}`;
      folded += 1;
      continue;
    }

    out.push(statement);
  }

  return { statements: out, folded };
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem
// ─────────────────────────────────────────────────────────────────────────────

function renderStatement(statement: SqlStatement): string {
  const comments = statement.comments.filter((line) => !/^--\s*[A-Za-z]+\s*$/.test(line.trim()));
  const code = statement.code.trim().endsWith(';')
    ? statement.code.trim()
    : `${statement.code.trim()};`;
  return [...comments, code].join('\n');
}

/**
 * Monta a baseline e a grava em `apps/api/prisma/migrations/0_init/migration.sql`,
 * removendo o histórico do boilerplate.
 *
 * Roda **antes do rename** (ver docs/ARCHITECTURE.md): os fragmentos manuais mencionam
 * a role `dontpanic_app` e o motor de rename passa por cima deste arquivo como passa por
 * qualquer outro. Concentrar a baseline num arquivo só é o que faz a substituição do
 * nome da role acontecer em UM lugar em vez de em seis migrations.
 */
export async function buildBaseline(ctx: GeneratorContext): Promise<BaselineResult> {
  const { templateDir, recipe, logger, dryRun } = ctx;
  const warnings: string[] = [];

  const schema = await readPrunedSchema(templateDir);
  const migrationsDir = assertWithin(templateDir, MIGRATIONS_DIR);

  const entries = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    // Ordem lexicográfica = ordem cronológica: os nomes começam com timestamp. É a
    // mesma ordem em que o `migrate deploy` do boilerplate as aplicou, e a única em que
    // os statements de ALTER fazem sentido.
    .sort();

  const collected: SqlStatement[] = [];
  for (const name of entries) {
    if (name === BASELINE_NAME) continue; // idempotência: uma baseline anterior não entra
    const file = join(migrationsDir, name, 'migration.sql');
    if (!(await pathExists(file))) continue;
    collected.push(...splitStatements(await readFile(file, 'utf8')));
  }

  if (collected.length === 0) {
    throw new Error(
      `Nenhum statement lido de ${MIGRATIONS_DIR}. Sem o histórico do boilerplate não há ` +
        'DDL para montar a baseline (ver docs/decisions/0004).',
    );
  }

  const { statements, folded } = foldEnumValues(collected);

  const buckets = new Map<BaselineFragmentId, string[]>(
    BASELINE_FRAGMENT_IDS.map((id) => [id, []]),
  );

  const droppedTables = new Set<string>();
  const droppedEnums = new Set<string>();
  const droppedColumns: { table: string; column: string }[] = [];
  const seenSweeps = new Set<string>();
  let tenantSweep: string | null = null;
  let droppedStatements = 0;

  for (const statement of statements) {
    const { fragment, requires } = classify(statement);

    // Objeto podado? O statement inteiro vai embora — inclusive a FK cujo lado
    // referenciado saiu, que é o caso que, esquecido, faz o `migrate deploy` do usuário
    // falhar na primeira linha com "relation does not exist".
    let skip = false;
    for (const name of requires) {
      const isEnum = schema.enums.has(name);
      const isTable = schema.tables.has(name);
      if (isEnum || isTable) continue;

      skip = true;
      if (fragment === 'enums') droppedEnums.add(name);
      else droppedTables.add(name);
    }
    if (skip) {
      droppedStatements += 1;
      continue;
    }

    if (fragment === 'final-sweep') {
      // Chamada idempotente: uma só de cada, no fim. O histórico chama
      // `apply_tenant_rls()` três vezes (uma por migration que cria tabela), e na
      // baseline uma basta.
      const key = statement.code.replace(/\s+/g, ' ').trim();
      if (seenSweeps.has(key)) continue;
      seenSweeps.add(key);

      // A varredura por `tenantId` é guardada para ser a ÚLTIMA linha do arquivo, e não
      // por estética: é a linha que a disciplina do boilerplate manda repetir no fim de
      // toda migration que cria tabela. Quem abrir o `0_init` para acrescentar algo vai
      // acrescentar antes dela, que é onde a linha nova precisa estar para ser
      // alcançada pela varredura. As outras varreduras (tabelas que isolam pelo dono,
      // não por `tenantId`) não têm essa propriedade e ficam onde estavam.
      if (/apply_tenant_rls/i.test(key)) {
        tenantSweep = renderStatement(statement);
        continue;
      }

      buckets.get('final-sweep')!.push(renderStatement(statement));
      continue;
    }

    const table = requires[0];
    const model = table ? schema.tables.get(table) : undefined;

    if (fragment === 'tables') {
      const filtered = filterTableColumns(statement.code, model);
      for (const column of filtered.dropped) droppedColumns.push({ table: table!, column });
      buckets.get('tables')!.push(renderStatement({ ...statement, code: filtered.code }));
      continue;
    }

    if (fragment === 'alters') {
      const filtered = filterAlterClauses(statement.code, model);
      for (const column of filtered.dropped) droppedColumns.push({ table: table!, column });
      if (filtered.code === null) {
        droppedStatements += 1;
        continue;
      }
      buckets.get('alters')!.push(renderStatement({ ...statement, code: filtered.code }));
      continue;
    }

    if (fragment === 'indexes' || fragment === 'constraints') {
      // Índice ou FK sobre coluna que saiu não tem como sobreviver.
      const missing = model
        ? requiredColumns(statement.code).filter((column) => !model.fields.has(column))
        : [];
      if (missing.length > 0) {
        droppedStatements += 1;
        continue;
      }
    }

    buckets.get(fragment)!.push(renderStatement(statement));
  }

  if (tenantSweep) buckets.get('final-sweep')!.push(tenantSweep);

  // O RLS NUNCA sai, nem com `--no-multi-tenant`: single-tenant esconde a UI de troca
  // de empresa e semeia um tenant fixo, e o Postgres continua sendo a garantia (ADR
  // 0002). Arrancar as políticas manteria duas versões de todo acesso a dados, e a sem
  // RLS é justamente a que não podemos provar segura.
  if (buckets.get('rls')!.length === 0) {
    warnings.push(
      'A baseline saiu SEM o SQL de Row Level Security. Isso não deveria acontecer: ' +
        'o RLS é mantido em toda receita (ADR 0002). Verifique se as migrations manuais ' +
        'do boilerplate continuam no template.',
    );
  }
  if (buckets.get('app-role')!.length === 0) {
    warnings.push(
      'A baseline saiu SEM a criação da role restrita. A API conectaria como dono do ' +
        'banco, e aí o RLS não vale nada — a API recusa subir em produção justamente ' +
        'por isso (PrismaService.assertNotSuperuser).',
    );
  }

  if (!recipe.features.multiTenant) {
    logger.debug(
      'multiTenant desligado: o RLS foi mantido na baseline de propósito (ADR 0002); ' +
        'o que muda é o seed, que cria um tenant fixo.',
    );
  }

  const fragments = BASELINE_FRAGMENT_IDS.map((id) => ({
    id,
    statements: buckets.get(id)!.length,
  }));

  const sql = renderBaseline(ctx, buckets, { folded, droppedStatements });
  const relPath = `${MIGRATIONS_DIR}/${BASELINE_NAME}/migration.sql`;

  if (!dryRun) {
    for (const name of entries) {
      if (name === BASELINE_NAME) continue;
      await rm(join(migrationsDir, name), { recursive: true, force: true });
    }
    await mkdir(join(migrationsDir, BASELINE_NAME), { recursive: true });
    await writeText(assertWithin(templateDir, relPath), sql);

    // O `migration_lock.toml` tem de sobreviver: sem ele o Prisma pergunta o provider e
    // trata a troca como reset do histórico.
    const lock = assertWithin(templateDir, `${MIGRATIONS_DIR}/${LOCK_FILE}`);
    if (!(await pathExists(lock))) {
      await writeText(
        lock,
        ['# Please do not edit this file manually', 'provider = "postgresql"', ''].join('\n'),
      );
    }
  }

  return {
    relPath,
    sql,
    fragments,
    removedMigrations: entries.filter((name) => name !== BASELINE_NAME),
    droppedTables: [...droppedTables].sort(),
    droppedEnums: [...droppedEnums].sort(),
    droppedColumns,
    droppedStatements,
    rlsRetained: buckets.get('rls')!.length > 0,
    warnings,
  };
}

function renderBaseline(
  ctx: GeneratorContext,
  buckets: Map<BaselineFragmentId, string[]>,
  stats: { folded: number; droppedStatements: number },
): string {
  const { names } = ctx;
  const rule = '═'.repeat(75);
  const lines: string[] = [
    `-- ${rule}`,
    `-- ${names.human} — baseline do schema.`,
    '--',
    '-- Migration única, montada na geração do projeto a partir do SQL do boilerplate,',
    '-- já sem as features que esta receita não pediu. O histórico do boilerplate não',
    '-- veio: um projeto que nunca teve uma feature não deve ter no histórico a migration',
    '-- que a criou — e, pior, o Prisma compararia esse estado final com o schema podado',
    '-- e ofereceria um DROP para desfazer o que a própria baseline fez.',
    '--',
    '-- A ordem dos blocos é de dependência, não estética. Em especial: os GRANTs da role',
    '-- restrita vêm DEPOIS das tabelas, porque `GRANT … ON ALL TABLES IN SCHEMA public`',
    '-- só alcança o que já existe; e a varredura de RLS fecha o arquivo, para que nenhuma',
    '-- tabela criada acima fique fora do isolamento.',
    '--',
    '-- Ao criar tabela nova numa migration futura, termine com `SELECT',
    '-- app.apply_tenant_rls();` — é o que impede uma tabela nova de ficar de fora do',
    '-- isolamento por esquecimento.',
    `-- ${rule}`,
  ];

  for (const id of BASELINE_FRAGMENT_IDS) {
    const statements = buckets.get(id)!;
    if (statements.length === 0) continue;
    lines.push('');
    lines.push(`-- ${'─'.repeat(73)}`);
    lines.push(`-- ${FRAGMENT_TITLES[id]}`);
    lines.push(`-- ${'─'.repeat(73)}`);
    for (const statement of statements) {
      lines.push('');
      lines.push(statement);
    }
  }

  void stats;
  lines.push('');
  return lines.join('\n');
}
