import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pruneComposeDependsOn, renderCompose, selectComposeServices } from '../src/compose.ts';
import { DEV_PORTS, buildEnv, envRecord } from '../src/env.ts';
import { makeMinimalRecipe, makeNames, makeRecipe, makeSecrets } from './support.ts';
import type { Recipe } from '../src/types.ts';

function composeOf(recipe: Recipe) {
  const names = makeNames(recipe);
  return renderCompose(recipe, names, makeSecrets(names));
}

function envOf(recipe: Recipe): Record<string, string> {
  const names = makeNames(recipe);
  return envRecord(buildEnv(recipe, names, makeSecrets(names)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Seleção de serviços
// ─────────────────────────────────────────────────────────────────────────────

describe('selectComposeServices', () => {
  it('a receita completa tem os cinco serviços', () => {
    const { services } = selectComposeServices(makeRecipe());
    assert.deepEqual(services, ['postgres', 'redis', 'minio', 'minio-setup', 'mailpit']);
  });

  it('a receita mínima tem só o Postgres', () => {
    // Postgres nunca sai: Prisma + RLS são o núcleo, não um adapter plugável.
    const { services } = selectComposeServices(makeMinimalRecipe());
    assert.deepEqual(services, ['postgres']);
  });

  it('sem fila e com cache em memory, não há Redis', () => {
    const { services, omitted } = selectComposeServices(
      makeMinimalRecipe({ drivers: { cache: 'memory' }, features: { queue: false } }),
    );
    assert.ok(!services.includes('redis'));
    assert.ok(omitted.some((o) => o.service === 'redis'));
  });

  it('cache=redis TEM Redis mesmo sem fila — é a interação fácil de errar', () => {
    // São drivers independentes sobre o MESMO REDIS_URL. Tirar o Redis porque
    // "a fila é memory" faz o cache e o throttler baterem em ECONNREFUSED no primeiro
    // request, e o compose não dá nenhuma pista de que faltou um serviço.
    const recipe = makeMinimalRecipe({
      drivers: { cache: 'redis' },
      features: { queue: false },
    });
    const { services } = selectComposeServices(recipe);
    assert.ok(services.includes('redis'));
    assert.match(composeOf(recipe).yaml, /^ {2}redis:$/m);
  });

  it('fila=bullmq TEM Redis mesmo com cache em memory', () => {
    const recipe = makeMinimalRecipe({
      drivers: { cache: 'memory', queue: 'bullmq' },
      features: { queue: true },
    });
    assert.ok(selectComposeServices(recipe).services.includes('redis'));
  });

  it('storage local tira minio E minio-setup', () => {
    const { services } = selectComposeServices(makeRecipe({ drivers: { storage: 'local' } }));
    assert.ok(!services.includes('minio'));
    assert.ok(!services.includes('minio-setup'));
  });

  it('mail console ou ses tira o mailpit', () => {
    for (const mail of ['console', 'ses'] as const) {
      const { services } = selectComposeServices(makeRecipe({ drivers: { mail } }));
      assert.ok(!services.includes('mailpit'), `mailpit sobrou com MAIL_DRIVER=${mail}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pares que travam o compose se divergirem
// ─────────────────────────────────────────────────────────────────────────────

describe('pares do compose', () => {
  it('POSTGRES_USER ↔ `pg_isready -U` — divergir trava todo depends_on PARA SEMPRE', () => {
    // O healthcheck roda `pg_isready -U <role>`. Se a role não for a que a imagem
    // criou, o healthcheck nunca fica healthy, e `condition: service_healthy` espera
    // indefinidamente, sem erro e sem timeout.
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const { yaml } = composeOf(recipe);

    const user = /POSTGRES_USER:\s*(\S+)/.exec(yaml)?.[1];
    const isready = /pg_isready -U ([^"]+)"/.exec(yaml)?.[1];
    assert.equal(user, names.dbName);
    assert.equal(isready, user);
  });

  it('POSTGRES_DB ↔ o banco das duas URLs do .env', () => {
    const recipe = makeRecipe();
    const { yaml } = composeOf(recipe);
    const env = envOf(recipe);

    const db = /POSTGRES_DB:\s*(\S+)/.exec(yaml)?.[1];
    assert.equal(new URL(env.DATABASE_URL!).pathname, `/${db}`);
    assert.equal(new URL(env.DATABASE_ADMIN_URL!).pathname, `/${db}`);
  });

  it('POSTGRES_PASSWORD ↔ senha de DATABASE_ADMIN_URL', () => {
    // A URL de admin é a que roda migrate e seed; senha divergente falha no primeiro
    // `db:migrate`, que é o passo seguinte ao `docker compose up` no README.
    const recipe = makeRecipe();
    const { yaml } = composeOf(recipe);
    const env = envOf(recipe);

    const password = /POSTGRES_PASSWORD:\s*(\S+)/.exec(yaml)?.[1];
    assert.equal(new URL(env.DATABASE_ADMIN_URL!).password, password);
  });

  it('MINIO_ROOT_USER/PASSWORD ↔ S3_ACCESS_KEY/SECRET_KEY ↔ `mc alias set`', () => {
    // Três lugares, um valor. Divergir dá container saudável, bucket inexistente e
    // SignatureDoesNotMatch em todo upload — três sintomas que não apontam um para o
    // outro.
    const recipe = makeRecipe();
    const { yaml } = composeOf(recipe);
    const env = envOf(recipe);

    const rootUser = /MINIO_ROOT_USER:\s*(\S+)/.exec(yaml)?.[1];
    const rootPassword = /MINIO_ROOT_PASSWORD:\s*(\S+)/.exec(yaml)?.[1];
    const alias = /mc alias set local http:\/\/minio:9000 (\S+) (\S+);/.exec(yaml);

    assert.equal(rootUser, env.S3_ACCESS_KEY);
    assert.equal(rootPassword, env.S3_SECRET_KEY);
    assert.equal(alias?.[1], rootUser);
    assert.equal(alias?.[2], rootPassword);
  });

  it('bucket do `mc mb` ↔ S3_BUCKET ↔ sufixo de S3_PUBLIC_URL', () => {
    const recipe = makeRecipe();
    const { yaml } = composeOf(recipe);
    const env = envOf(recipe);

    const bucket = /mc mb --ignore-existing local\/(\S+);/.exec(yaml)?.[1];
    assert.equal(bucket, env.S3_BUCKET);
    assert.equal(new URL(env.S3_PUBLIC_URL!).pathname, `/${bucket}`);
    assert.match(yaml, new RegExp(`mc anonymous set download local/${bucket};`));
  });

  it('as portas publicadas são as mesmas que o .env declara', () => {
    const recipe = makeRecipe();
    const { yaml } = composeOf(recipe);
    const env = envOf(recipe);

    for (const [key, port] of [
      ['POSTGRES_PORT', DEV_PORTS.postgres],
      ['REDIS_PORT', DEV_PORTS.redis],
      ['MINIO_PORT', DEV_PORTS.minio],
      ['MINIO_CONSOLE_PORT', DEV_PORTS.minioConsole],
      ['MAILPIT_SMTP_PORT', DEV_PORTS.mailpitSmtp],
      ['MAILPIT_UI_PORT', DEV_PORTS.mailpitUi],
    ] as const) {
      assert.equal(env[key], String(port));
      // O compose usa o default interpolado; se o .env mudar, o compose acompanha.
      assert.match(yaml, new RegExp(`\\$\\{${key}:-${port}\\}`));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forma do arquivo
// ─────────────────────────────────────────────────────────────────────────────

describe('renderCompose', () => {
  it('declara volume só para os serviços que existem', () => {
    const full = composeOf(makeRecipe());
    assert.deepEqual(full.volumes, ['postgres_data', 'redis_data', 'minio_data']);

    const minimal = composeOf(makeMinimalRecipe());
    assert.deepEqual(minimal.volumes, ['postgres_data']);
    // Volume órfão não é erro de sintaxe, mas cria um volume do docker que ninguém
    // remove e que reaparece em `docker volume ls` de todo projeto gerado.
    assert.ok(!minimal.yaml.includes('redis_data'));
    assert.ok(!minimal.yaml.includes('minio_data'));
  });

  it('nomeia os containers com o slug do projeto', () => {
    const { yaml } = composeOf(makeRecipe());
    assert.match(yaml, /container_name: acme-corp-postgres/);
    assert.match(yaml, /container_name: acme-corp-redis/);
    assert.doesNotMatch(yaml, /dontpanic/i);
  });

  it('explica no cabeçalho a ordem up → migrate → dev', () => {
    // A role restrita nasce na migration, não no compose: quem rodar `pnpm dev` antes
    // do `db:migrate` recebe um erro de autenticação e nenhuma pista do motivo.
    const { yaml } = composeOf(makeRecipe());
    assert.match(yaml, /db:migrate/);
    assert.match(yaml, /acme_corp_app/);
  });

  it('lista os serviços omitidos, com motivo, em comentário', () => {
    const { yaml, omitted } = composeOf(makeMinimalRecipe());
    assert.ok(omitted.length >= 3);
    for (const { service } of omitted) {
      assert.match(yaml, new RegExp(`· ${service}:`));
    }
  });

  it('não deixa `depends_on` apontando para serviço ausente', () => {
    // O único depends_on do compose principal é o do minio-setup; se o minio saiu, o
    // serviço inteiro saiu com ele.
    const { yaml } = composeOf(makeMinimalRecipe());
    assert.ok(!yaml.includes('depends_on'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Poda do override de dev
// ─────────────────────────────────────────────────────────────────────────────

const DEV_OVERRIDE = `services:
  api:
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      deps:
        condition: service_completed_successfully
    environment:
      REDIS_URL: redis://redis:6379

  worker:
    depends_on:
      redis:
        condition: service_healthy
      api:
        condition: service_started
`;

describe('pruneComposeDependsOn', () => {
  it('remove a dependência do serviço que saiu, e só ela', () => {
    // Deixar `redis: condition: service_healthy` sem o serviço faz o
    // `docker compose up` esperar PARA SEMPRE, sem erro e sem timeout.
    const pruned = pruneComposeDependsOn(DEV_OVERRIDE, ['redis']);
    assert.ok(!/^\s+redis:\s*$/m.test(pruned));
    assert.match(pruned, /postgres:\n\s+condition: service_healthy/);
    assert.match(pruned, /deps:\n\s+condition: service_completed_successfully/);
    // O que não é depends_on fica: a variável de ambiente é problema do .env.
    assert.match(pruned, /REDIS_URL: redis:\/\/redis:6379/);
  });

  it('remove o `depends_on` que ficou sem nenhum filho', () => {
    // `depends_on:` sem filho é `null` no YAML, e o compose recusa o arquivo.
    const pruned = pruneComposeDependsOn(DEV_OVERRIDE, ['redis', 'api']);
    const workerBlock = pruned.slice(pruned.indexOf('worker:'));
    assert.ok(!workerBlock.includes('depends_on'));
  });

  it('não toca em nada quando nada saiu', () => {
    assert.equal(pruneComposeDependsOn(DEV_OVERRIDE, []), DEV_OVERRIDE);
  });

  it('pruneComposeDevOverride reescreve o arquivo do projeto, e é no-op sem ele', async () => {
    // `fs` é namespace e não binding solto: desestruturar de um módulo do Node separa o
    // método do objeto e dispara `unbound-method`, e a regra está certa em princípio.
    const { pruneComposeDevOverride } = await import('../src/compose.ts');

    const dir = await fs.mkdtemp(join(tmpdir(), 'dp-compose-'));
    try {
      // Sem o arquivo: nada a fazer, e o chamador não deve relatar um passo que não
      // aconteceu.
      assert.equal(await pruneComposeDevOverride(dir, [{ service: 'redis' }]), null);

      await fs.writeFile(join(dir, 'docker-compose.dev.yml'), DEV_OVERRIDE, 'utf8');
      const result = await pruneComposeDevOverride(dir, [{ service: 'redis' }]);
      assert.deepEqual(result, { file: 'docker-compose.dev.yml', removed: ['redis'] });

      const written = await fs.readFile(join(dir, 'docker-compose.dev.yml'), 'utf8');
      assert.ok(!/^\s+redis:\s*$/m.test(written));

      // Idempotente: rodar de novo não encontra mais nada para tirar.
      assert.equal(await pruneComposeDevOverride(dir, [{ service: 'redis' }]), null);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('não apaga a DEFINIÇÃO de um serviço homônimo', () => {
    // `redis:` aparece como chave de serviço e como chave de dependência. Só a segunda
    // sai — e é o `condition:` na linha seguinte que as distingue.
    const main = `services:\n  redis:\n    image: redis:7-alpine\n`;
    assert.equal(pruneComposeDependsOn(main, ['redis']), main);
  });
});
