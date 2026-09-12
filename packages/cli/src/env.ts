/**
 * Escrita do `.env` do projeto gerado.
 *
 * O `.env` é o único arquivo que o gerador ESCREVE do zero em vez de subtrair, e é o
 * lugar onde duas classes de bug do boilerplate se encontram:
 *
 * **1. Os defaults do `envSchema` não são os do `.env.example`.** Oito chaves
 * (`API_PORT`, `REDIS_URL`, `WEB_ORIGIN`, `API_PUBLIC_URL`, `MAIL_PORT`, `S3_ENDPOINT`,
 * `S3_PUBLIC_URL`, `LOCAL_STORAGE_PUBLIC_URL`) têm default de schema apontando para as
 * portas 30xx/9000/1025, enquanto o `.env.example` e o compose usam a faixa 42xx. Um
 * `.env` "enxuto", que omite chave por confiar no default, sobe liso e falha em
 * RUNTIME: a API procura Redis em `:6379`, MinIO em `:9000`, SMTP em `:1025`, e o
 * compose do projeto publicou `:4203`, `:4204`, `:4206`. Por isso este módulo escreve
 * **valor explícito para toda chave que o projeto usa**, inclusive quando há default.
 * Não dependemos de saber qual dos dois lados está certo.
 *
 * **2. Metade pública que discorda da metade privada é invisível.** Não existe
 * validação de env no lado web: um `NEXT_PUBLIC_*` errado nunca falha o boot, só
 * produz um formulário que dá 403 em todo submit ou um botão que dá 404. Então os pares
 * não são "conferidos": cada par sai de UMA expressão, e divergir é impossível por
 * construção. O mesmo vale para os pares implícitos (porta ↔ URL ↔ bucket ↔ role): há
 * um único `DEV_PORTS` e um único `NameForms`, e toda URL é montada a partir deles.
 *
 * Ordem e cabeçalhos de seção imitam o `.env.example` do boilerplate de propósito: um
 * `.env` gerado que se parece com o exemplo é um `.env` que o usuário sabe editar, e
 * que dá diff legível contra o exemplo quando o boilerplate ganhar uma chave nova.
 */

import type { GeneratedSecrets } from './secrets.ts';
import type { CaptchaDriver, MailDriver, NameForms, QueueDriver, Recipe } from './types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Portas — a fonte única dos pares implícitos de porta
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A faixa 42xx do boilerplate.
 *
 * Não é configurável, e isso é uma decisão, não uma pendência: `WEB_PORT` existe no
 * `.env` mas o Next NÃO o lê — `apps/web/package.json` tem `next dev -p 4200` e
 * `next start -p 4200` embutidos, e o `playwright.config.ts` embute a mesma baseURL.
 * A porta do Postgres tem o mesmo problema pelo outro lado: `apps/api/test/e2e-setup.ts`
 * e `global-setup.ts` embutem `localhost:4202`. Oferecer `--port-base` produziria um
 * `.env` coerente consigo mesmo e incoerente com quatro arquivos do projeto — a pior
 * das combinações, porque o sintoma aparece só no `pnpm test:e2e` ou ao abrir o browser.
 *
 * Quando o boilerplate passar a ler `WEB_PORT` de verdade, isto vira parâmetro.
 */
export const DEV_PORTS = {
  web: 4200,
  api: 4201,
  postgres: 4202,
  redis: 4203,
  minio: 4204,
  minioConsole: 4205,
  mailpitSmtp: 4206,
  mailpitUi: 4207,
  storybook: 4208,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Modelo do arquivo
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvEntry {
  key: string;
  value: string;
  /** Comentários que saem ACIMA da chave, uma linha cada, sem o `# `. */
  notes?: string[];
  /**
   * Sai como `# KEY=value`, desativada.
   *
   * Existe para uma situação específica: uma feature cujo valor "ligado" faria a API
   * recusar subir enquanto o usuário não colar uma credencial de terceiro. Ver
   * `captchaSection` e `oauthSection`.
   */
  commentedOut?: boolean;
  /** Marca inline que o usuário TEM de trocar antes de produção. */
  todo?: boolean;
}

export interface EnvSection {
  /** Vira o banner `# ---- título ----`. */
  title: string;
  notes?: string[];
  entries: EnvEntry[];
}

export interface EnvFile {
  header: string[];
  sections: EnvSection[];
  /** Coisas que o usuário precisa saber e que não cabem num comentário do arquivo. */
  warnings: string[];
}

/** Marca inline do que não pode ir para produção como está. */
const TODO_MARK = '# ⚠️ TROQUE ANTES DE PRODUÇÃO';

const BANNER_WIDTH = 76;

// ─────────────────────────────────────────────────────────────────────────────
// Drivers efetivos
// ─────────────────────────────────────────────────────────────────────────────

export interface EffectiveDrivers {
  storage: 's3' | 'local';
  mail: MailDriver;
  cache: 'redis' | 'memory';
  queue: QueueDriver;
  captcha: CaptchaDriver;
  /** Redis é necessário? `cache=redis` OU `queue=bullmq` — as duas usam `REDIS_URL`. */
  needsRedis: boolean;
}

/**
 * Resolve o que os drivers REALMENTE são depois da poda de features.
 *
 * A receita tem duas fontes que podem discordar: `features.queue` (o módulo de fila
 * existe?) e `drivers.queue` (qual adapter?). Uma receita com `features.queue: false` e
 * `drivers.queue: 'bullmq'` é contraditória, e o lado que tem de ganhar é o da feature
 * — senão o `.env` pede Redis para um módulo que não foi gerado, e o compose sobe um
 * container que ninguém usa.
 *
 * É esta função que decide, e tanto o `.env` quanto o `docker-compose.yml` a consomem.
 * É por isso que o par "driver ↔ serviço de infra" (par 11 do mapa) não pode divergir:
 * não há duas decisões, há uma.
 */
export function effectiveDrivers(recipe: Recipe): EffectiveDrivers {
  const queue: QueueDriver = recipe.features.queue ? recipe.drivers.queue : 'memory';
  const cache = recipe.drivers.cache;
  const captcha: CaptchaDriver = recipe.features.captcha ? recipe.drivers.captcha : 'none';

  return {
    storage: recipe.drivers.storage,
    mail: recipe.drivers.mail,
    cache,
    queue,
    captcha,
    // As duas condições, não uma. São drivers independentes que compartilham
    // `REDIS_URL`: deixar só uma em `memory` não dispensa o Redis, e foi assim que o
    // compose "enxuto" de um gerador anterior tirou o Redis de um projeto com
    // `QUEUE_DRIVER=bullmq` — o worker subia e morria no primeiro ECONNREFUSED.
    needsRedis: cache === 'redis' || queue === 'bullmq',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Construção
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Monta o `.env` completo para uma receita.
 *
 * Nunca omite chave por "tem default" (ver o cabeçalho do arquivo); omite chave só
 * quando o código que a lê não existe mais no projeto gerado.
 */
export function buildEnv(recipe: Recipe, names: NameForms, secrets: GeneratedSecrets): EnvFile {
  const drivers = effectiveDrivers(recipe);
  const warnings: string[] = [];

  const webOrigin = `http://localhost:${DEV_PORTS.web}`;
  const apiPublicUrl = `http://localhost:${DEV_PORTS.api}`;
  const pgHost = `localhost:${DEV_PORTS.postgres}`;

  const sections: EnvSection[] = [
    portsSection(drivers),
    apiSection(),
    driversSection(recipe, drivers, apiPublicUrl),
    databaseSection(names, secrets, pgHost),
    ...(drivers.needsRedis ? [redisSection(drivers)] : []),
    jwtSection(secrets),
    cookiesSection(),
    csrfSection(secrets),
    urlsSection(webOrigin, apiPublicUrl),
    ...(recipe.features.twoFactor ? [twoFactorSection(names)] : []),
    mailSection(recipe, drivers, names),
    ...(drivers.storage === 's3' ? [s3Section(names, secrets)] : []),
    rateLimitSection(),
    queueSection(drivers, names),
    captchaSection(recipe, drivers, warnings),
    accessSection(recipe),
    ...(recipe.features.oauth ? [oauthSection(recipe, webOrigin, warnings)] : []),
    proxySection(),
    lockoutSection(),
    observabilitySection(),
    webSection(recipe, apiPublicUrl),
  ];

  return {
    header: [
      `${names.human} — variáveis de ambiente`,
      '',
      'Gerado automaticamente. Os defaults de dev funcionam com `docker compose up -d`;',
      `as portas ficam na faixa 42xx (Web ${DEV_PORTS.web} · API ${DEV_PORTS.api} ·`,
      `Postgres ${DEV_PORTS.postgres} · Redis ${DEV_PORTS.redis} · MinIO ${DEV_PORTS.minio}/${DEV_PORTS.minioConsole} ·`,
      `Mailpit ${DEV_PORTS.mailpitSmtp}/${DEV_PORTS.mailpitUi}).`,
      '',
      `Toda linha marcada "${TODO_MARK.replace('# ', '')}" é credencial de terceiro ou`,
      'valor local que não serve em produção. Procure por elas antes do primeiro deploy.',
      '',
      'Este arquivo NÃO vai para o git (veja o .gitignore). Os segredos aqui foram',
      'sorteados na geração e são só deste projeto.',
    ],
    sections,
    warnings,
  };
}

// ── Seções ───────────────────────────────────────────────────────────────────

function portsSection(drivers: EffectiveDrivers): EnvSection {
  const entries: EnvEntry[] = [{ key: 'POSTGRES_PORT', value: String(DEV_PORTS.postgres) }];

  if (drivers.needsRedis) entries.push({ key: 'REDIS_PORT', value: String(DEV_PORTS.redis) });

  if (drivers.storage === 's3') {
    entries.push(
      { key: 'MINIO_PORT', value: String(DEV_PORTS.minio) },
      { key: 'MINIO_CONSOLE_PORT', value: String(DEV_PORTS.minioConsole) },
    );
  }

  if (drivers.mail === 'smtp') {
    entries.push(
      { key: 'MAILPIT_SMTP_PORT', value: String(DEV_PORTS.mailpitSmtp) },
      { key: 'MAILPIT_UI_PORT', value: String(DEV_PORTS.mailpitUi) },
    );
  }

  return {
    title: 'Portas do host (Docker) — faixa 42xx',
    notes: [
      'Lidas pelo docker-compose.yml. Só as dos serviços que esta receita usa aparecem',
      'aqui — o compose gerado também só tem esses serviços.',
    ],
    entries,
  };
}

function apiSection(): EnvSection {
  return {
    title: 'API',
    entries: [
      { key: 'NODE_ENV', value: 'development' },
      {
        key: 'API_PORT',
        value: String(DEV_PORTS.api),
        notes: [
          'Explícita de propósito: o default do envSchema é 3001, não esta. Omitir a',
          'chave faria a API escutar numa porta que o BFF do web não procura.',
        ],
      },
      { key: 'API_HOST', value: '0.0.0.0' },
    ],
  };
}

function driversSection(
  recipe: Recipe,
  drivers: EffectiveDrivers,
  apiPublicUrl: string,
): EnvSection {
  const entries: EnvEntry[] = [
    { key: 'STORAGE_DRIVER', value: drivers.storage, notes: ['s3 | local'] },
    { key: 'MAIL_DRIVER', value: drivers.mail, notes: ['smtp | ses | console'] },
    { key: 'CACHE_DRIVER', value: drivers.cache, notes: ['redis | memory'] },
    // Não existe `DB_PROVIDER` aqui, e não é omissão: o banco é Postgres, sempre.
    //
    // O boilerplate oferecia `DB_PROVIDER=postgresql|mysql|sqlite`, mas a chave era
    // declarada no envSchema e **nunca lida** — escolher `mysql` não trocava adapter
    // nenhum, só subia a aplicação com o isolamento entre empresas ausente, sem erro.
    // O Marcio removeu a chave do boilerplate depois da auditoria.
    //
    // Escrevê-la aqui seria env morta em qualquer versão do template: na tag antiga o
    // schema tem default `postgresql` e ignora a ausência; na nova a chave não existe
    // mais. Nos dois casos, omitir é o certo.
  ];

  // Sempre presentes, mesmo com STORAGE_DRIVER=s3: o harness de e2e força
  // `STORAGE_DRIVER=local` (apps/api/test/e2e-setup.ts), e aí estas duas passam a ser
  // lidas. Sem elas o default do schema aponta para :3001 e o teste de arquivo quebra
  // com uma URL que não existe em projeto nenhum.
  entries.push(
    {
      key: 'LOCAL_STORAGE_DIR',
      value: './storage',
      notes: [
        'Adapter local (STORAGE_DRIVER=local). Mantido mesmo no modo s3 porque a suíte',
        'e2e força o driver local — e o default do schema aponta para a porta errada.',
      ],
    },
    { key: 'LOCAL_STORAGE_PUBLIC_URL', value: `${apiPublicUrl}/files` },
  );

  if (drivers.mail === 'ses') {
    entries.push(
      {
        key: 'AWS_REGION',
        value: 'us-east-1',
        notes: ['Adapter SES (MAIL_DRIVER=ses).'],
      },
      { key: 'SES_ACCESS_KEY', value: '', todo: true },
      { key: 'SES_SECRET_KEY', value: '', todo: true },
    );
  }

  void recipe;
  return {
    title: 'Drivers / adapters (Hexagonal) — trocar impl sem tocar no domínio',
    entries,
  };
}

function databaseSection(
  names: NameForms,
  secrets: GeneratedSecrets,
  pgHost: string,
): EnvSection {
  const appUrl = `postgresql://${names.dbRole}:${secrets.dbAppPassword}@${pgHost}/${names.dbName}?schema=public`;
  const ownerUrl = `postgresql://${names.dbName}:${secrets.dbOwnerPassword}@${pgHost}/${names.dbName}?schema=public`;

  return {
    title: 'Banco (Postgres) — DUAS conexões, e a diferença importa',
    notes: [
      'O isolamento entre empresas é imposto por Row Level Security. Um SUPERUSER — e',
      'qualquer role com BYPASSRLS — ignora RLS mesmo com FORCE ROW LEVEL SECURITY, então',
      'a API não pode conectar como dono do banco: toda política viraria decoração. A API',
      'recusa subir em produção se detectar isso (PrismaService.assertNotSuperuser).',
      '',
      `  DATABASE_URL        role restrita (${names.dbRole}), usada pela API em runtime`,
      `  DATABASE_ADMIN_URL  dono do banco (${names.dbName}), só migrate/seed (DDL)`,
      '',
      'A role restrita é criada pela migration de baseline, que roda com a conexão do',
      'dono. Num banco novo a ordem é: docker compose up -d → db:migrate → pnpm dev.',
      '',
      'Estas duas senhas são as do Postgres em container, escutando em localhost, com',
      'dados descartáveis — e são as mesmas que o harness de e2e do projeto espera. Em',
      'produção o banco é gerenciado e a senha vem do provedor: troque as duas URLs.',
    ],
    entries: [
      { key: 'DATABASE_URL', value: appUrl, todo: true },
      { key: 'DATABASE_ADMIN_URL', value: ownerUrl, todo: true },
    ],
  };
}

function redisSection(drivers: EffectiveDrivers): EnvSection {
  return {
    title: 'Redis',
    notes: [
      `Necessário nesta receita porque ${
        drivers.cache === 'redis' && drivers.queue === 'bullmq'
          ? 'CACHE_DRIVER=redis e QUEUE_DRIVER=bullmq'
          : drivers.cache === 'redis'
            ? 'CACHE_DRIVER=redis'
            : 'QUEUE_DRIVER=bullmq'
      }.`,
      'Porta explícita: o default do envSchema é :6379 e o compose publica :' +
        `${DEV_PORTS.redis}.`,
    ],
    entries: [{ key: 'REDIS_URL', value: `redis://localhost:${DEV_PORTS.redis}` }],
  };
}

function jwtSection(secrets: GeneratedSecrets): EnvSection {
  return {
    title: 'JWT',
    notes: [
      'Sorteados na geração: 32 bytes em hex cada, valores distintos. O envSchema exige',
      'só min(16), o que o valor de exemplo do boilerplate também satisfazia — é por isso',
      'que estes não são copiados de exemplo nenhum.',
    ],
    entries: [
      { key: 'JWT_ACCESS_SECRET', value: secrets.jwtAccessSecret },
      { key: 'JWT_REFRESH_SECRET', value: secrets.jwtRefreshSecret },
      { key: 'JWT_ACCESS_TTL', value: '900' },
      { key: 'JWT_REFRESH_TTL', value: '604800' },
      {
        key: 'REFRESH_REUSE_GRACE',
        value: '10',
        notes: [
          'Segundos em que replay de um refresh já rotacionado conta como rotação',
          'concorrente (duas abas) em vez de roubo. 0 = estrito.',
        ],
      },
    ],
  };
}

function cookiesSection(): EnvSection {
  return {
    title: 'Cookies',
    entries: [
      { key: 'COOKIE_DOMAIN', value: 'localhost', todo: true },
      {
        key: 'COOKIE_SECURE',
        value: 'false',
        notes: ['false só porque o dev é http. Em produção (https) tem de ser true.'],
        todo: true,
      },
    ],
  };
}

function csrfSection(secrets: GeneratedSecrets): EnvSection {
  return {
    title: 'CSRF',
    entries: [{ key: 'CSRF_SECRET', value: secrets.csrfSecret }],
  };
}

function urlsSection(webOrigin: string, apiPublicUrl: string): EnvSection {
  return {
    title: 'URLs / CORS',
    notes: [
      'Explícitas: os defaults do envSchema são :3000 e :3001, e o projeto roda em',
      `:${DEV_PORTS.web} e :${DEV_PORTS.api}. WEB_ORIGIN errado quebra CORS; API_PUBLIC_URL`,
      'errado gera link de e-mail que não abre.',
    ],
    entries: [
      { key: 'WEB_ORIGIN', value: webOrigin, todo: true },
      { key: 'API_PUBLIC_URL', value: apiPublicUrl, todo: true },
    ],
  };
}

function twoFactorSection(names: NameForms): EnvSection {
  return {
    title: '2FA (TOTP)',
    entries: [
      {
        key: 'TOTP_ISSUER',
        value: names.human,
        notes: ['O nome que aparece no app autenticador do usuário.'],
      },
      {
        key: 'TWO_FACTOR_REQUIRED',
        value: 'false',
        notes: [
          'true: o usuário TEM de ligar 2FA depois de verificar o e-mail (o app fica',
          'travado até lá). false: um convite de uma tela, adiável por 24h.',
        ],
      },
    ],
  };
}

function mailSection(recipe: Recipe, drivers: EffectiveDrivers, names: NameForms): EnvSection {
  const entries: EnvEntry[] = [];

  if (drivers.mail === 'smtp') {
    entries.push(
      { key: 'MAIL_HOST', value: 'localhost' },
      {
        key: 'MAIL_PORT',
        value: String(DEV_PORTS.mailpitSmtp),
        notes: [`Mailpit do compose. O default do envSchema é 1025; o compose publica ${DEV_PORTS.mailpitSmtp}.`],
      },
      { key: 'MAIL_SECURE', value: 'false', todo: true },
      { key: 'MAIL_USER', value: '', todo: true },
      { key: 'MAIL_PASSWORD', value: '', todo: true },
    );
  }

  // MAIL_FROM vale para TODOS os drivers, inclusive `console`: é o remetente que o
  // adapter imprime/envia. Omitir deixaria o default com a marca do boilerplate.
  entries.push({
    key: 'MAIL_FROM',
    value: `${names.human} <no-reply@${names.domain}>`,
    todo: true,
  });

  void recipe;
  return {
    title:
      drivers.mail === 'smtp'
        ? `E-mail (Mailpit em dev — UI em http://localhost:${DEV_PORTS.mailpitUi})`
        : 'E-mail',
    // Spread condicional em vez de `notes: ... : undefined`. Sob
    // `exactOptionalPropertyTypes`, uma propriedade opcional aceita estar AUSENTE, mas
    // não aceita estar presente valendo `undefined` — que é exatamente a distinção que
    // a flag existe para fazer.
    ...(drivers.mail === 'console'
      ? {
          notes: [
            'MAIL_DRIVER=console: e-mail nenhum sai da máquina, o conteúdo vai para o log.',
            'Antes de expor o app, troque para smtp ou ses e preencha as credenciais.',
          ],
        }
      : {}),
    entries,
  };
}

function s3Section(names: NameForms, secrets: GeneratedSecrets): EnvSection {
  const endpoint = `http://localhost:${DEV_PORTS.minio}`;
  return {
    title: `S3 / MinIO (console em http://localhost:${DEV_PORTS.minioConsole})`,
    notes: [
      'As credenciais aqui são as MESMAS de MINIO_ROOT_USER/MINIO_ROOT_PASSWORD no',
      'compose e as mesmas do `mc alias set` que cria o bucket — os três saem do mesmo',
      'valor sorteado. Se divergirem, o container sobe, o bucket não é criado e todo',
      'upload falha com SignatureDoesNotMatch.',
      '',
      'O sufixo de S3_PUBLIC_URL é o bucket, sempre. Em produção troque endpoint,',
      'credenciais e URL pública pelo provedor de verdade (S3, R2, …).',
    ],
    entries: [
      { key: 'S3_ENDPOINT', value: endpoint, todo: true },
      { key: 'S3_REGION', value: 'us-east-1' },
      { key: 'S3_BUCKET', value: names.bucket },
      { key: 'S3_ACCESS_KEY', value: secrets.s3AccessKey, todo: true },
      { key: 'S3_SECRET_KEY', value: secrets.s3SecretKey, todo: true },
      {
        key: 'S3_FORCE_PATH_STYLE',
        value: 'true',
        notes: ['true para MinIO e R2; false para S3 com bucket no host.'],
      },
      { key: 'S3_PUBLIC_URL', value: `${endpoint}/${names.bucket}`, todo: true },
    ],
  };
}

function rateLimitSection(): EnvSection {
  return {
    title: 'Rate limit (por rota, por IP de cliente)',
    entries: [
      { key: 'RATE_LIMIT_MAX', value: '100' },
      { key: 'RATE_LIMIT_WINDOW', value: '60000' },
      {
        key: 'AUTH_RATE_LIMIT_MAX',
        value: '10',
        notes: [
          'Orçamento apertado para a superfície não autenticada: login, signup,',
          'verify-email, resend-verification, 2fa/verify, forgot/reset-password.',
        ],
      },
      { key: 'AUTH_RATE_LIMIT_WINDOW', value: '60000' },
    ],
  };
}

function queueSection(drivers: EffectiveDrivers, names: NameForms): EnvSection {
  const entries: EnvEntry[] = [
    {
      key: 'QUEUE_DRIVER',
      value: drivers.queue,
      notes:
        drivers.queue === 'bullmq'
          ? [
              '`bullmq` põe o trabalho no Redis e um processo SEPARADO consome',
              '(`pnpm --filter @<escopo>/api worker`). Sem o worker, e-mail não sai.',
            ]
          : [
              '`memory` roda o job inline em quem enfileirou. NÃO é uma fila: sem',
              'durabilidade, sem retry, sem processo separado. Serve para teste e para',
              '`pnpm dev` sem worker — nunca para produção.',
              '',
              'Explícito mesmo sendo o único valor possível nesta receita: o default do',
              'envSchema é `bullmq`, então omitir a chave faria a API procurar um Redis',
              'que o compose desta receita não sobe.',
            ],
    },
  ];

  if (drivers.queue === 'bullmq') {
    entries.push(
      { key: 'QUEUE_NAME', value: names.slug },
      {
        key: 'QUEUE_PREFIX',
        value: `{${names.slug}}`,
        notes: [
          'Namespace das chaves no Redis. Precisa ser do projeto: dois projetos gerados',
          'na mesma máquina com o mesmo prefixo dividem a fila, e um consome o job do',
          'outro. As chaves `{}` são o hash tag do Redis Cluster, mantenha-as.',
        ],
      },
      { key: 'QUEUE_CONCURRENCY', value: '5' },
      {
        key: 'QUEUE_ATTEMPTS',
        value: '5',
        notes: ['Tentativas por job, incluindo a primeira; backoff exponencial.'],
      },
      { key: 'QUEUE_BACKOFF', value: '2000' },
    );
  }

  return { title: 'Jobs em background', entries };
}

function captchaSection(
  recipe: Recipe,
  drivers: EffectiveDrivers,
  warnings: string[],
): EnvSection {
  const wanted = recipe.features.captcha ? recipe.drivers.captcha : 'none';

  // O captcha nasce DESLIGADO mesmo quando a receita pede um provedor, e a razão é
  // estreita: `validateEnv` recusa subir se CAPTCHA_DRIVER != none e CAPTCHA_SECRET_KEY
  // estiver vazia (env.ts:242-247). A chave vem da Cloudflare ou do Google — o gerador
  // não tem como inventá-la. Entregar um projeto que não boota para honrar uma escolha
  // do wizard é pior que entregar um projeto que boota com o captcha a um `sed` de
  // distância. Então: driver `none`, e o bloco pronto, comentado, com o provedor
  // escolhido já preenchido.
  const entries: EnvEntry[] = [
    { key: 'CAPTCHA_DRIVER', value: 'none' },
    // Metade pública. Sai do MESMO valor que a metade privada: se divergirem, a API
    // exige um token que o formulário não tem como obter e todo submit vira 400.
    { key: 'NEXT_PUBLIC_CAPTCHA_DRIVER', value: 'none' },
  ];

  if (recipe.features.captcha) {
    entries.push(
      { key: 'CAPTCHA_SECRET_KEY', value: '', todo: true },
      { key: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY', value: '', todo: true },
      {
        key: 'CAPTCHA_MIN_SCORE',
        value: '0.5',
        notes: ['Só reCAPTCHA v3: rejeita abaixo deste score. O default do Google é 0.5.'],
      },
      { key: 'CAPTCHA_TIMEOUT', value: '5000' },
      {
        key: 'CAPTCHA_FAIL_OPEN',
        value: 'false',
        notes: [
          'Provedor fora do ar: false rejeita o request (default), true libera.',
          'Fail-open troca proteção por disponibilidade — decida qual prefere perder.',
        ],
      },
    );

    if (wanted !== 'none') {
      entries.push(
        {
          key: 'CAPTCHA_DRIVER',
          value: wanted,
          commentedOut: true,
          notes: [
            '',
            `Para ligar o ${wanted}: preencha as duas chaves acima e descomente as duas`,
            'linhas abaixo (as duas, sempre — ligar só um lado é a armadilha).',
          ],
        },
        { key: 'NEXT_PUBLIC_CAPTCHA_DRIVER', value: wanted, commentedOut: true },
      );
      warnings.push(
        `Captcha: a receita pediu \`${wanted}\`, mas o .env sai com CAPTCHA_DRIVER=none — ` +
          'a chave secreta vem do provedor e a API recusa subir sem ela. As linhas para ' +
          'ligar estão prontas e comentadas no .env.',
      );
    }
  }

  void drivers;
  return {
    title: 'Captcha — verificação humana nos formulários não autenticados',
    notes: [
      'Desligado por padrão para um clone novo subir sem chave de terceiro. Ligue antes',
      'de expor o app: o rate limit limita QUÃO RÁPIDO alguém tenta, o captcha limita se',
      'um script consegue tentar.',
      '',
      '  turnstile      Cloudflare  → https://dash.cloudflare.com/?to=/:account/turnstile',
      '  recaptcha-v2   checkbox    → https://www.google.com/recaptcha/admin',
      '  recaptcha-v3   invisível, por score (ajuste CAPTCHA_MIN_SCORE)',
      '',
      'CAPTCHA_SECRET_KEY nunca vai para o browser. Só a metade NEXT_PUBLIC_* vai.',
    ],
    entries,
  };
}

function accessSection(recipe: Recipe): EnvSection {
  const entries: EnvEntry[] = [
    {
      key: 'PUBLIC_SIGNUP_ENABLED',
      value: recipe.features.publicSignup ? 'true' : 'false',
      notes: recipe.features.publicSignup
        ? [
            'Um desconhecido pode criar empresa pelo formulário. NÃO é um default seguro,',
            'é uma decisão de deploy — está no checklist de produção por isso.',
          ]
        : [
            'Registro público desligado nesta receita: as portas que sobram são o convite',
            'e o seed. A metade web (NEXT_PUBLIC_SIGNUP_ENABLED) sai com o mesmo valor.',
          ],
    },
  ];

  if (recipe.features.invitations) {
    entries.push(
      {
        key: 'INVITATION_TTL_HOURS',
        value: '168',
        notes: [
          'Uma semana: longo o bastante para atravessar um feriado, curto o bastante para',
          'uma caixa encaminhada não virar chave permanente da empresa. Máximo 720.',
        ],
      },
      {
        key: 'INVITATION_MAX_RESENDS',
        value: '5',
        notes: [
          'Teto de reenvios por convite. Impede que "reenviar" vire um jeito de martelar',
          'um endereço usando a nossa reputação de envio. 0 desliga o reenvio.',
        ],
      },
    );
  }

  return {
    title: 'Quem pode entrar — registro público e convites',
    entries,
  };
}

/** As chaves de credencial exigidas por provider — espelha `OAUTH_REQUIRED_KEYS` da API. */
const OAUTH_CREDENTIAL_KEYS = {
  google: ['OAUTH_GOOGLE_CLIENT_ID', 'OAUTH_GOOGLE_CLIENT_SECRET'],
  apple: [
    'OAUTH_APPLE_CLIENT_ID',
    'OAUTH_APPLE_TEAM_ID',
    'OAUTH_APPLE_KEY_ID',
    'OAUTH_APPLE_PRIVATE_KEY',
  ],
  github: ['OAUTH_GITHUB_CLIENT_ID', 'OAUTH_GITHUB_CLIENT_SECRET'],
} as const;

const OAUTH_PROVIDER_NOTES = {
  google: [
    'Google — OIDC direto, o menos surpreendente dos três.',
    '  Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application)',
  ],
  apple: [
    'Apple — o esquisito. No Apple Developer:',
    '  · Identifiers → Services IDs: é este o OAUTH_APPLE_CLIENT_ID. NÃO o App ID.',
    '  · Keys → uma chave Sign in with Apple: dá o Key ID e um .p8 baixável uma vez só.',
    '  O client secret não é string fixa: é um JWT ES256 que a API assina com o .p8 e',
    '  rotaciona sozinha. A Apple manda o callback por POST e o nome do usuário vem só',
    '  na PRIMEIRA autorização — perdeu ali, nenhum login futuro traz de novo.',
    '  O PEM inteiro, linhas BEGIN/END incluídas. `\\n` literal é aceito.',
  ],
  github: [
    'GitHub — OAuth2 sem OIDC: não há id_token de onde ler o e-mail, o adapter chama',
    '  /user/emails separado (e a API do GitHub recusa request sem User-Agent). Só',
    '  endereço primary E verified é aceito.',
    '  Settings → Developer settings → OAuth Apps → New OAuth App',
  ],
} as const;

function oauthSection(recipe: Recipe, webOrigin: string, warnings: string[]): EnvSection {
  const providers = recipe.oauth.providers;
  const list = providers.join(',');

  // Mesma lógica do captcha, e pela mesma razão mecânica: `validateEnv` recusa subir se
  // um provider listado estiver sem TODAS as credenciais, ou se a lista não estiver
  // vazia e OAUTH_CALLBACK_BASE_URL faltar (env.ts:254-265). Credencial de OAuth vem do
  // console do provedor. Então a lista nasce VAZIA — nenhum botão, `/auth/oauth/*` em
  // 404 — e as chaves de credencial nascem presentes e vazias, prontas para colar.
  const entries: EnvEntry[] = [
    {
      key: 'OAUTH_PROVIDERS',
      value: '',
      notes: [
        'Lista CSV, fonte única do que está ligado. VAZIA nesta geração de propósito: a',
        'API recusa subir se um provider listado estiver sem credencial. Preencha as',
        'chaves abaixo e só então descomente a linha com a lista.',
      ],
    },
    { key: 'NEXT_PUBLIC_OAUTH_PROVIDERS', value: '' },
  ];

  if (providers.length > 0) {
    entries.push(
      {
        key: 'OAUTH_PROVIDERS',
        value: list,
        commentedOut: true,
        notes: ['', 'Descomente as DUAS linhas juntas — nome a mais no web dá botão 404:'],
      },
      { key: 'NEXT_PUBLIC_OAUTH_PROVIDERS', value: list, commentedOut: true },
    );
  }

  entries.push({
    key: 'OAUTH_CALLBACK_BASE_URL',
    value: `${webOrigin}/api/auth/oauth`,
    notes: [
      '',
      'Para onde o provedor manda o browser de volta. Tem de bater CARACTERE A CARACTERE',
      'com o redirect URI registrado em cada provider — esquema, host, porta, caminho,',
      'barra final. O provedor compara a string, não a URL, e a divergência é rejeitada',
      'lá, numa página de erro que a aplicação nunca vê.',
    ],
    todo: true,
  });

  for (const provider of providers) {
    const keys = OAUTH_CREDENTIAL_KEYS[provider];
    entries.push({
      key: keys[0],
      value: '',
      notes: ['', ...OAUTH_PROVIDER_NOTES[provider]],
      todo: true,
    });
    for (const key of keys.slice(1)) {
      entries.push({ key, value: '', todo: true });
    }
  }

  if (providers.length > 0) {
    warnings.push(
      `OAuth: ${list} ficou preparado mas DESLIGADO (OAUTH_PROVIDERS vazia) — as ` +
        'credenciais vêm do console de cada provedor e a API recusa subir sem elas. ' +
        'Preencha e descomente as duas linhas da lista no .env.',
    );
  }

  return {
    title: 'Login social (OAuth) — opcional, por provider',
    entries,
  };
}

function proxySection(): EnvSection {
  return {
    title: 'IP do cliente / confiança de proxy — LEIA ANTES DE DEPLOYAR',
    notes: [
      'Todo limite acima conta por IP de cliente, então estas três chaves decidem se o',
      'rate limit funciona de verdade. Dependem de ONDE o app roda, e os valores abaixo',
      'são os de dev local: restritivos, e por isso não burláveis.',
      '',
      'TRUST_PROXY: quem pode setar X-Forwarded-For na entrada da API.',
      '  false        sem proxy; confia só no endereço do socket',
      '  loopback     API e BFF no mesmo host          ← default, `pnpm dev`',
      '  uniquelocal  faixas privadas                 ← docker-compose.dev.yml',
      '  2            número de hops confiáveis',
      '  10.0.0.0/8   allowlist de IP/CIDR            ← o mais preciso, prefira em prod',
      'NUNCA `true` em produção: confia em todo hop, então qualquer chamador forja o',
      'header e ganha um balde de rate limit novo a cada request. O browser PODE setar',
      'esse header — não está na lista de forbidden headers do fetch.',
      '',
      'CLIENT_IP_HEADER / CLIENT_IP_TRUSTED_HOPS: como o BFF do web descobre o IP real.',
      'Hops conta DA DIREITA, porque load balancer faz append: em',
      '`X-Forwarded-For: <forjado>, <real>` o primeiro elemento é o que o atacante',
      'digitou. 0 = nada confiável na frente, então nenhum IP é repassado e a API vê',
      'todos como um cliente só — limita demais, mas não é burlável.',
      '  nginx / Traefik     x-real-ip                 hops 1',
      '  AWS ALB / GCP LB    x-forwarded-for           hops 1',
      '  Cloudflare          cf-connecting-ip          hops 1',
      '  Cloudflare → ALB    x-forwarded-for           hops 2',
      '  Vercel              x-vercel-forwarded-for    hops 1',
      '  Fly.io              fly-client-ip             hops 1',
    ],
    entries: [
      { key: 'TRUST_PROXY', value: 'loopback', todo: true },
      { key: 'CLIENT_IP_HEADER', value: 'x-forwarded-for', todo: true },
      { key: 'CLIENT_IP_TRUSTED_HOPS', value: '0', todo: true },
    ],
  };
}

function lockoutSection(): EnvSection {
  return {
    title: 'Lockout por conta',
    notes: [
      'Protege UMA conta sendo martelada. Não protege contra password spraying (uma',
      'senha contra milhares de e-mails) — quem barra isso é o rate limit.',
    ],
    entries: [
      { key: 'LOGIN_MAX_ATTEMPTS', value: '5' },
      { key: 'LOGIN_LOCK_DURATION', value: '900' },
    ],
  };
}

function observabilitySection(): EnvSection {
  return {
    title: 'Observabilidade (opcional) — Sentry é no-op sem DSN',
    notes: [
      'Duas metades independentes: SENTRY_DSN é o servidor, NEXT_PUBLIC_SENTRY_DSN é o',
      'browser. Preencher só uma dá meia observabilidade, não erro.',
      '',
      'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE é lida por',
      'apps/web/instrumentation-client.ts e NÃO existia no .env.example do boilerplate —',
      'estava caindo em `?? 0`, ou seja, tracing do browser desligado por omissão. Aqui',
      'ela é explícita, para que ligar tracing seja mudar um número e não descobrir uma',
      'chave não documentada.',
      '',
      'OTEL_EXPORTER_OTLP_ENDPOINT foi omitida: nada no código a lê.',
    ],
    entries: [
      { key: 'SENTRY_DSN', value: '' },
      { key: 'SENTRY_TRACES_SAMPLE_RATE', value: '0' },
      { key: 'NEXT_PUBLIC_SENTRY_DSN', value: '' },
      { key: 'NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE', value: '0' },
    ],
  };
}

function webSection(recipe: Recipe, apiPublicUrl: string): EnvSection {
  const entries: EnvEntry[] = [
    {
      key: 'WEB_PORT',
      value: String(DEV_PORTS.web),
      notes: [
        `Lida só pelo docker-compose.dev.yml. O Next NÃO a lê: o package.json do web tem`,
        `\`next dev -p ${DEV_PORTS.web}\` e \`next start -p ${DEV_PORTS.web}\` embutidos, e o`,
        'Playwright embute a mesma baseURL. Mudar aqui sem mudar lá publica a porta errada.',
      ],
    },
    {
      key: 'API_INTERNAL_URL',
      value: apiPublicUrl,
      notes: [
        'Alvo do BFF proxy, do lado servidor — nunca chega ao browser. No compose dev é',
        'sobrescrito para http://api:4201 (nome do serviço).',
      ],
    },
    {
      key: 'NEXT_PUBLIC_SIGNUP_ENABLED',
      value: recipe.features.publicSignup ? 'true' : 'false',
      notes: [
        '',
        'As metades públicas. Cada uma TEM de concordar com a contraparte da API — só',
        'decidem o que o browser RENDERIZA; quem decide o que é permitido é a API. Quando',
        'as duas discordam a UI é a mentirosa e o usuário paga: um formulário de signup',
        'que sempre dá 403, um botão de provider que sempre dá 404. Nenhuma das duas',
        'falhas aparece até alguém clicar.',
        '',
        'Espelha PUBLIC_SIGNUP_ENABLED (sai do mesmo valor, nesta geração):',
      ],
    },
  ];

  // NEXT_PUBLIC_APP_NAME e NEXT_PUBLIC_DEFAULT_LOCALE ficaram de fora: o mapa
  // confirmou que nenhum arquivo de `apps/` ou `packages/` as lê (o locale vem de
  // `apps/web/src/i18n/`). Mantê-las seria oferecer dois botões que não estão ligados a
  // nada — e o primeiro dev que trocar NEXT_PUBLIC_APP_NAME e não ver efeito vai gastar
  // uma hora procurando o bug no lugar errado.

  return { title: 'WEB', entries };
}

// ─────────────────────────────────────────────────────────────────────────────
// Renderização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um valor precisa de aspas?
 *
 * O `dotenv` aceita as duas formas, mas espaço no valor é o caso que mais quebra em
 * silêncio: `MAIL_FROM=Acme Corp <no-reply@…>` é lido inteiro por alguns parsers e
 * truncado por outros. `#` é pior, porque começa comentário no meio da linha.
 */
function needsQuotes(value: string): boolean {
  return /[\s#]/.test(value);
}

function renderValue(value: string): string {
  return needsQuotes(value) ? `"${value}"` : value;
}

function banner(title: string): string {
  const prefix = `# ${'─'.repeat(3)} ${title} `;
  const pad = Math.max(0, BANNER_WIDTH - [...prefix].length);
  return `${prefix}${'─'.repeat(pad)}`;
}

/** Serializa o `EnvFile` no texto que vai para o disco. */
export function renderEnv(env: EnvFile): string {
  const lines: string[] = [];

  lines.push(`# ${'═'.repeat(BANNER_WIDTH - 2)}`);
  for (const line of env.header) lines.push(line ? `#  ${line}` : '#');
  lines.push(`# ${'═'.repeat(BANNER_WIDTH - 2)}`);

  for (const section of env.sections) {
    if (section.entries.length === 0) continue;

    lines.push('');
    lines.push(banner(section.title));
    for (const note of section.notes ?? []) lines.push(note ? `# ${note}` : '#');

    for (const entry of section.entries) {
      for (const note of entry.notes ?? []) lines.push(note ? `# ${note}` : '#');
      const assignment = `${entry.key}=${renderValue(entry.value)}`;
      const body = entry.commentedOut ? `# ${assignment}` : assignment;
      // A marca de produção vai inline quando há valor, e ACIMA quando o valor é vazio.
      // `MAIL_USER=    # ⚠️ …` é lido como comentário inline pelo dotenv v16, mas não por
      // todo parser de `.env` do mundo — e uma chave que deveria ser vazia chegando à
      // API com o texto do aviso dentro é o tipo de bug que ninguém procura no lugar
      // certo. Com valor presente a ambiguidade não existe.
      if (entry.todo && entry.value === '') {
        lines.push(TODO_MARK);
        lines.push(body);
      } else {
        lines.push(entry.todo ? `${body}    ${TODO_MARK}` : body);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Inspeção — o que os testes e o relatório consomem
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As chaves ATIVAS e seus valores.
 *
 * Uma chave que aparece duas vezes (a versão ativa e a comentada do captcha/oauth) só
 * conta a ativa — é isso que o `dotenv` vê, e é contra isso que os testes de par devem
 * asseverar.
 */
export function envRecord(env: EnvFile): Record<string, string> {
  const out: Record<string, string> = {};
  for (const section of env.sections) {
    for (const entry of section.entries) {
      if (entry.commentedOut) continue;
      out[entry.key] = entry.value;
    }
  }
  return out;
}

/** Quantas chaves ativas o arquivo tem — vai para o `GenerationReport`. */
export function countEnvKeys(env: EnvFile): number {
  return Object.keys(envRecord(env)).length;
}

/**
 * As 4 chaves que fazem o boot falhar se faltarem (ou, nos segredos, se tiverem < 16
 * caracteres). Exportado porque é a asserção que todo teste de `.env` deve fazer, e
 * duplicar a lista em cada teste a faria envelhecer em um dos lugares.
 */
export const REQUIRED_ENV_KEYS = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CSRF_SECRET',
] as const;
