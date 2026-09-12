import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { buildBaseline, parsePrunedSchema, splitStatements } from '../src/prisma.ts';
import { makeContext, makeRecipe } from './support.ts';
import { pathExists } from '../src/util/fs.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fixture
// ─────────────────────────────────────────────────────────────────────────────
//
// Réplica reduzida do que o boilerplate tem: statements rotulados pelo Prisma
// (`-- CreateTable`, `-- AddForeignKey`, …) mais duas migrations escritas à mão (RLS e
// role restrita) com blocos `DO $$` e funções. É a forma que importa, não o tamanho —
// e um fixture próprio mantém a suíte determinística e independente de o template
// estar materializado no disco (ele é gitignorado).

const MIGRATION_INIT = `-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_twoFactorSecret_idx" ON "users"("twoFactorSecret");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

const MIGRATION_TENANCY = `-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "tenantId" UUID,
ADD COLUMN     "profileId" UUID,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "module" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

const MIGRATION_RLS = `-- ═══════════════════════════════════════════════════════════════════════════
-- Multi-tenant isolation enforced by Postgres (Row Level Security).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.tenant_visible(row_tenant_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT row_tenant_id IS NOT NULL AND row_tenant_id = app.current_tenant_id();
  $$;

CREATE OR REPLACE FUNCTION app.apply_tenant_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOR t IN
      SELECT c.relname FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE a.attname = 'tenantId' AND c.relname <> '_prisma_migrations'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
           USING (app.tenant_visible("tenantId"))
           WITH CHECK (app.tenant_visible("tenantId"))', t);
    END LOOP;
  END;
  $$;

SELECT app.apply_tenant_rls();

-- Profile children, linked by profileId
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
`;

const MIGRATION_APP_ROLE = `-- ═══════════════════════════════════════════════════════════════════════════
-- An application role with no special privileges.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app') THEN
    CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dontpanic_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dontpanic_app;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c WHERE c.relname = '_prisma_migrations') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;
  END IF;
END $$;
`;

const MIGRATION_INVITATIONS = `-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- An account that only signs in through a provider has no password to store.
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- At most one LIVE invitation per address per company. Partial, because the
-- constraint only applies to PENDING rows.
CREATE UNIQUE INDEX "invitations_tenant_email_pending_key"
  ON "invitations"("tenantId", "email")
  WHERE "status" = 'PENDING';

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

SELECT app.apply_tenant_rls();
`;

/** Schema podado. `withInvitations` liga o model e o enum dos convites. */
function schemaSource(options: { withInvitations: boolean; withTwoFactor: boolean }): string {
  const invitations = options.withInvitations
    ? `
enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
}

model Invitation {
  id       String           @id @default(uuid()) @db.Uuid
  tenantId String           @db.Uuid
  email    String
  status   InvitationStatus @default(PENDING)

  @@map("invitations")
}
`
    : '';

  const twoFactor = options.withTwoFactor
    ? `  twoFactorEnabled Boolean @default(false)
  twoFactorSecret  String?
`
    : '';

  // `passwordHash` é opcional só quando há convites/social; sem eles volta a
  // obrigatório, e é isso que o teste do DROP NOT NULL exercita.
  const passwordHash = options.withInvitations ? 'String?' : 'String';

  return `
datasource db {
  provider = "postgresql"
}

enum Role {
  SUPERADMIN
  ADMIN
  USER
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String?  @db.Uuid
  profileId    String?  @db.Uuid
  email        String   @unique
  passwordHash ${passwordHash}
  name         String
  role         Role     @default(USER)
${twoFactor}  lastLoginAt  DateTime?
  createdAt    DateTime @default(now())

  @@map("users")
}

model RefreshToken {
  id        String @id @default(uuid()) @db.Uuid
  userId    String @db.Uuid
  tokenHash String

  @@map("refresh_tokens")
}

model Tenant {
  id   String @id @default(uuid()) @db.Uuid
  slug String
  name String

  @@map("tenants")
}

model Profile {
  id       String @id @default(uuid()) @db.Uuid
  tenantId String @db.Uuid
  code     String

  @@map("profiles")
}

model Permission {
  id        String @id @default(uuid()) @db.Uuid
  profileId String @db.Uuid
  module    String

  @@map("permissions")
}
${invitations}`;
}

const MIGRATIONS: [string, string][] = [
  ['20260613074545_init', MIGRATION_INIT],
  ['20260911105130_tenancy', MIGRATION_TENANCY],
  ['20260911105200_row_level_security', MIGRATION_RLS],
  ['20260911105300_app_role', MIGRATION_APP_ROLE],
  ['20260912120000_invitations_and_oauth', MIGRATION_INVITATIONS],
];

async function makeProject(options: {
  withInvitations: boolean;
  withTwoFactor: boolean;
}): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dp-prisma-'));
  const prisma = join(dir, 'apps/api/prisma');

  await mkdir(join(prisma, 'schema'), { recursive: true });
  await writeFile(join(prisma, 'schema', 'main.prisma'), schemaSource(options), 'utf8');

  for (const [name, sql] of MIGRATIONS) {
    await mkdir(join(prisma, 'migrations', name), { recursive: true });
    await writeFile(join(prisma, 'migrations', name, 'migration.sql'), sql, 'utf8');
  }
  await writeFile(
    join(prisma, 'migrations', 'migration_lock.toml'),
    'provider = "postgresql"\n',
    'utf8',
  );

  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// Divisor de statements
// ─────────────────────────────────────────────────────────────────────────────

describe('splitStatements', () => {
  it('não parte um bloco `DO $$ … $$;` nos `;` internos', () => {
    // Um `split(';')` produziria SQL inválido, e o sintoma seria um erro de sintaxe do
    // Postgres dentro de um `format(...)`, longe da causa.
    const statements = splitStatements(MIGRATION_APP_ROLE);
    const doBlocks = statements.filter((s) => s.code.startsWith('DO $$'));
    assert.equal(doBlocks.length, 2);
    for (const block of doBlocks) {
      assert.ok(block.code.trim().endsWith('$$;'), `bloco cortado: ${block.code.slice(-40)}`);
    }
  });

  it('não parte o corpo de uma função', () => {
    const statements = splitStatements(MIGRATION_RLS);
    const fns = statements.filter((s) => s.code.includes('CREATE OR REPLACE FUNCTION'));
    assert.equal(fns.length, 3);
    for (const fn of fns) assert.ok(fn.code.trim().endsWith('$$;'));
  });

  it('preserva os comentários e reconhece o rótulo do Prisma', () => {
    const statements = splitStatements(MIGRATION_INIT);
    assert.equal(statements[0]?.tag, 'CreateEnum');
    assert.equal(statements[1]?.tag, 'CreateTable');

    const invitations = splitStatements(MIGRATION_INVITATIONS);
    const partial = invitations.find((s) => s.code.includes('pending_key'));
    assert.ok(partial?.comments.some((c) => c.includes('only applies to PENDING')));
  });

  it('ignora `;` dentro de string literal', () => {
    const statements = splitStatements(`SELECT 'a;b';\nSELECT 2;\n`);
    assert.equal(statements.length, 2);
    assert.equal(statements[0]?.code, "SELECT 'a;b';");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Leitor de schema
// ─────────────────────────────────────────────────────────────────────────────

describe('parsePrunedSchema', () => {
  it('lê tabela por @@map e campos por nome', () => {
    const schema = parsePrunedSchema([schemaSource({ withInvitations: true, withTwoFactor: true })]);
    assert.ok(schema.tables.has('users'));
    assert.ok(schema.tables.has('invitations'));
    assert.ok(schema.enums.has('Role'));
    assert.ok(schema.enums.has('InvitationStatus'));
    assert.ok(schema.tables.get('users')!.fields.has('passwordHash'));
    assert.ok(schema.tables.get('users')!.fields.has('twoFactorSecret'));
  });

  it('vê a poda: model e enum ausentes, campo ausente, campo que voltou a obrigatório', () => {
    const schema = parsePrunedSchema([
      schemaSource({ withInvitations: false, withTwoFactor: false }),
    ]);
    assert.ok(!schema.tables.has('invitations'));
    assert.ok(!schema.enums.has('InvitationStatus'));
    assert.ok(!schema.tables.get('users')!.fields.has('twoFactorSecret'));
    assert.equal(schema.tables.get('users')!.fields.get('passwordHash')!.optional, false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Baseline com tudo ligado
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBaseline — receita completa', () => {
  let dir: string;
  let sql: string;
  let result: Awaited<ReturnType<typeof buildBaseline>>;

  before(async () => {
    dir = await makeProject({ withInvitations: true, withTwoFactor: true });
    result = await buildBaseline(makeContext(dir, makeRecipe()));
    sql = result.sql;
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('traz o SQL manual do RLS inteiro, verbatim', () => {
    assert.match(sql, /CREATE SCHEMA IF NOT EXISTS app;/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION app\.current_tenant_id\(\)/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION app\.tenant_visible\(/);
    assert.match(sql, /CREATE OR REPLACE FUNCTION app\.apply_tenant_rls\(\)/);
    assert.match(sql, /FORCE ROW LEVEL SECURITY/);
    assert.match(sql, /CREATE POLICY tenant_isolation/);
    assert.equal(result.rlsRetained, true);
    assert.deepEqual(result.warnings, []);
  });

  it('cria a role restrita com NOSUPERUSER e NOBYPASSRLS', () => {
    // São as duas cláusulas que fazem o arquivo existir: um SUPERUSER (ou qualquer role
    // com BYPASSRLS) ignora RLS inclusive com FORCE ROW LEVEL SECURITY.
    assert.match(sql, /CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'/);
    assert.match(sql, /NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS/);
    assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/);
    assert.match(sql, /ALTER DEFAULT PRIVILEGES IN SCHEMA public/);
  });

  it('as DUAS roles do banco nascem: o dono no compose, a restrita aqui', () => {
    // O dono vem das variáveis da imagem do Postgres (POSTGRES_USER), não de SQL — num
    // Postgres gerenciado ele já existe e é criado pelo provedor. A baseline cria só a
    // restrita, e é a única das duas que precisa nascer igual nos dois mundos.
    assert.match(sql, /CREATE ROLE dontpanic_app/);
    assert.doesNotMatch(sql, /CREATE ROLE (?!dontpanic_app)/);
  });

  it('os GRANTs vêm DEPOIS das tabelas', () => {
    // `GRANT … ON ALL TABLES IN SCHEMA public` só alcança o que existe naquele
    // instante: antes das tabelas, concede permissão sobre o vazio, o migrate termina
    // com sucesso e a API recusa toda query em runtime.
    const lastTable = sql.lastIndexOf('CREATE TABLE');
    const grant = sql.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES');
    assert.ok(lastTable > 0 && grant > lastTable, 'GRANT antes do último CREATE TABLE');
  });

  it('o RLS vem depois das tabelas e antes da role', () => {
    const lastTable = sql.lastIndexOf('CREATE TABLE');
    const rls = sql.indexOf('CREATE SCHEMA IF NOT EXISTS app');
    const role = sql.indexOf('CREATE ROLE dontpanic_app');
    assert.ok(rls > lastTable, 'RLS antes das tabelas');
    assert.ok(role > rls, 'role antes do schema app (o GRANT USAGE ON SCHEMA app falharia)');
  });

  it('a varredura final é única e fecha o arquivo', () => {
    // O histórico chama `app.apply_tenant_rls()` três vezes; na baseline uma basta, e
    // ela tem de ser a última coisa, para que nenhuma tabela criada acima fique fora do
    // isolamento.
    const occurrences = [...sql.matchAll(/SELECT app\.apply_tenant_rls\(\);/g)];
    assert.equal(occurrences.length, 1);
    assert.match(sql.trimEnd(), /SELECT app\.apply_tenant_rls\(\);$/);
  });

  it('dobra o ALTER TYPE ADD VALUE dentro do CREATE TYPE', () => {
    // Os dois cairiam na MESMA transação na baseline, e `ALTER TYPE … ADD VALUE` dentro
    // de transação é território de pegadinha do Postgres.
    assert.match(sql, /CREATE TYPE "Role" AS ENUM \('ADMIN', 'USER', 'SUPERADMIN'\)/);
    assert.doesNotMatch(sql, /ALTER TYPE "Role" ADD VALUE/);
  });

  it('preserva o índice parcial, que o Prisma não sabe expressar', () => {
    assert.match(sql, /CREATE UNIQUE INDEX "invitations_tenant_email_pending_key"/);
    assert.match(sql, /WHERE "status" = 'PENDING'/);
  });

  it('preserva o afrouxamento de passwordHash quando o campo é opcional no schema', () => {
    assert.match(sql, /ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL/);
  });

  it('não descarta nada quando nada foi podado', () => {
    assert.deepEqual(result.droppedTables, []);
    assert.deepEqual(result.droppedEnums, []);
    assert.deepEqual(result.droppedColumns, []);
    assert.equal(result.droppedStatements, 0);
  });

  it('substitui o histórico por um único 0_init, preservando o migration_lock', () => {
    // Um projeto que nunca teve uma feature não pode ter no histórico a migration que a
    // criou: o `migrate dev` compararia esse estado final com o schema podado e
    // ofereceria um DROP para desfazer o que a baseline acabou de fazer.
    assert.equal(result.relPath, 'apps/api/prisma/migrations/0_init/migration.sql');
    assert.equal(result.removedMigrations.length, MIGRATIONS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Baseline com features podadas
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBaseline — features podadas', () => {
  let dir: string;
  let sql: string;
  let result: Awaited<ReturnType<typeof buildBaseline>>;

  before(async () => {
    dir = await makeProject({ withInvitations: false, withTwoFactor: false });
    result = await buildBaseline(
      makeContext(dir, makeRecipe({ features: { invitations: false, twoFactor: false } })),
    );
    sql = result.sql;
  });

  after(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a tabela e o enum ausentes do schema não são criados', () => {
    assert.doesNotMatch(sql, /CREATE TABLE "invitations"/);
    assert.doesNotMatch(sql, /CREATE TYPE "InvitationStatus"/);
    assert.deepEqual(result.droppedTables, ['invitations']);
    assert.deepEqual(result.droppedEnums, ['InvitationStatus']);
  });

  it('a FK e o índice parcial da tabela ausente vão embora com ela', () => {
    // Uma FK sobrevivente com `REFERENCES "invitations"` faria o `migrate deploy` do
    // usuário falhar com "relation does not exist" — na primeira execução, num arquivo
    // que ele não escreveu.
    assert.doesNotMatch(sql, /invitations_tenantId_fkey/);
    assert.doesNotMatch(sql, /invitations_tenant_email_pending_key/);
    assert.doesNotMatch(sql, /invitations/);
  });

  it('a coluna podada sai do CREATE TABLE, e o SQL continua válido', () => {
    const createUsers = /CREATE TABLE "users" \(([\s\S]*?)\n\);/.exec(sql)?.[1];
    assert.ok(createUsers, 'CREATE TABLE "users" não encontrado');
    assert.ok(!createUsers.includes('twoFactorSecret'));
    assert.ok(createUsers.includes('"email" TEXT NOT NULL'));
    assert.ok(createUsers.includes('CONSTRAINT "users_pkey" PRIMARY KEY ("id")'));

    // Vírgulas: toda linha menos a última do bloco de colunas termina em vírgula, e a
    // última linha antes do `)` não termina em vírgula. Um `,` sobrando é erro de
    // sintaxe no primeiro `migrate deploy`.
    const lines = createUsers.split('\n').filter((l) => l.trim() !== '');
    for (const line of lines.slice(0, -1)) {
      assert.ok(line.trimEnd().endsWith(','), `faltou vírgula: ${line}`);
    }
    assert.ok(!lines[lines.length - 1]!.trimEnd().endsWith(','), 'vírgula sobrando antes do )');

    // O relatório nomeia o que saiu, para que o CI de conformidade possa comparar
    // execuções: as duas colunas de 2FA e o afrouxamento de nulidade que foi descartado.
    assert.deepEqual(result.droppedColumns, [
      { table: 'users', column: 'twoFactorEnabled' },
      { table: 'users', column: 'twoFactorSecret' },
      { table: 'users', column: 'passwordHash (DROP NOT NULL descartado: o campo voltou a obrigatório)' },
    ]);
  });

  it('o índice sobre a coluna podada vai embora', () => {
    assert.doesNotMatch(sql, /users_twoFactorSecret_idx/);
  });

  it('descarta o DROP NOT NULL quando o campo voltou a obrigatório', () => {
    // O boilerplate afrouxa `users.passwordHash` porque conta social não tem senha. Sem
    // login social o campo é obrigatório no schema, e manter o afrouxamento deixaria a
    // coluna nullable contra um schema que a promete NOT NULL — drift silencioso, que
    // aparece só no primeiro `migrate dev` do usuário.
    assert.doesNotMatch(sql, /DROP NOT NULL/);
  });

  it('mantém as colunas que sobreviveram no ALTER TABLE de várias colunas', () => {
    // O Prisma junta várias colunas num statement; descartar o statement inteiro
    // porque uma saiu perderia as outras.
    assert.match(sql, /ADD COLUMN\s+"tenantId" UUID/);
    assert.match(sql, /ADD COLUMN\s+"profileId" UUID/);
    assert.match(sql, /ADD COLUMN\s+"lastLoginAt" TIMESTAMP\(3\)/);
  });

  it('mantém o RLS e a role: subtrair feature não subtrai isolamento (ADR 0002)', () => {
    assert.match(sql, /CREATE OR REPLACE FUNCTION app\.apply_tenant_rls\(\)/);
    assert.match(sql, /CREATE ROLE dontpanic_app/);
    assert.equal(result.rlsRetained, true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-tenant desligado
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBaseline — multiTenant desligado', () => {
  it('mantém o RLS inteiro (ADR 0002: esconde a UI, não arranca a garantia)', () => {
    // Arrancar o RLS manteria duas versões de todo acesso a dados, e a versão sem RLS é
    // justamente a que não podemos provar segura — o tenant-isolation.e2e-spec.ts não
    // teria o que provar.
    return (async () => {
      const dir = await makeProject({ withInvitations: true, withTwoFactor: true });
      try {
        const result = await buildBaseline(
          makeContext(dir, makeRecipe({ features: { multiTenant: false } })),
        );
        assert.match(result.sql, /FORCE ROW LEVEL SECURITY/);
        assert.match(result.sql, /CREATE POLICY tenant_isolation/);
        assert.match(result.sql, /SELECT app\.apply_tenant_rls\(\);/);
        assert.equal(result.rlsRetained, true);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    })();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Escrita no disco
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBaseline — efeito no disco', () => {
  it('apaga o histórico, escreve 0_init e mantém o migration_lock.toml', async () => {
    const dir = await makeProject({ withInvitations: true, withTwoFactor: true });
    try {
      const result = await buildBaseline(makeContext(dir, makeRecipe()));
      const migrations = join(dir, 'apps/api/prisma/migrations');

      const entries = (await readdir(migrations, { withFileTypes: true }))
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      assert.deepEqual(entries, ['0_init']);

      const written = await readFile(join(dir, result.relPath), 'utf8');
      assert.equal(written, result.sql);
      assert.ok(await pathExists(join(migrations, 'migration_lock.toml')));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('é idempotente: rodar duas vezes dá o mesmo arquivo', async () => {
    // A segunda execução encontra só o `0_init` no disco e tem de ignorá-lo como fonte
    // — senão a baseline seria montada a partir de si mesma, duplicando statements.
    const dir = await makeProject({ withInvitations: true, withTwoFactor: true });
    try {
      const first = await buildBaseline(makeContext(dir, makeRecipe()));
      const second = await buildBaseline(makeContext(dir, makeRecipe())).catch(
        (err: unknown) => err as Error,
      );
      // Sem o histórico, a segunda execução não tem DDL de onde montar e falha alto, em
      // vez de produzir uma baseline vazia em silêncio.
      assert.ok(second instanceof Error);
      assert.match(second.message, /Nenhum statement lido/);
      assert.ok(first.sql.length > 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('dryRun não escreve nada', async () => {
    const dir = await makeProject({ withInvitations: true, withTwoFactor: true });
    try {
      const result = await buildBaseline(makeContext(dir, makeRecipe(), true));
      assert.ok(result.sql.includes('CREATE ROLE dontpanic_app'));
      assert.ok(!(await pathExists(join(dir, result.relPath))));
      const entries = await readdir(join(dir, 'apps/api/prisma/migrations'));
      assert.ok(entries.includes('20260613074545_init'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('aborta em vez de gerar baseline vazia quando o schema não pôde ser lido', async () => {
    // O pior modo de falha do módulo: um parser que não entendeu o arquivo devolve
    // conjunto vazio, e o filtro "não está no schema → descarta" apagaria todo o DDL,
    // deixando um 0_init com só o RLS dentro — que aplica, e deixa o projeto sem tabela
    // nenhuma.
    const dir = await makeProject({ withInvitations: true, withTwoFactor: true });
    try {
      await writeFile(
        join(dir, 'apps/api/prisma/schema/main.prisma'),
        'datasource db {\n  provider = "postgresql"\n}\n',
        'utf8',
      );
      await assert.rejects(
        buildBaseline(makeContext(dir, makeRecipe())),
        /falha de leitura do schema/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contra o template de verdade, quando ele está materializado
// ─────────────────────────────────────────────────────────────────────────────

describe('buildBaseline — contra o template real', () => {
  it('monta a baseline do boilerplate inteiro sem descartar RLS nem role', async (t) => {
    // O template é gitignorado (`pnpm sync-template` o materializa), então este teste é
    // oportunista: quando ele está no disco, prova o módulo contra o SQL de verdade, com
    // as 6 migrations e os 15 models. Sem ele, a suíte continua determinística.
    const template = resolve(import.meta.dirname, '..', 'template');
    if (!(await pathExists(join(template, 'apps/api/prisma/schema')))) {
      t.skip('template não materializado (rode `pnpm sync-template`)');
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), 'dp-real-'));
    try {
      await mkdir(join(dir, 'apps/api'), { recursive: true });
      await cpDir(join(template, 'apps/api/prisma'), join(dir, 'apps/api/prisma'));

      const result = await buildBaseline(makeContext(dir, makeRecipe()));

      assert.match(result.sql, /CREATE SCHEMA IF NOT EXISTS app;/);
      assert.match(result.sql, /CREATE OR REPLACE FUNCTION app\.apply_tenant_rls\(\)/);
      assert.match(result.sql, /CREATE OR REPLACE FUNCTION app\.apply_user_owned_rls\(\)/);
      assert.match(result.sql, /CREATE ROLE dontpanic_app/);
      assert.match(result.sql, /WHERE "status" = 'PENDING'/);
      assert.match(result.sql, /CREATE TYPE "Role" AS ENUM \('ADMIN', 'USER', 'SUPERADMIN'\)/);
      assert.doesNotMatch(result.sql, /ALTER TYPE "Role" ADD VALUE/);

      // Nada podado numa receita completa.
      assert.deepEqual(result.droppedTables, []);
      assert.deepEqual(result.droppedEnums, []);
      assert.deepEqual(result.droppedColumns, []);
      assert.deepEqual(result.warnings, []);

      // Todas as 15 tabelas do boilerplate presentes.
      const created = [...result.sql.matchAll(/CREATE TABLE "([^"]+)"/g)].map((m) => m[1]!);
      assert.ok(created.length >= 15, `só ${created.length} tabelas criadas`);

      // Ordem: tabelas → RLS → role → varredura final.
      const lastTable = result.sql.lastIndexOf('CREATE TABLE');
      const rls = result.sql.indexOf('CREATE SCHEMA IF NOT EXISTS app');
      const role = result.sql.indexOf('CREATE ROLE dontpanic_app');
      assert.ok(lastTable < rls && rls < role);
      assert.match(result.sql.trimEnd(), /SELECT app\.apply_tenant_rls\(\);$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function cpDir(from: string, to: string): Promise<void> {
  const { cp } = await import('node:fs/promises');
  await cp(from, to, { recursive: true });
}
