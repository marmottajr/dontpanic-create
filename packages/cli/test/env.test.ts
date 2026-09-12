import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEV_PORTS,
  REQUIRED_ENV_KEYS,
  buildEnv,
  countEnvKeys,
  effectiveDrivers,
  envRecord,
  renderEnv,
} from '../src/env.ts';
import {
  makeMinimalRecipe,
  makeNames,
  makeRecipe,
  makeSecrets,
  parseEnvText,
} from './support.ts';
import type { Recipe } from '../src/types.ts';

function envOf(recipe: Recipe): Record<string, string> {
  const names = makeNames(recipe);
  return envRecord(buildEnv(recipe, names, makeSecrets(names)));
}

function fileOf(recipe: Recipe) {
  const names = makeNames(recipe);
  return buildEnv(recipe, names, makeSecrets(names));
}

// ─────────────────────────────────────────────────────────────────────────────
// As quatro obrigatórias
// ─────────────────────────────────────────────────────────────────────────────

describe('obrigatórias sem default', () => {
  it('as 4 que fazem `validateEnv` recusar subir estão sempre preenchidas', () => {
    for (const recipe of [makeRecipe(), makeMinimalRecipe()]) {
      const env = envOf(recipe);
      for (const key of REQUIRED_ENV_KEYS) {
        assert.ok(env[key], `${key} ausente`);
        assert.notEqual(env[key], '');
      }
      // Os três segredos têm min(16) no schema; DATABASE_URL só min(1).
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CSRF_SECRET']) {
        assert.ok(env[key]!.length >= 16, `${key} com menos de 16 caracteres`);
      }
    }
  });

  it('nenhum enum sai com valor fora do aceito pelo schema', () => {
    // Enum inválido é a condição 5 das 10 que fazem o boot falhar.
    const env = envOf(makeRecipe());
    assert.ok(['development', 'test', 'production'].includes(env.NODE_ENV!));
    assert.ok(['s3', 'local'].includes(env.STORAGE_DRIVER!));
    assert.ok(['smtp', 'ses', 'console'].includes(env.MAIL_DRIVER!));
    assert.ok(['redis', 'memory'].includes(env.CACHE_DRIVER!));
    assert.ok(['bullmq', 'memory'].includes(env.QUEUE_DRIVER!));
    // `DB_PROVIDER` não sai: era declarada no envSchema e nunca lida, e o boilerplate
    // a removeu depois da auditoria. Escolher `mysql` nunca trocou adapter nenhum —
    // só subia a aplicação com o isolamento entre empresas ausente, sem erro em lugar
    // nenhum. Uma chave que não faz nada num .env "explícito" é pior que ausente:
    // convida alguém a mudá-la e a confiar no resultado.
    assert.ok(!Object.hasOwn(env, 'DB_PROVIDER'));
    assert.ok(
      ['none', 'turnstile', 'recaptcha-v2', 'recaptcha-v3'].includes(env.CAPTCHA_DRIVER!),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Armadilha 3: default do schema ≠ default do .env.example
// ─────────────────────────────────────────────────────────────────────────────

describe('explicitude contra os defaults divergentes do envSchema', () => {
  it('escreve as 8 chaves cujo default do schema aponta para a porta errada', () => {
    // API_PORT→3001, REDIS_URL→:6379, WEB_ORIGIN→:3000, API_PUBLIC_URL→:3001,
    // MAIL_PORT→1025, S3_ENDPOINT→:9000, S3_PUBLIC_URL→:9000, LOCAL_STORAGE_PUBLIC_URL
    // →:3001. Omitir qualquer uma faz a API apontar para onde o compose não publicou —
    // e a falha é em RUNTIME, não no boot, que é o que a torna caro de achar.
    const env = envOf(makeRecipe());
    const divergent = [
      'API_PORT',
      'REDIS_URL',
      'WEB_ORIGIN',
      'API_PUBLIC_URL',
      'MAIL_PORT',
      'S3_ENDPOINT',
      'S3_PUBLIC_URL',
      'LOCAL_STORAGE_PUBLIC_URL',
    ];
    for (const key of divergent) {
      assert.ok(Object.hasOwn(env, key), `${key} ficou implícita`);
    }
  });

  it('mantém LOCAL_STORAGE_* mesmo com STORAGE_DRIVER=s3, porque o e2e força local', () => {
    // apps/api/test/e2e-setup.ts seta STORAGE_DRIVER=local. Sem estas duas chaves, o
    // default do schema manda o e2e para http://localhost:3001/files.
    const env = envOf(makeRecipe({ drivers: { storage: 's3' } }));
    assert.equal(env.STORAGE_DRIVER, 's3');
    assert.equal(env.LOCAL_STORAGE_DIR, './storage');
    assert.equal(env.LOCAL_STORAGE_PUBLIC_URL, `http://localhost:${DEV_PORTS.api}/files`);
  });

  it('escreve QUEUE_DRIVER mesmo quando é o único valor possível', () => {
    // O default do schema é `bullmq`. Numa receita sem fila, omitir a chave faria a API
    // procurar um Redis que o compose desta receita não sobe.
    const env = envOf(makeMinimalRecipe());
    assert.equal(env.QUEUE_DRIVER, 'memory');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pares API ↔ NEXT_PUBLIC — um teste por par
// ─────────────────────────────────────────────────────────────────────────────

describe('pares API ↔ NEXT_PUBLIC', () => {
  it('CAPTCHA_DRIVER ↔ NEXT_PUBLIC_CAPTCHA_DRIVER — divergir dá 400 em TODO submit', () => {
    for (const recipe of [
      makeRecipe(),
      makeRecipe({ drivers: { captcha: 'turnstile' } }),
      makeMinimalRecipe(),
    ]) {
      const env = envOf(recipe);
      assert.equal(env.CAPTCHA_DRIVER, env.NEXT_PUBLIC_CAPTCHA_DRIVER);
    }
  });

  it('CAPTCHA_SECRET_KEY ↔ NEXT_PUBLIC_CAPTCHA_SITE_KEY — site key sem secret dá 400', () => {
    // Valores diferentes por natureza, mas as duas metades vazias ou preenchidas juntas.
    const env = envOf(makeRecipe({ drivers: { captcha: 'turnstile' } }));
    assert.equal(env.CAPTCHA_SECRET_KEY, '');
    assert.equal(env.NEXT_PUBLIC_CAPTCHA_SITE_KEY, '');
  });

  it('OAUTH_PROVIDERS ↔ NEXT_PUBLIC_OAUTH_PROVIDERS — nome a mais no web dá botão 404', () => {
    for (const providers of [[], ['google'], ['google', 'apple', 'github']] as const) {
      const env = envOf(makeRecipe({ oauth: { providers: [...providers] } }));
      assert.equal(env.OAUTH_PROVIDERS, env.NEXT_PUBLIC_OAUTH_PROVIDERS);
    }
  });

  it('PUBLIC_SIGNUP_ENABLED ↔ NEXT_PUBLIC_SIGNUP_ENABLED — divergir dá 403 em todo submit', () => {
    for (const publicSignup of [true, false]) {
      const env = envOf(makeRecipe({ features: { publicSignup } }));
      assert.equal(env.PUBLIC_SIGNUP_ENABLED, String(publicSignup));
      assert.equal(env.NEXT_PUBLIC_SIGNUP_ENABLED, env.PUBLIC_SIGNUP_ENABLED);
    }
  });

  it('SENTRY_DSN ↔ NEXT_PUBLIC_SENTRY_DSN — as duas metades existem', () => {
    // Não quebram nada se divergirem, mas meia observabilidade é o tipo de coisa que se
    // descobre no dia do incidente.
    const env = envOf(makeRecipe());
    assert.ok(Object.hasOwn(env, 'SENTRY_DSN'));
    assert.ok(Object.hasOwn(env, 'NEXT_PUBLIC_SENTRY_DSN'));
    assert.equal(env.SENTRY_DSN, env.NEXT_PUBLIC_SENTRY_DSN);
  });

  it('SENTRY_TRACES_SAMPLE_RATE ↔ NEXT_PUBLIC_… — a metade web faltava no .env.example', () => {
    // apps/web/instrumentation-client.ts lê NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE e ela
    // não existia no exemplo: caía em `?? 0`, tracing do browser desligado por omissão.
    const env = envOf(makeRecipe());
    assert.equal(env.SENTRY_TRACES_SAMPLE_RATE, '0');
    assert.equal(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE, '0');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pares implícitos — porta / host / bucket / role
// ─────────────────────────────────────────────────────────────────────────────

describe('pares implícitos de porta e nome', () => {
  it('POSTGRES_PORT ↔ DATABASE_URL ↔ DATABASE_ADMIN_URL ↔ o 4202 embutido no e2e', () => {
    // apps/api/test/e2e-setup.ts e global-setup.ts embutem `localhost:4202`. Se o .env
    // publicar outra porta, o e2e do projeto gerado não acha o banco.
    const env = envOf(makeRecipe());
    assert.equal(env.POSTGRES_PORT, '4202');
    assert.equal(new URL(env.DATABASE_URL!).port, env.POSTGRES_PORT);
    assert.equal(new URL(env.DATABASE_ADMIN_URL!).port, env.POSTGRES_PORT);
  });

  it('DATABASE_URL usa a role restrita e DATABASE_ADMIN_URL o dono', () => {
    // Se as duas apontarem para o dono, o RLS deixa de valer — e a API só recusa subir
    // em produção (em dev é erro no log). O gerador não pode depender disso.
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const env = envOf(recipe);
    const app = new URL(env.DATABASE_URL!);
    const owner = new URL(env.DATABASE_ADMIN_URL!);

    assert.equal(app.username, names.dbRole);
    assert.equal(owner.username, names.dbName);
    assert.notEqual(app.username, owner.username);
    assert.equal(app.pathname, `/${names.dbName}`);
    assert.equal(owner.pathname, `/${names.dbName}`);
  });

  it('a senha das duas URLs é a que o harness de e2e espera (senha == nome da role)', () => {
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const env = envOf(recipe);
    assert.equal(new URL(env.DATABASE_URL!).password, names.dbRole);
    assert.equal(new URL(env.DATABASE_ADMIN_URL!).password, names.dbName);
  });

  it('REDIS_PORT ↔ REDIS_URL', () => {
    const env = envOf(makeRecipe());
    assert.equal(env.REDIS_PORT, String(DEV_PORTS.redis));
    assert.equal(new URL(env.REDIS_URL!).port, env.REDIS_PORT);
  });

  it('MINIO_PORT ↔ S3_ENDPOINT ↔ S3_PUBLIC_URL', () => {
    const env = envOf(makeRecipe());
    assert.equal(env.MINIO_PORT, String(DEV_PORTS.minio));
    assert.equal(new URL(env.S3_ENDPOINT!).port, env.MINIO_PORT);
    assert.equal(new URL(env.S3_PUBLIC_URL!).port, env.MINIO_PORT);
  });

  it('S3_BUCKET ↔ sufixo de S3_PUBLIC_URL', () => {
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const env = envOf(recipe);
    assert.equal(env.S3_BUCKET, names.bucket);
    assert.equal(new URL(env.S3_PUBLIC_URL!).pathname, `/${env.S3_BUCKET}`);
  });

  it('MAILPIT_SMTP_PORT ↔ MAIL_PORT', () => {
    const env = envOf(makeRecipe());
    assert.equal(env.MAILPIT_SMTP_PORT, String(DEV_PORTS.mailpitSmtp));
    assert.equal(env.MAIL_PORT, env.MAILPIT_SMTP_PORT);
  });

  it('API_PORT ↔ API_PUBLIC_URL ↔ API_INTERNAL_URL ↔ LOCAL_STORAGE_PUBLIC_URL', () => {
    const env = envOf(makeRecipe());
    assert.equal(env.API_PORT, String(DEV_PORTS.api));
    assert.equal(new URL(env.API_PUBLIC_URL!).port, env.API_PORT);
    assert.equal(new URL(env.API_INTERNAL_URL!).port, env.API_PORT);
    assert.equal(new URL(env.LOCAL_STORAGE_PUBLIC_URL!).port, env.API_PORT);
  });

  it('WEB_PORT ↔ WEB_ORIGIN ↔ o `next dev -p 4200` embutido no package.json do web', () => {
    // O Next NÃO lê WEB_PORT: `apps/web/package.json` tem a porta embutida, e o
    // Playwright embute a mesma baseURL. Mudar só o .env publicaria a porta errada.
    const env = envOf(makeRecipe());
    assert.equal(env.WEB_PORT, '4200');
    assert.equal(new URL(env.WEB_ORIGIN!).port, env.WEB_PORT);
  });

  it('TOTP_ISSUER e MAIL_FROM levam o nome do projeto, não a marca do boilerplate', () => {
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const env = envOf(recipe);
    assert.equal(env.TOTP_ISSUER, names.human);
    assert.equal(env.MAIL_FROM, `${names.human} <no-reply@${names.domain}>`);
    assert.doesNotMatch(JSON.stringify(env), /dontpanic/i);
  });

  it('QUEUE_PREFIX é do projeto, senão dois projetos dividem a fila no Redis', () => {
    const recipe = makeRecipe();
    const names = makeNames(recipe);
    const env = envOf(recipe);
    assert.equal(env.QUEUE_NAME, names.slug);
    assert.equal(env.QUEUE_PREFIX, `{${names.slug}}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coerência de boot para features opcionais
// ─────────────────────────────────────────────────────────────────────────────

describe('OAuth', () => {
  it('receita sem oauth não emite variável de oauth nenhuma', () => {
    const env = envOf(makeRecipe({ features: { oauth: false } }));
    const oauthKeys = Object.keys(env).filter((key) => key.includes('OAUTH'));
    assert.deepEqual(oauthKeys, []);
  });

  it('receita com os três providers emite as 9 chaves condicionais + as duas listas', () => {
    // O sumário do mapa diz "7" chaves condicionais de oauth; contando a tabela §1.2
    // linha por linha são 9 (callback + 2 google + 4 apple + 2 github). Vale a contagem
    // da tabela — é ela que espelha OAUTH_REQUIRED_KEYS em apps/api/src/config/env.ts.
    const env = envOf(
      makeRecipe({ oauth: { providers: ['google', 'apple', 'github'] } }),
    );
    const conditional = [
      'OAUTH_CALLBACK_BASE_URL',
      'OAUTH_GOOGLE_CLIENT_ID',
      'OAUTH_GOOGLE_CLIENT_SECRET',
      'OAUTH_APPLE_CLIENT_ID',
      'OAUTH_APPLE_TEAM_ID',
      'OAUTH_APPLE_KEY_ID',
      'OAUTH_APPLE_PRIVATE_KEY',
      'OAUTH_GITHUB_CLIENT_ID',
      'OAUTH_GITHUB_CLIENT_SECRET',
    ];
    for (const key of conditional) assert.ok(Object.hasOwn(env, key), `${key} ausente`);
    assert.ok(Object.hasOwn(env, 'OAUTH_PROVIDERS'));
    assert.ok(Object.hasOwn(env, 'NEXT_PUBLIC_OAUTH_PROVIDERS'));
  });

  it('só emite as credenciais dos providers escolhidos', () => {
    const env = envOf(makeRecipe({ oauth: { providers: ['google'] } }));
    assert.ok(Object.hasOwn(env, 'OAUTH_GOOGLE_CLIENT_ID'));
    assert.ok(!Object.hasOwn(env, 'OAUTH_APPLE_CLIENT_ID'));
    assert.ok(!Object.hasOwn(env, 'OAUTH_GITHUB_CLIENT_ID'));
  });

  it('a lista sai VAZIA: provider listado sem credencial faz a API recusar subir', () => {
    // Condições 8 e 9 das 10: provider sem todas as credenciais, ou lista não vazia com
    // OAUTH_CALLBACK_BASE_URL em branco. A credencial vem do console do provedor — o
    // gerador não tem como inventá-la, então entrega o .env pronto e DESLIGADO em vez de
    // um projeto que não boota.
    const file = fileOf(makeRecipe({ oauth: { providers: ['google', 'github'] } }));
    const env = envRecord(file);
    assert.equal(env.OAUTH_PROVIDERS, '');
    assert.equal(env.NEXT_PUBLIC_OAUTH_PROVIDERS, '');
    assert.ok(file.warnings.some((w) => w.includes('OAuth')));

    // E as linhas para ligar têm de estar lá, comentadas, com os nomes certos.
    const text = renderEnv(file);
    assert.match(text, /^# OAUTH_PROVIDERS=google,github$/m);
    assert.match(text, /^# NEXT_PUBLIC_OAUTH_PROVIDERS=google,github$/m);
  });
});

describe('Captcha', () => {
  it('driver escolhido no wizard sai desligado, com o bloco pronto e comentado', () => {
    // `validateEnv` recusa subir se CAPTCHA_DRIVER != none e CAPTCHA_SECRET_KEY estiver
    // vazia (condição 7). Entregar um projeto que não boota para honrar a escolha do
    // wizard é pior que entregar um que boota a um `sed` de distância.
    const file = fileOf(makeRecipe({ drivers: { captcha: 'recaptcha-v3' } }));
    const env = envRecord(file);
    assert.equal(env.CAPTCHA_DRIVER, 'none');
    assert.equal(env.NEXT_PUBLIC_CAPTCHA_DRIVER, 'none');
    assert.ok(file.warnings.some((w) => w.includes('Captcha')));

    const text = renderEnv(file);
    assert.match(text, /^# CAPTCHA_DRIVER=recaptcha-v3$/m);
    assert.match(text, /^# NEXT_PUBLIC_CAPTCHA_DRIVER=recaptcha-v3$/m);
  });

  it('receita sem a feature mantém só o par de drivers, em none', () => {
    const env = envOf(makeMinimalRecipe());
    assert.equal(env.CAPTCHA_DRIVER, 'none');
    assert.equal(env.NEXT_PUBLIC_CAPTCHA_DRIVER, 'none');
    assert.ok(!Object.hasOwn(env, 'CAPTCHA_SECRET_KEY'));
    assert.ok(!Object.hasOwn(env, 'CAPTCHA_MIN_SCORE'));
  });
});

describe('features removidas', () => {
  it('sem convites, sem INVITATION_*', () => {
    const env = envOf(makeRecipe({ features: { invitations: false } }));
    assert.ok(!Object.hasOwn(env, 'INVITATION_TTL_HOURS'));
    assert.ok(!Object.hasOwn(env, 'INVITATION_MAX_RESENDS'));
  });

  it('sem 2FA, sem TOTP_ISSUER nem TWO_FACTOR_REQUIRED', () => {
    const env = envOf(makeRecipe({ features: { twoFactor: false } }));
    assert.ok(!Object.hasOwn(env, 'TOTP_ISSUER'));
    assert.ok(!Object.hasOwn(env, 'TWO_FACTOR_REQUIRED'));
  });

  it('receita mínima não pede Redis, MinIO nem Mailpit', () => {
    const env = envOf(makeMinimalRecipe());
    for (const key of [
      'REDIS_URL',
      'REDIS_PORT',
      'S3_ENDPOINT',
      'MINIO_PORT',
      'MAIL_HOST',
      'MAILPIT_SMTP_PORT',
    ]) {
      assert.ok(!Object.hasOwn(env, key), `${key} não deveria estar aqui`);
    }
    // MAIL_FROM vale para todos os drivers, inclusive console.
    assert.ok(Object.hasOwn(env, 'MAIL_FROM'));
  });

  it('cache redis com fila memory ainda pede REDIS_URL', () => {
    // A interação fácil de errar: são drivers independentes sobre o MESMO REDIS_URL.
    const env = envOf(
      makeMinimalRecipe({ drivers: { cache: 'redis' }, features: { queue: false } }),
    );
    assert.equal(env.CACHE_DRIVER, 'redis');
    assert.equal(env.QUEUE_DRIVER, 'memory');
    assert.ok(Object.hasOwn(env, 'REDIS_URL'));
    assert.ok(Object.hasOwn(env, 'REDIS_PORT'));
  });
});

describe('env mortas', () => {
  it('não emite as três variáveis que nenhum arquivo do código lê', () => {
    const env = envOf(makeRecipe());
    for (const key of [
      'NEXT_PUBLIC_APP_NAME',
      'NEXT_PUBLIC_DEFAULT_LOCALE',
      'OTEL_EXPORTER_OTLP_ENDPOINT',
    ]) {
      assert.ok(!Object.hasOwn(env, key), `${key} é env morta e não deveria sair`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────────────────────────────────────

describe('renderEnv', () => {
  it('o texto renderizado lê de volta exatamente as chaves ativas', () => {
    const file = fileOf(makeRecipe({ drivers: { captcha: 'turnstile' } }));
    const parsed = parseEnvText(renderEnv(file));
    const model = envRecord(file);

    assert.deepEqual(Object.keys(parsed).sort(), Object.keys(model).sort());
    for (const [key, value] of Object.entries(model)) {
      assert.equal(parsed[key], value, `valor divergente em ${key}`);
    }
    assert.equal(countEnvKeys(file), Object.keys(parsed).length);
  });

  it('valor com espaço sai entre aspas', () => {
    // `MAIL_FROM=Acme Corp <no-reply@…>` sem aspas é truncado por alguns parsers.
    const text = renderEnv(fileOf(makeRecipe()));
    assert.match(text, /^MAIL_FROM="Acme Corp <no-reply@acme-corp\.dev>"/m);
  });

  it('marca inline o que não pode ir para produção como está', () => {
    const text = renderEnv(fileOf(makeRecipe()));
    for (const key of ['DATABASE_URL', 'COOKIE_SECURE', 'TRUST_PROXY', 'S3_SECRET_KEY']) {
      const line = text.split('\n').find((l) => l.startsWith(`${key}=`));
      assert.ok(line?.includes('TROQUE ANTES DE PRODUÇÃO'), `${key} sem marca de produção`);
    }
  });

  it('a ordem das seções acompanha o .env.example do boilerplate', () => {
    const text = renderEnv(fileOf(makeRecipe()));
    const order = ['Portas do host', 'API', 'Drivers / adapters', 'Banco (Postgres)', 'JWT', 'CSRF', 'Captcha', 'WEB'];
    let cursor = 0;
    for (const title of order) {
      const at = text.indexOf(title, cursor);
      assert.ok(at > 0, `seção "${title}" fora de ordem ou ausente`);
      cursor = at;
    }
  });
});

describe('effectiveDrivers', () => {
  it('a feature vence o driver quando a receita se contradiz', () => {
    // `features.queue: false` com `drivers.queue: 'bullmq'` pediria Redis para um módulo
    // que não foi gerado.
    const drivers = effectiveDrivers(
      makeRecipe({ features: { queue: false }, drivers: { queue: 'bullmq', cache: 'memory' } }),
    );
    assert.equal(drivers.queue, 'memory');
    assert.equal(drivers.needsRedis, false);
  });

  it('needsRedis exige as DUAS condições em memory', () => {
    assert.equal(effectiveDrivers(makeRecipe()).needsRedis, true);
    assert.equal(
      effectiveDrivers(makeRecipe({ drivers: { cache: 'memory', queue: 'bullmq' } })).needsRedis,
      true,
    );
    assert.equal(
      effectiveDrivers(makeRecipe({ drivers: { cache: 'redis', queue: 'memory' } })).needsRedis,
      true,
    );
    assert.equal(
      effectiveDrivers(makeRecipe({ drivers: { cache: 'memory', queue: 'memory' } })).needsRedis,
      false,
    );
  });
});
