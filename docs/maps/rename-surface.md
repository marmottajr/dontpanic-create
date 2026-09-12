# Mapa de rename — superfície do nome "DontPanic"

Documento-especificação para o motor de rename do gerador. Alvo analisado:
`/Users/junior/projetos/dontpanic` no commit `4b32926` (branch `main`, working tree limpo).

Todos os caminhos são **relativos à raiz do dontpanic**. Todos os números de linha foram
verificados no commit acima.

---

## 0. Sumário executivo e contradições às premissas

### 0.1 Contradições que mudam o projeto do gerador

| # | Premissa do briefing | O que o repo mostra |
| - | -------------------- | ------------------- |
| 1 | "viabilizar um gerador de projetos que vai clonar esse repo e renomear tudo" | **Já existe** um gerador publicado no npm: `packages/create-dontpanic`. Ele **NÃO renomeia quase nada** — ver §0.2. O novo motor de rename ou substitui esse pacote, ou é acoplado a ele. Ignorar sua existência produz dois geradores concorrentes e um workflow de publicação (`.github/workflows/publish-create-dontpanic.yml`) que continua publicando o antigo. |
| 2 | "531 matches em 198 arquivos" | Sobre os arquivos **rastreados pelo git**: **199 arquivos**, **490 ocorrências** de `dontpanic` (case-insensitive, substring) e **504 linhas** casando `dontpanic|don.t panic`. Os 531 do briefing são a **união de ocorrências** (`490` de `dontpanic` + `46` de `Don't Panic`, menos ~5 linhas que têm as duas). Reconciliado: as contagens são compatíveis, só foram medidas diferente. |
| 3 | "`pnpm-workspace.yaml`, `turbo.json`" | **Zero ocorrências em ambos.** Nenhuma ação de rename. Não invente edição aí. |
| 4 | "`tsconfig*.json` — paths/aliases" | **Não existe path alias com o nome do projeto.** A única ocorrência é `tsconfig.base.json:3` → `"display": "DontPanic base"` (cosmético). O único alias do monorepo é `apps/web/tsconfig.json:16-18` → `"@/*": ["./src/*"]`, que é **neutro** e não muda. |
| 5 | "jest config (moduleNameMapper) na api, vitest config no web" | **Nenhum dos dois tem `moduleNameMapper`, alias, nem ocorrência do nome.** `apps/api/jest.config.js` e `apps/api/test/jest-e2e.json` resolvem `@dontpanic/shared` pelo symlink que o pnpm cria em `node_modules/` — não por config. `apps/web/vitest.config.mts` usa `vite-tsconfig-paths`, que lê o alias `@/*`. **Consequência crítica:** renomear o escopo não é uma edição de config, é uma mudança que **exige `pnpm install` novo** para recriar os symlinks (ver §4). |
| 6 | "SCREAMING_CASE em env vars, se houver" | **Não há.** `DONTPANIC` = 0 matches. Todos os **nomes** de variáveis de ambiente são neutros; só **valores** carregam o nome. |
| 7 | variantes `dont-panic`, `dont_panic`, `DONT_PANIC`, `Dontpanic` | **Todas com 0 matches.** Não precisam de regra. |
| 8 | (não estava no briefing) | Existe uma variante **com apóstrofo tipográfico**: `Don’t Panic` (U+2019), 7 ocorrências, **byte-distinta** de `Don't Panic` (46). Um `sed` que só trata o apóstrofo reto deixa 7 para trás. |

### 0.2 O que o gerador atual (`create-dontpanic`) faz e não faz

`packages/create-dontpanic/src/index.ts` + `src/scaffold.ts`, 235 linhas no total:

| Transforma | Onde |
| ---------- | ---- |
| `package.json` raiz: `name` ← nome do projeto, `version` ← `0.1.0` | `src/index.ts:105-109` |
| `container_name: dontpanic-*` → `container_name: <projeto>-*` nos dois compose | `src/index.ts:125-139` + `src/scaffold.ts:33-35` |
| Gera `.env` a partir de `.env.example` com segredos novos (`JWT_*`, `CSRF_SECRET`) e `TWO_FACTOR_REQUIRED` | `src/scaffold.ts:44-52` |
| Restaura dotfiles que o npm mutila (`gitignore`→`.gitignore`, `npmrc`→`.npmrc`) | `src/scaffold.ts:8-22` |

**Não transforma:** o escopo `@dontpanic/*` (203 ocorrências), o nome dos pacotes de workspace,
a role SQL `dontpanic_app`, o banco `dontpanic`/`dontpanic_e2e`, `POSTGRES_USER/PASSWORD/DB`,
`S3_BUCKET`, `QUEUE_NAME`/`QUEUE_PREFIX`, `TOTP_ISSUER`, `MAIL_FROM`, os e-mails do seed, o slug
do tenant do seed, nomes de imagem Docker, títulos Swagger/Next, nada de branding.
`src/scaffold.test.ts:52-63` inclusive **testa explicitamente** que as outras ocorrências de
`dontpanic` no compose (`POSTGRES_USER`, `POSTGRES_DB`) **não** são tocadas.

Isto é uma decisão de design do pacote atual, não um bug: ele entrega "o DontPanic com outro nome
de diretório". O novo motor tem escopo muito maior.

### 0.3 `packages/create-dontpanic/template/` — armadilha de contagem

Esse diretório é um **artefato gerado, gitignorado** (`.gitignore:28-29`,
`.prettierignore:1-2`, `.vscode/settings.json:16`): uma **cópia integral do repositório**
produzida por `packages/create-dontpanic/scripts/build-template.mjs` na hora de publicar.
No working tree atual ele existe e contém **363 ocorrências adicionais** de `dontpanic`.

- **Nunca** inclua `packages/create-dontpanic/template/**` na varredura de rename: renomear ali
  é inútil (é regenerado por `build-template.mjs:68-69`) e explode as contagens.
- O `grep` da sessão usa ugrep com `--ignore-files` (respeita `.gitignore`), por isso o dir não
  aparece nas contagens deste documento. Um `grep -r` de GNU/BSD **vai** varrê-lo. O teste de
  conformidade (§5) precisa excluí-lo explicitamente.

---

## 1. Classificação de toda ocorrência por tipo de transformação

### 1.1 Modelo de input mínimo

Do usuário o gerador precisa de **duas** entradas independentes (e, opcionalmente, uma terceira):

| Input | Exemplo | Usado para |
| ----- | ------- | ---------- |
| `slug` | `acme` | identificador lowercase: escopo npm, nome de pacote, banco, role SQL, container, bucket, fila, subpath de URL, nome de arquivo de download |
| `displayName` | `Acme Corp` | texto humano: títulos, e-mails, `TOTP_ISSUER`, `aria-label`, descrições, docs |
| `domain` (opcional) | `acme.dev` | e-mails de exemplo (`no-reply@`, seed), origens de teste |

Formas **derivadas** de `slug`/`displayName`:

| Forma derivada | Derivação | Exemplo |
| -------------- | --------- | ------- |
| `slug` | input, sanitizado (§6) | `acme` |
| `sqlIdent` | `slug` com `-` → `_` (identificador Postgres) | `acme` / `acme_corp` |
| `pascal` | `displayName` sem espaços/apóstrofos, capitalizado | `AcmeCorp` |
| `human` | `displayName` literal | `Acme Corp` |
| `domain` | input ou `<slug>.dev` | `acme.dev` |
| `githubRepo` | opcional; sem substituto, deve ser **removido/parametrizado** | — |

**Não é necessária nenhuma forma SCREAMING_CASE nem kebab-case-do-nome** (0 matches, §0.1).

### 1.2 Classes de transformação, com contagens e exemplos reais

Contagens sobre arquivos rastreados pelo git, `packages/create-dontpanic/template/` excluído.

| # | Classe | Token | Ocorr. | Forma alvo | Exemplo real (arquivo:linha) |
| - | ------ | ----- | -----: | ---------- | ---------------------------- |
| C1 | Escopo pnpm / import de workspace | `@dontpanic/shared` | 147 | `@<slug>/shared` | `packages/shared/src/index.ts:2`; `apps/api/package.json:31`; `.github/workflows/ci.yml:28` |
| C2 | idem | `@dontpanic/api` | 32 | `@<slug>/api` | `apps/api/package.json:2`; `CLAUDE.md:19` |
| C3 | idem | `@dontpanic/config` | 10 | `@<slug>/config` | `packages/config/package.json:2`; `apps/api/eslint.config.mjs:1` |
| C4 | idem | `@dontpanic/web` | 8 | `@<slug>/web` | `apps/web/package.json:2`; `Dockerfile.web:11` |
| C5 | Nome do pacote gerador | `create-dontpanic` | 43 | **decisão de produto**, não rename (§3.5) | `packages/create-dontpanic/package.json:2`; `.github/workflows/publish-create-dontpanic.yml` (14 linhas) |
| C6 | Identificador SQL — role | `dontpanic_app` | 29 | `<sqlIdent>_app` | `apps/api/prisma/migrations/20260911105300_app_role/migration.sql:16,18×2,21,25,26,27,30,31,36,38,40,49` |
| C7 | Identificador SQL — banco de teste | `dontpanic_e2e` | 11 | `<sqlIdent>_e2e` | `apps/api/test/global-setup.ts:32`; `apps/api/test/e2e-setup.ts:18,23` |
| C8 | Identificador SQL — banco/usuário/senha de dev | `dontpanic` (bare, em DSN e compose) | ~20 | `<sqlIdent>` | `docker-compose.yml:7,8,9,15`; `.env.example:49,50` |
| C9 | Domínio / e-mail | `dontpanic.dev` | 26 | `<domain>` | `.env.example:87`; `apps/api/prisma/seed.ts:15,16`; `apps/web/src/lib/safe-path.test.ts:4` |
| C10 | Prefixo de container/imagem Docker | `dontpanic-<algo>` | 17 | `<slug>-<algo>` | `docker-compose.yml:4,22,37,71`; `docker-compose.dev.yml:34,46,87,115`; `Dockerfile.api:2`; `.github/workflows/docker.yml:42,49` |
| C11 | PascalCase (texto de produto) | `DontPanic` | 81 | `<pascal>` ou `<human>` | `.env.example:76,269`; `apps/api/src/main.ts:106`; `apps/web/src/app/layout.tsx:17` |
| C12 | Nome humano com apóstrofo (branding) | `Don't Panic` | 46 | **remover/substituir separadamente** (§3.1) | `apps/web/messages/en-US.json:5`; `apps/api/src/app.service.ts:8` |
| C13 | idem, apóstrofo tipográfico U+2019 | `Don’t Panic` | 7 | idem | `apps/api/src/common/marvin.ts:15`; `apps/api/src/common/marvin.spec.ts` (3) |
| C14 | Senha do seed | `DontPanic42!` | 5 | **rotacionar**, não renomear (§3.2) | `apps/api/prisma/seed.ts:14`; `README.md:103,397`; `PENDENCIAS.template.md:37` |
| C15 | URL do repositório upstream | `marmottajr/dontpanic` | 7 | **remover/parametrizar** (§3.4) | `.github/ISSUE_TEMPLATE/config.yml:4,7`; `README.md:321,619` |
| C16 | Apple Services ID de exemplo | `dev.dontpanic.web` | 4 | `dev.<slug>.web` (é só doc/fixture) | `.env.example:207`; `apps/api/src/config/env.ts:148`; `apps/api/src/infra/oauth/apple.adapter.ts:35`; `.../apple.adapter.spec.ts:24` |
| C17 | Chave i18n camelCase | `dontPanic` | 2 | **remover com o branding** (§3.1) | `apps/web/messages/en-US.json:5`; `apps/web/messages/pt-BR.json:5` |
| C18 | Nome de arquivo de download (user-visible) | `dontpanic-backup-codes.txt`, `dontpanic-data-export.json` | 3 | `<slug>-…` | `apps/web/src/components/two-factor-setup.tsx:67`; `apps/web/src/components/profile/two-factor-card.tsx:175`; `apps/web/src/components/profile/danger-card.tsx:46` |
| C19 | Prefixo de tmpdir em teste | `dontpanic-storage-` | 1 | `<slug>-storage-` | `apps/api/src/infra/storage/local-storage.adapter.spec.ts:12` |
| C20 | Slug do tenant do seed | `'dontpanic'` (slug) | 2 | `<slug>` | `apps/api/prisma/seed.ts:54,57` |

Soma de C1–C4 = **203** ocorrências de escopo — a maior classe, e a mais mecânica.

### 1.3 Regra de precedência para o motor

O motor **não** pode ser um `s/dontpanic/<slug>/gi`. A ordem de aplicação importa porque os
tokens se contêm:

1. `create-dontpanic` (C5) — **casa antes** de `dontpanic`; se `dontpanic` for substituído
   primeiro, `create-dontpanic` vira `create-acme` sem que ninguém tenha decidido isso.
2. `marmottajr/dontpanic` (C15) — idem; vira uma URL de GitHub inexistente.
3. `dontpanic_app` (C6) e `dontpanic_e2e` (C7) — antes de `dontpanic` bare, senão sobram
   `acme_app`/`acme_e2e` corretos por acidente mas com o sufixo colado a um slug não sanitizado.
4. `DontPanic42!` (C14) — antes de `DontPanic`.
5. `Don't Panic` / `Don’t Panic` (C12/C13) — tratados por um passo de **branding**, separado.
6. `DontPanic` (C11) e `dontpanic` (C8) — por último.

Sugestão de implementação: lista **ordenada** de `{pattern, replacement, class, files?}`,
aplicada em passada única por arquivo com um matcher alternado (regex com alternação ordenada,
longest-first), não N passadas de `sed`.

---

## 2. Arquivos de alto risco — inventário detalhado

### 2.1 `apps/api/prisma/migrations/20260911105300_app_role/migration.sql` — a role restrita

**13 ocorrências de `dontpanic_app` em 51 linhas.** Este arquivo é o mais perigoso do repo:
uma substituição parcial produz um banco onde a role existe mas não tem GRANT, ou tem GRANT mas
a API conecta com outro nome — e o sintoma é "zero linhas", não erro.

| Linha | Statement | O que muda |
| ----: | --------- | ---------- |
| 16 | `IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app')` | **string literal** entre aspas simples |
| 18 | `CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'` | **duas** ocorrências: identificador + literal de senha |
| 19 | `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS` | nada — mas é a linha que dá sentido ao arquivo |
| 21 | `ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS` | identificador |
| 25 | `GRANT USAGE ON SCHEMA public TO dontpanic_app;` | identificador |
| 26 | `GRANT USAGE ON SCHEMA app TO dontpanic_app;` | identificador |
| 27 | `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;` | identificador |
| 30 | `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;` | identificador |
| 31 | `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;` | identificador |
| 36 | `ALTER DEFAULT PRIVILEGES … GRANT … ON TABLES TO dontpanic_app;` | identificador |
| 38 | `ALTER DEFAULT PRIVILEGES … GRANT USAGE, SELECT ON SEQUENCES TO dontpanic_app;` | identificador |
| 40 | `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO dontpanic_app;` | identificador |
| 49 | `REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;` | identificador |

**`app.apply_tenant_rls()` NÃO referencia o nome da role.** Verificado:
`apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql` tem **zero**
ocorrências de `dontpanic`. As políticas usam `current_setting('app.current_tenant_id', true)`,
`app.platform_admin`, `app.system` e o predicado `app.tenant_visible(...)` — todos no schema
**`app`**, que é um nome genérico e **não deve ser renomeado**. As policies são criadas para
`PUBLIC` (sem `TO <role>`), então trocar o nome da role não invalida nenhuma política.

Prefixos de `current_setting` presentes (todos **neutros, não renomear**):
`app.current_tenant_id`, `app.platform_admin`, `app.system`, `app.is_platform_admin`,
`app.is_system`, `app.tenant_visible`, `app.apply_tenant_rls`, `app.apply_user_owned_rls`.

`apps/api/prisma/migrations/20260912120000_invitations_and_oauth/migration.sql:8,110` chamam
`SELECT app.apply_tenant_rls();` — nada a renomear.

**Risco adicional (crítico):** renomear a role dentro de uma migration **já aplicada** muda o
checksum que o Prisma guarda em `_prisma_migrations`. Em um projeto **recém-gerado** isso é
inofensivo (nunca foi aplicada). Em um projeto **já migrado** é `P3006`/drift. O gerador só pode
fazer isso na geração, nunca como "rename retroativo" — ver §4.

### 2.2 `package.json` de todos os workspaces

| Arquivo | Linha | Conteúdo | Classe |
| ------- | ----: | -------- | ------ |
| `package.json` | 2 | `"name": "dontpanic"` | C8 (nome npm da raiz) |
| `package.json` | 5 | `"description": "DontPanic — a production-grade full-stack boilerplate… (Marvin would say: …)"` | C11 + branding |
| `apps/api/package.json` | 2 | `"name": "@dontpanic/api"` | C2 |
| `apps/api/package.json` | 31 | `"@dontpanic/shared": "workspace:*"` | C1 |
| `apps/api/package.json` | 68 | `"@dontpanic/config": "workspace:*"` | C3 |
| `apps/web/package.json` | 2 | `"name": "@dontpanic/web"` | C4 |
| `apps/web/package.json` | 18 | `"@dontpanic/shared": "workspace:*"` | C1 |
| `apps/web/package.json` | 46 | `"@dontpanic/config": "workspace:*"` | C3 |
| `packages/shared/package.json` | 2 | `"name": "@dontpanic/shared"` | C1 |
| `packages/shared/package.json` | 35 | `"@dontpanic/config": "workspace:*"` | C3 |
| `packages/config/package.json` | 2 | `"name": "@dontpanic/config"` | C3 |
| `packages/create-dontpanic/package.json` | 2 | `"name": "create-dontpanic"` | C5 — ver §3.5 |
| `packages/create-dontpanic/package.json` | 4 | `"description": "Scaffold a new DontPanic app… Don't Panic."` | C11+C12 |

**Nenhum `script` de nenhum `package.json` menciona o nome** — verificado. Os scripts usam
`turbo run …`, `prisma …`, `nest …`. Não há `--filter @dontpanic/*` dentro de scripts de
`package.json`; esses `--filter` vivem só em docs, Dockerfiles, compose e CI (abaixo).

### 2.3 `pnpm-workspace.yaml`, `turbo.json`, `tsconfig*`, jest, vitest

| Arquivo | Ocorrências | Ação |
| ------- | ----------: | ---- |
| `pnpm-workspace.yaml` | **0** | nenhuma |
| `turbo.json` | **0** | nenhuma |
| `tsconfig.base.json` | 1 — linha 3 `"display": "DontPanic base"` | C11, cosmético |
| `apps/api/tsconfig.json`, `.spec.json`, `.jest.json`, `.e2e.json` | **0** | nenhuma |
| `apps/web/tsconfig.json` | **0** (o único `paths` é `@/*`, linha 16-18) | nenhuma |
| `packages/shared/tsconfig.json`, `packages/create-dontpanic/tsconfig.json` | **0** | nenhuma |
| `apps/api/jest.config.js` | **0** — sem `moduleNameMapper` | nenhuma |
| `apps/api/test/jest-e2e.json` | **0** | nenhuma |
| `apps/api/test/e2e-sequencer.js` | **0** (nome da classe é `E2ESequencer`) | nenhuma |
| `apps/web/vitest.config.mts` | **0** | nenhuma |
| `apps/web/next.config.ts` | **0** | nenhuma |
| `apps/api/prisma.config.ts` | **0** | nenhuma |
| `.changeset/config.json`, `commitlint.config.cjs`, `.husky/**` | **0** | nenhuma |
| `packages/shared/tsup.config.ts` | 1 — linha 7, comentário `'@dontpanic/shared/locale/br'` | C1 (comentário) |
| `apps/api/eslint.config.mjs` | 1 — linha 1 `import base from '@dontpanic/config/eslint'` | C3, **funcional** |
| `apps/web/eslint.config.mjs` | 1 — linha 1, idem | C3, **funcional** |
| `packages/shared/eslint.config.js` | 1 — linha 1, idem | C3, **funcional** |
| `packages/config/eslint.js` | 2 — linhas 6, 7 (comentários) | C3/C11 |
| `packages/create-dontpanic/eslint.config.js` | 1 | C3 |
| `.vscode/settings.json` | 1 — linha 16 `"packages/create-dontpanic/template": true` | C5 |
| `.gitignore` | 2 — linhas 28, 29 | C5 |
| `.prettierignore` | 2 — linhas 1, 2 | C5 |

### 2.4 `docker-compose.yml`

| Linha | Conteúdo | Classe | Observação |
| ----: | -------- | ------ | ---------- |
| 4 | `container_name: dontpanic-postgres` | C10 | único por daemon Docker — colisão real entre projetos |
| 7 | `POSTGRES_USER: dontpanic` | C8 | tem de casar com `DATABASE_ADMIN_URL` |
| 8 | `POSTGRES_PASSWORD: dontpanic` | C8 | idem |
| 9 | `POSTGRES_DB: dontpanic` | C8 | idem |
| 15 | `test: ["CMD-SHELL", "pg_isready -U dontpanic"]` | C8 | **healthcheck**: se divergir de `POSTGRES_USER`, o healthcheck nunca passa e todo `depends_on: service_healthy` trava o `up` |
| 22 | `container_name: dontpanic-redis` | C10 | |
| 37 | `container_name: dontpanic-minio` | C10 | |
| 63 | `mc mb --ignore-existing local/dontpanic;` | C8 | **cria o bucket**; tem de casar com `S3_BUCKET` |
| 64 | `mc anonymous set download local/dontpanic;` | C8 | idem |
| 71 | `container_name: dontpanic-mailpit` | C10 | |

Volumes (`postgres_data`, `minio_data`, linhas 82-84) e o nome do projeto compose (derivado do
diretório) são **neutros** — não renomear. Não há `networks:` nomeada.

### 2.5 `docker-compose.dev.yml`

| Linha | Conteúdo | Classe |
| ----: | -------- | ------ |
| 34 | `container_name: dontpanic-deps` | C10 |
| 38 | `pnpm --filter @dontpanic/shared build` (dentro de `command:`) | C1 — **funcional**, quebra o boot do dev se errar |
| 46 | `container_name: dontpanic-api-dev` | C10 |
| 60 | `DATABASE_URL: postgresql://dontpanic_app:dontpanic_app@postgres:5432/dontpanic?schema=public` | C6 ×2 + C8 |
| 61 | `DATABASE_ADMIN_URL: postgresql://dontpanic:dontpanic@postgres:5432/dontpanic?schema=public` | C8 ×3 |
| 64 | `S3_PUBLIC_URL: http://localhost:4204/dontpanic` | C8 (bucket no path) |
| 87 | `container_name: dontpanic-worker-dev` | C10 |
| 96 | `DATABASE_URL: …dontpanic_app:dontpanic_app@postgres:5432/dontpanic…` | C6 ×2 + C8 |
| 97 | `DATABASE_ADMIN_URL: …dontpanic:dontpanic@postgres:5432/dontpanic…` | C8 ×3 |
| 115 | `container_name: dontpanic-web-dev` | C10 |

Volumes `nm_root`, `nm_api`, `nm_web` — neutros.

### 2.6 Dockerfiles

| Arquivo:linha | Conteúdo | Classe |
| ------------- | -------- | ------ |
| `Dockerfile.api:1` | `# DontPanic API — multi-stage production image.` | C11 (comentário) |
| `Dockerfile.api:2` | `# … docker build -f Dockerfile.api -t dontpanic-api .` | C10 (comentário, mas é a instrução que o dev copia) |
| `Dockerfile.api:13` | `RUN pnpm --filter @dontpanic/shared build \` | C1 — **funcional** |
| `Dockerfile.api:14` | `&& pnpm --filter @dontpanic/api exec prisma generate \` | C2 — **funcional** |
| `Dockerfile.api:15` | `&& pnpm --filter @dontpanic/api build` | C2 — **funcional** |
| `Dockerfile.web:1` | `# DontPanic Web — …` | C11 |
| `Dockerfile.web:2` | `# … -t dontpanic-web .` | C10 |
| `Dockerfile.web:10` | `RUN pnpm --filter @dontpanic/shared build \` | C1 — **funcional** |
| `Dockerfile.web:11` | `&& pnpm --filter @dontpanic/web build` | C4 — **funcional** |
| `Dockerfile.dev:1` | `# DontPanic — DEV toolchain image (NO source copied).` | C11 |

### 2.7 `.env.example` — variáveis cujo **valor** contém o nome

| Linha | Variável / conteúdo | Classe | Precisa casar com |
| ----: | ------------------- | ------ | ----------------- |
| 2 | `#  DontPanic — environment template` | C11 | — |
| 3 | `#  Copy to .env and adjust. Don't Panic: dev defaults just work` | C12 | branding |
| 49 | `DATABASE_URL=postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic?schema=public` | C6 ×2 + C8 | migration `_app_role` (role+senha) e `POSTGRES_DB` |
| 50 | `DATABASE_ADMIN_URL=postgresql://dontpanic:dontpanic@localhost:4202/dontpanic?schema=public` | C8 ×3 | `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` do compose |
| 76 | `TOTP_ISSUER=DontPanic` | C11 | `apps/api/src/config/env.ts:40` (default) e os testes de 2FA |
| 87 | `MAIL_FROM="DontPanic <no-reply@dontpanic.dev>"` | C11 + C9 | `env.ts:57` e specs de mail |
| 92 | `S3_BUCKET=dontpanic` | C8 | `docker-compose.yml:63-64` (`mc mb local/dontpanic`) e `env.ts:62` |
| 96 | `S3_PUBLIC_URL=http://localhost:4204/dontpanic` | C8 | bucket acima |
| 110 | `# (\`pnpm --filter @dontpanic/api worker\`)` (comentário) | C2 | — |
| 117 | `QUEUE_NAME=dontpanic` | C8 | `env.ts:92` |
| 119 | `QUEUE_PREFIX={dontpanic}` | C8 | `env.ts:94`; namespaces as chaves no Redis — **dois projetos com o mesmo prefixo compartilham fila** |
| 207 | `#     dev.dontpanic.web). NOT the App ID` (comentário Apple) | C16 | — |
| 269 | `NEXT_PUBLIC_APP_NAME=DontPanic` | C11 | **atenção:** grep não encontra nenhum consumidor dessa var em `apps/web/src`; é uma var morta ou reservada |

**Defaults espelhados em código** (`apps/api/src/config/env.ts`) — se o `.env.example` for
renomeado e o default não, o projeto "funciona" até alguém apagar a linha do `.env`:

| `env.ts` linha | Default |
| -------------: | ------- |
| 40 | `TOTP_ISSUER: z.string().default('DontPanic')` |
| 57 | `MAIL_FROM: z.string().default('DontPanic <no-reply@dontpanic.dev>')` |
| 62 | `S3_BUCKET: z.string().default('dontpanic')` |
| 66 | `S3_PUBLIC_URL: z.string().default('http://localhost:9000/dontpanic')` |
| 92 | `QUEUE_NAME: z.string().default('dontpanic')` |
| 94 | `QUEUE_PREFIX: z.string().default('{dontpanic}')` |
| 148 | comentário `dev.dontpanic.web` |
| 240, 244, 280 | mensagens `"Invalid environment variables. Don't Panic, just fix these:"` — C12, branding |

E os testes que fixam esses defaults: `apps/api/src/config/env.spec.ts:26`
(`expect(env.TOTP_ISSUER).toBe('DontPanic')`).

### 2.8 `apps/api/prisma/seed.ts`

| Linha | Conteúdo | Classe | Nota |
| ----: | -------- | ------ | ---- |
| 4 | `import { SYSTEM_PROFILES, permissionsForProfile } from '@dontpanic/shared';` | C1 | funcional |
| 14 | `const PASSWORD = 'DontPanic42!';` | C14 | **rotacionar**, não derivar do nome (§3.2) |
| 15 | `const SUPERADMIN_EMAIL = 'superadmin@dontpanic.dev';` | C9 | |
| 16 | `const ADMIN_EMAIL = 'admin@dontpanic.dev';` | C9 | |
| 45 | `name: 'Deep Thought'` (nome do superadmin) | branding | §3.1 |
| 54 | `where: { slug: 'dontpanic' }` | C20 | slug do tenant de exemplo |
| 57 | `slug: 'dontpanic'` | C20 | **tem de passar por `RESERVED_TENANT_SLUGS`** — ver §6.5 |
| 58 | `name: 'Heart of Gold'` (nome da empresa de exemplo) | branding | §3.1 |
| 91 | `name: 'Zaphod Beeblebrox'` (nome do admin) | branding | §3.1 |
| 101 | `console.log(\`🌱 Seeded platform operator → …\`)` | — | usa as consts |
| 102 | `console.log(\`… (Don't Panic.)\`)` | C12 | branding |

Documentado também em `README.md:103-108` / `:397-402` e `PENDENCIAS.template.md:36-37`.

### 2.9 Suíte e2e

| Arquivo:linha | Conteúdo | Classe |
| ------------- | -------- | ------ |
| `apps/api/test/global-setup.ts:31` | `const ADMIN_URL = 'postgresql://dontpanic:dontpanic@localhost:4202/dontpanic';` | C8 ×3 |
| `apps/api/test/global-setup.ts:32` | `const E2E_DB = 'dontpanic_e2e';` | C7 — **usado em `CREATE DATABASE ${E2E_DB}` (linha 46), interpolação direta, sem quoting** |
| `apps/api/test/global-setup.ts:33` | `const E2E_URL = \`postgresql://dontpanic:dontpanic@localhost:4202/${E2E_DB}?schema=public\`;` | C8 ×2 |
| `apps/api/test/global-setup.ts:59, 99` | comentários | C7/C11 |
| `apps/api/test/e2e-setup.ts:7, 8` | comentários (`dontpanic_e2e`, `dontpanic`) | C7/C8 |
| `apps/api/test/e2e-setup.ts:18` | `E2E_DATABASE_URL = 'postgresql://dontpanic_app:dontpanic_app@localhost:4202/dontpanic_e2e?schema=public'` | C6 ×2 + C7 |
| `apps/api/test/e2e-setup.ts:23` | `E2E_ADMIN_DATABASE_URL = 'postgresql://dontpanic:dontpanic@localhost:4202/dontpanic_e2e?schema=public'` | C8 ×2 + C7 |
| `apps/api/test/e2e-app.ts:19, 28` | comentários | C7/C11 |
| `apps/api/test/tenant-isolation.e2e-spec.ts:82` | `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'dontpanic_app'` | C6 — **é o teste que prova o isolamento; errar aqui faz o teste passar vazio** |
| `apps/api/test/auth.e2e-spec.ts:7` | comentário | C7 |
| `apps/api/test/invitations.e2e-spec.ts:8` | comentário | C7 |
| `apps/api/test/security.e2e-spec.ts:17` | `email: 'nobody@dontpanic.dev'` | C9 |
| `apps/api/test/e2e-sequencer.js` | **0 ocorrências** | — |

### 2.10 CI — `.github/workflows/**`

| Arquivo:linha | Conteúdo | Classe |
| ------------- | -------- | ------ |
| `ci.yml:28` | `run: pnpm --filter @dontpanic/shared build` | C1 — **funcional; o CI quebra na hora** |
| `docker.yml:42` | `tags: dontpanic-${{ matrix.app }}:ci` | C10 |
| `docker.yml:49` | `image-ref: dontpanic-${{ matrix.app }}:ci` | C10 — tem de casar com a linha 42 ou o Trivy não acha a imagem |
| `release.yml:30` | `run: pnpm --filter @dontpanic/shared build` | C1 |
| `release.yml:34` | comentário `publish-create-dontpanic.yml` | C5 |
| `publish-create-dontpanic.yml` | 14 ocorrências (nome do workflow, `concurrency`, verificação de tag, `npm view`, 4 `pnpm --filter create-dontpanic …`, `--filter @dontpanic/shared build`) | C5 — **o arquivo inteiro provavelmente deve ser deletado no projeto gerado** (§3.5) |
| `codeql.yml` | **0** | — |
| `.github/ISSUE_TEMPLATE/config.yml:4,7` | `https://github.com/marmottajr/dontpanic/security/advisories/new` e `/discussions` | C15 — §3.4 |
| `.github/ISSUE_TEMPLATE/feature_request.yml:2` | `description: Suggest an idea for DontPanic` | C11 |
| `.github/ISSUE_TEMPLATE/bug_report.yml:7` | `"Don't Panic. Give us enough to reproduce it…"` | C12 |
| `.github/PULL_REQUEST_TEMPLATE.md:1` | `<!-- Don't Panic. … -->` | C12 |
| `.github/PULL_REQUEST_TEMPLATE.md:15` | `Contracts changed only in \`@dontpanic/shared\`` | C1 |

`ci.yml` **não** roda e2e (linhas 36-40 explicam: unit only, sem Postgres). Não há service
container de Postgres no CI, logo nenhum `POSTGRES_DB` de CI para renomear.

### 2.11 Documentação

| Arquivo | Ocorrências | Nota |
| ------- | ----------: | ---- |
| `README.md` | 48 linhas (bilíngue PT/EN) | inclui badge `Don't Panic-42` (linha 19), tabela do seed (103-108, 397-402), árvore do monorepo (264, 563), URL do repo (321, 619), parágrafo de easter eggs (323, 621-622) |
| `CLAUDE.md` | 23 linhas | é o guia do sistema; no projeto gerado deve ser **reescrito**, não sed-ado (contém a epígrafe `"Don't Panic."`, a persona Marvin, a seção de humor) |
| `CONTRIBUTING.md` | 6 linhas (1, 5, 14, 15, 16, 23) | |
| `SECURITY.md` | 1 linha (26) | |
| `PENDENCIAS.template.md` | 3 linhas (36, 37, 38) | checklist de produção; menciona senha do seed e a role |
| `packages/create-dontpanic/README.md` | 14 linhas | §3.5 |
| `packages/create-dontpanic/CHANGELOG.md` | ocorrências | §3.3 — **histórico, não renomear** |
| `LICENSE` | **0 ocorrências de `dontpanic`** | `Copyright (c) 2026 Marcio Campos Motta` — §3.6 |

---

## 3. Ocorrências que **NÃO** devem ser renomeadas

### 3.1 Branding "Guia do Mochileiro" — passo separado, com flag própria

Este material **não é o nome do projeto**; é uma camada de humor que atravessa contrato de API,
i18n, e-mails, testes e CSS. Substituir `Don't Panic` por `Acme Corp` produz frases absurdas
("Logged out. Acme Corp — your session is gone."). Precisa de uma opção
`keepEasterEggs: boolean` e, quando `false`, de **remoção cirúrgica**, não substituição.

**Núcleo do branding (arquivos que existem só por causa dele):**

| Arquivo | Linhas | O que é |
| ------- | ------ | ------- |
| `apps/api/src/common/marvin.ts` | 22 (arquivo inteiro) | pool de quips por status HTTP; `FALLBACK = 'Don’t Panic.'` (apóstrofo curvo, linha 15) |
| `apps/api/src/common/marvin.spec.ts` | arquivo inteiro | 3 ocorrências de `Don’t Panic` curvo |
| `apps/web/src/components/easter-eggs.tsx` | 44 (arquivo inteiro) | Konami code + `console.log` secreto |
| `apps/api/src/app.controller.ts` | 15-24 | `GET /teapot`, `@HttpCode(418)`, `"I'm a teapot. I can't brew coffee, but Don't Panic."` |
| `apps/web/src/components/brand.tsx` | 94 (arquivo inteiro) | wordmark "towel"; linhas 12, 57 mencionam DontPanic |

**Contrato de API contaminado pelo branding — a armadilha:**

`packages/shared/src/common.ts:29-30` declara `marvin?: string` em `ApiErrorBody`. Remover o
Marvin **muda o contrato compartilhado** e cascateia:

- `apps/api/src/common/filters/all-exceptions.filter.ts` — preenche o campo
- `apps/api/src/common/filters/all-exceptions.filter.spec.ts:61-65` — asserta `body.marvin`
- `apps/web/src/app/error.tsx:40` e `apps/web/src/app/not-found.tsx:29` — renderizam `t('marvin')`
- `apps/api/src/app.service.ts:8` e `app.service.spec.ts:8` — `hint: "Don't Panic."`
- `apps/api/test/auth.e2e-spec.ts`, `apps/api/test/invitations.e2e-spec.ts` — assertam `marvin`
- chaves i18n `marvin` em `apps/web/messages/en-US.json` e `pt-BR.json`

**i18n:** `apps/web/messages/{en-US,pt-BR}.json` — bloco `"easter"` (en-US linhas 326-331:
`consoleTitle`, `consoleSubtitle`, `konamiTitle`, `konamiDescription`), `common.appName` (linha 3),
`common.dontPanic` (linha 5), `common.tagline` (linha 4), chave `marvin`, e a mensagem
`errors.generic` (linha 324) e `error.body` (linha 320). **`apps/web/src/i18n/messages.test.ts`
faz paridade de chaves entre os dois locales** — qualquer remoção tem de ser simétrica ou o teste
do web falha.

**Textos de humor espalhados (substituição por texto neutro, não por `<slug>`):**

`apps/api/src/modules/auth/auth.controller.ts:167`;
`apps/api/src/modules/auth/services/auth.service.ts:162, 197, 561, 562, 598`;
`apps/api/src/modules/users/users.controller.ts:84, 114, 178`;
`apps/api/src/modules/users/services/users.service.ts:379`;
`apps/api/src/modules/auth/support/email-templates.ts:27`;
`apps/api/src/modules/invitations/support/invitation-email.ts:42, 160` (`'DontPanic · 42'`);
`apps/api/src/config/env.ts:240, 244, 280`;
`apps/api/src/main.ts:107, 119`;
`apps/api/prisma/schema/main.prisma:1`;
`apps/api/prisma/seed.ts:102`.

**UI com "the answer is 42":** `apps/web/src/app/(dashboard)/layout.tsx:26`;
`apps/web/src/components/auth-shell.tsx:37`;
`apps/api/src/modules/auth/support/email-templates.ts:88`;
`apps/api/src/modules/invitations/support/invitation-email.ts:136`.

**Design tokens temáticos:** `apps/web/src/app/globals.css:7` (`DontPanic design language — "The
Guide"`) e `:22` (comentário `primary — signal / phosphor green (calm "don't panic")`);
`apps/web/.storybook/preview.tsx:44` (`'DontPanic theme — paper (light) or deep space (dark)'`).
Os **valores** de cor são neutros; só os comentários/labels carregam o tema.

**Stories e fixtures de teste com nomes do Guia** (Deep Thought, Heart of Gold, Zaphod,
Sirius Cybernetics, Marvin, "so long and thanks for all the fish"): `apps/api/test/factories.ts`,
`apps/api/test/table-store.e2e-spec.ts`, `apps/api/src/**/*.spec.ts` (≈12 arquivos),
`apps/web/src/components/ui/{alert,avatar,card,input,label,sonner,button,confirm-dialog}.stories.tsx`,
`apps/web/src/**/*.test.tsx` (≈8 arquivos). São **dados de teste**: renomear é opcional e
inofensivo, mas um `sed` de `Don't Panic` **quebra asserções literais** —
`apps/web/src/components/ui/button.stories.tsx:17` (`args: { children: "Don't Panic" }`),
`apps/api/src/modules/invitations/support/invitation-email.spec.ts:21,35` (asserta a string exata
do subject), `apps/api/src/infra/queue/job-router.service.spec.ts:9`.

**Fonte de verdade de "onde o humor mora":** `README.md:323` e `:621-622`, e a seção
"Humor (com parcimônia)" do `CLAUDE.md`.

### 3.2 A senha do seed

`DontPanic42!` (`apps/api/prisma/seed.ts:14`, `README.md:103,397`,
`PENDENCIAS.template.md:37`) **não é um nome — é uma credencial**. Derivá-la do nome do projeto
(`AcmeCorp42!`) produz uma senha previsível a partir de um dado público. O gerador deve
**gerar uma senha aleatória** e imprimi-la no final, ou manter um placeholder com aviso, e
atualizar as três referências em docs para apontar para o valor gerado.

### 3.3 Artefatos, histórico e binários

| Não tocar | Motivo |
| --------- | ------ |
| `packages/create-dontpanic/template/**` | gitignorado, regenerado por `scripts/build-template.mjs` (363 ocorrências fantasma) |
| `pnpm-lock.yaml` | regenerado pelo `pnpm install`; contém os nomes de pacote antigos e integridades |
| `node_modules/**`, incl. `*/node_modules/@dontpanic/` (4 symlinks) | recriados pelo install |
| `dist/`, `.next/`, `.turbo/`, `out/`, `storybook-static/`, `*.tsbuildinfo` | build |
| `coverage/`, `playwright-report/`, `test-results/` | relatórios |
| `packages/create-dontpanic/CHANGELOG.md` | **histórico** — reescrever o passado é mentira; no projeto gerado o arquivo deve ser removido, não sed-ado |
| `.git/**` | histórico |
| `apps/web/public/favicon.svg` | binário/SVG; nenhuma ocorrência textual, mas é **branding visual** — trocar é decisão de arte |

### 3.4 URLs externas e referências ao upstream

`marmottajr/dontpanic` (7 ocorrências) aponta para o repositório **do autor do boilerplate**.
No projeto gerado essas URLs viram links mortos ou, pior, mandam o usuário abrir issue no repo
errado.

| Arquivo:linha | Conteúdo | Ação recomendada |
| ------------- | -------- | ---------------- |
| `.github/ISSUE_TEMPLATE/config.yml:4` | `…/marmottajr/dontpanic/security/advisories/new` | substituir pelo repo do usuário, ou remover a entrada |
| `.github/ISSUE_TEMPLATE/config.yml:7` | `…/marmottajr/dontpanic/discussions` | idem |
| `README.md:321`, `README.md:619` | `github.com/marmottajr/dontpanic` | remover o parágrafo (o README será reescrito) |
| `packages/create-dontpanic/README.md:89` | link para o repo | §3.5 |
| `README.md:19` | badge `img.shields.io/npm/v/create-dontpanic` | remover |

**Não** substituir mecanicamente por `<slug>`: `github.com/marmottajr/acme` é uma URL que não
existe. Isto é **remoção ou input adicional**, não rename.

### 3.5 `create-dontpanic` — decisão de produto, não rename

As 43 ocorrências de `create-dontpanic` e o diretório `packages/create-dontpanic/` são **o
gerador**, não o produto. Renomear para `create-acme` cria um pacote npm que o usuário nunca vai
publicar e um workflow que falha em cada tag `v*`. A recomendação é **remover do projeto gerado**:

- `packages/create-dontpanic/` (diretório inteiro)
- `.github/workflows/publish-create-dontpanic.yml` (arquivo inteiro)
- `.gitignore:28-29`, `.prettierignore:1-2`, `.vscode/settings.json:16` (as linhas que o excluem)
- `release.yml:34` (comentário), `README.md:26,30,67,264,362,563` (menções)

Note que o `build-template.mjs:49` já se auto-exclui do template (`if (abs === pkgDir) return true`),
então o gerador **atual** já não copia a si mesmo — mas **copia** o workflow de publicação e as
linhas de ignore. Isso é um bug existente do pacote atual, herdado por todo projeto gerado hoje.

### 3.6 Licença e copyright

`LICENSE` não contém `dontpanic`. Contém `Copyright (c) 2026 Marcio Campos Motta` (linha 3).
**Nada a renomear pelo motor.** Trocar o titular do copyright é decisão legal do usuário, com
input próprio — não derive do nome do projeto.

### 3.7 Ocorrências onde "Don't Panic" é frase literal, não nome

Nestes casos o texto funciona como conselho ao leitor, e o substituto correto é **apagar a frase**
ou trocar por texto neutro — nunca pelo nome do produto:

- `CONTRIBUTING.md:5` — "Thanks for considering a contribution. Don't Panic — here's how…"
- `.env.example:3` — "Copy to .env and adjust. Don't Panic: dev defaults just work"
- `.github/ISSUE_TEMPLATE/bug_report.yml:7` — "Don't Panic. Give us enough to reproduce it"
- `.github/PULL_REQUEST_TEMPLATE.md:1` — "Don't Panic. Fill this in and the review goes faster."
- `apps/api/src/config/env.ts:240,244,280` — "Invalid environment variables. Don't Panic, just fix these:"
- `apps/api/src/modules/auth/services/auth.service.ts:561,562` — corpo do e-mail de reset
- `packages/create-dontpanic/src/index.ts:30,64,175` — mensagens do CLI (irrelevante se §3.5)

### 3.8 Nomes que **parecem** o projeto mas não são

| Token | Onde | Por que não tocar |
| ----- | ---- | ----------------- |
| schema SQL `app` e prefixo `app.*` | `20260911105200_row_level_security/migration.sql` (28 referências) | nome genérico do schema de RLS; renomear exige reescrever todas as políticas e o `PrismaService` |
| `dontpanic_app` **sufixo** `_app` | migration `_app_role` | o `_app` é o papel ("role da aplicação"), não parte do nome; preserve-o |
| `nm_root`, `nm_api`, `nm_web`, `postgres_data`, `minio_data` | compose volumes | neutros |
| `E2ESequencer` | `apps/api/test/e2e-sequencer.js:15` | não contém o nome |
| `apps/web/src/lib/safe-path.test.ts:28` → `'//evil.com/@app.dontpanic.dev'` | fixture de open-redirect | renomear é seguro, mas entenda que é um **payload de ataque**, não uma URL do produto |
| `apps/api/src/infra/prisma/prisma.service.spec.ts:263` → `'postgresql://app:secret@localhost:5432/dontpanic'` | fixture | ok renomear |

---

## 4. Ordem de operações

Há dependências reais. A ordem abaixo é a única em que nada quebra.

```
 0. clonar / copiar o template  (sem node_modules, sem pnpm-lock.yaml, sem template/)
 1. aplicar o rename de TEXTO em todos os arquivos rastreados
 2. aplicar o passo de BRANDING (remover/substituir easter eggs), se pedido
 3. remover packages/create-dontpanic/ + publish-create-dontpanic.yml + linhas de ignore
 4. renomear DIRETÓRIOS (nenhum necessário hoje, além do item 3)
 5. gerar .env com segredos novos e senha de seed nova
 6. pnpm install          ← recria node_modules/@<slug>/* ; SEM isto nada resolve
 7. pnpm --filter @<slug>/shared build
 8. docker compose up -d  ← cria o banco <slug> com o POSTGRES_USER novo
 9. pnpm --filter @<slug>/api db:migrate   ← cria a role <slug>_app
10. pnpm --filter @<slug>/api db:seed
11. git init + commit inicial
12. verificação (§5)
```

### Dependências e o que quebra se invertidas

| Dependência | O que quebra ao inverter |
| ----------- | ----------------------- |
| **Rename do escopo ANTES do `pnpm install`** | Se instalar primeiro, `node_modules/@dontpanic/{shared,config}` são criados como symlinks com o nome **velho**. Depois do rename, todo `import … from '@<slug>/shared'` falha com `MODULE_NOT_FOUND` e o `tsc` acusa `Cannot find module`. Exige apagar `node_modules` e reinstalar. É o erro mais provável de um motor que "renomeia depois". |
| **Rename do escopo ANTES do `pnpm --filter … build`** | `pnpm --filter @dontpanic/shared build` simplesmente não casa filtro nenhum: o pnpm imprime um aviso ("No projects matched the filters") e **sai com código 0**. A build do shared não roda, o `dist/` não existe, e o erro aparece 3 passos depois como "Cannot find module '../dist/index.js'". Falha silenciosa. |
| **`pnpm-lock.yaml` não deve ser copiado** | O lockfile referencia os pacotes de workspace pelo nome antigo. `pnpm install --frozen-lockfile` falha com `ERR_PNPM_OUTDATED_LOCKFILE`. O `build-template.mjs:38` já exclui o lockfile de propósito; mantenha. |
| **Rename da role ANTES de qualquer `migrate`** | O nome da role vive no **corpo** da migration. Renomear depois de aplicar muda o checksum → `P3006` / "migration modified after being applied". E se o `.env` for renomeado mas a migration não (ou vice-versa), a API conecta com uma role que não existe (`FATAL: role "acme_app" does not exist`) ou conecta e vê zero linhas. |
| **`POSTGRES_USER/DB` do compose ANTES do `docker compose up`** | O Postgres só honra `POSTGRES_USER`/`POSTGRES_DB` **na primeira inicialização do volume**. Se o volume `postgres_data` já existir com o usuário antigo, renomear o compose depois não muda nada e o `DATABASE_ADMIN_URL` novo falha na autenticação. Requer `docker compose down -v`. |
| **`POSTGRES_USER` e o healthcheck juntos** | `docker-compose.yml:7` e `:15` (`pg_isready -U dontpanic`) têm de mudar na mesma passada. Divergir deixa o healthcheck falhando para sempre e todo `depends_on: condition: service_healthy` trava o `up` sem mensagem útil. |
| **`S3_BUCKET` e `mc mb local/<bucket>` juntos** | `.env.example:92`/`env.ts:62` e `docker-compose.yml:63-64`. Divergir dá `NoSuchBucket` no primeiro upload de avatar — e só ali. |
| **Bloco de `container_name` inteiro de uma vez** | Docker exige `container_name` único **por daemon**. Renomear metade deixa colisão com outro projeto gerado na mesma máquina: `Conflict. The container name "/dontpanic-postgres" is already in use`. |
| **`docker.yml:42` e `:49` juntos** | tag da imagem e `image-ref` do Trivy; divergir faz o scan falhar com "image not found" depois de um build verde. |
| **i18n: as duas locales na mesma passada** | `apps/web/src/i18n/messages.test.ts` faz paridade de chaves `en-US` × `pt-BR`. Remover a chave `easter` só de uma → teste do web falha. |
| **Branding DEPOIS do rename de nome** | Se o branding rodar primeiro e trocar `Don't Panic` por texto neutro, algumas ocorrências de `DontPanic` que estavam em frases de humor mudam de contexto e o rename de nome passa a produzir frases estranhas. Rename mecânico primeiro, branding (que é semântico) depois. |
| **`git init` DEPOIS de tudo** | Commitar antes do rename deixa o nome antigo no primeiro commit do usuário, o que reintroduz o nome em `git log -p` e em qualquer busca histórica. |

---

## 5. Teste de conformidade

### 5.1 O grep que tem de dar zero

Comando **testado** no repo dontpanic atual (o `.` no lugar do apóstrofo cobre de uma vez as duas
formas, U+0027 e U+2019 — tentar alternar as duas literalmente dentro de uma string de shell é
uma armadilha de quoting que não paga o preço):

```bash
# Rodar na raiz do projeto GERADO.
PAT='dontpanic|don.t[[:space:]]panic'
grep -rIniE "$PAT" . \
  --exclude-dir=node_modules \
  --exclude-dir=.git \
  --exclude-dir=.next \
  --exclude-dir=.turbo \
  --exclude-dir=dist \
  --exclude-dir=out \
  --exclude-dir=coverage \
  --exclude-dir=storybook-static \
  --exclude-dir=playwright-report \
  --exclude-dir=test-results \
  --exclude-dir=template \
  --exclude=pnpm-lock.yaml \
  --exclude='*.tsbuildinfo' \
  --exclude='*.log'
# Esperado no projeto gerado: nenhuma saída, exit 1.
```

**Baseline medido no dontpanic atual com exatamente este comando: 506 linhas.**
O mesmo comando **sem** `--exclude-dir=template`: **879 linhas** — a prova numérica de que
esquecer essa exclusão contamina a verificação com 373 linhas de um artefato regenerável.

As aspas em `--exclude='*.tsbuildinfo'` e `--exclude='*.log'` não são estilo: em zsh, sem elas o
shell tenta expandir o glob, não acha nada, e **aborta o comando inteiro**
(`no matches found`) — dando um falso "zero" que parece aprovação.

Notas sobre as exclusões, cada uma paga com um falso positivo:

- `-I` (skip binários) e `-i` (case-insensitive) cobrem `dontpanic`, `DontPanic`, `DONTPANIC`.
- `don.t[[:space:]]panic` aceita `don-t panic` / `dont panic` como falso positivo teórico; na
  prática zero ocorrências, e cobre as 53 reais (46 retas + 7 curvas) numa alternativa só.
- `--exclude-dir=template` é obrigatório: o `packages/create-dontpanic/template/` gerado tem 363
  ocorrências fantasma. Se §3.5 remover o pacote, a exclusão fica redundante mas inofensiva.
- `pnpm-lock.yaml` só é limpo depois de um `pnpm install` no projeto renomeado; antes disso ele
  não deve nem existir.
- `--exclude-dir=.turbo` cobre os logs de task do turbo (16 ocorrências no repo atual).
- `--exclude-dir=coverage` — relatórios HTML embutem o código-fonte.
- Se o usuário optou por **manter** os easter eggs, a segunda e terceira alternativas do regex
  devem sair do grep (as frases `Don't Panic` sobrevivem de propósito). Então são **dois** modos
  de verificação, e o motor precisa saber qual aplicar.

### 5.2 Grep complementar — o nome NOVO tem de aparecer nos lugares certos

Um grep-zero prova que o velho saiu; não prova que o novo entrou coerente. Checagens pontuais:

```bash
# a role SQL aparece exatamente 13 vezes na migration de role
test 13 -eq "$(grep -o "${SLUG}_app" apps/api/prisma/migrations/*_app_role/migration.sql | wc -l)"

# POSTGRES_USER do compose == usuário do DATABASE_ADMIN_URL do .env
# S3_BUCKET do .env == bucket criado pelo `mc mb` do compose
# QUEUE_PREFIX do .env == default de env.ts:94
# tag de imagem do docker.yml:42 == image-ref do docker.yml:49
# container_name: todos os 8 com o mesmo prefixo
grep -c "container_name: ${SLUG}-" docker-compose.yml docker-compose.dev.yml   # 4 e 4
```

### 5.3 O que mais precisa passar

Em ordem, porque cada um só é executável depois do anterior:

| Passo | Comando | O que prova |
| ----- | ------- | ----------- |
| 1 | `pnpm install` | o escopo novo resolve; `node_modules/@<slug>/*` existe |
| 2 | `pnpm --filter @<slug>/shared build` (exit 0 **e** `packages/shared/dist/index.js` existe) | o filtro casou de verdade — **checar o artefato, não só o exit code**, porque filtro que não casa sai 0 |
| 3 | `pnpm lint` | ESLint resolve `@<slug>/config/eslint` nos 4 workspaces |
| 4 | `pnpm typecheck` | todos os imports de `@<slug>/shared` resolvem |
| 5 | `pnpm build` | Next + Nest compilam; `dist/main.js` e `dist/worker.js` existem |
| 6 | `pnpm test` | unit api + web, incl. paridade de chaves i18n (`apps/web/src/i18n/messages.test.ts`) e os specs que fixam `TOTP_ISSUER`, `MAIL_FROM`, `S3_BUCKET`, `QUEUE_NAME`/`QUEUE_PREFIX`, subjects de e-mail |
| 7 | `docker compose up -d` + healthcheck verde do postgres | `POSTGRES_USER` casa com `pg_isready -U` |
| 8 | `pnpm --filter @<slug>/api db:migrate` | a migration de role aplica sem erro de sintaxe SQL |
| 9 | `psql -c "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname='<slug>_app'"` retorna **uma** linha, `false/false` | a role foi criada com o nome novo, sem BYPASSRLS |
| 10 | `pnpm --filter @<slug>/api db:seed` | slug do tenant passa por `RESERVED_TENANT_SLUGS` e pelo regex de slug (§6.5) |
| 11 | `pnpm --filter @<slug>/api test:e2e` | **o teste decisivo**: `tenant-isolation.e2e-spec.ts:82` consulta `pg_roles` pelo nome da role; roda sob a role restrita; prova que role, banco `<slug>_e2e` e DSNs concordam |
| 12 | `pnpm dev` + `curl http://localhost:4201/api/health` | boot real; `validateEnv` não reclama |

O passo **11 é o único que prova o rename da role de ponta a ponta**. Um rename incompleto da
role passa 1–10 e falha (ou, pior, passa vazio) no 11 — por isso ele é obrigatório no gate.

---

## 6. Restrições do input do usuário

O mesmo `slug` vai virar escopo npm, identificador Postgres, nome de container, nome de banco,
nome de bucket S3, chave de Redis e slug de tenant. **A interseção dessas regras é mais estreita
que qualquer uma delas isolada.**

### 6.1 Regras por destino

| Destino | Regra | Referência |
| ------- | ----- | ---------- |
| **Nome de pacote npm** (`package.json:name`, raiz) | ≤ 214 chars; só minúsculas; sem espaços; permitidos `a-z 0-9 - _ .`; não pode começar com `.` ou `_`; não pode ser igual a um core module do Node; sem caracteres URL-unsafe | `validate-npm-package-name` |
| **Escopo npm** (`@<slug>/pkg`) | mesmas regras do nome, aplicadas ao escopo. **Escopo privado não precisa existir no registry** (todos os pacotes são `private: true`), então colisão de escopo não é bloqueante | — |
| **Identificador Postgres** (role, banco) | **máx. 63 bytes** (`NAMEDATALEN-1`) — truncado em silêncio, não é erro; unquoted é **case-folded para minúsculas**; primeiro char deve ser letra ou `_` (**não dígito**); demais: letras, dígitos, `_`, `$`; **`-` é ilegal unquoted** | PostgreSQL, *Identifiers and Key Words* |
| **Nome de banco Postgres** | idem; adicionalmente não pode ser `template0`/`template1`/`postgres` | — |
| **Nome de role Postgres** | idem; não pode colidir com role existente (`postgres`, `pg_*` são reservados — prefixo `pg_` é **proibido** para roles criadas por usuário) | — |
| **`container_name` Docker** | regex `[a-zA-Z0-9][a-zA-Z0-9_.-]*` — **não pode começar com `-`, `_` ou `.`**; único por daemon | Docker Engine |
| **Nome/tag de imagem Docker** | nome: `[a-z0-9]+(?:[._-][a-z0-9]+)*`, **só minúsculas**; sem `_` duplo no início | Docker |
| **Nome de bucket S3** | 3–63 chars; **só minúsculas**, dígitos, `.` e `-`; começa e termina com letra/dígito; **não pode parecer um IP**; não pode começar com `xn--`, `sthree-`, `amzn-s3-demo-`; não pode terminar com `-s3alias` ou `--ol-s3`; evitar `.` se usar TLS virtual-hosted | AWS S3 |
| **`QUEUE_PREFIX` do BullMQ** | usado como `{<slug>}` — as chaves são hash-tags do Redis Cluster; sem `{`/`}` internos | `.env.example:119` |
| **Slug de tenant** (usado pelo seed) | **regex do próprio projeto** — ver §6.5 |
| **Nome de diretório / npm dir name** | o CLI atual aceita `^[a-z0-9._-]+$` (`packages/create-dontpanic/src/index.ts:72`) |

### 6.2 A interseção segura (o que o gerador deve exigir)

```
slug:  ^[a-z][a-z0-9]*(-[a-z0-9]+)*$     comprimento 2..40
```

Justificativa de cada restrição:

- **começa com letra** — identificador Postgres não pode começar com dígito; nome de imagem
  Docker e bucket S3 não podem começar com `-`/`.`.
- **só minúsculas** — Postgres faz case-fold (então `AcmeCorp` e `acmecorp` são a mesma role, e
  a diferença desaparece sem aviso); Docker image name e bucket S3 **exigem** minúsculas.
- **`-` permitido, `_` e `.` não** — `-` é aceito por npm, Docker e S3; `_` é ilegal em nome de
  imagem Docker no meio de forma segura e ilegal em bucket S3; `.` em bucket S3 quebra TLS
  virtual-hosted e em npm colide com `..`.
- **≤ 40** — margem: o slug entra em `<slug>_app` (+4) e `<slug>_e2e` (+4), e os 63 bytes do
  Postgres são truncados **silenciosamente**. 40 deixa folga para qualquer sufixo futuro.
- **≥ 2** — bucket S3 exige ≥ 3; com o slug puro sendo o bucket, na prática **exija ≥ 3**.

### 6.3 `sqlIdent`: o slug para SQL

Como `-` é ilegal em identificador Postgres unquoted e o SQL da migration **não usa quoting**
(`CREATE ROLE dontpanic_app`, sem aspas duplas), o motor precisa de uma segunda forma:

```
sqlIdent = slug.replace(/-/g, '_')
```

E precisa **verificar colisão**: `acme-corp` e `acme_corp` produzem o **mesmo** `sqlIdent`.
Se o gerador aceitar os dois em máquinas diferentes isso é irrelevante; no mesmo cluster Postgres
é uma colisão de role real.

Alternativa: quotar todos os identificadores na migration (`CREATE ROLE "acme-corp_app"`). **Não
recomendado** — exige tocar 13 statements SQL com quoting consistente, e `pg_isready -U` e a DSN
passariam a precisar de escaping. Converter `-`→`_` é a rota barata.

### 6.4 Lista de reservados que o gerador deve rejeitar

| Categoria | Valores |
| --------- | ------- |
| Bancos Postgres | `postgres`, `template0`, `template1` |
| Roles Postgres | `postgres`, qualquer coisa com prefixo `pg_` |
| Core modules Node (npm) | `http`, `fs`, `path`, `url`, `stream`, `events`, `crypto`, `os`, `net`, `zlib`, `util`, `buffer`, `assert`, `dns`, `tls`, `vm`, `test`, … |
| Nomes que já existem no repo | `api`, `web`, `shared`, `config` — colidem com os nomes de pacote **dentro** do escopo (`@api/api`) e produzem confusão real |
| Prefixos/sufixos S3 | começar com `xn--`, `sthree-`, `amzn-s3-demo-`; terminar com `-s3alias`, `--ol-s3` |
| Slugs de tenant | a lista `RESERVED_TENANT_SLUGS` de `packages/shared/src/tenant.ts:33+` — ver §6.5 |

### 6.5 O slug do tenant do seed — restrição interna do próprio projeto

`apps/api/prisma/seed.ts:54,57` usa `slug: 'dontpanic'` para o tenant de exemplo. Esse valor
passa pelo schema Zod de tenant em `packages/shared/src/tenant.ts`, que mantém
`RESERVED_TENANT_SLUGS` (linha 33+) com, entre outros: `admin`, `api`, `app`, `www`, `mail`,
`ftp`, `blog`, `help`, `support`, `status`, `docs`, `login`, `signup`, `register`, `auth`.

**Consequência:** se o usuário escolher `api` ou `app` como slug do projeto, o seed cria um tenant
com slug reservado. Dependendo de onde a validação roda (schema no `create`, ou só na rota HTTP),
isso falha no seed ou passa e deixa uma linha impossível de recriar pela API. O gerador deve
**rejeitar** qualquer slug presente em `RESERVED_TENANT_SLUGS`, ou usar um slug de tenant
independente do nome do projeto (ex.: `example`, `acme-demo`).

### 6.6 O que fazer quando o input é inválido

Escalada, do menos ao mais intrusivo:

1. **Sanitizar em silêncio o que é inequívoco**: lowercase, trocar espaço e `_` por `-`, colapsar
   `--`, remover acentos (NFD + strip de diacríticos: `Açaí` → `acai`), remover `-` das pontas.
2. **Mostrar o resultado e pedir confirmação** quando a sanitização mudou o input:
   `"Acme Corp"` → `acme-corp`. Nunca aplique uma sanitização invisível ao nome que vai virar
   role de banco: se o usuário digitou `Acme_Corp` e recebeu `acme-corp`, ele precisa saber, porque
   é o que ele vai digitar no `psql` amanhã.
3. **Rejeitar e re-perguntar** quando não há sanitização óbvia: começa com dígito
   (`42acme` → não adivinhe `acme42` nem `a42acme`), fica vazio depois de sanitizar, é reservado,
   ou é curto demais (< 3).
4. **`displayName` é independente e livre**: aceite qualquer texto, incluindo espaços, acentos e
   apóstrofos. Ele só vai para strings de exibição. **Mas escape-o** ao injetar em contextos
   estruturados: JSON (`apps/web/messages/*.json`), YAML (compose), HTML (templates de e-mail em
   `email-templates.ts` e `invitation-email.ts`) e literal de string TS (aspas simples em
   `env.ts:40`). Um `displayName` com apóstrofo (`Bob's Diner`) quebra
   `TOTP_ISSUER: z.string().default('DontPanic')` se injetado sem escape — e esse é exatamente o
   caso que o nome atual do projeto exercita (`Don't Panic`).
5. **Derivar `pascal` com cuidado**: `Acme Corp` → `AcmeCorp`; `Bob's Diner` → `BobsDiner`
   (apóstrofo removido, não convertido). Se `pascal` ficar vazio, caia para `slug` capitalizado.

---

## Apêndice A — contagens finais por classe

Arquivos rastreados pelo git, `packages/create-dontpanic/template/` e artefatos excluídos.

| Classe | Token | Ocorrências |
| ------ | ----- | ----------: |
| C1 | `@dontpanic/shared` | 147 |
| C2 | `@dontpanic/api` | 32 |
| C3 | `@dontpanic/config` | 10 |
| C4 | `@dontpanic/web` | 8 |
| — | **subtotal escopo** | **203** |
| C5 | `create-dontpanic` | 43 |
| C6 | `dontpanic_app` | 29 |
| C7 | `dontpanic_e2e` | 11 |
| C8 | `dontpanic` bare (banco/usuário/senha/bucket/fila/slug) | ~20 |
| C9 | `dontpanic.dev` | 26 |
| C10 | `dontpanic-<algo>` (container/imagem/arquivo) | 17 |
| C11 | `DontPanic` | 81 |
| C12 | `Don't Panic` (U+0027) | 46 |
| C13 | `Don’t Panic` (U+2019) | 7 |
| C14 | `DontPanic42!` | 5 |
| C15 | `marmottajr/dontpanic` | 7 |
| C16 | `dev.dontpanic.web` | 4 |
| C17 | `dontPanic` (chave i18n) | 2 |
| — | **total `dontpanic` case-insensitive** | **490** |
| — | **total linhas casando `dontpanic\|don.t panic`** | **504** (arquivos rastreados) / **506** (varredura de §5.1, que inclui untracked) |
| — | **arquivos afetados** | **199** |

Variantes com **zero** matches (não precisam de regra): `DONTPANIC`, `Dontpanic`, `dont-panic`,
`Dont-Panic`, `dont_panic`, `DONT_PANIC`.

## Apêndice B — arquivos a **remover** (não renomear) no projeto gerado

```
packages/create-dontpanic/                      (diretório inteiro)
.github/workflows/publish-create-dontpanic.yml
packages/create-dontpanic/CHANGELOG.md          (contido no item 1)
```

E as linhas que só existem por causa deles: `.gitignore:28-29`, `.prettierignore:1-2`,
`.vscode/settings.json:16`, `.github/workflows/release.yml:34`,
`README.md:19,26,30,67,264,362,563`.
