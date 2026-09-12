# MAPA DE CONFIG E INFRAESTRUTURA — `dontpanic`

> Especificação para o gerador (`create-dontpanic` / `@dontpanic/create`).
> Fonte: `/Users/junior/projetos/dontpanic` em `main @ 4b32926` (repo limpo).
> Todos os caminhos são relativos à raiz do `dontpanic`. Nenhum arquivo do repo
> foi modificado na produção deste documento.

## 0. Sumário executivo

| Métrica | Valor |
| --- | --- |
| Variáveis em `.env.example` | **91** |
| Validadas por `envSchema` (API) | **73** |
| Só web/infra (não passam por `validateEnv`) | **18** |
| Obrigatórias sem default (boot falha) | **4** (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`) |
| Condicionalmente obrigatórias | **8** (captcha 1 + oauth 7) |
| Segredos a gerar | **3** obrigatórios + 4 recomendados |
| Pares `API ↔ NEXT_PUBLIC` | **6** (1 deles ausente do `.env.example`) |
| Pares implícitos (porta/host/bucket/role) | **12** |
| Tarball do template (gzip, sem lockfile) | **~487 KB** |
| Tarball do template (gzip, com lockfile) | **~688 KB** |
| Arquivos `.gitignore` no template | **2** (raiz + `.husky/_/`) |
| Ocorrências literais de `dontpanic` fora de `node_modules`/build | **490** em **199** arquivos (203 delas são o escopo `@dontpanic/`) |

**Já existe prior art no repo:** `packages/create-dontpanic/` (v0.3.0, publicado no
npm) com `scripts/build-template.mjs` + `src/index.ts` + `src/scaffold.ts`.
Ele resolve empacotamento e 3 segredos, mas **não** renomeia nada além de
`container_name:`. A seção 2.6 lista exatamente o que falta.

---

## 1. Inventário de variáveis de ambiente

### 1.1 Onde o env é lido

| Consumidor | Arquivo | Mecanismo |
| --- | --- | --- |
| API (runtime) | `apps/api/src/load-env.ts:8` | `dotenv config({ path: ['../../.env', '.env'] })`, importado primeiro em `main.ts` |
| API (validação) | `apps/api/src/config/env.ts:10-167` (`envSchema`), `:234-285` (`validateEnv`) | `@nestjs/config` `validate:` — **falha o boot** |
| Prisma CLI (migrate/seed/studio) | `apps/api/prisma.config.ts:6-7,19-22` | `dotenv` do root; usa `DATABASE_ADMIN_URL` → `DATABASE_URL` → placeholder |
| Prisma scripts | `apps/api/package.json:20-23` | `dotenv -e ../../.env --` (pacote `dotenv-cli`) |
| Web (build + runtime) | `apps/web/next.config.ts:12` | `loadEnv({ path: ['../../.env', '.env'] })` — é isto que faz `NEXT_PUBLIC_*` do root `.env` entrar no bundle |
| Web (BFF) | `apps/web/src/app/api/[...path]/route.ts:12` | `process.env.API_INTERNAL_URL` |
| Docker compose | `docker-compose.yml:11,26,44-45,74-75`; `docker-compose.dev.yml:74,127` | interpolação `${VAR:-default}` |
| Compose dev (override) | `docker-compose.dev.yml:50-71,93-103,119-124` | `env_file: .env` + `environment:` que **sobrescreve** o `.env` |
| e2e | `apps/api/test/e2e-setup.ts:17-54` | reescreve `process.env` antes de qualquer import |

> **Não existe validação de env no lado web.** O Next só falha em runtime/render.
> Isto significa que um `NEXT_PUBLIC_*` errado é sempre silencioso — motivo pelo
> qual o gerador tem de acertar os pares por construção (§1.4).

### 1.2 Tabela — variáveis validadas pela API (`envSchema`, 73)

Coluna “L#” = linha em `.env.example`. “env.ts” = linha em `apps/api/src/config/env.ts`.
`obrig.` = sem default no schema (boot falha se ausente/inválida).

| Variável | L# | env.ts | Default no schema | Obrig. | Feature / driver que usa |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | 17 | 11 | `development` (enum dev/test/production) | — | `assertNotSuperuser` só lança em `production` |
| `API_PORT` | 18 | 12 | `3001` (⚠️ `.env.example` diz 4201) | — | `main.ts` listen |
| `API_HOST` | 19 | 13 | `0.0.0.0` | — | `main.ts` listen |
| `DATABASE_URL` | 49 | 18 | — (`min(1)`) | **SIM** | Prisma runtime; **role restrita** |
| `DATABASE_ADMIN_URL` | 50 | 21 | `''` | — | migrate/seed/DDL (owner) |
| `REDIS_URL` | 53 | 22 | `redis://localhost:6379` (⚠️ example: 4203) | — | `CACHE_DRIVER=redis`, `QUEUE_DRIVER=bullmq`, throttler storage |
| `JWT_ACCESS_SECRET` | 56 | 24 | — (`min(16)`) | **SIM** | **SEGREDO** |
| `JWT_REFRESH_SECRET` | 57 | 25 | — (`min(16)`) | **SIM** | **SEGREDO** |
| `JWT_ACCESS_TTL` | 58 | 26 | `900` | — | auth |
| `JWT_REFRESH_TTL` | 59 | 27 | `604800` | — | auth |
| `REFRESH_REUSE_GRACE` | 62 | 31 | `10` | — | rotação/reuse detection |
| `COOKIE_DOMAIN` | 65 | 33 | `localhost` | — | cookies httpOnly |
| `COOKIE_SECURE` | 66 | 34 | `false` (boolish) | — | cookies |
| `CSRF_SECRET` | 69 | 35 | — (`min(16)`) | **SIM** | **SEGREDO** (double-submit) |
| `WEB_ORIGIN` | 72 | 37 | `http://localhost:3000` (⚠️ example: 4200) | — | CORS |
| `API_PUBLIC_URL` | 73 | 38 | `http://localhost:3001` (⚠️ example: 4201) | — | links em e-mail, swagger |
| `TOTP_ISSUER` | 76 | 40 | `DontPanic` | — | 2FA — **contém marca** |
| `TWO_FACTOR_REQUIRED` | 79 | 43 | `false` (boolish) | — | `TwoFactorGateGuard` |
| `STORAGE_DRIVER` | 22 | 46 | `s3` (enum s3/local) | — | ports&adapters |
| `MAIL_DRIVER` | 23 | 47 | `smtp` (enum smtp/ses/console) | — | ports&adapters |
| `CACHE_DRIVER` | 24 | 48 | `redis` (enum redis/memory) | — | ports&adapters |
| `DB_PROVIDER` | 25 | 49 | `postgresql` (enum pg/mysql/sqlite) | — | ⚠️ **decorativo no runtime** — ver §7.5 |
| `MAIL_HOST` | 82 | 52 | `localhost` | — | `MAIL_DRIVER=smtp` |
| `MAIL_PORT` | 83 | 53 | `1025` (⚠️ example: 4206) | — | `MAIL_DRIVER=smtp` |
| `MAIL_SECURE` | 84 | 54 | `false` (boolish) | — | smtp |
| `MAIL_USER` | 85 | 55 | `''` | — | smtp |
| `MAIL_PASSWORD` | 86 | 56 | `''` | — | smtp — **segredo em prod** |
| `MAIL_FROM` | 87 | 57 | `DontPanic <no-reply@dontpanic.dev>` | — | **contém marca** |
| `S3_ENDPOINT` | 90 | 60 | `http://localhost:9000` (⚠️ example: 4204) | — | `STORAGE_DRIVER=s3` |
| `S3_REGION` | 91 | 61 | `us-east-1` | — | s3 |
| `S3_BUCKET` | 92 | 62 | `dontpanic` | — | **contém marca** + par com compose |
| `S3_ACCESS_KEY` | 93 | 63 | `minioadmin` | — | s3 — **segredo em prod** |
| `S3_SECRET_KEY` | 94 | 64 | `minioadmin` | — | s3 — **segredo em prod** |
| `S3_FORCE_PATH_STYLE` | 95 | 65 | `true` (boolish) | — | MinIO/R2 |
| `S3_PUBLIC_URL` | 96 | 66 | `http://localhost:9000/dontpanic` | — | **contém marca** |
| `LOCAL_STORAGE_DIR` | 28 | 69 | `./storage` | — | `STORAGE_DRIVER=local` |
| `LOCAL_STORAGE_PUBLIC_URL` | 29 | 70 | `http://localhost:3001/files` (⚠️ example: 4201) | — | `STORAGE_DRIVER=local` |
| `AWS_REGION` | 32 | 73 | `us-east-1` | — | `MAIL_DRIVER=ses` |
| `SES_ACCESS_KEY` | 33 | 74 | `''` | — | ses — **segredo** |
| `SES_SECRET_KEY` | 34 | 75 | `''` | — | ses — **segredo** |
| `RATE_LIMIT_MAX` | 99 | 78 | `100` | — | throttler global |
| `RATE_LIMIT_WINDOW` | 100 | 79 | `60000` | — | throttler |
| `AUTH_RATE_LIMIT_MAX` | 103 | 82 | `10` | — | `@SensitiveThrottle()` |
| `AUTH_RATE_LIMIT_WINDOW` | 104 | 83 | `60000` | — | `@SensitiveThrottle()` |
| `LOGIN_MAX_ATTEMPTS` | 259 | 84 | `5` | — | lockout por conta |
| `LOGIN_LOCK_DURATION` | 260 | 85 | `900` | — | lockout |
| `QUEUE_DRIVER` | 116 | 91 | `bullmq` (enum bullmq/memory) | — | fila |
| `QUEUE_NAME` | 117 | 92 | `dontpanic` | — | **contém marca** |
| `QUEUE_PREFIX` | 119 | 94 | `{dontpanic}` | — | **contém marca** (chaves Redis) |
| `QUEUE_CONCURRENCY` | 120 | 95 | `5` (`min(1)`) | — | worker |
| `QUEUE_ATTEMPTS` | 123 | 96 | `5` (`min(1)`) | — | retry |
| `QUEUE_BACKOFF` | 124 | 98 | `2000` | — | retry |
| `CAPTCHA_DRIVER` | 139 | 103 | `none` (enum none/turnstile/recaptcha-v2/recaptcha-v3) | — | captcha |
| `CAPTCHA_SECRET_KEY` | 140 | 104 | `''` | **cond.** | **obrigatória se `CAPTCHA_DRIVER != none`** |
| `CAPTCHA_MIN_SCORE` | 142 | 106 | `0.5` (`0..1`) | — | recaptcha-v3 |
| `CAPTCHA_TIMEOUT` | 143 | 107 | `5000` | — | captcha |
| `CAPTCHA_FAIL_OPEN` | 147 | 111 | `false` (boolish) | — | captcha |
| `PUBLIC_SIGNUP_ENABLED` | 164 | 123 | `true` (boolish) | — | signup |
| `INVITATION_TTL_HOURS` | 172 | 127 | `168` (int 1..720) | — | convites |
| `INVITATION_MAX_RESENDS` | 175 | 130 | `5` (int 0..20) | — | convites |
| `OAUTH_PROVIDERS` | 191 | 140 | `''` | — | lista CSV: `google,apple,github` |
| `OAUTH_CALLBACK_BASE_URL` | 197 | 143 | `''` | **cond.** | obrigatória se lista não vazia |
| `OAUTH_GOOGLE_CLIENT_ID` | 202 | 145 | `''` | **cond.** | se lista contém `google` |
| `OAUTH_GOOGLE_CLIENT_SECRET` | 203 | 146 | `''` | **cond.** | idem — **segredo** |
| `OAUTH_APPLE_CLIENT_ID` | 214 | 149 | `''` | **cond.** | se lista contém `apple` (Services ID) |
| `OAUTH_APPLE_TEAM_ID` | 215 | 150 | `''` | **cond.** | idem |
| `OAUTH_APPLE_KEY_ID` | 216 | 151 | `''` | **cond.** | idem |
| `OAUTH_APPLE_PRIVATE_KEY` | 219 | 154 | `''` | **cond.** | idem — **segredo PEM multi-linha** |
| `OAUTH_GITHUB_CLIENT_ID` | 225 | 156 | `''` | **cond.** | se lista contém `github` |
| `OAUTH_GITHUB_CLIENT_SECRET` | 226 | 157 | `''` | **cond.** | idem — **segredo** |
| `TRUST_PROXY` | 243 | 162 | `loopback` | — | `parseTrustProxy` (`env.ts:218-231`) |
| `SENTRY_DSN` | 263 | 165 | `''` | — | observabilidade (no-op vazio) |
| `SENTRY_TRACES_SAMPLE_RATE` | 264 | 166 | `0` (`0..1`) | — | observabilidade |

> ⚠️ **Divergência sistemática default-do-schema vs `.env.example`.** Oito
> variáveis (`API_PORT`, `REDIS_URL`, `WEB_ORIGIN`, `API_PUBLIC_URL`, `MAIL_PORT`,
> `S3_ENDPOINT`, `S3_PUBLIC_URL`, `LOCAL_STORAGE_PUBLIC_URL`) têm default de
> schema apontando para portas **30xx/9000/1025** enquanto o `.env.example` usa o
> range **42xx**. Consequência para o gerador: **o `.env` gerado nunca pode omitir
> essas chaves**. Se o gerador emitir um `.env` “enxuto” só com o que o usuário
> escolheu, a API sobe apontando para `localhost:6379`/`:9000`/`:1025` e o
> `docker compose` do projeto está em `:4203`/`:4204`/`:4206` — falha em runtime,
> não no boot.

### 1.3 Tabela — variáveis fora do `envSchema` (18)

| Variável | L# | Default | Quem lê | Observação para o gerador |
| --- | --- | --- | --- | --- |
| `POSTGRES_PORT` | 9 | `4202` | `docker-compose.yml:11` | par com `DATABASE_URL` **e** com portas hardcoded no e2e (§4.5) |
| `REDIS_PORT` | 10 | `4203` | `docker-compose.yml:26` | par com `REDIS_URL` |
| `MINIO_PORT` | 11 | `4204` | `docker-compose.yml:44` | par com `S3_ENDPOINT` |
| `MINIO_CONSOLE_PORT` | 12 | `4205` | `docker-compose.yml:45` | — |
| `MAILPIT_SMTP_PORT` | 13 | `4206` | `docker-compose.yml:74` | par com `MAIL_PORT` |
| `MAILPIT_UI_PORT` | 14 | `4207` | `docker-compose.yml:75` | — |
| `WEB_PORT` | 268 | `4200` | `docker-compose.dev.yml:127` | ⚠️ **não** é lido pelo Next: `apps/web/package.json:6,8` tem `-p 4200` **hardcoded** |
| `API_INTERNAL_URL` | 272 | `http://localhost:4201` | `apps/web/src/app/api/[...path]/route.ts:12` | alvo do BFF; sobrescrito no compose dev para `http://api:4201` |
| `CLIENT_IP_HEADER` | 255 | `x-forwarded-for` | BFF (`route.ts`) | decisão de deploy |
| `CLIENT_IP_TRUSTED_HOPS` | 256 | `0` | BFF (`route.ts`) | decisão de deploy; conta **da direita** |
| `NEXT_PUBLIC_CAPTCHA_DRIVER` | 149 | `none` | web | **par obrigatório** de `CAPTCHA_DRIVER` |
| `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | 150 | `''` | web | metade pública do captcha |
| `NEXT_PUBLIC_SIGNUP_ENABLED` | 282 | `true` | web | **par obrigatório** de `PUBLIC_SIGNUP_ENABLED` |
| `NEXT_PUBLIC_OAUTH_PROVIDERS` | 284 | `''` | web | **par obrigatório** de `OAUTH_PROVIDERS` |
| `NEXT_PUBLIC_SENTRY_DSN` | 273 | `''` | `apps/web/instrumentation-client.ts`, `sentry.*.config.ts` | — |
| `NEXT_PUBLIC_APP_NAME` | 269 | `DontPanic` | **NINGUÉM** | ⚠️ env morta — nenhuma referência no código (grep em `apps/`, `packages/`). **Contém marca** |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | 270 | `pt-BR` | **NINGUÉM** | ⚠️ env morta — o locale vem de `apps/web/src/i18n/` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | 265 | `''` | **NINGUÉM** | ⚠️ env morta |

**Ausentes do `.env.example` mas lidas pelo código** (gerador deve adicionar ou o
comportamento vira implícito):

| Variável | Onde é lida | Efeito de estar ausente |
| --- | --- | --- |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | `apps/web/instrumentation-client.ts:9` | cai em `?? 0` — tracing desligado no browser |
| `SENTRY_AUTH_TOKEN` | `apps/web/next.config.ts:41` (comentário) / plugin Sentry | upload de source map é pulado — OK |
| `CI` | `apps/web/next.config.ts:43`, `playwright.config.ts:8-10` | comportamento de CI |
| `CHOKIDAR_USEPOLLING` / `WATCHPACK_POLLING` | só no `docker-compose.dev.yml:71,124` | hot-reload em bind-mount |

### 1.4 Pares que precisam concordar

#### A. Pares `API ↔ NEXT_PUBLIC` (documentados no CLAUDE.md + verificados)

| Lado API | Lado Web | Sintoma se divergirem |
| --- | --- | --- |
| `CAPTCHA_DRIVER` | `NEXT_PUBLIC_CAPTCHA_DRIVER` | API exige token, form não renderiza widget → **todo submit 400** (`CaptchaRequired`) |
| `CAPTCHA_SECRET_KEY` | `NEXT_PUBLIC_CAPTCHA_SITE_KEY` | valores **diferentes por natureza**, mas ambos vazios/preenchidos juntos; site key sem secret → 400 |
| `OAUTH_PROVIDERS` | `NEXT_PUBLIC_OAUTH_PROVIDERS` | nome extra no web → **botão dá 404**; nome a menos → provider ligado e invisível |
| `PUBLIC_SIGNUP_ENABLED` | `NEXT_PUBLIC_SIGNUP_ENABLED` | form renderiza e **todo submit 403** |
| `SENTRY_DSN` | `NEXT_PUBLIC_SENTRY_DSN` | metades independentes (server vs browser); não quebra, só meia observabilidade |
| `SENTRY_TRACES_SAMPLE_RATE` | `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | ⚠️ a metade web **não existe** no `.env.example` |

**Não há outros pares `NEXT_PUBLIC_*`** — a lista completa de `NEXT_PUBLIC_*`
referenciada no web é: `CAPTCHA_DRIVER`, `CAPTCHA_SITE_KEY`, `OAUTH_PROVIDERS`,
`SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE`, `SIGNUP_ENABLED`. (`APP_NAME` e
`DEFAULT_LOCALE` estão no `.env.example` e em lugar nenhum do código.)

#### B. Pares implícitos — porta / host / nome (a categoria que realmente quebra o gerador)

| # | Grupo | Membros | Onde |
| --- | --- | --- | --- |
| 1 | Porta Postgres | `POSTGRES_PORT` · `DATABASE_URL` · `DATABASE_ADMIN_URL` · **`4202` hardcoded** | `.env.example:9,49,50`; `apps/api/test/e2e-setup.ts:18,23`; `apps/api/test/global-setup.ts:31,33` |
| 2 | Porta Redis | `REDIS_PORT` · `REDIS_URL` | `.env.example:10,53` |
| 3 | Porta MinIO | `MINIO_PORT` · `S3_ENDPOINT` · `S3_PUBLIC_URL` · `docker-compose.dev.yml:63,64` | `.env.example:11,90,96` |
| 4 | Bucket | `S3_BUCKET` · `S3_PUBLIC_URL` (sufixo) · `mc mb local/dontpanic` | `.env.example:92,96`; `docker-compose.yml:63,64` |
| 5 | Credencial MinIO | `S3_ACCESS_KEY`/`S3_SECRET_KEY` · `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` · `mc alias set` | `.env.example:93,94`; `docker-compose.yml:41,42,62` |
| 6 | Porta SMTP | `MAILPIT_SMTP_PORT` · `MAIL_PORT` | `.env.example:13,83` |
| 7 | Porta API | `API_PORT` · `API_PUBLIC_URL` · `API_INTERNAL_URL` · `LOCAL_STORAGE_PUBLIC_URL` · `EXPOSE 4201` | `.env.example:18,29,73,272`; `Dockerfile.api:22`; `docker-compose.dev.yml:54,74,123` |
| 8 | Porta Web | `WEB_PORT` · `WEB_ORIGIN` · `next dev -p 4200` · `next start -p 4200` · `playwright baseURL` · `EXPOSE 4200` | `.env.example:72,268`; `apps/web/package.json:6,8`; `apps/web/playwright.config.ts:13,18`; `Dockerfile.web:17` |
| 9 | Role/base do Postgres | `DATABASE_URL` (role `dontpanic_app`) · `DATABASE_ADMIN_URL` (owner `dontpanic`) · `CREATE ROLE dontpanic_app` · `POSTGRES_USER/DB` · `pg_isready -U dontpanic` | `.env.example:49,50`; `apps/api/prisma/migrations/20260911105300_app_role/migration.sql:16-49`; `docker-compose.yml:7-9,15` |
| 10 | Provider do banco | `DB_PROVIDER` · `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`) · `datasource` em `prisma/schema/main.prisma` · `@prisma/adapter-pg` | — |
| 11 | Driver ↔ serviço de infra | `CACHE_DRIVER=redis` **ou** `QUEUE_DRIVER=bullmq` ⇒ serviço `redis`; `STORAGE_DRIVER=s3` ⇒ `minio`+`minio-setup`; `MAIL_DRIVER=smtp` ⇒ `mailpit` | `apps/api/src/infra/{cache,queue,storage,mail}/*.module.ts` |
| 12 | Confiança de proxy | `TRUST_PROXY` (API, Fastify) · `CLIENT_IP_HEADER`+`CLIENT_IP_TRUSTED_HOPS` (BFF) | `.env.example:243,255,256` |

### 1.5 Condições que fazem `validateEnv` FALHAR O BOOT

`apps/api/src/config/env.ts:234-285`. Mensagem sempre começa com
`"Invalid environment variables. Don't Panic, just fix these:"`.

| # | Condição | Código |
| --- | --- | --- |
| 1 | `DATABASE_URL` ausente ou vazia (`min(1)`) | `env.ts:18` |
| 2 | `JWT_ACCESS_SECRET` ausente ou **< 16 chars** | `env.ts:24` |
| 3 | `JWT_REFRESH_SECRET` ausente ou **< 16 chars** | `env.ts:25` |
| 4 | `CSRF_SECRET` ausente ou **< 16 chars** | `env.ts:35` |
| 5 | Enum inválido em `NODE_ENV`, `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `DB_PROVIDER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER` | `env.ts:11,46-49,91,103` |
| 6 | Numérico fora de faixa: `CAPTCHA_MIN_SCORE ∉ [0,1]`, `SENTRY_TRACES_SAMPLE_RATE ∉ [0,1]`, `QUEUE_CONCURRENCY/ATTEMPTS < 1`, `INVITATION_TTL_HOURS ∉ [1,720]`, `INVITATION_MAX_RESENDS ∉ [0,20]` | `env.ts:95-96,106,127,130,166` |
| 7 | `CAPTCHA_DRIVER != 'none'` **e** `CAPTCHA_SECRET_KEY` vazia | `env.ts:242-247` |
| 8 | Provider listado em `OAUTH_PROVIDERS` sem **todas** as credenciais (`OAUTH_REQUIRED_KEYS`, `env.ts:192-201`) | `env.ts:254-260` |
| 9 | `OAUTH_PROVIDERS` não vazia **e** `OAUTH_CALLBACK_BASE_URL` vazia | `env.ts:263-265` |
| 10 | Nome desconhecido em `OAUTH_PROVIDERS` (fora de `google,apple,github`) | `env.ts:268-277` |

**Fora do `validateEnv`, mas também impede subir:** `PrismaService.assertNotSuperuser`
lança quando `NODE_ENV=production` e a role conectada tem `rolsuper` ou
`rolbypassrls` (§7.3).

**Regra de ouro para o gerador:** o `.env` gerado com
`CAPTCHA_DRIVER=none` + `OAUTH_PROVIDERS=` (vazia) + os 3 segredos de ≥16 chars
+ `DATABASE_URL` preenchida **passa todas as 10 condições**. Qualquer feature
opcional que o usuário ligue no wizard tem de arrastar consigo as credenciais, ou
o gerador entrega um projeto que não boota.

### 1.6 Segredos que o gerador tem de gerar

| Variável | Validação | Formato recomendado | Obrigatoriedade |
| --- | --- | --- | --- |
| `JWT_ACCESS_SECRET` | `z.string().min(16)` | `randomBytes(32).toString('hex')` → 64 chars | **obrigatório** |
| `JWT_REFRESH_SECRET` | `z.string().min(16)` | idem, **valor distinto** do access | **obrigatório** |
| `CSRF_SECRET` | `z.string().min(16)` | idem | **obrigatório** |
| senha da role de app (`dontpanic_app`) | nenhuma | `randomBytes(16).toString('hex')` | recomendado — hoje é `dontpanic_app` literal na migration (§7) |
| senha do owner (`POSTGRES_PASSWORD`) | nenhuma | idem | recomendado (dev-only hoje) |
| `S3_ACCESS_KEY`/`S3_SECRET_KEY` | nenhuma | `minioadmin` hoje; secret ≥ 8 chars para o MinIO aceitar | recomendado |
| `MAIL_PASSWORD`, `SES_*`, `OAUTH_*_SECRET`, `CAPTCHA_SECRET_KEY` | nenhuma | **não geráveis** — vêm de terceiro | perguntar / deixar vazio |

> A única validação de tamanho no repo é `min(16)` nos três segredos. Não há
> checagem de entropia nem rejeição do valor de exemplo — o `.env.example` traz
> `dev-access-secret-change-me-aaaa…` (40 chars) e ele **passa**. Ou seja: um
> gerador que simplesmente copiasse o `.env.example` produziria um projeto que
> sobe com segredos públicos. A implementação atual
> (`packages/create-dontpanic/src/scaffold.ts:45-52`) já rotaciona os três.

### 1.7 Valores que contêm a marca `dontpanic`

Só valores (não nomes de chave), em `.env.example`:

| L# | Chave | Valor | O que fazer |
| --- | --- | --- | --- |
| 49 | `DATABASE_URL` | `postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic` | role + senha + nome da base |
| 50 | `DATABASE_ADMIN_URL` | `postgresql://dontpanic:dontpanic@localhost:4202/dontpanic` | owner + senha + base |
| 76 | `TOTP_ISSUER` | `DontPanic` | nome que aparece no app autenticador do usuário |
| 87 | `MAIL_FROM` | `"DontPanic <no-reply@dontpanic.dev>"` | remetente |
| 92 | `S3_BUCKET` | `dontpanic` | par com `mc mb local/dontpanic` |
| 96 | `S3_PUBLIC_URL` | `http://localhost:4204/dontpanic` | sufixo = bucket |
| 117 | `QUEUE_NAME` | `dontpanic` | nome da fila BullMQ |
| 119 | `QUEUE_PREFIX` | `{dontpanic}` | **namespace das chaves Redis** — se não mudar, dois projetos gerados na mesma máquina compartilham fila |
| 269 | `NEXT_PUBLIC_APP_NAME` | `DontPanic` | env morta, mas visível no `.env` |

Fora do `.env.example` (§2.6 tem a lista completa de arquivos).

---

## 2. Estratégia de empacotamento do template

### 2.1 O que realmente pesa no repo

Medido em 2026-09-12 (`du -sh`):

| Caminho | Tamanho | Vai para o template? |
| --- | --- | --- |
| `node_modules/` (raiz) | **3,8 G** | ❌ |
| `apps/web/.next/` | **276 M** | ❌ cache de build do Next/Turbopack |
| `.turbo/` (raiz) | **50 M** | ❌ logs/cache do turbo |
| `.git/` | 4,8 M | ❌ |
| `packages/create-dontpanic/template/` | 2,4 M | ❌ (é o próprio template) |
| `apps/api/dist/` | 1,3 M | ❌ |
| `apps/api/src/` | 1,2 M | ✅ |
| `apps/web/src/` | 1,1 M | ✅ |
| `pnpm-lock.yaml` | 693 K | ⚠️ ver §2.4 |
| `packages/shared/` | 468 K | ✅ (menos `dist/`) |
| `apps/web/messages/` | 48 K | ✅ (i18n pt-BR + en-US, 46 K juntos) |
| `apps/api/prisma/` | 80 K | ✅ |
| `apps/api/test/` | 116 K | ✅ |
| `CLAUDE.md` + `README.md` | 81 K | ✅ (maiores arquivos do template) |

**Resposta à hipótese dos "57M":** não há coverage, assets binários, uploads de
teste nem storybook-static comprometidos. O peso é **só cache de build**:
`apps/web/.next` (276 M) + `.turbo` (50 M) + `node_modules` aninhados.
O conteúdo **versionado** é `git ls-files` = **526 arquivos / 3,7 MB / 70.067 LOC**.
Nenhum arquivo do template passa de 43 KB (o maior é o próprio `CLAUDE.md`).

### 2.2 Lista de exclusão (verificada contra o que existe hoje)

Estas são as `SKIP_NAMES` de `packages/create-dontpanic/scripts/build-template.mjs:26-45`,
confirmadas suficientes:

```
node_modules/        .git/              .next/             .turbo/
dist/                out/               coverage/          .pnpm-store/
storybook-static/    playwright-report/ test-results/      .DS_Store
.env                 .env.local         pnpm-lock.yaml     *.tsbuildinfo
*.log
packages/create-dontpanic/   (o instalador nunca entra no próprio template)
```

**A acrescentar** (hoje faltam e vazam para o template):

| Caminho | Por que excluir |
| --- | --- |
| `.claude/settings.local.json` | configuração **local da máquina do Marcio** — lista servidores MCP (`mysql-monetizze-prod-readonly`, `elasticsearch-…`). Não é segredo, mas não tem por que viajar |
| `.husky/_/` | diretório gerado pelo `husky` no `prepare`; contém o `.gitignore` com `*`. É recriado no `pnpm install` do projeto gerado |
| `PENDENCIAS.template.md` | artefato do processo do boilerplate, não do produto gerado (avaliar) |
| `.changeset/*.md` (changesets pendentes) | changesets do *boilerplate* não descrevem o projeto novo; manter só `config.json` + `README.md` |
| `.github/workflows/publish-create-dontpanic.yml` | publica o **instalador**, não faz sentido no projeto gerado |
| `.github/workflows/release.yml` | fluxo changesets do boilerplate (avaliar) |
| `.github/dependabot.yml` | manter, mas ver §3.5 (os `ignore` protegem as travas) |
| `.env` | já excluído — **crítico**, é o `.env` real com segredos de dev |

### 2.3 Tamanho final do tarball

Medido com `tar` + `gzip -9` aplicando exatamente as exclusões acima:

| Cenário | tar | tar.gz |
| --- | --- | --- |
| Sem lockfile (como hoje) | 2,36 MB | **~487 KB** |
| Com `pnpm-lock.yaml` | ~3,05 MB | **~688 KB** |

**Cabe folgadamente.** Mesmo somando o `dist/` bundlado do CLI (52 KB, tsup com
deps embutidas), o pacote publicado fica em **~0,6 MB** — duas ordens de grandeza
abaixo do limite prático de ~10 MB. Não há razão de tamanho para não embutir o
template no pacote npm (vs. baixar um tarball do GitHub em runtime).

### 2.4 Lockfile: enviar ou não

Hoje **não envia** (`SKIP_NAMES` inclui `pnpm-lock.yaml`), com a justificativa
registrada em `build-template.mjs:39-43`: integridades travadas na máquina de dev
divergem do que o registry serve numa máquina nova (`ERR_PNPM_TARBALL_INTEGRITY`),
e create-next-app/create-vite também não enviam.

Contrapartida a documentar como risco: **sem lockfile, o projeto gerado resolve
versões novas no primeiro `pnpm install`**. Isso interage diretamente com as travas
da §3.2 — um range `^` resolve para algo mais novo do que o boilerplate testou.
As travas que sobrevivem sem lockfile são as **exatas** (`typescript: "6.0.3"`,
`@commitlint/*: 21.2.2`, `lint-staged: 17.5.0`, `zod: "4.6.1"` na API,
`storybook/@storybook/*: 10.6.0`, `vitest: 5.0.0` no shared) e os `overrides` do
`pnpm-workspace.yaml`. As travas expressas como `^` (ex.: `prisma: "^7.10.0"`)
**não** protegem contra um 7.x que quebre. Além disso:

- `pnpm install --frozen-lockfile` aparece em **4 workflows** (`ci.yml:25`,
  `release.yml:27`, `publish-create-dontpanic.yml:37`) e em `Dockerfile.api:12` e
  `Dockerfile.web:9`. **Sem lockfile no template, todos falham** no projeto gerado.
  → O gerador tem de (a) enviar o lockfile, ou (b) rodar `pnpm install` no
  scaffold e commitar o lockfile resultante, ou (c) emitir CI/Dockerfiles sem
  `--frozen-lockfile`. **A implementação atual escolhe nenhuma das três** — é um
  bug latente: `create-dontpanic` v0.3.0 gera um projeto cujo CI e cujo
  `Dockerfile.api` quebram no primeiro push.

Recomendação: **enviar o lockfile** (custo: +200 KB gzip) e documentar
`pnpm install --no-frozen-lockfile` como escape se a integridade divergir. Ou
gerar o lockfile no scaffold quando o usuário aceita `pnpm install`.

### 2.5 Armadilha dos dotfiles no `npm pack`

**Confirmado no repo.** Existem exatamente **2** arquivos `.gitignore` fora de
`node_modules`:

| Caminho | Conteúdo | Nota |
| --- | --- | --- |
| `./.gitignore` | 371 B, 22 regras (§ver abaixo) | **essencial** — sem ele o projeto gerado commita `node_modules`, `.next`, `.env` |
| `./.husky/_/.gitignore` | `*` | gerado pelo husky; deve ser excluído junto com `.husky/_/` |

Não existe nenhum `.npmignore` no repo (verificado com `find`). Não existe
nenhum arquivo chamado literalmente `gitignore` ou `npmrc` (dot-less) — logo a
estratégia de renomeação é **injetiva e reversível** sem colisão.

**A estratégia já implementada** (e correta):

- `scripts/build-template.mjs:48` — `DOTFILE_RENAMES = { '.gitignore': 'gitignore', '.npmrc': 'npmrc' }`,
  aplicado **em qualquer nível** da árvore (`copyDir` chama o mapa a cada entrada).
- `src/scaffold.ts:8-11` — `RESTORE_DOTFILES` faz o inverso no scaffold, também
  em qualquer nível.
- Cobertura de teste: `src/scaffold.test.ts` (103 linhas).

**Por que `.npmrc` também:** o npm **sempre** exclui `.npmrc` do tarball
(não é configurável), e o `.npmrc` do repo (`auto-install-peers=true`,
`strict-peer-dependencies=false`) é **funcionalmente necessário** — sem ele o
`pnpm install` do projeto gerado pode falhar em peers (ver o workaround de
`zod/v4/core` em `apps/web/next.config.ts:19-25`, que existe justamente por
isolamento estrito de peers do pnpm).

**Outros dotfiles no template que o npm *não* mangla** (verificado: `npm pack`
inclui dotfiles em geral; só `.gitignore`/`.npmignore`/`.npmrc` e alguns nomes
reservados são especiais). Ainda assim, cada um é um ponto de verificação para o
CI de conformidade:

```
.dockerignore  .editorconfig  .env.example  .node-version
.prettierignore  .prettierrc.json  .changeset/  .claude/  .github/  .husky/  .vscode/
```

> ⚠️ **Armadilha extra não coberta hoje:** o `package.json` do instalador declara
> `"files": ["dist", "template"]` (`packages/create-dontpanic/package.json:9-12`).
> Com `files` explícito, o npm ainda aplica as regras especiais de dotfile
> **dentro** de `template/` — é exatamente por isso que a renomeação é necessária,
> e é por isso que ela tem de ser testada por `npm pack --dry-run` no CI, não só
> por unit test.

Conteúdo do `.gitignore` que o projeto gerado precisa herdar:

```
node_modules/  .pnpm-store/           # deps
dist/  .next/  out/  .turbo/  storybook-static/  *.tsbuildinfo   # builds
coverage/  playwright-report/  test-results/                     # testes
.env  .env.local  .env.*.local                                   # env
*.log  .DS_Store  prisma/*.db                                    # misc
packages/create-dontpanic/template/   # ← REMOVER no projeto gerado
```

A última linha é específica do boilerplate e deve sair. `.prettierignore` tem o
mesmo problema (linha 2: `packages/create-dontpanic/template/`).

### 2.6 Substituições de identidade que o template exige

`490` ocorrências de `dontpanic` em `199` arquivos (excluindo
`node_modules`, `.next`, `dist`, `.git`, `.turbo`, `coverage`, `template`).
Delas, **203 são o escopo de pacote `@dontpanic/`**. O resto se divide assim:

| Categoria | Arquivos / linhas | Ação |
| --- | --- | --- |
| **Escopo npm** `@dontpanic/{api,web,shared,config}` | 203 ocorrências; `package.json` de 4 workspaces + todo import | renomear escopo → `@<proj>/…`; é substituição textual em massa, mas atinge `tsconfig.base.json`, `packages/config/eslint.js`, todo `import`, e os `--filter` em scripts/CI/compose/Dockerfile |
| **`container_name:`** | `docker-compose.yml:4,22,37,71`; `docker-compose.dev.yml:34,46,87,115` | ✅ **já tratado** (`renameContainers`) |
| **Postgres owner / base** | `docker-compose.yml:7,8,9,15`; `docker-compose.dev.yml:60,61,96,97` | ❌ não tratado |
| **Role restrita `dontpanic_app`** | `apps/api/prisma/migrations/20260911105300_app_role/migration.sql:16,18,21,25,26,27,30,31,36,38,40,49`; `apps/api/src/infra/prisma/prisma.service.ts:57` (mensagem de erro) | ❌ não tratado |
| **Bucket MinIO** | `docker-compose.yml:63,64` (`mc mb local/dontpanic`) | ❌ não tratado |
| **e2e: URLs e nome da base** | `apps/api/test/e2e-setup.ts:18,23`; `apps/api/test/global-setup.ts:31,32,33`; `apps/api/test/tenant-isolation.e2e-spec.ts:82` | ❌ não tratado — **o e2e do projeto gerado quebra** se a base/role mudarem |
| **Seed** | `apps/api/prisma/seed.ts:14,15,16,54,57` (`DontPanic42!`, `superadmin@dontpanic.dev`, `admin@dontpanic.dev`, slug `dontpanic`) | ❌ não tratado |
| **Specs unitários com valores literais** | `apps/api/src/infra/{mail,storage,queue,oauth}/*.spec.ts` (`no-reply@dontpanic.dev`, bucket `dontpanic`, `{dontpanic}`, `dev.dontpanic.web`) | ❌ — **quebram se o gerador substituir `dontpanic` globalmente sem cuidado**: são self-contained (o valor esperado está no mesmo arquivo), então substituição textual global funciona; substituição parcial quebra |
| **Nome de download no browser** | `apps/web/src/components/two-factor-setup.tsx:67`; `apps/web/src/components/profile/two-factor-card.tsx:175`; `apps/web/src/components/profile/danger-card.tsx:46` | ❌ (`dontpanic-backup-codes.txt`, `dontpanic-data-export.json`) |
| **Fixtures de teste do web** | `apps/web/src/proxy.test.ts:10`; `apps/web/src/lib/safe-path.test.ts:4,28` | self-contained, mesma nota acima |
| **Docker/CI** | `Dockerfile.api:2`, `Dockerfile.web:2`, `Dockerfile.dev` (comentários); `.github/workflows/docker.yml:42,49` (`dontpanic-api:ci`) | ❌ |
| **Meta/URLs do projeto** | `.github/ISSUE_TEMPLATE/config.yml:4,7` (`github.com/marmottajr/dontpanic`); `SECURITY.md`; `CONTRIBUTING.md`; `README.md`; `CLAUDE.md`; `package.json:2` | ❌ — o projeto gerado herda links para o repo do boilerplate |

**Conjunto mínimo de tokens de substituição** que o gerador deveria expor:

| Token | Default | Alcança |
| --- | --- | --- |
| `projectName` | `my-app` | `package.json.name`, `container_name:` |
| `pkgScope` | `@my-app` | escopo dos 4 workspaces + todos os imports + `--filter` |
| `dbName` | `<projectName>` (snake) | `POSTGRES_DB`, `DATABASE_*_URL`, `<dbName>_e2e` |
| `dbOwner` / `dbOwnerPassword` | `<dbName>` / gerado | `POSTGRES_USER/PASSWORD`, healthcheck, `DATABASE_ADMIN_URL` |
| `dbAppRole` / `dbAppPassword` | `<dbName>_app` / gerado | `migration.sql`, `DATABASE_URL`, e2e, mensagem do `PrismaService` |
| `bucket` | `<projectName>` | `S3_BUCKET`, `S3_PUBLIC_URL`, `mc mb` |
| `queueName` / `queuePrefix` | `<projectName>` / `{<projectName>}` | `QUEUE_NAME`, `QUEUE_PREFIX` |
| `appName` | `My App` | `TOTP_ISSUER`, `NEXT_PUBLIC_APP_NAME`, i18n, downloads |
| `mailDomain` | `example.com` | `MAIL_FROM`, e-mails do seed |
| `portBase` | `4200` | as 9 portas 42xx + strings hardcoded (§1.4-B) |

---

## 3. Toolchain e versões

### 3.1 Engines e gerenciador de pacotes

| Item | Valor | Onde |
| --- | --- | --- |
| `packageManager` | `pnpm@11.7.0` | `package.json:4` |
| `engines.node` | `>=24.9` | `package.json:6` |
| `engines.pnpm` | `>=11` | `package.json:7` |
| `.node-version` | `24` | `.node-version` |
| Node nas imagens Docker | `node:24-slim` | `Dockerfile.api:3`, `Dockerfile.web:3`, `Dockerfile.dev:4` |
| Node no CI | `node-version: 24` + `cache: pnpm` | `ci.yml:20-23` (idem nos outros 3 workflows) |
| pnpm no CI | `pnpm/action-setup@v4` **sem `version:`** → lê `packageManager` | `ci.yml:18` |
| `.npmrc` | `auto-install-peers=true`, `strict-peer-dependencies=false` | `.npmrc` |

> O `engines.node: >=24.9` é **funcionalmente exigido**, não cosmético: o
> `jest.config.js:8-10` documenta que a cadeia ESM-only (`otplib` + `@otplib/*` +
> `@scure/base`) carrega nativamente via `require(esm)` a partir do Node 24, e que
> foi isso que permitiu apagar um transformer ESM→CJS. Em Node < 24.9 a suíte
> unitária da API **não roda**. O gerador deve checar `process.versions.node` e
> abortar com mensagem clara.

### 3.2 Travas deliberadas — verificação contra o repo

| Pacote | CLAUDE.md diz | Realidade verificada | Local exato |
| --- | --- | --- | --- |
| `typescript` | `6.0.3` | ✅ **exato** em 5 lugares | `package.json:36`, `apps/api/package.json` (dev), `apps/web/package.json` (dev), `packages/shared/package.json` (dev), `packages/create-dontpanic/package.json` (dev) — **sempre sem `^`** |
| `prisma` (CLI) | `^7.10.0` | ✅ `"prisma": "^7.10.0"` em devDeps; client `@prisma/client: "^7.10.0"` e `@prisma/adapter-pg: "^7.10.0"` em deps | `apps/api/package.json` |
| `fastify` | override `^5.12.3` | ✅ **duas frentes**: `overrides.fastify: '^5.12.3'` **e** dep direta `fastify: "^5.12.3"` | `pnpm-workspace.yaml:8` (bloco `overrides:` linhas 4-21) + `apps/api/package.json` |
| `@nestjs/throttler` | `^6.5.0` + `imports: []` | ✅ dep `^6.5.0`; `imports: []` explícito com comentário | `apps/api/package.json`; `apps/api/src/app.module.ts:67-72` |
| `node` | `>=24.9` | ✅ | `package.json:6` |
| `esbuild` | `>=0.28.1` | ✅ `overrides.esbuild: '>=0.28.1'` | `pnpm-workspace.yaml:21` |
| `deepmerge-ts` | override | ✅ `>=8.0.0` | `pnpm-workspace.yaml:16` |
| `mysql2` | override | ✅ `>=3.23.1` | `pnpm-workspace.yaml:17` |

**Travas exatas adicionais (não documentadas no CLAUDE.md) que o gerador não pode afrouxar:**

| Pacote | Versão exata | Onde |
| --- | --- | --- |
| `@commitlint/cli`, `@commitlint/config-conventional` | `21.2.2` | `package.json:31-32` |
| `lint-staged` | `17.5.0` | `package.json:34` |
| `zod` (API) | `4.6.1` **exato** (web e shared usam `^4.6.1`) | `apps/api/package.json` |
| `storybook`, `@storybook/addon-a11y`, `@storybook/addon-docs`, `@storybook/nextjs` | `10.6.0` | `apps/web/package.json` |
| `vitest` | `5.0.0` exato no `shared` e no `create-dontpanic`; `^5.0.0` no web | `packages/{shared,create-dontpanic}/package.json` |

### 3.3 ⚠️ Discrepância encontrada: `minimumReleaseAge` NÃO EXISTE

O CLAUDE.md afirma: *“`minimumReleaseAge` no `pnpm-workspace.yaml` evita adotar
releases recém-publicados (supply-chain)”*.

**Verificado:** `pnpm-workspace.yaml` contém apenas
`minimumReleaseAgeExclude:` (linha 36, com 24 entradas), e o `.npmrc` não tem
nenhuma linha `minimum-release-age`. Ou seja, existe a **lista de exceções** mas
não a **política**. `minimumReleaseAgeExclude` sem `minimumReleaseAge` é inerte.

Implicações para o gerador:
1. Não replicar a documentação errada no `CLAUDE.md` do projeto gerado.
2. As 24 entradas de `minimumReleaseAgeExclude` (AWS SDK `3.1068.0`, `eslint@10.5.0`,
   `lucide-react@1.18.0`, `react-hook-form@7.79.0`, e **17 pacotes
   `@tailwindcss/*`+`tailwindcss@4.3.1`**) são versões **antigas** relativas aos
   ranges nos `package.json` (ex.: web pede `tailwindcss: "^4.3.3"`). Se
   `minimumReleaseAge` for algum dia ligado, essa lista já está obsoleta.
3. Se o gerador quiser a proteção de verdade, tem de **adicionar**
   `minimumReleaseAge: <dias>` e limpar a exclude-list.

### 3.4 `allowBuilds` / `onlyBuiltDependencies`

Ambos presentes em `pnpm-workspace.yaml` (blocos `allowBuilds:` linha ~24 e
`onlyBuiltDependencies:` linha 59), com conteúdos **não idênticos**:

| | `allowBuilds` | `onlyBuiltDependencies` |
| --- | --- | --- |
| `esbuild` | `true` | ✅ |
| `@prisma/engines` | `true` | ✅ |
| `prisma` | `true` | ✅ |
| `@prisma/client` | — | ✅ |
| `argon2` | `true` | ✅ |
| `sharp` | `true` | ✅ |
| `@swc/core` | `true` | ✅ |
| `unrs-resolver` | `true` | ✅ |
| `@parcel/watcher` | `true` | — |
| `@scarf/scarf`, `@sentry/cli`, `core-js-pure`, `msgpackr-extract`, `workerd` | `false` | — |

**Não remover** `argon2` e `sharp` desses blocos em nenhuma circunstância: são
addons nativos usados no caminho crítico (hash de senha; processamento de avatar).
Sem o build script aprovado, o `pnpm install` completa e a API **quebra em
runtime** ao carregar o binding. Mesma coisa para `@prisma/engines`.

### 3.5 Risco de travas órfãs ao remover features

Cenários concretos, na ordem de perigo:

| Se o gerador remover… | Dep que fica órfã | O override ainda aponta para… | Veredito |
| --- | --- | --- | --- |
| Storybook | `storybook`, `@storybook/*`, e o `esbuild` transitivo | `overrides.esbuild` continua resolvendo via Vite/tsup | **seguro** — `esbuild` continua vindo por `vite` (web) e `tsup` (shared) |
| Tudo que usa Vite (impossível: `vitest` do web) | — | — | n/a |
| `tsup` do `shared` (build do contrato) | — | — | não removível: é a fronteira de contrato |
| MySQL/SQLite (nunca usados) | — | `overrides.mysql2` e `overrides.deepmerge-ts` apontam para deps que chegam **só** sob o CLI do Prisma | **seguro, mas ruidoso**: se o Prisma CLI parar de trazê-los, o pnpm 11 avisa `unused override` (warning, não erro) |
| `fastify` (impossível: é o adapter do Nest) | — | — | n/a |
| Sentry (`@sentry/node`, `@sentry/nextjs`) | `@sentry/cli` | `allowBuilds['@sentry/cli']: false` fica órfão | **seguro** (entrada `false` órfã é inerte) |

**Regra geral, e a recomendação:** um `override` órfão no pnpm 11 é **warning, não
erro**. Portanto o gerador deve **preservar o bloco `overrides` inteiro, sempre**,
independentemente das features removidas. O custo é um warning; o custo de remover
por engano é um CVE reintroduzido ou a duplicação do `fastify` (que é **erro de
build**, não warning). Mesma política para `allowBuilds`/`onlyBuiltDependencies`.

---

## 4. Scripts e pipeline

### 4.1 Scripts da raiz (`package.json:9-22`)

| Script | Comando | Nota |
| --- | --- | --- |
| `dev` | `turbo run dev` | persistente, `cache: false` |
| `build` | `turbo run build` | |
| `lint` | `turbo run lint` | |
| `typecheck` | `turbo run typecheck` | |
| `test` | `turbo run test` | unit (jest api + vitest web + vitest shared/cli) |
| `test:e2e` | `turbo run test:e2e` | exige Postgres |
| `format` / `format:check` | `prettier --write/--check "**/*.{ts,tsx,md,json,yml,yaml}"` | |
| `audit` | `pnpm audit --audit-level high` | gate do CI |
| `changeset` / `release` | `changeset` / `changeset publish` | |
| `prepare` | `husky` | ⚠️ roda no `pnpm install`; ver §4.6 |

`lint-staged` (`package.json:24-26`): `*.{ts,tsx,mjs,cjs,js,jsx,json,md,yml,yaml,css}` → `prettier --write`.

### 4.2 Scripts por workspace

**`@dontpanic/api`** (`apps/api/package.json:12-24`)

| Script | Comando |
| --- | --- |
| `postinstall` | `prisma generate` — roda em **todo** `pnpm install`; funciona sem DB graças ao placeholder em `prisma.config.ts:22` |
| `build` | `nest build` (builder `tsc`, `deleteOutDir: false` — `nest-cli.json`) → emite `dist/main.js` **e** `dist/worker.js` |
| `dev` | `nest start --watch` |
| `worker` / `worker:dev` | `node dist/worker.js` / `tsx watch src/worker.ts` |
| `start` / `start:prod` | `node dist/main.js` |
| `lint` | `eslint "{src,test}/**/*.ts"` |
| `typecheck` | `tsc --noEmit` |
| `test` / `test:cov` | `NODE_OPTIONS=--experimental-vm-modules jest --coverage` |
| `test:e2e` | `NODE_OPTIONS=--experimental-vm-modules jest --config ./test/jest-e2e.json --runInBand` |
| `prisma:generate` | `prisma generate` |
| `db:migrate` | `dotenv -e ../../.env -- prisma migrate dev` |
| `db:migrate:deploy` | `dotenv -e ../../.env -- prisma migrate deploy` |
| `db:seed` | `dotenv -e ../../.env -- tsx prisma/seed.ts` |
| `db:studio` | `dotenv -e ../../.env -- prisma studio` |

**`@dontpanic/web`** (`apps/web/package.json:6-16`): `dev` (`next dev -p 4200`),
`build` (`next build`), `start` (`next start -p 4200`), `lint` (`eslint .`),
`typecheck`, `test` (`vitest run --coverage`), `test:watch`,
`test:e2e` (`playwright test`), `storybook` (`-p 4208`), `build-storybook`.

**`@dontpanic/shared`**: `build`/`dev` (`tsup`/`tsup --watch`), `lint`, `typecheck`,
`test` (`vitest run --passWithNoTests`). Expõe `.` e `./locale/br` com
dual CJS/ESM + `.d.ts` — **o `dist/` tem de existir antes de qualquer typecheck**.

**`@dontpanic/config`**: sem scripts. Só exporta `./eslint` e `./prettier`.

**`create-dontpanic`**: `build` (tsup), `build:template`, `typecheck`, `lint`,
`test`, `prepublishOnly` (`build:template && build`).

### 4.3 `turbo.json`

```
globalDependencies: [".env", "tsconfig.base.json"]
build     → dependsOn ^build, outputs dist/**, .next/** (menos .next/cache/**), storybook-static/**
dev       → dependsOn ^build, cache:false, persistent:true
lint      → dependsOn ^build
typecheck → dependsOn ^build
test      → dependsOn ^build, outputs coverage/**
test:e2e  → dependsOn ^build, cache:false
```

Consequência: **todas** as tasks dependem do build das deps de workspace, ou seja
`@dontpanic/shared` é sempre buildado antes. E `.env` está em
`globalDependencies` — mudar o `.env` **invalida todo o cache do turbo**.

### 4.4 Ordem exata para subir do zero (TL;DR verificado)

O TL;DR do `CLAUDE.md` está **correto e completo**, com uma ressalva:

```bash
cp .env.example .env                         # OK (mas: segredos de exemplo!)
docker compose up -d                         # postgres, redis, minio, minio-setup, mailpit
pnpm install                                 # dispara postinstall → prisma generate
pnpm --filter @dontpanic/shared build        # redundante (turbo faz), mas inofensivo
pnpm --filter @dontpanic/api db:migrate      # ← cria o schema E a role dontpanic_app
pnpm --filter @dontpanic/api db:seed         # admin@dontpanic.dev / DontPanic42!
pnpm dev                                     # API :4201 · Web :4200
pnpm --filter @dontpanic/api worker:dev      # outro terminal — sem ele, e-mail não sai
```

Ressalvas e precisões:

1. **`db:migrate` é o passo que cria a role restrita.** Não há `init.sql` no
   compose. Ver §7.
2. `db:migrate` usa `prisma migrate dev`, que **exige um shadow database** —
   por isso roda com `DATABASE_ADMIN_URL` (owner). Em CI/produção é
   `db:migrate:deploy`.
3. Ordem `docker compose up -d` **antes** de `db:migrate` é obrigatória;
   `pnpm install` pode vir antes do compose (o `prisma generate` não toca no DB).
4. O `.env` tem de existir **antes** de `pnpm dev`: `apps/web/next.config.ts:12`
   carrega o `.env` do root em tempo de configuração para inlinear os
   `NEXT_PUBLIC_*`. Sem ele, os defaults do web ficam `undefined` e os do api
   caem nos defaults 30xx/9000 (§1.2).
5. **Falta um passo no TL;DR:** o seed cria a **empresa demo com slug `dontpanic`**
   e dois usuários (`superadmin@dontpanic.dev` = "Deep Thought", SUPERADMIN sem
   tenant; `admin@dontpanic.dev`, ADMIN do tenant) + um plano `free`
   (`maxUsers: 5`, `isDefault: true`). O gerador deve renomeá-los.

### 4.5 Como os testes rodam, e o que cada um exige

| Suíte | Comando | Config | Precisa Docker? |
| --- | --- | --- | --- |
| API unit | `pnpm --filter @dontpanic/api test` | `apps/api/jest.config.js` (rootDir `src`, `*.spec.ts`) | **Não** — mocka Prisma/cache/mail/storage (`apps/api/test/prisma-mock.ts`) |
| API e2e | `pnpm --filter @dontpanic/api test:e2e` | `apps/api/test/jest-e2e.json` | **Sim** — Postgres em `localhost:4202` |
| Web unit/component | `pnpm --filter @dontpanic/web test` | `apps/web/vitest.config.mts` (jsdom) | **Não** |
| Web smoke | `pnpm --filter @dontpanic/web test:e2e` | `apps/web/playwright.config.ts` | Não (sobe `next dev`), mas **não roda no CI** |
| shared / cli | `vitest run --passWithNoTests` | — | Não |

**Detalhes do e2e que o gerador tem de reproduzir:**

- `jest-e2e.json`: `globalSetup: global-setup.ts`,
  `setupFiles: [e2e-setup.ts, setup.ts]` (**nessa ordem** — `e2e-setup` põe a URL
  real, `setup` só preenche o que falta), `testTimeout: 60000`,
  `testSequencer: e2e-sequencer.js` (ordem alfabética fixa), `--runInBand`.
- `apps/api/test/e2e-setup.ts:17-23` — **URLs hardcoded**:
  `postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic_e2e` e
  `postgresql://dontpanic:dontpanic@localhost:4202/dontpanic_e2e`.
- `apps/api/test/global-setup.ts:31-33` — **URLs hardcoded** apontando para a base
  **`dontpanic`** (para poder rodar `CREATE DATABASE dontpanic_e2e`).
- `global-setup` faz, em ordem: (1) `CREATE DATABASE dontpanic_e2e` se faltar;
  (2) `prisma migrate deploy` com **`DATABASE_URL` e `DATABASE_ADMIN_URL` ambos**
  apontando para a base e2e (`global-setup.ts:63-68` — o comentário explica que
  sobrescrever só um migra a base de dev por engano); (3) `pg_terminate_backend` +
  `TRUNCATE` de tudo menos `_prisma_migrations`; (4) seed global deliberadamente
  vazio.
- O e2e força drivers sem infra externa: `CACHE_DRIVER=memory`,
  `QUEUE_DRIVER=memory`, `MAIL_DRIVER=console`, `STORAGE_DRIVER=local`
  (`e2e-setup.ts:26-32`). **Só o Postgres é real.**
- `apps/api/test/tenant-isolation.e2e-spec.ts:82` faz asserção sobre
  `rolsuper`/`rolbypassrls` da role literal **`dontpanic_app`**.

### 4.6 Thresholds de cobertura — valores atuais e o risco

**API — `apps/api/jest.config.js:47-54`:**

```
statements: 97   branches: 92   functions: 100   lines: 97
```

Valores alcançados (comentário `jest.config.js:44-46`): **99,2 / 94,8 / 100 / 99,2**.
Margem: stmts +2,2 · branches +2,8 · **functions +0,0**.

`collectCoverageFrom` (`jest.config.js:20-41`) **exclui**: `**/*.module.ts`,
`**/*.spec.ts`, `main.ts`, `load-env.ts`, `instrument.ts`, `**/*.dto.ts`,
`**/*.controller.ts`, `**/current-user.decorator.ts`. `PrismaService` está
**deliberadamente incluído**.

**Web — `apps/web/vitest.config.mts:47-52`:**

```
statements: 99   branches: 88   functions: 95   lines: 99
```

Alcançados (comentário `:44-46`): **99,5 / 97 / 100 / 99,7**. Margem:
stmts +0,5 · branches +9 · funcs +5 · **lines +0,7**.

O `coverage.include` do web é uma **allowlist de 12 globs** (`:23-36`) — UI kit,
`records/`, `dashboard/`, `charts/`, `tenant/`, `legal/`, `platform/`,
`language-switcher`, `session-ended-dialog`, `lib/**`, `i18n/locales.ts`,
`app/(auth)/login/**`. `exclude`: `*.stories.*`, `*.{test,spec}.*`, `ui/sonner.tsx`.

**Risco concreto para o gerador (alto):**

1. **`functions: 100` na API não tem folga nenhuma.** Se o gerador remover uma
   feature e deixar **uma única função** não coberta — por exemplo remover o spec
   de OAuth mas manter um helper, ou remover o módulo de convites e deixar um
   utilitário compartilhado que só o spec de convites exercitava — o gate cai
   abaixo de 100 e `pnpm test` **falha**. Não é hipotético: os specs de OAuth e
   convites juntos são ~55 KB de teste.
2. **`lines/statements: 99` no web tem 0,5–0,7 pt de folga.** Remover
   `src/components/platform/**` (um dos globs) sem remover o glob do
   `coverage.include` faz o v8 contar 0 arquivos naquele padrão — inofensivo. O
   perigoso é o inverso: remover o **spec** e manter o **componente** no glob.
3. `collectCoverageFrom` e `coverage.include` são **listas de caminhos literais**.
   Toda remoção de feature exige editar as duas listas em sincronia com o que
   sobrou.

**Estratégias possíveis (para decidir noutro doc):**
(a) o gerador recalcula os thresholds rodando a suíte e fixando
`achieved − margem`; (b) baixa `functions` de 100 para 97 quando qualquer feature
sai; (c) o CI de conformidade **roda `pnpm test` no projeto gerado** para cada
combinação de features — é a única verificação que realmente prova o gate.

---

## 5. Docker

### 5.1 `docker-compose.yml` — infra (modo padrão)

| Serviço | Imagem | `container_name` | Portas host:container | Volume | Healthcheck |
| --- | --- | --- | --- | --- | --- |
| `postgres` | `postgres:17-alpine` | `dontpanic-postgres` | `${POSTGRES_PORT:-4202}:5432` | `postgres_data:/var/lib/postgresql/data` | `pg_isready -U dontpanic` · 5s/5s/5 |
| `redis` | `redis:7-alpine` | `dontpanic-redis` | `${REDIS_PORT:-4203}:6379` | `redis_data:/data` | `redis-cli ping` · 5s/3s/5 |
| `minio` | `minio/minio:latest` | `dontpanic-minio` | `${MINIO_PORT:-4204}:9000`, `${MINIO_CONSOLE_PORT:-4205}:9001` | `minio_data:/data` | `mc ready local` · 5s/5s/5 |
| `minio-setup` | `minio/mc:latest` | — | — | — | — (job one-shot; `mc mb --ignore-existing local/dontpanic` + `mc anonymous set download`) |
| `mailpit` | `axllent/mailpit:latest` | `dontpanic-mailpit` | `${MAILPIT_SMTP_PORT:-4206}:1025`, `${MAILPIT_UI_PORT:-4207}:8025` | — | — |

`postgres` environment: `POSTGRES_USER/PASSWORD/DB = dontpanic` (**literais, não
interpolados**). `minio`: `MINIO_ROOT_USER/PASSWORD = minioadmin` (literais).
`mailpit`: `MP_MAX_MESSAGES: 500`, `MP_SMTP_AUTH_ACCEPT_ANY: 1`,
`MP_SMTP_AUTH_ALLOW_INSECURE: 1`.

Volumes nomeados: `postgres_data`, `redis_data`, `minio_data`.

> ⚠️ **`minio` e `mailpit` não têm `restart: unless-stopped`?** Têm — todos os
> quatro serviços persistentes têm. Só `minio-setup` não (é one-shot).
> ⚠️ **`mailpit` não tem healthcheck** — nada depende dele via `condition`.

### 5.2 `docker-compose.dev.yml` — apps em container

Override que acrescenta 4 serviços. Âncora `x-app-volumes` (`:17-27`):
bind-mount `./:/app` + 5 volumes nomeados mascarando cada `node_modules`
(`nm_root`, `nm_api`, `nm_web`, `nm_shared`, `nm_config`) + `api_dist:/app/apps/api/dist`
e `web_next:/app/apps/web/.next` (para o build do container não escrever no host).

| Serviço | `container_name` | Comando | `depends_on` |
| --- | --- | --- | --- |
| `deps` | `dontpanic-deps` | `pnpm install --prefer-offline && pnpm --filter @dontpanic/shared build` | — (`restart: 'no'`) |
| `api` | `dontpanic-api-dev` | `pnpm exec prisma migrate deploy && pnpm run dev` | `postgres` healthy, `redis` healthy, `deps` completed |
| `worker` | `dontpanic-worker-dev` | `pnpm run worker:dev` | `redis` healthy, `api` started |
| `web` | `dontpanic-web-dev` | `pnpm run dev` | `deps` completed, `api` started |

Portas: `api` → `${API_PORT:-4201}:4201`; `web` → `${WEB_PORT:-4200}:4200`.
`env_file: .env` + `environment:` que **sobrescreve** (compose ganha do `.env`,
e `@nestjs/config` dá precedência a `process.env`): hosts passam a **nome de
serviço** (`postgres:5432`, `redis:6379`, `minio:9000`, `mailpit:1025`),
`API_INTERNAL_URL: http://api:4201`, `TRUST_PROXY: uniquelocal`,
`CHOKIDAR_USEPOLLING`/`WATCHPACK_POLLING: 'true'`.

Nota de design registrada em `:89-90`: **só o serviço `api` roda migration**; o
`worker` deliberadamente não.

### 5.3 Dockerfiles de produção

| Arquivo | Base | Estágios | Notas |
| --- | --- | --- | --- |
| `Dockerfile.api` | `node:24-slim` | `base` → `build` → `runner` | `base` instala `openssl ca-certificates` + `corepack enable`; `build` faz `pnpm install --frozen-lockfile`, `shared build`, `prisma generate`, `api build`; `runner` copia `/app` inteiro (para preservar client Prisma + engines nativos); `EXPOSE 4201`; CMD roda `prisma migrate deploy` **e depois** `node dist/main.js` |
| `Dockerfile.web` | `node:24-slim` | `base` → `build` → `runner` | sem openssl; `EXPOSE 4200`; `CMD ["pnpm","start"]` |
| `Dockerfile.dev` | `node:24-slim` | único | **não copia código** (vem por bind-mount) |

`.dockerignore`: `**/node_modules`, `**/dist`, `**/.next`, `**/.turbo`,
`**/coverage`, `**/storybook-static`, `**/*.tsbuildinfo`, `.git`, `.github`,
`**/.env`, `**/.env.*` com `!**/.env.example`, `README.md`.

O worker de produção sai da **mesma imagem** (`Dockerfile.api:24-30`): segundo
container sobrescrevendo `command: ["node","dist/worker.js"]`.

### 5.4 Compose enxuto — o que sai quando a feature sai

Verificado nas factories (`apps/api/src/infra/*/*.module.ts`):

| Serviço | Pode sair quando… | Evidência |
| --- | --- | --- |
| `redis` | `CACHE_DRIVER=memory` **E** `QUEUE_DRIVER=memory` | `cache.module.ts:15-17` (memory ⇒ `MemoryCacheAdapter`, não toca `REDIS_URL`); `queue.module.ts:17-20` (memory ⇒ `MemoryQueueAdapter`) |
| | ⚠️ **as duas condições juntas** — são drivers independentes que usam o **mesmo** `REDIS_URL`. Um só em `memory` não dispensa o Redis. O throttler também usa o cache (`CacheThrottlerStorage`, `app.module.ts:10,72`), logo `CACHE_DRIVER=memory` degrada o rate limit para por-instância | |
| `minio` + `minio-setup` | `STORAGE_DRIVER=local` | `storage.module.ts:15-20`; requer `LOCAL_STORAGE_DIR` e `LOCAL_STORAGE_PUBLIC_URL`, e o serving estático via `@fastify/static` |
| `mailpit` | `MAIL_DRIVER=console` (ou `ses`) | `mail.module.ts:17-33` |
| `postgres` | **nunca** | Prisma + RLS são o núcleo; `DB_PROVIDER` é decorativo (§7.5) |
| `worker` (dev) | `QUEUE_DRIVER=memory` | `queue.module.ts:47` (`if driver !== 'memory'` para registrar) |

Também sai do compose, por arrasto: os pares de porta da §1.4-B
(`REDIS_PORT`/`REDIS_URL`; `MINIO_PORT`+`MINIO_CONSOLE_PORT`/`S3_*`;
`MAILPIT_*_PORT`/`MAIL_*`), os volumes (`redis_data`, `minio_data`), e as
cláusulas `depends_on: redis: condition: service_healthy` em
`docker-compose.dev.yml:78-79,106-107`.

> ⚠️ Os health indicators do `/health` (`apps/api/src/health/cache.health.ts`,
> `queue.health.ts`) são registrados sempre. Com drivers `memory` eles respondem
> saudável contra os adapters in-memory — não quebram, mas o `/health` do projeto
> gerado passa a dizer menos do que parece.

---

## 6. CI existente

### 6.1 `.github/workflows/ci.yml` — o pipeline que o projeto gerado precisa

`on: push[main]`, `pull_request`. `concurrency: ci-${{ github.ref }}`, cancel-in-progress.
Um job `build-test` em `ubuntu-latest`, **sem `services:`** (nenhum container de
Postgres/Redis). Passos, **nesta ordem**:

1. `actions/checkout@v7`
2. `pnpm/action-setup@v4` (sem `version:` → usa `packageManager`)
3. `actions/setup-node@v7` com `node-version: 24`, `cache: pnpm`
4. `pnpm install --frozen-lockfile`
5. `pnpm --filter @dontpanic/shared build` ("Build shared contracts")
6. `pnpm lint`
7. `pnpm typecheck`
8. `pnpm test` (unit, com cobertura) — comentário `:36-38` registra que **e2e e
   Playwright rodam só localmente, de propósito**
9. `pnpm audit --audit-level high`
10. `pnpm build`

### 6.2 Outros workflows

| Workflow | Trigger | O que faz | Vai para o projeto gerado? |
| --- | --- | --- | --- |
| `codeql.yml` | push/PR em `main` + cron semanal (seg 06:00 UTC) | `github/codeql-action` v3, `javascript-typescript`, queries `security-and-quality` | **sim** (genérico) |
| `docker.yml` | tags `v*` + PR tocando `Dockerfile.*`/`apps/**`/`packages/**`/lockfile/o próprio workflow | matriz api/web: build com buildx (cache GHA por scope), **Trivy** CRITICAL/HIGH `ignore-unfixed`, upload SARIF; em tag: login GHCR + push com `sbom: true`, `provenance: true` | **sim**, trocando `dontpanic-${{matrix.app}}:ci` pelo nome do projeto |
| `release.yml` | push em `main` | `changesets/action@v2` com `version-script:` (o rename de input v1→v2 está comentado em `:39-41`) — **não publica** | opcional |
| `publish-create-dontpanic.yml` | tags `v*` | valida tag == versão do pacote, skip se já no npm, lint/typecheck/test, `pnpm publish` com `NPM_TOKEN` | **não** — é o instalador |

`.github/dependabot.yml`: npm (weekly, 10 PRs, grupos dev/prod) + github-actions
(weekly). **Os `ignore:` são parte das travas**: `typescript` major, `prisma`
major, `@prisma/*` major — com o incidente registrado em comentário (PR #32,
`rollup-plugin-dts` → `useCaseSensitiveFileNames` undefined). O projeto gerado
tem de herdar esses `ignore` **ou** o Dependabot reverte as travas semanalmente.

### 6.3 O que o CI de conformidade do **gerador** precisa provar

Derivado de tudo acima:

1. `npm pack --dry-run` do instalador e **verificação de que `template/gitignore`
   e `template/npmrc` estão no tarball** (é o único jeito de pegar a regressão do
   §2.5 — unit test não pega).
2. Gerar um projeto com o **preset completo** (todas as features) e rodar, na
   ordem: `pnpm install` → `shared build` → `lint` → `typecheck` → `test` →
   `build`. Ou seja o `ci.yml` do gerado, em cima do gerado.
3. Gerar um projeto com o **preset mínimo** (captcha `none`, oauth vazio,
   `CACHE_DRIVER=memory`, `QUEUE_DRIVER=memory`, `MAIL_DRIVER=console`,
   `STORAGE_DRIVER=local`) e rodar o mesmo. **É aqui que os thresholds de
   cobertura vão quebrar** (§4.6).
4. Provar que o `.env` gerado **boota**: subir a API com ele e checar que
   `validateEnv` não lança (as 10 condições da §1.5).
5. Serviço de Postgres no job para rodar `db:migrate` + `db:seed` + `test:e2e` do
   projeto gerado — é o único caminho que prova que a role restrita renomeada
   funciona (§7.4).
6. Grep de conformidade: `grep -ri dontpanic <projeto-gerado>` deve voltar vazio
   (ou só em uma allowlist explícita, tipo atribuição de licença).
7. `docker compose config` no compose gerado (valida a sintaxe após a poda de
   serviços) e, idealmente, `docker build -f Dockerfile.api .`.

---

## 7. Setup de banco para o projeto gerado

### 7.1 Como as duas roles nascem hoje

**Não há init script no compose.** O `docker-compose.yml:6-9` cria **apenas** o
owner, via variáveis padrão da imagem `postgres:17-alpine`:

```yaml
POSTGRES_USER: dontpanic
POSTGRES_PASSWORD: dontpanic
POSTGRES_DB: dontpanic
```

A role restrita nasce numa **migration**:
`apps/api/prisma/migrations/20260911105300_app_role/migration.sql`.

```sql
-- linhas 14-23
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app') THEN
    CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
```

Depois (`:25-40`): `GRANT USAGE` em `public` e `app`; `GRANT EXECUTE` em todas as
funções de `app`; `GRANT SELECT,INSERT,UPDATE,DELETE` em todas as tabelas de
`public`; `GRANT USAGE,SELECT` em todas as sequences; e **`ALTER DEFAULT
PRIVILEGES`** nos três casos, para que tabela/sequence/função criada por migration
futura já herde. Por último (`:45-51`), `REVOKE ALL ON public._prisma_migrations`
— condicional, porque no shadow database do `migrate dev` a tabela ainda não existe.

**Sequência de dependências:** a migration roda com a conexão do owner
(`prisma.config.ts:19-22` prefere `DATABASE_ADMIN_URL`), e é ela que cria a role
que `DATABASE_URL` usa. Logo, num banco novo, **`db:migrate` tem de rodar antes
da primeira tentativa de a API conectar** — exatamente o que o comentário do
`.env.example:46-48` diz.

Migrations na ordem (`apps/api/prisma/migrations/`):
`20260613074545_init` → `20260613122947_two_factor_remind_at` →
`20260911105130_tenancy` → `20260911105200_row_level_security` →
`20260911105300_app_role` → `20260912120000_invitations_and_oauth`.
`migration_lock.toml`: `provider = "postgresql"`.

### 7.2 O que o projeto gerado precisa no primeiro `docker compose up`

Nada de novo **se** o gerador substituir consistentemente. Duas opções:

**Opção A — substituição textual (mínima mudança, recomendada):**

1. `docker-compose.yml`: `POSTGRES_USER/PASSWORD/DB` → `<dbOwner>`/`<senha
   gerada>`/`<dbName>`; healthcheck `pg_isready -U <dbOwner>`.
2. `docker-compose.dev.yml:60,61,96,97`: reescrever as 4 URLs.
3. `migration.sql`: 12 ocorrências de `dontpanic_app` → `<dbAppRole>`, e a senha
   literal `'dontpanic_app'` → senha gerada. **É legítimo editar esta migration**
   porque o projeto gerado nunca aplicou nenhuma migration — o histórico começa
   vazio. (Editar migration num projeto **existente** seria drift.)
4. `.env` / `.env.example`: `DATABASE_URL` e `DATABASE_ADMIN_URL`.
5. `apps/api/test/e2e-setup.ts:18,23` e `global-setup.ts:31,32,33`: URLs e
   `<dbName>_e2e`.
6. `apps/api/test/tenant-isolation.e2e-spec.ts:82`: nome da role na asserção.
7. `apps/api/src/infra/prisma/prisma.service.ts:57`: só a mensagem de erro.
8. `apps/api/prisma/seed.ts:14-16,54,57`: senha, e-mails, slug.

**Opção B — parametrizar (mais invasivo, mais robusto):** trocar as URLs
hardcoded do e2e por leitura de env (`process.env.E2E_DATABASE_URL ?? default`) e
a migration por um placeholder resolvido no scaffold. Custa divergir do upstream.

Em nenhuma das opções é preciso adicionar um `init.sql` ao compose: o modelo
"owner pela imagem, role de app pela migration" funciona igual com nomes novos.
**Mas** se o gerador quiser tornar isso mais evidente, um
`docker-entrypoint-initdb.d/` com a role seria uma alternativa — ao custo de a
role deixar de existir em deploys onde o Postgres é gerenciado (RDS/Neon), que é
provavelmente por que o autor escolheu a migration.

### 7.3 `assertNotSuperuser` — o que exatamente checa

`apps/api/src/infra/prisma/prisma.service.ts:47-64`, chamado de `onModuleInit`
(`:30`).

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
```

Lógica exata:

1. `if (!row || (!row.rolsuper && !row.rolbypassrls)) return;` — **passa** se a
   query não devolveu linha (role não visível em `pg_roles`) **ou** se ambos os
   flags são falsos.
2. Monta a mensagem nomeando `rolname`, `rolsuper`, `rolbypassrls` e dizendo para
   apontar `DATABASE_URL` para `dontpanic_app` e deixar o owner em
   `DATABASE_ADMIN_URL`.
3. `if (NODE_ENV === 'production') throw new Error(message)` — **recusa subir**.
4. Caso contrário: `this.logger.error(message)` e **continua**.

Ou seja: **em dev e test é só um erro no log**, deliberadamente, para não travar
quem ainda não rodou a migration da role (comentário `:44-45`). Só produção
bloqueia. Não há checagem de `FORCE ROW LEVEL SECURITY` nem das políticas —
só do privilégio da role conectada.

Consequência para o CI de conformidade: rodar o projeto gerado com
`NODE_ENV=production` e `DATABASE_URL` apontando para o owner **tem de falhar o
boot**. É um teste de 5 linhas que prova que a substituição de role não
desconectou a proteção.

### 7.4 Checklist de banco para o projeto gerado

| # | Item | Verificação |
| --- | --- | --- |
| 1 | Owner criado pelo compose com o nome novo | `docker compose up -d && pg_isready -U <dbOwner>` |
| 2 | `db:migrate` cria a role restrita com o nome novo | `SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname='<dbAppRole>'` → `f,f` |
| 3 | `DATABASE_URL` usa a role restrita, `DATABASE_ADMIN_URL` o owner | grep no `.env` gerado |
| 4 | API sobe e **não** loga o erro do `assertNotSuperuser` | log do boot |
| 5 | Com `NODE_ENV=production` + owner em `DATABASE_URL`, o boot **falha** | teste negativo |
| 6 | `db:seed` cria plano + superadmin + tenant demo com os nomes novos | `SELECT slug FROM tenants` |
| 7 | `test:e2e` passa: `<dbName>_e2e` criada, migrada, isolamento provado sob a role restrita | `pnpm --filter <scope>/api test:e2e` |
| 8 | `SELECT app.apply_tenant_rls();` no fim de cada migration nova | ver `20260911105200_row_level_security` |

### 7.5 ⚠️ `DB_PROVIDER` é uma promessa que o código não cumpre

O `.env.example:25` e o `envSchema` (`env.ts:49`) oferecem
`postgresql | mysql | sqlite`. Na prática, na v atual:

- `migration_lock.toml`: `provider = "postgresql"` — mudar exige recriar todas as
  migrations.
- Dependência direta é `@prisma/adapter-pg` + `pg` (`apps/api/package.json`), não
  há adapter alternativo instalado.
- As migrations `_row_level_security` e `_app_role` são **puro PL/pgSQL**:
  `DO $$`, `pg_roles`, `set_config`, `current_setting`, `ALTER DEFAULT PRIVILEGES`,
  schema `app`. Nada disso existe em MySQL ou SQLite.
- `PrismaService.withScope` (`:80-92`) emite `set_config('app.current_tenant_id', …, true)`
  — específico do Postgres.
- `assertNotSuperuser` consulta `pg_roles`.

**O multi-tenancy do DontPanic é Postgres-only.** O gerador **não deve** oferecer
`DB_PROVIDER` como escolha no wizard; deve emitir `DB_PROVIDER=postgresql` fixo e,
se quiser, documentar que o valor existe mas não é suportado.

---

## 8. Armadilhas — lista consolidada, por gravidade

| # | Armadilha | Gravidade | Onde |
| --- | --- | --- | --- |
| 1 | `.gitignore` / `.npmrc` manglados pelo npm dentro do template | **crítica** (mas **já resolvida**) | `scripts/build-template.mjs:48` ↔ `src/scaffold.ts:8-11` |
| 2 | Template sem lockfile + 4 workflows e 2 Dockerfiles com `--frozen-lockfile` | **crítica, aberta** | `build-template.mjs:44`; `ci.yml:25`; `Dockerfile.api:12`; `Dockerfile.web:9` |
| 3 | `coverageThreshold.functions: 100` na API sem folga; remover feature quebra `pnpm test` | **crítica** | `apps/api/jest.config.js:50` |
| 4 | Defaults do `envSchema` divergem do `.env.example` em 8 chaves (30xx/9000/1025 vs 42xx) → `.env` enxuto quebra em runtime, não no boot | **alta** | `env.ts:12,22,37,38,53,60,66,70` |
| 5 | e2e com URLs, portas (`4202`), base (`dontpanic_e2e`) e nome de role hardcoded | **alta** | `test/e2e-setup.ts:18,23`; `test/global-setup.ts:31-33`; `test/tenant-isolation.e2e-spec.ts:82` |
| 6 | Role restrita nasce numa migration, não no compose — ordem `up → migrate → boot` é obrigatória | **alta** | `migrations/20260911105300_app_role/migration.sql` |
| 7 | Porta do web hardcoded (`next dev -p 4200`) apesar de existir `WEB_PORT` | média | `apps/web/package.json:6,8` |
| 8 | `QUEUE_PREFIX={dontpanic}` não renomeado ⇒ dois projetos gerados dividem namespace no Redis | média | `.env.example:119` |
| 9 | `minimumReleaseAge` documentado no CLAUDE.md e **ausente** do `pnpm-workspace.yaml` | média | `pnpm-workspace.yaml:36` |
| 10 | Remover `argon2`/`sharp`/`@prisma/engines` de `allowBuilds` → install OK, runtime quebra | média | `pnpm-workspace.yaml` |
| 11 | `.claude/settings.local.json` e `.husky/_/` viajam no template | média | §2.2 |
| 12 | `.gitignore` e `.prettierignore` do gerado ainda ignoram `packages/create-dontpanic/template/` | baixa | `.gitignore:29`, `.prettierignore:2` |
| 13 | `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` lida pelo web e ausente do `.env.example` | baixa | `instrumentation-client.ts:9` |
| 14 | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_DEFAULT_LOCALE`, `OTEL_EXPORTER_OTLP_ENDPOINT` são env mortas | baixa | §1.3 |
| 15 | `DB_PROVIDER` oferece mysql/sqlite que o código não suporta | baixa (mas enganosa) | §7.5 |
| 16 | `prepare: husky` roda no `pnpm install`; se o usuário recusar `git init` e instalar depois, o husky não tem repo | baixa | `package.json:21`; ordem em `src/index.ts:142-157` (git antes de install — **correto hoje**) |
