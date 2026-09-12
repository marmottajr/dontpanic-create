/**
 * Teste de integração do pipeline.
 *
 * Gera projetos de verdade a partir do template materializado e verifica as propriedades
 * que precisam valer em toda configuração. Não roda `pnpm install` nem build — isso é o
 * `scripts/conformance.ts`, que leva minutos e vive no CI. Aqui o alvo é o que dá errado
 * em segundos: ordem das etapas, nome remanescente, pares de env que divergem, RLS que
 * escapou.
 *
 * Precisa de `pnpm sync-template` antes. Sem template, os testes são pulados em vez de
 * falharem — um `node --test` vermelho por falta de setup treina a pessoa a ignorar o
 * vermelho.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { generate } from '../src/generate.ts';
import { DEFAULT_PRESET, PRESETS, presetRecipe } from '../src/recipe.ts';
import type { PresetId } from '../src/recipe.ts';
import { deriveNames } from '../src/naming.ts';
import { pathExists } from '../src/util/fs.ts';
import { verifyRename } from '../src/rename.ts';
import { resolveTemplateDir } from '../src/template.ts';
import type { GeneratorContext, Logger, Recipe } from '../src/types.ts';

const silentLogger: Logger = {
  step: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

let templateAvailable = false;
const workdirs: string[] = [];

before(async () => {
  try {
    const dir = await resolveTemplateDir();
    templateAvailable = await pathExists(join(dir, 'package.json'));
  } catch {
    templateAvailable = false;
  }
  if (!templateAvailable) {
    console.log('  (template ausente — rode `pnpm sync-template`; testes pulados)');
  }
});

after(async () => {
  await Promise.all(workdirs.map((d) => rm(d, { recursive: true, force: true })));
});

interface Generated {
  dir: string;
  recipe: Recipe;
  seedPassword: string;
  read: (rel: string) => Promise<string>;
  has: (rel: string) => Promise<boolean>;
}

async function generateProject(
  preset: PresetId,
  displayName = 'Acme Corp',
  slug = 'acme-corp',
): Promise<Generated> {
  const workdir = await mkdtemp(join(tmpdir(), `dp-generate-${preset}-`));
  workdirs.push(workdir);
  const dir = join(workdir, 'projeto');

  const recipe = presetRecipe(preset, { displayName, slug });
  // O install e o git ficam de fora: são caros, dependem de rede, e o que este teste
  // verifica é a transformação de arquivos.
  recipe.options = { ...recipe.options, install: false, git: false, docker: true };

  const ctx: GeneratorContext = {
    recipe,
    names: deriveNames(displayName, slug),
    targetDir: dir,
    templateDir: dir,
    logger: silentLogger,
    dryRun: false,
  };

  const { seedPassword } = await generate(ctx);

  return {
    dir,
    recipe,
    seedPassword,
    read: (rel) => readFile(join(dir, rel), 'utf8'),
    has: (rel) => pathExists(join(dir, rel)),
  };
}

describe('pipeline de geração', () => {
  it('gera o preset default e não deixa sobra do nome antigo', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const p = await generateProject(DEFAULT_PRESET);

    // O próprio pipeline já falharia se sobrasse algo; repetir aqui garante que a
    // verificação está de fato ligada no caminho de execução, e não só disponível.
    const verification = await verifyRename(p.dir, {
      keepEasterEggs: p.recipe.features.easterEggs,
    });
    assert.equal(
      verification.ok,
      true,
      `sobrou: ${verification.blocking.map((o) => `${o.file}:${o.line}`).join(', ')}`,
    );
  });

  it('o escopo pnpm é renomeado em todos os workspaces', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const p = await generateProject(DEFAULT_PRESET);

    for (const rel of ['packages/shared/package.json', 'apps/api/package.json']) {
      const pkg = JSON.parse(await p.read(rel)) as { name: string };
      assert.match(pkg.name, /^@acme-corp\//, `${rel} ficou como ${pkg.name}`);
    }
  });

  it('o .env concorda com o docker-compose sobre usuário e senha do Postgres', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    // Este é o par que trava para sempre quando divergem: o healthcheck roda
    // `pg_isready -U <user>`, nunca passa, e todo `depends_on` fica esperando um
    // container que jamais fica saudável.
    const p = await generateProject(DEFAULT_PRESET);
    const env = await p.read('.env');
    const compose = await p.read('docker-compose.yml');

    // O usuário do Postgres é literal no compose, não interpolado do `.env` — melhor
    // assim, porque não depende de o `.env` estar carregado quando o compose sobe. Então
    // é o compose que é a fonte, e o `.env` que tem de concordar com ele.
    const pgUser = /^\s*POSTGRES_USER:\s*(\S+)\s*$/m.exec(compose)?.[1];
    assert.ok(pgUser, 'POSTGRES_USER ausente do docker-compose.yml');

    assert.ok(
      compose.includes(`pg_isready -U ${pgUser}`),
      `o healthcheck usa um usuário diferente de "${pgUser}" — o container nunca fica ` +
        'saudável e todo `depends_on` espera para sempre',
    );

    const adminUrl = /^DATABASE_ADMIN_URL=(.+)$/m.exec(env)?.[1]?.trim();
    assert.ok(
      adminUrl?.includes(`://${pgUser}:`),
      `DATABASE_ADMIN_URL não conecta como ${pgUser}, o dono que o compose cria`,
    );

    // E a URL da aplicação tem de usar a role RESTRITA, não o dono: um superusuário
    // ignora o RLS mesmo com FORCE ROW LEVEL SECURITY, e aí o isolamento entre empresas
    // vira decoração.
    const appUrl = /^DATABASE_URL=(.+)$/m.exec(env)?.[1]?.trim();
    assert.ok(appUrl, 'DATABASE_URL ausente');
    assert.ok(
      !appUrl.includes(`://${pgUser}:`),
      'DATABASE_URL conecta como o DONO do banco — o RLS deixa de valer',
    );
  });

  it('as URLs de banco são parseáveis — a senha não quebra a connection string', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const p = await generateProject(DEFAULT_PRESET);
    const env = await p.read('.env');

    for (const key of ['DATABASE_URL', 'DATABASE_ADMIN_URL']) {
      const value = new RegExp(`^${key}=(.+)$`, 'm').exec(env)?.[1]?.trim();
      assert.ok(value, `${key} ausente`);
      // Uma senha com `@`, `:` ou `/` produz uma URL que o driver interpreta errado —
      // e o erro fala de host desconhecido, não de senha.
      assert.doesNotThrow(() => new URL(value), `${key} não é URL válida: ${value}`);
    }
  });

  it('a baseline preserva o RLS em toda configuração, inclusive single-tenant', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    // ADR 0002: `--no-multi-tenant` esconde a UI, não arranca o isolamento. Um projeto
    // sem RLS funciona perfeitamente até existir o segundo cliente, então isto não pode
    // depender de revisão humana.
    for (const preset of ['minimal', 'saas'] as PresetId[]) {
      const p = await generateProject(preset, 'Acme', 'acme');
      const baseline = await p.read('prisma/migrations/0_init/migration.sql').catch(async () => {
        return p.read('apps/api/prisma/migrations/0_init/migration.sql');
      });

      assert.match(baseline, /FORCE ROW LEVEL SECURITY/i, `${preset}: sem FORCE RLS`);
      assert.match(baseline, /apply_tenant_rls/i, `${preset}: sem a varredura de RLS`);
      assert.match(baseline, /CREATE ROLE/i, `${preset}: sem a role restrita`);

      // A varredura tem de ser o último statement: qualquer tabela criada depois dela
      // fica fora do isolamento, e isso é silencioso.
      const sweepAt = baseline.lastIndexOf('apply_tenant_rls');
      const lastCreateTable = baseline.toUpperCase().lastIndexOf('CREATE TABLE');
      assert.ok(
        sweepAt > lastCreateTable,
        `${preset}: a varredura de RLS não é o último passo — tabela criada depois fica desprotegida`,
      );
    }
  });

  it('a senha do seed é rotacionada, não derivada do nome', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const a = await generateProject(DEFAULT_PRESET);
    const b = await generateProject(DEFAULT_PRESET);

    assert.notEqual(a.seedPassword, b.seedPassword, 'duas gerações deram a mesma senha');
    // `AcmeCorp42!` seria previsível para quem sabe que o projeto veio do DontPanic — e
    // isso é público.
    assert.doesNotMatch(a.seedPassword, /acme/i, 'a senha contém o nome do projeto');
    assert.doesNotMatch(a.seedPassword, /42!/, 'a senha manteve o formato do boilerplate');
    assert.ok(a.seedPassword.length >= 16, 'senha curta demais');
  });

  it('o projeto nasce sem lockfile, e nenhum CI exige lockfile congelado', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    // O par que hoje quebra o instalador publicado: sem lockfile, `--frozen-lockfile`
    // falha por definição — e falha no primeiro push e no primeiro docker build, que são
    // justamente os momentos em que a pessoa está mostrando o resultado para alguém.
    const p = await generateProject(DEFAULT_PRESET);
    assert.equal(await p.has('pnpm-lock.yaml'), false, 'veio lockfile do boilerplate');

    for (const rel of ['.github/workflows/ci.yml', 'Dockerfile.api', 'Dockerfile.web']) {
      if (!(await p.has(rel))) continue;
      const content = await p.read(rel);
      assert.doesNotMatch(
        content,
        /--frozen-lockfile/,
        `${rel} exige lockfile congelado num projeto que nasce sem lockfile`,
      );
    }
  });

  it('cada preset produz um projeto coerente com a própria receita', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    for (const preset of Object.keys(PRESETS) as PresetId[]) {
      const p = await generateProject(preset, 'Acme', 'acme');

      // Sem captcha, nenhuma chave de captcha no .env; com captcha, as duas metades
      // presentes — a API e o NEXT_PUBLIC. Meio-configurado faz todo submit dar 400
      // para um token que a tela nunca teve como obter.
      const env = await p.read('.env');
      if (p.recipe.features.captcha) {
        assert.match(env, /^CAPTCHA_DRIVER=/m, `${preset}: sem CAPTCHA_DRIVER`);
        assert.match(env, /^NEXT_PUBLIC_CAPTCHA_DRIVER=/m, `${preset}: sem o par NEXT_PUBLIC`);

        const api = /^CAPTCHA_DRIVER=(.+)$/m.exec(env)?.[1]?.trim();
        const web = /^NEXT_PUBLIC_CAPTCHA_DRIVER=(.+)$/m.exec(env)?.[1]?.trim();
        assert.equal(api, web, `${preset}: os dois lados do captcha divergem`);
      }

      // O mesmo raciocínio para o signup público: em desacordo, o formulário renderiza
      // e todo submit responde 403.
      const apiSignup = /^PUBLIC_SIGNUP_ENABLED=(.+)$/m.exec(env)?.[1]?.trim();
      const webSignup = /^NEXT_PUBLIC_SIGNUP_ENABLED=(.+)$/m.exec(env)?.[1]?.trim();
      if (apiSignup !== undefined || webSignup !== undefined) {
        assert.equal(apiSignup, webSignup, `${preset}: os dois lados do signup divergem`);
      }
    }
  });

  it('as quatro variáveis obrigatórias sempre saem preenchidas', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const p = await generateProject(DEFAULT_PRESET);
    const env = await p.read('.env');

    // Estas quatro não têm default no envSchema: ausentes, a API não sobe.
    for (const key of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CSRF_SECRET']) {
      const value = new RegExp(`^${key}=(.+)$`, 'm').exec(env)?.[1]?.trim();
      assert.ok(value && value.length > 0, `${key} vazia ou ausente`);
    }

    const access = /^JWT_ACCESS_SECRET=(.+)$/m.exec(env)?.[1]?.trim();
    const refresh = /^JWT_REFRESH_SECRET=(.+)$/m.exec(env)?.[1]?.trim();
    assert.notEqual(access, refresh, 'os dois segredos de JWT são iguais');
    assert.ok((access?.length ?? 0) >= 32, 'segredo de JWT curto demais');
  });

  it('nenhum arquivo do projeto gerado carrega segredo do boilerplate', async (t) => {
    if (!templateAvailable) return t.skip('template ausente');

    const p = await generateProject(DEFAULT_PRESET);
    // O `.env` da máquina de quem sincronizou o template não pode ter vindo junto.
    assert.equal(await p.has('.env.local'), false);

    const env = await p.read('.env');
    assert.doesNotMatch(env, /DontPanic42!/, 'a senha do boilerplate sobreviveu');
    assert.doesNotMatch(env, /change-?me|troque-?me|placeholder-secret/i, 'segredo placeholder');
  });
});
