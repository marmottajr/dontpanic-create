/**
 * Contratos centrais do gerador.
 *
 * Este arquivo é a fronteira entre as partes do CLI: o parser de argv, os prompts,
 * o motor de rename, o manifesto de features e a landing page todos falam estes tipos.
 * Mudou algo aqui? Mudou o contrato — atualize os consumidores junto.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As features que o usuário liga/desliga.
 *
 * `multiTenant: false` NÃO arranca o Row Level Security: gera o projeto em modo
 * single-tenant, com um tenant fixo semeado e a UI de troca de empresa escondida.
 * A garantia do Postgres continua de pé — é o que mantém o projeto gerado seguro
 * por construção em vez de seguro por lembrança. Ver docs/decisions/0002.
 */
export const FEATURE_IDS = [
  'multiTenant',
  'twoFactor',
  'oauth',
  'invitations',
  'publicSignup',
  'files',
  'platform',
  'audit',
  'plans',
  'i18n',
  'queue',
  'captcha',
  'easterEggs',
  'scaffolding',
] as const;

/**
 * `scaffolding` merece explicação: são os blocos de construção que o boilerplate traz
 * prontos e não usa — `components/records/*`, `components/dashboard/*`, os hooks de
 * grid, `sequence.service.ts`, `tenant-crud.ts`. A auditoria confirmou que nada os
 * importa fora dos próprios testes.
 *
 * Não é código morto por descuido: num boilerplate, é justamente o que se espera
 * encontrar quando se vai construir a primeira tela de produto. Default ligado, e
 * desligado no preset `minimal` — mas com uma consequência que o manifesto precisa
 * tratar: três desses arquivos estão dentro dos globs de cobertura, então removê-los sem
 * remover as linhas de `include` correspondentes muda o denominador e derruba o
 * threshold.
 */
export type FeatureId = (typeof FEATURE_IDS)[number];

export type FeatureSelection = Record<FeatureId, boolean>;

// ─────────────────────────────────────────────────────────────────────────────
// Drivers (adapters plugáveis por env — em geral NÃO removem código)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Só Postgres.
 *
 * O `.env.example` do boilerplate oferece `DB_PROVIDER=mysql|sqlite`, mas o código não
 * sustenta: o Row Level Security é PL/pgSQL puro (`set_config`, `pg_roles`,
 * `app.apply_tenant_rls()`) e o cliente é `@prisma/adapter-pg`. Oferecer a escolha no
 * gerador entregaria um projeto que sobe e só falha no isolamento entre empresas — a
 * única falha que este boilerplate existe para não ter. A opção volta quando o adapter
 * existir de verdade.
 */
export const DB_DRIVERS = ['postgresql'] as const;
export const STORAGE_DRIVERS = ['s3', 'local'] as const;
export const MAIL_DRIVERS = ['smtp', 'ses', 'console'] as const;
export const CACHE_DRIVERS = ['redis', 'memory'] as const;
export const QUEUE_DRIVERS = ['bullmq', 'memory'] as const;
export const CAPTCHA_DRIVERS = ['none', 'turnstile', 'recaptcha-v2', 'recaptcha-v3'] as const;

export type DbDriver = (typeof DB_DRIVERS)[number];
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];
export type MailDriver = (typeof MAIL_DRIVERS)[number];
export type CacheDriver = (typeof CACHE_DRIVERS)[number];
export type QueueDriver = (typeof QUEUE_DRIVERS)[number];
export type CaptchaDriver = (typeof CAPTCHA_DRIVERS)[number];

export interface DriverSelection {
  db: DbDriver;
  storage: StorageDriver;
  mail: MailDriver;
  cache: CacheDriver;
  queue: QueueDriver;
  captcha: CaptchaDriver;
}

export const OAUTH_PROVIDERS = ['google', 'apple', 'github'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Receita — o que a landing page codifica e o CLI executa
// ─────────────────────────────────────────────────────────────────────────────

export interface Recipe {
  /** Versão do formato da receita. Incrementar em mudança incompatível. */
  readonly v: 1;
  project: ProjectIdentity;
  features: FeatureSelection;
  drivers: DriverSelection;
  i18n: { locales: string[]; defaultLocale: string };
  oauth: { providers: OAuthProvider[] };
  options: GeneratorOptions;
}

export interface ProjectIdentity {
  /** O que o usuário digitou, cru. Ex: "Acme Corp" */
  displayName: string;
  /** Slug derivado ou informado. Ex: "acme-corp" */
  slug: string;
  description?: string;
}

export interface GeneratorOptions {
  /** `git init` + primeiro commit no projeto gerado. */
  git: boolean;
  /** Rodar `pnpm install` ao final. */
  install: boolean;
  /** Emitir docker-compose enxuto (só os serviços que as features escolhidas usam). */
  docker: boolean;
  /** Sobrescrever diretório de destino existente e não vazio. */
  force: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Nomes derivados — as formas que o motor de rename precisa
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Toda forma que "dontpanic" assume no repo tem uma contraparte aqui.
 * O motor de rename NUNCA improvisa uma forma: se precisou de uma nova,
 * ela entra neste tipo e é derivada em um só lugar (naming.ts).
 */
export interface NameForms {
  /** kebab minúsculo, para pacote npm/diretório/slug de URL: `acme-corp` */
  slug: string;
  /** PascalCase, para classes e tipos: `AcmeCorp` */
  pascal: string;
  /** camelCase, para identificadores: `acmeCorp` */
  camel: string;
  /** snake_case minúsculo, para identificadores SQL: `acme_corp` */
  snake: string;
  /** SCREAMING_SNAKE_CASE, para variáveis de ambiente: `ACME_CORP` */
  screaming: string;
  /** Nome humano, como o usuário digitou: `Acme Corp` */
  human: string;
  /** Escopo pnpm sem o arroba: `acme-corp` (usado em `@acme-corp/shared`) */
  npmScope: string;
  /** Role restrita do Postgres: `acme_corp_app` */
  dbRole: string;
  /** Banco de desenvolvimento: `acme_corp` */
  dbName: string;
  /** Banco de e2e: `acme_corp_e2e` */
  dbNameE2e: string;
  /** Domínio fictício para seed e e-mails: `acme-corp.dev` */
  domain: string;
  /** E-mail do admin do seed: `admin@acme-corp.dev` */
  seedAdminEmail: string;
  /** Bucket de objeto: `acme-corp` */
  bucket: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manifesto de features
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descreve como REMOVER uma feature. Nada aqui descreve como adicionar:
 * o template já vem completo e o gerador só subtrai. Isso é deliberado —
 * o repo base continua compilando, rodando e testando, que é o ativo
 * que estamos vendendo. Ver docs/decisions/0001.
 */
export interface FeatureManifest {
  id: FeatureId;
  /** Rótulo curto para o terminal e para a landing. */
  label: string;
  /** Uma linha explicando o que a feature entrega. */
  summary: string;
  /** Features que precisam estar ligadas para esta poder estar ligada. */
  requires?: FeatureId[];
  /** Se true, o CLI recusa desligar (v1). */
  alwaysOn?: boolean;

  /** Caminhos (relativos à raiz do projeto gerado) apagados inteiros. Suporta glob. */
  deletePaths?: string[];

  /** Modelos, enums e campos do Prisma que saem. */
  prisma?: {
    /** Arquivos `prisma/schema/*.prisma` apagados inteiros. */
    dropFiles?: string[];
    /** `model X` / `enum Y` removidos de arquivos que sobrevivem. */
    dropBlocks?: string[];
    /** Campos removidos de modelos que sobrevivem: `{ model: 'User', fields: [...] }` */
    dropFields?: { model: string; fields: string[] }[];
    /** Campos que mudam de opcional para obrigatório quando a feature sai. */
    tighten?: { model: string; field: string; to: 'required' }[];
    /**
     * Valores removidos de enums que sobrevivem: `{ enum: 'Role', values: ['SUPERADMIN'] }`.
     *
     * Existe porque `Role.SUPERADMIN` não sobrevive à remoção do `platform` e o enum
     * `Role` sobrevive. Expressar isso como remoção de LINHA casaria também a prosa dos
     * comentários que citam o valor; como remoção estrutural, casa só o valor.
     */
    dropEnumValues?: { enum: string; values: string[] }[];
  };

  /** Edições cirúrgicas em arquivos compartilhados. */
  seams?: SeamEdit[];

  /** Variáveis de ambiente removidas do .env / .env.example. */
  envKeys?: string[];

  /** Dependências npm removidas, por workspace. */
  deps?: { workspace: string; remove: string[] }[];

  /** Serviços de docker-compose que deixam de ser necessários. */
  composeServices?: string[];

  /** Seções do CLAUDE.md podadas junto (por título exato do heading). */
  docSections?: string[];

  /** Fragmentos de SQL manual que saem da baseline de migration. */
  sqlFragments?: string[];
}

/**
 * Uma edição cirúrgica num arquivo que sobrevive à remoção.
 *
 * Preferimos `dropLinesMatching` e `dropBlock` a substituição literal: o template
 * é sincronizado de um repo vivo, e um `replace` de string exata apodrece no primeiro
 * refactor. Um padrão âncora sobrevive a reformatação.
 */
export interface SeamEdit {
  file: string;
  kind: SeamKind;
  /**
   * Regex (fonte, sem flags) que identifica a linha/bloco alvo.
   *
   * Em alguns `kind` o `pattern` não é regex e sim um NOME — chave de JSON, nome de
   * model, nome de dependência. A tabela de `SeamKind` diz qual é qual, e é a razão
   * pela qual ela é comentada linha por linha.
   */
  pattern?: string;
  /** Para `replace` / `insertBefore` / `insertAfter` / `setEnvValue`: o texto que entra. */
  replacement?: string;
  /** Para `dropBlock`: delimitadores do bloco. */
  block?: { start: string; end: string };
  /**
   * O construto que CONTÉM o alvo, quando `pattern` sozinho seria ambíguo: o nome da
   * propriedade do array (`imports`), o model do campo (`User`), o enum do valor
   * (`Role`), o módulo do import (`@dontpanic/shared`).
   *
   * Sem isto, um símbolo de nome comum sairia de qualquer import do arquivo, e um campo
   * `id` sairia de todo model do schema — remoção a mais que compila e só aparece como
   * comportamento faltando em runtime.
   */
  target?: string;
  /** Falhar a geração se o padrão não casar. Default: true. */
  required?: boolean;
  /** Por que esta edição existe — aparece no erro se ela falhar. */
  reason?: string;
}

/**
 * Os tipos de edição que o aplicador de costuras sabe fazer.
 *
 * A lista é longa de propósito, e a alternativa era pior: um `replace` genérico com regex
 * para tudo. Editar TypeScript com regex e editar JSON com regex têm perigos diferentes —
 * um `JSON.parse`+`stringify` reescreve o arquivo inteiro e polui o diff; uma linha
 * apagada de um array literal deixa vírgula dupla; uma seção de markdown apagada até o
 * próximo `#` come a seção irmã quando o nível difere. Cada `kind` aqui existe porque
 * algum arquivo do boilerplate precisa de uma edição que os outros fariam errado, e cada
 * um tem um módulo em `src/seams/` com a verificação que aquele formato exige.
 */
export type SeamKind =
  // ── TypeScript e texto em geral ──────────────────────────────────────────
  | 'dropLinesMatching' // apaga toda linha que casa com `pattern`
  | 'dropBlock' // apaga de `block.start` até `block.end`, por linha, inclusive
  | 'dropBlockWithLeadingDoc' // idem, absorvendo o doc-comment colado acima
  | 'dropBalancedBlock' // apaga de `pattern` até a chave/colchete que o fecha (contado)
  | 'dropClassMember' // apaga o método/propriedade de `pattern` COM os decorators acima
  | 'dropCommentSection' // apaga de um banner `// --- x ---` até o banner seguinte
  | 'replace' // substitui TODAS as ocorrências de `pattern` por `replacement`
  | 'insertBefore' // insere `replacement` antes da linha que casa `pattern`
  | 'insertAfter' // insere `replacement` depois da linha que casa `pattern`
  | 'dropImport' // apaga o import cujo ESPECIFICADOR casa com `pattern`
  | 'dropImportSpecifier' // tira um símbolo (`pattern`) do import de `target`
  | 'dropArrayEntry' // tira a entrada `pattern` do array `target`
  // ── Módulo Nest ──────────────────────────────────────────────────────────
  | 'dropNestModule' // tira a classe `pattern` do `@Module` e o import dela, juntos
  // ── Prisma ───────────────────────────────────────────────────────────────
  | 'dropPrismaBlock' // apaga `model`/`enum` de nome `pattern`, comentários inclusive
  | 'dropPrismaField' // apaga o campo `pattern` do model `target` e os `@@` que o citam
  | 'dropPrismaEnumValue' // apaga o valor `pattern` do enum `target`
  | 'tightenPrismaField' // `Tipo?` → `Tipo` no campo `pattern` do model `target`
  // ── JSON ─────────────────────────────────────────────────────────────────
  | 'dropJsonKey' // apaga a chave no caminho pontilhado `pattern`, sem reformatar
  | 'dropJsonKeysMatching' // apaga toda chave de 1º nível que casa `pattern`
  | 'dropDependency' // apaga a dep `pattern` das quatro seções do package.json
  | 'upsertDependency' // grava a dep `pattern` com versão `replacement` (só I17)
  // ── .env ─────────────────────────────────────────────────────────────────
  | 'dropEnvKey' // apaga a variável `pattern` com o comentário que a descreve
  | 'dropEnvSection' // apaga a seção cujo cabeçalho casa `pattern`, régua inclusive
  | 'setEnvValue' // reescreve o valor de `pattern` para `replacement`
  // ── Markdown ─────────────────────────────────────────────────────────────
  | 'dropMarkdownSection' // apaga a seção de título `pattern`, subseções inclusive
  | 'dropMarkdownBullet' // apaga o bullet que casa `pattern` e suas continuações
  | 'dropMarkdownTableRow' // apaga a linha de tabela que casa `pattern`
  // ── Cobertura ────────────────────────────────────────────────────────────
  | 'relaxCoverageThresholds' // afrouxa os pisos fixados (ver §0 regra 3 do mapa)
  // ── Fora do alcance de uma regex ─────────────────────────────────────────
  /**
   * Troca o arquivo inteiro por uma variante pré-escrita, embarcada no gerador
   * (`replacement` = nome do asset).
   *
   * Existe para os dois casos que o mapa manda REESCREVER e não podar: a suíte
   * `auth.e2e-spec.ts`, que faz nascer TODA conta por `POST /auth/signup` e precisa
   * semear por `ownerDb()` quando o registro público sai (I19), e a variante sóbria de
   * `CLAUDE.md`/`README.md` quando os easter eggs saem (I18 — a piada está DENTRO das
   * explicações, não anexada a elas). Nenhuma regex faz isso.
   */
  | 'swapVariant'
  /**
   * Não edita nada: registra que este arquivo precisa de reescrita humana e por quê.
   *
   * É a costura honesta. O mapa identifica trechos onde subtrair produziria algo pior que
   * não subtrair — `platform-tenants.service.create()` sem convites criaria uma EMPRESA
   * MORTA, inalcançável, e a alternativa recomendada (mandar token de reset de senha)
   * depende de uma decisão de produto. Marcar isso como aviso no relatório é melhor que
   * gerar código errado em silêncio, e muito melhor que fingir que a costura existe.
   */
  | 'manualRewrite';

// ─────────────────────────────────────────────────────────────────────────────
// Execução
// ─────────────────────────────────────────────────────────────────────────────

export interface GeneratorContext {
  recipe: Recipe;
  names: NameForms;
  /** Diretório de destino, absoluto. */
  targetDir: string;
  /** Diretório do template já copiado (== targetDir depois da cópia). */
  templateDir: string;
  logger: Logger;
  /** Nada é escrito no disco; só relata o que faria. */
  dryRun: boolean;
}

export interface Logger {
  step(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

/** Relatório do que a geração fez — consumido pelos testes de conformidade. */
export interface GenerationReport {
  recipe: Recipe;
  names: NameForms;
  filesCopied: number;
  filesDeleted: string[];
  filesRenamed: number;
  replacements: number;
  seamsApplied: { file: string; kind: SeamKind; pattern?: string }[];
  seamsSkipped: { file: string; kind: SeamKind; pattern?: string; reason?: string }[];
  envKeysWritten: number;
  secretsGenerated: string[];
  composeServices: string[];
  warnings: string[];
  durationMs: number;
}
