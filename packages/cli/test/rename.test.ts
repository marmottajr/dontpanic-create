import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { deriveNames } from '../src/naming.ts';
import {
  DEFAULT_RENAME_EXCEPTIONS,
  RENAME_RULE_ORDER,
  applyBranding,
  applyRename,
  formatVerificationFailure,
  generateSeedPassword,
  renameText,
  verifyRename,
} from '../src/rename.ts';
import { assertWithin } from '../src/util/fs.ts';
import { FEATURE_IDS } from '../src/types.ts';
import type { FeatureSelection, GeneratorContext, Logger, Recipe } from '../src/types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Andaime
// ─────────────────────────────────────────────────────────────────────────────

const silentLogger: Logger = {
  step: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/** Monta uma árvore em tmpdir. Chaves são caminhos relativos com `/`. */
async function fixture(files: Record<string, string | Uint8Array>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dpc-rename-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    if (typeof content === 'string') await writeFile(abs, content, 'utf8');
    else await writeFile(abs, content);
  }
  return root;
}

function makeCtx(
  targetDir: string,
  displayName: string,
  slug: string,
  easterEggs = true,
): GeneratorContext {
  const features = Object.fromEntries(FEATURE_IDS.map((id) => [id, true])) as FeatureSelection;
  features.easterEggs = easterEggs;
  const recipe: Recipe = {
    v: 1,
    project: { displayName, slug },
    features,
    drivers: {
      db: 'postgresql',
      storage: 's3',
      mail: 'smtp',
      cache: 'redis',
      queue: 'bullmq',
      captcha: 'none',
    },
    i18n: { locales: ['en-US'], defaultLocale: 'en-US' },
    oauth: { providers: [] },
    options: { git: false, install: false, docker: true, force: false },
  };
  return {
    recipe,
    names: deriveNames(displayName, slug),
    targetDir,
    templateDir: targetDir,
    logger: silentLogger,
    dryRun: false,
  };
}

const acme = deriveNames('Acme Corp', 'acme-corp');
const rtAcme = { names: acme, seedPassword: 'SENHA-FIXA-DO-TESTE' };

const read = (root: string, rel: string): Promise<string> => readFile(join(root, rel), 'utf8');

// ─────────────────────────────────────────────────────────────────────────────
// A ordem — o bug mais fácil de introduzir e o mais difícil de ver
// ─────────────────────────────────────────────────────────────────────────────

describe('ordem das regras', () => {
  it('congela a ordem por especificidade', () => {
    // Este teste existe para FALHAR quando alguém reordena a lista, inclusive
    // "organizando em ordem alfabética". Cada inversão abaixo tem uma consequência:
    // `bare` antes de `dbRole` produz `acme-corp_app`, um identificador que o Postgres
    // recusa sem aspas; `bare` antes de `guard:createPkg` renomeia o pacote do gerador.
    assert.deepEqual(RENAME_RULE_ORDER, [
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
    ]);
  });

  it('resolve todos os tokens na MESMA linha, cada um com a forma certa', () => {
    // O caso que o briefing pede nominalmente. O perigo é o motor pegar o `dontpanic`
    // de dentro de `dontpanic_app`, `@dontpanic/shared` e `dontpanic.dev` — e o
    // resultado não dar erro, só ficar errado.
    const line = 'dontpanic dontpanic_app dontpanic_e2e @dontpanic/shared dontpanic.dev';
    assert.equal(
      renameText(line, rtAcme),
      'acme-corp acme_corp_app acme_corp_e2e @acme-corp/shared acme-corp.dev',
    );
  });

  it('usa snake nos identificadores SQL e slug no resto — porque hífen é ilegal num e no outro', () => {
    // A razão de `dbRole`/`dbName` existirem separados de `slug`: `CREATE ROLE
    // acme-corp_app` não compila (hífen precisa de aspas duplas), e
    // `S3_BUCKET=acme_corp` a AWS recusa (bucket não aceita sublinhado). O mesmo slug
    // tem de sair das duas formas.
    assert.equal(renameText('dontpanic_app', rtAcme), 'acme_corp_app');
    assert.equal(renameText('S3_BUCKET=dontpanic', rtAcme), 'S3_BUCKET=acme-corp');
    assert.equal(renameText('POSTGRES_USER: dontpanic', rtAcme), 'POSTGRES_USER: acme_corp');
  });
});

describe('não-encadeamento', () => {
  // O slug `dontpanic-two` é escolhido de propósito: a substituição da regra `bare`
  // PRODUZ texto que a própria `bare` casaria, e `dontpanic-two` também casa a regra
  // `dockerName` (`dontpanic-`). Num motor de N passadas de regex o resultado seria
  // `dontpanic-two-two`; numa passada única o cursor já passou do texto escrito.
  const rt = { names: deriveNames('Dontpanic Two', 'dontpanic-two'), seedPassword: 'x' };

  it('não reprocessa o que acabou de escrever', () => {
    assert.equal(renameText('dontpanic', rt), 'dontpanic-two');
    assert.equal(renameText('@dontpanic/shared', rt), '@dontpanic-two/shared');
    assert.equal(renameText('dontpanic_app', rt), 'dontpanic_two_app');
    assert.equal(renameText('dontpanic.dev', rt), 'dontpanic-two.dev');
  });

  it('é idempotente sobre o próprio resultado em uma passada', () => {
    const once = renameText('dontpanic dontpanic_app @dontpanic/web', rt);
    assert.equal(once, 'dontpanic-two dontpanic_two_app @dontpanic-two/web');
    // Uma SEGUNDA chamada reintroduz o problema — e é isso que prova que a passada
    // única é a garantia, não um detalhe de implementação. Se este assert algum dia
    // passar a dar `once`, é porque alguém adicionou word-boundary e o motor deixou de
    // renomear ocorrências legítimas.
    assert.notEqual(renameText(once, rt), once);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Uma asserção por classe de ocorrência do mapa
// ─────────────────────────────────────────────────────────────────────────────

describe('classes de ocorrência', () => {
  const cases: [string, string, string][] = [
    ['C1–C4 escopo pnpm', '@dontpanic/shared', '@acme-corp/shared'],
    ['C1 escopo em import', "import { x } from '@dontpanic/shared';", "import { x } from '@acme-corp/shared';"],
    ['C3 escopo em eslint', "import base from '@dontpanic/config/eslint';", "import base from '@acme-corp/config/eslint';"],
    [
      'C1 --filter (a costura que sai com código 0 quando não casa)',
      'RUN pnpm --filter @dontpanic/shared build',
      'RUN pnpm --filter @acme-corp/shared build',
    ],
    ['C1 --filter com sinal de igual', 'pnpm --filter=@dontpanic/api build', 'pnpm --filter=@acme-corp/api build'],
    ['C6 role SQL', 'GRANT USAGE ON SCHEMA app TO dontpanic_app;', 'GRANT USAGE ON SCHEMA app TO acme_corp_app;'],
    [
      'C6 role + senha na mesma linha (migration.sql:18)',
      "CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'",
      "CREATE ROLE acme_corp_app LOGIN PASSWORD 'acme_corp_app'",
    ],
    ['C7 banco de e2e', "const E2E_DB = 'dontpanic_e2e';", "const E2E_DB = 'acme_corp_e2e';"],
    [
      'C6+C8 DSN da role restrita',
      'DATABASE_URL=postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic?schema=public',
      'DATABASE_URL=postgresql://acme_corp_app:acme_corp_app@localhost:4202/acme_corp?schema=public',
    ],
    [
      'C8 DSN do dono do banco',
      'DATABASE_ADMIN_URL=postgresql://dontpanic:dontpanic@localhost:4202/dontpanic?schema=public',
      'DATABASE_ADMIN_URL=postgresql://acme_corp:acme_corp@localhost:4202/acme_corp?schema=public',
    ],
    [
      'C7 DSN do e2e',
      "'postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic_e2e?schema=public'",
      "'postgresql://acme_corp_app:acme_corp_app@localhost:4202/acme_corp_e2e?schema=public'",
    ],
    ['C8 healthcheck', 'test: ["CMD-SHELL", "pg_isready -U dontpanic"]', 'test: ["CMD-SHELL", "pg_isready -U acme_corp"]'],
    ['C8 bucket criado pelo mc', 'mc mb --ignore-existing local/dontpanic;', 'mc mb --ignore-existing local/acme-corp;'],
    ['C8 fila', 'QUEUE_PREFIX={dontpanic}', 'QUEUE_PREFIX={acme-corp}'],
    ['C9 domínio', "const ADMIN_EMAIL = 'admin@dontpanic.dev';", "const ADMIN_EMAIL = 'admin@acme-corp.dev';"],
    ['C10 container', 'container_name: dontpanic-postgres', 'container_name: acme-corp-postgres'],
    ['C10 tag de imagem', 'tags: dontpanic-${{ matrix.app }}:ci', 'tags: acme-corp-${{ matrix.app }}:ci'],
    ['C11 Pascal', 'TOTP_ISSUER=DontPanic', 'TOTP_ISSUER=AcmeCorp'],
    [
      'C11+C9 MAIL_FROM',
      'MAIL_FROM="DontPanic <no-reply@dontpanic.dev>"',
      'MAIL_FROM="AcmeCorp <no-reply@acme-corp.dev>"',
    ],
    ['C16 Apple Services ID', '#     dev.dontpanic.web). NOT the App ID', '#     dev.acme-corp.web). NOT the App ID'],
    ['C17 chave i18n camelCase', '"dontPanic": "…"', '"acmeCorp": "…"'],
    ['C18 nome de arquivo de download', "'dontpanic-backup-codes.txt'", "'acme-corp-backup-codes.txt'"],
    ['C20 slug do tenant do seed', "where: { slug: 'dontpanic' }", "where: { slug: 'acme-corp' }"],
  ];

  for (const [label, input, expected] of cases) {
    it(label, () => {
      assert.equal(renameText(input, rtAcme), expected);
    });
  }

  it('C5 e C15 são GUARDAS: casam, mas devolvem o texto intacto', () => {
    // Não são o nome do produto e não têm substituto válido: `create-acme` é um pacote
    // npm que ninguém vai publicar, `github.com/marmottajr/acme` é um 404. Mas precisam
    // CASAR, senão a regra `bare` come o `dontpanic` de dentro delas.
    assert.equal(renameText('pnpm --filter create-dontpanic build', rtAcme), 'pnpm --filter create-dontpanic build');
    assert.equal(
      renameText('https://github.com/marmottajr/dontpanic/discussions', rtAcme),
      'https://github.com/marmottajr/dontpanic/discussions',
    );
    // E o guarda tem de vencer mesmo colado ao nome, que é o caso de
    // `packages/create-dontpanic/template`.
    assert.equal(renameText('packages/create-dontpanic/template', rtAcme), 'packages/create-dontpanic/template');
  });

  it('C14 é ROTAÇÃO: a senha do seed não deriva do nome', () => {
    // `AcmeCorp42!` seria adivinhável por quem soubesse que o projeto veio do
    // DontPanic — e isso é público.
    const out = renameText("const PASSWORD = 'DontPanic42!';", rtAcme);
    assert.equal(out, "const PASSWORD = 'SENHA-FIXA-DO-TESTE';");
    assert.ok(!out.includes('AcmeCorp42'));
  });

  it('relata contagem por classe, inclusive as zeradas', async () => {
    const root = await fixture({
      'Dockerfile.api': 'RUN pnpm --filter @dontpanic/shared build\n',
      'docker-compose.yml': 'container_name: dontpanic-postgres\n',
    });
    const result = await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));
    const byId = new Map(result.byRule.map((r) => [r.id, r.occurrences]));

    // "A classe `pnpmFilter` casou 0 vezes" é o sinal de que a costura sumiu do
    // template — e um relatório que omite as classes zeradas não pode dar esse sinal.
    assert.equal(byId.get('pnpmFilter'), 1);
    assert.equal(byId.get('dockerName'), 1);
    assert.equal(byId.get('dbRole'), 0);
    assert.equal(result.byRule.length, RENAME_RULE_ORDER.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O que o motor não deve tocar
// ─────────────────────────────────────────────────────────────────────────────

describe('arquivos poupados', () => {
  it('não reescreve binário, mesmo com o nome antigo dentro', async () => {
    // Nome sem extensão conhecida, de propósito: o que tem de pegar é a sniffagem por
    // byte NUL, não a lista de extensões. Reescrever um binário o corrompe, e o dano só
    // aparece quando alguém tenta abri-lo.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, ...Buffer.from('dontpanic')]);
    const root = await fixture({ 'assets/logo.dat': bytes });

    const result = await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));

    assert.equal(result.skippedBinary, 1);
    assert.equal(result.filesRewritten, 0);
    const after = await readFile(join(root, 'assets/logo.dat'));
    assert.deepEqual(new Uint8Array(after), bytes);
  });

  it('não reescreve lockfile', async () => {
    // O lockfile referencia os pacotes de workspace pelo nome velho. Um lockfile
    // "renomeado com sucesso" descreve pacotes que não existem, e o
    // `pnpm install --frozen-lockfile` do CI do projeto gerado falha falando de
    // integridade, não de nome. O projeto nasce sem lockfile.
    const content = "  '@dontpanic/shared':\n    specifier: workspace:*\n";
    const root = await fixture({ 'pnpm-lock.yaml': content });

    const result = await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));

    assert.equal(result.skippedNeverRewrite, 1);
    assert.equal(await read(root, 'pnpm-lock.yaml'), content);
  });

  it('não atravessa node_modules nem .git', async () => {
    const root = await fixture({
      'node_modules/@dontpanic/shared/package.json': '{ "name": "@dontpanic/shared" }',
      '.git/COMMIT_EDITMSG': 'feat: dontpanic',
      'src/a.ts': "import '@dontpanic/shared';",
    });

    await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));

    assert.match(await read(root, 'node_modules/@dontpanic/shared/package.json'), /@dontpanic\/shared/);
    assert.equal(await read(root, '.git/COMMIT_EDITMSG'), 'feat: dontpanic');
    assert.equal(await read(root, 'src/a.ts'), "import '@acme-corp/shared';");
  });

  it('não atravessa packages/create-dontpanic/template — 373 ocorrências fantasma', async () => {
    const root = await fixture({
      'packages/create-dontpanic/template/README.md': '# DontPanic',
      'README.md': '# DontPanic',
    });

    await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));

    assert.equal(await read(root, 'packages/create-dontpanic/template/README.md'), '# DontPanic');
    assert.equal(await read(root, 'README.md'), '# AcmeCorp');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Caminhos
// ─────────────────────────────────────────────────────────────────────────────

describe('caminhos', () => {
  it('renomeia arquivo e diretório, de baixo para cima', async () => {
    // Renomear um diretório invalida todo caminho coletado abaixo dele. De baixo para
    // cima, os ancestrais de quem já se moveu continuam válidos.
    const root = await fixture({
      'dontpanic-tools/nested/dontpanic-helper.ts': "export const x = 'dontpanic';",
      'dontpanic-tools/README.md': '# tools',
    });

    const result = await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));

    const tools = await readdir(join(root, 'acme-corp-tools'));
    assert.deepEqual(tools.sort(), ['README.md', 'nested']);
    assert.equal(
      await read(root, 'acme-corp-tools/nested/acme-corp-helper.ts'),
      "export const x = 'acme-corp';",
    );
    assert.equal(result.pathsRenamed.length, 2);
  });

  it('não renomeia caminho protegido por guarda', async () => {
    const root = await fixture({ '.github/workflows/publish-create-dontpanic.yml': 'name: publish\n' });
    const result = await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));
    assert.equal(result.pathsRenamed.length, 0);
    assert.ok(await read(root, '.github/workflows/publish-create-dontpanic.yml'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A senha do seed
// ─────────────────────────────────────────────────────────────────────────────

describe('senha do seed', () => {
  it('é rotacionada e diferente entre duas execuções', async () => {
    const build = (): Promise<string> =>
      fixture({ 'apps/api/prisma/seed.ts': "const PASSWORD = 'DontPanic42!';" });

    const [a, b] = await Promise.all([build(), build()]);
    const ra = await applyRename(makeCtx(a, 'Acme Corp', 'acme-corp'));
    const rb = await applyRename(makeCtx(b, 'Acme Corp', 'acme-corp'));

    assert.notEqual(ra.seedPassword, rb.seedPassword);
    assert.ok((await read(a, 'apps/api/prisma/seed.ts')).includes(ra.seedPassword));
    // E nunca a forma derivada do nome, que é o que um rename ingênuo produziria.
    assert.ok(!ra.seedPassword.includes('AcmeCorp'));
    assert.ok(!ra.seedPassword.includes('42!'));
  });

  it('satisfaz o passwordSchema do projeto gerado, por construção', () => {
    // `passwordSchema` exige ≥8, ≤128, uma minúscula, uma maiúscula e um dígito. Por
    // construção e não por sorteio: 200 amostras só confirmam que a construção é a que
    // está escrita.
    for (let i = 0; i < 200; i += 1) {
      const pw = generateSeedPassword();
      assert.ok(pw.length >= 12 && pw.length <= 128, pw);
      assert.match(pw, /[a-z]/);
      assert.match(pw, /[A-Z]/);
      assert.match(pw, /[0-9]/);
      // Só alfanumérico: a mesma string entra num literal TS de aspas simples, numa
      // célula de tabela Markdown e num `psql`. Escaping em três gramáticas custa mais
      // que comprimento.
      assert.match(pw, /^[A-Za-z0-9]+$/, pw);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contenção
// ─────────────────────────────────────────────────────────────────────────────

describe('contenção de caminho', () => {
  it('assertWithin recusa escapar do destino', async () => {
    const root = await fixture({ 'a.ts': 'x' });
    assert.throws(() => assertWithin(root, '../evil.ts'), /fora do diretório do projeto/);
    assert.throws(() => assertWithin(root, join(root, '..', 'evil.ts')), /fora do diretório do projeto/);
    // E o caminho legítimo passa, devolvendo absoluto.
    assert.equal(assertWithin(root, 'a.ts'), join(root, 'a.ts'));
  });

  it('applyRename não escreve nada fora do destino', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dpc-jail-'));
    const target = join(parent, 'project');
    const sibling = join(parent, 'sibling');
    await mkdir(target, { recursive: true });
    await mkdir(sibling, { recursive: true });
    await writeFile(join(target, 'a.ts'), "import '@dontpanic/shared';", 'utf8');

    await applyRename(makeCtx(target, 'Acme Corp', 'acme-corp'));

    assert.deepEqual(await readdir(sibling), []);
    assert.deepEqual(await readdir(parent), ['project', 'sibling']);
  });

  it('dryRun não escreve, mas conta', async () => {
    const root = await fixture({ 'a.ts': "import '@dontpanic/shared';" });
    const ctx = { ...makeCtx(root, 'Acme Corp', 'acme-corp'), dryRun: true };
    const result = await applyRename(ctx);
    assert.equal(result.filesRewritten, 1);
    assert.equal(await read(root, 'a.ts'), "import '@dontpanic/shared';");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Branding
// ─────────────────────────────────────────────────────────────────────────────

describe('applyBranding', () => {
  const brandFixture = (): Promise<string> =>
    fixture({
      // As três formas do apóstrofo, byte-distintas, cada uma num site real do repo
      // base. A terceira (`&apos;`) o mapa não viu — JSX não aceita apóstrofo cru.
      'apps/api/src/app.service.ts': `hint: "Don't Panic.",`,
      'apps/api/src/infra/queue/job-router.service.spec.ts': "  text: 'Don’t Panic.',\n",
      'apps/web/src/app/error.tsx': '          Don&apos;t Panic.\n',
      // Este arquivo é reescrito INTEIRO (as piadas não contêm a frase-título), então
      // suas ocorrências não entram na contagem da passada de frases — de propósito.
      'apps/api/src/common/marvin.ts': "const FALLBACK = 'Don’t Panic.';\n",
      'apps/api/src/config/env.ts': `throw new Error("Invalid environment variables. Don't Panic, just fix these:");`,
      'apps/api/src/app.controller.ts': `message: "I'm a teapot. I can't brew coffee, but Don't Panic.",`,
      'apps/web/messages/en-US.json':
        '{ "body": "Don\'t Panic. We\'re already on it.", "marvin": "Marvin: “brain the size of a planet”" }',
      'apps/api/src/modules/auth/auth.controller.ts': `message: "Logged out. Don't Panic — your session is gone."`,
    });

  it('com easterEggs LIGADO não toca nas frases — elas sobrevivem de propósito', async () => {
    const root = await brandFixture();
    const result = await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', true));
    assert.equal(result.mode, 'keep');
    assert.equal(result.replacements, 0);
    assert.match(await read(root, 'apps/api/src/app.service.ts'), /Don't Panic\./);
  });

  it('com easterEggs DESLIGADO neutraliza as três formas de apóstrofo', async () => {
    const root = await brandFixture();
    const result = await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', false));
    assert.equal(result.mode, 'neutral');

    // Cada forma tem contador próprio: é isso que prova que nenhuma ficou de fora, e é
    // por isso que a tabela é expandida por forma em vez de usar uma classe de
    // caracteres única.
    const ids = new Set(result.byRule.map((r) => r.id));
    assert.ok([...ids].some((id) => id.endsWith(':straight')), [...ids].join(','));
    assert.ok([...ids].some((id) => id.endsWith(':curly')), [...ids].join(','));
    assert.ok([...ids].some((id) => id.endsWith(':entity')), [...ids].join(','));

    assert.equal(await read(root, 'apps/api/src/app.service.ts'), 'hint: "",');
    assert.equal(await read(root, 'apps/web/src/app/error.tsx'), '          \n');
  });

  it('preserva o texto útil quando a frase é funcional', async () => {
    // `env.ts` monta a mensagem que o operador lê quando o boot falha. Apagar a frase
    // inteira deixaria "Invalid environment variables." sem o imperativo.
    const root = await brandFixture();
    await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', false));
    assert.match(await read(root, 'apps/api/src/config/env.ts'), /Invalid environment variables\. Fix these:/);
  });

  it('remove a oração inteira, não só a frase', async () => {
    const root = await brandFixture();
    await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', false));
    assert.equal(
      await read(root, 'apps/api/src/app.controller.ts'),
      `message: "I'm a teapot. I can't brew coffee.",`,
    );
    // E recapitaliza o que vem depois do travessão: um texto neutro começando em
    // minúscula denuncia a edição automática.
    assert.match(
      await read(root, 'apps/api/src/modules/auth/auth.controller.ts'),
      /Logged out\. Your session is gone\./,
    );
  });

  it('mantém a CHAVE i18n `marvin` e só esvazia o valor — é contrato, não texto', async () => {
    // `ApiErrorBody.marvin` é campo do contrato compartilhado, preenchido pelo filtro
    // global e lido por `error.tsx` via `t('marvin')`. Remover a chave faria `t()`
    // lançar; remover de uma locale só faria a paridade de chaves do web falhar.
    const root = await brandFixture();
    await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', false));
    const messages = await read(root, 'apps/web/messages/en-US.json');
    assert.match(messages, /"marvin":/);
    assert.ok(!messages.includes('planet'));
    // `JSON.parse` devolve `any`; tipar aqui deixa explícito o que se espera do arquivo
    // e mantém o lint capaz de ver erro de acesso.
    const parsed = JSON.parse(messages) as { marvin?: string; body?: string };
    assert.deepEqual(parsed.marvin, '');
    // E o valor neutralizado continua sendo JSON válido — dropar texto DENTRO de uma
    // string não pode quebrar o arquivo.
    assert.equal(parsed.body, "We're already on it.");
  });

  it('reescreve marvin.ts inteiro, preservando a assinatura que o filtro importa', async () => {
    // As piadas não contêm a frase-título, então nenhuma regra de texto as alcança.
    const root = await brandFixture();
    const result = await applyBranding(makeCtx(root, 'Acme Corp', 'acme-corp', false));
    assert.ok(result.filesReplaced.includes('apps/api/src/common/marvin.ts'));
    const marvin = await read(root, 'apps/api/src/common/marvin.ts');
    assert.match(marvin, /export function marvinQuip\(status: number\): string/);
    assert.ok(!marvin.includes('Panic'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Verificação
// ─────────────────────────────────────────────────────────────────────────────

describe('verifyRename', () => {
  it('detecta uma ocorrência plantada, com arquivo e linha', async () => {
    const root = await fixture({
      'a.ts': "import '@acme-corp/shared';\n",
      'src/b.ts': "const a = 1;\nconst db = 'dontpanic_app';\n",
    });

    const v = await verifyRename(root, { keepEasterEggs: true });

    assert.equal(v.ok, false);
    assert.equal(v.blocking.length, 1);
    const [hit] = v.blocking;
    assert.equal(hit?.file, 'src/b.ts');
    assert.equal(hit?.line, 2);
    assert.match(hit?.context ?? '', /dontpanic_app/);
    // A mensagem tem de ser acionável: sem arquivo e linha o usuário recebe
    // "o rename falhou" e nada para fazer com isso.
    assert.match(formatVerificationFailure(v), /src\/b\.ts:2:/);
  });

  it('passa num rename completo', async () => {
    const root = await fixture({
      'package.json': '{ "name": "dontpanic" }',
      'docker-compose.yml':
        'container_name: dontpanic-postgres\nPOSTGRES_USER: dontpanic\ntest: ["CMD-SHELL", "pg_isready -U dontpanic"]\n',
      '.env.example':
        'DATABASE_URL=postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic?schema=public\nTOTP_ISSUER=DontPanic\nS3_BUCKET=dontpanic\n',
      'apps/api/test/global-setup.ts': "const E2E_DB = 'dontpanic_e2e';",
      'apps/web/messages/en-US.json': '{ "dontPanic": "x", "appName": "DontPanic" }',
      'Dockerfile.api': 'RUN pnpm --filter @dontpanic/shared build',
      'apps/api/prisma/seed.ts': "const PASSWORD = 'DontPanic42!';\nconst E = 'admin@dontpanic.dev';",
    });

    await applyRename(makeCtx(root, 'Acme Corp', 'acme-corp'));
    const v = await verifyRename(root, { keepEasterEggs: true });

    assert.deepEqual(v.blocking, []);
    assert.equal(v.ok, true);
  });

  it('é case-insensitive e vê as formas que o grep do mapa não vê', async () => {
    // `Don&apos;t Panic` (JSX), `DON'T&nbsp;PANIC` (template de e-mail) e
    // `Don't%20Panic` (badge do README) não casam `don.t[[:space:]]panic`: há 6, 6 e 3
    // caracteres entre `don` e `t`/`panic`. As duas primeiras vivem em páginas e
    // e-mails que o usuário final enxerga.
    const root = await fixture({
      'error.tsx': 'Don&apos;t Panic.\n',
      'email.ts': "DON'T&nbsp;PANIC\n",
      'README.md': 'badge/Don%27t%20Panic-42\n',
      'weird.ts': 'const x = "DONTPANIC";\n',
    });

    const v = await verifyRename(root, { keepEasterEggs: false });

    const files = new Set(v.blocking.map((o) => o.file));
    assert.ok(files.has('error.tsx'));
    assert.ok(files.has('email.ts'));
    assert.ok(files.has('weird.ts'), 'DONTPANIC em caixa alta tem de ser visto');
  });

  it('tem DOIS modos: a frase do Guia só é defeito quando os easter eggs saíram', async () => {
    const root = await fixture({ 'a.ts': `hint: "Don't Panic.",` });

    const keeping = await verifyRename(root, { keepEasterEggs: true });
    assert.equal(keeping.ok, true, 'com easter eggs ligados a frase sobreviveu de propósito');

    const neutral = await verifyRename(root, { keepEasterEggs: false });
    assert.equal(neutral.ok, false, 'sem easter eggs a frase que ficou é o gerador desobedecendo');
  });

  it('aceita as exceções declaradas, e as REPORTA em vez de escondê-las', async () => {
    const root = await fixture({
      'README.md': 'Gerado a partir de https://github.com/marmottajr/dontpanic\n',
      '.gitignore': 'packages/create-dontpanic/template/\n',
    });

    const v = await verifyRename(root, { keepEasterEggs: true });

    assert.deepEqual(v.blocking, []);
    assert.equal(v.ok, true);
    assert.equal(v.accepted.length, 2);
    assert.deepEqual(
      v.accepted.map((a) => a.exception).sort(),
      ['generator-package-residue', 'upstream-attribution'],
    );
    // Toda exceção carrega justificativa — é o que a torna uma declaração e não um
    // pardon genérico.
    assert.ok(v.accepted.every((a) => a.why.length > 40));
  });

  it('não aceita a exceção fora dos arquivos declarados', async () => {
    // O mesmo token num arquivo que não está na lista continua sendo falha. É assim que
    // `publish-create-dontpanic.yml` sobrevivente aparece em `blocking`: ele deveria ter
    // sido APAGADO pelo manifesto, não perdoado aqui.
    const root = await fixture({ 'src/config.ts': "const pkg = 'create-dontpanic';" });
    const v = await verifyRename(root, { keepEasterEggs: true });
    assert.equal(v.ok, false);
    assert.equal(v.blocking.length, 1);
  });

  it('com exceptions: [] não perdoa nada', async () => {
    const root = await fixture({ 'README.md': 'github.com/marmottajr/dontpanic\n' });
    const v = await verifyRename(root, { keepEasterEggs: true, exceptions: [] });
    assert.equal(v.ok, false);
  });

  it('toda exceção padrão declara arquivos, padrão e justificativa', () => {
    for (const exception of DEFAULT_RENAME_EXCEPTIONS) {
      assert.ok(exception.files.length > 0, exception.id);
      assert.ok(exception.pattern.length > 0, exception.id);
      assert.ok(exception.why.length > 60, `justificativa curta em ${exception.id}`);
    }
  });

  it('ignora binário e lockfile — o motor também os ignora', async () => {
    // Verificar o que o rename não toca produziria falha permanente, e um gate que
    // falha sempre deixa de ser lido.
    const root = await fixture({
      'pnpm-lock.yaml': "'@dontpanic/shared': {}\n",
      'logo.dat': new Uint8Array([0x00, ...Buffer.from('dontpanic')]),
    });
    const v = await verifyRename(root, { keepEasterEggs: true });
    assert.equal(v.ok, true);
    assert.equal(v.filesScanned, 0);
  });
});
