/**
 * Motor de rename — a transformação que troca "DontPanic" pelo nome do usuário.
 *
 * Especificação: `docs/maps/rename-surface.md`. Os números citados aqui (490 ocorrências
 * em 199 arquivos, 203 delas só de escopo pnpm) vêm de lá, medidos no commit `4b32926`
 * do repo `dontpanic`.
 *
 * Três decisões estruturais, todas contra o mesmo inimigo — a falha SILENCIOSA:
 *
 * 1. **Lista ORDENADA por especificidade, não alfabética.** Os tokens se contêm:
 *    `dontpanic_app` contém `dontpanic`, `@dontpanic/shared` contém `dontpanic`,
 *    `create-dontpanic` contém `dontpanic`. Substituir o curto primeiro produz
 *    `acme-corp_app` — que parece certo, não dá erro, e faz o Postgres recusar a role
 *    (hífen é ilegal em identificador unquoted) OU criar uma role que ninguém usa. O
 *    sintoma não é exceção: é RLS devolvendo zero linhas. `ORDERED_RENAME_RULES` é a
 *    ordem, e `test/rename.test.ts` a congela.
 *
 * 2. **Uma passada única por arquivo.** N regexes sobre o mesmo texto reintroduzem o
 *    problema de ordem por outra porta: se o slug for `dontpanic-two`, a regra `bare`
 *    produz texto que ela mesma casaria, e a segunda passada devolve `dontpanic-two-two`.
 *    Aqui existe UM `String.replace` com alternação ordenada e um resolvedor por match:
 *    o texto já substituído nunca é reexaminado, porque `replace` avança o cursor.
 *
 * 3. **Regras-guarda.** `create-dontpanic` e `marmottajr/dontpanic` NÃO são renomeados
 *    (§3.4 e §3.5 do mapa: viram um pacote npm que ninguém vai publicar e uma URL de
 *    GitHub que não existe). Mas "não renomear" não pode ser "não casar": se a
 *    alternação as ignorasse, a regra `bare` comeria o `dontpanic` de dentro delas. Elas
 *    são regras de IDENTIDADE — casam, consomem, devolvem o texto intacto — e aparecem
 *    no relatório com a contagem, para que o operador veja o resíduo que o passo de
 *    REMOÇÃO (manifesto de features) tem de ter apagado.
 *
 * O que este módulo NÃO faz, de propósito:
 * - não apaga arquivo nenhum (isso é o manifesto de features);
 * - não escreve `.env` (é o passo de env, que já nasce com o nome novo);
 * - não toca no branding do Guia do Mochileiro — `applyBranding` faz isso, depois, e por
 *   outra razão (ver o cabeçalho daquela seção).
 */

import { randomInt } from 'node:crypto';
import { basename, dirname, join } from 'node:path';

import type { GeneratorContext, NameForms } from './types.ts';
import {
  NEVER_REWRITE,
  NEVER_TRAVERSE_REL_PATHS,
  assertWithin,
  isBinaryFile,
  listFiles,
  movePath,
  readText,
  writeText,
} from './util/fs.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Identidade das regras
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma classe de ocorrência do mapa. O relatório conta por ID, e é isso que permite ao
 * CI de conformidade detectar regressão de COSTURA em vez de só de resultado: quando a
 * classe `pnpmFilter` casa 0 vezes, ou alguém apagou os `--filter` dos Dockerfiles, ou
 * o template mudou de forma e o rename deixou de cobri-los. Nos dois casos o projeto
 * gerado ainda "passa" no grep-zero e quebra no primeiro `docker build`.
 */
export const RENAME_RULE_IDS = [
  'guard:createPkg',
  'guard:upstreamRepo',
  'seedPassword',
  'pnpmFilter',
  'postgresDsn',
  'postgresEnv',
  'pgIsready',
  's3Bucket',
  'appleServiceId',
  'npmScope',
  'dbRole',
  'dbNameE2e',
  'domain',
  'dockerName',
  'pascal',
  'camel',
  'bare',
] as const;

export type RenameRuleId = (typeof RENAME_RULE_IDS)[number];

/** O que o resolvedor de uma regra recebe. */
export interface RuleMatch {
  /** Texto casado, inteiro. */
  readonly text: string;
  /**
   * Grupo nomeado DESTA regra.
   *
   * O compilador prefixa os nomes (`dsnHost` → `g4_dsnHost`) antes de juntar as
   * alternativas, porque nome de grupo é único no regex inteiro: sem o prefixo, duas
   * regras não poderiam chamar o próprio grupo de `prefix`, e a tabela ficaria com
   * nomes defensivos em vez de nomes que se leem.
   */
  group(name: string): string | undefined;
}

export interface RenameRuntime {
  names: NameForms;
  /** A senha do seed desta execução. Ver `generateSeedPassword`. */
  seedPassword: string;
}

interface RenameRule {
  id: RenameRuleId;
  /** Classe correspondente no mapa (`docs/maps/rename-surface.md` §1.2). */
  mapClass: string;
  /** Por que esta regra existe ANTES das seguintes, ou por que existe separada. */
  why: string;
  /** Fonte de regex. Só grupos NOMEADOS — grupo numerado quebraria a junção. */
  pattern: string;
  resolve(match: RuleMatch, rt: RenameRuntime): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// A lista ordenada. A ORDEM É A ESPECIFICAÇÃO.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Por que a ordem funciona, e não é só convenção: `String.replace` com um regex `g`
 * casa **leftmost-first** — na posição mais à esquerda possível e, ali, a PRIMEIRA
 * alternativa que casar. Então basta que a alternativa mais específica venha antes da
 * mais geral **quando as duas começam no mesmo caractere**. Quando a mais específica
 * começa antes (`@dontpanic/` começa no `@`, um caractere antes do `d`), o leftmost já
 * resolve sozinho — mas listar por especificidade de todo jeito torna a garantia
 * independente de raciocínio sobre posição, que é o tipo de raciocínio que erra.
 */
const ORDERED_RENAME_RULES: readonly RenameRule[] = [
  // ── Guardas (identidade). Primeiras porque contêm `dontpanic` e nada deve comê-lo.
  {
    id: 'guard:createPkg',
    mapClass: 'C5',
    why:
      'O pacote `create-dontpanic` é o GERADOR, não o produto. Renomear para ' +
      '`create-acme` cria um pacote npm que o usuário nunca vai publicar e um workflow ' +
      'que falha em cada tag `v*` (mapa §3.5). A remoção é do manifesto; aqui só ' +
      'protegemos o token da regra `bare`, que o transformaria em `create-acme` sem ' +
      'ninguém ter decidido isso.',
    pattern: 'create-dontpanic',
    resolve: (m) => m.text,
  },
  {
    id: 'guard:upstreamRepo',
    mapClass: 'C15',
    why:
      'É a URL do repositório de origem. `github.com/marmottajr/acme` é uma URL que não ' +
      'existe — pior que a antiga, porque a antiga ao menos abre (mapa §3.4). Fica ' +
      'intacta; `verifyRename` a reporta como exceção declarada, não como sucesso.',
    pattern: 'marmottajr/dontpanic',
    resolve: (m) => m.text,
  },

  // ── Rotação (não é rename).
  {
    id: 'seedPassword',
    mapClass: 'C14',
    why:
      'Antes de `DontPanic`, senão sobra `AcmeCorp42!`. E não é rename: é ROTAÇÃO. ' +
      '`AcmeCorp42!` é derivável do nome do projeto, que é público — qualquer um que ' +
      'saiba que o projeto veio do DontPanic adivinha a senha do admin do seed. Ver ' +
      '`generateSeedPassword`.',
    pattern: 'DontPanic42!',
    resolve: (_m, rt) => rt.seedPassword,
  },

  // ── Costuras funcionais: o resultado é o mesmo que as regras gerais dariam, mas a
  //    contagem separada é o que prova que a costura continua existindo.
  {
    id: 'pnpmFilter',
    mapClass: 'C1–C4 (funcional)',
    why:
      'A armadilha nº 1 do mapa: `pnpm --filter @dontpanic/shared build` que não casa ' +
      'filtro nenhum imprime um aviso e **sai com código 0**. A build do shared não ' +
      'roda, `packages/shared/dist` não existe, e o erro aparece três passos depois ' +
      'como "Cannot find module". A regra `npmScope` logo abaixo já cobriria o texto; ' +
      'esta existe para o relatório poder PROVAR a cobertura — "classe pnpmFilter casou ' +
      '0 vezes" é sinal de que a costura sumiu do template. Vive em ci.yml:28, ' +
      'release.yml:30, Dockerfile.api:13, Dockerfile.web:10, docker-compose.dev.yml:38.',
    pattern:
      '(?<flag>--filter-prod|--filter|-F)(?<sep>[ =]+)@dontpanic/(?<pkg>[a-z0-9][a-z0-9._-]*)',
    resolve: (m, rt) =>
      `${m.group('flag') ?? ''}${m.group('sep') ?? ' '}@${rt.names.npmScope}/${m.group('pkg') ?? ''}`,
  },
  {
    id: 'postgresDsn',
    mapClass: 'C6+C7+C8 (DSN)',
    why:
      'Uma DSN inteira de uma vez, porque as três partes têm de CONCORDAR e cada uma ' +
      'precisa da forma SQL (snake), não do slug: hífen é ilegal em identificador ' +
      'Postgres unquoted, e `CREATE ROLE acme-corp_app` não compila. `dontpanic_app` ' +
      'como usuário E como senha é o desenho da migration `_app_role` (a senha da role ' +
      'É o nome dela); os dois lados vão para `dbRole`, senão a API autentica contra ' +
      'uma senha que a migration não criou e o sintoma é FATAL na conexão, não no boot.',
    pattern:
      '(?<scheme>postgres(?:ql)?)://(?<user>dontpanic(?:_app)?):(?<pass>dontpanic(?:_app)?)@' +
      '(?<host>[^/\\s\'"`]+)(?<db>/dontpanic(?:_e2e)?)?',
    resolve: (m, rt) => {
      const { names } = rt;
      // `dontpanic_app` é a role restrita; `dontpanic` puro é o dono do banco.
      const ident = (raw: string | undefined): string =>
        raw === 'dontpanic_app' ? names.dbRole : names.dbName;
      const dbPart = m.group('db');
      // Sem `db` capturado quando a DSN interpola uma const (`/${E2E_DB}` em
      // global-setup.ts:33): a const em si é renomeada pela regra `dbNameE2e`.
      const db =
        dbPart === undefined
          ? ''
          : dbPart === '/dontpanic_e2e'
            ? `/${names.dbNameE2e}`
            : `/${names.dbName}`;
      return `${m.group('scheme')}://${ident(m.group('user'))}:${ident(m.group('pass'))}@${m.group('host')}${db}`;
    },
  },
  {
    id: 'postgresEnv',
    mapClass: 'C8 (compose)',
    why:
      '`POSTGRES_USER`/`PASSWORD`/`DB` precisam da forma SQL, igual à DSN — se o ' +
      'compose criasse o banco `acme-corp` e o `DATABASE_ADMIN_URL` pedisse ' +
      '`acme_corp`, a autenticação falharia. E o Postgres só honra estas três variáveis ' +
      'na PRIMEIRA inicialização do volume: errar aqui exige `docker compose down -v` ' +
      'para consertar (mapa §4).',
    pattern: '(?<key>POSTGRES_(?:USER|PASSWORD|DB)\\s*[:=]\\s*)dontpanic(?![a-z0-9_.-])',
    resolve: (m, rt) => `${m.group('key') ?? ''}${rt.names.dbName}`,
  },
  {
    id: 'pgIsready',
    mapClass: 'C8 (healthcheck)',
    why:
      'Par obrigatório com `postgresEnv`: se `pg_isready -U` divergir do ' +
      '`POSTGRES_USER`, o healthcheck NUNCA fica verde e todo ' +
      '`depends_on: condition: service_healthy` trava o `up` para sempre, sem mensagem ' +
      'que aponte para a causa. Regra própria só para o relatório poder mostrar que os ' +
      'dois lados casaram o mesmo número de vezes.',
    pattern: '(?<key>pg_isready\\s+(?:-U|--username[= ])\\s*)dontpanic(?![a-z0-9_.-])',
    resolve: (m, rt) => `${m.group('key') ?? ''}${rt.names.dbName}`,
  },
  {
    id: 's3Bucket',
    mapClass: 'C8 (bucket)',
    why:
      'Outro par: `S3_BUCKET` do `.env` e o `mc mb --ignore-existing local/<bucket>` do ' +
      'compose. Divergir dá `NoSuchBucket` no primeiro upload de avatar — e só ali, ' +
      'semanas depois. Aqui a forma é `bucket` (== slug), NÃO snake: bucket S3 recusa ' +
      'sublinhado, exatamente o oposto do identificador Postgres.',
    pattern: '(?<prefix>S3_BUCKET\\s*[:=]\\s*|local/)dontpanic(?![a-z0-9_.-])',
    resolve: (m, rt) => `${m.group('prefix') ?? ''}${rt.names.bucket}`,
  },

  // ── Tokens compostos, do mais específico ao mais geral.
  {
    id: 'appleServiceId',
    mapClass: 'C16',
    why:
      'Antes de `domain`: `dev.dontpanic.web` não contém `dontpanic.dev` (a ordem dos ' +
      'rótulos é inversa), mas contém `dontpanic`, e sem esta regra a `bare` o ' +
      'transformaria em `dev.acme-corp.web` de todo jeito — o que por acaso é o ' +
      'resultado certo. Explícita para que o Services ID de exemplo da Apple seja uma ' +
      'linha do relatório, não um acidente.',
    pattern: 'dev\\.dontpanic\\.web',
    resolve: (_m, rt) => `dev.${rt.names.slug}.web`,
  },
  {
    id: 'npmScope',
    mapClass: 'C1–C4',
    why:
      'A maior classe (203 ocorrências) e a mais mecânica. Só o ESCOPO muda: ' +
      '`@dontpanic/shared` → `@acme-corp/shared`, porque `shared`/`api`/`web`/`config` ' +
      'são os nomes dos workspaces e não carregam o nome do produto. Renomear o escopo ' +
      'NÃO é edição de config: não existe path alias nem `moduleNameMapper` com o nome ' +
      '(mapa §0.1 itens 4 e 5) — o escopo resolve por symlink do pnpm, então o projeto ' +
      'gerado EXIGE um `pnpm install` novo e o rename tem de vir antes dele.',
    pattern: '@dontpanic/',
    resolve: (_m, rt) => `@${rt.names.npmScope}/`,
  },
  {
    id: 'dbRole',
    mapClass: 'C6',
    why:
      'Antes de `bare`, senão sobra `acme-corp_app` — hífen em identificador Postgres ' +
      'unquoted, que a migration `_app_role` usa sem aspas em 13 statements. O arquivo ' +
      'mais perigoso do repo: substituição parcial deixa a role sem GRANT, ou a API ' +
      'conectando com um nome que não existe, e o sintoma é "zero linhas", não erro ' +
      '(mapa §2.1). A linha 18 tem DUAS ocorrências na mesma linha (o identificador e o ' +
      'literal da senha) — a passada única as pega juntas.',
    pattern: 'dontpanic_app',
    resolve: (_m, rt) => rt.names.dbRole,
  },
  {
    id: 'dbNameE2e',
    mapClass: 'C7',
    why:
      'Antes de `bare`, mesma razão. `global-setup.ts:46` interpola esta const direto ' +
      'em `CREATE DATABASE ${E2E_DB}`, sem quoting: um hífen ali é erro de sintaxe SQL ' +
      'no primeiro `pnpm test:e2e`.',
    pattern: 'dontpanic_e2e',
    resolve: (_m, rt) => rt.names.dbNameE2e,
  },
  {
    id: 'domain',
    mapClass: 'C9',
    why:
      'Antes de `bare` para que `admin@dontpanic.dev` vire `admin@acme-corp.dev` e não ' +
      '`admin@acme-corp.dev` por dois caminhos diferentes (o segundo `.dev` sobreviveria ' +
      'de qualquer forma, mas a contagem por classe deixaria de existir).',
    pattern: 'dontpanic\\.dev',
    resolve: (_m, rt) => rt.names.domain,
  },
  {
    id: 'dockerName',
    mapClass: 'C10 + C18 + C19',
    why:
      'Prefixo de `container_name`, de tag de imagem e de nome de arquivo de download ' +
      '(`dontpanic-backup-codes.txt`). Resultado idêntico ao da regra `bare`; existe ' +
      'para o relatório poder conferir os 8 `container_name` de uma vez, porque Docker ' +
      'exige `container_name` único POR DAEMON: renomear metade deixa ' +
      '`Conflict. The container name "/dontpanic-postgres" is already in use` contra ' +
      'outro projeto gerado na mesma máquina.',
    pattern: 'dontpanic-',
    resolve: (_m, rt) => `${rt.names.slug}-`,
  },

  // ── As três formas de caixa. Literais mutuamente exclusivos: a ordem entre elas não
  //    muda resultado, mas seguir a mesma disciplina evita que a próxima pessoa suponha
  //    que aqui a ordem é livre e mova algo acima.
  {
    id: 'pascal',
    mapClass: 'C11',
    why:
      '`pascal` e NÃO `human`. `DontPanic` é a forma fechada, sem espaço e sem ' +
      'apóstrofo, do nome do produto — e é por isso que ela aparece em ' +
      '`TOTP_ISSUER=DontPanic`, em `MAIL_FROM="DontPanic <…>"`, no `"appName"` do i18n e ' +
      'no `"display"` do tsconfig. Injetar `human` ali exigiria escapar o texto do ' +
      'usuário em cinco gramáticas ao mesmo tempo (literal TS de aspas simples, string ' +
      'JSON, valor YAML, valor de `.env` sem quoting, atributo HTML de template de ' +
      'e-mail) — e o caso que quebra é exatamente o nome ATUAL do projeto: ' +
      '`TOTP_ISSUER: z.string().default(\'Bob\'s Diner\')` não compila. `pascal` é ' +
      'alfanumérico por construção e não precisa de escape em nenhum dos cinco.',
    pattern: 'DontPanic',
    resolve: (_m, rt) => rt.names.pascal,
  },
  {
    id: 'camel',
    mapClass: 'C17',
    why:
      'A chave i18n `common.dontPanic`, presente nas duas locales. O call site ' +
      '(`t(\'dontPanic\')`) e a chave são o MESMO literal, então a passada única renomeia ' +
      'os dois lados e a paridade de chaves de `apps/web/src/i18n/messages.test.ts` ' +
      'continua valendo — remover de um lado só é o que faz aquele teste falhar.',
    pattern: 'dontPanic',
    resolve: (_m, rt) => rt.names.camel,
  },
  {
    id: 'bare',
    mapClass: 'C8 + C20',
    why:
      'Por último, sempre. Cobre o que sobrou: nome npm da raiz, bucket, ' +
      '`QUEUE_NAME`/`QUEUE_PREFIX`, slug do tenant do seed, path do `S3_PUBLIC_URL`. ' +
      'Forma `slug` (com hífen) e não snake, porque todos esses destinos aceitam hífen e ' +
      'metade deles RECUSA sublinhado (bucket S3). Deliberadamente SEM ' +
      'word-boundary à direita: num token desconhecido como `dontpanicdb` preferimos ' +
      'produzir `acme-corpdb` a deixar o nome antigo passar — `verifyRename` é o ' +
      'backstop para o texto estranho, e não há backstop para o nome que ficou.',
    pattern: 'dontpanic',
    resolve: (_m, rt) => rt.names.slug,
  },
];

/** A ordem, exposta para o teste poder congelá-la. */
export const RENAME_RULE_ORDER: readonly RenameRuleId[] = ORDERED_RENAME_RULES.map((r) => r.id);

/** A justificativa de cada regra, para o `--explain` do CLI e para o relatório. */
export function describeRenameRules(): { id: RenameRuleId; mapClass: string; why: string }[] {
  return ORDERED_RENAME_RULES.map(({ id, mapClass, why }) => ({ id, mapClass, why }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Compilação da alternação
// ─────────────────────────────────────────────────────────────────────────────

const NAMED_GROUP_OPEN = /\(\?<([A-Za-z][A-Za-z0-9]*)>/g;

interface CompiledRules<R> {
  regex: RegExp;
  rules: readonly R[];
}

/**
 * Junta as regras numa alternação única, preservando a ordem.
 *
 * Cada alternativa ganha um grupo-envelope `rN` — é como o resolvedor descobre QUAL
 * regra casou, sem reexecutar regex nenhum. E os grupos internos são prefixados
 * (`g4_host`), porque nome de grupo é único no regex inteiro: sem prefixar, duas regras
 * não poderiam ambas chamar seu grupo de `prefix`, e a tabela de regras passaria a
 * carregar nomes defensivos em vez de nomes legíveis.
 */
function compileRules<R extends { pattern: string }>(rules: readonly R[], flags: string): CompiledRules<R> {
  const parts = rules.map((rule, index) => {
    if (rule.pattern.includes('\\k<')) {
      throw new Error(
        `Regra ${index} usa backreference nomeada, que o prefixamento de grupos quebraria.`,
      );
    }
    if (/\((?!\?)/.test(rule.pattern)) {
      throw new Error(
        `Regra ${index} usa grupo NUMERADO. A junção renumeraria os grupos de todas as ` +
          `regras seguintes. Use grupo nomeado: (?<nome>…).`,
      );
    }
    const namespaced = rule.pattern.replace(NAMED_GROUP_OPEN, (_all, name: string) => `(?<g${index}_${name}>`);
    return `(?<r${index}>${namespaced})`;
  });
  return { regex: new RegExp(parts.join('|'), flags), rules };
}

/**
 * Aplica a alternação numa passada única.
 *
 * O `replace` avança o cursor para depois do texto substituído, então NADA que este
 * motor escreve é reexaminado. É essa propriedade — e não a ordem das regras — que
 * impede o encadeamento: com o slug `dontpanic-two`, a regra `bare` produz texto que ela
 * mesma casaria, e num motor de N passadas o resultado seria `dontpanic-two-two`.
 */
function transform<R extends { pattern: string }>(
  text: string,
  compiled: CompiledRules<R>,
  resolve: (rule: R, match: RuleMatch) => string,
  onHit: (rule: R) => void,
): string {
  return text.replace(compiled.regex, (...args: unknown[]) => {
    const whole = args[0] as string;
    const last = args[args.length - 1];
    const groups = (typeof last === 'object' && last !== null ? last : {}) as Record<
      string,
      string | undefined
    >;
    for (let index = 0; index < compiled.rules.length; index += 1) {
      if (groups[`r${index}`] === undefined) continue;
      const rule = compiled.rules[index];
      if (rule === undefined) break;
      onHit(rule);
      return resolve(rule, {
        text: whole,
        group: (name) => groups[`g${index}_${name}`],
      });
    }
    // Inalcançável: toda alternativa tem seu envelope `rN`. Devolver o original é a
    // degradação certa se algum dia for alcançável — deixa o nome antigo para
    // `verifyRename` reclamar, em vez de apagar texto.
    return whole;
  });
}

const COMPILED_RENAME = compileRules(ORDERED_RENAME_RULES, 'g');

/**
 * Aplica o rename num pedaço de texto. Exportada porque é o que o teste de ORDEM
 * exercita sem tocar em disco, e porque o passo de docs a reusa em texto que não veio
 * de arquivo.
 */
export function renameText(
  text: string,
  rt: RenameRuntime,
  onHit: (id: RenameRuleId) => void = () => {},
): string {
  return transform(
    text,
    COMPILED_RENAME,
    (rule, match) => rule.resolve(match, rt),
    (rule) => onHit(rule.id),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A senha do seed — rotação, não rename
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Alfabeto alfanumérico, sem os caracteres que se confundem (`l`/`I`/`1`, `O`/`0`).
 *
 * **Só alfanumérico, e isso é decisão, não descuido.** A mesma senha literal aparece em
 * `apps/api/prisma/seed.ts` (string TS de aspas simples), em duas células de tabela do
 * `README.md`, no `PENDENCIAS.template.md` e é digitada num formulário de login e,
 * eventualmente, colada num `psql`. Uma pontuação qualquer ali exigiria estar certo
 * sobre escaping em quatro gramáticas; comprimento é mais barato que isso. 20
 * caracteres deste alfabeto valem ~115 bits, muito acima do que um `!` no fim
 * acrescenta.
 *
 * `passwordSchema` do projeto gerado exige ≥8, ≤128, e ao menos uma minúscula, uma
 * maiúscula e um dígito — garantidos por construção abaixo, não por sorteio.
 */
const SEED_PASSWORD_LOWER = 'abcdefghijkmnopqrstuvwxyz';
const SEED_PASSWORD_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const SEED_PASSWORD_DIGIT = '23456789';
const SEED_PASSWORD_ALPHABET = SEED_PASSWORD_LOWER + SEED_PASSWORD_UPPER + SEED_PASSWORD_DIGIT;
const SEED_PASSWORD_LENGTH = 20;

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] ?? alphabet[0] ?? 'x';
}

/**
 * Gera a senha do admin do seed.
 *
 * `DontPanic42!` não é um nome, é uma CREDENCIAL (mapa §3.2). Renomeá-la produziria
 * `AcmeCorp42!` — derivável do nome do projeto, que é público —, e o admin do seed é um
 * ADMIN de verdade no banco de dev. Então rotaciona: valor novo a cada execução,
 * devolvido no resultado para o CLI mostrar nos próximos passos. É a ÚNICA vez que ela
 * aparece; o projeto gerado guarda só o hash Argon2.
 *
 * `randomInt` e não `Math.random()`: CSPRNG, e sem viés de módulo.
 */
export function generateSeedPassword(length: number = SEED_PASSWORD_LENGTH): string {
  const size = Math.max(12, length);
  // Uma de cada classe exigida primeiro, o resto livre, e embaralha: garantir por
  // construção evita o laço "gera e testa", que numa má sorte improvável não termina.
  const chars = [pick(SEED_PASSWORD_LOWER), pick(SEED_PASSWORD_UPPER), pick(SEED_PASSWORD_DIGIT)];
  while (chars.length < size) chars.push(pick(SEED_PASSWORD_ALPHABET));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i] as string;
    const b = chars[j] as string;
    chars[i] = b;
    chars[j] = a;
  }
  return chars.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultado
// ─────────────────────────────────────────────────────────────────────────────

export interface RenameRuleCount {
  id: RenameRuleId;
  mapClass: string;
  /** Quantas substituições. */
  occurrences: number;
  /** Em quantos arquivos (conteúdo + caminho). */
  files: number;
}

export interface RenamedPath {
  /** Caminho relativo antes. */
  from: string;
  /** Caminho relativo depois. */
  to: string;
}

export interface RenameResult {
  filesScanned: number;
  filesRewritten: number;
  /** Substituições de conteúdo + de caminho. */
  replacements: number;
  byRule: RenameRuleCount[];
  pathsRenamed: RenamedPath[];
  skippedBinary: number;
  skippedNeverRewrite: number;
  /**
   * A senha do seed desta execução. O CLI a mostra nos próximos passos — e é a única
   * vez que ela existe em texto claro fora do `seed.ts` gerado.
   */
  seedPassword: string;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// applyRename
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renomeia conteúdo e caminhos em todo o projeto gerado.
 *
 * Roda DEPOIS da remoção de features e da poda do Prisma (ver `docs/ARCHITECTURE.md`):
 * os padrões âncora do manifesto são escritos contra o repo original, e depois do rename
 * `@dontpanic/shared` já não existe para casar. E roda ANTES do `pnpm install`, senão os
 * symlinks de `node_modules/@dontpanic/*` nascem com o nome velho e todo import falha
 * com `MODULE_NOT_FOUND` (mapa §4).
 */
export async function applyRename(ctx: GeneratorContext): Promise<RenameResult> {
  const { targetDir, names, logger, dryRun } = ctx;
  const rt: RenameRuntime = { names, seedPassword: generateSeedPassword() };

  const counts = new Map<RenameRuleId, { occurrences: number; files: Set<string> }>();
  const bump = (id: RenameRuleId, file: string): void => {
    let entry = counts.get(id);
    if (entry === undefined) {
      entry = { occurrences: 0, files: new Set<string>() };
      counts.set(id, entry);
    }
    entry.occurrences += 1;
    entry.files.add(file);
  };

  const warnings: string[] = [];
  let filesScanned = 0;
  let filesRewritten = 0;
  let skippedBinary = 0;
  let skippedNeverRewrite = 0;

  logger.step('Renomeando conteúdo');

  // ── Fase 1: conteúdo.
  const files = await listFiles(targetDir, { skipRelPaths: NEVER_TRAVERSE_REL_PATHS });
  for (const entry of files) {
    const name = basename(entry.path);

    if (NEVER_REWRITE.has(name)) {
      skippedNeverRewrite += 1;
      logger.debug(`rename: pulando ${entry.rel} (NEVER_REWRITE)`);
      continue;
    }
    if (await isBinaryFile(entry.path)) {
      skippedBinary += 1;
      continue;
    }

    filesScanned += 1;
    const before = await readText(entry.path);
    const after = renameText(before, rt, (id) => bump(id, entry.rel));
    if (after === before) continue;

    filesRewritten += 1;
    if (!dryRun) await writeText(assertWithin(targetDir, entry.path), after);
  }

  // ── Fase 2: caminhos.
  //
  // Separada e do MAIS PROFUNDO para o mais raso. Renomear um diretório invalida todo
  // caminho coletado abaixo dele; indo de baixo para cima, os ancestrais de quem já foi
  // movido continuam válidos, porque ainda não mudaram de nome. A alternativa — recoletar
  // a árvore a cada movimento — é correta e O(n²).
  logger.step('Renomeando caminhos');
  const pathsRenamed: RenamedPath[] = [];
  const entries = await listFiles(targetDir, {
    includeDirs: true,
    skipRelPaths: NEVER_TRAVERSE_REL_PATHS,
  });
  const deepestFirst = [...entries].sort((a, b) => depthOf(b.rel) - depthOf(a.rel));

  for (const entry of deepestFirst) {
    const name = basename(entry.rel);
    const hits: RenameRuleId[] = [];
    const renamed = renameText(name, rt, (id) => hits.push(id));
    if (renamed === name) continue;

    // O caminho pode ter mudado de lugar porque um ANCESTRAL já foi renomeado — mas
    // ancestrais são processados depois (mais rasos), então `entry.rel` ainda vale.
    const from = join(targetDir, entry.rel);
    const to = join(dirname(from), renamed);
    assertWithin(targetDir, to);
    if (!dryRun) await movePath(from, to);

    for (const id of hits) bump(id, entry.rel);
    pathsRenamed.push({
      from: entry.rel,
      to: [...entry.rel.split('/').slice(0, -1), renamed].join('/'),
    });
  }

  // ── Relatório por classe. Toda regra aparece, inclusive com zero: é a linha zerada
  //    que denuncia costura desaparecida, e uma classe ausente do relatório não denuncia
  //    nada.
  const byRule: RenameRuleCount[] = ORDERED_RENAME_RULES.map((rule) => {
    const hit = counts.get(rule.id);
    return {
      id: rule.id,
      mapClass: rule.mapClass,
      occurrences: hit?.occurrences ?? 0,
      files: hit?.files.size ?? 0,
    };
  });

  const guards = byRule.filter((r) => r.id.startsWith('guard:') && r.occurrences > 0);
  for (const guard of guards) {
    warnings.push(
      `${guard.occurrences} ocorrência(s) de "${guard.id}" preservadas de propósito em ` +
        `${guard.files} arquivo(s): não são o nome do produto e não têm substituto válido ` +
        `(um pacote npm que ninguém vai publicar, uma URL de GitHub que não existe). ` +
        `Quem decide o destino de cada uma é o passo de REMOÇÃO, para o pacote do ` +
        `gerador, e a lista de exceções de \`verifyRename\`, para a atribuição ao repo de ` +
        `origem — este passo só as protegeu de serem renomeadas por acidente.`,
    );
  }

  const replacements = byRule.reduce((sum, r) => sum + r.occurrences, 0);
  logger.info(`Rename: ${replacements} substituições em ${filesRewritten} arquivos`);

  return {
    filesScanned,
    filesRewritten,
    replacements,
    byRule,
    pathsRenamed,
    skippedBinary,
    skippedNeverRewrite,
    seedPassword: rt.seedPassword,
    warnings,
  };
}

function depthOf(rel: string): number {
  return rel.split('/').length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branding — o Guia do Mochileiro é outro problema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * "Don't Panic" NÃO é o nome do projeto: é a capa do Guia, uma piada que atravessa
 * contrato de API, i18n, e-mails, testes e comentários de CSS. Substituí-la pelo nome do
 * usuário produz frases absurdas — `"Logged out. Acme Corp — your session is gone."` — e
 * é por isso que ela não está em `ORDERED_RENAME_RULES`.
 *
 * A feature `easterEggs` decide:
 *
 * - **ligada** → nada a fazer aqui. As frases sobrevivem de propósito; o que havia de
 *   nome de produto DENTRO delas (`DontPanic · 42`) já foi trocado pela regra `pascal`.
 *   `verifyRename` precisa saber disso e não reclamar da frase (`keepEasterEggs`).
 * - **desligada** → as frases viram texto neutro, SEM quebrar contrato.
 *
 * **A decisão de contrato, e por quê.** `packages/shared/src/common.ts:30` declara
 * `marvin?: string` em `ApiErrorBody`, e o campo é preenchido pelo filtro global, lido
 * por `apps/web/src/app/error.tsx` e `not-found.tsx` via `t('marvin')`, e asserido por
 * `all-exceptions.filter.spec.ts` e por dois e2e. **O campo e as chaves i18n FICAM; só o
 * texto muda.** Razões:
 *
 * 1. O campo é OPCIONAL. Um campo opcional preenchido com um texto neutro é inerte —
 *    ninguém quebra. Removê-lo obriga a editar seis arquivos, dois deles e2e com
 *    asserção de string exata: precisamente a costura que o ADR 0001 diz que apodrece.
 * 2. `all-exceptions.filter.spec.ts` assere `body.marvin === marvinQuip(418)`, o que é
 *    ESTRUTURAL. Trocar o texto de `marvinQuip` mantém o teste verde; apagar a função
 *    quebra o import.
 * 3. Remover a chave `marvin` do i18n faria `t('marvin')` lançar em runtime, e remover
 *    de uma locale só faria `apps/web/src/i18n/messages.test.ts` (paridade de chaves)
 *    falhar. Neutralizar o VALOR é simétrico por construção.
 *
 * Consequência aceita e documentada: com os easter eggs desligados, `<p>{t('marvin')}</p>`
 * renderiza um parágrafo vazio nas páginas de erro até que a costura da feature
 * `easterEggs` remova o elemento. É defeito cosmético, não de contrato — e o inverso
 * (contrato quebrado, typecheck vermelho) não é aceitável em nenhuma configuração.
 *
 * **O limite deste passo:** ele neutraliza TEXTO. Apagar artefatos que só existem pela
 * piada — `easter-eggs.tsx`, `brand.tsx`, o bloco `easter` do i18n, a rota
 * `GET /teapot` — é remoção de arquivo/bloco e pertence ao `deletePaths`/`seams` do
 * manifesto da feature `easterEggs`. Se o manifesto não rodar, esses arquivos
 * sobrevivem já neutralizados, o que é degradação segura.
 */

/**
 * As formas em que o apóstrofo aparece, cada uma **byte-distinta** e cada uma com regra
 * (e contador) próprios.
 *
 * O mapa documentou duas (46 retas + 7 tipográficas U+2019). Auditando as páginas de
 * erro do web encontrei uma **terceira que o mapa não vê**: `Don&apos;t Panic.` em
 * `apps/web/src/app/error.tsx:30` e `global-error.tsx:28`, mais 3 em stories — JSX não
 * aceita apóstrofo cru em texto, então o ESLint (`react/no-unescaped-entities`) força a
 * entidade. São 5 ocorrências que o grep de conformidade do mapa
 * (`don.t[[:space:]]panic`, um único caractere entre `don` e `t`) **não casa**, e que um
 * `sed` sobre as duas primeiras formas deixaria para trás na página que o usuário vê
 * quando algo quebra.
 *
 * Mesma história do separador: `DON'T&nbsp;PANIC` nos templates de e-mail e
 * `Don't%20Panic` no badge do README.
 */
const APOSTROPHE_FORMS = [
  { id: 'straight', source: "'" }, // U+0027
  { id: 'curly', source: '’' }, // U+2019 — tipográfico
  { id: 'entity', source: '&apos;' }, // JSX / HTML
  { id: 'entityNumeric', source: '&#39;' },
  { id: 'entityCurly', source: '&rsquo;' },
] as const;

/**
 * Espaço em qualquer roupa: literal, NBSP, entidade e percent-encoding.
 *
 * `&nbsp;` porque `DON'T&nbsp;PANIC` está nos dois templates de e-mail (o `&nbsp;`
 * existe para o wordmark não quebrar linha no Outlook); `%20` porque o badge do
 * `README.md:19` carrega a frase dentro de uma URL do shields.io. Nenhum dos dois casa
 * com `[[:space:]]`, e é por isso que o grep de conformidade do mapa não os viu.
 *
 * `{S}` exige pelo menos um; `{S?}` aceita zero. Placeholder separado porque
 * `{S}?` seria `(?:…)+?` — um "um-ou-mais preguiçoso", não um "zero-ou-mais" — e o
 * erro é invisível: o regex compila e casa quase sempre.
 *
 * **Horizontal apenas** (`[^\S\r\n]`, não `\s`): uma frase-título nunca atravessa linha,
 * e um separador que engole `\n` GRUDA duas linhas de código. O caso real é
 * `Don&apos;t Panic.` sozinho numa linha de JSX: com `\s`, a regra de sentença consumia
 * o fim de linha e juntava o `<p>` seguinte na mesma linha.
 */
const BRAND_SPACE_ONE = '(?:[^\\S\\r\\n]|&nbsp;|%20|\\u00a0)+';
const BRAND_SPACE_ANY = '(?:[^\\S\\r\\n]|&nbsp;|%20|\\u00a0)*';

/**
 * Assinatura única para todos os `replace`: recebe o grupo `next` (a letra seguinte,
 * quando a regra a captura) e devolve o texto neutro. Uniforme porque a tabela é `as
 * const` e chamar uma UNIÃO de assinaturas diferentes exigiria a interseção dos
 * parâmetros — ou seja, nenhum argumento.
 */
type BrandReplace = (next: string | undefined) => string;

const capitalizeNext: BrandReplace = (next) => (next === undefined ? '' : next.toUpperCase());
const drop: BrandReplace = () => '';
const keepPeriod: BrandReplace = () => '.';

const BRAND_RULE_BASES: readonly { id: string; why: string; pattern: string; replace: BrandReplace }[] = [
  {
    id: 'justFixThese',
    why:
      'Primeira porque é a única ocorrência FUNCIONAL: `env.ts:240,244,280` monta a ' +
      'mensagem que o operador lê quando o boot falha por variável de ambiente. ' +
      'Apagar a frase inteira deixaria "Invalid environment variables." sem o ' +
      'imperativo; troca por um que serve.',
    // `{A}` = apóstrofo, `{S}` = espaço (≥1), `{S?}` = espaço (≥0).
    pattern: 'Don{A}t{S}Panic,{S}just fix these:',
    replace: () => 'Fix these:',
  },
  {
    id: 'butClause',
    why:
      'Antes das de sentença: `"I\'m a teapot. I can\'t brew coffee, but Don\'t Panic."` ' +
      'precisa perder a oração inteira, não só a frase — senão sobra ' +
      '"…coffee, but ." Casa a vírgula e a conjunção junto.',
    pattern: ',?{S}but{S}Don{A}t{S}Panic\\.',
    replace: keepPeriod,
  },
  {
    id: 'leadingSentence',
    why:
      'A frase abrindo o texto, com algo depois: `"Don\'t Panic. We\'re already on it."` ' +
      '→ `"We\'re already on it."` A letra seguinte é recapitalizada, porque um texto ' +
      'neutro que começa em minúscula denuncia a edição automática mais do que a piada ' +
      'denunciava o tema.',
    pattern: 'Don{A}t{S}Panic[.!:]{S}(?<next>[a-zA-Z])?',
    replace: capitalizeNext,
  },
  {
    id: 'trailingSentence',
    why:
      'A frase FECHANDO uma frase anterior: `"Something went wrong. Don\'t Panic."` → ' +
      '`"Something went wrong."` Come o ponto anterior e o devolve, para não deixar ' +
      '`..`. O ponto anterior é OBRIGATÓRIO no padrão, e é o que distingue "frase ' +
      'temática colada numa frase real" de "o valor É só a frase" — ' +
      '`hint: "Don\'t Panic."` não tem ponto antes, cai em `residual` e vira `""` em vez ' +
      'de `"."`, que é o que um padrão mais frouxo produziria.',
    pattern: '\\.{S?}Don{A}t{S}Panic\\.',
    replace: keepPeriod,
  },
  {
    id: 'dashClause',
    why:
      '`"Logged out. Don\'t Panic — your session is gone."` → ' +
      '`"Logged out. Your session is gone."` O travessão é o separador preferido do ' +
      'boilerplate e aparece em 4 mensagens de auth. Não colide com as duas regras de ' +
      'sentença: elas exigem `[.!:]` ou `.` depois de "Panic", e um travessão não é ' +
      'nenhum dos dois.',
    pattern: 'Don{A}t{S}Panic{S?}[—–-]{S?}(?<next>[a-zA-Z])?',
    replace: capitalizeNext,
  },
  {
    id: 'marvinAttribution',
    why:
      'Os valores i18n do tipo `Marvin: “…”`. A CHAVE fica (contrato e paridade de ' +
      'locales); o valor vai a vazio. Regra própria porque as piadas do Marvin não ' +
      'contêm a frase-título e nenhuma outra regra as alcançaria.',
    pattern: 'Marvin:{S?}[“"][^”"]*[”"]',
    replace: drop,
  },
  {
    id: 'answerFortyTwo',
    why:
      'O sufixo `· 42` / `· the answer is 42` do rodapé dos e-mails e do dashboard. ' +
      'Sem ele o nome do produto fica sozinho, que é o que se quer num projeto sem tema.',
    pattern: '{S?}·{S?}(?:the answer is{S})?42',
    replace: drop,
  },
  {
    id: 'residual',
    why:
      'Catch-all, por último. Qualquer forma da frase que as regras acima não ' +
      'anteciparam sai como texto vazio. Degradação escolhida: uma frase faltando é um ' +
      'defeito cosmético; uma frase temática sobrevivendo num projeto que pediu ' +
      '"sem easter eggs" é o gerador desobedecendo — e `verifyRename` em modo neutro ' +
      'falharia por causa dela.',
    pattern: 'Don{A}t{S}Panic[.!]?',
    replace: drop,
  },
];

interface BrandRule {
  id: string;
  why: string;
  pattern: string;
  resolve(match: RuleMatch): string;
}

/**
 * Expande a tabela para cada forma de apóstrofo, preservando a ordem RELATIVA dentro de
 * cada forma.
 *
 * Expandindo por regra (todas as formas de `justFixThese`, depois todas de `butClause`)
 * e não por forma: a precedência que importa é entre as regras — `trailingSentence` tem
 * de perder para `leadingSentence` independentemente de qual apóstrofo o arquivo usa.
 */
function buildBrandRules(): BrandRule[] {
  const out: BrandRule[] = [];
  for (const base of BRAND_RULE_BASES) {
    for (const form of APOSTROPHE_FORMS) {
      out.push({
        id: `${base.id}:${form.id}`,
        why: base.why,
        // `{S?}` antes de `{S}`: trocar na ordem inversa deixaria o `?` órfão.
        pattern: base.pattern
          .replaceAll('{A}', form.source)
          .replaceAll('{S?}', BRAND_SPACE_ANY)
          .replaceAll('{S}', BRAND_SPACE_ONE),
        resolve: (m) => base.replace(m.group('next')),
      });
    }
  }
  return out;
}

// `i` porque a frase aparece em `Don't Panic`, `don't panic` e `DON'T&nbsp;PANIC`; o
// mapa contou só a primeira caixa.
const COMPILED_BRAND = compileRules(buildBrandRules(), 'gi');

/**
 * Conteúdo neutro para `apps/api/src/common/marvin.ts`.
 *
 * Reescrita de arquivo inteiro em vez de substituição de frase porque as piadas do
 * Marvin ("brain the size of a planet") não contêm a frase-título: nenhuma regra de
 * texto as alcança, e deixá-las seria entregar o tema num projeto que pediu para não
 * ter tema. A ASSINATURA é preservada byte a byte — `marvinQuip(status: number): string`
 * —, o que é o que mantém o filtro global, o spec do filtro e o `ApiErrorBody` intactos.
 */
const NEUTRAL_MARVIN_TS = `/**
 * Short, non-sensitive hints per HTTP status.
 *
 * Never used on real security errors — those stay terse and leak nothing.
 */
const HINTS: Record<number, string[]> = {
  400: ['The request could not be understood. Check the fields and try again.'],
  401: ['You are not signed in.'],
  403: ['You do not have access to this.'],
  404: ['Not found.', 'This resource does not exist.'],
  418: ['Teapots do not brew coffee.'],
  429: ['Too many requests. Wait a moment and try again.'],
  500: ['Something went wrong on our side.'],
};

const FALLBACK = 'Something went wrong.';

export function marvinQuip(status: number): string {
  const pool = HINTS[status];
  if (!pool || pool.length === 0) return FALLBACK;
  // Deterministic pick (no Math.random) — stable across retries.
  return pool[status % pool.length] ?? FALLBACK;
}
`;

/**
 * Spec neutro para `marvin.spec.ts`.
 *
 * O spec original assere as strings literais (`'Don’t Panic.'`, "Not found. Much like my
 * will to keep computing.") — neutralizar só o módulo deixaria a suíte do projeto gerado
 * vermelha na primeira execução, que é a pior propaganda possível para um boilerplate
 * que se vende por `pnpm test` passar. As asserções ESTRUTURAIS (pool não vazio,
 * determinismo, fallback) são as que valem e ficam.
 */
const NEUTRAL_MARVIN_SPEC_TS = `import { marvinQuip } from './marvin';

describe('marvinQuip', () => {
  it('returns a non-empty hint for every known status', () => {
    for (const status of [400, 401, 403, 404, 418, 429, 500]) {
      const hint = marvinQuip(status);
      expect(typeof hint).toBe('string');
      expect(hint.length).toBeGreaterThan(0);
    }
  });

  it('returns the deterministic fallback for an unknown status', () => {
    expect(marvinQuip(999)).toBe('Something went wrong.');
    expect(marvinQuip(200)).toBe('Something went wrong.');
    expect(marvinQuip(0)).toBe('Something went wrong.');
  });

  it('is deterministic across calls (no Math.random)', () => {
    const first = marvinQuip(404);
    for (let i = 0; i < 50; i += 1) {
      expect(marvinQuip(404)).toBe(first);
    }
    expect(marvinQuip(500)).toBe(marvinQuip(500));
  });
});
`;

/** Arquivos reescritos inteiros quando o humor sai. Caminho relativo → conteúdo. */
const NEUTRAL_FILE_REWRITES: readonly { rel: string; content: string; why: string }[] = [
  {
    rel: 'apps/api/src/common/marvin.ts',
    content: NEUTRAL_MARVIN_TS,
    why: 'As piadas não contêm a frase-título; só reescrita de arquivo as alcança.',
  },
  {
    rel: 'apps/api/src/common/marvin.spec.ts',
    content: NEUTRAL_MARVIN_SPEC_TS,
    why: 'Assere as piadas como string exata; ficaria vermelho contra o módulo neutro.',
  },
];

export type BrandingMode = 'keep' | 'neutral';

export interface BrandingResult {
  mode: BrandingMode;
  filesRewritten: number;
  replacements: number;
  /** Contagem por regra, para provar que as três formas de apóstrofo foram cobertas. */
  byRule: { id: string; occurrences: number }[];
  /** Arquivos substituídos por uma versão neutra inteira. */
  filesReplaced: string[];
  warnings: string[];
}

/**
 * Neutraliza (ou preserva) o branding do Guia do Mochileiro.
 *
 * Roda DEPOIS de `applyRename`, e a ordem não é estética: se o branding rodasse
 * primeiro, as ocorrências de `DontPanic` que vivem DENTRO de frases de humor mudariam
 * de contexto, e o rename mecânico passaria a produzir frases estranhas em vez de
 * simplesmente trocar um token (mapa §4).
 */
export async function applyBranding(ctx: GeneratorContext): Promise<BrandingResult> {
  const { targetDir, recipe, names, logger, dryRun } = ctx;
  const mode: BrandingMode = recipe.features.easterEggs ? 'keep' : 'neutral';

  if (mode === 'keep') {
    logger.debug('Branding: easter eggs mantidos — as frases do Guia sobrevivem de propósito.');
    return {
      mode,
      filesRewritten: 0,
      replacements: 0,
      byRule: [],
      filesReplaced: [],
      warnings: [],
    };
  }

  logger.step('Neutralizando o branding temático');

  const counts = new Map<string, number>();
  const filesReplaced: string[] = [];
  const warnings: string[] = [];
  let filesRewritten = 0;

  // ── Reescritas inteiras ANTES da passada de frases: o conteúdo neutro não contém a
  //    frase, então a passada seguinte não encontra nada nesses arquivos e não os conta
  //    duas vezes.
  for (const rewrite of NEUTRAL_FILE_REWRITES) {
    const abs = assertWithin(targetDir, rewrite.rel);
    const current = await readText(abs).catch(() => null);
    if (current === null) {
      // Ausente porque o manifesto da feature já o apagou — caminho esperado, não erro.
      logger.debug(`Branding: ${rewrite.rel} não existe (já removido?), nada a reescrever.`);
      continue;
    }
    if (current === rewrite.content) continue;
    if (!dryRun) await writeText(abs, rewrite.content);
    filesReplaced.push(rewrite.rel);
    filesRewritten += 1;
  }

  // ── Passada de frases, mesma mecânica de passada única do rename.
  const files = await listFiles(targetDir, { skipRelPaths: NEVER_TRAVERSE_REL_PATHS });
  for (const entry of files) {
    if (NEVER_REWRITE.has(basename(entry.path))) continue;
    if (await isBinaryFile(entry.path)) continue;

    const before = await readText(entry.path);
    const after = transform(
      before,
      COMPILED_BRAND,
      (rule, match) => rule.resolve(match),
      (rule) => counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1),
    );
    if (after === before) continue;

    filesRewritten += 1;
    if (!dryRun) await writeText(assertWithin(targetDir, entry.path), after);
  }

  // ── A chave de marca nos catálogos de i18n.
  //
  // As regras de frase são escritas contra o texto em inglês, então em `en-US.json` a
  // chave da assinatura da marca — `"Don't Panic."` — vira string VAZIA, e em
  // `pt-BR.json` o valor traduzido ("Não entre em pânico.") não casa nenhuma delas e
  // sobrevive inteiro. O resultado é o pior dos dois: um idioma sem texto e o outro
  // ainda com o tema, num projeto que pediu para não ter tema. E o teste de paridade do
  // boilerplate (`messages.test.ts > has no empty string translations`) falha — com
  // razão: string vazia num catálogo renderiza nada na tela.
  //
  // A chave em si é contrato e fica (o call site é o mesmo literal, renomeado pela regra
  // `camel` do motor). O que muda é o valor: passa a ser o nome do projeto, que é
  // exatamente o que aquele lugar da interface quer dizer — era a assinatura da marca.
  const arquivosDeMensagem = files.filter((e) => /\/messages\/[\w-]+\.json$/.test(e.rel));
  for (const entry of arquivosDeMensagem) {
    const before = await readText(entry.path);
    // A chave já foi renomeada para o camel do projeto pelo motor de rename, que corre
    // antes deste passo.
    const chave = new RegExp(`("${names.camel}"\\s*:\\s*)"[^"]*"`);
    if (!chave.test(before)) continue;

    const after = before.replace(chave, `$1${JSON.stringify(names.human)}`);
    if (after === before) continue;

    counts.set('brandKey', (counts.get('brandKey') ?? 0) + 1);
    filesRewritten += 1;
    if (!dryRun) await writeText(assertWithin(targetDir, entry.path), after);
  }

  const byRule = [...counts.entries()]
    .map(([id, occurrences]) => ({ id, occurrences }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const replacements = byRule.reduce((sum, r) => sum + r.occurrences, 0);

  warnings.push(
    'Easter eggs desligados: a chave i18n `marvin` e o campo `ApiErrorBody.marvin` ' +
      'continuam existindo, com texto vazio. É decisão de contrato — ver o cabeçalho de ' +
      '`applyBranding`. Remover o elemento que os renderiza é costura da feature.',
  );

  logger.info(`Branding: ${replacements} frases neutralizadas em ${filesRewritten} arquivos`);
  return { mode, filesRewritten, replacements, byRule, filesReplaced, warnings };
}

/** A justificativa de cada regra de branding, sem duplicar por forma de apóstrofo. */
export function describeBrandingRules(): { id: string; why: string }[] {
  return BRAND_RULE_BASES.map(({ id, why }) => ({ id, why }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificação embutida
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Uma exceção declarada: onde o nome antigo pode sobreviver, e por quê.
 *
 * Exceção é declaração, não pardon genérico: cada item nomeia os ARQUIVOS e o PADRÃO, e
 * carrega a justificativa que aparece no relatório. Uma ocorrência aceita continua sendo
 * reportada — ela sai de `blocking` e entra em `accepted`, onde o CLI a imprime. O que
 * nunca acontece é ela desaparecer.
 */
export interface RenameException {
  id: string;
  /** Caminhos relativos exatos, ou prefixos de diretório terminados em `/`. */
  files: readonly string[];
  /** Regex (fonte, flags `i`) do texto aceito. */
  pattern: string;
  why: string;
}

export const DEFAULT_RENAME_EXCEPTIONS: readonly RenameException[] = [
  {
    id: 'upstream-attribution',
    files: ['README.md', 'CLAUDE.md', 'CONTRIBUTING.md'],
    pattern: 'marmottajr/dontpanic',
    why:
      'A URL do boilerplate de ORIGEM, numa linha de atribuição ("gerado a partir de"). ' +
      'É um fato verdadeiro e um link que abre. Reescrevê-la para ' +
      '`marmottajr/<slug>` inventaria um 404, e apagar a atribuição não é decisão do ' +
      'gerador — é do usuário.',
  },
  {
    id: 'upstream-issue-links',
    files: ['.github/ISSUE_TEMPLATE/config.yml'],
    pattern: 'marmottajr/dontpanic',
    why:
      'Advisories e discussions APONTAM PARA O NOSSO REPO — quem abrir um bug do ' +
      'projeto dele vai cair na nossa caixa. Aceito para não travar a geração (o link ' +
      'funciona e não é vazamento), mas reportado em `accepted` de propósito: é item de ' +
      'checklist de publicação, não aprovação. A costura que troca as duas URLs pelo ' +
      'repo do usuário depende de um input que o gerador não pede hoje.',
  },
  {
    id: 'generator-package-residue',
    files: [
      '.gitignore',
      '.prettierignore',
      '.vscode/settings.json',
      '.github/workflows/release.yml',
      'README.md',
    ],
    pattern: 'create-dontpanic',
    why:
      'Resíduo do pacote GERADOR, que não é o produto e não é renomeado (mapa §3.5): ' +
      'regras de ignore que apontam para um diretório que não foi copiado, e menções em ' +
      'doc. Nenhuma quebra build. O diretório em si e ' +
      '`publish-create-dontpanic.yml` são apagados pelo manifesto — e, se não forem, ' +
      'aparecem em `blocking`, porque NÃO estão nesta lista.',
  },
];

export interface RenameOccurrence {
  /** Caminho relativo ao destino, separador `/`. */
  file: string;
  /** 1-based. */
  line: number;
  /** 1-based, em unidades de code unit de JS. */
  column: number;
  /** O texto exato que casou. */
  match: string;
  /** A linha inteira, aparada — é o que faz a mensagem de erro acionável. */
  context: string;
}

export interface RenameVerification {
  /** `true` quando não sobrou nenhuma ocorrência que não fosse declarada. */
  ok: boolean;
  filesScanned: number;
  blocking: RenameOccurrence[];
  accepted: (RenameOccurrence & { exception: string; why: string })[];
}

export interface VerifyRenameOptions {
  /**
   * `true` quando a feature `easterEggs` está LIGADA. Nesse modo a frase "Don't Panic"
   * sai do detector: ela sobreviveu de propósito, e reclamar dela faria o gerador
   * recusar a própria configuração que o usuário pediu. São dois modos de verificação,
   * e quem chama tem de saber qual aplicar (mapa §5.1).
   */
  keepEasterEggs?: boolean;
  /** Substitui a lista padrão. Passar `[]` verifica sem exceção nenhuma. */
  exceptions?: readonly RenameException[];
}

/** O token do nome antigo, em qualquer caixa (o detector é case-insensitive). */
const OLD_NAME_TOKEN = 'dontpanic';

/**
 * A frase-título, cobrindo as cinco formas de apóstrofo, os quatro disfarces do espaço,
 * e a ausência do apóstrofo (`dont panic`).
 *
 * Mais larga que o grep do mapa (`don.t[[:space:]]panic`, que exige exatamente UM
 * caractere entre `don` e `t`) porque aquele grep não vê `Don&apos;t Panic`, e há 5
 * dessas — duas nas páginas de erro que o usuário final enxerga.
 */
// O último item da alternação de espaço, abaixo, é um NBSP **literal** (U+00A0) e não
// um erro de digitação: o boilerplate tem a frase com o espaço não-quebrável cru, além
// da forma `&nbsp;`. O `no-irregular-whitespace` fica desligado porque achar espaço
// irregular é o trabalho deste padrão — a regra existe para pegar quem digita um sem
// querer.
const CATCHPHRASE_PATTERN =
  // eslint-disable-next-line no-irregular-whitespace
  `don(?:'|’|&apos;|&#0?39;|&rsquo;|&#8217;)?t(?:\\s|&nbsp;|%20| )+panic`;

function buildDetector(keepEasterEggs: boolean): RegExp {
  const alternatives = keepEasterEggs
    ? [OLD_NAME_TOKEN]
    : [OLD_NAME_TOKEN, CATCHPHRASE_PATTERN];
  return new RegExp(alternatives.join('|'), 'gi');
}

function fileMatchesException(rel: string, files: readonly string[]): boolean {
  return files.some((candidate) =>
    candidate.endsWith('/') ? rel.startsWith(candidate) : rel === candidate,
  );
}

/**
 * Varre o projeto gerado e devolve toda ocorrência remanescente do nome antigo.
 *
 * Chamada pelo próprio gerador ao final. Se sobrou algo que não está declarado, o
 * gerador **falha e diz o que sobrou** — em vez de entregar um projeto meio renomeado
 * que quebra num `pnpm install` obscuro três passos depois, quando a causa já não é
 * óbvia. O portão é mecânico de propósito: nenhuma revisão humana cobre 490 ocorrências
 * em 199 arquivos (ver `docs/ARCHITECTURE.md`, "o rename é provado, não conferido").
 */
export async function verifyRename(
  targetDir: string,
  options: VerifyRenameOptions = {},
): Promise<RenameVerification> {
  const { keepEasterEggs = false, exceptions = DEFAULT_RENAME_EXCEPTIONS } = options;
  const detector = buildDetector(keepEasterEggs);

  const blocking: RenameOccurrence[] = [];
  const accepted: (RenameOccurrence & { exception: string; why: string })[] = [];
  let filesScanned = 0;

  const files = await listFiles(targetDir, { skipRelPaths: NEVER_TRAVERSE_REL_PATHS });
  for (const entry of files) {
    // Os mesmos pulos do rename, pela mesma razão: um lockfile que ninguém reescreveu
    // não é defeito de rename, e um binário nunca teve texto para renomear. Verificar
    // o que o motor não toca produziria falha permanente e o gate viraria ruído.
    if (NEVER_REWRITE.has(basename(entry.path))) continue;
    if (await isBinaryFile(entry.path)) continue;

    filesScanned += 1;
    const text = await readText(entry.path);
    if (!new RegExp(detector.source, 'i').test(text)) continue;

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      detector.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = detector.exec(line)) !== null) {
        const occurrence: RenameOccurrence = {
          file: entry.rel,
          line: i + 1,
          column: match.index + 1,
          match: match[0],
          context: line.trim().slice(0, 200),
        };
        const exception = exceptions.find(
          (candidate) =>
            fileMatchesException(entry.rel, candidate.files) &&
            new RegExp(candidate.pattern, 'i').test(line),
        );
        if (exception === undefined) blocking.push(occurrence);
        else accepted.push({ ...occurrence, exception: exception.id, why: exception.why });

        // Match de largura zero é impossível nas alternativas atuais, mas um padrão
        // futuro com tudo opcional travaria o laço.
        if (match[0].length === 0) detector.lastIndex += 1;
      }
    }
  }

  return { ok: blocking.length === 0, filesScanned, blocking, accepted };
}

/** Mensagem de falha acionável: arquivo, linha e o texto, agrupados. */
export function formatVerificationFailure(verification: RenameVerification): string {
  const head =
    `O rename deixou ${verification.blocking.length} ocorrência(s) do nome antigo. ` +
    `Entregar o projeto assim faria ele quebrar num \`pnpm install\` cuja mensagem não ` +
    `aponta para aqui, então a geração para.`;
  const body = verification.blocking
    .slice(0, 50)
    .map((o) => `  ${o.file}:${o.line}:${o.column}  ${o.match}   › ${o.context}`)
    .join('\n');
  const tail =
    verification.blocking.length > 50
      ? `\n  … e mais ${verification.blocking.length - 50}.`
      : '';
  return `${head}\n\n${body}${tail}`;
}
