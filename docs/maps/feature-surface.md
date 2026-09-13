# DontPanic — feature surface map

**Specification for the project generator.** This document says, for every removable feature of
the DontPanic boilerplate: what to delete whole, what to edit line by line, what SQL to emit, what
documentation to prune, and what it depends on. It is written to be implemented from, not read for
pleasure.

| | |
| --- | --- |
| Source repo | `/Users/junior/projetos/dontpanic` |
| Commit mapped | `4b32926` (`feat: convites, login social e registro público desligável (#37)`) |
| Paths | relative to the dontpanic repo root, always |
| Line numbers | real, from the working tree at that commit |
| Method | full read of `CLAUDE.md`, `README.md`, all 5 `prisma/schema/*.prisma`, all 6 migrations, all 4 `package.json`, `.env.example`, `env.ts`, `seed.ts`, `app.module.ts`, `main.ts`, every controller, plus exhaustive greps per feature |
| Excluded from analysis | `packages/create-dontpanic/**` — a pre-existing *whole-repo* copier (`scripts/build-template.mjs` + a generated `template/` tree). It has no feature selection and is not a model for this work; its `template/` copy would otherwise double every grep hit. |

---

## 0 · How to read this

**Every feature dossier has the same eleven sections**, keyed (a)–(k):

| key | contents |
| --- | --- |
| (a) | **exclusive files** — delete whole, tests and stories included |
| (b) | **shared seams** — `file \| line(s) \| what comes out`, for files that survive |
| (c) | **Prisma** — models/enums/fields/relations, with orphaned fields and inverted invariants called out |
| (d) | **`packages/shared`** — Zod schemas, types, constants, cookie names, `index.ts` exports |
| (e) | **web** — App Router routes, nav entries, BFF/proxy, i18n namespaces and key paths |
| (f) | **env** — `.env.example` + `apps/api/src/config/env.ts` + `validateEnv` conditionals + `env.spec.ts` |
| (g) | **seed** — `apps/api/prisma/seed.ts` |
| (h) | **CLAUDE.md + README.md** — which sections and which individual bullets get pruned |
| (i) | **npm deps** — what actually becomes unused, verified by grepping for other consumers |
| (j) | **migration SQL** — what `prisma migrate diff` regenerates vs. hand-written SQL to preserve verbatim |
| (k) | **dependencies on other features** — with code evidence |

**Four rules the generator must obey everywhere.** They come up in almost every dossier, so they
are stated once here:

1. **Both locale files or neither.** `apps/web/messages/pt-BR.json` and `en-US.json` are 575 lines
   each and **line-for-line aligned** (top-level namespaces start at identical line numbers in
   both: 2, 20, 28, 129, 155, 226, 294, 311, 326, 332, 340, 355, 363, 381, 399, 564). A key removed
   from one and not the other fails `apps/web/src/i18n/messages.test.ts:18-25`, which names the
   orphan keys. This is a *good* failure — it cannot be got wrong silently — but it must be
   respected.
2. **The `@SystemScope()` allowlist test is computed, not copied.**
   `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts:48-73` asserts an exact array of
   `file:count` strings. Every feature that owns a `@SystemScope()` route changes it. Emitting the
   repo's literal array into a pruned project gives a red suite on a fresh clone — which trains the
   user to edit the assertion, destroying the guard. Current values:
   `'modules/auth/auth.controller.ts:8'` (signup, verify-email, resend-verification, login,
   2fa/verify, refresh, forgot-password, reset-password),
   `'modules/auth/oauth/oauth.controller.ts:1'` (complete-signup),
   `'modules/invitations/public-invitations.controller.ts:2'` (preview + accept).
3. **Coverage thresholds are absolute floors pinned at achieved numbers.**
   `apps/api/jest.config.js:47-54` (97/92/**100**/97 — note `functions: 100`) and
   `apps/web/vitest.config.mts:47-52` (99/88/95/99). Deleting well-covered code moves the
   *remaining* aggregate and can fail CI for reasons that look unrelated to the removal. The
   generator must re-measure, or emit slightly lower floors, on every removal. `vitest.config.mts`
   also has a per-feature `include` list (lines 24-35) whose entries must be deleted with their
   directories.
4. **Never emit a `CREATE TABLE` after the RLS sweep.** `SELECT app.apply_tenant_rls();` must be
   the last DDL in the baseline. A table created after it gets no policy, no
   `FORCE ROW LEVEL SECURITY`, and — because of `ALTER DEFAULT PRIVILEGES` — full DML for the app
   role: a working application with one silently unisolated table. See **A2 · Migration baseline**.

---

## 1 · Repo facts the generator needs

**Monorepo** — Turborepo + pnpm, workspaces `apps/*` and `packages/*`.
`apps/api` (NestJS 12 + Fastify 5 + Prisma 7), `apps/web` (Next 16 App Router),
`packages/shared` (Zod contracts, the contract boundary), `packages/config` (eslint/prettier/ts).

**Prisma** — a schema *folder* (`apps/api/prisma.config.ts:11` → `schema: 'prisma/schema'`) with
5 files, **15 models and 6 enums**:

| file | models | enums |
| --- | --- | --- |
| `prisma/schema/main.prisma` | — | — (generator + datasource only, 23 lines) |
| `prisma/schema/tenancy.prisma` | Plan, Tenant, TenantBranding, TenantParameter, User, Profile, Permission | TenantStatus, Role |
| `prisma/schema/auth.prisma` | RefreshToken, PasswordResetToken, EmailVerificationToken, TwoFactorBackupCode, LegalAcceptance, AuditLog | SessionEndReason, LegalDocumentKind |
| `prisma/schema/invitations.prisma` | Invitation | InvitationStatus |
| `prisma/schema/oauth.prisma` | OAuthAccount | OAuthProviderName |

**There is no file/upload model.** The `files` feature is storage adapters only and contributes
zero SQL.

**`apps/api/src/app.module.ts`** — the single biggest seam. 16 module entries at lines **106-121**
(`PrismaModule` 106, `TenancyModule` 107, `CacheModule` 108, `QueueModule` 109, `StorageModule` 110,
`MailModule` 111, `CaptchaModule` 112, `HealthModule` 113, `AuthModule` 114, `OAuthModule` 115,
`TenantsModule` 116, `UsersModule` 117, `FilesModule` 118, `AdminModule` 119, `InvitationsModule` 120,
`PlatformModule` 121) with their imports at 14-33, plus **six global guards** at 132-137
(`ThrottlerGuard`, `CaptchaGuard`, `JwtAuthGuard`, `TenantStatusGuard`, `TwoFactorGateGuard`,
`PermissionGuard`) and the order-rationale comment at 127-131 that must be reworded whenever one
of them goes.

**`apps/api/src/main.ts`** — two feature seams in the bootstrap: `oauth` owns the CSRF exemption and
the urlencoded body parser (lines 18, 82-91), `files` owns the multipart registration (14, 93-96).
Everything else is core.

**Full API route inventory, by owning feature** (controller → routes; decorators noted):

| controller | routes | feature |
| --- | --- | --- |
| `app.controller.ts` | `GET /` (`@Public` 9), `GET /teapot` 418 (16-25) | core + **easter-eggs** |
| `health/health.controller.ts` | `GET /health` (`@Public`) — probes `database`, `cache`, **`queue`** (24-28) | core + **queue** |
| `modules/auth/auth.controller.ts` | `POST signup` 55, `verify-email` 65, `resend-verification` 78, `login` 92, `2fa/verify` 113, `refresh` 130, `logout` 157, `forgot-password` 172, `reset-password` 189, `GET csrf` 202 — **8 × `@SystemScope()`**, 8 × `@SensitiveThrottle()`, **5 × `@RequireCaptcha`** (57, 80, 94, 174, 191) | auth core + **public-signup** + **2fa** + **captcha** |
| `modules/auth/oauth/oauth.controller.ts` | `GET providers` 66, `GET :provider/start` 77, `GET :provider/callback` 91, `POST :provider/callback` 111, `POST complete-signup` 146 (`@SystemScope()` 145) | **oauth** |
| `modules/users/users.controller.ts` | `GET me` 55, `GET me/security` 62, `PATCH me` 69, `me/password` 75, **`me/2fa/{setup,enable,snooze,disable}` 87-117**, `me/email/{change-request,change-verify}` 129/141, `GET me/sessions` 152, `DELETE me/sessions/:id` 158, `revoke-others` 170, `GET me/export` 181, `DELETE me` 187 | profile core + **2fa** + **audit** (export) |
| `modules/files/files.controller.ts` | `POST`/`DELETE users/me/avatar` (23, 27, 56) | **files** |
| `modules/tenants/tenants.controller.ts` | `GET/PATCH me` 29/35, `me/branding` 41/47, **`me/plan` 53**, **`me/plan-usage` 59** — `@RequirePermission('settings')` on the class (22) | tenancy + **plans** |
| `modules/admin/admin-users.controller.ts` | `GET /admin/users` 42, `PATCH :id/role` 48, `:id/lock` 59, `:id/unlock` 70, `DELETE :id` 81 — `@Roles('ADMIN')` 34 | admin core |
| `modules/admin/admin-profiles.controller.ts` | `GET /admin/profiles` 28 | admin core |
| `modules/invitations/invitations.controller.ts` | `POST /admin/invitations` 51, `GET` 62, `POST :id/resend` 68, `DELETE :id` 79 | **invitations** |
| `modules/invitations/public-invitations.controller.ts` | `GET /auth/invitations/:token` 49, `POST accept` 58 — **2 × `@SystemScope()`** | **invitations** |
| `modules/platform/platform.controller.ts` | `GET stats` 41, `GET tenants` 47, `GET tenants/:id` 53, `POST tenants` 64, `:id/suspend` 74, `:id/reactivate` 85, `:id/extend-trial` 95, `:id/plan` 106 | **platform** |
| `modules/platform/platform-plans.controller.ts` | `GET/POST /platform/plans` 14/20, `PATCH :id` 26 | **platform** + **plans** |

**Documentation** — `CLAUDE.md` is 587 lines, `README.md` 625 (bilingual PT then EN). CLAUDE.md
section starts: 11 TL;DR · 32 Estrutura · 48 Arquitetura (ports table rows at 55 Storage, 56 E-mail,
57 Cache, 58 Banco, 59 Captcha, 60 Jobs) · 69 Autenticação · 81 Multi-tenancy · 125 Permissões ·
140 Planos · 149 Fila de jobs · 191 Convites · 287 Login social · 376 Captcha · 412 Rate limit ·
462 Comandos · 479 Convenções · 488 Política de dependências · 517 Testes · 543 Docker · 549 Humor ·
558 O que NÃO fazer (to 587). **Per-bullet ownership of "O que NÃO fazer"** (the generated CLAUDE.md
must not warn about features that were not installed):

| lines | bullet | owner |
| --- | --- | --- |
| 560 | segredos em log / humour in internals | core (+ **easter-eggs**, 2nd sentence) |
| 561-563 | BFF, contract duplication, `.env` | core |
| 564-566 | `TRUST_PROXY`, `@SensitiveThrottle()` | rate-limit (core) |
| 567 | `CAPTCHA_SECRET_KEY`, half-enabled captcha | **captcha** |
| 568-570 | OAuth both sides + `PUBLIC_SIGNUP_ENABLED` both sides | **oauth** + **public-signup** |
| 571-572 | never key a social identity on e-mail | **oauth** |
| 573-574 | no "this account uses social login" oracle | **oauth** |
| 575-576 | invitation mail after commit, not inside the tx | **invitations** |
| 577-578 | never set someone else's password | **invitations** |
| 579 | `DATABASE_URL` must not be the DB owner | **multi-tenancy** (never remove) |
| 580-581 | OAuth callback must check `twoFactorEnabled` | **oauth** × **2fa** |
| 582 | `@SystemScope()` discipline, no client `tenantId` | **multi-tenancy** |
| 583 | `this.prisma.db`, never `this.prisma.<model>` | **multi-tenancy** |
| 584-585 | no `systemWide: true` to "make it work" | **queue** |
| 586 | never ship `QUEUE_DRIVER=memory` | **queue** |
| 587 | do not `git commit`/`push` unasked | project rule (author's own) |

**Migrations** — 6 directories, 668 SQL lines. `20260613074545_init` (134), `20260613122947_two_factor_remind_at` (2),
`20260911105130_tenancy` (228), `20260911105200_row_level_security` (143), `20260911105300_app_role` (51),
`20260912120000_invitations_and_oauth` (110), plus `migration_lock.toml`. **All hand-written SQL lives
in exactly two files** (`_row_level_security`, `_app_role`) plus two statements in
`_invitations_and_oauth`; the other three files are pure Prisma-generated DDL. Full statement-level
classification in **A2 · Migration baseline**.

**Docker** — `docker-compose.yml` (postgres 2-18, redis 20-33, minio 35-52, minio-setup 54-67,
mailpit 69-79, volumes 81-84), `docker-compose.dev.yml` (adds api/web/worker containers),
`Dockerfile.api` / `Dockerfile.web` / `Dockerfile.dev`. Ports are fixed 42xx literals.

---

## 2 · Feature manifest and verdicts

| # | feature | verdict | one-line reason |
| --- | --- | --- | --- |
| F1 | **oauth** (Google/Apple/GitHub) | REMOVAL WITH SEAMS | self-contained module tree, but owns a global CSRF exemption + body parser in `main.ts`, the `passwordHash` nullability, and the 2FA ticket cookie |
| F2 | **invitations** | REMOVAL WITH SEAMS (the hardest of the "clean" ones) | `platform` cannot create a usable company without it, and `PlanLimitsService.assertCanAddUser` loses **both** of its call sites |
| F3 | **2fa** (TOTP + backup codes) | REMOVAL WITH SEAMS | ~45 seams across login, users, oauth, admin, guards; a globally-registered guard; one array entry in hand-written RLS SQL |
| F4 | **files** (upload + storage) | CLEAN REMOVAL at "s3 adapter only"; REMOVAL WITH SEAMS for the whole feature | ~20 small seams, all bounded; contributes no table, no policy, no grant |
| F5 | **platform** (SUPERADMIN panel) | REMOVAL WITH SEAMS | 16 API + 22 web files delete whole, but `Role.SUPERADMIN` and the `platform` RLS scope thread through 9 surviving files |
| F6 | **audit** | **DO NOT REMOVE IN V1** (as the `AuditLog` model) | `auditLog.create` lives in 5 independent services with ~30 call sites, and the LGPD data export *returns* audit rows |
| F7 | **plans** | REMOVAL WITH SEAMS | `Plan` separates cleanly, but `TenantStatus`/`status`/`trialEndsAt` are **not** plan-owned — `TenantStatusGuard` reads them on every request |
| F8 | **i18n** | single-language: REMOVAL WITH SEAMS · no-i18n-at-all: **DO NOT REMOVE IN V1** | 50 non-test files call `useTranslations`/`getTranslations`, plus a second hand-rolled bilingual system in the API |
| F9 | **multi-tenancy** | **NOT REMOVABLE — offer single-tenant mode instead** (decision already taken; this dossier maps the mode) | feasible and cheap: a seed + UI-visibility + one flag change, with zero lines of isolation machinery moved |
| F10 | **queue / worker** | REMOVAL WITH SEAMS | "port + memory driver" is the sane option; dropping the abstraction touches 3 services' constructors and loses `tokens.purge-expired` |
| F11 | **captcha** | **CLEAN REMOVAL** | textbook port/adapter: 13 exclusive files, one guard, one decorator, 5 call sites, zero SQL, zero Prisma, zero npm deps |
| F12 | **public-signup** | REMOVAL WITH SEAMS | already env-gated, but `auth.e2e-spec.ts` births *every* account through `POST /auth/signup` |
| F13 | **easter-eggs** | CLEAN REMOVAL for the enumerated eggs; **DO NOT REMOVE IN V1** for the brand voice | 3 exclusive files + 12 seams; but the joke is woven into the docs' *explanations*, and `marvin` rides the global error envelope |

Also mapped, as appendices: **A1** the web shell inventory (every nav entry, route, i18n namespace
and proxy special-case, with its owning feature), **A2** the migration baseline, **A3** dead code
and unused dependencies discovered along the way.

---

## 3 · The non-removable spine

Everything below is emitted in every configuration. It is listed so the generator has a positive
definition of "core" and does not treat a core file as a feature seam.

**API**

- Bootstrap: `src/main.ts` (minus the two feature seams), `src/load-env.ts`, `src/instrument.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/app.service.ts`.
- Config: `src/config/env.ts` + spec — the Zod env schema, `parseTrustProxy`, `validateEnv`.
- Tenancy: all of `src/infra/tenancy/**` and `src/infra/prisma/**`. See **F9**; not negotiable.
- Auth core: `src/modules/auth/{auth.controller,auth.module}.ts`, `services/{auth,token,profile-permissions}.service.ts`, `guards/{jwt-auth,permission,roles,tenant-status}.guard.ts`, `support/{cookies,crypto.util,email-templates,tenant-access,user.mapper}.ts`.
- Users/profile: `src/modules/users/**` (minus 2FA), `src/modules/admin/**`.
- Tenancy module: `src/modules/tenants/**` (minus `plan-limits.service.ts`), incl. `support/tenant-provisioning.ts` — shared by signup, the platform panel, oauth completion **and** the seed; extracted precisely so the doors cannot diverge.
- Cross-cutting: `src/common/{decorators,filters,crud,sequence}/**`, `src/core/{cache,mail}/**`, `src/infra/{cache,mail,throttler}/**`, `src/health/**`.
- Rate limit + client IP: the throttler wiring in `app.module.ts:67-105`, `@SensitiveThrottle()`, `parseTrustProxy`, and the BFF's IP sanitisation (`apps/web/src/app/api/[...path]/route.ts:22-71`). This is a deployment decision, not a feature — see CLAUDE.md 412-458.
- Tests: `test/{e2e-app,e2e-client,e2e-setup,e2e-sequencer.js,global-setup,setup,factories,prisma-mock}.ts`, `test/jest-e2e.json`, `test/{auth,security,tenant-isolation,table-store}.e2e-spec.ts`.

**Web**

- `src/app/layout.tsx`, `globals.css`, `not-found.tsx`, `error.tsx`, `global-error.tsx`, `api/[...path]/route.ts`, `proxy.ts`, `(auth)/layout.tsx`, `(auth)/{login,forgot-password,reset-password,verify-email}`, `(dashboard)/{layout,loading,page}.tsx`, `(dashboard)/{admin,profile}/page.tsx`, `{termos,privacidade}/page.tsx`.
- `src/components/{ui/**,brand,auth-shell,providers,session-ended-dialog,theme-toggle,user-menu,app-sidebar,legal/**,tenant/**}`.
- `src/hooks/use-auth.tsx`, `src/lib/{api,utils,form-resolver,paginate,safe-path,masks}.ts`.

**Shared** — `packages/shared/src/{index,common,primitives,user,auth,tenant,permissions,legal}.ts`.
Only `invitation.ts` and `oauth.ts` are whole-file feature deletions; everything else is edited in
place, and `index.ts` (lines 6-14) is star-exports only, so it changes **only** for those two.

**Infra** — Postgres and Mailpit in `docker-compose.yml` always; Redis unless both
`CACHE_DRIVER=memory` and no bullmq (see **F10**(k)); MinIO only with the S3 storage adapter.

---


## Feature dossiers

One section per feature, keyed (a)–(k) as described in §0.

---

## F1 · oauth — social login (Google · Apple · GitHub)

### (a) EXCLUSIVE FILES — delete whole

Port + adapters (`apps/api/src/core/oauth`, `apps/api/src/infra/oauth`) — whole directories:

| File | lines | note |
| --- | --- | --- |
| `apps/api/src/core/oauth/oauth.provider.ts` | 91 | `OAUTH_REGISTRY` token, `OAuthAdapter`, `OAuthIdentity`, `OAuthExchangeError` |
| `apps/api/src/infra/oauth/oauth.module.ts` | 74 | `@Global() OAuthAdaptersModule`, builds registry from `OAUTH_PROVIDERS` |
| `apps/api/src/infra/oauth/apple.adapter.ts` | 187 | uses only `node:crypto` (`createPrivateKey`, `createSign`) — see (i) |
| `apps/api/src/infra/oauth/apple.adapter.spec.ts` | 179 | |
| `apps/api/src/infra/oauth/google.adapter.ts` | 88 | |
| `apps/api/src/infra/oauth/google.adapter.spec.ts` | 190 | |
| `apps/api/src/infra/oauth/github.adapter.ts` | 143 | |
| `apps/api/src/infra/oauth/github.adapter.spec.ts` | 160 | |
| `apps/api/src/infra/oauth/id-token.ts` | 108 | `decodeIdToken`, `claimString`, `claimIsTrue` — only importers are the 3 adapters |
| `apps/api/src/infra/oauth/oauth-http.ts` | 55 | `postForm`, `getJson` — only importers are the 3 adapters |
| `apps/api/src/infra/oauth/callback-url.ts` | 45 | `oauthCallbackUri` (infra/oauth/oauth.module.ts:6), `oauthCookiePath` (oauth.service.ts:33) |

Feature module (`apps/api/src/modules/auth/oauth`) — whole directory:

| File | lines |
| --- | --- |
| `apps/api/src/modules/auth/oauth/oauth.module.ts` | 22 |
| `apps/api/src/modules/auth/oauth/oauth.controller.ts` | 157 |
| `apps/api/src/modules/auth/oauth/oauth.service.ts` | 693 |
| `apps/api/src/modules/auth/oauth/oauth.service.spec.ts` | 764 |
| `apps/api/src/modules/auth/oauth/oauth.dto.ts` | 12 |
| `apps/api/src/modules/auth/oauth/oauth-state.ts` | 87 |
| `apps/api/src/modules/auth/oauth/oauth-state.spec.ts` | 108 |
| `apps/api/src/modules/auth/oauth/oauth-form-post.ts` | 62 — **imported by `main.ts:18`**, see (b) |

Prisma + contracts:

- `apps/api/prisma/schema/oauth.prisma` (50 lines) — whole file.
- `packages/shared/src/oauth.ts` (112 lines) — whole file.

Web:

| File | lines | note |
| --- | --- | --- |
| `apps/web/src/components/oauth-buttons.tsx` | 106 | |
| `apps/web/src/components/oauth-buttons.test.tsx` | ~90 | |
| `apps/web/src/app/(auth)/signup/complete/page.tsx` | 234 | the "finish your registration" screen; the whole `signup/complete/` dir goes |
| `apps/web/src/lib/auth-config.test.ts` | 100 | **partially** exclusive — see the caveat below |

No `*.stories.tsx` exists for any oauth file (verified: `find apps/web/src -name '*.stories.tsx'`
returns only ui/, brand, flags, language-switcher, theme-toggle).
There is **no** `oauth.e2e-spec.ts`: `apps/api/test/` holds only `auth`, `invitations`,
`security`, `table-store`, `tenant-isolation` e2e specs.

**Caveats — files that become dead but are not obviously "oauth files":**

1. `apps/web/src/lib/auth-config.ts` (88 lines) is **shared** with public-signup: lines 1,
   46–88 are oauth (`parseOAuthProviders`, `enabledOAuthProviders`, `oauthEnabled`,
   `oauthStartUrl`); lines 26–44 (`readFlag`, `signupEnabled`) belong to public-signup.
   Delete the oauth half only; the file survives if public-signup survives.
   `auth-config.test.ts` lines 50–98 are the oauth half (lines 1–49 test `signupEnabled`).
2. `apps/web/src/lib/cookies.ts` (45 lines) + `apps/web/src/lib/cookies.test.ts` (82 lines)
   have **exactly one** production consumer: the OAuth→2FA handoff in
   `apps/web/src/app/(auth)/login/page.tsx:23,104,105`. With oauth gone they are dead code
   that still sits inside the vitest coverage `include` glob `src/lib/**/*.ts`
   (`apps/web/vitest.config.mts:33`), so the generator **must delete both** or the
   `statements: 99 / functions: 95` thresholds (vitest.config.mts:47-52) start failing.

### (b) SHARED SEAMS — oauth

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 23 | `import { OAuthModule } from './modules/auth/oauth/oauth.module';` |
| `apps/api/src/app.module.ts` | 115 | `OAuthModule,` in the `imports` array |
| `apps/api/src/main.ts` | 18 | `import { registerOAuthFormPostParser, skipsCsrf } from './modules/auth/oauth/oauth-form-post';` |
| `apps/api/src/main.ts` | 82–86 | the Apple CSRF exemption inside the `preHandler` hook: the 4 comment lines plus `if (skipsCsrf(m, req.url)) return done();`. **Remove the `if`, keep lines 79-81 and 87** (`return csrfProtection.call(...)`). |
| `apps/api/src/main.ts` | 90–91 | `// Apple's form_post body…` + `registerOAuthFormPostParser(fastify);` — delete both. Effect: Fastify goes back to answering 415 for `application/x-www-form-urlencoded` everywhere, which is the pre-oauth behaviour. |
| `apps/api/src/modules/auth/auth.module.ts` | 57–60 | the comment "Exported for the OAuth module…" and `AuthService,` in `exports`. `AuthService` has **no importer outside `modules/auth/`** (verified by grep) → drop it from `exports` and keep it in `providers`. |
| `apps/api/src/modules/auth/services/auth.service.ts` | 330–340 | doc-comment on `createLoginTicket` explaining "Public because password login is no longer the only way…"; rewrite. The method itself (341–345) stays — `login()` calls it at line 266. It may go back to `private`. |
| `apps/api/src/modules/auth/services/auth.service.ts` | 653 | `static readonly LOGIN_TICKET_TTL = LOGIN_TICKET_TTL;` — exists **solely** for `oauth.service.ts:651`. Delete. |
| `apps/api/src/modules/auth/services/auth.service.ts` | 236–249 | comment lines 239–242 ("`verifyPassword` also covers the account with no password at all…") describe the social-only case. The `verifyPassword(user.passwordHash, …)` call at 245 stays either way — see (c). |
| `apps/api/src/modules/auth/support/crypto.util.ts` | 26–38, 40–62 | `ABSENT_PASSWORD_HASH` and the whole null-tolerant branch of `verifyPassword` exist because of oauth. See (c) for whether to keep. `crypto.util.spec.ts:80-90,104-110` are the tests for the null case. |
| `apps/api/src/modules/auth/services/signup.service.ts` | 77–78 | comment "Same helper the platform panel and the OAuth completion use" → becomes "…the platform panel uses". |
| `apps/api/src/modules/auth/support/user.mapper.ts` | — | **NO CHANGE.** Verified in full (21 lines): it maps `id,email,name,avatarUrl,role,emailVerified,twoFactorEnabled,createdAt,updatedAt` and touches nothing oauth-related. |
| `apps/api/src/modules/admin/*` | — | **NO CHANGE for oauth.** grep for `oauth` in `modules/admin/` returns zero hits. |
| `apps/api/src/modules/platform/*` | — | **NO CHANGE for oauth.** Zero `oauth` hits under `modules/platform/`. |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 4–19 | doc-comment only: "three unrelated doors now lead here — public signup, the operator creating a company…, and an unknown social identity finishing its registration". Becomes two doors. No code change. |
| `apps/api/src/modules/tenants/support/tenant-provisioning.spec.ts` | 84 | comment "…the OAuth completion must all produce the same company" — reword. |
| `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` | 56–61 | the comment block and the array entry `'modules/auth/oauth/oauth.controller.ts:1',`. **New expected list becomes exactly:** `['modules/auth/auth.controller.ts:8', 'modules/invitations/public-invitations.controller.ts:2']` (or just `['modules/auth/auth.controller.ts:8']` if invitations is also off). |
| `apps/api/test/e2e-app.ts` | 194–201 | `"oauth_accounts"` removed from the `TRUNCATE TABLE` list at line 200; comment at 194–198 mentions both new tables. |
| `apps/api/test/factories.ts` | 9 | **NO CHANGE needed.** `passwordHash: '$argon2id$…'` is a plain string and the object is cast `as User` (line 22), so it compiles whether the column is nullable or not. |
| `apps/api/test/prisma-mock.ts` | — | **NO CHANGE.** It is a generic delegate bag (`[delegate: string]: any`); it has no `oAuthAccount` entry (that mock is declared locally in `oauth.service.spec.ts:114`). |
| `apps/web/src/proxy.ts` | — | **NO CHANGE for oauth.** No oauth path in `PRE_AUTH_PREFIXES` (9–21) or `OPEN_PREFIXES` (29). Note `/signup` at line 11 already covers `/signup/complete` via the `startsWith` prefix match at line 32. |
| `apps/web/src/proxy.test.ts` | — | no oauth assertions. |
| `apps/web/src/app/api/[...path]/route.ts` | — | **NO CHANGE.** No per-path allowlist, no oauth special case. It is `redirect: 'manual'` (line 88) and relays every `Set-Cookie` (line 104) and the 302 status verbatim (108–111) — which is *why* the oauth redirect flow works through it without a special case. Same for the `/invite` GET. |
| `apps/web/src/lib/auth-config.ts` | 1, 13–16, 46–88 | see (a) caveat 1 |
| `apps/web/src/components/auth-shell.tsx` | 9–11 | comment only: mentions `/invite/…`. **No oauth reference at all** → NO CHANGE for oauth. |
| `apps/web/src/app/(auth)/login/page.tsx` | 11–17 | drop `TWO_FACTOR_TICKET_COOKIE` and `oauthErrorCodeSchema` from the `@dontpanic/shared` import |
| `apps/web/src/app/(auth)/login/page.tsx` | 23 | `import { clearCookie, readCookie } from '@/lib/cookies';` |
| `apps/web/src/app/(auth)/login/page.tsx` | 25 | `import { OAuthButtons } from '@/components/oauth-buttons';` |
| `apps/web/src/app/(auth)/login/page.tsx` | 47 | `const tOauth = useTranslations('auth.oauth.errors');` |
| `apps/web/src/app/(auth)/login/page.tsx` | 61–85 | the whole `?error=<code>` reader (`oauthErrorHandled` ref + `useEffect`) |
| `apps/web/src/app/(auth)/login/page.tsx` | 87–118 | the whole `?twofactor=1` cookie handoff (`twoFactorHandoffHandled` ref + `useEffect`). **Keep** `ticket`/`code`/`verifying` state (57–59) — the password 2FA step still uses them. |
| `apps/web/src/app/(auth)/login/page.tsx` | 297–299 | `<OAuthButtons intent="login" … />` and its 2-line comment |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 66 (`oauth:` message stub), 285–302 (button test), 339–392 (the four `TICKET_COOKIE` / oauth-handoff tests) | remove |
| `apps/web/src/app/(auth)/signup/page.tsx` | 18, 248 | `import { OAuthButtons }` and `<OAuthButtons intent="signup" className="w-full" />` |
| `apps/web/src/app/(auth)/signup/signup.test.tsx` | 53, 113, 121, 125 | the `oauth:` message stub and the `NEXT_PUBLIC_OAUTH_PROVIDERS` button test |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | — | **NO CHANGE for oauth** (zero oauth hits). |
| `apps/web/vitest.config.mts` | 33 | `src/lib/**/*.ts` — see (a) caveat 2; `cookies.ts` must be deleted or the thresholds break |

### (c) PRISMA — oauth

**Deleted whole:** `apps/api/prisma/schema/oauth.prisma` lines 1–50, i.e.

- `enum OAuthProviderName { GOOGLE APPLE GITHUB }` — lines 5–9
- `model OAuthAccount { … }` — lines 11–49, with fields
  `id` (12), `tenantId` (21) + `tenant` relation (22), `userId` (24) + `user` relation (25),
  `provider` (27), `providerAccountId` (31), `email` (35), `createdAt` (37), `updatedAt` (38),
  and the constraints `@@unique([provider, providerAccountId])` (43),
  `@@unique([userId, provider])` (46), `@@index([userId])` (47), `@@index([tenantId])` (48),
  `@@map("oauth_accounts")` (49).

**Back-relations to remove from `apps/api/prisma/schema/tenancy.prisma`:**

- line 94 — `oauthAccounts    OAuthAccount[]` on `model Tenant`
- line 187 — `oauthAccounts       OAuthAccount[]` on `model User`

Both are plain list back-relations; nothing reads them (grep for `oauthAccounts` finds only
the two schema lines). Removing them is mandatory: Prisma refuses to validate a relation
field whose target model no longer exists.

**`OAuthAccount.tenantId` denormalisation (oauth.prisma:14–22):** it exists only so
`app.apply_tenant_rls()` (row_level_security migration, lines 51–89) finds the table by the
`tenantId` column name (`a.attname = 'tenantId'`, line 63). It is written from
`user.tenantId` and never from the request (`oauth.service.ts:324-326`). With the whole
model gone the question is moot — there is nothing to denormalise into. **No generator
decision needed.**

#### Is `User.passwordHash` nullable ONLY because of oauth?

**Yes.** Evidence:

- Schema comment, `apps/api/prisma/schema/tenancy.prisma:158–163`: *"Null for an account that
  only signs in through a provider. Password login on such an account fails with the ordinary
  invalid-credentials error … `forgot-password` still works and is the supported way to add a
  password later."* Field declaration at line 163: `passwordHash        String?`
- Migration `20260912120000_invitations_and_oauth/migration.sql:16–24` ties the change to
  social sign-in explicitly, and the original `20260613074545_init/migration.sql:8` had
  `"passwordHash" TEXT NOT NULL`.
- The **only** writer of `passwordHash: null` in the codebase is
  `apps/api/src/modules/auth/oauth/oauth.service.ts:474` (inside `completeSignup`). Every
  other creation path writes a real hash: `signup.service.ts:73,93`,
  `invitations.service.ts:491,529`, `seed.ts:19,46,92`, and the two anonymisation paths
  `admin-users.service.ts:141` and `users.service.ts:414,427` (both `argon2.hash(randomUUID())`).

**Should it become non-nullable if oauth is removed? — Yes, and the generator should do it,
because leaving it nullable silently weakens the login path.** What changes:

- `apps/api/prisma/schema/tenancy.prisma:158–163` → drop the 6-line comment, `passwordHash String`.
- Baseline SQL: `"passwordHash" TEXT NOT NULL` in the `users` CREATE TABLE, and **drop**
  `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;` (migration.sql:24).
- `apps/api/src/modules/auth/support/crypto.util.ts`: `ABSENT_PASSWORD_HASH` (line 38) and the
  `if (!passwordHash) { await argon2.verify(await ABSENT_PASSWORD_HASH, plain); return false; }`
  branch (57–60) become unreachable. Signature can narrow from
  `passwordHash: string | null | undefined` (54) to `string`.
- `crypto.util.spec.ts:80-90` ("no credential to check") and `:104-110` (constant-time
  timing test with `null`) must be deleted, **otherwise they fail to typecheck** once the
  parameter narrows.
- Callers that pass a possibly-null value: `auth.service.ts:245`, `users.service.ts:105,229,324`.
  With the column non-nullable, Prisma types them as `string`, so they keep compiling.

**What BREAKS if the generator leaves it nullable while removing oauth:** nothing fails to
compile — and that is the hazard. Three concrete consequences:

1. The `ABSENT_PASSWORD_HASH` timing-equalisation machinery stays in place with **no**
   account it can ever describe, i.e. 20 lines of security code nobody can test, whose
   coverage the `functions: 100` floor in `apps/api/jest.config.js:52` still demands.
2. Nothing in the remaining code ever writes `null`, but nothing *stops* a future feature
   from writing it, and `verifyPassword(null, …)` returning `false` means such an account
   simply cannot log in and cannot be told why — a bug class the NOT NULL constraint would
   have caught at insert time.
3. `users.service.ts:229` (disable-2FA by password) and `:324` keep their `|| password.length > 0`
   defensive arms justified by a case that no longer exists.

### (d) `packages/shared` — oauth

**Whole file out:** `packages/shared/src/oauth.ts` (1–112):

| symbol | line |
| --- | --- |
| `oauthProviders` / `oauthProviderSchema` / `OAuthProvider` | 27–29 |
| `oauthErrorCodes` / `oauthErrorCodeSchema` / `OAuthErrorCode` | 50–59 |
| `oauthProvidersResponseSchema` / `OAuthProvidersResponse` | 62–67 |
| `oauthPendingRegistrationSchema` / `OAuthPendingRegistration` | 77–82 |
| `completeOAuthSignupSchema` / `CompleteOAuthSignupInput` | 89–98 |
| `completeOAuthSignupResponseSchema` / `CompleteOAuthSignupResponse` | 100–104 |
| `oauthAccountDtoSchema` / `OAuthAccountDto` | 107–112 — **already dead**: grep finds zero consumers anywhere (the "security section of the profile page" it is documented for was never built) |

**Cookie-name constants:**

- `packages/shared/src/auth.ts:155` — `export const TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket';`
  plus its doc-block at 141–154. Consumers: `oauth.service.ts:17,240`,
  `oauth.service.spec.ts:8,724,759`, `web/src/app/(auth)/login/page.tsx:12,104,105`.
  Line 151–153 says outright *"Only social sign-in needs it"*. → **remove with oauth**.
  `web/src/lib/cookies.test.ts` hardcodes the literal `'dp_2fa_ticket'` (lines 23, 34, 63, 65, 66).
- There is **no oauth ticket cookie constant in shared**. The two oauth-only cookie names live
  in the API: `OAUTH_STATE_COOKIE = 'oauth_state'` (`modules/auth/oauth/oauth-state.ts:4`) and
  `OAUTH_STATE_TTL_SECONDS = 600` (same file, line 12). The registration ticket is *not* a
  cookie — it is a `?ticket=` query param (`oauth.service.ts:420`) backed by a Redis key
  `oauth:pending:<sha256>` (`oauth.service.ts:603-605`).

**`packages/shared/src/index.ts`:** line 12 `export * from './oauth';` → deleted. The other
13 export lines are unchanged.

### (e) WEB — oauth

**Routes deleted:** `apps/web/src/app/(auth)/signup/complete/` (one file, `page.tsx`, 234
lines). No other App Router route is oauth-only — the oauth entry points are API routes
reached through the BFF (`/api/auth/oauth/:provider/start`, built by
`auth-config.ts:86-88`), not Next pages.

**Nav/menu entries:** none. `apps/web/src/components/app-sidebar.tsx` has no oauth entry
(its only conditional entry is `/admin`, line 30). The oauth "menu" is the two
`<OAuthButtons>` call sites: `login/page.tsx:299` and `signup/page.tsx:248`.

**BFF proxy:** no per-path allowlist or special case for oauth. See (b) — `route.ts` is fully
generic; `redirect: 'manual'` (line 88) + verbatim `Set-Cookie` relay (line 104) is what makes
the 302 flow and the `oauth_state` cookie work without one. `src/proxy.ts` needs no change
(`/signup` at line 11 already prefix-matches `/signup/complete`).

**i18n — namespaces/keys out of `apps/web/messages/{pt-BR,en-US}.json`** (identical line
numbers in both files; both are key-parity-tested by `apps/web/src/i18n/messages.test.ts:18-25`):

| key path | lines (both files) |
| --- | --- |
| `auth.oauth` (whole sub-namespace: `separator`, `continueWith`, `provider.{google,apple,github}`, `errors.{failed,unverified_email,no_account,signup_disabled,account_conflict,provider_disabled}`) | 99–115 |
| `auth.completeSignup` (whole sub-namespace: `title`, `subtitle`, `identityNotice`, `taxId`, `companyPhone`, `personLegend`, `termsLink`, `privacyLink`, `submit`, `ticketExpired`) | 116–127 |

No top-level namespace disappears (`auth` survives). Nothing under `admin`, `platform`,
`invite`, `nav` or `errors` is oauth-related.

### (f) ENV — oauth

**`.env.example`** — delete lines **177–226** (the whole `# Social sign-in (OAuth)` block,
header rule included) and line **283–284** (`# Mirrors OAUTH_PROVIDERS…` +
`NEXT_PUBLIC_OAUTH_PROVIDERS=`). Individual variables inside 177–226:
`OAUTH_PROVIDERS` (191), `OAUTH_CALLBACK_BASE_URL` (197), `OAUTH_GOOGLE_CLIENT_ID` (202),
`OAUTH_GOOGLE_CLIENT_SECRET` (203), `OAUTH_APPLE_CLIENT_ID` (214), `OAUTH_APPLE_TEAM_ID` (215),
`OAUTH_APPLE_KEY_ID` (216), `OAUTH_APPLE_PRIVATE_KEY` (219), `OAUTH_GITHUB_CLIENT_ID` (225),
`OAUTH_GITHUB_CLIENT_SECRET` (226). Keep line 275–282 (the "public halves" header and
`NEXT_PUBLIC_SIGNUP_ENABLED`) but drop the words about `OAUTH_PROVIDERS` from the prose at
278–279 if public-signup stays.

**`apps/api/src/config/env.ts`:**

| lines | what |
| --- | --- |
| 132–157 | the whole `// --- social sign-in ---` block of the Zod schema: `OAUTH_PROVIDERS` (140), `OAUTH_CALLBACK_BASE_URL` (143), `OAUTH_GOOGLE_CLIENT_ID/_SECRET` (145–146), `OAUTH_APPLE_CLIENT_ID/_TEAM_ID/_KEY_ID/_PRIVATE_KEY` (149–154), `OAUTH_GITHUB_CLIENT_ID/_SECRET` (156–157) |
| 171–183 | `OAUTH_PROVIDER_NAMES` (172), `type OAuthProviderName` (173), `export function parseOAuthProviders` (175–183) |
| 185–201 | the `OAUTH_REQUIRED_KEYS` doc-block and table |
| 249–282 | the three `oauthProblems` checks inside `validateEnv`, in full |

Detail of the three checks in `validateEnv` (all of 249–282 goes; `validateEnv` keeps
235–247 — the Zod parse and the captcha check — and `return parsed.data;` at 284):

1. **Missing credential per enabled provider** — 252–260: `const enabled = parseOAuthProviders(…)`,
   then the nested `for` over `OAUTH_REQUIRED_KEYS[provider]` pushing
   `` `  - ${key}: required when OAUTH_PROVIDERS includes "${provider}"` ``.
2. **Callback base URL required once any provider is on** — 261–265:
   `if (enabled.length > 0 && !parsed.data.OAUTH_CALLBACK_BASE_URL)`.
3. **Unknown provider name** — 266–277: re-splits `OAUTH_PROVIDERS`, filters names not in
   `OAUTH_PROVIDER_NAMES`, pushes `` `  - OAUTH_PROVIDERS: unknown provider "${name}" (known: …)` ``.
4. The throw that consumes them — 278–282.

**`apps/api/src/config/env.spec.ts`** — delete:

- line 1 — `parseOAuthProviders` from the import (`import { parseOAuthProviders, parseTrustProxy, validateEnv } from './env';` → keep the other two)
- lines **139–203** — the whole `describe('oauth')` block:
  - 140–145 the `google` fixture
  - 147–151 `'is off by default, so a fresh clone boots with no third-party keys'`
  - 153–155 `'accepts a fully configured provider'`
  - 160–164 `'refuses a listed provider with a missing credential'`
  - 166–175 `"names every one of Apple's four required keys"`
  - 177–180 `'requires a callback base URL once any provider is on'`
  - 184–187 `'rejects a name that is not a provider'`
  - 189–202 the nested `describe('parseOAuthProviders')` — three cases at 190–192, 194–197, 199–201

`describe('invitations')` at 126–137 and `describe('parseTrustProxy')` at 205+ are untouched by oauth.

### (g) SEED — oauth

**No change.** `apps/api/prisma/seed.ts` (113 lines) contains zero `oauth` references
(verified by grep). It creates plan (22–34), SUPERADMIN (40–50), tenant (53–63), system
profiles (67–80) and the company admin (86–98), all with a real `passwordHash` (line 19).
If `passwordHash` becomes non-nullable, seed.ts is already compliant.

### (h) CLAUDE.md + README.md — oauth

**CLAUDE.md:**

| heading | lines | action |
| --- | --- | --- |
| `## Login social — decisão de deploy opcional` | **287–374** (through the `---` at 374) | delete whole section |
| `## Autenticação (resumo)` | **75–77** (the bullet "Quem entra e por onde…") | rewrite: drop "**login social** (opcional, por provider)" and the closing clause "`passwordHash` é nullable por causa do social" (line 77) |
| `## Arquitetura` table | — | no oauth row (oauth is not an env-swapped port) |
| `## O que NÃO fazer` | **568–570** ("Não ligar OAuth só de um lado…" — keep the `PUBLIC_SIGNUP_ENABLED` half if public-signup stays) | trim |
| `## O que NÃO fazer` | **571–572** ("Não vincular conta social por e-mail que o provedor não verificou…") | delete |
| `## O que NÃO fazer` | **573–574** ("Não dizer 'esta conta usa login social' num erro de login…") | delete |
| `## O que NÃO fazer` | **580–581** ("Não emitir sessão num callback de OAuth sem checar `twoFactorEnabled`…") | delete |
| `## Convenções` | 482 | keep (`passwordHash` must still never be returned) |

**README.md** (bilingual, PT then EN):

| section | lines | action |
| --- | --- | --- |
| `### O que já vem pronto` | 74 | delete the `**Login social**` bullet |
| `### Autenticação e controle de acesso` | 189–193 | drop the `Login social` row from the three-door table (line 193); the table becomes two rows |
| same | 201–205 | delete the `**Login social**` paragraph |
| same | 207–212 | trim the `[!WARNING]` block: remove lines 209–212 about `OAUTH_PROVIDERS` / `NEXT_PUBLIC_OAUTH_PROVIDERS` / `OAUTH_CALLBACK_BASE_URL` / "A API recusa subir se um provider listado estiver sem credencial" |
| `### What comes built in` | 369 | delete the `**Social sign-in**` bullet |
| `### Authentication and access control` | 486–490 | drop the `Social sign-in` row (line 490) |
| same | 499–504 | delete the `**Social sign-in**` paragraph |
| same | 506–511 | trim lines 508–511 of the `[!WARNING]` |

### (i) NPM DEPS — oauth

**None become unused.** Concretely:

- `apps/api/package.json` has **no** `jose` and **no** `jsonwebtoken` dependency (grep for
  both across all four package.json files: zero hits). The Apple ES256 client-secret JWT is
  minted with the Node stdlib: `apps/api/src/infra/oauth/apple.adapter.ts:1` —
  `import { createPrivateKey, createSign } from 'node:crypto';`. The id_token is decoded (not
  cryptographically verified — it comes over TLS from the token endpoint) by hand in
  `apps/api/src/infra/oauth/id-token.ts`, which imports only `OAuthExchangeError` (line 1).
- HTTP calls use global `fetch` (`apps/api/src/infra/oauth/oauth-http.ts` imports only
  `OAuthExchangeError`), so no `axios`/`undici`/`node-fetch` dependency.
- `@nestjs/jwt` (`apps/api/package.json` dependencies) is the **session** JWT and is used by
  `TokenService` via `JwtModule.register({})` (`auth.module.ts:33`) — **keep it**.
- Web side: `oauth-buttons.tsx` imports only `react`, `next-intl`, `lucide-react` (`Apple`,
  `GitBranch` icons) and the local `Button` — all already used elsewhere.

### (j) MIGRATION SQL — oauth

Source: `apps/api/prisma/migrations/20260912120000_invitations_and_oauth/migration.sql`.
The six migrations are `20260613074545_init`, `20260613122947_two_factor_remind_at`,
`20260911105130_tenancy`, `20260911105200_row_level_security`, `20260911105300_app_role`,
`20260912120000_invitations_and_oauth`.

**Regenerated automatically by `prisma migrate diff` from the schema** (drop these from the
oauth-off baseline; they reappear on their own if oauth is on):

- line 14 — `CREATE TYPE "OAuthProviderName" AS ENUM ('GOOGLE', 'APPLE', 'GITHUB');`
- lines 79–90 — `CREATE TABLE "oauth_accounts" (…)`
- lines 95–100 — the two unique indexes and two plain indexes (all four are expressible in
  Prisma via `@@unique` / `@@index`, so `diff` emits them):
  ```sql
  CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key"
    ON "oauth_accounts"("provider", "providerAccountId");
  CREATE UNIQUE INDEX "oauth_accounts_userId_provider_key"
    ON "oauth_accounts"("userId", "provider");
  CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");
  CREATE INDEX "oauth_accounts_tenantId_idx" ON "oauth_accounts"("tenantId");
  ```
- lines 102–105 — the two foreign keys (`onDelete: Cascade` on both, expressible in Prisma)
- line 24 — `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;` — in a single
  squashed baseline this collapses into the `users` CREATE TABLE column definition. With
  oauth off it must read `"passwordHash" TEXT NOT NULL` (as in
  `20260613074545_init/migration.sql:8`); with oauth on, `"passwordHash" TEXT` (nullable).

**HAND-WRITTEN — must be preserved verbatim in the baseline whenever ANY tenant-scoped table
is created** (it is not oauth-specific; it is the tenancy invariant, and the oauth migration
ends with it for `oauth_accounts`):

```sql
-- ── Isolation ──────────────────────────────────────────────────────────────
-- Both new tables have a `tenantId`, so the sweep finds and protects them.
-- Never end a migration that creates a table without this line.
SELECT app.apply_tenant_rls();
```
(`20260912120000_invitations_and_oauth/migration.sql:107-110`)

That function is itself hand-written in
`20260911105200_row_level_security/migration.sql:51-89` and is called there once at line 91.
It sweeps `public` for any table with a `tenantId` column (`a.attname = 'tenantId'`, line 63)
and applies `ENABLE`/`FORCE ROW LEVEL SECURITY` + the `tenant_isolation` policy
(lines 67–75), so `oauth_accounts` needed **no** bespoke policy — this is exactly why
`OAuthAccount.tenantId` is denormalised (oauth.prisma:14–20).

**GRANTs:** the oauth migration makes **none**. The restricted role is covered once and for
all by the default privileges in `20260911105300_app_role/migration.sql:25-40`, verbatim:

```sql
GRANT USAGE ON SCHEMA public TO dontpanic_app;
GRANT USAGE ON SCHEMA app TO dontpanic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;

-- Data: yes. Structure and policies: no.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;

-- Tables created by future migrations inherit the same privileges, so adding a
-- module never means coming back here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO dontpanic_app;
```

**Baseline ordering constraint:** the `app_role` `ALTER DEFAULT PRIVILEGES` statements only
affect objects created *after* them. A squashed baseline must therefore keep the order
`app schema + RLS functions` → `app_role grants` → `CREATE TABLE`s → `SELECT app.apply_tenant_rls();`,
or run the `GRANT … ON ALL TABLES` form after the tables exist.

### (k) DEPENDENCIES — oauth

**Does oauth depend on 2fa? — YES, hard dependency, and it is a security requirement, not a
convenience.** `apps/api/src/modules/auth/oauth/oauth.service.ts`:

```
 76:  /**
 77:   * First factor proved, second still owed. Social sign-in must not be a way
 …
 80:   * and nothing more. `TwoFactorGateGuard` does not close this — it only checks
 81:   * that 2FA is *enabled*, never that this session passed it.
 82:   */
 77:  | { kind: 'two-factor'; ticket: string }
```

```
325:      if (user.twoFactorEnabled) {
326:        const ticket = await this.auth.createLoginTicket(user.id);
327:        await this.audit(tx, 'auth.oauth.2fa_required', user.id, user.tenantId, ctx, {
328:          provider,
329:          linked: !link,
330:        });
331:        return { kind: 'two-factor', ticket };
332:      }
```

and the hand-off itself:

```
228:    if (outcome.kind === 'two-factor') {
…
240:      reply.setCookie(TWO_FACTOR_TICKET_COOKIE, outcome.ticket, this.twoFactorTicketCookie());
241:      return `${this.config.get('WEB_ORIGIN', { infer: true })}/login?twofactor=1`;
242:    }
```

Concretely oauth needs, from 2fa: `AuthService.createLoginTicket` (auth.service.ts:341, made
public for this — see the comment at 330–340), `AuthService.LOGIN_TICKET_TTL`
(auth.service.ts:653, used at oauth.service.ts:651), `TWO_FACTOR_TICKET_COOKIE`
(shared/auth.ts:155), `POST /auth/2fa/verify` on the API, and the code step in
`web/src/app/(auth)/login/page.tsx:87-118`. **If 2fa is off, the generator must not just
delete lines 325–332** — it has to decide what an OAuth callback does for a user who cannot
have TOTP; with 2fa off the branch is simply unreachable and can be dropped, but the
`AuthService` export (auth.module.ts:60) then has no reason to exist either.

**Does oauth depend on invitations? — NO.** Zero references in either direction: grep for
`invit` in `modules/auth/oauth/` hits only `oauth.service.ts:348` (a comment about slugs
living "in URLs and invitations for ever"). `oauth.service.ts` never reads, writes or
resolves an `Invitation` row. An invited user who later signs in with Google is handled by
the generic e-mail-match link path (`oauth.service.ts:236-238`), which knows nothing about
invitations.

**Does oauth depend on public-signup? — YES, it reads the same flag.**
`oauth.service.ts:594-596`:

```
594:  private signupEnabled(): boolean {
595:    return this.config.get('PUBLIC_SIGNUP_ENABLED', { infer: true });
596:  }
```

Two gates: `parkPendingRegistration` refuses at 404–408 (`signup_disabled` for intent=signup,
`no_account` for intent=login) and `completeSignup` throws `ForbiddenException('Public
registration is closed.')` at 430–432. It is also published to the browser:
`listProviders()` returns `signupEnabled` (oauth.service.ts:119,
`oauthProvidersResponseSchema.signupEnabled` at shared/oauth.ts:65). **If public-signup is
removed**, the third callback outcome (`unknown-identity`) has nowhere to go: the generator
must hard-code the refusal and delete `signup/complete/page.tsx` plus
`completeOAuthSignupSchema` — oauth then reduces to "link/sign in an account that already
exists", which is coherent.

**Does oauth depend on plans? — NO.** `completeSignup` (oauth.service.ts:425-538) calls
`provisionTenant` (456) and `tx.user.create` (465) but **never** `assertCanAddUser` — it is
creating a *new* company whose first user cannot exceed a seat count. `PlanLimitsService` is
not injected into `OAuthService` (constructor, lines 102–110). It *does* read the plan
indirectly through `provisionTenant`'s `isDefault` fallback and `toTenantDto(tenant, planName…)`
(line 522).

**Does oauth depend on multi-tenancy? — YES, structurally.** It opens its own
`prisma.asSystem` transactions (`oauth.service.ts:265, 442, 455`) rather than carrying
`@SystemScope()` on the whole request (see `system-scope.decorator.spec.ts:56-61`), and
`OAuthAccount.tenantId` is denormalised for `app.apply_tenant_rls()`.

---

## F2 · invitations

### (a) EXCLUSIVE FILES — delete whole

API module (`apps/api/src/modules/invitations`) — whole directory:

| File | lines |
| --- | --- |
| `apps/api/src/modules/invitations/invitations.module.ts` | 28 |
| `apps/api/src/modules/invitations/invitations.controller.ts` | 89 (`admin/invitations` — ADMIN, `RolesGuard`) |
| `apps/api/src/modules/invitations/public-invitations.controller.ts` | 75 (`auth/invitations` — `@Public() @SystemScope() @SensitiveThrottle()`) |
| `apps/api/src/modules/invitations/invitations.service.ts` | 692 |
| `apps/api/src/modules/invitations/invitations.service.spec.ts` | 635 |
| `apps/api/src/modules/invitations/invitations.dto.ts` | 14 |
| `apps/api/src/modules/invitations/support/invitation-email.ts` | 164 (imports only `EmailLocale` from `../../auth/support/email-templates`) |
| `apps/api/src/modules/invitations/support/invitation-email.spec.ts` | 101 |

Tests:

- `apps/api/test/invitations.e2e-spec.ts` — whole file (64 `invit` hits; it is the only e2e
  spec for this feature and touches nothing else).

Prisma + contracts:

- `apps/api/prisma/schema/invitations.prisma` (71 lines) — whole file.
- `packages/shared/src/invitation.ts` (105 lines) — whole file.

Web:

| File | lines |
| --- | --- |
| `apps/web/src/app/invite/[token]/page.tsx` | 278 |
| `apps/web/src/app/invite/[token]/invite.test.tsx` | ~200 |
| `apps/web/src/app/invite/layout.tsx` | 11 (borrows `AuthShell`) |
| `apps/web/src/components/admin/invite-user-dialog.tsx` | 219 |
| `apps/web/src/components/admin/invitations-table.tsx` | 234 |

`apps/web/src/components/admin/` becomes empty (it holds only those two files) — remove the
directory. No `*.stories.tsx` exists for any of them. There is **no** unit test for
`invite-user-dialog.tsx` / `invitations-table.tsx` (they sit outside the vitest coverage
`include` list — `apps/web/vitest.config.mts:23-36` covers `src/components/{ui,records,dashboard,charts,tenant,legal,platform}`, not `src/components/admin`).

**Caveat:** `apps/web/src/components/auth-shell.tsx` exists partly for `/invite` (doc-comment
at 9–11) but is also used by the `(auth)` group — **keep it**, reword the comment.

### (b) SHARED SEAMS — invitations

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 32 | `import { InvitationsModule } from './modules/invitations/invitations.module';` |
| `apps/api/src/app.module.ts` | 120 | `InvitationsModule,` in `imports` |
| `apps/api/src/main.ts` | — | **NO CHANGE.** Zero `invit` hits. |
| `apps/api/src/modules/auth/auth.module.ts` | — | **NO CHANGE.** `InvitationsModule` imports `AuthModule` (invitations.module.ts:23) for `TokenService`/`CookieService`; the dependency runs one way only. Nothing in `AuthModule` references invitations. |
| `apps/api/src/modules/auth/services/auth.service.ts` | — | **NO CHANGE.** Zero `invit` hits. |
| `apps/api/src/modules/auth/services/signup.service.ts` | — | **NO CHANGE.** Its only near-hit is line 77 ("the platform panel and the OAuth completion"), which is about `provisionTenant`, not invitations. |
| `apps/api/src/modules/auth/support/user.mapper.ts` | — | **NO CHANGE** (see the oauth table; `toUserDto` is called from `invitations.service.ts:586`, never the reverse). |
| `apps/api/src/modules/admin/admin-users.service.ts` | 24 | comment only: "…are fixed by the invitation flow (InvitationsModule): the invitee chooses…" — reword. The removed "create user with a password" endpoint is **already gone**; nothing needs restoring unless the generator wants to bring it back (see the warning below). |
| `apps/api/src/modules/admin/admin-users.controller.ts` | 29 | comment: "`POST /admin/invitations`, never through an admin choosing their password." — reword |
| `apps/api/src/modules/admin/admin-profiles.controller.ts` | 11 | comment: "It exists because inviting someone means choosing what they will be able to do" — reword. The controller itself (`/admin/profiles`) is also consumed by `invite-user-dialog.tsx` for the profile picker; it survives (the `/admin` users screen uses it too). |
| `apps/api/src/modules/platform/platform.module.ts` | 2 | `import { InvitationsModule } from '../invitations/invitations.module';` |
| `apps/api/src/modules/platform/platform.module.ts` | 16–19 | the 3-line comment and `imports: [InvitationsModule],` → becomes `imports: []` |
| `apps/api/src/modules/platform/services/platform-tenants.service.ts` | 20 | `import { InvitationsService } from '../../invitations/invitations.service';` |
| `apps/api/src/modules/platform/services/platform-tenants.service.ts` | 55–63 | `mailLocale()` helper — used **only** at line 253 |
| `apps/api/src/modules/platform/services/platform-tenants.service.ts` | 72–75 | drop `private readonly invitations: InvitationsService` from the constructor |
| `apps/api/src/modules/platform/services/platform-tenants.service.ts` | 122–271 | `create()` must be **rewritten**, not trimmed — see (k). Specifically out: 133–137 (doc), 145 `adminEmail`, 159/162 (the `adminEmail` pre-check), 192–206 (`this.invitations.issue(tx, …)`), 221–223 (`adminEmail`/`invitationId`/`sendInvitation` in the audit metadata), 233 (`invitation` in the returned tuple), 236–256 (the `sendInvitation` short-circuit and the post-commit `dispatchInvitationEmail`), 264–266 (the `email`-target branch of the P2002 translation) |
| `apps/api/src/modules/platform/services/platform-tenants.service.spec.ts` | 33 `invit` hits | rewrite: it mocks `InvitationsService` and asserts the invitation is issued inside the transaction and mailed after it |
| `apps/api/src/modules/platform/platform.controller.ts` | 61–65 | doc-comment + `@ApiOperation({ summary: 'Create a company and invite its first administrator' })` |
| `apps/api/src/modules/tenants/services/plan-limits.service.ts` | 105 | `assertCanAddUser` loses **both** of its call sites — see (k) |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 13–18 | doc-comment: "…the caller gets to decide what else lives or dies with it (the first user, the legal acceptance, **the invitation**)". No code change. |
| `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` | 63–72 | the 10-line comment block and the entry `'modules/invitations/public-invitations.controller.ts:2',`. **New expected list becomes exactly:** `['modules/auth/auth.controller.ts:8', 'modules/auth/oauth/oauth.controller.ts:1']` (or just `['modules/auth/auth.controller.ts:8']` if oauth is also off). |
| `apps/api/test/e2e-app.ts` | 156–171 | `assertCleanStart()`: the `Promise.all` at 156–164 drops `ownerDb().invitation.findMany(...)` (163), the guard at 166 becomes `if (users.length === 0) return;`, and the message branch at 169–170 goes |
| `apps/api/test/e2e-app.ts` | 194–201 | `"invitations"` out of the `TRUNCATE TABLE` list (200) and the comment at 194–198 |
| `apps/api/test/factories.ts` | — | **NO CHANGE.** No invitation factory exists; `makeUser` (4–23) is cast `as User`. |
| `apps/api/test/prisma-mock.ts` | — | **NO CHANGE.** Generic; the `invitation` delegate mock is declared locally in `invitations.service.spec.ts`. |
| `apps/web/src/proxy.ts` | 15–20 | the 5-line comment and `'/invite',` inside `PRE_AUTH_PREFIXES` |
| `apps/web/src/proxy.test.ts` | 33–36, 39–42 | the two `/invite/abc123token` tests |
| `apps/web/src/lib/auth-config.ts` | — | **NO CHANGE for invitations** (its only `invit` hit is the doc-block prose). But note: with invitations gone, `signupEnabled=false` leaves **no way in at all** except `db:seed`. |
| `apps/web/src/components/auth-shell.tsx` | 9–11 | comment mentions `/invite/…` — reword only |
| `apps/web/src/app/(auth)/login/page.tsx` | — | **NO CHANGE for invitations.** |
| `apps/web/src/app/(auth)/signup/page.tsx` | 36 | comment "…everyone else arrives by invitation" |
| `apps/web/src/app/(auth)/signup/page.tsx` | 106 | `<p …>{t('closedInvite')}</p>` — the "access is by invitation" text on the signup-closed screen. With invitations gone the message is a lie; rewrite or drop with the key. |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 16–17 | the two component imports |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 29–32 | the "Create user with a password is gone…" comment and `const [inviting, setInviting] = useState(false);` |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 112 | `<Button onClick={() => setInviting(true)}>{t('inviteUser')}</Button>` |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 217 | `<InvitationsTable />` |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 231 | `<InviteUserDialog open={inviting} onOpenChange={setInviting} />` |
| `apps/web/src/components/platform/create-tenant-dialog.tsx` | 65–67, 83–85, 144–146, 305–341 | `adminName`/`adminEmail`/`sendInvitation` in the form type, the defaults, the submit payload, and the whole "The first administrator" fieldset (`adminName` 309–313, `adminEmail` 317–322, `noPasswordNotice` 327, the `sendInvitation` switch 333–339) |
| `apps/web/src/components/platform/create-tenant-dialog.test.tsx` | 38–43, 116–118, 199 | the message stubs, the expected submit payload, and the `sendInvitation: false` assertion. **This file is inside the coverage `include`** (`vitest.config.mts:32`) so it must be edited, not merely deleted. |
| `apps/web/src/app/platform/tenants/page.tsx` | 129–134 | the `result.invitationSent ? tToast('tenantCreatedInvited') : tToast('tenantCreatedNoInvite')` toast branch |
| `apps/web/src/components/platform/platform-api.ts` | 150 | comment "The response says whether the first administrator's invitation actually went…" |
| `apps/web/src/components/platform/platform-api.test.tsx` | 2 `invit` hits | adjust with the `PlatformCreateTenantResponse` shape change |
| `apps/api/src/config/env.ts` | 124–130 | `INVITATION_TTL_HOURS`, `INVITATION_MAX_RESENDS` — see (f) |
| `apps/api/src/config/env.spec.ts` | 126–137 | `describe('invitations')` — see (f) |

### (c) PRISMA — invitations

**Deleted whole:** `apps/api/prisma/schema/invitations.prisma` lines 1–71:

- `enum InvitationStatus { PENDING ACCEPTED REVOKED }` — lines 15–19 (note the doc at 11–14:
  `EXPIRED` is deliberately **not** a stored value)
- `model Invitation { … }` — lines 21–70, fields:
  `id` (22), `tenantId` (23) + `tenant` (24), `email` (31), `name` (34), `role Role @default(USER)` (35),
  `profileId` (36) + `profile` (37), `tokenHash String @unique` (42), `status` (43), `expiresAt` (44),
  `invitedById` (48) + `invitedBy` (49, relation name `"InvitationsSent"`), `acceptedAt` (53),
  `acceptedUserId` (54) + `acceptedUser` (55, relation name `"InvitationAccepted"`),
  `revokedAt` (57), `resentCount` (61), `lastSentAt` (62), `createdAt` (64), `updatedAt` (65),
  indexes `@@index([tenantId])` (67), `@@index([tenantId, status])` (68), `@@index([email])` (69),
  `@@map("invitations")` (70)

**Back-relations to remove** (all four are mandatory — Prisma will not validate a relation
field pointing at a deleted model):

| file | line | field |
| --- | --- | --- |
| `apps/api/prisma/schema/tenancy.prisma` | 93 | `invitations      Invitation[]` on `model Tenant` |
| `apps/api/prisma/schema/tenancy.prisma` | 188 | `invitationsSent     Invitation[]  @relation("InvitationsSent")` on `model User` |
| `apps/api/prisma/schema/tenancy.prisma` | 189 | `invitationAccepted  Invitation[]  @relation("InvitationAccepted")` on `model User` |
| `apps/api/prisma/schema/tenancy.prisma` | 212 | `invitations Invitation[]` on `model Profile` |

Nothing reads any of the four (grep for `invitationsSent`, `invitationAccepted`,
`Tenant.invitations`, `Profile.invitations`: only these schema lines). The *forward* side is
used: `invitations.service.ts:318,628` includes `profile: {select:{name:true}}` and
`invitedBy: {select:{name:true}}`, and `:464` includes `tenant: {select:{name:true}}`.

`Role` (tenancy.prisma:142-146) is **shared** — `Invitation.role` references it but `User.role`
is the primary user. It stays.

`User.passwordHash` nullability is **not** affected by invitations: `accept()` always writes a
real hash (`invitations.service.ts:491` → `529`).

### (d) `packages/shared` — invitations

**Whole file out:** `packages/shared/src/invitation.ts` (1–105):

| symbol | line |
| --- | --- |
| `invitationStatuses` / `invitationStatusSchema` / `InvitationStatus` (includes the derived `'EXPIRED'`) | 25–27 |
| `createInvitationSchema` / `CreateInvitationInput` (note `role: z.enum(['ADMIN','USER'])` at 41 — the anti-escalation lock lives in the *contract*) | 37–45 |
| `invitationDtoSchema` / `InvitationDto` | 52–66 |
| `invitationListQuerySchema` / `InvitationListQuery` | 68–71 |
| `invitationPreviewSchema` / `InvitationPreview` | 83–89 |
| `acceptInvitationSchema` / `AcceptInvitationInput` | 99–105 |

It imports `paginationQuerySchema` (./common), `emailSchema`/`passwordSchema` (./primitives)
and `RoleEnum` (./user) — all shared, all keep other consumers.

**Cookie-name constants:** invitations own **none**. `TWO_FACTOR_TICKET_COOKIE`
(`packages/shared/src/auth.ts:155`) is oauth-only. The invitation token travels as a path
segment (`/invite/<token>`, built at `invitations.service.ts:181`) and in the
`acceptInvitationSchema.token` body field, never in a cookie.

**Other shared changes (not deletions):** `packages/shared/src/tenant.ts`

- lines 217–229 — the doc-block for `platformCreateTenantSchema`, whose whole second bullet
  (223–225, "**No password.** The operator names the first administrator; the system invites
  them.") is about invitations
- lines 246–248 — `adminEmail` and `adminName` (plus the `/** The first administrator, who receives the invitation. */` comment)
- lines 249–254 — the `sendInvitation: z.boolean().default(true)` field and its comment
- lines 258–262 — `platformCreateTenantResponseSchema`: `invitationSent: z.boolean()` (261) and the comment (258)

`packages/shared/src/user.ts:104-116` is a comment block explaining why there is no
"admin creates a user with a password" contract, pointing at `createInvitationSchema`. With
invitations gone the generator must **either** reinstate such a contract **or** leave `/admin`
with no way to add a user at all. Flag this to the operator; do not silently drop the comment.

`packages/shared/src/permissions.ts:84,92` are incidental prose uses of the word "invite".

**`packages/shared/src/index.ts`:** line 11 `export * from './invitation';` → deleted. The
other 13 lines unchanged. (If both features go, lines 11 and 12 both go.)

### (e) WEB — invitations

**App Router routes deleted:** the whole `apps/web/src/app/invite/` subtree —
`layout.tsx` (11) and `[token]/page.tsx` (278) + `[token]/invite.test.tsx`.
`apps/web/src/app/(dashboard)/admin/page.tsx` survives (it is the company user list).

**Nav/menu entries:** none in `app-sidebar.tsx`. The invitation UI surfaces are the
"Invite user" button (`admin/page.tsx:112`), the dialog (231) and the table (217).

**BFF proxy:** `apps/web/src/app/api/[...path]/route.ts` has **no** invite special case (see
the oauth section — fully generic). `apps/web/src/proxy.ts` **does**: `'/invite'` in
`PRE_AUTH_PREFIXES` (line 20, with the rationale at 15–19), matched by the
`pathname === p || pathname.startsWith(\`${p}/\`)` helper at line 32, and tested at
`proxy.test.ts:33-42`. Remove all three.

**i18n — namespaces/keys out** (identical line numbers in both `pt-BR.json` and `en-US.json`;
both files are key-parity-tested by `apps/web/src/i18n/messages.test.ts:18-25`, so they must
be edited in lock-step):

| key path | lines | note |
| --- | --- | --- |
| `invite` — **whole top-level namespace** (`title`, `subtitle`, `company`, `submit`, `invalidTitle`, `invalid`, `invalidHint`, `termsLink`, `privacyLink`) | 564–574 | the only top-level namespace that disappears for either feature |
| `admin.inviteUser` | 251 | |
| `admin.invite` — whole sub-namespace (`title`, `subtitle`, `role`, `profile`, `profileDefault`, `nameHint`, `explainer`, `submit`, `sent`, `duplicate`, `invalid`) | 252–264 | |
| `admin.invitations` — whole sub-namespace (`title`, `subtitle`, `tableCaption`, `colInvitee`, `colRole`, `colStatus`, `colExpires`, `colInvitedBy`, `colActions`, `empty`, `status.{PENDING,ACCEPTED,REVOKED,EXPIRED}`, `resend`, `revoke`, `resent`, `revoked`, `revokeTitle`, `revokeConfirm`, `revokeAction`, `pageInfo`, `prev`, `next`) | 265–292 | |
| `auth.signup.closedInvite` | 62 | text says "Access is by invitation" — must go or be rewritten |
| `platform.toast.tenantCreatedInvited` | 529 | |
| `platform.toast.tenantCreatedNoInvite` | 530 | |
| `platform.createTenant.adminLegend` | 553 | |
| `platform.createTenant.adminName` | 554 | |
| `platform.createTenant.adminEmail` | 555 | |
| `platform.createTenant.noPasswordNotice` | 556 | |
| `platform.createTenant.sendInvitation` | 557 | |
| `platform.createTenant.sendInvitationOn` | 558 | |
| `platform.createTenant.sendInvitationOff` | 559 | |
| `platform.createTenant.subtitle` | 535 | text is "Register the company and invite its first administrator" — rewrite |

Top-level namespaces after removal: `common, nav, auth, dashboard, profile, admin, session,
errors, easter, twoFactorPrompt, twoFactorSetup, validation, tenant, legal, platform`
(i.e. `invite` gone; everything else stays).

### (f) ENV — invitations

**`.env.example`** — delete lines **166–175**: the 6-line comment block (166–171), then
`INVITATION_TTL_HOURS=168` (172), the 2-line comment (173–174) and `INVITATION_MAX_RESENDS=5`
(175). Lines 156–164 (`PUBLIC_SIGNUP_ENABLED`) stay, but the prose at 160–163 says a closed
signup leaves "the invitation and the seed" — reword.

**`apps/api/src/config/env.ts`** — delete lines **124–130**:

```
124:  /// How long a mailed invitation stays good. …
127:  INVITATION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(168),
128:  /// Resends allowed per invitation, total. …
130:  INVITATION_MAX_RESENDS: z.coerce.number().int().min(0).max(20).default(5),
```

There is **no conditional logic in `validateEnv()` for invitations** — unlike oauth, the two
knobs are plain Zod-bounded numbers with defaults, and no cross-field check references them.
The `// --- who may get in ---` header (113) and `PUBLIC_SIGNUP_ENABLED` (123) stay.

**`apps/api/src/config/env.spec.ts`** — delete lines **126–137**, `describe('invitations')`:

- 127–130 `'defaults to a week, long enough to survive a holiday'` (asserts `168` and `5`)
- 132–136 `'refuses a TTL beyond a month of hours'` (`INVITATION_TTL_HOURS: 5000` → throws)

### (g) SEED — invitations

**No change.** `apps/api/prisma/seed.ts` (113 lines) has zero `invit` references. It creates
its two users directly with a real `passwordHash` (lines 40–50, 86–98), bypassing invitations
entirely — which is precisely why the seed remains a working door when
`PUBLIC_SIGNUP_ENABLED=false`.

Worth surfacing to the operator: with invitations **and** public-signup both off, `db:seed`
is the only account creation path in the product.

### (h) CLAUDE.md + README.md — invitations

**CLAUDE.md:**

| heading | lines | action |
| --- | --- | --- |
| `## Convites — a única porta para uma empresa que já existe` | **191–285** (through the `---` at 285) | delete whole section. **Warning:** lines 204–210 inside it are about `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` and belong to *public-signup*, not invitations — if public-signup survives, that paragraph has to be relocated (e.g. under `## Autenticação (resumo)`) rather than deleted. |
| `## Autenticação (resumo)` | **75–77** | rewrite the "Quem entra e por onde" bullet: drop "**convite** — a única porta para empresa que já existe" (75–76) |
| `## Multi-tenancy → As regras` | 119–122 | the `@SystemScope()` bullet says "Hoje está só nas rotas de `auth`" — still true; no change |
| `## Planos` | 140–145 | no literal invitation mention, but `assertCanAddUser` (its subject) loses every caller — add a note or the section becomes aspirational |
| `## Fila de jobs` | 149–188 | no invitation mention (invitations ride the generic `mail.send` job) — no change |
| `## O que NÃO fazer` | **575–576** ("Não disparar o e-mail de convite dentro da transação: um rollback deixa link válido apontando para nada. `issue()` grava no `tx` do chamador; o envio é depois do commit.") | delete |
| `## O que NÃO fazer` | **577–578** ("Não criar usuário de outra pessoa definindo a senha dela. Para empresa que já existe é convite — quem entra escolhe a própria senha e o clique no link é o que prova o endereço.") | delete — **but this is the rule that forbids the `/admin` create-user-with-password endpoint.** Removing invitations without reinstating something means `/admin` cannot add a user at all. |
| `## O que NÃO fazer` | 569–570 | the `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` half of the OAuth bullet — keep if public-signup stays |

**README.md:**

| section | lines | action |
| --- | --- | --- |
| `### O que já vem pronto` | 73 | delete the `**Convites**` bullet |
| `### O que já vem pronto` | 79 | rewrite the `**Back-office do operador**` bullet: "**criar empresa** (que convida o primeiro admin em vez de definir senha para ele)" |
| `### Autenticação e controle de acesso` | 189–193 | drop the `Convite` row (192) from the three-door table |
| same | 195–199 | delete the `**Convites**` paragraph |
| same | 204–205 | the `**Login social**` paragraph's last sentence mentions the complete-signup screen — oauth's concern, not this one |
| `### What comes built in` | 368 | delete the `**Invitations**` bullet |
| `### What comes built in` | 374 | rewrite the `**Operator back-office**` bullet (same clause, in English) |
| `### Authentication and access control` | 486–490 | drop the `Invitation` row (489) |
| same | 492–497 | delete the `**Invitations**` paragraph |

### (i) NPM DEPS — invitations

**None become unused.** Every dependency `invitations.service.ts` touches is used elsewhere:

- `argon2` (`invitations.service.ts:11`) — also `auth.service.ts:577`, `signup.service.ts:73`,
  `users.service.ts:111,414`, `admin-users.service.ts:141`, `prisma/seed.ts:3`.
- `@nestjs/common`, `@nestjs/config`, `@prisma/client`, `nestjs-zod` (invitations.dto.ts:1),
  `@nestjs/swagger` — all core.
- `invitation-email.ts` imports only a local type (`EmailLocale` from
  `../../auth/support/email-templates`); it builds HTML/text by hand, no templating library.
- Web: `invite/[token]/page.tsx` and the two admin components import only
  `react-hook-form`, `@hookform/resolvers/zod`, `@tanstack/react-query`, `next-intl`,
  `sonner`, `lucide-react`, `zod` and local `ui/` components — every one of which the rest of
  the app already uses. Note `invitations-table.tsx:13` imports `formatDate` from
  `@/components/platform/format` (a cross-feature import into `platform`, one-directional).

### (j) MIGRATION SQL — invitations

Source: `apps/api/prisma/migrations/20260912120000_invitations_and_oauth/migration.sql`.

**Regenerated automatically by `prisma migrate diff` from the schema:**

- line 13 — `CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');`
- lines 27–47 — `CREATE TABLE "invitations" (…)`
- lines 49–52 — `invitations_tokenHash_key` (from `@unique` on `tokenHash`),
  `invitations_tenantId_idx`, `invitations_tenantId_status_idx`, `invitations_email_idx`
  (all from `@@index`)
- lines 69–76 — the four foreign keys (`tenantId` CASCADE, `profileId` SET NULL,
  `invitedById` SET NULL, `acceptedUserId` SET NULL — all expressible in Prisma)

**HAND-WRITTEN — Prisma's schema language cannot express it; must be preserved VERBATIM**
(this is the partial unique index the task asked for, `migration.sql:54-67`):

```sql
-- At most one LIVE invitation per address per company.
--
-- A partial index, because the constraint only applies to PENDING rows: after
-- an invitation is accepted or revoked the same person may legitimately be
-- invited again, and a plain UNIQUE(tenantId, email) would refuse that forever.
-- Prisma's schema language cannot express a partial index, which is why this
-- lives here and is documented on the model.
--
-- It also closes the race the service's pre-check cannot: two admins inviting
-- the same colleague at the same moment both see "no pending invitation" and
-- both insert. Postgres refuses the second, and the service translates it.
CREATE UNIQUE INDEX "invitations_tenant_email_pending_key"
  ON "invitations"("tenantId", "email")
  WHERE "status" = 'PENDING';
```

The index name `invitations_tenant_email_pending_key` is referenced by name in the code
comment at `invitations.service.ts:150`, and its `P2002` is translated to a 409 by
`translatePendingConflict` (`invitations.service.ts:686-691`). **If the generator drops this
index, `InvitationsService.create` silently loses its race guarantee** — the pre-check at
`retireStalePending` (664–680) does not lock anything.

**HAND-WRITTEN — the RLS sweep** (shared with oauth; see that section for the verbatim text):

```sql
SELECT app.apply_tenant_rls();
```
(`migration.sql:110`) — mandatory because `invitations` carries `tenantId`. Defined in
`20260911105200_row_level_security/migration.sql:51-89`.

**GRANTs:** none in this migration; covered by
`20260911105300_app_role/migration.sql:25-40` (quoted verbatim in the oauth section (j)).

**Not invitations-specific but in the same migration:**
`ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;` (line 24) belongs to **oauth
only** — see oauth (c). A baseline with invitations but without oauth must keep
`"passwordHash" TEXT NOT NULL`.

### (k) DEPENDENCIES — invitations

**Does invitations depend on plans? — YES, at two call sites, and the two are not equivalent.**

1. `apps/api/src/modules/invitations/invitations.service.ts:223` — inside `create()` (the
   ADMIN issuing an invite), preceded by the comment at 219–222:
   *"A friendly pre-check, NOT the guarantee. The seat is consumed on acceptance, and that is
   where the advisory lock settles the race — here it only spares an admin from mailing an
   invitation the plan has no room for."*
   ```
   223:        await this.planLimits.assertCanAddUser(tx);
   ```
2. `apps/api/src/modules/invitations/invitations.service.ts:518-520` — inside `accept()`, the
   **authoritative** check, which is why it re-enters tenant scope by hand:
   ```
   518:      await TenantContext.run({ scope: { kind: 'tenant', tenantId }, tx }, () =>
   519:        this.planLimits.assertCanAddUser(tx),
   520:      );
   ```
   It runs in the same `tx` as `tx.user.create` (524) so the `pg_advisory_xact_lock` and the
   count wrap the write that consumes the seat.

Injected at `invitations.service.ts:92` (`private readonly planLimits: PlanLimitsService`),
supplied by the `@Global()` `TenantsModule` (`tenants.module.ts:11`).

**If plans is removed:** drop both call sites and `TenantContext.run` at 518–520 collapses to
a bare `this.planLimits…` removal — but note that line 518 is *also* what documents the
system-scope→tenant-scope re-entry; with plans gone, `accept()` has nothing left that needs a
tenant scope, so the whole `TenantContext.run` wrapper goes and the comment at 512–517 with
it. Invitations then have **no** seat limit: an ADMIN can invite unboundedly.

**Reverse direction, and this is the surprising one:** `assertCanAddUser`
(`plan-limits.service.ts:105`) has **exactly two production call sites, both in
`invitations.service.ts`** (223 and 519). Every other reference is its own spec
(`plan-limits.service.spec.ts:213-292`). So **removing invitations leaves the plans feature's
`maxUsers` enforcement with zero callers** — `maxUsers` becomes documentation. The generator
must either (a) keep invitations, (b) re-add a seat check to whatever replaces
admin-user-creation, or (c) emit `PlanLimitsService` without `assertCanAddUser` and drop
`maxUsers` from the plan model/DTO. Silently shipping (nothing) is the failure mode:
`plan-limits.service.spec.ts` still passes at 100% because it calls the method directly.

**Does invitations depend on queue? — YES, but only through the generic mail job. There is no
invitation-specific job.**

Trace: `create()` (272–280) and `resend()` (405–413) and
`PlatformTenantsService.create` (243–254) all call
`dispatchInvitationEmail(...)` **after** their transaction closes.
`dispatchInvitationEmail` is `invitations.service.ts:167-198`:

```
176:    const origin = this.config.get('WEB_ORIGIN', { infer: true });
177:    const mail = invitationEmail({ … link: `${origin}/invite/${params.rawToken}`, … });
186:    void this.queue
187:      .enqueue(
188:        'mail.send',
189:        { message: { to: params.to, subject: mail.subject, html: mail.html, text: mail.text } },
193:        { jobId: `invitation:${sha256(params.rawToken)}` },
194:      )
195:      .catch((err: unknown) => { … });
```

- The **job name is `'mail.send'`** — declared once for the whole app at
  `apps/api/src/core/queue/jobs.ts:14` (`'mail.send': { message: MailMessage };`). Invitations
  add **no** entry to `JobPayloads`.
- The **JobRouter case** is `apps/api/src/infra/queue/job-router.service.ts:39` (`case 'mail.send':`)
  → `await this.mail.send(envelope.payload.message);` at line 42. Nothing invitation-specific.
- `QUEUE_PROVIDER` injected at `invitations.service.ts:93`.
- The invitation-specific part is only the `jobId` prefix `invitation:<sha256(rawToken)>`
  (line 193) used for de-duplication, and the template in `support/invitation-email.ts`.

**If queue is removed:** replace `this.queue.enqueue('mail.send', …)` with a direct
`MailProvider.send(...)`, keeping the "after the commit" placement and the fire-and-forget
`.catch` (195–197). The `jobId` de-duplication is lost, so a retried request can mail twice.

**Does invitations depend on platform, or platform on invitations? — PLATFORM DEPENDS ON
INVITATIONS. One direction only.** Evidence:

- `apps/api/src/modules/platform/platform.module.ts:2,19` — `imports: [InvitationsModule]`,
  with the comment at 16–18: *"Creating a company invites its first administrator, so the
  panel borrows the same invitation service a company ADMIN uses."*
- `apps/api/src/modules/platform/services/platform-tenants.service.ts:20,74` — imports and
  injects `InvitationsService`.
- `platform-tenants.service.ts:196-206` — inside the `runAsPlatform` transaction:
  ```
  196:        const invitation = await this.invitations.issue(tx, {
  197:          tenantId: tenant.id,
  198:          email: adminEmail,
  199:          name: input.adminName,
  200:          role: 'ADMIN',
  201:          profileId: adminProfileId,
  205:          invitedById: actor.id,
  206:        });
  ```
- `platform-tenants.service.ts:243-254` — the post-commit
  `this.invitations.dispatchInvitationEmail({ …, inviterName: null, … })`, guarded by
  `if (!input.sendInvitation) return { tenant: created.dto, invitationSent: false };` (239).
- `InvitationsModule` exports `InvitationsService` **specifically** for this
  (`invitations.module.ts:18-20,26`). Nothing in `InvitationsModule` imports anything from
  `modules/platform`.

**What a platform-without-invitations `POST /platform/tenants` would have to do instead**
(the doc-comment at `platform-tenants.service.ts:133-137` is explicit that creating a user is
the thing it refuses to do):

1. Create the company + system profiles only (`provisionTenant`, 177–190) and **no
   administrator at all** — then the company is unreachable until someone signs up into it,
   which `provisionTenant` does not allow (signup creates its own tenant). Dead company.
2. Create the first admin directly with an operator-chosen password — which is precisely the
   flow CLAUDE.md:212–218 documents as having been removed for two named reasons (two people
   know the credential; the address is never proven). Requires reinstating a
   `passwordHash`-accepting contract in `packages/shared/src/tenant.ts` and the
   "admin creates a user" contract deleted at `packages/shared/src/user.ts:104-116`.
3. Create the first admin with `passwordHash: null` (or a random hash) + issue a
   **password-reset** token and mail that instead — reuses `PasswordResetToken`
   (`auth.prisma:42-53`) and `AuthService.forgotPassword` (`auth.service.ts:543-565`), and
   preserves "the recipient chooses their own credential". This is the closest substitute and
   the one the generator should emit; it needs `User.passwordHash` to stay nullable, which
   couples it back to the oauth decision in (c).

Whichever it picks, `PlatformCreateTenantInput` (`shared/tenant.ts:230-255`) and
`PlatformCreateTenantResponse` (`259-263`, `invitationSent`) change shape, and with them
`create-tenant-dialog.tsx`, its test, `platform/tenants/page.tsx:129-134` and the
`platform.createTenant.*` / `platform.toast.tenantCreated*` i18n keys.

**Does invitations depend on multi-tenancy / `@SystemScope()`? — YES, and it is one of only
three places in the codebase carrying the decorator.**

- `apps/api/src/modules/invitations/public-invitations.controller.ts:48` and `:57` — two
  `@SystemScope()` marks (hence the `:2` count in the allowlist), with the justification at
  lines 18–22: *"the tenant is a **result** of resolving the token, not something available
  beforehand. Without it, RLS returns nothing and every invitation looks invalid."*
- The hand-passed tenant, `invitations.service.ts:512-520`, verbatim:
  ```
  512:      // The authoritative seat check. `PlanLimitsService` reads the tenant from
  513:      // the request context, and this route deliberately runs in system scope
  514:      // (there is no tenant to derive one from before the token is resolved), so
  515:      // the resolved tenant is supplied here — with the SAME transaction, which
  516:      // is what keeps the advisory lock and the count around the write that
  517:      // consumes the seat.
  518:      await TenantContext.run({ scope: { kind: 'tenant', tenantId }, tx }, () =>
  519:        this.planLimits.assertCanAddUser(tx),
  520:      );
  ```
  with `const tenantId = invitation.tenantId;` at line 502.
- The ADMIN-side routes are ordinary tenant scope: `TenantContext.requireTenantId()` at
  `invitations.service.ts:209` (`create`), `:346` (`resend`), `:423` (`revoke`).
- `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts:63-72` is the allowlist test; see
  (b) for the exact new expected array.

**Does invitations depend on oauth? — NO.** Zero references in either direction.

**Does invitations depend on 2fa? — NO.** `accept()` mints a session directly via
`tokenService.issueTokensForUser` (`invitations.service.ts:581-584`) — a brand-new account
cannot have TOTP enabled, so there is no second-factor branch. It does depend on
`TokenService` + `CookieService` from `AuthModule` (`invitations.module.ts:11-13,23`;
`public-invitations.controller.ts:38,71-72`).

**Does invitations depend on public-signup? — NO code dependency**, but they are the two
halves of one product decision (CLAUDE.md:199-210): signup creates a company, invitations are
the only way into an existing one. Turning both off leaves only `db:seed`.

---

## F3 · 2fa — TOTP + backup codes

### (a) EXCLUSIVE FILES — delete whole

API:

- `apps/api/src/modules/auth/services/two-factor.service.ts`
- `apps/api/src/modules/auth/services/two-factor.service.spec.ts`
- `apps/api/src/modules/auth/guards/two-factor-gate.guard.ts`
- `apps/api/src/modules/auth/guards/two-factor-gate.guard.spec.ts`
- `apps/api/src/common/decorators/skip-two-factor-gate.decorator.ts`
- `apps/api/src/common/decorators/skip-two-factor-gate.decorator.spec.ts`

Web:

- `apps/web/src/app/setup-2fa/page.tsx`
- `apps/web/src/components/two-factor-gate.tsx`
- `apps/web/src/components/two-factor-prompt-dialog.tsx`
- `apps/web/src/components/two-factor-setup.tsx`
- `apps/web/src/components/profile/two-factor-card.tsx` (429 lines)

**Verified NOT exclusive — keep:**

- `apps/web/src/components/ui/otp-input.tsx` / `.test.tsx` / `.stories.tsx` — also used by
  `apps/web/src/app/(auth)/verify-email/page.tsx:23,124` and
  `apps/web/src/components/profile/email-card.tsx:20,137` (email-change code). The `.stories.tsx`
  copy mentions 2FA but the component is the generic OTP box.
- `apps/web/src/lib/cookies.ts` (`readCookie`/`clearCookie`) — generic helpers; only the *fixtures*
  in `apps/web/src/lib/cookies.test.ts` name `dp_2fa_ticket` (lines 22-23, 32-34, 62-66) and need
  their literal swapped for any other cookie name.
- `apps/api/src/infra/prisma/prisma.service.ts` `forTenant`/`asPlatform` — used by other guards.

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 25 | `import { TwoFactorGateGuard } from './modules/auth/guards/two-factor-gate.guard';` |
| `apps/api/src/app.module.ts` | 136 | `{ provide: APP_GUARD, useClass: TwoFactorGateGuard },` |
| `apps/api/src/app.module.ts` | 127-131 | guard-order comment: drop "then 2FA," from the sentence |
| `apps/api/src/main.ts` | — | **no change** (2FA touches nothing in bootstrap) |
| `apps/api/src/modules/auth/auth.module.ts` | 7, 40, 54 | `TwoFactorService` import / provider / export |
| `apps/api/src/modules/auth/auth.module.ts` | 16-17, 25, 57-60 | doc-comment lines naming "TOTP 2FA + backup codes" and the "OAuth hands off to the same second-factor step" note on `exports: [AuthService]` (the export itself must stay only if oauth stays; see (k)) |
| `apps/api/src/modules/auth/auth.controller.ts` | 12 | `import { SkipTwoFactorGate }` |
| `apps/api/src/modules/auth/auth.controller.ts` | 8 | `AuthUserResponse` type import (only used by `verifyTwoFactor`) |
| `apps/api/src/modules/auth/auth.controller.ts` | 24-27 | drop `TwoFactorVerifyDto` from the DTO import list |
| `apps/api/src/modules/auth/auth.controller.ts` | 96 | `@ApiOperation` summary: "sets auth cookies **or returns a 2FA challenge**" |
| `apps/api/src/modules/auth/auth.controller.ts` | 101-108 | `login()` return type becomes `AuthUserResponse`; drop the `if (result.kind === 'challenge')` branch (103-105) and the `result.tokens`/`result.user` destructure stays |
| `apps/api/src/modules/auth/auth.controller.ts` | 111-126 | **delete** the whole `POST auth/2fa/verify` handler |
| `apps/api/src/modules/auth/auth.controller.ts` | 158 | `@SkipTwoFactorGate()` on `logout` |
| `apps/api/src/modules/auth/dto/auth.dto.ts` | 8, 22 | `twoFactorVerifySchema` import + `TwoFactorVerifyDto` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 18 | `TwoFactorChallenge` type import |
| `apps/api/src/modules/auth/services/auth.service.ts` | 28 | `import { TwoFactorService } from './two-factor.service';` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 45-48 | `LoginResult` union collapses to just `{ kind: 'tokens'; … }` — or, cleaner, `login()` returns `{ user; tokens }` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 54-55 | `LOGIN_TICKET_TTL` + `TWO_FACTOR_MAX_ATTEMPTS` consts |
| `apps/api/src/modules/auth/services/auth.service.ts` | 103 | `private readonly twoFactor: TwoFactorService,` ctor param |
| `apps/api/src/modules/auth/services/auth.service.ts` | 265-269 | the `if (user.twoFactorEnabled) { … return { kind: 'challenge' … } }` branch |
| `apps/api/src/modules/auth/services/auth.service.ts` | 320-397 | the whole `// --- 2FA second step ---` section: `ticketKey`, `twoFactorFailKey`, `createLoginTicket`, `verifyTwoFactor` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 653 | `static readonly LOGIN_TICKET_TTL = LOGIN_TICKET_TTL;` (only consumer is `oauth.service.ts:651`) |
| `apps/api/src/modules/auth/services/auth.service.spec.ts` | 298-312 | `it('returns a 2FA challenge (ticket) when 2FA is enabled')` |
| `apps/api/src/modules/auth/services/auth.service.spec.ts` | 346-428 | `describe('verifyTwoFactor')` — 6 tests |
| `apps/api/src/modules/auth/services/auth.service.spec.ts` | 50-111 | `TwoFactorService` double in the module fixture (grep: 42 hits in file) |
| `apps/api/src/modules/users/users.controller.ts` | 19-20 | `TwoFactorEnableResponse`, `TwoFactorSetupResponse` type imports |
| `apps/api/src/modules/users/users.controller.ts` | 17 | `SecurityStatus` type import |
| `apps/api/src/modules/users/users.controller.ts` | 25 | `SkipTwoFactorGate` import |
| `apps/api/src/modules/users/users.controller.ts` | 31-32 | `TwoFactorDisableDto`, `TwoFactorEnableDto` from the DTO import |
| `apps/api/src/modules/users/users.controller.ts` | 39 | class doc: drop "2FA management" |
| `apps/api/src/modules/users/users.controller.ts` | 56, 63 | `@SkipTwoFactorGate()` on `me` and `security` |
| `apps/api/src/modules/users/users.controller.ts` | 62-67 | **delete** `GET users/me/security` |
| `apps/api/src/modules/users/users.controller.ts` | 87-127 | **delete** the four 2FA routes: `me/2fa/setup`, `me/2fa/enable`, `me/2fa/snooze`, `me/2fa/disable` |
| `apps/api/src/modules/users/dto/users.dto.ts` | 7-8, 20-21 | `twoFactorEnableSchema`/`twoFactorDisableSchema` imports + the two DTO classes |
| `apps/api/src/modules/users/services/users.service.ts` | 19-21, 25 | `TwoFactorDisableInput`, `TwoFactorEnableInput`, `TwoFactorSetupResponse`, `SecurityStatus` type imports |
| `apps/api/src/modules/users/services/users.service.ts` | 34, 58 | `TwoFactorService` import + ctor param |
| `apps/api/src/modules/users/services/users.service.ts` | 46-47 | `PENDING_2FA_TTL` const |
| `apps/api/src/modules/users/services/users.service.ts` | 124-245 | the whole `// --- 2FA ---` section (`pendingSecretKey`, `getSecurityStatus`, `snoozeTwoFactorPrompt`, `setupTwoFactor`, `enableTwoFactor`, `disableTwoFactor`) |
| `apps/api/src/modules/users/services/users.service.ts` | 425-426, 430, 434 | `eraseAccount`: drop `twoFactorEnabled: false`, `twoFactorSecret: null`, `tx.twoFactorBackupCode.deleteMany(...)`, `cache.del(pendingSecretKey(...))` |
| `apps/api/src/modules/users/services/users.service.ts` | 27, 60 | `ConfigService`/`Env` import + ctor param — **check**: `this.config` is used only by `getSecurityStatus` (line 133); confirm before dropping |
| `apps/api/src/modules/users/services/users.service.spec.ts` | 72-119 | `describe('getSecurityStatus')` + `describe('snoozeTwoFactorPrompt')` |
| `apps/api/src/modules/users/services/users.service.spec.ts` | 184-312 | `describe('setupTwoFactor')`, `describe('enableTwoFactor')`, `describe('disableTwoFactor')` |
| `apps/api/src/modules/users/services/users.service.spec.ts` | 540-561 | `it('anonymizes the row, wipes 2FA, …')` — keep the test, drop its 2FA assertions |
| `apps/api/src/modules/users/users.module.ts` | 7-8, 10-11 | doc-comment: "2FA management (setup/enable/disable)" and "reuse its exported TwoFactorService (TOTP + backup codes)" |
| `apps/api/src/modules/admin/admin-users.service.ts` | 44 | `twoFactorEnabled: u.twoFactorEnabled,` in `toAdminUser` |
| `apps/api/src/modules/admin/admin-users.service.ts` | 139-140 | `twoFactorEnabled: false, twoFactorSecret: null,` in the anonymise write |
| `apps/api/src/modules/admin/admin-users.service.spec.ts` | 16 | `twoFactorEnabled: false,` fixture |
| `apps/api/src/modules/auth/support/user.mapper.ts` | 6, 17 | doc "omits … twoFactorSecret"; `twoFactorEnabled: user.twoFactorEnabled,` |
| `apps/api/src/modules/auth/support/user.mapper.spec.ts` | — | 7 hits, all assertions on `twoFactorEnabled` |
| `apps/api/src/modules/auth/services/token.service.ts` | 71 | comment "Used at login and after 2FA" |
| `apps/api/src/common/decorators/sensitive-throttle.decorator.ts` | 10 | comment "e-mail codes, TOTP, reset tokens" |
| `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` | 51-54 | the allow-list comment lists `2fa/verify`, and the assertion `'modules/auth/auth.controller.ts:8'` must become `:7` |
| `apps/api/src/modules/invitations/invitations.service.spec.ts` | 60 | `twoFactorEnabled: false,` fixture |
| `apps/api/test/factories.ts` | 14-15 | `twoFactorEnabled: false, twoFactorSecret: null,` in `makeUser` |
| `apps/api/test/prisma-mock.ts` | — | **no change** — the double is a generic bag of delegates (`[delegate: string]: any`), nothing 2FA-specific |
| `apps/api/test/auth.e2e-spec.ts` | 1 | `import { generate } from 'otplib';` |
| `apps/api/test/auth.e2e-spec.ts` | 494-576 | the two 2FA e2e tests (`enables 2FA and completes a TOTP login challenge`, `rejects a 2FA challenge with a wrong code (401) and a backup code works`) |
| `apps/api/jest.config.js` | 8-10 | the `transform` comment about the otplib/@scure ESM chain |
| `apps/api/tsconfig.e2e.json` | 4-10 | the whole `allowJs`/`checkJs` block exists **only** for `@scure/base` under otplib — once otplib is gone this file can extend `tsconfig.spec.json` with no overrides |
| `apps/api/test/jest-e2e.json` | — | no `transformIgnorePatterns` present today; nothing to prune |
| `apps/web/src/app/(dashboard)/layout.tsx` | 2, 14 | `import { TwoFactorGate }` + `<TwoFactorGate />` |
| `apps/web/src/app/(dashboard)/profile/page.tsx` | 12, 59, 60 | `TwoFactorCard` import, `<TwoFactorCard user={user} />`, and one of the surrounding `<Separator />` |
| `apps/web/src/app/(dashboard)/admin/page.tsx` | 151 | `{u.twoFactorEnabled && <Badge variant="outline">2FA</Badge>}` |
| `apps/web/src/app/(auth)/login/page.tsx` | 8 | `ShieldCheck` from the lucide import |
| `apps/web/src/app/(auth)/login/page.tsx` | 12 | `TWO_FACTOR_TICKET_COOKIE` from the `@dontpanic/shared` import |
| `apps/web/src/app/(auth)/login/page.tsx` | 19 | `api` (only the verify call uses it) and `LoginResponse` narrowing at line 40 |
| `apps/web/src/app/(auth)/login/page.tsx` | 23 | `import { clearCookie, readCookie } from '@/lib/cookies';` (2FA-only in this file) |
| `apps/web/src/app/(auth)/login/page.tsx` | 40 | `type LoginUserResponse = Extract<LoginResponse, { user: unknown }>` |
| `apps/web/src/app/(auth)/login/page.tsx` | 56-59 | `ticket` / `code` / `verifying` state |
| `apps/web/src/app/(auth)/login/page.tsx` | 87-118 | the `?twofactor=1` cookie-handoff `useEffect` (**oauth-only path** — see (k)) |
| `apps/web/src/app/(auth)/login/page.tsx` | 148-151 | `if ('twoFactorRequired' in res && res.twoFactorRequired) { setTicket(res.ticket); return; }` |
| `apps/web/src/app/(auth)/login/page.tsx` | 170-190 | `onVerify` |
| `apps/web/src/app/(auth)/login/page.tsx` | 192-233 | the entire `if (ticket) { return <Card key="login-2fa"> … }` branch |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 59-60 | `twoFactorTitle` / `twoFactorSubtitle` in the messages fixture (and `code`/`verify` at 62-63 become dead) |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 146-160 | `it('swaps to the 2FA step when the API requires it')` |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 190-256 | the three 2FA-completion tests |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 340-406 | `describe('LoginPage — second factor after social sign-in')` (2fa × oauth) |
| `apps/web/src/lib/cookies.test.ts` | 22-23, 32-34, 62-66 | `dp_2fa_ticket` literals → swap for any cookie name |
| `apps/web/vitest.config.mts` | 23-36, 47-52 | no 2FA file is named; `src/app/(auth)/login/**/*.tsx` and `src/components/ui/**` stay. The statements floor of 99 is computed against a login page that still has the 2FA branch — **re-measure after pruning** |
| `apps/api/jest.config.js` | 47-53 | same caveat for the API thresholds (97/92/100/97) |
| `apps/web/src/proxy.ts` | 9-21 | `/setup-2fa` is **not** in `PRE_AUTH_PREFIXES` — nothing to remove; the route simply stops existing |

### (c) PRISMA

`apps/api/prisma/schema/auth.prisma`

- **lines 68-78** — delete `model TwoFactorBackupCode` entirely.

`apps/api/prisma/schema/tenancy.prisma`

- **line 170** — `twoFactorEnabled Boolean @default(false)` — ORPHANED, drop.
- **line 171** — `twoFactorSecret String?` — ORPHANED, drop.
- **line 172** — `twoFactorRemindAt DateTime?` (`// optional-mode: when to next nudge about enabling 2FA`) — ORPHANED, drop.
- **line 184** — `backupCodes TwoFactorBackupCode[]` relation on `User` — drop.

INVERTED INVARIANT check: `User.passwordHash` is nullable **because of OAuth, not 2FA** —
`tenancy.prisma:158-163` says so ("Null for an account that only signs in through a provider"),
and `apps/api/prisma/migrations/20260912120000_invitations_and_oauth/migration.sql:16-24` is the
migration that dropped `NOT NULL`. 2FA removal must not touch it.

No enum is 2FA-specific (`SessionEndReason` at `auth.prisma:11-20` is refresh-rotation, not 2FA).

### (d) packages/shared

`packages/shared/src/auth.ts`

- 44-49 `twoFactorChallengeSchema` + `TwoFactorChallenge`
- 51-56 `twoFactorVerifySchema` + `TwoFactorVerifyInput`
- 58-61 `twoFactorEnableSchema` + `TwoFactorEnableInput`
- 63-75 `twoFactorDisableSchema` + `TwoFactorDisableInput`
- 77-82 `twoFactorSetupResponseSchema` + `TwoFactorSetupResponse`
- 84-88 `twoFactorEnableResponseSchema` + `TwoFactorEnableResponse`
- 96-101 `loginResponseSchema` union → collapses to `authUserResponseSchema`; `LoginResponse` should become an alias of `AuthUserResponse` (many call-sites import `LoginResponse`)
- **141-155 `TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket'`** — the cookie-name constant

`packages/shared/src/user.ts`

- 20 `twoFactorEnabled: z.boolean(),` in `userDtoSchema` — ORPHANED
- 26-32 `securityStatusSchema` + `SecurityStatus`
- 85 `twoFactorEnabled: z.boolean(),` in `adminUserSchema` — ORPHANED
- 131-132 doc-comment "Secrets (password hash, 2FA secret, backup codes, …) are deliberately excluded"

`packages/shared/src/permissions.ts` — **no entry to remove**; `permissionModules` (line 11) has no
2FA module.

`packages/shared/src/index.ts` — no change (barrel re-exports whole files).

### (e) WEB

Routes gone: `/setup-2fa` (`apps/web/src/app/setup-2fa/page.tsx`).
No nav/menu entry exists (`app-sidebar.tsx`, `user-menu.tsx` have no 2FA link — verified by grep).
Proxy/middleware: no allow-list entry (see (b)).

i18n — prune **identically** in `apps/web/messages/pt-BR.json` and `apps/web/messages/en-US.json`
(line numbers are the same in both files; `apps/web/src/i18n/messages.test.ts:18-25` enforces
deep-key parity):

| namespace / key path | pt-BR lines | en-US lines |
| --- | --- | --- |
| `auth.login.twoFactorTitle` | 36 | 36 |
| `auth.login.twoFactorSubtitle` | 37 | 37 |
| `auth.login.code` | 38 | 38 |
| `auth.login.verify` | 39 | 39 |
| `profile.twoFactor.*` (whole block: `title`, `enabled`, `disabled`, `enable`, `disable`, `scan`, `enterCode`, `backupTitle`, `backupHint`, `enabledToast`, `disabledToast`) | 190-202 | 190-202 |
| `twoFactorPrompt.*` (top-level: `title`, `body`, `enable`, `later`, `requiredTitle`, `requiredBody`) | 332-339 | 332-339 |
| `twoFactorSetup.*` (top-level: `scanTitle`, `scanBody`, `secretLabel`, `copied`, `codeLabel`, `enable`, `enabled`, `invalidCode`, `error`, `backupTitle`, `backupBody`, `download`, `done`) | 340-354 | 340-354 |

Keep `auth.verify.*` (email verification) and `profile.sessions.*` — unrelated.

### (f) ENV

`.env.example`

- **75-79** — the whole `# 2FA (TOTP)` block: `TOTP_ISSUER=DontPanic`, the two comment lines, `TWO_FACTOR_REQUIRED=false`
- **101-102** — the rate-limit comment lists `2fa/verify` among the sensitive routes; edit the prose

`apps/api/src/config/env.ts`

- **40** `TOTP_ISSUER: z.string().default('DontPanic'),`
- **41-43** the 2FA comment + `TWO_FACTOR_REQUIRED: boolish(false),`
- **80-81** comment "(login, register, password reset, 2FA)" — prose only

`validateEnv()` — **nothing conditional to remove**. There is no 2FA branch in
`env.ts:234-285`; the only conditionals are captcha (242-247) and OAuth (249-282).

`apps/api/src/config/env.spec.ts`

- **26** `expect(env.TOTP_ISSUER).toBe('DontPanic');` inside the defaults test

### (g) SEED

`apps/api/prisma/seed.ts` — **no change**. Grep for `twoFactor|2fa|TOTP` over the file returns
nothing; the seeded users leave the 2FA columns at their schema defaults.

### (h) CLAUDE.md + README.md

CLAUDE.md:

- line 4 — the intro blurb lists "auth, 2FA, perfil…": drop "2FA"
- line 73 — bullet inside **Autenticação (resumo)** (69-80): "**CSRF** double-submit nas mutações. **2FA TOTP** + códigos de backup. **Lockout** por tentativas." → remove the 2FA sentence
- lines 110-115 — inside **Multi-tenancy › As regras** (99-123): the "Guard que lê o banco" bullet ends with "Foi exatamente assim que o `TwoFactorGateGuard` virou um no-op silencioso." Keep the rule, replace the example (it is the load-bearing warning for *any* DB-reading guard)
- lines 354-365 — inside **Login social › As decisões que não são negociáveis** (334-372): the entire "**Login social NÃO pula o 2FA**" bullet
- line 424 — inside **Rate limit** (412-458): `@SensitiveThrottle()` route list includes `2fa/verify`
- line 482 — inside **Convenções** (479-486): "**Nunca** retornar `passwordHash` / `twoFactorSecret`"
- line 511 — **Travas deliberadas** table, `node >=24.9` row: the reason is "O Jest só carrega ESM nativamente com `require(esm)`", which exists for the otplib/@scure chain. Re-justify or drop
- line 519 — **Testes** (517-541): "fluxos signup→verify→login→refresh→logout, **2FA**, lockout, CSRF"
- **O que NÃO fazer (558-587) — individual bullets belonging to 2fa:**
  - **line 580-581** — "Não emitir sessão num callback de OAuth sem checar `twoFactorEnabled` — o `TwoFactorGateGuard` não cobre isso…" (2fa × oauth; goes with either removal)

README.md:

- line 12 — badge line "RLS no Postgres, auth, 2FA, planos…"
- line 57 — pt intro "junto com auth, 2FA, perfis…"
- line 180 — pt **Autenticação e controle de acesso** bullet: "**2FA TOTP** + códigos de backup"
- lines 184-185 — pt `[!WARNING]` "nunca retorna `passwordHash` nem `twoFactorSecret`"
- line 295 — pt **Testes**: "…logout, 2FA, lockout, CSRF…"
- line 353 — en intro "alongside auth, 2FA, profiles…"
- line 477 — en bullet "**TOTP 2FA** + backup codes"
- lines 481-482 — en `[!WARNING]` mirror
- line 594 — en **Testing** mirror

### (i) NPM DEPS

| dep | file:line | becomes unused? |
| --- | --- | --- |
| `otplib` | `apps/api/package.json:57` | **YES** — only importers are `two-factor.service.ts:3` (`generateSecret, generateURI, verify`) and `apps/api/test/auth.e2e-spec.ts:1` (`generate`). Both go. |
| `qrcode` | `apps/api/package.json:61` | **YES** — only importer is `two-factor.service.ts:4` (`toDataURL`). |
| `@types/qrcode` | `apps/api/package.json:75` | **YES** — pairs with the above. |
| `argon2` | `apps/api/package.json:50` | NO — also `auth.service.ts:10`, `users.service.ts:11`, `signup.service.ts:3`, `admin-users.service.ts`, `crypto.util.ts`. |
| root / web / shared `package.json` | — | no 2FA deps. |

Follow-on: with `otplib` gone the `@scure/base` ESM workaround becomes dead
(`apps/api/tsconfig.e2e.json:4-10`, `apps/api/jest.config.js:8-10`), and the `node >=24.9` engine
floor loses its stated justification (CLAUDE.md:511).

### (j) MIGRATION SQL for the baseline

**Auto-regenerated by `prisma migrate diff` from the pruned schema** (so the generator emits nothing
by hand; it just must not emit these):

- `20260613074545_init/migration.sql:13-14` — `"twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,` / `"twoFactorSecret" TEXT,` on `users`
- `20260613074545_init/migration.sql:65-73` — `CREATE TABLE "two_factor_backup_codes" (…)`
- `20260613074545_init/migration.sql:113` — `CREATE INDEX "two_factor_backup_codes_userId_idx" ON "two_factor_backup_codes"("userId");`
- `20260613074545_init/migration.sql:131` — `ALTER TABLE "two_factor_backup_codes" ADD CONSTRAINT "two_factor_backup_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;`
- `20260613122947_two_factor_remind_at/migration.sql:2` — `ALTER TABLE "users" ADD COLUMN "twoFactorRemindAt" TIMESTAMP(3);` — this **whole migration file** exists only for 2FA and vanishes from a baseline anyway

**HAND-WRITTEN SQL that must be preserved verbatim, minus one array element**
(`20260911105200_row_level_security/migration.sql:96-122`):

```sql
CREATE OR REPLACE FUNCTION app.apply_user_owned_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'refresh_tokens', 'password_reset_tokens',
      'email_verification_tokens', 'two_factor_backup_codes'
    ] LOOP
      ...
```

→ line 103 becomes `'email_verification_tokens'` (drop `, 'two_factor_backup_codes'`). Everything
else in that file — `app.current_tenant_id()`, `app.is_platform_admin()`, `app.is_system()`,
`app.tenant_visible()`, `app.apply_tenant_rls()`, `SELECT app.apply_tenant_rls();`,
`SELECT app.apply_user_owned_rls();`, and the `permissions` profile-child DO block (125-140) — is
2FA-independent and stays byte-for-byte. Likewise all of
`20260911105300_app_role/migration.sql` (the `dontpanic_app` role, grants, default privileges,
`REVOKE ALL ON _prisma_migrations`) is untouched.

**Note the ordering trap:** because `app.apply_user_owned_rls()` is defined *with* the table list
baked in, the generator must emit the edited function body — it cannot emit the original and then
"fix" it.

### (k) DEPENDENCIES on other features

**Does the OAuth callback depend on 2FA? — YES, hard.**

`apps/api/src/modules/auth/oauth/oauth.service.ts`:

- 17 — `TWO_FACTOR_TICKET_COOKIE` imported from `@dontpanic/shared`
- 66-78 — `CallbackOutcome` union member `| { kind: 'two-factor'; ticket: string }` with the comment
  "`TwoFactorGateGuard` does not close this — it only checks that 2FA is *enabled*, never that this
  session passed it."
- 228-242 — `if (outcome.kind === 'two-factor') { reply.setCookie(TWO_FACTOR_TICKET_COOKIE, outcome.ticket, this.twoFactorTicketCookie()); return `${WEB_ORIGIN}/login?twofactor=1`; }`
- 325-331 — `if (user.twoFactorEnabled) { const ticket = await this.auth.createLoginTicket(user.id); await this.audit(tx, 'auth.oauth.2fa_required', …); return { kind: 'two-factor', ticket }; }`
- 642-653 — `private twoFactorTicketCookie(): CookieSerializeOptions` — whose `maxAge` is
  `AuthService.LOGIN_TICKET_TTL` (`oauth.service.ts:651` → `auth.service.ts:653`)

**If 2fa is removed and oauth stays**, the oauth path loses: the `'two-factor'` union member and
both its handlers, `twoFactorTicketCookie()`, the `AuthService.LOGIN_TICKET_TTL` reference, and the
`auth.oauth.2fa_required` audit action. `resolveIdentity` then always falls through to
`issueTokensForUser` → `{ kind: 'session' }`. The `AuthModule`'s `exports: [AuthService]`
(`auth.module.ts:57-60`) exists *specifically* for `createLoginTicket`; if nothing else in
`OAuthModule` needs `AuthService`, that export becomes prunable too. On the web side,
`apps/web/src/app/(auth)/login/page.tsx:87-118` and
`apps/web/src/app/(auth)/login/login.test.tsx:340-406` go with it. **Emitting oauth without this
branch is a documented security regression** — CLAUDE.md:354-365 and the "O que NÃO fazer" bullet at
CLAUDE.md:580-581.

**If 2fa stays and oauth is removed**, the two-factor ticket is still fully used by password login:
`auth.service.ts:265-269` mints it (`createLoginTicket`, line 341) and returns it in the **response
body** (`auth.controller.ts:103-105`), and `auth.service.ts:347-397` (`verifyTwoFactor`) consumes
it at `POST /auth/2fa/verify` (`auth.controller.ts:111-126`). The web login page reads it from the
mutation result at `login/page.tsx:148-151`. **However**, `TWO_FACTOR_TICKET_COOKIE`
(`packages/shared/src/auth.ts:155`) exists *only* for the redirect channel — its doc-comment says
"Only social sign-in needs it" (auth.ts:150-154) — so the constant, the cookie-handoff
`useEffect` (`login/page.tsx:87-118`) and `login/page.tsx:23`'s `readCookie`/`clearCookie` import
come out with oauth, while everything else 2FA stays.

**Does `TwoFactorGateGuard` read the DB and need `forTenant` scope? — YES.**
`apps/api/src/modules/auth/guards/two-factor-gate.guard.ts:16-22` (doc) and 46-57 (code):

```ts
    const read = (tx: { user: { findUnique: PrismaService['user']['findUnique'] } }) =>
      tx.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });

    // A SUPERADMIN has no tenant, so it reads in platform scope; everyone else
    // in their own company's.
    const dbUser = await (tenantId
      ? this.prisma.forTenant(tenantId, read)
      : this.prisma.asPlatform(read));

    if (!dbUser || !dbUser.twoFactorEnabled) {
      throw new ForbiddenException('two_factor_setup_required');
    }
```

with the doc: *"Reading through `prisma.db` here would fall through to the unscoped base client,
where RLS returns no rows — the user would look absent and the gate would wave everyone through
with 2FA required. It fails closed instead."* This is the incident CLAUDE.md:115 names. Removing the
guard removes the only in-repo *worked example* of the rule; the rule itself (CLAUDE.md:110-115)
must survive with a different illustration.

**Other couplings:** `PermissionGuard`, `TenantStatusGuard`, `JwtAuthGuard`, invitations, plans,
captcha and the queue are all 2FA-independent (no hits in those files).

---

## F4 · files — upload + storage

### Three removal levels — definitions used below

- **(i) local-only** — keep `FilesModule`, keep `StorageProvider` port, keep `LocalStorageAdapter`; delete `S3StorageAdapter` + spec, the `S3_*` envs, MinIO from compose, `@aws-sdk/client-s3`. `STORAGE_DRIVER` collapses to the single literal `local`.
- **(ii) no uploads at all** — delete `FilesModule`, `core/storage/**`, `infra/storage/**`, `@fastify/multipart` registration, `User.avatarUrl`, avatar UI, `avatarResponseSchema`, all `STORAGE_*`/`S3_*`/`LOCAL_STORAGE_*` envs, MinIO.
- **(iii) port kept, no avatar UI** — level (ii) minus the API side: keep `core/storage/**` + `infra/storage/**` + `StorageModule` in `app.module.ts`, delete `modules/files/**` and the web avatar card. Nothing else in the repo injects `STORAGE_PROVIDER` (verified: `apps/api/src/modules/files/services/avatar.service.ts:16` is the **only** injection site), so this level ships an unreachable port.

### (a) EXCLUSIVE FILES — delete whole

**Level (ii) — everything below. Level (i) — only the two `s3-*` rows. Level (iii) — the `modules/files/**` rows + web rows.**

| Path | Notes |
| --- | --- |
| `apps/api/src/modules/files/files.controller.ts` | only controller on `users/me/avatar` (`:23`) |
| `apps/api/src/modules/files/files.module.ts` | |
| `apps/api/src/modules/files/services/avatar.service.ts` | |
| `apps/api/src/modules/files/services/avatar.service.spec.ts` | tests only `AvatarService` |
| `apps/api/src/modules/files/support/image-sniff.ts` | `sniffImageType` imported only by `avatar.service.ts:6` |
| `apps/api/src/modules/files/support/image-sniff.spec.ts` | |
| `apps/api/src/core/storage/storage.provider.ts` | port (level ii only) |
| `apps/api/src/infra/storage/storage.module.ts` | (level ii only) |
| `apps/api/src/infra/storage/local-storage.adapter.ts` | (level ii only) |
| `apps/api/src/infra/storage/local-storage.adapter.spec.ts` | (level ii only) |
| `apps/api/src/infra/storage/s3-storage.adapter.ts` | **level (i) and (ii)** |
| `apps/api/src/infra/storage/s3-storage.adapter.spec.ts` | **level (i) and (ii)** |
| `apps/web/src/components/profile/avatar-card.tsx` | levels (ii)+(iii) |
| `apps/web/src/components/ui/avatar.tsx` | levels (ii)+(iii) — **but see seam: `user-menu.tsx:53-58` also uses it**; keep the primitive if the user menu keeps its initials avatar (recommended: keep `avatar.tsx` + `.test.tsx` + `.stories.tsx`, drop only `avatarUrl` usage at `user-menu.tsx:54`) |
| `apps/web/src/components/ui/avatar.test.tsx` | only if `avatar.tsx` goes |
| `apps/web/src/components/ui/avatar.stories.tsx` | only if `avatar.tsx` goes |

No e2e spec targets the avatar route (grep of `apps/api/test/**` for `avatar` returns only `test/factories.ts:11`).

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | `18` (`import { StorageModule }`), `110` (`StorageModule,`) | level (ii) only |
| `apps/api/src/app.module.ts` | `30` (`import { FilesModule }`), `118` (`FilesModule,`) | levels (ii)+(iii) |
| `apps/api/src/main.ts` | `14` (`import fastifyMultipart from '@fastify/multipart'`), `93-96` (`await app.register(fastifyMultipart, { limits: { fileSize: 5_000_000, files: 1 } })`) | levels (ii)+(iii). **This is the only multipart registration in the repo.** |
| `apps/api/src/main.ts` | — | **NO static file serving exists.** `@fastify/static` is declared at `apps/api/package.json:38` but never imported anywhere (verified by grep). So `LOCAL_STORAGE_PUBLIC_URL` (`env.ts:70`, default `http://localhost:3001/files`) points at a route the API never serves — the local adapter writes files nobody can fetch. Pre-existing bug; a generator emitting level (i) local-only **must add** `@fastify/static` wiring or the avatars 404. |
| `apps/api/src/health/health.module.ts` | — | **no change** — health has no storage indicator |
| `apps/api/src/health/health.controller.ts` | `24-28` | **no change** — checks are `database`, `cache`, `queue` only; storage is NOT enumerated |
| `apps/api/src/modules/users/**` | `apps/api/src/modules/users/users.module.ts` (whole file) | **no change** — `UsersModule` never imports `FilesModule`; the avatar routes live under `@Controller('users/me/avatar')` in `FilesController`, registered independently |
| `apps/api/src/modules/users/services/users.service.ts` | `424` (`avatarUrl: null,` in the LGPD-erasure anonymisation block `417-429`) | levels (ii) only — line deleted with the column |
| `apps/api/src/modules/admin/admin-users.service.ts` | `138` (`avatarUrl: null,` in the admin soft-delete anonymisation `132-143`) | levels (ii) only |
| `apps/api/src/modules/auth/support/user.mapper.ts` | `14` (`avatarUrl: user.avatarUrl,`) | levels (ii) only |
| `apps/api/src/modules/auth/support/user.mapper.spec.ts` | `10`, `22`, `55-57` | levels (ii) only |
| `apps/api/src/modules/auth/oauth/oauth.service.spec.ts` | `41` (`avatarUrl: null,` fixture) | levels (ii) only |
| `apps/api/src/modules/invitations/invitations.service.spec.ts` | `57` (`avatarUrl: null,` fixture) | levels (ii) only |
| `apps/api/src/modules/users/services/users.service.spec.ts` | `554` (`expect(updateCall.data.avatarUrl).toBeNull()`) | levels (ii) only |
| `apps/api/test/factories.ts` | `11` (`avatarUrl: null,`) | levels (ii) only |
| `apps/api/test/setup.ts` | `13` (`STORAGE_DRIVER: 'local',`) | level (ii): delete. Level (i): keep (still the only literal). |
| `apps/api/test/e2e-setup.ts` | `32` (`process.env.STORAGE_DRIVER = 'local';`) | same as above |
| `apps/api/test/e2e-app.ts` | `66` (comment "we deliberately skip helmet/multipart/swagger/cors") | wording only; e2e never registered multipart, so nothing functional |
| `apps/api/test/prisma-mock.ts` | — | **no change** — generic delegate bag, no avatar/storage knowledge |
| `apps/web/src/app/(dashboard)/profile/page.tsx` | `8` (`import { AvatarCard }`), `51` (`<AvatarCard user={user} />`) | levels (ii)+(iii). Route `/profile` **stays** (name/email/password/2FA/sessions/danger cards remain). |
| `apps/web/src/components/user-menu.tsx` | `7` (import of `Avatar*`), `54` (`{user.avatarUrl && <AvatarImage …>}`) | level (ii): line `54` must go with the DTO field. Recommend keeping `Avatar`+`AvatarFallback` for initials. |
| `apps/web/src/lib/api.ts` | `187-199` (`apiUpload`) | levels (ii)+(iii) — `apiUpload` has exactly one production caller, `avatar-card.tsx:64` |
| `apps/web/src/lib/api.test.ts` | `290-320` (the two `apiUpload` tests, incl. `294`, `299-303`, `317`) | same |
| `apps/web/src/proxy.ts` | — | **no change** — no file/upload branch; `matcher` at `:64` already excludes `/api` |
| `apps/web/src/app/api/[...path]/route.ts` | — | **no change** — the BFF forwards bodies generically (`89-95`, `arrayBuffer` + `duplex:'half'`), no multipart special-casing |
| `docker-compose.yml` | `35-52` (`minio` service), `54-67` (`minio-setup` bucket bootstrap), `84` (`minio_data:` volume) | levels (i)-drop-s3 and (ii). Level (i) local-only also drops MinIO. |
| `docker-compose.dev.yml` | `63-64` (`S3_ENDPOINT`, `S3_PUBLIC_URL` in `api`), `99` (`S3_ENDPOINT` in `worker`) | levels (i)+(ii) |
| `Dockerfile.api` | — | **no change** for files |
| `Dockerfile.web` | — | **no change** |
| `apps/api/package.json` | `28` `@aws-sdk/client-s3`, `30` `@aws-sdk/s3-request-presigner`, `36` `@fastify/multipart`, `38` `@fastify/static`, `64` `sharp` | see (i) NPM DEPS |
| `apps/api/jest.config.js` | `47-54` (`coverageThreshold` 97/92/100/97) | advisory: deleting the four heavily-covered adapter/service files shifts the global percentages; the generator should re-measure or emit slightly lower floors |
| root `package.json`, `turbo.json` | — | **no change** for files |

### (c) PRISMA

| file | line | field | load-bearing elsewhere? |
| --- | --- | --- | --- |
| `apps/api/prisma/schema/tenancy.prisma` | `165` | `User.avatarUrl String?` | Yes: `user.mapper.ts:14` → `UserDto.avatarUrl` (`packages/shared/src/user.ts:17`) → `user-menu.tsx:54`, `avatar-card.tsx:101,133`; anonymisation writes at `users.service.ts:424`, `admin-users.service.ts:138`. **Only level (ii) removes it.** |
| `apps/api/prisma/schema/tenancy.prisma` | `18` | `Plan.maxStorageMb Int?` | **NOT load-bearing for files.** Verified: `PlanLimitsService` enforces only `maxUsers` (`apps/api/src/modules/tenants/services/plan-limits.service.ts:91`, `109-110`) and the named JSON counters (`:130`+). No byte/storage counting exists anywhere. `maxStorageMb` is a pure display column: `platform-plans.service.ts:19,69`, `tenants.service.ts:74`, `packages/shared/src/tenant.ts:155,277`, `apps/web/src/app/platform/plans/page.tsx:146`, `plan-form-dialog.tsx:51,67,85,153,249-255`. It belongs to the **plans** feature, not files — a generator removing files should leave it alone, or remove it only when plans is also trimmed. |
| `apps/api/prisma/schema/tenancy.prisma` | `106` | `TenantBranding.logoUrl String?` | **Independent of files.** No upload path writes it: it is a free-text URL, set through `tenants.service.ts:96` from `tenantBrandingSchema` (`packages/shared/src/tenant.ts:130,139`) and read at `tenants.service.ts:84,108`. Belongs to the **tenant branding** feature. Do NOT remove with files. |

No model is exclusive to files; **files adds no table**. No `@@index`, no RLS policy, no partial index.

### (d) packages/shared

| file | line(s) | out |
| --- | --- | --- |
| `packages/shared/src/user.ts` | `17` (`avatarUrl: z.string().url().nullable(),` inside `userDtoSchema`) | level (ii) |
| `packages/shared/src/user.ts` | `58-62` (`avatarResponseSchema` + `type AvatarResponse`) | levels (ii)+(iii) — consumers: `files.controller.ts:12,41,59`, `avatar.service.ts:3,28,69`, `avatar-card.tsx:8,64` |

`packages/shared/src/index.ts:8` is `export * from './user'` — **no export-list change needed** (the barrel is star-exports only, lines `6-14`).

### (e) WEB

- **App Router routes:** none removed. `/profile` (`apps/web/src/app/(dashboard)/profile/page.tsx`) survives minus `AvatarCard`.
- **Nav entries:** none. `apps/web/src/components/app-sidebar.tsx:18` (`/profile`) is unaffected.
- **i18n namespaces/keys out** (both `apps/web/messages/pt-BR.json` and `apps/web/messages/en-US.json`, identical line numbers — they are parity-tested by `apps/web/src/i18n/messages.test.ts:18-25`):
  - `profile.avatar` — whole object, lines **162-167** in both files: `profile.avatar.title`, `profile.avatar.upload`, `profile.avatar.remove`, `profile.avatar.hint`. Remove the trailing comma bookkeeping so `profile.nameSection` (line 168) still parses.
  - `dashboard.features.swappable.body` — line **145** in both — text mentions storage ("Banco, storage e e-mail trocáveis por uma variável." / "Swap database, storage and email with one variable."). Reword, don't delete the key (the card is generic).
  - Do **not** remove `platform.plans.form.maxStorageMb` (line **486**) or `platform.plans.limitsSummary` (line **470**) with files — see (c); they belong to plans.
- Parity rule: both locale files must be edited in the same commit or `messages.test.ts` fails naming the orphan key.

### (f) ENV

`.env.example`:

| lines | out |
| --- | --- |
| `11-12` | `MINIO_PORT=4204`, `MINIO_CONSOLE_PORT=4205` (levels i+ii) |
| `22` | `STORAGE_DRIVER=s3          # s3 \| local` — level (ii) delete; level (i) becomes `STORAGE_DRIVER=local` with the comment collapsed |
| `27-29` | `# Local storage adapter` header + `LOCAL_STORAGE_DIR`, `LOCAL_STORAGE_PUBLIC_URL` — level (ii) only |
| `89-96` | `# S3 / MinIO (console at …)` block: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, `S3_PUBLIC_URL` — levels (i)+(ii) |

`apps/api/src/config/env.ts`:

| lines | out |
| --- | --- |
| `46` | `STORAGE_DRIVER: z.enum(['s3','local']).default('s3')`. **Level (i):** becomes `z.enum(['local']).default('local')` — or drop the key entirely and hard-wire the adapter, which is cleaner since a one-member enum is a knob with one position. **Level (ii):** delete. |
| `59-66` | the `// --- s3 / minio ---` block (7 keys) — levels (i)+(ii) |
| `68-70` | the `// --- local storage adapter ---` block (2 keys) — level (ii) only |

`validateEnv` conditional logic (`env.ts:234-285`): **no storage branch exists.** Unlike captcha (`242-247`) and OAuth (`252-282`), storage has no cross-field validation — nothing to prune. Note the asymmetry: a level-(i) generator gets no boot-time protection against an operator setting `STORAGE_DRIVER=s3` on a build that has no S3 adapter; the Zod enum is the only gate, and it does fail parse, which is adequate.

`apps/api/src/config/env.spec.ts`:

| line | out |
| --- | --- |
| `22` | `expect(env.STORAGE_DRIVER).toBe('s3');` — level (i): change to `'local'`; level (ii): delete the line |

**Driver enum implications:**
- `STORAGE_DRIVER` — removing the `s3` literal makes `storage.module.ts:15-29` a single branch (the `if (… === 'local')` guard and its `else`-path `S3StorageAdapter` construction both collapse to a bare `new LocalStorageAdapter(...)`). Removing the whole feature removes the enum.
- `MAIL_DRIVER` (`env.ts:47`) is untouched by files — **but note `@aws-sdk/client-ses` is the mail SES adapter's dependency, not storage's.** See (i).
- `CACHE_DRIVER` / `QUEUE_DRIVER` — unaffected by files.

### (g) SEED

`apps/api/prisma/seed.ts`: **no change.** Grepped for `storage|minio|s3|avatar` — zero hits. The seeded plan (`:22-34`) sets `maxUsers: 5` (`:31`) and never `maxStorageMb`. No user gets an `avatarUrl`.

### (h) CLAUDE.md + README.md to prune

`CLAUDE.md`:

| heading / span | lines | action |
| --- | --- | --- |
| intro blurb | `4-5` | drop "arquivos" from the built-in list |
| TL;DR | `15` | `docker compose up -d # postgres, redis, minio, mailpit` → drop `minio` |
| TL;DR service ports list | `26-28` | drop `MinIO :4204 / console :4205`; renumber nothing (ports are fixed literals) |
| Arquitetura — Ports & Adapters **table** | row at **`55`** = `\| Storage \| StorageProvider \| s3 (AWS/MinIO/R2), local \| STORAGE_DRIVER \|`. Level (i): rewrite adapters cell to `local`. Level (ii): delete the row. Other rows for reference: `56` E-mail, `57` Cache, `58` Banco, `59` Captcha, `60` Jobs | |
| Arquitetura bullets | `65` | "Em teste, use `memory` / `console` / `local`…" — drop `local` at level (ii) |
| Testes | `519` | "mocka Prisma/cache/mail/storage" → drop `storage` |
| Docker | `545` | "sobe Postgres/Redis/MinIO/Mailpit" → drop MinIO |
| O que NÃO fazer | — | **no files-specific bullet exists** in `558-587` |

`README.md`:

| lines | action |
| --- | --- |
| `57` | pt intro: drop "upload de arquivos" |
| `80` | pt bullet `- **Perfis e arquivos** — …uploads atrás de um driver de storage trocável.` → reword to profiles only |
| `90` | pt quick-start comment: drop `minio` |
| `247` | pt ports table Storage row — rewrite (level i) or delete (level ii) |
| `276-277` | pt services table: `277` MinIO row out; `276` Redis row stays (cache/throttler) |
| `281` | pt: "Postgres/Redis/MinIO/Mailpit" → drop MinIO |
| `293` | pt testing: "mocando Prisma/cache/mail/storage" → drop storage |
| `305` | pt docker: drop MinIO |
| `353` | en intro: drop "file uploads" |
| `375` | en bullet `- **Profiles & files** — …uploads behind a swappable storage driver.` |
| `385` | en quick-start comment: drop `minio` |
| `546` | en ports table Storage row |
| `575-576` | en services table: `576` MinIO row out |
| `580` | en: drop MinIO |
| `592` | en testing: drop storage |
| `604` | en docker: drop MinIO |

### (i) NPM DEPS

| dep | declared at | verdict |
| --- | --- | --- |
| `@aws-sdk/client-s3` | `apps/api/package.json:28` | **Removable at level (i) and (ii).** Sole usage `apps/api/src/infra/storage/s3-storage.adapter.ts:1` (+ its spec's `jest.mock` at `:8`). Also drop `pnpm-workspace.yaml:37` (`minimumReleaseAgeExclude: '@aws-sdk/client-s3@3.1068.0'`). |
| `@aws-sdk/client-ses` | `apps/api/package.json:29` | **KEEP.** Used by `apps/api/src/infra/mail/ses-mail.adapter.ts:1` — that is the **mail** feature's SES adapter, a different generator flag. Do not remove with files. `pnpm-workspace.yaml:38` stays with it. |
| `@aws-sdk/s3-request-presigner` | `apps/api/package.json:30` | **Already dead.** Zero imports anywhere in `apps/**`/`packages/**`. Remove regardless of level; also `pnpm-workspace.yaml:39`. |
| `sharp` | `apps/api/package.json:64` | **Removable at levels (ii)+(iii).** Sole usage `apps/api/src/modules/files/services/avatar.service.ts:2,43`. Also remove `pnpm-workspace.yaml:33` (`allowBuilds: sharp: true`) and `:65` (`onlyBuiltDependencies: - sharp`). It is a native build, so dropping it measurably speeds a fresh `pnpm install`. **Keep at level (i)** (image normalisation is adapter-agnostic). |
| `@fastify/multipart` | `apps/api/package.json:36` | **Removable at levels (ii)+(iii).** Sole import `apps/api/src/main.ts:14`. |
| `@fastify/static` | `apps/api/package.json:38` | **Already dead** — zero imports. Remove at every level. (Conversely: a generator that ships level (i) local-only should *add* its wiring, because `LOCAL_STORAGE_PUBLIC_URL` is currently unserved.) |
| `@fastify/rate-limit` | `apps/api/package.json:37` | **Already dead** (throttling is `@nestjs/throttler`). Out of scope but worth flagging to the generator. |
| `@radix-ui/react-avatar` | `apps/web/package.json:20` | Removable only if `apps/web/src/components/ui/avatar.tsx` goes — which also costs the user-menu initials avatar (`user-menu.tsx:53-58`). Recommend **keeping**. |
| `@nestjs/terminus` | `apps/api/package.json:45` | **KEEP** for files (no storage indicator). See queue section for the queue case. |
| `ioredis`, `bullmq` | `apps/api/package.json:53,51` | Not files. See queue. |

### (j) MIGRATION SQL (single baseline)

Six migrations exist: `20260613074545_init` (134 L), `20260613122947_two_factor_remind_at` (2 L), `20260911105130_tenancy` (228 L), `20260911105200_row_level_security` (143 L), `20260911105300_app_role` (51 L), `20260912120000_invitations_and_oauth` (110 L).

**Files contributes no table, no index, no policy, no grant.** Everything it touches is a plain column that `prisma migrate diff` regenerates from the schema:

- `apps/api/prisma/migrations/20260613074545_init/migration.sql:10` — `"avatarUrl" TEXT,` inside `CREATE TABLE "users"` (`:5-22`). Regenerated. Level (ii) simply omits the column from the schema and the baseline never mentions it.
- `apps/api/prisma/migrations/20260911105130_tenancy/migration.sql:54` — `"maxStorageMb" INTEGER,` inside `CREATE TABLE "plans"` (`:45-64`). Regenerated; belongs to plans, not files.
- `apps/api/prisma/migrations/20260911105130_tenancy/migration.sql:103` — `"logoUrl" TEXT,` inside `CREATE TABLE "tenant_branding"` (`:100-112`). Regenerated; belongs to branding.

**Hand-written SQL preserved verbatim, unaffected by files** (quote as-is into the baseline): the whole of `20260911105200_row_level_security/migration.sql` — `CREATE SCHEMA IF NOT EXISTS app;` (`:19`), `app.current_tenant_id()` (`:23-26`), `app.is_platform_admin()` (`:28-31`), `app.is_system()` (`:33-36`), `app.tenant_visible(uuid)` (`:39-44`), `app.apply_tenant_rls()` (`:51-89`) and its call `SELECT app.apply_tenant_rls();` (`:91`), `app.apply_user_owned_rls()` (`:96-120`) + call (`:122`), the `permissions`/`profileId` DO-block (`:125-140`); and the whole of `20260911105300_app_role/migration.sql` (role creation `:14-23`, `GRANT`s `:25-31`, `ALTER DEFAULT PRIVILEGES` `:35-40`, the `_prisma_migrations` REVOKE `:45-51`).

Nothing in either file names a storage table, so the baseline's RLS section is byte-identical with or without files.

### (k) DEPENDENCIES on other features (files)

- **Does files depend on plans?** **No.** `Plan.maxStorageMb` exists (`tenancy.prisma:18`) and is surfaced in the platform UI, but **nothing enforces it**: `PlanLimitsService` reads only `plan.maxUsers` (`plan-limits.service.ts:91`, `109-110`) and the registered named counters (`:130`+, registry at `:65-71`). `AvatarService` never calls `PlanLimitsService` (`avatar.service.ts:14-17` injects only `PrismaService` and `STORAGE_PROVIDER`). So `maxStorageMb` is a dead limit and files can be removed without touching plans, and vice versa.
- **Does files depend on multi-tenancy?** **Only through the `User` row, not through the object key.** The key-builder is:

  ```ts
  // apps/api/src/modules/files/services/avatar.service.ts:19-21
  private avatarKey(userId: string): string {
    return `avatars/${userId}.webp`;
  }
  ```

  **Uploaded object keys are NOT tenant-scoped** — the prefix is flat `avatars/` and the discriminator is the user UUID. The only tenant enforcement is on the DB write: `this.prisma.db.user.update({ where: { id: userId } … })` (`:60-63`, `:71-74`), which runs inside the request's scoped transaction, so RLS confines *which user row* can be touched. The bucket itself has no tenant partition, and the MinIO dev bucket is made anonymously readable (`docker-compose.yml:64`, `mc anonymous set download local/dontpanic`) — so any avatar URL is world-readable by design. Consequence for the generator: a multi-tenancy-less build needs no key change, and a build that later adds tenant-scoped documents must NOT copy this key scheme.
- **Health check enumeration:** `health.controller.ts:24-28` registers exactly `database`, `cache`, `queue`. **Storage is not probed** — removing files changes no health output.
- **Does the redis cache / throttler depend on storage?** No. MinIO is independent of Redis.

---

## F5 · platform — the SUPERADMIN panel

> **Cross-feature preconditions for F5 / F6 / F7** — also enforced as I1–I3 in §5:
>
> 1. **`plans` cannot be removed while `platform` stays.** `apps/api/src/modules/platform/platform-plans.controller.ts` (whole file), `platform/services/platform-plans.service.ts` (whole file), `platform/services/platform-tenants.service.ts:169-175, 320-321` and `apps/web/src/app/platform/plans/page.tsx` are plan CRUD. `platform ⇒ plans` is a hard dependency unless the generator also strips those.
> 2. **`platform` can be removed while `plans` stays**, at the cost of leaving `Plan` write-only-by-seed (see (k)).
> 3. **`audit` (the table) cannot be removed while `platform` stays.** `platform/support/platform-audit.ts:26` is `tx.auditLog.create` and is the *only* audit writer in the repo whose failure is allowed to abort the business transaction (`platform-audit.ts:13-21`).


### (a) EXCLUSIVE FILES — delete whole

#### API (`apps/api`)
```
src/modules/platform/dto/platform.dto.ts
src/modules/platform/guards/superadmin.guard.ts
src/modules/platform/guards/superadmin.guard.spec.ts
src/modules/platform/platform-plans.controller.ts          # also (plans)
src/modules/platform/platform.controller.ts
src/modules/platform/platform.module.ts
src/modules/platform/services/platform-plans.service.ts    # also (plans)
src/modules/platform/services/platform-plans.service.spec.ts
src/modules/platform/services/platform-stats.service.ts
src/modules/platform/services/platform-stats.service.spec.ts
src/modules/platform/services/platform-tenants.service.ts
src/modules/platform/services/platform-tenants.service.spec.ts
src/modules/platform/support/platform-audit.ts             # also (audit)
src/modules/platform/support/platform-audit.spec.ts
src/modules/platform/support/platform-scope.ts
src/modules/platform/support/platform-scope.spec.ts
```
i.e. the whole `apps/api/src/modules/platform/` tree (16 files). Verified: nothing
outside that tree imports from it (`grep -rn "modules/platform"` → only
`apps/api/src/app.module.ts:33`).

#### Web (`apps/web`)
```
src/app/platform/layout.tsx
src/app/platform/page.tsx
src/app/platform/plans/page.tsx                 # also (plans)
src/app/platform/tenants/page.tsx
src/components/platform/change-plan-dialog.tsx  # also (plans)
src/components/platform/create-tenant-dialog.tsx
src/components/platform/create-tenant-dialog.test.tsx
src/components/platform/dialogs.test.tsx
src/components/platform/extend-trial-dialog.tsx
src/components/platform/plan-form-dialog.tsx    # also (plans)
src/components/platform/plan-form-dialog.test.tsx
src/components/platform/platform-api.ts
src/components/platform/platform-api.test.tsx
src/components/platform/signups-chart.tsx
src/components/platform/signups-chart.test.tsx
src/components/platform/stat-card.tsx
src/components/platform/stat-card.test.tsx
src/components/platform/suspend-tenant-dialog.tsx
src/components/platform/tenant-status-badge.tsx
src/components/platform/tenant-status-badge.test.tsx
src/components/platform/tenants-table.tsx
src/components/platform/tenants-table.test.tsx
```

**NOT exclusive — do not delete blindly:**
- `apps/web/src/components/platform/format.ts` + `format.test.ts` — `formatDate` is imported by `apps/web/src/components/admin/invitations-table.tsx:13`, which is an **invitations/admin** file. Either keep `format.ts` (moving it to `src/lib/`) or inline `formatDate` at that call site. This is the single cross-feature web import.
- `apps/web/src/components/charts/bar-chart.tsx` + `bar-chart.test.tsx` — becomes **orphaned** when platform goes: `signups-chart.tsx:4` is its only importer (`grep -rn "components/charts" apps/web/src` → 2 hits, both in `signups-chart.tsx`). It is hand-written SVG, no library. Generator choice: drop both files (and the `src/components/charts/**` line from the vitest coverage `include`) or keep as a sample component.

No `*.stories.tsx` exists for any platform file.

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 33 | `import { PlatformModule } from './modules/platform/platform.module';` |
| `apps/api/src/app.module.ts` | 121 | `PlatformModule,` from the `imports` array |
| `apps/api/src/infra/prisma/prisma.service.ts` | 85-87 | `case 'platform': await tx.$executeRaw\`SELECT set_config('app.platform_admin', 'on', true)\`; break;` inside `withScope` |
| `apps/api/src/infra/prisma/prisma.service.ts` | 110-113 | the whole `asPlatform<T>()` method + its `/** Crosses tenants. SUPERADMIN only… */` doc. **But see (k): `two-factor-gate.guard.ts:53` calls it.** Remove only after that guard is simplified. |
| `apps/api/src/infra/prisma/prisma.service.ts` | 37-64 | `assertNotSuperuser()` — **KEEP VERBATIM.** It is about the Postgres role (`rolsuper`/`rolbypassrls`), not about `Role.SUPERADMIN`. Nothing here belongs to the platform feature; removing it would silently disable all RLS. Only the word "superuser" is shared. |
| `apps/api/src/infra/tenancy/tenant-context.ts` | 8 | doc line `* - \`platform\` — SUPERADMIN in the /admin panel: crosses tenants.` |
| `apps/api/src/infra/tenancy/tenant-context.ts` | 13-14 | `TenantScope` union loses the `{ kind: 'platform' }` member → `{ kind: 'tenant'; tenantId: string } \| { kind: 'system' }` |
| `apps/api/src/infra/tenancy/tenant-context.ts` | 39-47 | `requireTenantId()` keeps its `scope.kind !== 'tenant'` guard unchanged (it already covers `system`); only the spec case `tenant-context.spec.ts:52-53` ("throws under the platform scope") goes |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.ts` | 47-56 | the ternary collapses: `user.role === 'SUPERADMIN' ? { kind: 'platform' } :` (lines 48-49) goes; the remaining shape is `user.tenantId ? { kind: 'tenant', tenantId } : null`. Keep the fail-closed `null` branch and its comment (52-54) **verbatim** — it is the "non-SUPERADMIN without a tenant" rule, which after removal becomes "any user without a tenant". |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.spec.ts` | 114-135, 187-193 | three cases: two platform-scope cases go; `'fails closed for a non-SUPERADMIN without a tenant'` (187) survives, reworded |
| `apps/api/src/modules/auth/guards/permission.guard.ts` | 35-38 | the `- **The SUPERADMIN does not pass.** …Their area is \`/api/platform/*\`.` doc bullet |
| `apps/api/src/modules/auth/guards/permission.guard.ts` | **66-68** | `if (resolved.platformOperator) { throw new ForbiddenException('The platform operator does not access company data.'); }` — **this is the "SUPERADMIN does NOT pass business routes" enforcement.** Both lines go together with `ResolvedPermissions.platformOperator`. |
| `apps/api/src/modules/auth/guards/permission.guard.spec.ts` | 95-100 | the `refuses the SUPERADMIN…` case |
| `apps/api/src/modules/auth/guards/tenant-status.guard.ts` | 29-32 | doc `…and so does the SUPERADMIN: they are the platform operator and belong to no company.` |
| `apps/api/src/modules/auth/guards/tenant-status.guard.ts` | **55** | `if (user.role === 'SUPERADMIN') return true;` — removing it makes line 58-60 (`throw new ForbiddenException('Your account is not associated with any company.')`) the path for a tenant-less user. Correct once `User.tenantId` is NOT NULL. |
| `apps/api/src/modules/auth/guards/tenant-status.guard.spec.ts` | 91-101 | the `refuses a non-SUPERADMIN carrying no company` case survives (reworded); `lets the SUPERADMIN through` (98-100) goes |
| `apps/api/src/modules/auth/guards/two-factor-gate.guard.ts` | 45-53 | the `tenantId ? forTenant(…) : asPlatform(read)` fork collapses to `this.prisma.forTenant(tenantId, read)`; comment 49-50 goes. **This is the only `asPlatform()` call site outside `modules/platform/`.** |
| `apps/api/src/modules/auth/guards/two-factor-gate.guard.spec.ts` | 75-79 | `reads in platform scope for a SUPERADMIN` case |
| `apps/api/src/modules/auth/services/token.service.ts` | 16-21 | the `tid` claim doc sentence `Absent for SUPERADMIN, who has no company.` Structurally `tid?: string \| null` **stays optional**: `mintWithId` (line 111) writes `tid: user.tenantId ?? null` and every `issueTokensFor*` signature takes `tenantId?: string \| null` (73-74, 85-86, 93-94, 102-103). Optional here is also what invitation-accept and OAuth signup rely on. Doc-only change. |
| `apps/api/src/common/decorators/current-user.decorator.ts` | 9-10 | `/** The user's company. Null only for SUPERADMIN, who belongs to none. */` + `tenantId?: string \| null;`. **Keep the field optional** — `AuthUser` is built from a JWT payload and `tenant-scope.interceptor.ts:50` / `tenant-status.guard.ts:57-60` both fail closed on absence. Only the doc changes. |
| `apps/api/src/modules/auth/services/profile-permissions.service.ts` | 15-16 | `/** Platform operator … */ platformOperator: boolean;` out of `ResolvedPermissions` |
| `apps/api/src/modules/auth/services/profile-permissions.service.ts` | 33 | `platformOperator: false,` out of `EMPTY` |
| `apps/api/src/modules/auth/services/profile-permissions.service.ts` | **69** | `if (user.role === 'SUPERADMIN') return { ...EMPTY, platformOperator: true };` |
| `apps/api/src/modules/auth/services/profile-permissions.service.ts` | 98 | `platformOperator: false,` in the resolved-profile return |
| `apps/api/src/modules/auth/services/profile-permissions.service.spec.ts` | 150-156, 201-203 | the two platform-operator cases |
| `apps/api/src/modules/auth/oauth/oauth.service.ts` | 286-291 | `if (user.deletedAt \|\| user.role === 'SUPERADMIN')` → `if (user.deletedAt)`; comment 286-288 loses its SUPERADMIN half |
| `apps/api/src/modules/auth/oauth/oauth.service.spec.ts` | 386-389 | `refuses a SUPERADMIN` case |
| `apps/api/src/modules/auth/services/signup.service.ts` | 77-78 | comment `Same helper the platform panel and the OAuth completion use…` → drop "the platform panel". No code change. |
| `apps/api/src/modules/tenants/**` | — | **No platform code lives here.** `tenant-provisioning.ts:8` comment names "the operator creating a company from the platform panel" (drop that clause); `tenant-provisioning.spec.ts:83` comment likewise. `tenants.controller.ts` / `tenants.service.ts` are the company's own screen and are untouched by platform removal. |
| `apps/api/src/common/crud/tenant-crud.ts` | — | **No seam.** Verified with `grep -n 'audit\|Audit\|plan\|Plan'` → zero hits. It only uses `TenantContext.requireTenantId()` (line 4 import), which is unaffected. |
| `apps/api/src/modules/invitations/invitations.controller.ts` | 30-32 | comment `SUPERADMIN is deliberately not in that list … the platform panel has its own door.` |
| `apps/api/src/modules/invitations/invitations.module.ts` | 18 | comment `Exports InvitationsService because it is composed elsewhere: the platform …` **and the `exports: [InvitationsService]` line itself.** Verified: `platform` is the ONLY external consumer — `grep -rn 'InvitationsService\|InvitationsModule' apps/api/src` outside `modules/invitations/` returns exactly `app.module.ts:120`, `platform/platform.module.ts:2,19`, `platform/services/platform-tenants.service.ts:20,74`, plus a prose mention at `admin/admin-users.service.ts:24`. With platform gone the export has no importer. |
| `apps/api/src/modules/invitations/invitations.service.ts` | 54-55, 103, 124 | comments referencing the platform panel; `INVITABLE_ROLES` / the `SUPERADMIN` rejection at 124 stays only if `Role.SUPERADMIN` survives (it does not — see (c)) |
| `apps/api/test/prisma-mock.ts` | 14 | doc line listing `asPlatform` among the pass-through helpers |
| `apps/api/test/prisma-mock.ts` | 23 | `asPlatform: jest.Mock;` from the mock interface |
| `apps/api/test/prisma-mock.ts` | 45 | `mock.asPlatform = jest.fn(async (fn) => fn(mock));` |
| `apps/api/test/e2e-app.ts` | 158-163 | the comment explaining why `invitations` is checked separately (`a company created from the platform panel has an invited first administrator and no account`). The **code** (155-164, `assertCleanStart` reading `invitation.findMany`) must stay: an ADMIN-issued invitation has the same property. |
| `apps/api/test/factories.ts` | 4-22 | `makeUser()` has **no** `tenantId`/`role: 'SUPERADMIN'` fixture (it hard-casts `as User`, line 22). No change needed. Note for the generator: because it is `as User`, dropping Prisma fields never breaks it. |
| `apps/api/test/tenant-isolation.e2e-spec.ts` | 38-46 | tenants are created with `status: 'ACTIVE'` and **no plan, no SUPERADMIN**. Nothing platform-specific; suite survives unchanged. |
| `apps/web/src/proxy.ts` | — | **No seam.** `PRE_AUTH_PREFIXES` (9-21) and `OPEN_PREFIXES` (29) contain no `/platform`; the panel is covered by the generic authed gate (48-53) and the matcher (64). Nothing to remove. |
| `apps/web/src/app/api/[...path]/route.ts` | — | the BFF is a catch-all `[...path]` proxy with **no per-route allowlist**; `/api/platform/*` needs no entry and leaves no seam. Verified: no occurrence of `platform` in that file. |
| `apps/web/src/components/app-sidebar.tsx` | 16-19, 27-32 | **No platform entry exists.** `NAV` is `/` + `/profile`; the only conditional is `user?.role === 'ADMIN' → /admin` (29-31). Nothing to delete here for platform. |
| `apps/web/src/components/user-menu.tsx` | 79-84 | **No platform entry.** Only `/profile` and logout. Nothing to delete. |
| `apps/web/src/components/admin/invitations-table.tsx` | 13 | `import { formatDate } from '@/components/platform/format';` → must be repointed |
| `apps/web/vitest.config.mts` | 32 | `'src/components/platform/**/*.{ts,tsx}',` out of coverage `include` |
| `apps/web/vitest.config.mts` | 29 | `'src/components/charts/**/*.{ts,tsx}',` — remove only if `charts/` is dropped too |
| `apps/web/vitest.config.mts` | 47-52 | coverage thresholds (99/88/95/99) — recalibrate after removal |
| `apps/api/jest.config.js` | 47-54 | coverage thresholds (97/92/100/97); `functions: 100` is brittle — recalibrate |

### (c) PRISMA

Out of `apps/api/prisma/schema/tenancy.prisma`:

| what | line(s) | disposition |
| --- | --- | --- |
| `enum Role { SUPERADMIN / ADMIN / USER }` | 142-146 (value at **143**) | `Role.SUPERADMIN` **does NOT survive** platform removal. It has exactly one purpose — marking the operator — and after removal every reader is gone (see the (b) rows for `tenant-scope.interceptor.ts:48`, `tenant-status.guard.ts:55`, `profile-permissions.service.ts:69`, `oauth.service.ts:289`, `superadmin.guard.ts:23`, `platform-api.ts:78`, `seed.ts:47`). Enum becomes `enum Role { ADMIN, USER }`. |
| `User.tenantId` doc + nullability | 150-152 | `/// Null only for SUPERADMIN — the platform operator has no tenant.` + `tenantId String? @db.Uuid` + `tenant Tenant? @relation(...)`. **Yes, `User.tenantId` can become `String @db.Uuid` (NOT NULL) with `tenant Tenant @relation(...)`** once `SUPERADMIN` is gone: it is the only documented reason for nullability (tenancy.prisma:150), and the RLS side agrees — the `20260911105200_row_level_security` migration's closing note (lines **142-143**) says the global uniqueness of `User.email` is what removes the need for a SUPERADMIN-specific partial index, i.e. no RLS artefact depends on a NULL `tenantId`. `app.tenant_visible(row_tenant_id uuid)` (RLS migration 39-44) already handles NULL defensively (`row_tenant_id IS NOT NULL AND …`), so a NOT NULL column narrows it harmlessly. **Caveat:** flipping to NOT NULL is a *behaviour* change for the fail-closed branches at `tenant-scope.interceptor.ts:50-54` and `tenant-status.guard.ts:57-60`; recommend keeping the app-side guards even if the column is NOT NULL. |
| `oauth.prisma:15` | 15 | comment `Null for a SUPERADMIN, who belongs to no company` on `OAuthAccount.tenantId`. `OAuthAccount.tenantId` nullability follows `User.tenantId`. |

No model, enum or field in the schema is *exclusively* platform's. `Tenant.suspendedAt` /
`suspendedReason` / `canceledAt` (tenancy.prisma **78-81**) are written **only** by
`platform-tenants.service.ts` (suspend/reactivate/cancel) — see (c) under `plans` for their
disposition, because they hang off `TenantStatus`, not off `Plan`.

### (d) packages/shared

| file | line(s) | out |
| --- | --- | --- |
| `packages/shared/src/tenant.ts` | 202 | `// ── Platform operator panel (\`/api/platform/*\`) ──` banner |
| `packages/shared/src/tenant.ts` | 204-207 | `platformTenantListQuerySchema` + `PlatformTenantListQuery` |
| `packages/shared/src/tenant.ts` | 209-215 | `platformTenantDtoSchema` + `PlatformTenantDto` (`userCount`, `suspendedAt`, `suspendedReason`, `canceledAt`) |
| `packages/shared/src/tenant.ts` | 217-256 | the `platformCreateTenantSchema` doc block + schema + `PlatformCreateTenantInput` |
| `packages/shared/src/tenant.ts` | 258-263 | `platformCreateTenantResponseSchema` + `PlatformCreateTenantResponse` |
| `packages/shared/src/tenant.ts` | 286-294 | `platformStatsDtoSchema` + `PlatformStatsDto` |
| `packages/shared/src/tenant.ts` | 187-200 | `suspendTenantSchema` / `extendTrialSchema` / `changePlanSchema` — platform-only inputs (`changePlanSchema` is also plans) |
| `packages/shared/src/tenant.ts` | 8-9 | doc clause `…and the platform operator's panel.` |
| `packages/shared/src/user.ts` | 5-7 | doc `SUPERADMIN is the SaaS operator: it belongs to no tenant and is the only role that reaches /admin.` |
| `packages/shared/src/user.ts` | **9** | `export const RoleEnum = z.enum(['SUPERADMIN', 'ADMIN', 'USER']);` → `z.enum(['ADMIN', 'USER'])` |
| `packages/shared/src/invitation.ts` | 11-12, 20-21, 33-34 | doc references to "the platform operator"; the *contract* cap (`role` limited to ADMIN/USER) **stays** |
| `packages/shared/src/oauth.ts` | 46 | doc `(deleted, or a SUPERADMIN)` → `(deleted)` |
| `packages/shared/src/permissions.ts` | — | nothing platform-specific |
| `packages/shared/src/index.ts` | 10 | `export * from './tenant';` — **stays**, it is a barrel re-export; no per-symbol export list exists, so no line is removed from `index.ts` for any of my three features. |

### (e) WEB

**App Router routes deleted:** `/platform`, `/platform/tenants`, `/platform/plans`
(`apps/web/src/app/platform/{layout,page}.tsx`, `.../tenants/page.tsx`, `.../plans/page.tsx`).
The whole `src/app/platform/` directory goes.

**Nav/menu/sidebar entries:** *none to remove.*
- `apps/web/src/components/app-sidebar.tsx:16-19` (`NAV`) and `:27-32` (role-conditional item) contain only `/`, `/profile` and `/admin`.
- `apps/web/src/components/user-menu.tsx:79-84` contains only `/profile`.
- The platform nav lives **inside the deleted layout**: `apps/web/src/app/platform/layout.tsx:25-29` (`NAV` = overview/tenants/plans) and its rendering at `:59-83`. Note the panel is reachable **only by typing the URL** — there is no link into it from the company shell.

**BFF proxy allowlists:** none exist. `apps/web/src/app/api/[...path]/route.ts` is a catch-all
with no path allowlist; `apps/web/src/proxy.ts:9-29` lists only pre-auth and open prefixes.
Nothing to change.

**i18n (`apps/web/messages/pt-BR.json` and `en-US.json` — identical line numbers in both):**
- Delete namespace **`platform`**, lines **399-563** in both files (whole block, including the trailing `},`-boundary handling). Sub-blocks for reference:
  - `platform.badge` 400, `platform.navLabel` 401, `platform.footer` 402
  - `platform.nav` 403-407 (`overview`, `tenants`, `plans`)
  - `platform.status` 408-413 (`TRIAL`/`ACTIVE`/`SUSPENDED`/`CANCELED`)
  - `platform.overview` 414-428 (incl. `chartTitle`, `chartSubtitle`, `chartEmpty`, `chartPoint`)
  - `platform.tenants` 429-455
  - `platform.plans` 456-498 (plans-only)
  - `platform.suspendDialog` 499-507
  - `platform.planDialog` 508-514 (plans-only)
  - `platform.trialDialog` 515-521
  - `platform.toast` 522-531 (`planCreated`/`planUpdated` are plans-only)
  - `platform.createTenant` 532-562 (`plan`, `noPlan`, `trialDays` keys are plans-only)
- **Nothing else goes.** `nav.admin` (line 23) is the company `/admin` screen, not platform. `tenant.*` (363-380) is `TenantGate`/`TrialBanner`, see plans.
- `apps/web/src/i18n/messages.test.ts` parity-tests the two files key-for-key, so both must be edited symmetrically or that test fails.

### (f) ENV

**Nothing.** `grep -niE 'plan|platform|audit|superadmin|trial'` over
`apps/api/src/config/env.ts`, `apps/api/src/config/env.spec.ts` and `.env.example`
returns **zero hits**. No `validateEnv` conditional and no `env.spec.ts` case touches
platform, plans or audit.

### (g) SEED — `apps/api/prisma/seed.ts` (113 lines, read in full)

Confirmed: **yes, the seed seeds plans and a SUPERADMIN.**

Platform-specific changes:
- **6-8** — comment `Seeding writes across tenants and creates the platform operator, so it needs the database owner…`: drop the "creates the platform operator" clause. The owner connection is still required (cross-tenant writes + RLS), so lines 9-12 stay.
- **15** — `const SUPERADMIN_EMAIL = 'superadmin@dontpanic.dev';` → delete.
- **36-50** — the whole `prisma.user.upsert` block that creates the operator (`role: 'SUPERADMIN'`, name `'Deep Thought'`, `emailVerified: true`) plus its 4-line comment → delete.
- **101** — `console.log(\`🌱 Seeded platform operator → ${SUPERADMIN_EMAIL} / ${PASSWORD}\`);` → delete.
- Lines 19, 52-98, 102 (password hash, demo tenant, system profiles, company ADMIN) are untouched by platform removal.

### (h) CLAUDE.md + README.md to prune

**CLAUDE.md**
- `81-148` "Multi-tenancy" — **do not delete the section.** Per-line:
  - **93** — the `| \`platform\` | \`SUPERADMIN\`, no painel \`/platform\` | atravessa empresas |` table row.
  - **114** — inside the "Guard que lê o banco" bullet: the parenthetical `(ou \`asPlatform\` para o SUPERADMIN)`.
  - **125-139 "Permissões"**: bullet **132-134** (`- **SUPERADMIN não passa** em rota de negócio…`) goes whole; **130-131** (ADMIN passa sempre) and **135** (Sem perfil, nada) stay.
  - 88, 90-92, 94-97, 99-113, 115-123 stay verbatim — `tenant`/`system` scopes, RLS, `DATABASE_URL`, `apply_tenant_rls()`, `@SystemScope()` are all non-platform.
- `191-286` "Convites": **277-285** — the `### Criar empresa pelo painel da plataforma` sub-section (whole), including the `POST /platform/tenants` paragraph and the `sendInvitation: false` paragraph. Also **200** (`…ou o operador da plataforma entregando uma empresa que acabou de criar`) and **201-202** ("Os dois produzem a mesma linha…") need rewording, and **250** (`convidando um SUPERADMIN seria escalada`) becomes moot.
- `287-375` "Login social": **370-373** — the `oauth_accounts` `tenantId` bullet says "(nulo para SUPERADMIN)"; reword.
- `558-587` "O que NÃO fazer" — individual bullets by line:
  - **582** `- Não usar \`@SystemScope()\` fora das rotas de autenticação, nem aceitar \`tenantId\` do cliente.` → **KEEP** (system scope is not platform).
  - No bullet in 558-587 is platform-exclusive. **579** (`Não apontar DATABASE_URL para o dono do banco`) is about the Postgres superuser, not `Role.SUPERADMIN` — keep verbatim.
- `11-29` TL;DR: **24** names only `admin@dontpanic.dev`; no change.

**README.md**
- PT: **79** (bullet `- **Back-office do operador** — painel em \`/platform\`…`) delete; **139** (scope table `platform` row) delete; **170-172** (the `**Back-office.**` paragraph) delete; **161-165** — inside the `**Permissões.**` paragraph, the clause `o **SUPERADMIN nunca entra** em rota de negócio, porque o pedido dele corre em escopo de plataforma;` (161-163) delete; **108** (`| \`superadmin@dontpanic.dev\` | operador da plataforma, sem empresa |` seed-credentials row) delete.
- EN: **374** (bullet `- **Operator back-office**…`) delete; **434** (scope table row) delete; **467-469** (`**Back-office.**` paragraph) delete; **458-459** (`the **SUPERADMIN never enters** a business route, because its request runs in platform scope;`) delete; **402** (`| \`superadmin@dontpanic.dev\` | platform operator, owns no company |`) delete.

### (i) NPM DEPS

**None become unused.** Checked all four manifests:
- `apps/web/package.json` (17-44 deps, 45-72 devDeps): **no `recharts`** and no charting library at all. The signups chart is `apps/web/src/components/charts/bar-chart.tsx`, hand-written SVG (see its header comment lines 1-9: *"the project has no charting library installed"*). Platform uses only `lucide-react`, `sonner`, `next-intl`, `@tanstack/react-query` and the local `components/ui` — all used across the rest of the app.
- `apps/api/package.json` (27-65): platform uses `@nestjs/common`, `@nestjs/swagger`, `nestjs-zod`, `@prisma/client` — all shared.
- `packages/shared/package.json`: only `zod`.
- root `package.json`: nothing feature-specific.

### (j) MIGRATION SQL — baseline assembly

Six migration files exist:
`20260613074545_init`, `20260613122947_two_factor_remind_at`, `20260911105130_tenancy`,
`20260911105200_row_level_security`, `20260911105300_app_role`,
`20260912120000_invitations_and_oauth`.

#### Regenerated by `prisma migrate diff` (do NOT hand-carry)
Everything in `_init`, `_two_factor_remind_at`, `_tenancy` and the first 108 lines of
`_invitations_and_oauth` is plain DDL that `migrate diff` re-emits from the schema —
including, for platform: `20260911105130_tenancy/migration.sql:11`
`ALTER TYPE "Role" ADD VALUE 'SUPERADMIN';` (in a baseline this collapses into the
`CREATE TYPE "Role"` of the enum, so removing `SUPERADMIN` from `tenancy.prisma:143` is
all the generator has to do).

#### HAND-WRITTEN — must be preserved verbatim

**(1) `20260911105200_row_level_security/migration.sql` — GLOBAL, emit once.**
Context readers (lines 23-36) — note `app.is_platform_admin()` is the platform hook:
```sql
CREATE SCHEMA IF NOT EXISTS app;

-- ── Reading the context ────────────────────────────────────────────────────
-- NULLIF handles the empty string: ''::uuid would raise a syntax error.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on';
  $$;

CREATE OR REPLACE FUNCTION app.is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.system', true), '') = 'on';
  $$;

-- The single predicate behind every tenant policy.
CREATE OR REPLACE FUNCTION app.tenant_visible(row_tenant_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.is_platform_admin()
        OR app.is_system()
        OR (row_tenant_id IS NOT NULL AND row_tenant_id = app.current_tenant_id());
  $$;
```
**Platform removal edits, exactly two:** drop `app.is_platform_admin()` (lines 28-31) and drop
the `app.is_platform_admin()` disjunct from `app.tenant_visible` (line 41), leaving
`SELECT app.is_system() OR (row_tenant_id IS NOT NULL AND row_tenant_id = app.current_tenant_id());`.
The `app.platform_admin` `current_setting` predicate is the ONLY platform-specific SQL in the
whole RLS layer; `app.current_tenant_id` and `app.system` belong to tenancy and auth.

`app.apply_tenant_rls()` — **verbatim, global, unchanged by any of my three features**
(lines 51-89), plus its call at line 91:
```sql
-- ── Applying the policies automatically ────────────────────────────────────
-- Scans the public schema and protects every table that has a tenantId column.
-- Idempotent: call it at the end of any migration that creates tables, which is
-- exactly what keeps a new table from being left out by forgetfulness. The
-- `tenants` table is handled separately (it isolates on its own `id`).
CREATE OR REPLACE FUNCTION app.apply_tenant_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOR t IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenantId'
        AND NOT a.attisdropped
        AND c.relname <> '_prisma_migrations'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- FORCE is what makes the table owner obey as well. Without it the
      -- application (which owns the schema) would bypass RLS silently.
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
           USING (app.tenant_visible("tenantId"))
           WITH CHECK (app.tenant_visible("tenantId"))', t);
    END LOOP;

    -- `tenants` has no tenantId: its primary key IS the tenant.
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'tenants' AND c.relkind = 'r') THEN
      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
      CREATE POLICY tenant_isolation ON public.tenants
        USING (app.tenant_visible(id))
        WITH CHECK (app.tenant_visible(id));
    END IF;
  END;
  $$;

SELECT app.apply_tenant_rls();
```
**Per-table vs global:** this function is **global and table-driven** — it discovers tables by
the presence of a `tenantId` column at runtime, so the generator emits it once and must
**not** emit or skip anything per table. Tables it will pick up on a full build:
`legal_acceptances`, `tenant_parameters`, `tenant_branding`, `profiles`, `users`,
`audit_logs`, `invitations`, `oauth_accounts`. The explicit `tenants` block (78-87) is the
one hard-coded per-table policy and is **global** (the `tenants` table always exists).

`app.apply_user_owned_rls()` — **verbatim, global**, per-table only in the sense that its
`ARRAY[...]` literal (lines 101-104) names four credential tables that always exist in a
generated project:
```sql
-- ── Credential tables ──────────────────────────────────────────────────────
-- They carry no tenantId (they belong to a user, who belongs to a tenant), so
-- they isolate through their owner with the same predicate.
CREATE OR REPLACE FUNCTION app.apply_user_owned_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'refresh_tokens', 'password_reset_tokens',
      'email_verification_tokens', 'two_factor_backup_codes'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON public.%I
             USING (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))
             WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))',
          t, t, t);
      END IF;
    END LOOP;
  END;
  $$;

SELECT app.apply_user_owned_rls();
```
Each entry is guarded by `IF EXISTS`, so the generator may leave the array intact even if a
feature drops one of those tables. (None of my three features touches these four tables.)

Profile-children policy — **verbatim, per-table** (`permissions`), lines 124-140:
```sql
-- ── Profile children, linked by profileId ──────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))
         WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))',
      t, t, t);
  END LOOP;
END $$;
```
This block has **no `IF EXISTS` guard**, so it is genuinely per-table: emit only when
`permissions` survives (it always does — permissions are not one of my features).

Closing note, lines 142-143 (keep, it is the `User.tenantId` justification cited in (c)):
```sql
-- Note: user e-mail is unique globally (see User.email in the schema), so no
-- extra partial index is needed for the SUPERADMIN, who belongs to no tenant.
```
Reword when `SUPERADMIN` goes; the property it asserts (global e-mail uniqueness) survives.

**(2) `20260911105300_app_role/migration.sql` — GLOBAL, entirely hand-written, 51 lines, verbatim, unaffected by all three features:**
```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- An application role with no special privileges.
--
-- Why: a SUPERUSER (and any role with BYPASSRLS) ignores Row Level Security —
-- including with FORCE ROW LEVEL SECURITY. The database owner IS a superuser,
-- so the application must NOT connect as that user: every policy would be
-- decoration.
--
-- From here on there are two distinct connections:
--   DATABASE_URL        -> restricted role, used by the API at runtime (RLS applies)
--   DATABASE_ADMIN_URL  -> database owner, used only by migrate/seed (DDL)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app') THEN
    -- NOSUPERUSER + NOBYPASSRLS are the entire point of this file.
    CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO dontpanic_app;
GRANT USAGE ON SCHEMA app TO dontpanic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;

-- Data: yes. Structure and policies: no.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;

-- Tables created by future migrations inherit the same privileges, so adding a
-- module never means coming back here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO dontpanic_app;

-- The application role cannot read the migration history.
-- Conditional: in the shadow database `migrate dev` builds to detect drift,
-- this table does not exist yet when the migration runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;
  END IF;
END $$;
```
Every GRANT here is `ON ALL TABLES`/`ALTER DEFAULT PRIVILEGES` — **global, never per-table**.
The `ROLE dontpanic_app` name is referenced by `prisma.service.ts:57`, `apps/api/test/e2e-setup.ts`
and the CLAUDE.md/README docs, so it is a fixed identifier.

**(3) `20260912120000_invitations_and_oauth/migration.sql:110` — `SELECT app.apply_tenant_rls();`**
In a single baseline, this call must appear **exactly once, last**, after all `CREATE TABLE`s.
It is also where the invitations partial unique index lives (hand-written, invitations feature —
not mine).

**Ordering constraint for the baseline:** (a) all Prisma-generated DDL → (b) the RLS block from
`_row_level_security` → (c) a single trailing `SELECT app.apply_tenant_rls();` →
(d) the `_app_role` block last (its `GRANT ... ON ALL TABLES` must run after every table exists).

### (k) DEPENDENCIES on other features

- **Does `platform` depend on `plans`? YES, hard.** `platform-plans.controller.ts` (whole), `platform-plans.service.ts` (whole), `apps/web/src/app/platform/plans/page.tsx`, `apps/web/src/components/platform/plan-form-dialog.tsx` + `change-plan-dialog.tsx`, plus `platform-tenants.service.ts:169-175` (validating `input.planId`) and `:314-330` (`changePlan`, `tx.plan.findUnique` at 320) and `:353-354` (`planId` in the audit values). Also `platform-api.ts:129,192,201,210` (`usePlatformPlans`, `useChangeTenantPlan`, `useCreatePlan`, `useUpdatePlan`) and i18n `platform.plans` 456-498 / `platform.planDialog` 508-514.
- **Does anything outside `platform` call `prisma.asPlatform()`? YES — exactly one production call site.** Full list:
  - `apps/api/src/modules/auth/guards/two-factor-gate.guard.ts:53` — `: this.prisma.asPlatform(read)` (the SUPERADMIN branch). **This is the only one outside `modules/platform/`.**
  - `apps/api/src/modules/platform/support/platform-scope.ts:23` — `return prisma.asPlatform(fn);`
  - Definition: `apps/api/src/infra/prisma/prisma.service.ts:111`.
  - Tests only: `prisma.service.spec.ts:99`, `two-factor-gate.guard.spec.ts:78`, `platform-scope.spec.ts:15,32,43,56,68,77`, `platform-tenants.service.spec.ts:113,331,404,421,593`, `platform-plans.service.spec.ts:69`, `platform-stats.service.spec.ts:32`, and the mock at `apps/api/test/prisma-mock.ts:23,45`.
- **Does `platform` depend on `audit`? YES.** `platform-tenants.service.ts:23` imports `writePlatformAudit`; call sites `:208` (create) and `:349` (every transition). `platform-audit.ts:26` is `tx.auditLog.create`. Uniquely, failure is **not** swallowed (`platform-audit.ts:13-21`), and `platform-tenants.service.spec.ts:408-411, 598-606` assert the whole change fails when the audit write fails.
- **Does `audit` depend on `platform`? NO.** `apps/api/src/common/audit/**` has no platform import; `platform-audit.ts` lives inside `modules/platform/` and is a platform file.
- **Does `platform` depend on `invitations`? YES, hard.** `platform.module.ts:19` `imports: [InvitationsModule]`; `platform-tenants.service.ts:20` imports `InvitationsService`; `:196-206` calls `this.invitations.issue(tx, …)`. `POST /platform/tenants` creates **no user** — it invites.
- **Does `platform` depend on `tenants` (provisioning)? YES.** `platform-tenants.service.ts:21` → `provisionTenant` from `modules/tenants/support/tenant-provisioning.ts:57`.
- **Does the e2e suite depend on `platform` to prove tenant isolation? NO.** `apps/api/test/tenant-isolation.e2e-spec.ts:38-61` seeds two tenants + two ADMINs through `ownerDb()` (`e2e-app.ts:214`), with `status: 'ACTIVE'`, no plan and no SUPERADMIN. What the suite depends on is the **restricted role** (`tenant-isolation.e2e-spec.ts:9-15`, `:78` asserts `rolsuper`/`rolbypassrls` are false), i.e. `_app_role` migration — not platform. The only platform trace in the e2e helpers is a **comment** at `e2e-app.ts:158-163`.

---

## F6 · audit

### (a) EXCLUSIVE FILES — delete whole

```
apps/api/src/common/audit/audit.util.ts
apps/api/src/common/audit/audit.util.spec.ts
apps/api/src/common/audit/actor.ts
apps/api/src/common/audit/actor.spec.ts
apps/api/src/modules/platform/support/platform-audit.ts        # also (platform)
apps/api/src/modules/platform/support/platform-audit.spec.ts   # also (platform)
```
That is the entire `apps/api/src/common/audit/` tree (4 files) plus the platform audit helper.
**No web files, no `/admin` audit UI, no stories.** Verified: the `admin` i18n namespace
(`apps/web/messages/*.json`, keys listed at `admin.*`) has **no** audit keys, and there is no
`apps/web/src/app/admin/audit` route — the task's "/admin audit UI if any" resolves to **none**.

**Importers of `common/audit`** (so deleting it is not free):
`apps/api/src/modules/invitations/invitations.service.ts:26` (`writeAudit`) with call sites
**253**, **385**, **440**, **566**. `actorOf` — **confirmed dead code**: `grep -rn 'actorOf' apps/api` returns only
`common/audit/actor.ts:13` (definition) and `common/audit/actor.spec.ts:2,4,6,15`. No production
call site. It is safe to delete with audit, and it is also the reason `common/audit/` carries
100% unit coverage on a helper nobody calls.

### (b) SHARED SEAMS — the hard part

`auditLog.create` is called from **five** independent places, four of which are *not* in
`common/audit`. Removing the `AuditLog` model means editing all of them.

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | — | **no seam.** There is no AuditModule; `common/audit` is plain functions. |
| `apps/api/src/infra/prisma/prisma.service.ts` | — | **no seam.** `asPlatform`/`withScope`/`assertNotSuperuser` untouched. |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.ts`, `tenant-context.ts` | — | **no seam.** But note `auth.service.ts:610-619` documents that *the audit row has to satisfy the SAME RLS check as the request that produced it* — that comment is the reason `AuditLog.tenantId` exists; it goes with audit. |
| `apps/api/src/modules/auth/guards/permission.guard.ts` | — | **no seam.** |
| `apps/api/src/modules/auth/guards/tenant-status.guard.ts` | — | **no seam.** |
| `apps/api/src/modules/auth/services/token.service.ts` | — | **no seam.** |
| `apps/api/src/common/decorators/current-user.decorator.ts` | — | **no seam.** |
| `apps/api/src/common/decorators/require-permission.decorator.spec.ts` | 21-31 | the `@RequirePermission('audit', 'export')` case (24, 28) must be retargeted to a surviving module — this is the only place `'audit'` is used as a permission module anywhere in `src/`. |
| `apps/api/src/modules/auth/services/auth.service.ts` | **601-639** | the whole `// --- audit ---` block: the `audit()` method (604-639) with its RLS/fail-open doc (610-624) and `this.prisma.db.auditLog.create` at **626**. `audit()` is `public` "so SignupService writes through the same audit path" (603). |
| `apps/api/src/modules/auth/services/auth.service.ts` | 195, 267, 275, 370, 380, 393, 446, 463, 470, 481, 537, 564, 596 | **13 `await this.audit(...)` call sites** — `auth.email_verified`, `auth.login.2fa_required`, `auth.login`, `auth.2fa.failed`, `auth.2fa.locked`, `auth.login.2fa`, `auth.refresh.concurrent` ×2, `auth.refresh`, `auth.refresh.reuse_detected`, `auth.logout`, `auth.forgot_password`, `auth.reset_password` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 38 | doc `/** Context captured from the request for audit logging and token binding. */` — the `AuthContext` type itself **stays** (it also carries `ip`/`userAgent` for token binding and `locale` for mail) |
| `apps/api/src/modules/auth/services/auth.service.spec.ts` | 83, 736-769 | the `auditLog` prisma stub and the whole `describe('audit')` block |
| `apps/api/src/modules/auth/services/signup.service.ts` | **118** | `await this.auth.audit('auth.signup', user.id, ctx, { tenantId: tenant.id, slug });` |
| `apps/api/src/modules/auth/services/signup.service.spec.ts` | 100, 256-258 | the `audit: jest.fn()` stub and its assertion |
| `apps/api/src/modules/auth/oauth/oauth.service.ts` | **665-691** | the private `audit()` helper with its doc (665-669) and `tx.auditLog.create` at **679**; the `logger.warn` fallback at 690 |
| `apps/api/src/modules/auth/oauth/oauth.service.ts` | 327, 338, 512 | the three call sites (`auth.oauth.2fa_required`, `auth.oauth.login`, `auth.oauth.signup`) |
| `apps/api/src/modules/auth/oauth/oauth.service.spec.ts` | 116, 435-448 | stub + the "writes an audit row, and survives one that cannot be written" case |
| `apps/api/src/modules/admin/admin-users.service.ts` | **154-172** | the private `audit()` method with `this.prisma.db.auditLog.create` at **161** and the `logger.warn` at 171 |
| `apps/api/src/modules/admin/admin-users.service.ts` | 96, 119-121, 145 | call sites (`admin.role_changed`, `admin.user_locked`/`user_unlocked`, `admin.user_deleted`); also doc 19 (`every mutation is written to the audit log`) and 131 (`The row stays for audit lineage.`) |
| `apps/api/src/modules/admin/admin-users.service.spec.ts` | 40, 75-80, 125-134 | stub + the "audits" assertions |
| `apps/api/src/modules/users/services/users.service.ts` | **453-479** | the private `audit()` method with `this.prisma.db.auditLog.create` at **466** and its RLS doc (459-465) |
| `apps/api/src/modules/users/services/users.service.ts` | 121, 190, 244, 293, 307, 346, 377, 436 | 8 call sites (`user.password_changed`, `user.2fa_enabled`, `user.2fa_disabled`, `user.session_revoked`, `user.sessions_revoked_others`, `user.email_change_requested`, `user.email_changed`, `user.account_erased`) |
| `apps/api/src/modules/users/services/users.service.ts` | **384-401** | **`exportData()` — the LGPD right-of-access export READS audit rows.** `const auditLogs = await this.prisma.db.auditLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });` (386-389) and the `auditLogs: auditLogs.map(...)` block (393-400). Removing audit changes a **legally-motivated API response shape**, not just a log. |
| `apps/api/src/modules/users/services/users.service.spec.ts` | 36-38, 508-527 | the `auditLog` stub and `returns a profile + audit logs and NEVER leaks secrets` |
| `apps/api/src/modules/invitations/invitations.service.ts` | 26 | `import { writeAudit } from '../../common/audit/audit.util';` |
| `apps/api/src/modules/invitations/invitations.service.ts` | 253, 385, 440, 566 | four `await writeAudit(tx, {...})` calls (`invitation.created`, `invitation.resent`, `invitation.revoked`, and the accept-time row) |
| `apps/api/src/modules/invitations/invitations.service.ts` | 37 | doc `/** Context captured from the request, for audit rows and the e-mail language. */` |
| `apps/api/src/modules/invitations/invitations.service.spec.ts` | 112, 219-223, 298, 399, 451, 560 | stub + audit assertions |
| `apps/api/src/modules/platform/services/platform-tenants.service.ts` | 23, 208-225, 349-355 | `writePlatformAudit` import + both call sites |
| `apps/api/src/common/crud/tenant-crud.ts` | — | **no seam.** Verified zero `audit` hits — the generic CRUD helper writes no audit rows. |
| `apps/api/src/modules/tenants/**` | — | **no seam.** `TenantsService` writes no audit row (notable asymmetry: renaming the company is unaudited). |
| `apps/api/test/e2e-app.ts` | **148-151** | the doc block `Scoped to \`users\` … \`audit_logs\` are deliberately excluded: \`AuditLog.userId\` is \`onDelete: SetNull\`, so audit rows outlive the users that produced them by design, and no test asserts on them.` |
| `apps/api/test/e2e-app.ts` | **36** | comment `forget audit or mail-log write racing the reset…` |
| `apps/api/test/e2e-app.ts` | **200** | `"audit_logs"` out of the `TRUNCATE TABLE …` list |
| `apps/api/test/table-store.e2e-spec.ts` | **36** | `await store.tx.auditLog.findMany();` — a probe using `auditLog` as a convenient tenant-scoped table; must be repointed to another model |
| `apps/api/test/prisma-mock.ts` | — | **no seam** (generic proxy mock). Individual specs stub `auditLog` themselves; those stubs are listed above. |
| `apps/api/test/factories.ts` | — | **no seam.** |
| `apps/web/src/proxy.ts` | — | **no seam.** |
| `apps/web/src/components/app-sidebar.tsx`, `user-menu.tsx` | — | **no seam** (no audit nav entry, no audit screen). |

### (c) PRISMA

| what | line(s) | disposition |
| --- | --- | --- |
| `model AuditLog` (with doc 118) | `apps/api/prisma/schema/auth.prisma` **118-141** | DELETE WHOLE. Fields: `id` 120, `tenantId` 121, `tenant Tenant?` **122** (`onDelete: Cascade`), `userId` 123, `user User?` **124** (`onDelete: SetNull`), `action` 125, `entity` 126-127, `entityId` 128, `valuesBefore` 129, `valuesAfter` 130, `ip` 131, `userAgent` 132, `metadata` 133, `createdAt` 134; indexes `@@index([tenantId])` 136, `@@index([userId])` 137, `@@index([action])` 138, `@@index([entity, entityId])` 139; `@@map("audit_logs")` 140. |
| `apps/api/prisma/schema/auth.prisma` | **2** | header comment `// Sessions, credentials, legal acceptance and audit.` → drop ", legal acceptance and audit" as appropriate |
| `Tenant.auditLogs AuditLog[]` | `tenancy.prisma` **91** | DELETE — the back-relation. Nothing else changes on `Tenant`; the FK was `onDelete: Cascade`, so no orphan-row concern. |
| `User.auditLogs AuditLog[]` | `tenancy.prisma` **185** | DELETE — the back-relation. The FK was `onDelete: SetNull` (auth.prisma:124), which is exactly why `e2e-app.ts:148-151` excludes `audit_logs` from `assertCleanStart`; that exclusion becomes moot. |
| `apps/api/prisma/schema/invitations.prisma` | **51** | comment `/// Set on acceptance. Keeping the link is what lets an audit answer "who let…"` — the `acceptedByUserId` field it documents **stays**; reword. |
| `permissionModules` `'audit'` entry | `packages/shared/src/permissions.ts` **11** | see (d)/(k) |

### (d) packages/shared

| file | line(s) | out |
| --- | --- | --- |
| `packages/shared/src/permissions.ts` | **11** | `export const permissionModules = ['settings', 'users', 'audit'] as const;` → `['settings', 'users']` |
| `packages/shared/src/permissions.ts` | **49** | comment `// Company administrator — everything, including settings and the audit trail.` → reword |
| `packages/shared/src/permissions.ts` | **50** | `ADMIN: Object.fromEntries(permissionModules.map((m) => [m, FULL])) as ProfileMatrix,` — **NO CODE CHANGE NEEDED.** It maps over `permissionModules`, so dropping `'audit'` from line 11 shrinks the ADMIN row automatically. See (k). |
| `packages/shared/src/permissions.ts` | **52-57** | `MEMBER: { settings: READ_ONLY, users: READ_ONLY }` — **already omits `audit`** (comment 52-53: "never reads the audit trail"); only the comment needs rewording. **No SYSTEM_PROFILE_PERMISSIONS matrix row is deleted.** |
| `packages/shared/src/user.ts` | **118-127** | `/** A single audit-log entry as exposed to the data subject (LGPD export). */` + `auditLogEntrySchema` + `type AuditLogEntry` |
| `packages/shared/src/user.ts` | **136** | `auditLogs: z.array(auditLogEntrySchema),` out of `userDataExportSchema` (129-139). **`userDataExportSchema` survives with just `profile` + `exportedAt`** — a thinner LGPD export. |
| `packages/shared/src/index.ts` | 8 | barrel `export * from './user';` stays |

### (e) WEB

**Routes deleted:** none. There is no audit route or screen.

**Nav/menu/sidebar:** none.

**BFF proxy allowlists:** none.

**i18n:** **no namespace or key goes.** The only audit-adjacent strings are prose, and they
should stay because the systems they describe stay:
- `apps/web/messages/{pt-BR,en-US}.json:137` — `dashboard.cards.*.body`: "JWT, 2FA, CSRF, rate-limit e auditoria já inclusos." / "…and audit logging included." → **reword only** (drop the audit clause) if audit is removed.
- `apps/web/src/components/legal/terms-content.ts:106` and `privacy-content.ts:82` mention audit records in legal prose — `.ts` files, not messages; reword if audit goes, since the privacy policy would otherwise claim to log something the system no longer logs.
- `apps/web/src/lib/br-format.ts:55` — a doc comment naming "audit trail"; cosmetic.
- The profile screen's data-export UI: `userDataExportSchema` loses `auditLogs`, so any component rendering it must be checked (grep `UserDataExport` in `apps/web/src`).

`apps/web/src/i18n/messages.test.ts` parity applies to any wording edit on line 137 — edit both files.

### (f) ENV
**Nothing.** No audit env var in `.env.example` or `apps/api/src/config/env.ts`; no
`validateEnv` branch; no `env.spec.ts` case.

### (g) SEED — `apps/api/prisma/seed.ts`
**No change.** The seed writes no `AuditLog` row (verified across all 113 lines). Audit is the
one of my three features that leaves the seed untouched.

### (h) CLAUDE.md + README.md to prune

**CLAUDE.md**
- **125-139 "Permissões"**: line **137-138** — `A lista de módulos (\`permissionModules\` em \`@dontpanic/shared\`) é **a constante que você edita por produto**. O boilerplate traz \`settings\`, \`users\` e \`audit\`.` → drop `e \`audit\``.
- **517-541 "Testes"**: line **528-529** — inside rule 1, `**Nunca \`TRUNCATE\` dentro de uma suíte**: ele toma ACCESS EXCLUSIVE e trava contra conexões vivas da aplicação escrevendo auditoria fora de banda.` → the *rule* stays; the "escrevendo auditoria fora de banda" justification loses its referent, reword.
- **488-514 "Política de dependências"**: line **492** (`pnpm audit --audit-level high`) and **512** (`o gate de audit é piso`) are about **npm audit**, not the audit log. **Do not touch.**
- **558-587 "O que NÃO fazer"**: **no bullet is audit-specific.** Nothing to delete. (**560** `Não logar segredos, tokens ou senhas` is about logging generally — keep.)
- **81-148 "Multi-tenancy"**: **no paragraph belongs to audit.** The audit table is protected by `app.apply_tenant_rls()` like any other tenant table, which is bullet 116-118 — generic, keep.

**README.md**
- PT **77** — `- **Controle de acesso** — perfis por empresa com matriz de permissões, painel \`/admin\` para o ADMIN da empresa e audit log imutável de quem fez o quê.` → drop the `e audit log imutável…` clause.
- PT **164** — `por produto — vem com \`settings\`, \`users\` e \`audit\`.` → drop `e \`audit\``.
- EN **372** — `- **Access control** — …, and an immutable audit log of who did what.` → drop the clause.
- EN **460** — `edit per product — it ships with \`settings\`, \`users\` and \`audit\`.` → drop `and \`audit\``.

### (i) NPM DEPS
**None.** Audit uses only `@prisma/client` and `@nestjs/common`'s `Logger`
(`common/audit/audit.util.ts:39` `new Logger('Audit')`) — both core.

### (j) MIGRATION SQL

#### Regenerated by `prisma migrate diff`
- `20260613074545_init/migration.sql:76-85` `CREATE TABLE "audit_logs" ( "id" UUID NOT NULL, "userId" UUID, "action" TEXT NOT NULL, "ip" TEXT, "userAgent" TEXT, "metadata" JSONB, "createdAt" … CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id") );`
- `20260613074545_init/migration.sql:116` `CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");`
- `20260613074545_init/migration.sql:119` `CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");`
- `20260613074545_init/migration.sql:134` `ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;`
- `20260911105130_tenancy/migration.sql:13-18` `ALTER TABLE "audit_logs" ADD COLUMN "entity" TEXT, ADD COLUMN "entityId" UUID, ADD COLUMN "tenantId" UUID, ADD COLUMN "valuesAfter" JSONB, ADD COLUMN "valuesBefore" JSONB;` (in a baseline these collapse into the `CREATE TABLE`)
- `20260911105130_tenancy/migration.sql:189` `CREATE INDEX "audit_logs_tenantId_idx"`
- `20260911105130_tenancy/migration.sql:192` `CREATE INDEX "audit_logs_entity_entityId_idx"`
- `20260911105130_tenancy/migration.sql:207` `ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;`

All of the above are omitted simply by deleting `model AuditLog`.

#### Hand-written SQL affected by audit
**Zero explicit statements — but `audit_logs` IS an RLS-protected table.** Because it carries a
`tenantId` column (added at `_tenancy:16`), `app.apply_tenant_rls()` discovers it at runtime via
`a.attname = 'tenantId'` (RLS migration line **63**) and applies, for it, exactly:
```sql
ALTER TABLE public."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."audit_logs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON public."audit_logs";
CREATE POLICY tenant_isolation ON public."audit_logs"
  USING (app.tenant_visible("tenantId"))
  WITH CHECK (app.tenant_visible("tenantId"));
```
**This is generated by the loop, not written per table** — so the generator emits and skips
**nothing** per table here: dropping `audit_logs` changes not a single line of the RLS
migration. That auto-discovery is exactly the property CLAUDE.md:116-118 documents. The one
consequence worth writing down: `AuditLog.tenantId` is **nullable** (auth.prisma:121), and
`app.tenant_visible` returns false for a NULL `tenantId` outside platform/system scope — which is
why `auth.service.ts:610-624` explains that a pre-tenant audit write (e.g. `auth.forgot_password`
with `tenantId` null) must be allowed to fail silently rather than abort the request.

`_app_role` GRANTs are `ON ALL TABLES` — global, unchanged.

### (k) DEPENDENCIES on other features

- **Is the `audit` permission module load-bearing for `SYSTEM_PROFILE_PERMISSIONS`/ADMIN? NO.** `packages/shared/src/permissions.ts:50` is `ADMIN: Object.fromEntries(permissionModules.map((m) => [m, FULL]))` — it derives from the list, so removing `'audit'` at line 11 shrinks ADMIN's grants without touching line 50. `MEMBER` (52-57) never listed `audit`. `permissionsForProfile()` (71-81) also iterates `permissionModules`. The only code that would break is the test at `apps/api/src/common/decorators/require-permission.decorator.spec.ts:24,28` (a literal `'audit'` in a `@RequirePermission` call) and the assertions at `apps/api/src/modules/auth/services/profile-permissions.service.spec.ts:146,186,192,197` and `apps/api/src/modules/auth/guards/permission.guard.spec.ts:76`. **No production route uses `@RequirePermission('audit', …)`** — grep finds zero. So the `audit` permission entry is documentation for products to build on, and is independently removable from the `AuditLog` model.
- **Does `audit` depend on `platform`? NO.** `common/audit/*` imports nothing from `modules/platform`.
- **Does `platform` depend on `audit`? YES, and uniquely strongly.** `platform/support/platform-audit.ts` (whole file) + `platform-tenants.service.ts:23,208,349`. It is the one audit writer that **propagates** failure: `platform-audit.ts:15-21` ("if the trail cannot be written, the change must not happen either"), asserted by `platform-tenants.service.spec.ts:408-411` and `:598-606`.
- **Does anything else depend on audit in a way that changes an API contract? YES — `users.service.ts:384-401` (`exportData`).** The LGPD right-of-access response (`userDataExportSchema`, `packages/shared/src/user.ts:129-139`) contains `auditLogs`. Removing audit shrinks a compliance-facing payload. The generator should surface this as a decision, not silently drop it.
- **Does the e2e suite depend on audit? Two places, both fixable.**
  - `apps/api/test/table-store.e2e-spec.ts:36` — `await store.tx.auditLog.findMany();` uses `auditLog` as a probe table. Repoint.
  - `apps/api/test/e2e-app.ts:148-151, 200` — `audit_logs` in the TRUNCATE list and the `assertCleanStart` exclusion rationale.
  - `tenant-isolation.e2e-spec.ts` does **not** assert on audit rows (confirmed by the e2e-app comment "no test asserts on them"), so the isolation proof survives audit removal untouched.
- **Does `invitations` depend on audit? YES** — `invitations.service.ts:26` + four `writeAudit` calls (253, 385, 440, 566). This makes `common/audit/audit.util.ts` a *shared* helper, not a platform one.
- **Ordering for the generator:** if `audit` is off, `platform` must be off too (or `platform-audit.ts` must be rewritten to a no-op, which contradicts its own doc). If `platform` is off, `audit` may stay — nothing else needs it to abort a transaction.

---

## F7 · plans — PlanLimitsService + feature flags

### (a) EXCLUSIVE FILES — delete whole

```
apps/api/src/modules/tenants/services/plan-limits.service.ts
apps/api/src/modules/tenants/services/plan-limits.service.spec.ts
apps/api/src/modules/platform/platform-plans.controller.ts
apps/api/src/modules/platform/services/platform-plans.service.ts
apps/api/src/modules/platform/services/platform-plans.service.spec.ts
apps/web/src/app/platform/plans/page.tsx
apps/web/src/components/platform/plan-form-dialog.tsx
apps/web/src/components/platform/plan-form-dialog.test.tsx
apps/web/src/components/platform/change-plan-dialog.tsx
```
No `*.stories.tsx`. `apps/web/src/components/platform/dialogs.test.tsx` covers several dialogs
including `ChangePlanDialog` — it must be **edited**, not deleted, unless platform also goes.

**NOT exclusive:**
- `apps/web/src/components/tenant/trial-banner.tsx` + `trial-banner.test.tsx` — trial is `Tenant.status`/`trialEndsAt`, which survive plans removal (see (c)). Keep unless trials are also cut.
- `apps/web/src/components/tenant/tenant-gate.tsx` — keyed off a 403 from `TenantStatusGuard`, not off `Plan`. Keep.
- `apps/api/src/modules/auth/support/tenant-access.ts` — see (b).

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 26, 135 | **nothing.** `TenantStatusGuard` is status/trial, not plan — it stays. `TenantsModule` (29, 116) stays. |
| `apps/api/src/infra/prisma/prisma.service.ts` | — | **no seam.** `pg_advisory_xact_lock` is issued from `plan-limits.service.ts:174`, not from PrismaService. `asPlatform`/`assertNotSuperuser` are untouched. |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.ts`, `tenant-context.ts` | — | **no seam.** Neither mentions `plan`. But note `invitations.service.ts:518-520` re-establishes a tenant scope via `TenantContext.run` **solely** to feed `PlanLimitsService`; that call disappears with plans (see below). |
| `apps/api/src/modules/auth/guards/permission.guard.ts` | — | **no seam.** |
| `apps/api/src/modules/auth/guards/tenant-status.guard.ts` | 62-68 | **KEEP.** `select: { status: true, trialEndsAt: true, deletedAt: true }` (65) reads `Tenant` fields that survive. This guard is the reason `TenantStatus` outlives `Plan`. |
| `apps/api/src/modules/auth/support/tenant-access.ts` | 2 | `import type { Plan, Tenant } from '@prisma/client';` → drop `Plan` |
| `apps/api/src/modules/auth/support/tenant-access.ts` | 50 | signature `toTenantDto(tenant: Tenant, plan?: Pick<Plan,'name'> \| null)` → `toTenantDto(tenant: Tenant)`; drop the second argument at all 4 call sites: `signup.service.ts:122`, `tenants.service.ts:33`, `tenants.service.ts:49`, and `platform-tenants.service.ts:41` (`planName`). |
| `apps/api/src/modules/auth/support/tenant-access.ts` | 61-62 | `planId: tenant.planId,` and `planName: plan?.name ?? null,` out of the DTO mapping |
| `apps/api/src/modules/auth/support/tenant-access.ts` | 23-47 | `assertTenantAllowed` — **KEEP VERBATIM** including the `TRIAL` branch (37-43). It reads `status`/`trialEndsAt`/`deletedAt` only. |
| `apps/api/src/modules/auth/services/token.service.ts` | — | **no seam.** |
| `apps/api/src/common/decorators/current-user.decorator.ts` | — | **no seam.** |
| `apps/api/src/modules/auth/services/signup.service.ts` | 76, 79, 116, 122 | `const { tenant, user, planName } = …` / `provisionTenant` returning `planName` / `return { tenant, user, planName }` / `toTenantDto(tenant, planName ? { name: planName } : null)` — all lose `planName` |
| `apps/api/src/modules/auth/services/profile-permissions.service.ts` | — | **no seam.** |
| `apps/api/src/modules/tenants/tenants.module.ts` | 3, 14, 15 | `import { PlanLimitsService }`, and its entries in `providers` and `exports`. **`@Global()` (line 11) and the 6-10 doc comment exist only because of plan limits** ("Global because plan limits are enforced wherever a resource is created") — once `PlanLimitsService` is gone, `@Global` can be dropped, but `TenantsService` is then only used by `TenantsController` in the same module, so no importer needs it. |
| `apps/api/src/modules/tenants/tenants.controller.ts` | 4-5, 11, 26, 53-63 | `PlanDto`/`PlanUsageDto` type imports; the `PlanLimitsService` import; the ctor param; and the two routes `GET /tenants/me/plan` (53-57) and `GET /tenants/me/plan-usage` (59-63). |
| `apps/api/src/modules/tenants/services/tenants.service.ts` | 4, 30, 33, 47, 49, 52-77 | `PlanDto` import; `include: { plan: { select: { name: true } } }` (30, 47); the `toTenantDto(tenant, tenant.plan)` second arg (33, 49); and the whole `plan()` method (52-77). |
| `apps/api/src/modules/tenants/services/tenants.service.spec.ts` | 108 | the `Tenant.planId is onDelete: SetNull …` case |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 21-22 | `export const FALLBACK_TRIAL_DAYS = 14;` — **KEEP** if trials survive (it is the trial length when no plan says otherwise; with plans gone it becomes the only source) |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 36-37 | `/** Explicit plan … */ planId?: string \| null;` out of `ProvisionTenantInput` |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 46 | `planName: string \| null;` out of `ProvisionedTenant` |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 61-63 | the whole plan lookup (`tx.plan.findFirst({ id, active })` / `{ isDefault: true, active: true }`) |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 69 | `const trialDays = input.trialDays ?? plan?.trialDays ?? FALLBACK_TRIAL_DAYS;` → `input.trialDays ?? FALLBACK_TRIAL_DAYS` |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 83 | `planId: plan?.id ?? null,` out of the `tenant.create` data |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 104 | `return { tenant, adminProfileId, planName: plan?.name ?? null };` → drop `planName` |
| `apps/api/src/common/crud/tenant-crud.ts` | — | **no seam** (verified: zero `plan`/`audit` hits). |
| `apps/api/src/modules/invitations/invitations.service.ts` | 34, 92 | `import { PlanLimitsService }` and the ctor param `private readonly planLimits: PlanLimitsService,` |
| `apps/api/src/modules/invitations/invitations.service.ts` | 219-223 | the courtesy seat pre-check: comment 219-222 + `await this.planLimits.assertCanAddUser(tx);` at **223** |
| `apps/api/src/modules/invitations/invitations.service.ts` | 512-520 | the **authoritative** seat check: comment 512-517 + `await TenantContext.run({ scope: { kind: 'tenant', tenantId }, tx }, () => this.planLimits.assertCanAddUser(tx));` at **518-520**. Removing this also removes the only non-platform reason `TenantContext.run` is called with an explicit `tx` from a service. |
| `apps/api/src/modules/invitations/invitations.module.ts` | 15 | comment `PlanLimitsService arrives from the @Global TenantsModule; …` |
| `apps/api/src/modules/auth/oauth/oauth.service.ts` | 293-300 | `select: { status: true, trialEndsAt: true, deletedAt: true }` (296) — **KEEP**, status/trial survive |
| `apps/api/src/common/sequence/sequence.service.ts` | 13, 62 | **KEEP.** It has its own `pg_advisory_xact_lock(hashtext(...))` (62) for per-tenant sequences; unrelated to plans. Do not treat the advisory-lock pattern as plan-owned. |
| `apps/api/test/e2e-app.ts` | 200 | `"plans"` out of the `TRUNCATE TABLE …` list (it is the last name in the list) |
| `apps/api/test/prisma-mock.ts` | — | **no seam** (no `plan` model stub; it is a `jest.Mock` proxy). |
| `apps/api/test/factories.ts` | — | **no seam** (`makeUser` only). |
| `apps/api/test/auth.e2e-spec.ts` | 18 | comment referencing `TenantStatusGuard` — stays |
| `apps/web/src/proxy.ts` | — | **no seam.** |
| `apps/web/src/components/app-sidebar.tsx`, `user-menu.tsx` | — | **no seam** (no plan/billing entry exists). |
| `apps/web/src/components/tenant/use-tenant.ts` | 4-7 | `PlanDto`, `PlanUsageDto`, `PlanUsageEntry` type imports |
| `apps/web/src/components/tenant/use-tenant.ts` | 63-80 | `PLAN_QUERY_KEY` + `usePlan()` (with its 65-73 doc) |
| `apps/web/src/components/tenant/use-tenant.ts` | 82-100 | `PLAN_USAGE_QUERY_KEY` + `usePlanUsage()` |
| `apps/web/src/components/tenant/use-tenant.ts` | 102-104 | `isAtLimit()` |
| `apps/web/src/components/tenant/use-tenant.test.tsx` | — | the corresponding cases (file stays for `useTenant`/`useBranding`) |
| `apps/web/src/components/tenant/trial-banner.tsx` | — | **KEEP WHOLE.** It reads `tenant.status` + `tenant.trialEndsAt` from `tenantDtoSchema` (6, 24-25, 31, 62) — both survive. `t('seePlan')` (52) links to `/profile` and is a label only. |
| `apps/web/src/app/(dashboard)/layout.tsx` | 4, 18 | **KEEP** (`TrialBanner`); nothing plan-specific. |
| `apps/web/src/components/platform/tenants-table.tsx` | — | the `colPlan` column and `changePlan` action (see i18n 435-444, 452) |
| `apps/web/src/components/platform/create-tenant-dialog.tsx` | — | the `plan` / `noPlan` / `trialDays` fields (i18n 543-547) |
| `apps/web/src/components/platform/platform-api.ts` | 30-42, 129-139, 192-199, 201-218 | `PLATFORM_ROUTES` plan entries; `usePlatformPlans`; `useChangeTenantPlan`; `useCreatePlan` + `useUpdatePlan` |

### (c) PRISMA

Out of `apps/api/prisma/schema/tenancy.prisma`:

| what | line(s) | disposition |
| --- | --- | --- |
| `model Plan` (with doc 5-7) | **5-37** | DELETE WHOLE. Fields: `id` 9, `code` 10 (`@unique`), `name` 11, `description` 12, `priceCents` 13-14, `currency` 15, `trialDays` 16, `maxUsers` 17, `maxStorageMb` 18, `limits` 19-21, `features` 22-25, `sortOrder` 26, `isDefault` 27-28, `active` 29, `createdAt` 31, `updatedAt` 32, `tenants Tenant[]` **34**, `@@map("plans")` 36. |
| `Tenant.planId` | **74** | orphan → DELETE (`String? @db.Uuid`) |
| `Tenant.plan` relation | **75** | orphan → DELETE (`Plan? @relation(fields:[planId], references:[id], onDelete: SetNull)`) |
| `@@index([planId])` | **97** | orphan → DELETE |
| `Tenant.status` | **76** | **SURVIVES.** Read by `TenantStatusGuard` (`tenant-status.guard.ts:65`), `assertTenantAllowed` (`tenant-access.ts:28`), `oauth.service.ts:296`, `tenants.service` DTO, `trial-banner.tsx:29`, `tenant-isolation.e2e-spec.ts:43`. |
| `Tenant.trialEndsAt` | **77** | **SURVIVES** — same readers (`tenant-status.guard.ts:65`, `tenant-access.ts:38`, `trial-banner.tsx:31`). Written by `tenant-provisioning.ts:70-71,82` from `FALLBACK_TRIAL_DAYS`. |
| `Tenant.suspendedAt` | **78** | **Orphan if `platform` also goes.** Sole writer is `platform-tenants.service.ts` (suspend/reactivate); sole reader is `platformTenantDtoSchema` (`packages/shared/src/tenant.ts:211`). If `platform` stays → keep. If `platform` goes → DELETE. It is **platform-owned, not plan-owned**. |
| `Tenant.suspendedReason` | **79-80** | same as `suspendedAt`. (Doc line 79 says "shown in /admin" — actually shown in `/platform`.) |
| `Tenant.canceledAt` | **81** | same as `suspendedAt`. Nothing in the repo sets `status = 'CANCELED'` other than the enum itself — `canceledAt` is written only at `platform-tenants.service.ts:290` (`canceledAt: null` on reactivate). |
| `@@index([status])` | **96** | keep (status survives) |
| `enum TenantStatus { TRIAL ACTIVE SUSPENDED CANCELED }` | **39-44** | **SURVIVES plans removal.** Readers other than plans: `TenantStatusGuard` (`tenant-status.guard.ts:55-68`) and `assertTenantAllowed` (`tenant-access.ts:9-47`) — the answer to the task's question is *yes, `TenantStatusGuard` is the other reader*. Also `packages/shared/src/tenant.ts:16-18` (`tenantStatuses`), `platform-stats.service.ts:36-39`, `trial-banner.tsx:24`, i18n `platform.status` 408-413. If BOTH `plans` and `platform` are removed, `SUSPENDED`/`CANCELED` become unreachable-by-code states (no writer) but the enum and the guard should still ship — `assertTenantAllowed` is the mechanism by which an operator disables a tenant by hand. |

### (d) packages/shared

| file | line(s) | out |
| --- | --- | --- |
| `packages/shared/src/tenant.ts` | 101-103 | `trialEndsAt` **stays**; `planId: z.string().uuid().nullable(),` (102) and `planName: z.string().nullable(),` (103) go from `tenantDtoSchema` |
| `packages/shared/src/tenant.ts` | 146-158 | `planDtoSchema` + `PlanDto` |
| `packages/shared/src/tenant.ts` | 160-170 | `planUsageEntrySchema` + `PlanUsageEntry` (with doc 160-165) |
| `packages/shared/src/tenant.ts` | 172-185 | `planUsageDtoSchema` + `PlanUsageDto` (incl. the `concurrentSessions` doc 178-183) |
| `packages/shared/src/tenant.ts` | 197-200 | `changePlanSchema` + `ChangePlanInput` |
| `packages/shared/src/tenant.ts` | 238 | `planId: z.string().uuid().nullish(),` out of `platformCreateTenantSchema` |
| `packages/shared/src/tenant.ts` | 226-228 | the `**The commercial terms are inputs.**` doc bullet mentioning `isDefault` |
| `packages/shared/src/tenant.ts` | 241-242 | `/** Overrides the plan's own \`trialDays\`… */ trialDays:` — **keep the field** if trials survive, reword the doc |
| `packages/shared/src/tenant.ts` | 265-284 | `upsertPlanSchema` + `UpsertPlanInput` (incl. `maxUsers` 276, `isDefault` 281) |
| `packages/shared/src/tenant.ts` | 16-18 | `tenantStatuses` / `tenantStatusSchema` / `TenantStatus` — **KEEP** |
| `packages/shared/src/tenant.ts` | 33-60 | `RESERVED_TENANT_SLUGS` — **KEEP**; note it contains `'billing'` (51) and `'superadmin'` (55), which are just reserved words, not feature references |
| `packages/shared/src/user.ts` | — | nothing plans-related |
| `packages/shared/src/permissions.ts` | — | nothing plans-related |
| `packages/shared/src/index.ts` | 10 | barrel `export * from './tenant';` stays |

### (e) WEB

**Routes deleted:** `/platform/plans` (`apps/web/src/app/platform/plans/page.tsx`). If
`platform` is kept, the `plans` nav item must come out of `apps/web/src/app/platform/layout.tsx:28`
(`{ href: '/platform/plans', key: 'plans', icon: Tags, exact: false }`) and the `Tags` icon
from the `lucide-react` import at `:6`.

**Nav/menu/sidebar:** nothing in `app-sidebar.tsx` or `user-menu.tsx` — there is no plan or
billing entry anywhere in the company shell.

**BFF proxy allowlists:** none (see platform (e)).

**i18n — both `pt-BR.json` and `en-US.json`, identical line numbers:**
- `platform.plans` — **456-498** (whole sub-block: `title`, `subtitle`, `newPlan`, `tableCaption`, `colName`, `colPrice`, `colTrial`, `colLimits`, `colStatus`, `colActions`, `empty`, `unlimited`, `trialDaysValue`, `limitsSummary`, `activeTag`, `inactiveTag`, `edit`, `form.*` — `form` includes `maxUsers` at 485 and `isDefault` at 492)
- `platform.planDialog` — **508-514**
- `platform.nav.plans` — inside 403-407
- `platform.toast.planCreated` / `planUpdated` / `planChanged` — inside 522-531
- `platform.tenants.colPlan`, `.noPlan`, `.changePlan` — inside 429-455
- `platform.createTenant.plan`, `.noPlan`, `.trialDays`, `.trialDaysPlaceholder` — inside 532-562
- **`tenant.trial` (369-374) STAYS** — it is `TrialNotice` (`daysLeft`, `endsToday`, `hint`, `seePlan`), driven by `Tenant.status`/`trialEndsAt`. Only the `seePlan` label (373-ish) is plan-flavoured wording.
- `apps/web/src/i18n/messages.test.ts` enforces key parity — edit both files.

### (f) ENV
**Nothing.** No plan/trial/limit env var exists in `.env.example` or `apps/api/src/config/env.ts`;
no `validateEnv` branch and no `env.spec.ts` case.

### (g) SEED — `apps/api/prisma/seed.ts`

Confirmed: **the seed creates one plan.**
- **21** — comment `// A starter plan. \`isDefault\` is what a public signup lands on.` → delete.
- **22-34** — the whole `const plan = await prisma.plan.upsert({ where: { code: 'free' }, … create: { code: 'free', name: 'Free', description: 'Starter plan — change or replace it for your product.', priceCents: 0, trialDays: 14, maxUsers: 5, isDefault: true } });` → delete.
- **61** — `planId: plan.id,` out of the demo tenant's `create` (the `status: 'ACTIVE'` on line 60 stays).
- **19** (`passwordHash`), **36-50** (SUPERADMIN — platform), **53-63** (tenant), **65-80** (profiles), **82-98** (ADMIN user), **100-103** (logs) otherwise unchanged.
- With the plan gone, the demo tenant is created with `status: 'ACTIVE'` and no trial — consistent with `tenant-provisioning.ts:65-71`.

### (h) CLAUDE.md + README.md to prune

**CLAUDE.md**
- **140-146 `### Planos`** — DELETE the whole sub-section (heading 140 + the paragraph 142-145 about `PlanLimitsService`, `maxUsers`, `Plan.limits`, `pg_advisory_xact_lock`, and the feature-flag fail-closed rule). This is the entire plans documentation inside 81-148.
- **191-286 "Convites"**: bullets **238-243** (`- **O limite de plano vale no ACEITE.** …assertCanAddUser…pg_advisory_xact_lock…`) and **244-248** (`- **O aceite corre em escopo \`system\`** … é passado à mão para o \`PlanLimitsService\` via \`TenantContext.run\`.`) — both are plans-coupling paragraphs and go with plans.
- **11-29 TL;DR**: no plan mention.
- **462-476 "Comandos"**: `db:seed` row (473) stays.
- **558-587 "O que NÃO fazer"**: **no bullet is plans-specific.** Nothing to delete.
- Also **277-285** (`Criar empresa pelo painel da plataforma`) mentions plan-as-input; platform-owned.

**README.md**
- PT: **78** (`- **Planos** — plano padrão com trial, \`maxUsers\` e contadores nomeados, impostos de verdade na hora de criar.`) delete; **166-168** (the `**Planos.**` paragraph) delete.
- EN: **373** (`- **Plans** — a default plan with a trial, \`maxUsers\` and named counters…`) delete; **462-465** (the `**Plans.**` paragraph) delete.
- The `**Back-office.**` paragraphs (PT 170-172 / EN 467-469) mention "trocar plano / CRUD de planos" via the bullets at PT 79 / EN 374 — trim those clauses if plans go but platform stays.

### (i) NPM DEPS
**None.** No dependency in any of the four manifests exists for plans (no billing SDK, no
Stripe, no charting). `pg_advisory_xact_lock` is raw SQL through `$executeRaw`.

### (j) MIGRATION SQL

#### Regenerated by `prisma migrate diff`
- `20260911105130_tenancy/migration.sql:8` `CREATE TYPE "TenantStatus" AS ENUM ('TRIAL','ACTIVE','SUSPENDED','CANCELED');` — **survives** (the enum survives).
- `:44-64` `CREATE TABLE "plans" (…)` — regenerated; omit by deleting `model Plan`.
- `:86-91` the `"planId" UUID`, `"status"`, `"trialEndsAt"`, `"suspendedAt"`, `"suspendedReason"`, `"canceledAt"` columns of `CREATE TABLE "tenants"` — regenerated per the schema decisions in (c).
- `:156` `CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");` — regenerated, omit.
- `:165` `CREATE INDEX "tenants_planId_idx" ON "tenants"("planId");` — regenerated, omit.
- `:162` `CREATE INDEX "tenants_status_idx"` — keep.
- `:210` `ALTER TABLE "tenants" ADD CONSTRAINT "tenants_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;` — regenerated, omit.

#### Hand-written SQL affected by plans
**None.** `plans` has **no `tenantId` column**, so:
- `app.apply_tenant_rls()` never picks it up (the `a.attname = 'tenantId'` filter, RLS migration line 63) — **there is no `CREATE POLICY` and no `FORCE ROW LEVEL SECURITY` for `plans` anywhere in the repo.** Plans are global rows only the operator touches (`platform-plans.service.ts:24`). The generator emits **nothing** per-table for `plans`, and dropping the table changes no RLS SQL.
- The `_app_role` GRANTs are `ON ALL TABLES` — global, unchanged.
- The only plans-flavoured SQL in the app is runtime, not migration: `plan-limits.service.ts:174` `SELECT pg_advisory_xact_lock(hashtext(${key}))`.

### (k) DEPENDENCIES on other features

- **Does `plans` depend on `platform`? The only *writer* of `Plan` is the platform panel — YES.** `platform-plans.service.ts:40` (`tx.plan.create`), `:53` (`tx.plan.update`), `:89-92` (`tx.plan.updateMany` clearing `isDefault`). There is **no delete**, and no tenant-facing write. Outside platform, `Plan` is **read-only**: `tenant-provisioning.ts:61-63`, `plan-limits.service.ts:164`, `tenants.service.ts:30,47,61`, `platform-tenants.service.ts:170,320`. Plus `prisma/seed.ts:22-34` (upsert). **Consequence: `plans` without `platform` ships a model whose only writer is the seed** — usable (limits still enforce), but the operator has no UI. Generator should warn.
- **Does `platform` depend on `plans`?** Yes — see platform (k). `/platform/plans` screens + `changePlan` + `colPlan`.
- **Does `invitations` depend on `plans`? YES, at both ends.** Quoted call sites:
  - `apps/api/src/modules/invitations/invitations.service.ts:223` — `await this.planLimits.assertCanAddUser(tx);` (the courtesy check at issue time)
  - `apps/api/src/modules/invitations/invitations.service.ts:518-520` — the authoritative check at accept:
    ```ts
    await TenantContext.run({ scope: { kind: 'tenant', tenantId }, tx }, () =>
      this.planLimits.assertCanAddUser(tx),
    );
    ```
    This is the `assertCanAddUser` at accept the task asks about. It is inside the same `tx` that creates the user (`:522-530`), which is what keeps the advisory lock around the write.
  - Also `invitations.service.ts:34` (import) and `:92` (ctor), `invitations.module.ts:15` (comment).
- **Nothing else in the repo calls `assertCanAddUser`** — notably `admin-users.service.ts` does **not**, despite `plan-limits.service.ts:97-104` documenting a reactivation path. That documented invariant ("switching an account back on takes a seat") is therefore **not currently wired**; removing plans removes a promise that was already unkept.
- **`assertCanAddResource` / `registerResource` have zero call sites** outside `plan-limits.service.ts` itself (verified by grep) — the boilerplate ships no product resource.
- **`planAllowsConcurrentSessions` is read only at `plan-limits.service.ts:93`** (into `PlanUsageDto.concurrentSessions`); **nothing enforces it.** `SessionEndReason.SIGNED_IN_ELSEWHERE` (`auth.prisma:18-19`) has exactly one reference in the whole app — `auth.service.ts:76`, a message-key map — and is never written. So the "one session per plan" feature is declared, not implemented.
- **Does the e2e suite depend on `plans`? Only through cleanup.** `apps/api/test/e2e-app.ts:200` names `"plans"` in the per-test `TRUNCATE`; `global-setup.ts:87-94` discovers tables dynamically (`SELECT tablename FROM pg_tables`) and needs no edit. `tenant-isolation.e2e-spec.ts` creates no plan. `auth.e2e-spec.ts` / `invitations.e2e-spec.ts` create no plan either, which means `provisionTenant` already runs its "no default plan" path (`tenant-provisioning.ts:63` → null) throughout the e2e suite — good news for removal.

---

## F8 · i18n — multi-language

**Verdict: level (i) single-language = REMOVAL WITH SEAMS (viable in v1). Level (ii) no-i18n-at-all
= DO NOT REMOVE IN V1.**

**The number that decides it: 50 non-test source files call `useTranslations` /
`getTranslations`** (plus 9 that call `useLocale`, plus 18 test/story files that wrap
`NextIntlClientProvider` or mock `next-intl`). Full list in §(e). Level (ii) means rewriting every
one of those 50 files and re-deriving ~575 lines of copy in 2 languages as inline literals — it is
a whole-frontend rewrite, not a prune.

### (a) EXCLUSIVE FILES

Delete-whole under **level (i) single-language** (keep `next-intl`, keep one messages file, drop
the switcher):

| File | Why exclusive |
| --- | --- |
| `apps/web/src/i18n/locales.ts` | locale list + `localeMeta` (flags/labels) + `isLocale`; only importers are the switcher, `flags.tsx`, `request.ts` and the two tests |
| `apps/web/src/i18n/locales.test.ts` | tests the above |
| `apps/web/src/i18n/locale-actions.ts` | `'use server'` cookie writer, only caller is `language-switcher.tsx:6,33` |
| `apps/web/src/i18n/messages.test.ts` | pt-BR ↔ en-US key-parity test; meaningless with one locale |
| `apps/web/messages/en-US.json` (575 lines) | one of the two catalogues (or drop `pt-BR.json` instead — pick the surviving language) |
| `apps/web/src/components/language-switcher.tsx` | the switcher |
| `apps/web/src/components/language-switcher.test.tsx` | 96 lines, mocks `next-intl` + `@/i18n/locale-actions` |
| `apps/web/src/components/language-switcher.stories.tsx` | wraps `NextIntlClientProvider` 3× (lines 21,34,44) |
| `apps/web/src/components/flags.tsx` | inline SVG BR/US flags; only consumer is the switcher (`language-switcher.tsx:9,48,55`) |
| `apps/web/src/components/flags.test.tsx` | tests the above |
| `apps/web/src/components/flags.stories.tsx` | 28 lines, `argTypes.locale` options `['pt-BR','en-US']` |

Additionally delete under **level (ii) no-i18n**: `apps/web/src/i18n/request.ts`,
`apps/web/messages/pt-BR.json`, `apps/web/src/lib/zod-error-map.ts`,
`apps/web/src/lib/zod-error-map.test.ts` (the Zod map exists only to route Zod codes through the
`validation.*` namespace — `zod-error-map.ts:13-19`).

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/web/src/components/app-sidebar.tsx` | 10 (`import { LanguageSwitcher }`), 72 (`<LanguageSwitcher side="top" align="start" />`) | switcher import + render. Line 71-74 is a `flex justify-between` wrapper holding switcher + `ThemeToggle`; with the switcher gone the wrapper should collapse to just `<ThemeToggle />` |
| `apps/web/src/app/platform/layout.tsx` | 8 (import), 53 (`<LanguageSwitcher />`) | same, in the platform header's `ml-auto` cluster (52-56) |
| `apps/web/messages/pt-BR.json` | 26 (`"language": "Idioma"`) | the only nav key the switcher owns — remove under level (i) |
| `apps/web/messages/en-US.json` | 26 (same key) | must be removed in lockstep — see §(e) parity test |
| `apps/web/messages/pt-BR.json` / `en-US.json` | 139-142 (`dashboard.cards.i18n.{title,body}`) | the dashboard's "Multilíngue / pt-BR e en-US prontos, troque pela bandeira" marketing card |
| `apps/web/src/app/(dashboard)/page.tsx` | 3 (`Languages` icon import), 11 (`type CardKey = 'secure' \| 'i18n' \| 'swappable'`), 15 (`{ key: 'i18n', icon: Languages }`) | drop the i18n feature card from the 3-card hero grid |
| `apps/web/vitest.config.mts` | 25 (`'src/components/language-switcher.tsx'`), 34 (`'src/i18n/locales.ts'`), 18 + 46 (comments naming "the i18n locale map, the language switcher" and the "same-locale no-op" branch) | coverage `include` entries pointing at deleted files. Leaving them is not fatal for v8 but the 88% branch floor was calibrated *with* the switcher's `if (next === locale) return;` defensive branch (comment at 44-46), so thresholds must be re-measured |
| `apps/web/.storybook/preview.tsx` | 56-68 (`globalTypes.locale` toolbar with pt-BR/en-US items and 🇧🇷/🇺🇸), 57 (comment "for components that read it (e.g. LanguageSwitcher)") | the Storybook locale toolbar exists only for the switcher |
| `apps/web/next.config.ts` | 13 (`import createNextIntlPlugin`), 17 (`const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')`), 42 (`withNextIntl(nextConfig)`) | level (ii) only |
| `apps/web/src/app/layout.tsx` | 3-4 (imports), 23-24 (`getLocale()`, `getMessages()`), 28 (`lang={locale}`), 33-35 (`<NextIntlClientProvider>`) | level (ii) only; under level (i) keep the provider and hardcode `locale` |
| `apps/web/src/components/providers.tsx` | 5 (`useTranslations` import), 9 (`applyZodI18n` import), 12 (`const tv = useTranslations('validation')`), 22-26 (the `useEffect` that installs the Zod error map) | level (ii) only. NOTE: `Providers` is the *root* client provider — if it stops calling `useTranslations` it no longer needs to be inside the intl provider, which is what makes level (ii) a layout-tree change and not a line edit |
| `apps/web/src/lib/masks.ts` | 1 (`import { onlyDigits } from '@dontpanic/shared/locale/br'`) | **not** an i18n seam — see §(d): this is the `locale-br` feature |

### (c) PRISMA fields

`Tenant.locale` / `Tenant.currency` / `Tenant.timezone` — `apps/api/prisma/schema/tenancy.prisma:70-72`
(plus the doc comment at 69: "Starting defaults for a new tenant"). Also
`Plan.currency` at `tenancy.prisma:15`.

**They ARE read — do not assume they are decorative:**

- `apps/api/src/modules/platform/services/platform-tenants.service.ts:56-62` — `mailLocale(locale)`
  narrows the free-form BCP-47 tag to `'pt-BR' | 'en'`; called at `:253` to pick the language of the
  first-admin invitation email.
- `apps/api/src/modules/platform/services/platform-tenants.service.ts:233` — the create-tenant
  transaction returns `locale: row.locale` precisely so `:253` can use it.
- `apps/api/src/modules/platform/services/platform-tenants.service.ts:42-44` — `toDto()` exposes all
  three on `TenantDto`.
- `apps/api/src/modules/auth/support/tenant-access.ts:63-65` — same three fields exposed on the
  tenant-access payload.
- `apps/api/src/modules/tenants/support/tenant-provisioning.ts:31-33, 84-86` — accepted as optional
  provisioning inputs, spread conditionally so the schema defaults survive when unset
  (asserted by `tenant-provisioning.spec.ts:71-80`).
- `apps/api/src/modules/platform/services/platform-tenants.service.ts:187-189` — same conditional
  spread on update.
- `apps/api/src/modules/tenants/services/tenants.service.ts:71` — `currency: plan.currency`.

**Recommendation:** `Tenant.locale` belongs to i18n *only* in that it feeds `mailLocale()`. Under
level (i) keep the columns (they are 3 `TEXT NOT NULL DEFAULT` columns, zero cost) and hardcode
`mailLocale()` to the single language. Under level (ii) the columns can be dropped, but that forces
edits in 7 files above + `packages/shared/src/tenant.ts` (see §(d)) + the API email templates (§(k)).
Dropping them is NOT worth it in v1.

### (d) packages/shared changes

**i18n proper touches `packages/shared` barely at all:**

| file:line | what |
| --- | --- |
| `packages/shared/src/tenant.ts:104-106` | `locale`/`currency`/`timezone` on the tenant DTO schema |
| `packages/shared/src/tenant.ts:124-125` | `timezone`/`locale` optional on one update schema |
| `packages/shared/src/tenant.ts:152` | `currency: z.string()` (plan DTO) |
| `packages/shared/src/tenant.ts:243-245` | `locale`/`currency`/`timezone` optional on create-tenant input |
| `packages/shared/src/tenant.ts:274` | `currency: z.string().length(3)` |
| `packages/shared/src/primitives.ts:13` | comment: "client error map (apps/web/src/lib/zod-error-map.ts). Schema-level messages …" — explains why shared schemas carry **no** hardcoded messages. **This is load-bearing:** under level (ii) the shared schemas produce Zod's raw English defaults, because the translated messages live only in `validation.*` + `zod-error-map.ts`. A generator that removes i18n without adding `message:` strings to the shared primitives ships untranslated, developer-flavoured validation errors to end users. |

**`packages/shared/src/locale/br.ts` is a SEPARATE feature, not i18n. Call it `locale-br`.**
Evidence:

- `br.ts:4-23` — the header says so: "an OPT-IN locale module … deliberately NOT re-exported from
  `src/index.ts`".
- `packages/shared/tsup.config.ts:5-8` — its own build entry: `entry: { index: 'src/index.ts',
  'locale/br': 'src/locale/br.ts' }`, so "it only ships to whoever imports
  `'@dontpanic/shared/locale/br'`".
- `packages/shared/package.json:15` — its own `"./locale/br"` export condition.
- It contains **zero** translated strings (the `message:` strings at `br.ts:77,82,88,93,100` are
  English fallbacks) and imports nothing from next-intl.
- i18n has **zero** dependency on it: no file in `apps/web/src/i18n/**` references it.

`locale-br` exclusive files: `packages/shared/src/locale/br.ts`,
`packages/shared/src/locale/br.spec.ts` (160 lines, 20 tests), `apps/web/src/lib/br-format.ts`,
`apps/web/src/lib/br-format.test.ts`.

**`br-format.ts` is dead code today** — grep shows its exports (`displayTaxId`, `formatCurrency`,
`formatPercent`, `formatLocalDate`, `formatDateTime`, `formatDayMonth`, `daysSince`) are imported
**only** by `apps/web/src/lib/br-format.test.ts:3-12`. The app's own money/date formatting lives
elsewhere (`apps/web/src/components/platform/format.ts`,
`apps/web/src/components/dashboard/variation.ts:93`). So `br-format.ts` + its test delete cleanly.

**`apps/web/src/lib/masks.ts` is the one real seam of `locale-br`** and it is NOT deletable, because
it also carries two non-Brazilian helpers the app depends on:

- `slugify` (`masks.ts:67`) → used by `apps/web/src/app/(auth)/signup/page.tsx:13,140`,
  `apps/web/src/app/(auth)/signup/complete/page.tsx:18,146`,
  `apps/web/src/components/platform/create-tenant-dialog.tsx:11,181`.
- `daysUntil` (`masks.ts:79`) → used by `apps/web/src/components/tenant/trial-banner.tsx:7,31`.
- `masks.ts:1` imports `onlyDigits` from `@dontpanic/shared/locale/br`.

So removing `locale-br` requires: delete `formatTaxId`/`taxIdKind`/`formatPhone`/`formatPostalCode`
(`masks.ts:16-60`), inline `onlyDigits` (one line: `value.replace(/\D/g,'')`) or drop the import,
keep `slugify`+`daysUntil`, and prune `apps/web/src/lib/masks.test.ts:2` imports plus its
`formatTaxId`/`taxIdKind`/`formatPhone`/`formatPostalCode` describe blocks (lines 4-53), keeping the
`slugify` (56-68) and `daysUntil` (70-87) blocks. Also update the doc comments that point at the
module: `apps/api/prisma/schema/tenancy.prisma:55-56`, `packages/shared/src/tenant.ts:11-13`.

### (e) WEB routes / nav / i18n keys

**Routes owned by i18n:** none. i18n is deliberately "without i18n routing" — there is no
`/[locale]` segment; the active locale is a cookie (`request.ts:5-6`, `locales.ts:4`
`LOCALE_COOKIE = 'NEXT_LOCALE'`).

**Nav entries owned by i18n:** the two `<LanguageSwitcher>` mounts listed in §(b)
(`app-sidebar.tsx:72`, `platform/layout.tsx:53`) and the `nav.language` key.

**i18n keys owned by i18n:** only `nav.language` (line 26) and `dashboard.cards.i18n.*`
(139-142). Everything else in the 575-line catalogue belongs to another feature (§ web-shell
inventory namespace table).

**The 50 non-test files calling `useTranslations`/`getTranslations`** (the level-(ii) blast radius):

```
app/(auth)/forgot-password/page.tsx        components/admin/invitations-table.tsx
app/(auth)/login/page.tsx                  components/admin/invite-user-dialog.tsx
app/(auth)/reset-password/page.tsx         components/app-sidebar.tsx
app/(auth)/signup/complete/page.tsx        components/dashboard/metric-card.tsx
app/(auth)/signup/page.tsx                 components/easter-eggs.tsx
app/(auth)/verify-email/page.tsx           components/legal/legal-document.tsx
app/(dashboard)/admin/page.tsx             components/legal/legal-page.tsx
app/(dashboard)/page.tsx                   components/oauth-buttons.tsx
app/(dashboard)/profile/page.tsx           components/platform/change-plan-dialog.tsx
app/error.tsx                              components/platform/create-tenant-dialog.tsx
app/invite/[token]/page.tsx                components/platform/extend-trial-dialog.tsx
app/not-found.tsx                          components/platform/plan-form-dialog.tsx
app/platform/layout.tsx                    components/platform/signups-chart.tsx
app/platform/page.tsx                      components/platform/suspend-tenant-dialog.tsx
app/platform/plans/page.tsx                components/platform/tenant-status-badge.tsx
app/platform/tenants/page.tsx              components/platform/tenants-table.tsx
app/privacidade/page.tsx                   components/profile/avatar-card.tsx
app/setup-2fa/page.tsx                     components/profile/danger-card.tsx
app/termos/page.tsx                        components/profile/email-card.tsx
                                           components/profile/name-card.tsx
                                           components/profile/password-card.tsx
                                           components/profile/sessions-card.tsx
                                           components/profile/two-factor-card.tsx
                                           components/providers.tsx
                                           components/session-ended-dialog.tsx
                                           components/tenant/tenant-gate.tsx
                                           components/tenant/trial-banner.tsx
                                           components/tenant/under-construction.tsx
                                           components/two-factor-prompt-dialog.tsx
                                           components/two-factor-setup.tsx
                                           components/user-menu.tsx
```
(all under `apps/web/src/`; total 50)

Plus **9 non-test files calling `useLocale`** (they pass the locale into `Intl.*` formatters):
`app/platform/page.tsx:18`, `app/platform/plans/page.tsx:34`,
`components/admin/invitations-table.tsx:46`, `components/dashboard/metric-card.tsx:86`,
`components/language-switcher.tsx:25`, `components/legal/legal-document.tsx:82`,
`components/platform/change-plan-dialog.tsx:41`, `components/platform/signups-chart.tsx:21`,
`components/platform/tenants-table.tsx:52`.

Plus **18 test/story files** that must be rewritten under level (ii) because they wrap
`NextIntlClientProvider` or `vi.mock('next-intl')`: `app/(auth)/login/login.test.tsx:87,269,293`,
`app/(auth)/signup/signup.test.tsx:71`, `app/invite/[token]/invite.test.tsx:79`,
`components/dashboard/metric-card.test.tsx:8-10`, `components/language-switcher.stories.tsx`,
`components/language-switcher.test.tsx:15-16`, `components/legal/legal.test.tsx:44`,
`components/oauth-buttons.test.tsx:19`, `components/platform/create-tenant-dialog.test.tsx:67`,
`components/platform/dialogs.test.tsx:42,103,317`,
`components/platform/plan-form-dialog.test.tsx:61`, `components/platform/signups-chart.test.tsx:18`,
`components/platform/tenant-status-badge.test.tsx:19`,
`components/platform/tenants-table.test.tsx:72`, `components/session-ended-dialog.test.tsx:53`,
`components/tenant/tenant-gate.test.tsx:38`, `components/tenant/trial-banner.test.tsx:36`,
`components/tenant/under-construction.test.tsx:27`.

**Why level (ii) is not realistic in v1:** 50 components × 1-7 namespaces each, 575 lines of copy in
two languages, 18 test harnesses, the Zod error map, and (see §(k)) the API's own
locale-selection plumbing. A generator emitting level (ii) would have to author the English or
Portuguese literals for every string — i.e. author the UI. **Emit level (i) only.**

**Level (i) mechanics (the recipe for the generator):** keep `next-intl`, keep `request.ts` but
replace lines 3 and 8-10 with a constant locale (`const locale = 'pt-BR'`) so the cookie read and
`isLocale` go away with `locales.ts`; keep exactly one file in `apps/web/messages/`; delete the 11
files in §(a); apply the 12 seam edits in §(b). Nothing in the 50 call sites changes — that is the
whole point of choosing (i).

### (f) ENV vars

| file:line | var | verdict |
| --- | --- | --- |
| `.env.example:270` | `NEXT_PUBLIC_DEFAULT_LOCALE=pt-BR` | **DEAD TODAY.** Grep over `apps/`, `packages/`, `docker-compose*.yml`, `Dockerfile.*` finds zero readers. The real default is the hardcoded `defaultLocale: Locale = 'pt-BR'` in `apps/web/src/i18n/locales.ts:3`. Remove the line under either level; it is also a latent trap of exactly the kind CLAUDE.md 558-570 warns about (a `NEXT_PUBLIC_*` that looks authoritative and is not). |

`apps/api/src/config/env.ts` has **no** locale/i18n variable at all (confirmed by grep for
`LOCALE`/`intl`). `.env.example` has no other locale line (grep `-i 'locale\|lang\|intl'` returns
only line 270). Context: line 270 sits in the `# ------ WEB ------` block (267-273).

### (g) SEED changes

`apps/api/prisma/seed.ts` — **no i18n changes needed**. It never sets `locale`/`currency`/`timezone`
(grep: no hits), relying on the schema defaults at `tenancy.prisma:70-72`. If level (ii) drops those
columns the seed still needs no edit.

### (h) CLAUDE.md + README.md prune

CLAUDE.md:
- line 5 — remove the word `i18n` from the feature list sentence ("auth, 2FA, perfil, arquivos,
  i18n, temas, observabilidade e testes").
- line 520 (`## Testes`, 517-541) — remove "paridade de chaves i18n" from the frontend bullet.
- There is **no dedicated i18n section** in CLAUDE.md; nothing else to cut.

README.md:
- line 12 (badge blurb) — drop `i18n` from "RLS no Postgres, auth, 2FA, planos, RBAC, i18n e testes".
- line 57 — drop `i18n` from the PT feature sentence.
- line 63 — drop `next-intl` from the PT stack line.
- **line 81** — delete the whole PT bullet: "- **i18n** — pt-BR + en-US com seletor de bandeira SVG;
  chaves mantidas em paridade por testes."
- line 299 — drop "chaves i18n" from the PT testing bullet.
- line 353 — drop `i18n` from the EN feature sentence.
- line 358 — drop `next-intl` from the EN stack line.
- **line 376** — delete the whole EN bullet: "- **i18n** — pt-BR + en-US with an SVG flag switcher;
  keys kept in parity by tests."
- line 597 — drop "i18n key parity" from the EN testing bullet.

### (i) NPM DEPS that become unused

| dep | declared at | verdict |
| --- | --- | --- |
| `next-intl@^4.14.3` | `apps/web/package.json:36` | **Level (i): KEEP** (still used by 50 components + `request.ts` + `layout.tsx` + `next.config.ts`). **Level (ii): remove** — grep confirms `next-intl` appears in no other package.json (api, shared, config, root all clean). |

No other dependency becomes unused. `@radix-ui/react-dropdown-menu` (line 22) survives — `user-menu.tsx`
and `theme-toggle.tsx` use it too. `lucide-react` survives everywhere.

### (j) MIGRATION SQL

Checked all 6 migrations under `apps/api/prisma/migrations/*/migration.sql`. The only i18n-adjacent
DDL is in `20260911105130_tenancy/migration.sql`:
- line 51 — `"currency" TEXT NOT NULL DEFAULT 'BRL'` (plans)
- lines 83-85 — `"locale" TEXT NOT NULL DEFAULT 'pt-BR'`, `"currency" TEXT NOT NULL DEFAULT 'BRL'`,
  `"timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo'` (tenants)

**Under the recommended level (i): no migration change at all.** Under level (ii) those four column
lines come out of the CREATE TABLE statements (never as a new DROP migration — the generator emits
the baseline, so it edits the existing file). Nothing else; no i18n table, index, enum or RLS policy
exists.

### (k) DEPENDENCIES on other features (code evidence)

1. **The API reads the web's locale cookie.** Five controllers duplicate the same line to choose the
   *email* language:
   - `apps/api/src/modules/auth/auth.controller.ts:42` — `const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';`
   - `apps/api/src/modules/auth/oauth/oauth.controller.ts:53`
   - `apps/api/src/modules/users/users.controller.ts:51`
   - `apps/api/src/modules/invitations/invitations.controller.ts:47`
   - `apps/api/src/modules/invitations/public-invitations.controller.ts:43`

   The cookie *name* is defined web-side (`apps/web/src/i18n/locales.ts:4`) and duplicated as a raw
   string API-side — there is no shared constant, so the coupling is invisible to the compiler.
   **Removing i18n leaves five API lines reading a cookie nobody sets.** They degrade silently to
   `'pt-BR'`, which is why this is a landmine rather than a break.

2. **The API has its own second i18n system, independent of next-intl.**
   `apps/api/src/modules/auth/support/email-templates.ts:1` (`export type EmailLocale = 'pt-BR' | 'en'`)
   and its `STRINGS: Record<EmailLocale, CodeStrings>` table at `:13-32`; the invitation twin at
   `apps/api/src/modules/invitations/support/invitation-email.ts:1,23` (+ `formatDeadline` at `:73-80`
   using `Intl.DateTimeFormat`). Consumers: `auth.service.ts:35,42,130,143,210`,
   `users.service.ts:37,44,344`, `invitations.service.ts:32,41,174,183,279,412`,
   `signup.service.ts:117`, `platform-tenants.service.ts:56-62,253`.
   **This is the most surprising coupling in the feature:** "remove multi-language" naively reads as
   a web-only change, but the API ships two hand-rolled bilingual string tables that no next-intl
   file touches. A single-language generator must also collapse `EmailLocale` to one literal and
   flatten both `STRINGS` tables — otherwise the product keeps sending Portuguese emails to English
   users (or vice versa) depending on a cookie that no longer exists.

3. **Platform / create-tenant** depends on `Tenant.locale` via `mailLocale()`
   (`platform-tenants.service.ts:56-62,233,253`) — asserted by
   `platform-tenants.service.spec.ts:357-361` ("`locale: 'en-GB'` → `locale` passed to
   `dispatchInvitationEmail` is `'en'`") and `:513-527`.

4. **Invitations** depends on the same `EmailLocale` plumbing
   (`invitation-email.spec.ts:14,49,57-62` includes an explicit "falls back to pt-BR for a locale the
   table does not know" case).

5. **Zod validation messages** depend on i18n: `providers.tsx:22-26` installs
   `applyZodI18n` over the `validation.*` namespace, and `packages/shared/src/primitives.ts:13`
   documents that the shared schemas carry no messages *because* of it.

6. **`locale-br` depends on i18n only cosmetically** — `br.ts:19-22` suggests mapping its English
   `message:` strings "through the `validation` i18n namespace"; no code does this today.

7. **`masks.ts` depends on `locale-br`** (`masks.ts:1`) while being needed by signup, platform
   create-tenant and the trial banner — see §(d).

---

## F9 · multi-tenancy — single-tenant mode

**Verdict up front: feasible, and cheap.** Single-tenant mode is a *seed + UI-visibility + one
signup-flag* change. Nothing in the isolation machinery has to move, because the machinery never
asks "how many tenants are there?" — it only asks "what is the scope of this request?", and with
one tenant that question still has an answer (`tid` from the JWT). The generator's job is to (a)
seed exactly one tenant, (b) force `PUBLIC_SIGNUP_ENABLED=false`, (c) not emit the platform panel
and the tenant-creation surfaces, (d) keep every file in §1 byte-identical.

### 1. Inventory — tenancy machinery that MUST stay untouched

Everything in this table is emitted verbatim in both multi-tenant and single-tenant mode. There is
no "simplified" variant of any of it.

| File | Lines | What it is | Why untouchable |
| --- | --- | --- | --- |
| `apps/api/src/infra/tenancy/tenant-context.ts` | 13-14 | `TenantScope` union (`tenant`/`platform`/`system`) | The three scopes the SQL predicate reads. |
| ″ | 22-33 | `AsyncLocalStorage` store + `run`/`get` | Carries the open tx so `prisma.db` resolves. |
| ″ | 39-47 | `requireTenantId()` — **throws**, never defaults | `"a silent default here is a data leak"`. In single-tenant mode the temptation is to return the fixed tenant id. **Do not.** |
| ″ | 50-53 | `setTransaction` | |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.ts` | 30-61 | Global interceptor: `@SystemScope` → `asSystem`; `SUPERADMIN` → `platform`; else `tenant` from `request.user.tenantId`; no user → no scope | 43-45 and 47-56 are the fail-closed branches. |
| ″ | 52-54 | non-SUPERADMIN without tenant → `scope = null` → no scope → RLS returns nothing | |
| `apps/api/src/infra/tenancy/tenancy.module.ts` | 10-14 | `@Global()` `APP_INTERCEPTOR` registration | Global on purpose — "a module that forgot to import it would run without isolation". |
| `apps/api/src/infra/tenancy/system-scope.decorator.ts` | 17-18 | `SystemScope()` = `SetMetadata(SYSTEM_SCOPE_KEY, true)` | |
| `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` | 29-75 | The **allowlist test** (see Traps §3.2) | Must be emitted, with the list adjusted per selected features — see §3.2. |
| `apps/api/src/infra/prisma/prisma.service.ts` | 47-64 | `assertNotSuperuser()` — throws in `production`, `logger.error` otherwise | |
| ″ | 72-100 | `withScope()`: `TenantContext.run` → `$transaction` → `set_config(..., true)` per scope kind → `setTransaction(tx)` | L83/86/89 are the only three `set_config` sites in the app. |
| ″ | 103-108 | `forTenant(tenantId, fn)` | The guard-safe read path. |
| ″ | 111-113 | `asPlatform(fn)` | |
| ″ | 120-122 | `asSystem(fn)` | |
| ″ | 133-137 | `atomic()` — reuses the in-flight tx, never nests | |
| ″ | 147-151 | `get db()` — scoped tx, else base client (which sees nothing) | |
| `apps/api/src/common/crud/tenant-crud.ts` | 34-36 | `tenantWhere()` = `{ tenantId: TenantContext.requireTenantId(), deletedAt: null }` | |
| ″ | 58-69 | `isUniqueViolation(err, indexName?)` — the raw-driver branch (65-68) is what catches **partial** indexes Prisma cannot see | Needed by the invitations partial index. |
| ″ | 117-126 | `findRow` — tenant-scoped find-or-404 | |
| ″ | 132-140 | `create` — stamps `tenantId` from context, never from the caller | |
| ″ | 142-154 | `update` — re-reads for ownership before writing (143-145 comment) | |
| `apps/api/src/modules/auth/guards/tenant-status.guard.ts` | 62-67 | `this.prisma.forTenant(tenantId, tx => tx.tenant.findUnique(...))` — a guard opening **its own** scope | The canonical fix for the guards-before-interceptors trap. |
| ″ | 57-60 | no `tenantId` → `ForbiddenException` (fail closed) | |
| `apps/api/src/modules/auth/guards/two-factor-gate.guard.ts` | 16-22 (doc), 45-57 | `forTenant` / `asPlatform` + `if (!dbUser …) throw` | The historical bug this file documents; keep the comment. |
| `apps/api/src/infra/queue/job-router.service.ts` | 28-35 | `run()`: `envelope.tenantId ? forTenant : asSystem` — the job-side scope re-establishment | Without this a job reads an empty DB and "succeeds". |
| `apps/api/src/core/queue/jobs.ts` | 32-36 | `JobEnvelopeOf.tenantId: string \| null` captured at enqueue | |
| `apps/api/src/common/sequence/sequence.service.ts` | 49-63 | `pg_advisory_xact_lock(hashtext('<label>:<tenantId>'))` | Per-tenant, per-label counter lock. |
| `apps/api/src/modules/tenants/services/plan-limits.service.ts` | 174 | `pg_advisory_xact_lock(hashtext(key))` | Seat-race lock; `key` is per tenant **and** per resource. |
| `apps/api/src/modules/invitations/invitations.service.ts` | 512-520 | `TenantContext.run({scope:{kind:'tenant',tenantId}, tx}, …)` inside the system-scoped accept | Hand-passing the resolved tenant into `PlanLimitsService`. |
| `apps/api/prisma.config.ts` | 19-23 | `DATABASE_ADMIN_URL \|\| DATABASE_URL \|\| placeholder` | migrate/seed use the owner; runtime uses the restricted role. |
| `apps/api/src/config/env.ts` | 18, 21 | `DATABASE_URL` required, `DATABASE_ADMIN_URL` defaults `''` | |

**Every `SET LOCAL` / `current_setting` / `set_config` site in the repo** (exhaustive; from a
repo-wide grep excluding `node_modules`/`dist`/`.next`/`coverage`/`packages/create-dontpanic`):

| Site | Lines |
| --- | --- |
| `apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql` | 25 (`current_setting('app.current_tenant_id', true)`), 30 (`app.platform_admin`), 35 (`app.system`) |
| `apps/api/src/infra/prisma/prisma.service.ts` | 83 (`set_config('app.current_tenant_id', $1, true)`), 86 (`set_config('app.platform_admin','on',true)`), 89 (`set_config('app.system','on',true)`) |
| `apps/api/src/infra/prisma/prisma.service.spec.ts` | 68, 78-79, 82 — asserts `set_config` runs **before** the work, and that it is transaction-local |
| `apps/api/src/infra/queue/job-router.service.spec.ts` | 65 — asserts the work does not escape the scope |
| `apps/api/src/common/sequence/sequence.service.ts` | 62 (`pg_advisory_xact_lock`) |
| `apps/api/src/modules/tenants/services/plan-limits.service.ts` | 174 (`pg_advisory_xact_lock`) |
| `apps/api/src/modules/tenants/services/plan-limits.service.spec.ts` | 248, 318 |
| `CLAUDE.md` | 88, 96, 143 · `README.md` 134, 167, 428, 463 (prose) |

There are **no other** places that speak to Postgres about scope. That is the whole surface.

### 2. What single-tenant mode changes

| file | line(s) | change |
| --- | --- | --- |
| `.env.example` | 164 | `PUBLIC_SIGNUP_ENABLED=true` → **`false`**, and rewrite the comment at 155-163: in single-tenant mode public signup cannot exist at all, because signup *is* company creation. |
| `.env.example` | 282 | `NEXT_PUBLIC_SIGNUP_ENABLED=true` → **`false`** (must agree with the API half or the form renders and every submit 403s — `signup.service.ts:38-48`). |
| `apps/api/src/config/env.ts` | 123 | `PUBLIC_SIGNUP_ENABLED: boolish(true)` → `boolish(false)` when single-tenant. Optional hardening: in single-tenant mode make `validateEnv` **fail the boot** if it is set true, the same way the OAuth half-configured check does. |
| `apps/api/src/modules/auth/services/signup.service.ts` | whole file (1-138) | **Do not emit.** Nothing in single-tenant mode should be able to create a second tenant. Also drop its `@SystemScope()` route from `auth.controller.ts` (8 → 7 occurrences; see §3.2) and its provider from the auth module. Alternative if the generator prefers a smaller diff: emit the file and rely on 46-48 returning 403 — **rejected**, because the code path still exists, `RESERVED_TENANT_SLUGS` still ships, and a later env flip silently re-opens tenant creation. Delete it. |
| `apps/api/src/modules/platform/**` (`platform.controller.ts`, `platform-plans.controller.ts`, `services/platform-tenants.service.ts`, `services/platform-stats.service.ts`, `services/platform-plans.service.ts`, `guards/superadmin.guard.ts`, `support/platform-audit.ts`, `dto/platform.dto.ts`, `platform.module.ts`) | all | **Do not emit** in single-tenant mode. `POST /platform/tenants` is the other tenant-creation door; `GET /platform/tenants` and `/platform/stats` are cross-company reads that have no meaning with one company. Consequence: `PrismaService.asPlatform` (111-113) becomes reachable only from `TwoFactorGateGuard:53` (SUPERADMIN path) — keep it, it is still correct. |
| `apps/api/src/modules/tenants/**` | all | **KEEP, relabel as "organisation settings".** `tenants.controller.ts:29-63` is the company managing *itself* (`GET/PATCH /tenants/me`, branding, plan, plan-usage) — exactly what a single-tenant product calls Settings. Rename nothing on the API (`/tenants/me` stays; renaming breaks the shared contract). Relabel only in the UI copy. |
| `apps/api/src/modules/tenants/support/tenant-provisioning.ts` | 57-105 | **KEEP.** The seed calls the same code path, and it is what keeps seed and (absent) signup from drifting. In single-tenant mode it has exactly one caller: the seed. |
| `apps/api/src/modules/tenants/services/plan-limits.service.ts` | all | KEEP if the `plans` feature is on; drop with that feature. Independent of single-tenant. |
| `apps/web/src/app/(auth)/signup/page.tsx` + `signup.test.tsx` | all | **Do not emit** (the company-creation form: `companyName`, `slug` at 139-167). |
| `apps/web/src/app/(auth)/signup/complete/page.tsx` | all | **Do not emit** — the OAuth "unknown identity finishes registration" screen creates a company (`slug` at 145-167). In single-tenant mode an unknown social identity has nowhere to go: the OAuth callback must return `signup_disabled` instead of minting a ticket. |
| `apps/web/src/app/(auth)/login/page.tsx` | the `auth.signup.*` links (`auth.login.signup`) | Remove the "create an account" link. |
| `apps/web/src/app/platform/**` (`layout.tsx`, `page.tsx`, `plans/page.tsx`, `tenants/page.tsx`) and `apps/web/src/components/platform/**` (21 files incl. `create-tenant-dialog.tsx`, `tenants-table.tsx`, `signups-chart.tsx`, `stat-card.tsx`, `tenant-status-badge.tsx`, `platform-api.ts`, `change-plan-dialog.tsx`, `extend-trial-dialog.tsx`, `suspend-tenant-dialog.tsx`, `plan-form-dialog.tsx`, `format.ts`) | all | **Do not emit.** |
| `apps/web/src/components/tenant/tenant-gate.tsx` | 19-50 (`TenantBlocked`), 56-65 (`TenantGate`) | **KEEP as-is.** Counter-intuitive but correct: a *single* tenant can still be `SUSPENDED`/`CANCELED`/past trial, and `TenantStatusGuard` still 403s the whole API. Making this a no-op would leave the app painting a shell where every request fails. Only the copy changes ("your company" → "this installation"). |
| `apps/web/src/components/tenant/trial-banner.tsx` | 12, 19-56 (`TrialNotice`), 59-63 (`TrialBanner`) | **No-op only if `plans` is off.** With `plans` on, a single-tenant install seeded `status: 'ACTIVE'` never renders it (guard at line 29: `if (status !== 'TRIAL') return null`), so it is already self-disabling — the cheapest correct answer is to keep the component and seed the tenant `ACTIVE` (see the seed row below). Emit it only when `plans` is selected. |
| `apps/web/src/components/tenant/use-tenant.ts` | 26-33 (`useTenant`) | **KEEP** — `/tenants/me` is the organisation-settings read, and `TrialBanner` consumes it. |
| ″ | 35-42 (`useUpdateTenant`), 46-52 (`useBranding`), 54-61 (`useUpdateBranding`), 74-80 (`usePlan`), 93-100 (`usePlanUsage`), 103-105 (`isAtLimit`) | **Already dead in the current repo** — a repo-wide grep finds no caller outside `use-tenant.ts` itself and `use-tenant.test.tsx`. They exist for the product author to build the settings screen on. Keep (they are the organisation-settings API), but note in the generated README that no screen consumes them yet. `usePlan`/`usePlanUsage`/`isAtLimit` drop with the `plans` feature. |
| `apps/web/src/components/tenant/app-shell.tsx` | 12-28 | **Misnamed, nothing to do.** It is only the mobile nav-drawer context (`mobileNavOpen`). No tenancy content; not even referenced by `app-sidebar.tsx`, which keeps its own `useState` at line 82. Emit unchanged (or drop as dead code, independent of this decision). |
| `apps/web/src/components/tenant/under-construction.tsx` | all | Unrelated placeholder; keep. |
| `apps/web/src/app/(dashboard)/layout.tsx` | 3-4, 12, 18, 31 | Keep `TenantGate`; keep or drop `TrialBanner` with `plans`. |
| `apps/web/src/components/app-sidebar.tsx` | 16-19 (`NAV`), 27-32 (`/admin` when `role === 'ADMIN'`), 59-79 | **Names no company today.** Nothing to hide. The only per-role entry is `/admin` (company user management), which stays — in single-tenant mode it is "Users". There is no `/platform` link anywhere in the sidebar (the panel is reached by URL and guarded by a 404). |
| `apps/web/src/components/user-menu.tsx` | 45-97 | **Names no company today** (user name + e-mail only, 59-64 and 70-75). Nothing to hide. |
| `packages/shared/src/tenant.ts` | 24-30 (`tenantSlugSchema`), 33-60 (`RESERVED_TENANT_SLUGS`) | **Still needed, minimally.** The `slug` column stays `@unique NOT NULL` (`prisma/schema/tenancy.prisma:50-52`), so the seed must supply one and `tenantSlugSchema` still validates it. `RESERVED_TENANT_SLUGS` exists only to stop a *user-chosen* slug colliding with our routes — with no signup and no platform panel there is no user-chosen slug, so it becomes **dead**: its three consumers are `signup.service.ts:18`, `oauth.service.ts:51` and `platform-tenants.service.ts:25`, all of which are dropped or changed. Keep the constant exported (harmless, and a product author adding a tenant-creation screen wants it) but the generated README should say it is unused. The slug never appears in a URL or subdomain in the app as shipped: the only render site is `apps/web/src/components/platform/tenants-table.tsx:135`, which is dropped. Routing is path-based, never `/:slug/…`. |
| `packages/shared/src/tenant.ts` | `signupSchema` (75-…) | Drop with the signup feature; keep `tenantDtoSchema`, `updateTenantSchema`, `tenantBrandingSchema`, `tenantAddressSchema`, `tenantStatusSchema` (organisation settings still uses them). |
| `apps/api/src/modules/auth/services/token.service.ts` | 16-21 (`tid?: string \| null`), 107-113 (`signAccessToken({ sub, email, role, tid: user.tenantId ?? null, fam })`) | **NO CHANGE. `tid` MUST still be set.** It is the only input to `TenantScopeInterceptor:50-51` → `withScope({kind:'tenant',tenantId})` → `set_config('app.current_tenant_id', …)` → `app.tenant_visible()`. Drop it and *every* authenticated request runs with no scope and reads zero rows. This is the single most important "don't optimise this" line in single-tenant mode. |
| `apps/api/prisma/seed.ts` | 22-34 | Plan upsert: keep only if `plans` is on; in single-tenant mode `isDefault` no longer means "what a public signup lands on" — reword the comment at 21. |
| ″ | 40-50 | SUPERADMIN user: **drop** in single-tenant mode (no platform panel to reach; a tenant-less user is exactly the shape `TenantScopeInterceptor:52-54` refuses, so leaving it creates an account that can log in and see nothing). |
| ″ | 53-63 | **This becomes the fixed tenant.** Change `status: 'ACTIVE'` (already correct — no trial to expire) and make slug/name/email generator inputs rather than the `dontpanic` / `Heart of Gold` demo values. Emit the id deterministically if the generator wants it referenceable: add `id: FIXED_TENANT_ID` to the `create` and keep the `upsert` on `slug` so re-seeding is idempotent. |
| ″ | 67-80 | `SYSTEM_PROFILES` loop: keep verbatim — it is the shared matrix, the same one `provisionTenant` reads. Consider replacing lines 53-80 with a single `provisionTenant(prisma, {...})` call so the seed and the (now only) provisioning path cannot drift; `provisionTenant` takes a `Prisma.TransactionClient`, so wrap it in `prisma.$transaction`. |
| ″ | 82-98 | First ADMIN user: keep. In single-tenant mode this is the **only** way a first user comes into existence (signup is gone, invitations need an inviter). Say so in the generated README: *run the seed or nobody can log in.* |
| ″ | 9-12 | Keep the `DATABASE_ADMIN_URL \|\| DATABASE_URL` adapter and the comment at 6-8: seeding still writes a tenant row, which RLS would refuse under the restricted role. |

#### i18n keys that become dead (`apps/web/messages/pt-BR.json` and `en-US.json` — identical key sets, checked by the parity test)

Dead in single-tenant mode:

- `platform.*` — the entire namespace: `platform.badge`, `platform.navLabel`, `platform.footer`,
  `platform.nav.{overview,tenants,plans}`, `platform.status.{TRIAL,ACTIVE,SUSPENDED,CANCELED}`,
  `platform.overview.*` (13 keys), `platform.tenants.*` (24 keys), `platform.plans.*` (15 keys +
  `platform.plans.form.*` 22 keys), `platform.suspendDialog.*` (7), `platform.planDialog.*` (5),
  `platform.trialDialog.*` (5), `platform.toast.*` (8), `platform.createTenant.*` (27).
- `auth.signup.*` — all of it: `title`, `subtitle`, `companyLegend`, `adminLegend`, `companyName`,
  `companyNamePlaceholder`, `slug`, `slugHint`, `slugTaken`, `emailTaken`, `acceptTerms`,
  `acceptTermsRequired`, `submit`, `hasAccount`, `signin`, `success`, `closedTitle`, `closedBody`,
  `closedInvite`.
- `auth.login.signup` (the link to the signup form).
- `auth.completeSignup.*` — `title`, `subtitle`, `identityNotice`, `taxId`, `companyPhone`,
  `personLegend`, `termsLink`, `privacyLink`, `submit`, `ticketExpired`.
- `auth.oauth.errors.signup_disabled` — **keep**: with single-tenant this becomes the *normal*
  answer for an unrecognised social identity, not an edge case.

Dead only if `plans` is also off: `tenant.trial.{daysLeft,endsToday,hint,seePlan}`.

**Still alive** (do not delete): `tenant.blocked.{title,body,contact}` (a suspended install still
shows the blocked card), `tenant.construction.*`, `invite.*`, `nav.*`, `admin.*`.

Whatever is removed must be removed from **both** locale files: `apps/web` has a key-parity test
(CLAUDE.md:520 — "paridade de chaves i18n") that fails on any asymmetry.

#### CLAUDE.md, lines 81-148

**Reword (safe, and required or the doc lies):**

- **L81** heading `## Multi-tenancy — o isolamento é do Postgres, não da aplicação` → add
  "(modo single-tenant: um tenant fixo, o isolamento continua ligado)".
- **L88-94** the three-scope table: `platform` row (L93) must say the panel is not emitted in
  single-tenant mode; `system` row (L94) must drop "e signup" since signup is gone.
- **L94** `` `system` | caminho de autenticação e signup `` → "caminho de autenticação (e aceite de
  convite)".
- **L119-122** the `@SystemScope()` paragraph: "registrar empresa nova acontece quando ainda não há
  tenant" no longer applies — reword to keep only the authentication justification, and update the
  count (see §3.2).
- **L140-145** `### Planos`: drop entirely if `plans` is off.
- **L127-138** `### Permissões`: the SUPERADMIN bullet (L132-134) must say the platform panel does
  not exist in single-tenant mode. Everything else stands.
- **L75-77** (just above the section) `signup público (opcional, PUBLIC_SIGNUP_ENABLED)` → say
  registration is closed and the only doors are the seed and invitations.

**MUST be kept verbatim — these are the security rules, and single-tenant changes none of them:**

- **L83-86** the "Para agentes de IA" callout ("o filtro por `tenantId` na aplicação é conveniência;
  a garantia dura é o Row Level Security … pergunte ao Marcio").
- **L96-97** "**Sem escopo nenhum, nada é visível.** … esquecer o escopo dá resultado vazio, nunca
  dados da empresa errada."
- **L101-102** "`tenantId` nunca vem do cliente. Vem do claim `tid` do JWT assinado…"
- **L103-104** "Use `this.prisma.db`, não `this.prisma.user` … `atomic()` reaproveita a transação".
- **L105-109** the `DATABASE_URL` / restricted-role / `assertNotSuperuser` / `DATABASE_ADMIN_URL`
  bullet — **the single most important paragraph for a generated project**, because a generated
  `.env` is exactly where someone points the app at the DB owner.
- **L110-115** the guards-before-interceptors bullet, including the `TwoFactorGateGuard` anecdote.
- **L116-118** "Tabela nova com `tenantId` se protege sozinha — `SELECT app.apply_tenant_rls();`".
- **L123** "A suíte e2e roda sob a role restrita."
- **L135** "Sem perfil, nada. Falha fechada, nunca 'tudo por omissão'."

And from the other section the generator was told to re-read, **all of lines 523-541 stay verbatim**
(the four e2e determinism rules, `ownerDb()`/`closeOwnerDb()`, `e2e-sequencer.js`,
`assertCleanStart()`, "nunca TRUNCATE dentro de uma suíte"). Single-tenant changes none of it; if
`tenant-isolation.e2e-spec.ts` is dropped (see §3.6) the note at L539-541 must still explain the
restricted role, because `auth.e2e-spec.ts` and `security.e2e-spec.ts` also run under it.

### 3. The traps

**3.1 — The `tid` claim.** The obvious "simplification" is: one tenant, so stop putting `tid` in the
JWT and stop deriving a scope. Result: `TenantScopeInterceptor:47-56` computes
`user.tenantId ? … : null`, gets `null`, returns `next.handle()` **without opening a scoped
transaction** — and `PrismaService.db` (147-151) falls through to the base client. Under
`FORCE ROW LEVEL SECURITY` with `app.tenant_visible()` returning false for a NULL setting, every
query returns **zero rows and no error**. The app looks like an empty database. Keep
`token.service.ts:111` (`tid: user.tenantId ?? null`) exactly as it is.

**3.2 — The `@SystemScope()` allowlist test.** `system-scope.decorator.spec.ts:29-75` walks
`apps/api/src` and asserts the *exact* multiset:

```
'modules/auth/auth.controller.ts:8',
'modules/auth/oauth/oauth.controller.ts:1',
'modules/invitations/public-invitations.controller.ts:2',
```

Two ways this breaks a generated project, both silent-in-review and loud-in-CI:

- Dropping features **shrinks** the list. No `oauth` → the second entry must go. No `invitations` →
  the third must go. No `signup` → `auth.controller.ts` drops from **8 to 7**. The generator must
  emit this spec with counts computed from the selected feature set, not copied.
- The failure mode if it is copied blindly is a red suite on a freshly generated project, which
  trains the user to edit the assertion — and once they learn to edit it, the guard that "fails when
  someone adds one" is gone. That is the real damage, not the red build.

Note also what the spec's own comment says (`spec.ts:58-61`): the OAuth `start`/`callback` routes are
deliberately **not** on the list because they open a narrower `asSystem` *inside* the service. A
generator that "tidies" that into a decorator widens the exception.

**3.3 — Guards run before interceptors.** Any guard the generator emits that reads the database must
use `prisma.forTenant(...)` / `prisma.asPlatform(...)`, never `prisma.db`. Two guards in the repo do
it right and both carry the explanation:

`apps/api/src/modules/auth/guards/two-factor-gate.guard.ts:16-22`
> "Nest runs guards BEFORE interceptors, so `TenantScopeInterceptor` has not opened the request
> transaction yet. Reading through `prisma.db` here would fall through to the unscoped base client,
> where RLS returns no rows — the user would look absent and **the gate would wave everyone through
> with 2FA required**."

`apps/api/src/modules/auth/guards/tenant-status.guard.ts:62-68` then does
`await this.prisma.forTenant(tenantId, tx => tx.tenant.findUnique(...))` followed by
`assertTenantAllowed(tenant)` — fails closed on `null`. The danger is direction-specific: an empty
read that means "not found" in a *blocking* guard reads as "nothing to block", i.e. it **fails
open**.

**3.4 — "One tenant, so `requireTenantId()` can default."** `tenant-context.ts:39-47` throws:

```ts
throw new Error(
  'No tenant in context. Every operation on a company’s data must run inside TenantContext.run().',
);
```

Returning a hard-coded fixed id instead would make `tenantWhere()` (`tenant-crud.ts:34-36`) and
`TenantCrud.create` (132-140) silently succeed **outside any scope** — i.e. outside the transaction
that did the `set_config`. The Prisma-level filter would be right and the RLS `WITH CHECK` would
reject the write, so the app would fail confusingly rather than leak; but the moment a second tenant
is ever added (and single-tenant mode leaves the machinery able to), the default becomes a
cross-tenant write. Leave the throw.

**3.5 — Deleting the platform panel without deleting the SUPERADMIN seed.** `seed.ts:40-50` creates
a user with `role: 'SUPERADMIN'` and **no** `tenantId`. With `/platform` gone, that account can log
in (JwtAuthGuard passes), `TenantStatusGuard:55` waves SUPERADMIN through, and
`TenantScopeInterceptor:48-49` gives it `{kind:'platform'}` — a scope that crosses tenants, on an
account with no UI to constrain it, in a product whose owner was told "there is only one tenant".
Drop the SUPERADMIN from the seed when the platform feature is off; if it is kept, keep the panel.

**3.6 — Dropping `tenant-isolation.e2e-spec.ts`.** Tempting in single-tenant mode ("nothing to
isolate"). But it is the only test that proves the restricted role is actually in use: the suite runs
as `dontpanic_app` (`apps/api/test/e2e-setup.ts:17-18`, `:33-34`), with the owner reserved for
bookkeeping (`E2E_ADMIN_DATABASE_URL` at `:22`, `:34`, consumed by `ownerDb()` at
`e2e-app.ts:214-219`). If the spec goes, nothing fails when someone points `DATABASE_URL` at the
owner — and `assertNotSuperuser` only *warns* outside production (`prisma.service.ts:60-63`).
Recommendation: keep a reduced version that seeds two tenants at the DB level via `ownerDb()` and
asserts the app cannot read across them, even though the product only ever has one. If that is
dropped, the generator must at minimum keep `assertNotSuperuser` and add the check to the generated
production checklist (the repo already has the line: `PENDENCIAS.template.md:38`).

**3.7 — `TenantGate` / `TrialBanner` as no-ops.** Making `TenantGate` (`tenant-gate.tsx:56-65`)
return `<>{children}</>` unconditionally leaves the shell painting while `TenantStatusGuard` 403s
every request — a blank dashboard with no explanation. The single tenant can still be `SUSPENDED`
or `CANCELED` (`tenants.status` enum, `tenancy.prisma:39-46`). Keep the gate; change only the copy.

**3.8 — The seed is the only door.** With signup gone, `provisionTenant` reachable only from the
seed, and invitations requiring an authenticated inviter, a generated single-tenant project that is
never seeded has **zero** users and no way to create one. This has to be in the generated README's
TL;DR, not a footnote.

**3.9 — Half-configured signup flags.** `signup.service.ts:38-48` spells out the trap: the API half
is authoritative and the web half only decides whether the form renders. Emitting
`PUBLIC_SIGNUP_ENABLED=false` while leaving `NEXT_PUBLIC_SIGNUP_ENABLED=true` produces a form that
403s on every submit. The generator must write both, in `.env.example` lines 164 and 282.

**3.10 — `oauth` + single-tenant.** The OAuth "third case" (identity nobody has) currently mints a
short-lived ticket and redirects to `/signup/complete`, which creates a company. With that screen
gone, `oauth.service.ts` must return the `signup_disabled` error code instead of a ticket — the key
`auth.oauth.errors.signup_disabled` already exists in both locale files. Leaving the ticket path
while deleting the screen strands the user on a 404 holding a valid signup ticket.

---

## F10 · queue — durable jobs + worker

### (a) EXCLUSIVE FILES — delete whole

**Level (i) — bullmq adapter only:**

| Path | Notes |
| --- | --- |
| `apps/api/src/infra/queue/bullmq-queue.adapter.ts` | |
| `apps/api/src/infra/queue/bullmq-queue.adapter.spec.ts` | tests only the adapter |
| `apps/api/src/worker.ts` | the worker process exists **only** to consume the bullmq queue; under `memory` it logs and exits (`worker.ts:29-33`) |
| `apps/api/src/worker.spec.ts` | tests only the worker bootstrap |

**Level (ii) — the whole abstraction, additionally:**

| Path | Notes |
| --- | --- |
| `apps/api/src/core/queue/jobs.ts` | |
| `apps/api/src/core/queue/queue.provider.ts` | |
| `apps/api/src/infra/queue/queue.module.ts` | |
| `apps/api/src/infra/queue/queue.module.spec.ts` | |
| `apps/api/src/infra/queue/job-router.service.ts` | **but `purgeExpiredTokens()` (`:64-76`) is real functionality with no other home — see (k)** |
| `apps/api/src/infra/queue/job-router.service.spec.ts` | |
| `apps/api/src/infra/queue/memory-queue.adapter.ts` | |
| `apps/api/src/infra/queue/memory-queue.adapter.spec.ts` | |
| `apps/api/src/health/queue.health.ts` | |
| `apps/api/src/health/queue.health.spec.ts` | |

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | `17` (`import { QueueModule }`), `109` (`QueueModule,`) | level (ii) only. Level (i) keeps both — `queue.module.ts` shrinks to the memory branch. |
| `apps/api/src/main.ts` | — | **no change either level.** The API process never consumes; `main.ts` has no queue reference (verified by grep). |
| `apps/api/src/health/health.module.ts` | `5` (`import { QueueHealthIndicator }`), `10` (`providers: [CacheHealthIndicator, QueueHealthIndicator]` → drop the second) | level (ii) |
| `apps/api/src/health/health.controller.ts` | `7` (import), `17` (ctor param `queueIndicator`), `27` (`() => this.queueIndicator.isHealthy('queue'),`) | level (ii). **The health check DOES enumerate the queue** — `/api/health` currently returns a `queue` key, and removing it changes the public probe payload. Level (i) keeps the indicator but it becomes a permanent `up` (memory `ping()` is a no-op: `memory-queue.adapter.ts:48-50`) — arguably worth deleting at level (i) too, since a check that cannot fail is noise. |
| `apps/api/src/infra/queue/queue.module.ts` | level (i): `5` (bullmq import), `17-26` (the ternary → `new MemoryQueueAdapter()`), and the whole `OnModuleInit`/`onModuleInit` guard becomes unconditional (`31-49`: drop `implements OnModuleInit`? no — keep it, but delete the `if (… !== 'memory') return;` at `:47`) | |
| `apps/api/src/infra/queue/job-router.service.ts` | see (k) for the `never` default at `49-55` | |
| **`apps/api/src/modules/auth/services/auth.service.ts`** | `26` (`import { QUEUE_PROVIDER, type QueueProvider }`), `105` (`@Inject(QUEUE_PROVIDER) private readonly queue: QueueProvider,`), `108-121` (`dispatchMail`, whose body is `void this.queue.enqueue('mail.send', { message }).catch(…)` at `118-120`) | level (ii): rewrite `dispatchMail` to inject `MAIL_PROVIDER` and `await this.mail.send(message)` (or keep fire-and-forget `void`). Level (i): **no change.** |
| **`apps/api/src/modules/users/services/users.service.ts`** | `33` (import), `62` (inject), `65-78` (`dispatchMail`, enqueue at `75-77`) | same as above |
| **`apps/api/src/modules/invitations/invitations.service.ts`** | `27` (import), `93` (inject), `158-198` (`dispatchInvitationEmail`, enqueue at `186-197` incl. the dedup `jobId: \`invitation:${sha256(params.rawToken)}\`` at `:193`) | level (ii): the `jobId` dedup guarantee **has no synchronous equivalent** — see (k). Level (i): no change. |
| `apps/api/src/worker.ts` | `42-46` — the only `tokens.purge-expired` enqueue, with `repeatCron: '17 * * * *'`, `jobId: 'tokens-purge-expired'`, `systemWide: true` | both levels: this scheduled cleanup disappears with the worker |
| `apps/api/src/core/queue/jobs.ts` | `8-20` (`JobPayloads`: `'mail.send'` at `:14`, `'tokens.purge-expired'` at `:19`), `22` (`JobName`), `32-36` (`JobEnvelopeOf`), `44` (`JobEnvelope`) | level (ii) deletes the file. **Level (i) keeps it unchanged** — the union is driver-agnostic. |
| `apps/api/src/infra/queue/job-router.service.ts` | `38-56` the switch: `39-43` `case 'mail.send'`, `45-47` `case 'tokens.purge-expired'`, `49-55` the `default` with `const unknown: never = envelope;` | level (i): if the worker is gone, `tokens.purge-expired` has no enqueuer — either keep the case (harmless, dead) or remove the job from the union **and** the case together. Removing only one side breaks the build, which is the point of the `never`. |
| `apps/api/test/setup.ts` | `11` (`QUEUE_DRIVER: 'memory',`) | level (i): keep (now the only literal). Level (ii): delete. |
| `apps/api/test/e2e-setup.ts` | `26-30` — the comment block `27-29` explaining "no worker process in the e2e run" and `30` `process.env.QUEUE_DRIVER = 'memory';` | same |
| `apps/api/test/e2e-app.ts` | — | **no change.** No queue provider override; the e2e app relies on `QUEUE_DRIVER=memory` from `e2e-setup.ts`. Note the coupling: e2e mail assertions depend on the memory adapter running inline (`memory-queue.adapter.ts:41`, "Awaited on purpose"). At level (ii) that inlining is what synchronous sending gives for free. |
| `apps/api/test/prisma-mock.ts` | — | **no change**, but note `forTenant`/`asSystem` (`:42-46`) exist partly for `JobRouter.run` (`job-router.service.ts:31,34`); they are also used by guards, so keep them. |
| `apps/api/package.json` | `9` (`"worker": "node dist/worker.js"`), `10` (`"worker:dev": "tsx watch src/worker.ts"`) | both levels |
| `apps/api/package.json` | `51` (`bullmq`), `53` (`ioredis`) | see (i) |
| root `package.json` | — | **no change.** No `worker` script at root; `scripts` are `dev/build/lint/typecheck/test/test:e2e/format/audit/changeset/release/prepare` (`:11-24`). |
| `turbo.json` | — | **no change.** No `worker` task; `tasks` are `build/dev/lint/typecheck/test/test:e2e` (`:5-29`). |
| `docker-compose.yml` | `20-33` (`redis` service), `83` (`redis_data:` volume) | **only if CACHE_DRIVER is also memory** — see (k). Never remove Redis for the queue alone. |
| `docker-compose.dev.yml` | `83-109` — the whole `worker` service (build `84-86`, `container_name: dontpanic-worker-dev` `87`, `command: pnpm run worker:dev` `91-92`, env `94-103`, `depends_on: redis/api` `105-109`) | both levels |
| `docker-compose.dev.yml` | `78-79` (`api` `depends_on: redis: service_healthy`), `62` (`REDIS_URL` in api), `98` (`REDIS_URL` in worker) | `62`/`78-79` stay while `CACHE_DRIVER=redis`; `98` goes with the worker service |
| `Dockerfile.api` | `23-31` — the comment block explaining that the worker ships in the same image (`24-27` incl. `command: ["node","dist/worker.js"]`, `29-30` the "only the API container migrates" rule) | both levels: prune the comment. The `CMD` at `:31` is unchanged (it runs `dist/main.js`). |
| `Dockerfile.web` | — | **no change** |
| `apps/api/jest.config.js` | `47-54` coverage thresholds | advisory: `bullmq-queue.adapter.spec.ts` (≈260 lines of spec), `memory-queue.adapter.spec.ts`, `job-router.service.spec.ts`, `worker.spec.ts` and `queue.health.spec.ts` are dense, high-coverage suites; removing them moves the global percentages. Re-measure. |
| `apps/api/src/config/env.spec.ts` | — | no `QUEUE_*` assertion exists (grep: only `STORAGE_DRIVER` at `:22`). Nothing to prune. |

### (c) PRISMA

**No schema change at either level.** Queue adds no model and no column; job state lives in Redis. Grep of `apps/api/prisma/schema/*.prisma` for queue/job: zero hits.

Caveat: `JobRouter.purgeExpiredTokens()` (`job-router.service.ts:64-76`) deletes from `passwordResetToken` and `emailVerificationToken`. Those models belong to **auth** and stay; only their scheduled cleanup goes.

### (d) packages/shared

**Nothing.** `JobPayloads`/`JobEnvelope`/`QueueProvider` live entirely in `apps/api/src/core/queue/**`; `packages/shared/src/index.ts` (`6-14`) exports no queue symbol. `apps/api/src/core/queue/jobs.ts:1` imports `MailMessage` from `../mail/mail.provider` — an API-local type, not shared. **No `index.ts` change.**

### (e) WEB

**Nothing.** No App Router route, no nav entry, no component, no i18n key mentions jobs/queue/worker. Verified: grep of `apps/web/messages/*.json` for `worker|fila|queue` returns zero hits; grep of `apps/web/src` for `queue` returns only `@tanstack/react-query`'s `useQueryClient`/`qc` (unrelated). The web app is fully queue-agnostic — mail is fire-and-forget behind the API either way.

### (f) ENV

`.env.example`:

| lines | out |
| --- | --- |
| `106-124` | the whole `# Background jobs` block: header `106-108`, the explanatory comment `109-115`, `QUEUE_DRIVER=bullmq` (`116`), `QUEUE_NAME=dontpanic` (`117`), the prefix comment + `QUEUE_PREFIX={dontpanic}` (`118-119`), `QUEUE_CONCURRENCY=5` (`120`), the attempts comment + `QUEUE_ATTEMPTS=5` (`121-123`), `QUEUE_BACKOFF=2000` (`124`). **Level (i):** keep only `QUEUE_DRIVER=memory` with a one-line comment; drop `117-124` (all bullmq-specific). **Level (ii):** delete `106-124` entirely. |
| `10` (`REDIS_PORT=4203`), `53` (`REDIS_URL=redis://localhost:4203`) | **KEEP** unless cache also goes — see (k) |

`apps/api/src/config/env.ts`:

| lines | out |
| --- | --- |
| `87-98` | the `// --- background jobs ---` block. `91` `QUEUE_DRIVER: z.enum(['bullmq','memory']).default('bullmq')`; `92` `QUEUE_NAME`; `93-94` `QUEUE_PREFIX`; `95` `QUEUE_CONCURRENCY`; `96` `QUEUE_ATTEMPTS`; `97-98` `QUEUE_BACKOFF`. **Level (i):** delete `92-98` (bullmq-only) and reduce `91` to `z.enum(['memory']).default('memory')` — or delete the key and hard-wire. **Level (ii):** delete `87-98`. |
| `22` (`REDIS_URL`) | keep while `CACHE_DRIVER=redis` is an option |

`validateEnv` (`env.ts:234-285`): **no queue branch exists.** No cross-field rule ties `QUEUE_DRIVER=bullmq` to `REDIS_URL` being reachable — that is a real gap (production with `QUEUE_DRIVER=bullmq` and no worker boots happily and silently never sends mail; CLAUDE.md `161-162` and `586` warn about it in prose only). Nothing to prune; if the generator keeps bullmq it could *add* such a check.

`env.spec.ts`: no `QUEUE_*` cases to remove.

**Driver enum implications:**
- `QUEUE_DRIVER` — dropping `bullmq` leaves a one-position knob; `queue.module.ts:17-26` collapses. Dropping the whole enum (level ii) means `worker.ts:29` (`config.get('QUEUE_DRIVER')`) has no referent, which is fine because `worker.ts` is deleted.
- `CACHE_DRIVER` (`env.ts:48`) — **independent enum, but shares `REDIS_URL` and `ioredis`.** See (k).
- `MAIL_DRIVER` (`env.ts:47`) — **becomes load-bearing at level (ii)**: with no queue to retry, a failing SMTP host is a lost e-mail on the first try. `MAIL_DRIVER=console` in tests (`test/setup.ts:12`) already makes unit tests pass either way.
- `STORAGE_DRIVER` — unrelated.

### (g) SEED

`apps/api/prisma/seed.ts`: **no change.** Grep for `queue|worker`: zero hits. The seed never enqueues anything and never needs a worker running.

### (h) CLAUDE.md + README.md to prune

`CLAUDE.md`:

| heading / span | lines | action |
| --- | --- | --- |
| TL;DR | `15` | `docker compose up -d # postgres, redis, minio, mailpit` — keep `redis` unless cache also goes |
| TL;DR | **`21`** | `pnpm --filter @dontpanic/api worker:dev   # noutro terminal: sem ele, e-mail não sai` — **delete this line at both levels** |
| TL;DR service ports | `26-28` | `Redis :4203` mentioned at `27` — keep unless cache also goes |
| Arquitetura — Ports & Adapters **table** | row at **`60`** = `\| Jobs \| QueueProvider \| bullmq, memory \| QUEUE_DRIVER \|`. Level (i): adapters cell → `memory`. Level (ii): **delete the row.** | |
| Arquitetura bullets | `65` | "Em teste, use `memory` / `console` / `local`" — the first `memory` covers cache and queue; reword at level (ii) |
| **Fila de jobs** | **`149-189`** (heading `149`, AI warning `151-154`, driver prose `156-162`, "Como funciona" `164-175`, "Ao adicionar um job" `177-180`, "Em produção" `182-187`, `---` at `189`) | **Level (ii): delete the whole section 149-189.** Level (i): keep a trimmed version — `156-158` (bullmq) and `182-187` (worker in production) go; `160-162` becomes the only driver; `164-175` keeps the typed-catalogue and tenant-travel bullets, drops "Erro propaga" (`172-173`, retry-specific) and "`jobId` deduplica" (`174-175`, bullmq-specific — the memory adapter ignores `jobId` entirely, see `memory-queue.adapter.ts:22-42`). |
| Convites | `159-166` of that section (CLAUDE.md `158-166` region) — the "Grava na transação, manda o e-mail depois do commit" bullet at `216-219` region, and the AI warning at `193-197` | wording survives level (i) unchanged; at level (ii) the commit-then-send rule still holds (synchronous send after commit) but the "queue" framing must be reworded |
| Multi-tenancy AI warning | `151-154` is the queue one; the multi-tenancy section (`81-123`) is untouched | |
| Testes | `519` | no queue mention; unchanged |
| Docker | `545-547` | mentions Redis at `545`; the `docker-compose.dev.yml` worker service is not named — no change needed |
| **O que NÃO fazer — the two bullets that belong to queue** | **`584-585`** (`Não enfileirar job com \`systemWide: true\` só para "funcionar" — sem tenant o RLS não devolve nada e o job mente que deu certo. Veja "Fila de jobs".`) and **`586`** (`Não subir produção com \`QUEUE_DRIVER=memory\`: e-mail nenhum sai se o worker não existir.`) | level (i): delete `586` (no worker exists any more — the warning inverts), keep `584-585` only if the port survives; level (ii): delete both `584-586` |
| O que NÃO fazer — invitations bullet | `575-576` (`Não disparar o e-mail de convite dentro da transação…`) | **KEEP at both levels** — the rule is about transaction boundaries, not about the queue |

`README.md`: **the README has no queue/worker/jobs section at all.** Its two Ports-&-Adapters tables have only 5 rows (`245-251` pt: Storage/E-mail/Cache/Banco/Captcha; `544-550` en: Storage/Mail/Cache/Database/Captcha) — **no `Jobs` row to delete**, and no worker mention anywhere (grep for `worker|bullmq|queue|fila|jobs`: zero README hits beyond the Redis rate-limit lines). Only Redis mentions are `228`/`527` (rate-limit counters), `276`/`575` (services table) and `90`/`281`/`305`/`385`/`580`/`604` (compose lists) — all cache/throttler, none queue. So the README needs **no queue pruning**, but the generator should note the README is already out of sync with CLAUDE.md on this feature.

### (i) NPM DEPS

| dep | declared at | verdict |
| --- | --- | --- |
| `bullmq` | `apps/api/package.json:51` | **Removable at both levels.** Sole usage `apps/api/src/infra/queue/bullmq-queue.adapter.ts:2` (`Queue`, `Worker`, `JobsOptions`) + its spec's `jest.mock`. |
| `ioredis` | `apps/api/package.json:53` | **KEEP unless the redis cache adapter also goes.** Two independent consumers: `apps/api/src/infra/queue/bullmq-queue.adapter.ts:3` (`import IORedis, { type Redis } from 'ioredis'`) **and** `apps/api/src/infra/cache/redis-cache.adapter.ts:2` (`import Redis from 'ioredis'`). Removing the queue alone leaves `ioredis` required by the cache. Only a build with `CACHE_DRIVER=memory`-only **and** no bullmq can drop it. |
| `@nestjs/terminus` | `apps/api/package.json:45` | **KEEP.** Four consumers: `health/queue.health.ts:2`, `health/cache.health.ts:2`, `health/health.module.ts:2` (`TerminusModule`), `health/health.controller.ts:2` (`HealthCheck`, `HealthCheckService`, `PrismaHealthIndicator`). Removing the queue indicator leaves three. |
| `@aws-sdk/*`, `sharp`, `@fastify/multipart` | — | not queue; see files section |
| `nodemailer` (`:56`) | | **KEEP** — mail feature; at level (ii) it becomes the synchronous path |

`pnpm-workspace.yaml`: no bullmq/ioredis entry in `overrides`, `allowBuilds`, `onlyBuiltDependencies` or `minimumReleaseAgeExclude`. **No change.** (`msgpackr-extract: false` at `:31` is a bullmq transitive build script left disabled — harmless either way, can be pruned.)

### (j) MIGRATION SQL (single baseline)

**Queue contributes nothing to the baseline.** No table, no index, no policy, no grant, no function. Verified across all six migration files: zero occurrences of `job`, `queue`, `bullmq` (job state is Redis-only).

Regenerated-by-diff vs hand-written, for completeness of the baseline assembly:

- **Regenerated by `prisma migrate diff`:** every `CREATE TABLE`/`CREATE TYPE`/`CREATE INDEX`/`ALTER TABLE … ADD CONSTRAINT` in `20260613074545_init`, `20260613122947_two_factor_remind_at`, `20260911105130_tenancy`, and the DDL half of `20260912120000_invitations_and_oauth`.
- **HAND-WRITTEN, preserve verbatim** (none of it queue- or files-conditional, so it goes into the baseline unchanged at every removal level):
  - `20260911105200_row_level_security/migration.sql` in full — notably `CREATE SCHEMA IF NOT EXISTS app;` (`:19`), the four context/predicate functions (`:23-44`), `CREATE OR REPLACE FUNCTION app.apply_tenant_rls()` (`:51-89`) which scans `public` for a `tenantId` column and applies `ENABLE`/`FORCE ROW LEVEL SECURITY` + `CREATE POLICY tenant_isolation … USING (app.tenant_visible("tenantId"))` (`:67-75`), the call `SELECT app.apply_tenant_rls();` (`:91`), `app.apply_user_owned_rls()` (`:96-120`) + call (`:122`), and the `permissions` DO-block (`:125-140`).
  - `20260911105300_app_role/migration.sql` in full — `CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;` (`:18-19`), the `GRANT`s (`:25-31`), `ALTER DEFAULT PRIVILEGES` (`:35-40`), and the conditional `REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;` (`:45-51`).
  - `20260912120000_invitations_and_oauth/migration.sql` — the **partial** unique index `invitations_tenant_email_pending_key … WHERE status = 'PENDING'` (Prisma cannot express it; it must be quoted verbatim) and the closing `SELECT app.apply_tenant_rls();` that protects the new `invitations`/`oauth_accounts` tables.

  Because the baseline must end with `SELECT app.apply_tenant_rls();` after all tables are created, a generator dropping files or queue changes nothing about that ordering — neither feature creates a table.

### (k) DEPENDENCIES on other features (queue) — answers

**1. Which features enqueue jobs? Every call site, with the job name:**

| file:line | job name | options | owning feature |
| --- | --- | --- | --- |
| `apps/api/src/modules/auth/services/auth.service.ts:118` | `mail.send` | none | **auth** (verification code, password reset, etc., via `dispatchMail` `117-121`) |
| `apps/api/src/modules/users/services/users.service.ts:75` | `mail.send` | none | **users/profile** (e-mail-change verification code, via `dispatchMail` `74-78`) |
| `apps/api/src/modules/invitations/invitations.service.ts:186-194` | `mail.send` | `{ jobId: \`invitation:${sha256(params.rawToken)}\` }` (`:193`) | **invitations** |
| `apps/api/src/worker.ts:42-46` | `tokens.purge-expired` | `{ repeatCron: '17 * * * *', jobId: 'tokens-purge-expired', systemWide: true }` | **queue itself** (maintenance) |

Test-only call sites (not production): `bullmq-queue.adapter.spec.ts:128,140,148,160,166,192,215`; `memory-queue.adapter.spec.ts:36,45,59,68,78,91,110,121,131,142`.

**If the queue is removed entirely (level ii), what replaces each call:**
- The three `mail.send` sites → inject `MAIL_PROVIDER` and call `this.mail.send(message)` directly. Keeping the existing `void … .catch(logger.warn)` shape preserves the fire-and-forget latency behaviour and the "resend/forgot-password is the recovery path" contract already documented at `auth.service.ts:108-116` and `invitations.service.ts:158-166`. **What is lost:** retry on transient SMTP failure, survival of a mid-request crash, and — at the invitations site — the `jobId` dedup that stops a retried HTTP request mailing the same invitation twice (`invitations.service.ts:190-193`). There is no synchronous equivalent for that dedup; the nearest replacement is an idempotency check on `Invitation.lastSentAt` (`invitations.service.ts:145`).
- `tokens.purge-expired` → **no replacement exists.** `JobRouter.purgeExpiredTokens()` (`job-router.service.ts:64-76`, `deleteMany` on `passwordResetToken` and `emailVerificationToken` where `expiresAt < now`) is the only cleanup of expired single-use credentials. Level (ii) must either re-home it (a cron container, a `pg_cron` job, or best-effort inline cleanup — auth already does a narrow version at `auth.service.ts:133`, `deleteMany({ where: { userId } })` before issuing a new code) or accept unbounded growth of two tables that each hold a live-looking reset link. **Flag this to the user; do not silently drop it.**

**2. Does removing the queue break the durability guarantee CLAUDE.md insists on?** Yes, explicitly and by design of the docs. CLAUDE.md `156-162` states the split is the point ("um SMTP lento não atrasa resposta, e job que falha é repetido em vez de perdido junto com o request") and `160-162` says `memory` "**Não é uma fila**: sem durabilidade, sem retry, sem processo separado"; `586` forbids `QUEUE_DRIVER=memory` in production outright. So:
- **Level (i)** (memory-only) ships exactly the configuration the docs call unsuitable for production — but *honestly*, with the bullmq path gone there is no false promise and no silently-missing worker. The docs must be rewritten, not just trimmed.
- **Level (ii)** is arguably *more* honest than level (i): a synchronous `await this.mail.send()` inside the request at least surfaces failures to the caller's log at the moment they happen, instead of a memory "queue" that drops jobs with a warning when no handler is registered (`memory-queue.adapter.ts:34-37`).

**3. Does the `never` exhaustiveness default force the generator to emit a valid union even with zero jobs? Will an empty union compile?** **No — an empty union does NOT compile.** I verified this against the repo's own TypeScript (`typescript@6.0.3`, `--strict`) with an isolated reduction of `jobs.ts` + `job-router.service.ts`:

```
nevertest.ts(6,20): error TS2339: Property 'name' does not exist on type 'never'.
nevertest.ts(9,71): error TS2339: Property 'name' does not exist on type 'never'.
exit=2
```

With `interface JobPayloads {}`, `JobName` becomes `never`, `JobEnvelope` becomes `never`, and both `switch (envelope.name)` (`job-router.service.ts:38`) and `(unknown as JobEnvelope).name` (`:54`) fail with TS2339. Consequences for the generator:

- **A build that keeps `core/queue/**` MUST keep at least one entry in `JobPayloads`.** The minimum viable union is `'mail.send': { message: MailMessage }` (`jobs.ts:14`) — which means the queue port cannot be emitted "empty and ready for the user's first job".
- Additionally, with `JobName = never`, `QueueProvider.enqueue<N extends JobName>` (`queue.provider.ts:30-34`) becomes uncallable — no type satisfies `N`.
- So the generator has exactly two coherent options and no third: **keep the port with `mail.send` (level i)**, or **remove the abstraction entirely (level ii)**. "Queue port, zero jobs" is not emittable.
- Corollary for level (i): if `tokens.purge-expired` is dropped from `jobs.ts:19` because the worker that schedules it (`worker.ts:42-46`) is gone, its `case` at `job-router.service.ts:45-47` **must** be deleted in the same edit — and `purgeExpiredTokens` (`:64-76`) becomes dead code the linter will flag.

**4. Does the redis cache / throttler storage depend on the queue's Redis?** **Same URL, same client library, separate connections and separate key spaces.**
- Same env: both read `REDIS_URL` (`env.ts:22`) — the queue via `queue.module.ts:20` (`redisUrl: config.get('REDIS_URL')`), the cache via `infra/cache/redis-cache.adapter.ts:2` + its module.
- Same library: `ioredis` is imported by `bullmq-queue.adapter.ts:3` and `redis-cache.adapter.ts:2` independently.
- Separate namespaces: the queue namespaces its keys with `QUEUE_PREFIX` (default `{dontpanic}`, `env.ts:94`, passed at `queue.module.ts:21` → `bullmq-queue.adapter.ts:38`) precisely so "two apps can share one Redis".
- **The throttler storage rides on the cache port, not on Redis directly:** `app.module.ts:102` `storage: new CacheThrottlerStorage(cache)` with `cache` injected as `CACHE_PROVIDER` (`app.module.ts:72`). So rate-limit counters follow `CACHE_DRIVER`, not `QUEUE_DRIVER`.
- Separate health probes by deliberate choice — `queue.health.ts:6-12` documents that they "can point at different Redis instances".

**What survives with `QUEUE_DRIVER=memory` and `CACHE_DRIVER=memory`, and can the generator drop Redis from docker-compose?** Yes — with `CACHE_DRIVER=memory` **and** no bullmq, nothing in the API opens a Redis connection, and the generator can delete `docker-compose.yml:20-33` (`redis` service) + `:83` (`redis_data:` volume), `.env.example:10` (`REDIS_PORT`) and `:53` (`REDIS_URL`), `env.ts:22`, `docker-compose.dev.yml:62`/`78-79`/`98`, and `ioredis` (`apps/api/package.json:53`). **What breaks:**
- **Rate limit stops holding across instances.** `app.module.ts:100-102` comments this exactly: "Distributed store: counters live in Redis (or memory in tests), so the limit holds across multiple API instances instead of per-process." With a memory cache, N API replicas give an attacker N× the budget on every `@SensitiveThrottle()` route (login, signup, verify-email, resend-verification, 2fa/verify, forgot/reset-password). This is a security regression, not a convenience one, and interacts with `AUTH_RATE_LIMIT_MAX` (`env.ts:82`, default 10).
- **Account lockout state and refresh-token rotation/blacklist become per-process** — `.env.example:52` names Redis's jobs as "rate-limit, refresh-token rotation/blacklist, lockout"; `auth.service.ts:104` injects `CACHE_PROVIDER`. Pending-2FA secrets (`users.service.ts:48`, 10-min TTL) and pending e-mail changes (`:50`, 15-min TTL) also live in the cache, so a multi-replica deployment would lose them on a different replica.
- Verdict: dropping Redis is safe **only** for a single-instance deployment. The generator should gate it behind an explicit "single instance / no horizontal scaling" answer, and must keep Redis whenever the user picks bullmq **or** a multi-replica deploy.

**5. Does the health check enumerate queue/storage?** `apps/api/src/health/health.controller.ts:24-28` registers three checks: `database` (`:25`), `cache` (`:26`), **`queue` (`:27`)**. **Queue: yes. Storage: no.** So removing the queue changes the `/api/health` response shape (a `queue` key disappears from both `info` and `details`); removing files changes nothing there. Nothing in `apps/api/test/**` asserts on `/health` (grep: zero hits), so no e2e breaks — but an external uptime monitor keyed on the `queue` field would.

**6. Cross-feature note — invitations and auth both hard-depend on the queue's existence at the DI level.** `InvitationsService` (`:93`), `AuthService` (`:105`) and `UsersService` (`:62`) each take `@Inject(QUEUE_PROVIDER)` as a **required** constructor parameter. `QueueModule` is `@Global()` (`queue.module.ts:9`), so removing it without editing those three constructors yields a Nest resolution failure at boot, not a compile error — i.e. a level-(ii) generator that forgets one of the three ships a build that fails at runtime with "Nest can't resolve dependencies of the AuthService". All three must be edited together.

---

## F11 · captcha

### (a) EXCLUSIVE FILES — delete whole

API:

- `apps/api/src/core/captcha/captcha.provider.ts` (the port + `CAPTCHA_PROVIDER` symbol)
- `apps/api/src/infra/captcha/captcha.module.ts`
- `apps/api/src/infra/captcha/noop-captcha.adapter.ts`
- `apps/api/src/infra/captcha/recaptcha.adapter.ts`
- `apps/api/src/infra/captcha/turnstile.adapter.ts`
- `apps/api/src/infra/captcha/siteverify.ts` (`siteVerify`, `CaptchaUnavailableError` — grep confirms only captcha files and `captcha.guard.ts:15` import it)
- `apps/api/src/infra/captcha/captcha.adapters.spec.ts`
- `apps/api/src/common/decorators/require-captcha.decorator.ts`
- `apps/api/src/common/guards/captcha.guard.ts`
- `apps/api/src/common/guards/captcha.guard.spec.ts`
- → the directories `apps/api/src/core/captcha/` and `apps/api/src/infra/captcha/` become empty

Web:

- `apps/web/src/components/captcha.tsx`
- `apps/web/src/lib/captcha.ts`
- `apps/web/src/lib/captcha.test.ts`

There is no `captcha.stories.tsx`.

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | 13 | `import { CaptchaGuard } from './common/guards/captcha.guard';` |
| `apps/api/src/app.module.ts` | 20 | `import { CaptchaModule } from './infra/captcha/captcha.module';` |
| `apps/api/src/app.module.ts` | 112 | `CaptchaModule,` in `imports` |
| `apps/api/src/app.module.ts` | 133 | `{ provide: APP_GUARD, useClass: CaptchaGuard },` |
| `apps/api/src/app.module.ts` | 127-131 | guard-order comment: drop "then prove you are human (one outbound call, only on tagged routes)," |
| `apps/api/src/main.ts` | — | **no change** |
| `apps/api/src/modules/auth/auth.controller.ts` | 14 | `import { RequireCaptcha }` |
| `apps/api/src/modules/auth/auth.controller.ts` | 57, 80, 94, 174, 191 | the five `@RequireCaptcha(...)` decorators — **these are the complete list repo-wide** (see (k)) |
| `apps/api/src/modules/invitations/public-invitations.controller.ts` | 28-29 | doc-comment "No `@RequireCaptcha`. The token is 256 bits…" — reword or drop |
| `apps/api/src/modules/auth/services/signup.service.ts` | 44 | comment "Same trap as the captcha driver — the two halves must agree" |
| `apps/api/src/infra/oauth/oauth-http.ts` | 6 | comment "Generous compared to the captcha timeout" |
| `apps/api/src/common/decorators/decorators.spec.ts` | 5 | `import { REQUIRE_CAPTCHA_KEY, RequireCaptcha } from './require-captcha.decorator';` |
| `apps/api/src/common/decorators/decorators.spec.ts` | 54-61 | `describe('@RequireCaptcha()')` — the file keeps `@Public`, `@Roles`, `@SensitiveThrottle` |
| `apps/api/test/security.e2e-spec.ts` | 3-4 | `CAPTCHA_PROVIDER` / `TurnstileAdapter` imports |
| `apps/api/test/security.e2e-spec.ts` | 8-15 | file doc-comment mentions the `@RequireCaptcha()` guard |
| `apps/api/test/security.e2e-spec.ts` | 76-138 | `describe('captcha guard')` — the rate-limit describe (25-74) stays, so the file survives |
| `apps/api/test/e2e-setup.ts` | — | **no change** — it never sets `CAPTCHA_DRIVER` (the schema default `none` is what makes the e2e suite captcha-free) |
| `apps/api/test/prisma-mock.ts` | — | no change |
| `apps/api/jest.config.js` | 47-53 | coverage thresholds don't name captcha files, but the adapters/guard are high-coverage units — re-measure |
| `apps/web/vitest.config.mts` | 33 | `src/lib/**/*.ts` covers `lib/captcha.ts`; no explicit entry to delete, but `captcha.test.ts` (48 captcha hits, the largest captcha test) leaving will move the numbers against thresholds 48-52 |
| `apps/web/src/app/(auth)/login/page.tsx` | 21-22 | `Captcha`/`CaptchaHandle` + `captchaEnabled` imports |
| `apps/web/src/app/(auth)/login/page.tsx` | 46 | `const tCaptcha = useTranslations('auth.captcha');` |
| `apps/web/src/app/(auth)/login/page.tsx` | 53 | `const captchaRef = useRef<CaptchaHandle>(null);` |
| `apps/web/src/app/(auth)/login/page.tsx` | 141-145 | `const captchaToken = await captchaRef.current?.getToken();` + the `captchaEnabled && !captchaToken` early return |
| `apps/web/src/app/(auth)/login/page.tsx` | 147 | `login.mutateAsync({ ...values, captchaToken: … })` → `mutateAsync(values)` |
| `apps/web/src/app/(auth)/login/page.tsx` | 155-159 | `captchaRef.current?.reset();` and the `CaptchaRequired` / `503` error branches |
| `apps/web/src/app/(auth)/login/page.tsx` | 289 | `<Captcha ref={captchaRef} action="login" />` |
| `apps/web/src/app/(auth)/signup/page.tsx` | 15-16, 42, 51, 66-68, 72, 76, 238 | same pattern (imports, `tCaptcha`, `captchaRef`, token gate, mutate payload, `reset()`, `<Captcha action="signup" />`) |
| `apps/web/src/app/(auth)/forgot-password/page.tsx` | 10 captcha hits | same pattern, `action="forgot-password"` |
| `apps/web/src/app/(auth)/reset-password/page.tsx` | 12 captcha hits | same pattern, `action="reset-password"` |
| `apps/web/src/app/(auth)/verify-email/page.tsx` | 11 captcha hits | same pattern, `action="resend-verification"` |
| `apps/web/src/app/(auth)/signup/signup.test.tsx` | 52 | `captcha: { required: …, failed: 'x', unavailable: 'x' }` in the messages fixture |
| `apps/web/src/lib/auth-config.ts` | 6, 19 | comments referencing `./captcha.ts` and "the captcha's site key vs. secret key split" |
| `apps/web/src/lib/auth-config.test.ts` | 5 | comment "Like the captcha module…" |

### (c) PRISMA

**No change whatsoever.** Captcha is stateless — grep over `apps/api/prisma/**` for
`captcha|CAPTCHA` returns zero hits. No model, enum, field or relation.

### (d) packages/shared

`packages/shared/src/auth.ts`

- **5-10** the doc-comment + `export const captchaTokenSchema = z.string().min(1).max(4096).optional();`
- **20** `captchaToken: captchaTokenSchema,` in `resendVerificationSchema`
- **27** `captchaToken: captchaTokenSchema,` in `loginSchema`
- **33** `captchaToken: captchaTokenSchema,` in `forgotPasswordSchema`
- **40** `captchaToken: captchaTokenSchema,` in `resetPasswordSchema`

`packages/shared/src/tenant.ts`

- **2** `import { captchaTokenSchema } from './auth';`
- **88** `captchaToken: captchaTokenSchema,` in `signupSchema`

No cookie-name constant. No `permissionModules` entry.

### (e) WEB

No App Router route is captcha-specific (the component is embedded in five existing forms).
No nav/menu entry. No proxy/middleware allow-list entry (`apps/web/src/proxy.ts` has none).

i18n — prune identically in both files:

| namespace / key path | pt-BR lines | en-US lines |
| --- | --- | --- |
| `auth.captcha.required` / `.failed` / `.unavailable` (whole `auth.captcha` block) | 94-98 | 94-98 |

That is the *only* captcha i18n. Nothing else in the 16 top-level namespaces
(`common, nav, auth, dashboard, profile, admin, session, errors, easter, twoFactorPrompt,
twoFactorSetup, validation, tenant, legal, platform, invite`) references it.

### (f) ENV

`.env.example`

- **126-150** — the whole `# Captcha` block: the banner (126-128), the explanatory prose (129-138),
  `CAPTCHA_DRIVER=none` (139), `CAPTCHA_SECRET_KEY=` (140), `CAPTCHA_MIN_SCORE=0.5` (141-142),
  `CAPTCHA_TIMEOUT=5000` (143), `CAPTCHA_FAIL_OPEN=false` (144-147),
  `NEXT_PUBLIC_CAPTCHA_DRIVER=none` + `NEXT_PUBLIC_CAPTCHA_SITE_KEY=` (148-150)
- **129-131** also contains the "rate limit caps how FAST / captcha caps whether" line — prose only
- **275-279** the shared "public halves" comment mentions nothing captcha-specific; leave

`apps/api/src/config/env.ts`

- **100-111** — the whole `// --- captcha ---` block: `CAPTCHA_DRIVER` (103),
  `CAPTCHA_SECRET_KEY` (104), `CAPTCHA_MIN_SCORE` (105-106), `CAPTCHA_TIMEOUT` (107),
  `CAPTCHA_FAIL_OPEN` (108-111)

**Conditional logic inside `validateEnv()` that must go with it** —
`apps/api/src/config/env.ts:242-247`:

```ts
  if (parsed.data.CAPTCHA_DRIVER !== 'none' && !parsed.data.CAPTCHA_SECRET_KEY) {
    throw new Error(
      "Invalid environment variables. Don't Panic, just fix these:\n" +
        `  - CAPTCHA_SECRET_KEY: required when CAPTCHA_DRIVER is "${parsed.data.CAPTCHA_DRIVER}"`,
    );
  }
```

The OAuth block (249-282) and the `parsed.success` block (236-241) stay.

`apps/api/src/config/env.spec.ts`

- **82-112** — `describe('captcha')`, all five cases: defaults-to-off (83-85),
  refuses-driver-without-secret (87-91), accepts-driver-with-secret (93-99),
  rejects-unknown-driver (101-105), rejects-score-outside-0..1 (107-111)

### (g) SEED

`apps/api/prisma/seed.ts` — **no change** (zero captcha hits).

### (h) CLAUDE.md + README.md

CLAUDE.md:

- line 59 — the **Arquitetura — Ports & Adapters** table row: `| Captcha | CaptchaProvider | turnstile, recaptcha-v2/v3, none | CAPTCHA_DRIVER |`
- **lines 376-409** — the whole `## Captcha — decisão de deploy obrigatória` section (heading 376
  through the blank/`---` at 410), including the AI warning box (378-381), the port/guard paragraph
  (383-386), the driver table (388-393) and the six "Pontos que não são óbvios" bullets (395-408)
- line 408 — that section's last bullet cross-links to Rate limit; the Rate-limit section
  (412-458) itself is captcha-free and stays
- line 210 — inside **Convites** (191-284): "a mesma armadilha que o captcha já tem, pela mesma razão"
- **O que NÃO fazer (558-587) — individual bullets belonging to captcha:**
  - **line 567** — "Não expor `CAPTCHA_SECRET_KEY` no front nem ligar o captcha só num dos lados (API/web)."
- **Autenticação (resumo) (69-80)** — no captcha bullet; nothing to prune there.

README.md:

- **lines 214-226** (pt) — the `**Captcha.**` paragraph (214-215), the driver table (217-222) and
  the closing prose (224-226)
- line 251 (pt) — **Ports e adapters** table row `| Captcha | CaptchaProvider | … |`
- **lines 513-525** (en) — the `**Captcha.**` paragraph (513-514), table (516-521), prose (523-525)
- line 550 (en) — **Ports and adapters** table row

### (i) NPM DEPS

**None.** Every adapter uses `global.fetch` (`apps/api/src/infra/captcha/siteverify.ts`) and the web
side injects the provider script by hand (`apps/web/src/lib/captcha.ts:53-75`). No
`@marsidev/react-turnstile`, no `react-google-recaptcha`. Checked
`apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json`, root
`package.json`.

### (j) MIGRATION SQL for the baseline

**Nothing.** Captcha contributes no DDL to any of the six migrations, hand-written or generated.
All of `app.apply_tenant_rls()`, `app.apply_user_owned_rls()`, the partial unique index
`invitations_tenant_email_pending_key`, and the `dontpanic_app` role are unaffected.

### (k) DEPENDENCIES on other features

**Is captcha coupled to anything besides the auth routes? — NO. Every `@RequireCaptcha` site,
exhaustively:**

| file:line | action |
| --- | --- |
| `apps/api/src/modules/auth/auth.controller.ts:57` | `@RequireCaptcha('signup')` |
| `apps/api/src/modules/auth/auth.controller.ts:80` | `@RequireCaptcha('resend-verification')` |
| `apps/api/src/modules/auth/auth.controller.ts:94` | `@RequireCaptcha('login')` |
| `apps/api/src/modules/auth/auth.controller.ts:174` | `@RequireCaptcha('forgot-password')` |
| `apps/api/src/modules/auth/auth.controller.ts:191` | `@RequireCaptcha('reset-password')` |

(Remaining grep hits are docs/tests: `decorators.spec.ts:54,57`, `captcha.guard.ts:23`,
`captcha.guard.spec.ts:42`, `security.e2e-spec.ts:10`, `public-invitations.controller.ts:28`,
`CLAUDE.md:384,406`, `README.md:214,513`.)

Notably **not** captcha-guarded: `POST /auth/oauth/*` (all of `oauth.controller.ts`),
`POST /auth/invitations/accept` and `GET /auth/invitations/:token`
(`public-invitations.controller.ts:28-29` documents that choice deliberately), `POST /auth/refresh`,
`POST /auth/verify-email`.

Removing captcha does **not** weaken rate limiting — the two are independent layers
(`app.module.ts:67-105` throttler vs `app.module.ts:133` guard), and CLAUDE.md:408 says so. The
`@SensitiveThrottle()` decorator and the account lockout in `auth.service.ts` are untouched.

The web-side `captchaEnabled` flag has an analogue in `apps/web/src/lib/auth-config.ts` (which
documents itself as "Same trap as the captcha"), but there is no code dependency — only comments
(auth-config.ts:6,19; auth-config.test.ts:5).

---

## F12 · public-signup

**First, the distinction the generator must make.** There are two different things called
"public signup":

1. **Env-gated at runtime (what ships today).** `PUBLIC_SIGNUP_ENABLED` (default `true`,
   `env.ts:123`) + `NEXT_PUBLIC_SIGNUP_ENABLED` (`auth-config.ts:44`). Turning it OFF keeps all the
   code: `POST /auth/signup` exists and answers `403 Forbidden` ("Public registration is closed.",
   `signup.service.ts:46-48`); `/signup` renders a sober "closed" card instead of the form
   (`signup/page.tsx:97-115`); the login page hides the "create account" link
   (`login/page.tsx:301-313`); the OAuth callback redirects an unknown identity to
   `?error=signup_disabled` / `no_account` (`oauth.service.ts:404-407`) and
   `POST /auth/oauth/complete-signup` throws 403 (`oauth.service.ts:430-432`).
2. **Code removed by the generator (what this section specifies).** Route, service, page, hook,
   schema and both env vars deleted. **This is viable** and is the more honest output for an
   invitation-only product, because the runtime-OFF state still ships a route that only ever 403s
   and a page that only ever says "closed".

**What remains / what breaks when the code is removed:**

- **The seed still works.** `apps/api/prisma/seed.ts` never calls the signup route — it writes
  `plan` (22-34), the SUPERADMIN (40-50), the demo tenant (53-63), profiles + permissions from the
  shared matrix (66-80) and the company ADMIN (82-95) with `prisma` directly under
  `DATABASE_ADMIN_URL` (9-12). Unchanged.
- **The invitation flow still works, completely.** `InvitationsService` never touches
  `SignupService`; `POST /auth/invitations/accept` creates the user in system scope.
- **Tenant creation then happens through exactly two doors:** `db:seed`, and
  `POST /platform/tenants` (SUPERADMIN) via `platform-tenants.service.ts:177`. Both go through the
  **same** `provisionTenant` helper, so nothing about company shape changes — see (k).
- **What actually breaks:** `apps/api/test/auth.e2e-spec.ts` births *every* account through
  `POST /api/auth/signup` (lines 91, 243, 342, 347, 359, 363, 372, 380, 389, 410 — see its own
  doc-comment at lines 15-18). That suite must be rewritten to seed tenants/users with `ownerDb()`
  (`apps/api/test/e2e-app.ts:214`), the way `invitations.e2e-spec.ts`, `tenant-isolation.e2e-spec.ts`
  and `table-store.e2e-spec.ts` already do. This is the single biggest cost of the removal.
- **OAuth's "unknown identity" branch loses its destination.** With signup code gone, an unknown
  social identity can only ever be refused (`no_account`); `/signup/complete`,
  `completeOAuthSignupSchema` and `POST /auth/oauth/complete-signup` should go with it — see (k).

### (a) EXCLUSIVE FILES — delete whole

- `apps/api/src/modules/auth/services/signup.service.ts`
- `apps/api/src/modules/auth/services/signup.service.spec.ts`
- `apps/web/src/app/(auth)/signup/page.tsx`
- `apps/web/src/app/(auth)/signup/signup.test.tsx`

Conditionally exclusive (these belong to the *OAuth* completion of a public signup — delete if
either public-signup **or** oauth is removed):

- `apps/web/src/app/(auth)/signup/complete/page.tsx` (234 lines)
- `apps/web/src/lib/auth-config.ts` — **NOT exclusive**: it also owns
  `parseOAuthProviders`/`enabledOAuthProviders`/`oauthEnabled`/`oauthStartUrl` (lines 57-88). Only
  `signupEnabled` (26-44) comes out.
- `apps/web/src/lib/auth-config.test.ts` — only `describe('signupEnabled')` (19-48) comes out.

**Verified NOT exclusive — keep:** `apps/api/src/modules/tenants/support/tenant-provisioning.ts`
(+ `.spec.ts`), `apps/web/src/components/platform/signups-chart.tsx` (+ test) — that chart plots
*tenants created per day* from `platformStatsDtoSchema.signups`
(`packages/shared/src/tenant.ts:291-292`, `platform-stats.service.ts:64`), which counts
operator-created tenants too.

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.module.ts` | — | **no change** (signup has no guard/module of its own) |
| `apps/api/src/main.ts` | — | **no change** |
| `apps/api/src/modules/auth/auth.module.ts` | 5, 38 | `SignupService` import + provider |
| `apps/api/src/modules/auth/auth.module.ts` | 16 | doc-comment "Auth: register, login, …" |
| `apps/api/src/modules/auth/auth.controller.ts` | 5 | `SignupResponse` type import |
| `apps/api/src/modules/auth/auth.controller.ts` | 17 | `import { SignupService } from './services/signup.service';` |
| `apps/api/src/modules/auth/auth.controller.ts` | 36 | `private readonly signupService: SignupService,` ctor param |
| `apps/api/src/modules/auth/auth.controller.ts` | 26 | `SignupDto` from the DTO import list |
| `apps/api/src/modules/auth/auth.controller.ts` | 46-61 | **delete** the whole `POST auth/signup` handler (doc-comment 46-52, decorators 53-58, body 59-61) |
| `apps/api/src/modules/auth/dto/auth.dto.ts` | 9, 23 | `signupSchema` import + `SignupDto` |
| `apps/api/src/modules/auth/services/auth.service.ts` | 125 | `/** Public so SignupService reuses the same verification path. */` on `sendVerificationCode` — keep the method (`users.service.ts` and the invitation accept path need verification mail), fix the comment |
| `apps/api/src/modules/auth/services/auth.service.ts` | 603 | `/** Public so SignupService writes through the same audit path. */` on `audit` — same |
| `apps/api/src/modules/auth/services/auth.service.spec.ts` | 1 hit | a `signup` mention in a comment |
| `apps/api/src/modules/platform/services/platform-stats.service.ts` | 6 | comment "How far back the signup series goes" — prose; the `signups` series stays |
| `apps/api/src/infra/tenancy/tenant-scope.interceptor.ts` | 33 | comment "Authentication and company signup have to run outside the isolation" |
| `apps/api/src/infra/tenancy/system-scope.decorator.spec.ts` | 49-54 | the allow-list comment names `signup` first, and `'modules/auth/auth.controller.ts:8'` must become `:7` |
| `apps/api/test/auth.e2e-spec.ts` | 15-18, 85-100, 150-203, 339-398, 400-416 | the file's whole account-creation strategy: `signupBody()` + `signupVerifyLogin()` helpers, the `completes the full signup -> verify -> login …` test, and the four signup-conflict/validation tests (`339`, `357`, `370`, `378`, `384`) plus the CSRF test at 407 which posts to `/api/auth/signup`. Rewrite to seed via `ownerDb()`. |
| `apps/api/test/prisma-mock.ts` | — | no change |
| `apps/api/test/factories.ts` | — | no change |
| `apps/api/jest.config.js` | 47-53 | thresholds don't name the file; `signup.service.spec.ts` is 26 signup-hits of coverage — re-measure |
| `apps/web/vitest.config.mts` | 23-36 | `src/app/(auth)/signup/**` is **not** in the coverage include list, so `signup.test.tsx` leaving costs nothing there; `src/lib/**/*.ts` covers `auth-config.ts` |
| `apps/web/src/hooks/use-auth.tsx` | 10-11 | `SignupInput`, `SignupResponse` type imports |
| `apps/web/src/hooks/use-auth.tsx` | 34-43 | the whole `useSignup()` hook + its doc-comment |
| `apps/web/src/app/(auth)/login/page.tsx` | 24 | `import { signupEnabled } from '@/lib/auth-config';` |
| `apps/web/src/app/(auth)/login/page.tsx` | 301-313 | the `{signupEnabled && ( … <Link href="/signup"> … )}` block + its comment (299-300) |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 58 | `signup: 'Create one',` fixture key |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 110 | `expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/signup')` inside an otherwise-keeper test |
| `apps/web/src/app/(auth)/login/login.test.tsx` | 258-282 | `describe('LoginPage — registration gating')` |
| `apps/web/src/app/(auth)/verify-email/page.tsx` | 98 | `<Link href="/signup">{t('goToLogin')}</Link>` in the "no email" fallback → point at `/login` |
| `apps/web/src/lib/auth-config.ts` | 10-12 | doc-comment bullet about `NEXT_PUBLIC_SIGNUP_ENABLED` |
| `apps/web/src/lib/auth-config.ts` | 26-44 | `readFlag()` + `signupEnabled` — `readFlag` has no other caller in the file, so both go |
| `apps/web/src/lib/auth-config.test.ts` | 19-48 | `describe('signupEnabled')` — 5 cases |
| `apps/web/src/proxy.ts` | 11 | `'/signup',` in `PRE_AUTH_PREFIXES` |
| `apps/web/src/proxy.ts` | 15-19 | the `/invite` comment explains itself by reference to `/signup` — reword |
| `apps/web/src/proxy.test.ts` | 28 | `for (const path of ['/login', '/signup', …])` |
| `apps/web/src/proxy.test.ts` | 45-47 | `it('keeps the social signup completion screen pre-auth')` → goes with `/signup/complete` |
| `apps/web/e2e/smoke.spec.ts` | 9-14 | `test('signup page renders the company registration form')` |
| `apps/web/src/app/invite/[token]/page.tsx` | 61, 253, 257 | **⚠ reads the `auth.signup` i18n namespace** — `ts('acceptTerms')` and `ts('acceptTermsRequired')`. See (e). |

### (c) PRISMA

**No model, enum, field or relation is signup-specific.** `PUBLIC_SIGNUP_ENABLED` is env-only.

Two *comments* reference signup and should be reworded, not removed:

- `apps/api/prisma/schema/tenancy.prisma:27` — `/// The plan a public signup lands on. Exactly one plan should carry it.` on `Plan.isDefault`. **`isDefault` is NOT orphaned** — `provisionTenant` falls back to the `isDefault` plan for operator-created tenants too (`platform-tenants.service.ts:165` comment). Keep the column, reword the doc.
- `apps/api/prisma/schema/tenancy.prisma:196` — `/// An access profile inside a tenant. Created by the signup flow;` on `Profile`. Reword to "Created when a company is provisioned".
- `apps/api/prisma/schema/invitations.prisma:4` — the header comment "Public signup creates a company plus its first administrator." Reword.

INVERTED INVARIANT check: `User.passwordHash` nullable is an **oauth** artefact, not a signup one
(`tenancy.prisma:158-163`, migration `20260912120000…:16-24`). Public-signup always sets a hash
(`signup.service.ts:73,93`).

### (d) packages/shared

`packages/shared/src/tenant.ts`

- **75-90** `signupSchema` + `SignupInput`
- **111-116** `signupResponseSchema` + `SignupResponse`
- **2** `import { captchaTokenSchema } from './auth';` — **only if captcha is also removed**; line 88 is signupSchema's own `captchaToken`
- **221** doc-comment on `platformCreateTenantSchema`: "Two things separate it from `signupSchema`" — reword
- **291** `/** Signups per day over the requested window, oldest first. */` on `platformStatsDtoSchema.signups` — keep the field, it counts all tenants
- `RESERVED_TENANT_SLUGS` (33-60) **stays** — also used by `oauth.service.ts:51` and `platform-tenants.service.ts:25`

`packages/shared/src/oauth.ts` (only if oauth stays and public-signup goes — see (k))

- **43-44** the `no_account` / `signup_disabled` error-code docs
- **54** `'signup_disabled',` in `oauthErrorCodes`
- **65** `signupEnabled: z.boolean(),` in `oauthProvidersResponseSchema`
- **85-104** `completeOAuthSignupSchema` / `Input` / `completeOAuthSignupResponseSchema` / `Response`

`packages/shared/src/invitation.ts`

- **9** comment "Public signup creates a company and its first administrator; everyone else…"
- **94** comment "`acceptTerms` is `literal(true)` for the same reason it is on signup"

No cookie-name constant. No `permissionModules` entry.

### (e) WEB

Routes gone: `/signup` (`apps/web/src/app/(auth)/signup/page.tsx`), and — with oauth — `/signup/complete`.
`apps/web/src/app/(auth)/layout.tsx` is shared by login/forgot/reset/verify-email and stays.
Nav/menu: only the login page's "create account" link (`login/page.tsx:301-313`).
Proxy allow-list: `apps/web/src/proxy.ts:11` `'/signup'` (which also matched `/signup/complete` by
prefix — see `proxy.test.ts:45-47`).

i18n — prune identically in both files:

| namespace / key path | pt-BR lines | en-US lines |
| --- | --- | --- |
| `auth.login.noAccount` | 34 | 34 |
| `auth.login.signup` | 35 | 35 |
| `auth.signup.*` — **all except two keys** (see warning) | 43-63 | 43-63 |

**⚠ WARNING — do NOT delete the whole `auth.signup` namespace.**
`apps/web/src/app/invite/[token]/page.tsx:61` does `useTranslations('auth.signup')` and renders
`ts('acceptTerms')` (line 253) and `ts('acceptTermsRequired')` (line 257). Those two keys
(pt-BR/en-US **lines 54 and 55**) must survive for as long as invitations exist — either kept in
place under `auth.signup`, or moved into the `invite` namespace with the page updated. Everything
else in the block goes: `title`, `subtitle`, `companyLegend`, `adminLegend`, `companyName`,
`companyNamePlaceholder`, `slug`, `slugHint`, `slugTaken`, `emailTaken`, `submit`, `hasAccount`,
`signin`, `success`, `closedTitle`, `closedBody`, `closedInvite` (the last three exist *only* for
the runtime-OFF card at `signup/page.tsx:102-106`, so they always go).

Also note `auth.verify.goToLogin` (pt-BR/en-US line ~81) is rendered on a `<Link href="/signup">`
at `verify-email/page.tsx:98` — keep the key, fix the href.

### (f) ENV

`.env.example`

- **152-164** — the `# Who may get in -- public signup and invitations` block down to
  `PUBLIC_SIGNUP_ENABLED=true` (164). Keep the section header if invitations stay, but retitle it
  (the invitation half is 166-175).
- **275-282** — the "public halves" preamble (275-279) explicitly uses the signup form as its
  example ("a signup form that always 403s"), and **281-282** is the comment + `NEXT_PUBLIC_SIGNUP_ENABLED=true`. Delete 281-282; reword 275-279 (it also covers `NEXT_PUBLIC_OAUTH_PROVIDERS` at 283-284).

`apps/api/src/config/env.ts`

- **113-123** — the `// --- who may get in ---` comment (113-122) and
  `PUBLIC_SIGNUP_ENABLED: boolish(true),` (123). Keep the section header if the
  `INVITATION_*` vars (124-130) stay.

`validateEnv()` — **nothing conditional to remove.** There is no `PUBLIC_SIGNUP_ENABLED` branch in
`env.ts:234-285`; the flag is enforced at the service (`signup.service.ts:46-48`) and in
`oauth.service.ts:594-596`. This is deliberate per `signup.service.ts:38-45` ("It is checked here
rather than in a guard because the API is the boundary that actually decides").

`apps/api/src/config/env.spec.ts`

- **114-124** — `describe('public signup')`: `it('defaults to on, preserving the behaviour a clone has always had')` (115-117) and `it("honours an explicit 'false'")` (119-123)

### (g) SEED

`apps/api/prisma/seed.ts` — **no functional change**; two comments only:

- **line 21** `// A starter plan. \`isDefault\` is what a public signup lands on.` → reword
  (`isDefault` is still read by `provisionTenant`)
- **line 66** `// System profiles and their permission rows, from the shared matrix — the same code path the signup flow uses, so seed and signup cannot drift.` → reword to reference `provisionTenant` / the platform panel

With public signup removed the seed becomes **the** bootstrap door, so the generator should keep
`db:seed` in the TL;DR (CLAUDE.md:19) and probably promote it in the README.

### (h) CLAUDE.md + README.md

CLAUDE.md:

- lines 75-77 — **Autenticação (resumo)** (69-80): the whole "Quem entra e por onde" bullet names
  "**signup público** (opcional, `PUBLIC_SIGNUP_ENABLED`)". Rewrite to "convite + login social".
- line 94 — **Multi-tenancy** scope table: `| system | caminho de autenticação e signup | ignora o isolamento |`
- lines 119-122 — the `@SystemScope()` bullet: "registrar empresa nova acontece quando ainda não há tenant"
- line 199 — **Convites** (191-284) opens with "`POST /auth/signup` cria **empresa + primeiro admin**, e só isso."
- **lines 204-210** — the entire "**Registro público virou opcional.**" paragraph
- line 278 — "(via `provisionTenant`, o mesmo que o signup e o seed usam — foi extraído justamente para as três portas não divergirem)" → becomes two portas
- lines 306-313 — **Login social** (287-372): the "terceiro caso" paragraph depends on
  `PUBLIC_SIGNUP_ENABLED=true` and on the `/signup/complete` screen
- line 384 — **Captcha** (376-409) route list includes signup (only relevant if captcha stays)
- line 424 — **Rate limit** (412-458) `@SensitiveThrottle()` route list includes signup
- line 519 — **Testes** (517-541): "fluxos signup→verify→login→refresh→logout"
- **O que NÃO fazer (558-587) — individual bullets belonging to public-signup:**
  - **lines 568-570** — "Não ligar OAuth só de um lado… **Mesma regra para `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` — em desacordo, o formulário aparece e todo submit dá 403.**" → keep the OAuth half, delete the signup sentence
  - **line 582** — "Não usar `@SystemScope()` fora das rotas de autenticação" — keep (invitation accept still uses it), but the route count changes

README.md:

- line 72 (pt) / line 367 (en) — the "**Empresas**" bullet in "O que já vem pronto" / "What comes built in"
- line 140 (pt) / line 435 (en) — the RLS scope table row for `system`
- lines 187-193 (pt) / 484-490 (en) — the "Quem entra, e por onde" / "Who gets in" table: delete the `Signup público` / `Public signup` row (191 / 488) and rewrite the "Três portas, e duas delas são decisão de deploy" lead (187 / 484) plus the `Login social` row's "só via convite ou signup" (193 / 490)
- lines 207-212 (pt) / 506-511 (en) — the `[!WARNING]`: delete the `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` sentence (208-209 / 507-508), keep the OAuth half
- lines 214-215 (pt) / 513-514 (en) — the captcha route list names signup
- line 294 (pt) / line 593 (en) — **Testes** / **Testing**: "cobrindo signup → verify → login → refresh → logout"

### (i) NPM DEPS

**None.** `signup.service.ts` imports only `@nestjs/common`, `@nestjs/config`, `argon2`,
`@prisma/client` and `@dontpanic/shared` — all of which stay (argon2 is used by
`auth.service.ts:10`, `users.service.ts:11`, `admin-users.service.ts`, `crypto.util.ts`,
`invitations.service.ts`). The web page uses `react-hook-form` / `@hookform/resolvers` /
`sonner` / `lucide-react`, all shared with login, forgot-password, reset-password, invite.
Checked all four `package.json` files.

### (j) MIGRATION SQL for the baseline

**Nothing.** Public signup contributes no DDL. `PUBLIC_SIGNUP_ENABLED` is an env var.

Two things a careless prune could wrongly touch, and must **not** be:

- `apps/api/prisma/migrations/20260911105130_tenancy/migration.sql` — the `plans` table's
  `"isDefault" BOOLEAN NOT NULL DEFAULT false` column. Still read by `provisionTenant` for
  operator-created tenants. The `/// The plan a public signup lands on` doc in the schema is
  *only* a comment.
- `apps/api/prisma/migrations/20260912120000_invitations_and_oauth/migration.sql:24` —
  `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL;` — this is **oauth's**, not
  signup's.

All hand-written SQL (`app.current_tenant_id`, `app.is_platform_admin`, `app.is_system`,
`app.tenant_visible`, `app.apply_tenant_rls`, `app.apply_user_owned_rls`, the `permissions` DO
block, the `dontpanic_app` role + grants + default privileges, and the partial unique index
`invitations_tenant_email_pending_key` with its `WHERE "status" = 'PENDING'`) is signup-independent
and must be preserved verbatim.

### (k) DEPENDENCIES on other features

**Is public-signup removal safe w.r.t. tenant provisioning? — YES, confirmed.**
`apps/api/src/modules/tenants/support/tenant-provisioning.ts:4-19` states the contract:

> *"Extracted because three unrelated doors now lead here — public signup, the operator creating a
> company from the platform panel, and an unknown social identity finishing its registration — and a
> company created by one of them has to be indistinguishable from a company created by the others."*

Callers (full list from grep):

| caller | file:line |
| --- | --- |
| public signup | `apps/api/src/modules/auth/services/signup.service.ts:13,79` |
| oauth complete-signup | `apps/api/src/modules/auth/oauth/oauth.service.ts:35,456` |
| platform panel | `apps/api/src/modules/platform/services/platform-tenants.service.ts:21,177` |

Plus the seed, which reproduces the same profile set from the same shared constants
(`apps/api/prisma/seed.ts:4,66-80` → `SYSTEM_PROFILES` + `permissionsForProfile`, exactly what
`tenant-provisioning.ts:2,52-55` uses). So removing the signup caller leaves the helper, its
spec (`tenant-provisioning.spec.ts`, 11 call-sites) and the other two doors fully functional.

**OAuth ↔ public-signup.** `oauth.service.ts` reads the flag in three places:

- `594-596` — `private signupEnabled() { return this.config.get('PUBLIC_SIGNUP_ENABLED', …); }`
- `119` — `listProviders()` returns `signupEnabled: this.signupEnabled()` in the discovery payload
  (contract: `packages/shared/src/oauth.ts:65`)
- `404-407` — `parkPendingRegistration`: `if (!this.signupEnabled()) return this.errorRedirect(intent === 'signup' ? 'signup_disabled' : 'no_account');`
- `430-432` — `completeSignup`: `if (!this.signupEnabled()) throw new ForbiddenException('Public registration is closed.');`

If public-signup is **removed as code** while oauth stays, the whole "unknown identity" leg has no
destination: `parkPendingRegistration` (398-421), `completeSignup` (425-…), `burnTicket`,
`/signup/complete` page, `completeOAuthSignupSchema`, the `signup_disabled` error code and
`oauthProvidersResponseSchema.signupEnabled` should all go, leaving the callback with
`{ kind: 'session' } | { kind: 'two-factor' } | { kind: 'error', code: 'no_account' }`. The
`@SystemScope()` on `oauth.controller.ts:146` (`complete-signup`) then disappears too, changing
`system-scope.decorator.spec.ts:61` from `'modules/auth/oauth/oauth.controller.ts:1'` to removing
that entry entirely.

**Invitations ↔ public-signup.** One-directional and cosmetic: `invitation.ts:9,94` comments, and
the shared i18n keys `auth.signup.acceptTerms` / `.acceptTermsRequired` consumed by
`apps/web/src/app/invite/[token]/page.tsx:61,253,257`. No code dependency —
`InvitationsService` does not import `SignupService`.

**Captcha ↔ public-signup.** `auth.controller.ts:57` `@RequireCaptcha('signup')` and
`packages/shared/src/tenant.ts:88` `captchaToken` in `signupSchema` disappear with the signup route;
the other four captcha sites are unaffected. `signup.service.ts:44` names the captcha as the
precedent for the two-halves trap.

**2fa ↔ public-signup.** None. Signup never mints a 2FA ticket; it calls
`auth.sendVerificationCode` (`signup.service.ts:117`) and `auth.audit` (118).

**Plans ↔ public-signup.** `provisionTenant` resolves the `isDefault` plan; the seat check
(`PlanLimitsService.assertCanAddUser`) is *not* on the signup path (signup creates the first user
of a brand-new company) — it runs on invitation accept and platform user creation. No change.

---

## F13 · easter-eggs and the brand voice

**Verdict: the enumerated easter eggs = CLEAN REMOVAL. The document/brand voice = DO NOT REMOVE IN
V1 (needs a "sober docs" variant instead of a prune).**

Two distinct things live under "humour" and the generator must treat them separately:

- **A. Easter eggs proper** — `marvin.ts`, `GET /teapot`, the Konami handler, the secret
  `console.log`, the Marvin lines on 404/500, the `easter` namespace. Bounded, 6 files + 8 seams.
- **B. Brand voice** — the product is *named* DontPanic, its logo is a towel (`brand.tsx:12,48,77`),
  its CSS utility is `bg-guide` (`globals.css:179-185`), its badge is "42" (`brand.tsx:13`), its
  footers say "the answer is 42" (3 places incl. two email templates), 20+ API success messages end
  in "Don't Panic.", and every test fixture is named Arthur Dent / Ford Prefect / Zaphod /
  Slartibartfast / Sirius Cybernetics. **This cannot be "removed"; it can only be renamed**, and
  renaming is the generator's job anyway (`create-dontpanic` already renames the project). Treat B
  as a rename+rewrite pass, never as a delete list.

### (a) EXCLUSIVE FILES

| File | Notes |
| --- | --- |
| `apps/api/src/common/marvin.ts` | 22 lines; `QUIPS` map for 400/401/403/404/418/429/500 + `FALLBACK = 'Don’t Panic.'` |
| `apps/api/src/common/marvin.spec.ts` | 29 lines, 4 tests |
| `apps/web/src/components/easter-eggs.tsx` | 44 lines; Konami array (7-18) + the secret `console.log` (25-29) + the Konami toast (36) |

No test or story exists for `easter-eggs.tsx` (grep: its only importer is
`apps/web/src/app/(dashboard)/page.tsx:6,25`). `GET /teapot` has **no** test — no
`app.controller.spec.ts` exists and `grep teapot apps/api/test/` is empty; the only 418 coverage is
`all-exceptions.filter.spec.ts:61-65`.

### (b) SHARED SEAMS

| file | line(s) | what comes out |
| --- | --- | --- |
| `apps/api/src/app.controller.ts` | 15-25 | the whole `@Get('teapot')` handler incl. its `@Public()`, `@HttpCode(418)` and the `marvin:` field |
| `apps/api/src/app.service.ts` | 8 (`hint: "Don't Panic."`), 9 (`answer: 42`), 10 (`marvin: "Life? Don't talk to me about life."`) | the joke fields of `GET /` — leaving `{ message: 'Hello, World!' }` |
| `apps/api/src/app.service.spec.ts` | 8-10 | the mirror assertions (`toEqual` is exact, so the spec breaks if you edit the service without it) |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | 12 (`import { marvinQuip }`), 30 (doc comment "Adds Marvin's deadpan flavour…"), 72 (`marvin: marvinQuip(status)`) | **the global error envelope.** This is the one seam that reaches production error bodies |
| `apps/api/src/common/filters/all-exceptions.filter.spec.ts` | 10 (import), 36 (test name "…and Marvin quip"), 45 (`marvin: marvinQuip(404)`), 65 (`expect(body.marvin).toBe(marvinQuip(418))`), 102-105 (comment + `expect(body.marvin).toBe(marvinQuip(401))`) | 5 assertion sites |
| `packages/shared/src/common.ts` | 29-30 | `/** Marvin's deadpan, non-sensitive commentary. */ marvin?: string;` on `ApiErrorBody` — see §(d) |
| `apps/web/src/app/(dashboard)/page.tsx` | 6 (import), 25 (`<EasterEggs />`) | the only mount point |
| `apps/web/src/app/not-found.tsx` | 29 (`<p className="font-mono text-xs …">{t('marvin')}</p>`) | the Marvin line on 404. Lines 20-22 (the giant `404`) and 25-27 (title/body) are ordinary 404 chrome and stay |
| `apps/web/src/app/error.tsx` | 29-31 (the `Don&apos;t Panic.` eyebrow), 40 (`{t('marvin')}`) | the two joke elements of the 500 page |
| `apps/web/src/app/global-error.tsx` | 27-29 (`Don&apos;t Panic.` eyebrow), 34 ("We hit an unexpected error. The towel is on its way.") | this file is deliberately provider-free (see its comment at 6-10) so its strings are literals, not i18n keys |
| `apps/web/messages/pt-BR.json` | 316 (`errors.notFound.marvin`), 322 (`errors.serverError.marvin`), 326-331 (whole `easter` namespace) | |
| `apps/web/messages/en-US.json` | 316, 322, 326-331 (identical line numbers — the two files are line-for-line aligned, both 575 lines) | must be pruned identically, see parity test below |

### (c) PRISMA fields

**None.** No humour data is persisted. Grep for `marvin`/`teapot`/`panic` across
`apps/api/prisma/schema/*.prisma` yields only the file-header joke at
`apps/api/prisma/schema/main.prisma:1` ("`// DontPanic — data model. Don't Panic, it's just tables.`").

### (d) packages/shared changes

`packages/shared/src/common.ts:24-37` — `ApiErrorBody`. Remove lines **29-30**
(the doc comment and `marvin?: string;`).

It is **optional** (`marvin?`), so no consumer breaks at the type level. Grep confirms the only
producer is `all-exceptions.filter.ts:72` and no web code reads `body.marvin` (the web's `ApiError`
in `apps/web/src/lib/api.ts` does not surface it). So this is a genuinely clean 2-line removal.

`packages/shared/src/locale/br.ts` and its spec are **independent of humour** (no joke strings).

### (e) WEB routes / nav / i18n keys

- **Routes:** none exclusively humour. `GET /api/teapot` is API-side only (reachable through the BFF
  at `/api/teapot`, no route file of its own — the catch-all at
  `apps/web/src/app/api/[...path]/route.ts` forwards it).
- **Nav:** none. The Konami handler is a global `keydown` listener mounted by the dashboard page
  (`easter-eggs.tsx:39`), not a nav entry.
- **i18n keys:** whole `easter` namespace (`pt-BR.json:326-331` / `en-US.json:326-331`: `consoleTitle`,
  `consoleSubtitle`, `konamiTitle`, `konamiDescription`) + `errors.notFound.marvin` (316) +
  `errors.serverError.marvin` (322). Sober replacements needed for the *body* lines that are also
  jokes but are load-bearing copy: `errors.notFound.body` ("Esta página se perdeu no hiperespaço." /
  "This page got lost in hyperspace.", line 314), `errors.serverError.body` (320),
  `errors.generic` (324), `common.dontPanic` (5), `common.tagline` (4),
  `auth.signup.subtitle` (45), `auth.completeSignup.subtitle` (118, pt only phrasing),
  `dashboard.answer` (133), `dashboard.helloWorld` (131),
  `auth.signup.companyNamePlaceholder` (49, "Sirius Cybernetics").

### (f) ENV vars

**None.** No env var gates the humour; `CAPTCHA_*`-style opt-in does not exist here. `.env.example`
contains no humour toggle (and `apps/api/src/config/env.ts` has none either).

The three "Don't Panic" strings in `apps/api/src/config/env.ts:240,244,280` are *error messages of
the env validator* ("Invalid environment variables. Don't Panic, just fix these:\n…") — category B
(brand voice), not an env var.

### (g) SEED changes

`apps/api/prisma/seed.ts`:
- line 14 — `const PASSWORD = 'DontPanic42!'` (brand/joke password; the generator regenerates
  secrets anyway)
- line 91 — `name: 'Zaphod Beeblebrox'` (the seeded superadmin's display name)
- line 102 — `console.log(\`🌱 Seeded company admin → ${ADMIN_EMAIL} / ${PASSWORD}   (Don't Panic.)\`)`
  — drop the trailing `(Don't Panic.)`
- lines 15-16, 54, 57 — `superadmin@dontpanic.dev`, `admin@dontpanic.dev`, `slug: 'dontpanic'`
  (brand rename, not humour removal)

### (h) CLAUDE.md + README.md prune

**CLAUDE.md — sections to delete outright:**
- **`## Humor (com parcimônia)` — lines 549-555** (heading 549, body 551-554, the `---` at 556 goes
  with it). This is the whole humour section.
- **line 560** — the first bullet of `## O que NÃO fazer` (558-587): "Não logar segredos, tokens ou
  senhas. **Não colocar humor em mensagens que exponham internals.**" — cut the second sentence,
  keep the first (it is a real security rule).

**CLAUDE.md — the whole document's voice is jokey, and that is a problem the generator cannot solve
by deleting lines.** Concretely, the generator should ship **two variants of CLAUDE.md and
README.md** (`CLAUDE.md` / `CLAUDE.sober.md`, or better: templatise the prose) and pick by the
"humour" flag, because the joke is woven into the *explanations*, not appended to them. The specific
joke lines/blocks, by line number:

| CLAUDE.md line(s) | joke |
| --- | --- |
| 1 | title "DontPanic — guia do sistema" (brand) |
| 3 | `> _"Don't Panic."_ — a capa do Guia, e a filosofia deste boilerplate.` — the epigraph |
| 20 | `pnpm dev … (Don't Panic.)` inside the TL;DR code block |
| 24 | `Admin do seed: **admin@dontpanic.dev** / **DontPanic42!**` |
| 49-51 | Hitchhiker-free, but "Trocar de provider = trocar uma variável" voice |
| 96-97 | "esquecer o escopo dá resultado vazio, nunca dados da empresa errada" — dry-wit register |
| 130-131 | "travá-lo com a própria tabela permitiria **trancar-se fora de casa**" |
| 152-154 | "o job termina 'com sucesso' tendo visto um banco vazio" |
| 196-197 | "e ninguém consegue fechar esse chamado" |
| 214-218 | "incluindo o dígito trocado" |
| 310-311 | "Derivar do e-mail produziria empresas chamadas `joao-silva-gmail-com`" |
| 320 | "então rota de callback que só aceita GET quebra só na Apple" |
| 366-368 | "dizer qual dos três aconteceu só ajuda a calibrar" |
| 377-381 | the "pergunte ao Marcio" address-the-agent voice (also 83-86, 151-154, 193-197, 289-293, 414-417, 500-503) |
| 445-448 | "um `fetch(… x-forwarded-for: ipAleatório)` ganha um balde novo a cada request" |
| **549-555** | the `## Humor` section itself |
| 560 | "Não colocar humor em mensagens que exponham internals." |
| 587 | "**Não fazer `git commit` nem `git push` por conta própria**" (project rule, keep) |

There is **no ASCII art in CLAUDE.md**. The register to strip in a sober variant is: the epigraph
(3), the `(Don't Panic.)` in the TL;DR (20), the whole Humor section (549-556), and the second
sentence of 560. The "pergunte ao Marcio" blocks and the conversational explanations are *valuable
agent guidance*, not humour — a sober variant should keep their content and only flatten the tone.

**README.md — joke lines and ASCII blocks:**

| README.md line(s) | joke |
| --- | --- |
| **1-8** | the **ASCII art block** — the `DONT PANIC!` figlet banner (7 lines of box-drawing glyphs inside a ```text fence). Delete lines 1-8 plus the blank line 9 for a sober README. |
| 19 | `[![Don't Panic](https://img.shields.io/badge/Don't%20Panic-42-brightgreen.svg)](#licença)` — the "42" shield badge |
| 95 | `pnpm dev … (Don't Panic.)` (PT quick-start block) |
| **323-325** | PT humour paragraph: "Tem um Konami code escondido no dashboard, uma mensagem no console do navegador e um `GET /api/teapot` que devolve 418. Regra de ouro: humor nunca vaza dado sensível e nunca aparece num erro de segurança real." |
| **327** | `> _"Não entre em pânico."_ — a capa do Guia` (PT closing epigraph) |
| 390 | `pnpm dev … (Don't Panic.)` (EN quick-start block) |
| **621-623** | EN humour paragraph: "There is a Konami code hidden in the dashboard, a message in the browser console, and a `GET /api/teapot` that answers 418. The golden rule: humour never leaks sensitive data and never shows up in a real security error." |
| **625** | `> _"Don't Panic."_ — the cover of the Guide` (EN closing epigraph, last line of file) |

Minimal humour-off README prune: delete **1-9**, **19**, **323-327**, **621-625**, and the
`(Don't Panic.)` trailing comments on **95** and **390**.

### (i) NPM DEPS that become unused

**None.** `easter-eggs.tsx` uses only `react`, `next-intl` and `sonner` (`toast`) — all three are
used by dozens of other files (`sonner` grep: `admin/page.tsx:7`, `platform/tenants/page.tsx`,
`providers.tsx:7`, every profile card, …). `marvin.ts` imports nothing.

### (j) MIGRATION SQL

**Explicitly checked and explicitly none.** `grep -in 'marvin\|teapot' apps/api/prisma/migrations/*/migration.sql`
returns zero rows across all 6 migrations (`20260613074545_init`,
`20260613122947_two_factor_remind_at`, `20260911105130_tenancy`,
`20260911105200_row_level_security`, `20260911105300_app_role`,
`20260912120000_invitations_and_oauth`). No humour is persisted, so no SQL change.

### (k) DEPENDENCIES on other features (code evidence)

1. **easter-eggs → i18n.** `apps/web/src/components/easter-eggs.tsx:4,22` (`useTranslations('easter')`)
   and `not-found.tsx:2,7,29` / `error.tsx:4,15,40`. If i18n is removed the Marvin/Konami strings
   must become literals; if humour is removed the `easter` namespace disappears from **both**
   messages files. **These two features must be pruned in a consistent order** — see the parity
   test note in the web-shell section.
2. **easter-eggs → dashboard.** `(dashboard)/page.tsx:6,25` is the only mount. Removing the
   dashboard feature would silently remove the Konami code and the secret console banner too.
3. **Marvin → the global error envelope → every API feature.**
   `all-exceptions.filter.ts:12,72` + `packages/shared/src/common.ts:30`. Every error response in
   the system carries `marvin`. This is the coupling to be careful about: the filter is registered
   globally and its spec (`all-exceptions.filter.spec.ts:45,65,105`) asserts the field on three
   different statuses, so a humour-off build that forgets the spec fails `pnpm test` in a place that
   looks unrelated to humour.
4. **Marvin → `GET /teapot` → auth's `@Public()` decorator.** `app.controller.ts:16` uses
   `@Public()` from `./common/decorators/public.decorator`. Removing the teapot does not remove the
   decorator (`hello()` at :9 also uses it), but a generator that removes `AppController` entirely
   would.
5. **Humour → the auth/invitation email templates.**
   `apps/api/src/modules/auth/support/email-templates.ts:18` ("Bem-vindo a bordo. Não entre em
   pânico."), `:27` ("Welcome aboard. Don't Panic."), `:88` (`DontPanic · the answer is 42` footer);
   `apps/api/src/modules/invitations/support/invitation-email.ts:28,42,136` (same three).
   `apps/api/src/modules/auth/services/auth.service.ts:561-562` (the reset-password email body
   literally opens "Don't Panic."). These are **shipped to customers**, so a humour-off build that
   only cleans the UI still emails jokes.
6. **Humour → API success messages** (category B, 8 sites):
   `auth.controller.ts:167`, `auth.service.ts:162,197,598`, `users.controller.ts:84,114,178`,
   `users.service.ts:379`, `main.ts:107,119`, `env.ts:240,244,280`.
7. **Humour → the design system.** `globals.css:179-185` (`@utility bg-guide`, "Decorative
   starfield/aurora"), used by `auth-shell.tsx:15`, `not-found.tsx:10`, `error.tsx:23`,
   `global-error.tsx:25`, `setup-2fa/page.tsx:26`; `globals.css:187-199` (`@utility caret-blink`,
   "Terminal cursor used after 'Hello World'") used by `(dashboard)/page.tsx:37`;
   `brand.tsx:12-14,48,77` (the towel mark + the "42" badge);
   `user-menu.tsx:25` (`return letters.toUpperCase() || '42';` — **the avatar initials fall back to
   "42"**);
   footers `(dashboard)/layout.tsx:26` and `auth-shell.tsx:37` (`DontPanic · the answer is 42`).
   **None of this is removable without a visual redesign** — hence category B.
8. **Humour → every test fixture.** `Arthur Dent` (`apps/api/test/factories.ts:10`,
   `auth.e2e-spec.ts:75`, `apple.adapter.spec.ts:109,159`, `github.adapter.spec.ts:89,96`,
   `oauth.service.spec.ts:29,39,471,502,510`, `create-tenant-dialog.test.tsx:85,116`,
   `platform-api.test.tsx:273`, `signup/page.tsx:173` + `signup/complete/page.tsx:191` placeholders,
   `avatar.stories.tsx:26`), `Ford Prefect`, `Zaphod`, `Slartibartfast`, `Marvin`,
   `Sirius Cybernetics`, plus the Storybook copy (`button.stories.tsx:17,64`,
   `alert.stories.tsx:23`, `input.stories.tsx:39,48` "Vogon poetry not allowed",
   `sonner.stories.tsx:20-21`, `dialog.stories.tsx:31`, `confirm-dialog.stories.tsx:41`,
   `card.stories.tsx:27` "infinite improbability core"). **Do not attempt to rename these in v1** —
   they are inert test data and renaming them buys nothing while risking dozens of assertion
   mismatches (e.g. `invitation-email.spec.ts:21,35` assert exact subject strings containing
   "Sirius Cybernetics").

---

## A1 · Web shell inventory

### Navigation entries

**`apps/web/src/components/app-sidebar.tsx`** — the tenant (company) shell.

| line(s) | entry | owning feature |
| --- | --- | --- |
| 17 | `{ href: '/', key: 'dashboard', icon: LayoutDashboard, exact: true }` | **dashboard** |
| 18 | `{ href: '/profile', key: 'profile', icon: User, exact: false }` | **profile** |
| 29-31 | `...(user?.role === 'ADMIN' ? [{ href: '/admin', key: 'admin', icon: Shield, exact: false }] : [])` | **admin/users** (role-gated client-side; API enforces too) |
| 63-65 | `<Link href="/"><Brand /></Link>` (logo → dashboard) | shell/brand |
| 72 | `<LanguageSwitcher side="top" align="start" />` | **i18n** |
| 73 | `<ThemeToggle />` | **theming** |
| 75 | `<UserMenu />` | shell |
| 87-97 | desktop `<aside>` + mobile `<header>` with menu button | shell |
| 99-124 | mobile slide-in drawer | shell |
| 25 | `useTranslations('nav')` → keys `nav.dashboard`, `nav.profile`, `nav.admin` | i18n seam |
| 9,26 | `useUser()` from `@/hooks/use-auth` — the only reason the sidebar is a client component | auth |

**`apps/web/src/components/user-menu.tsx`** — used by *both* shells.

| line(s) | entry | owning feature |
| --- | --- | --- |
| 33-43 | skeleton while `useUser()` loads | auth |
| 53-58 | `<Avatar>` with `user.avatarUrl` + `AvatarFallback` initials | **profile (avatar)** |
| 25 | `return letters.toUpperCase() \|\| '42';` | **humour** (category B) |
| 60-63, 72-74 | `user.name` / `user.email` display | auth |
| 79-84 | `<DropdownMenuItem asChild><Link href="/profile">{t('profile')}</Link>` | **profile** |
| 88-95 | `onSelect={() => logout.mutate()}` + `{t('logout')}` | **auth (logout)** |
| 29 | `useTranslations('nav')` → `nav.profile`, `nav.logout` | i18n seam |

**`apps/web/src/app/platform/layout.tsx`** — the SUPERADMIN shell (deliberately *not* the company
shell, see its comment at 14-24).

| line(s) | entry | owning feature |
| --- | --- | --- |
| 26 | `{ href: '/platform', key: 'overview', icon: BarChart3, exact: true }` | **platform** |
| 27 | `{ href: '/platform/tenants', key: 'tenants', icon: Building2 }` | **platform** |
| 28 | `{ href: '/platform/plans', key: 'plans', icon: Tags }` | **platform/plans** |
| 42-47 | `<Link href="/platform"><Brand size="sm" /></Link>` | shell/brand |
| 48-50 | `{t('badge')}` pill ("Plataforma") | platform |
| 53 | `<LanguageSwitcher />` | **i18n** |
| 54 | `<ThemeToggle />` | **theming** |
| 55 | `<UserMenu />` | shell |
| 34,36 | `usePlatformAccess()` gate — `if (checking \|\| !allowed) return null;` | platform |
| 90-94 | footer `{t('footer')}` | platform |

**`apps/web/src/app/(dashboard)/layout.tsx`** (not nav, but shell composition):
12/31 `<TenantGate>` (**tenancy/plans**), 14 `<TwoFactorGate />` (**2FA**), 15 `<AppSidebar />`,
18 `<TrialBanner />` (**tenancy/trial**), 24-28 footer with the literal
`DontPanic · the answer is 42` (**humour**, line 26).

### Every route under `apps/web/src/app/**`

| route file | URL | owning feature |
| --- | --- | --- |
| `layout.tsx` | (root) | shell — fonts (2,8-14), metadata (16-20), **i18n provider (3-4,23-24,28,33-35)** |
| `globals.css` | — | theming/design tokens (+ `bg-guide` 179-185 & `caret-blink` 187-199 = humour-adjacent) |
| `not-found.tsx` | 404 | shell + **humour** (line 29) |
| `error.tsx` | 500 | shell + **humour** (29-31, 40) |
| `global-error.tsx` | root-layout crash | shell + **humour** (27-29, 34) |
| `api/[...path]/route.ts` | `/api/*` | **BFF proxy** (core) |
| `(auth)/layout.tsx` | — | auth |
| `(auth)/login/page.tsx` | `/login` | **auth (login)**; also 2FA step, `auth.oauth.errors` (line 47), captcha (46) |
| `(auth)/login/login.test.tsx` | — | auth tests |
| `(auth)/signup/page.tsx` | `/signup` | **public signup** |
| `(auth)/signup/signup.test.tsx` | — | public signup tests |
| `(auth)/signup/complete/page.tsx` | `/signup/complete` | **oauth / social signup** (`auth.completeSignup`) |
| `(auth)/verify-email/page.tsx` | `/verify-email` | **auth (email verification)** + captcha |
| `(auth)/forgot-password/page.tsx` | `/forgot-password` | **auth (password reset)** + captcha |
| `(auth)/reset-password/page.tsx` | `/reset-password` | **auth (password reset)** + captcha |
| `(dashboard)/layout.tsx` | — | shell + tenancy + 2FA |
| `(dashboard)/page.tsx` | `/` | **dashboard** (+ **easter-eggs** mount at 6,25; + i18n card at 11,15) |
| `(dashboard)/loading.tsx` | `/` suspense | dashboard (pure skeletons, **no joke strings** — CLAUDE.md 552's "mensagens de loading" refers to `common.loading`/`common.saving`, which are sober) |
| `(dashboard)/admin/page.tsx` | `/admin` | **admin/users** + **invitations** (16-17 imports) |
| `(dashboard)/profile/page.tsx` | `/profile` | **profile** (8-14: avatar/name/email/password/2FA/sessions/danger cards) |
| `invite/layout.tsx` | — | **invitations** |
| `invite/[token]/page.tsx` | `/invite/:token` | **invitations** (accept flow) |
| `invite/[token]/invite.test.tsx` | — | invitations tests |
| `platform/layout.tsx` | `/platform/*` | **platform** |
| `platform/page.tsx` | `/platform` | **platform (overview)** |
| `platform/tenants/page.tsx` | `/platform/tenants` | **platform (tenants)** |
| `platform/plans/page.tsx` | `/platform/plans` | **platform (plans)** |
| `privacidade/page.tsx` | `/privacidade` | **legal** |
| `termos/page.tsx` | `/termos` | **legal** |
| `setup-2fa/page.tsx` | `/setup-2fa` | **2FA (forced setup)** |

### `apps/web/src/proxy.ts` — per-path special-casing

(Next 16 renamed `middleware` → `proxy`; comment at line 3.)

| line(s) | special case |
| --- | --- |
| 9-21 | `PRE_AUTH_PREFIXES` = `['/login','/signup','/forgot-password','/reset-password','/verify-email','/invite']` |
| 15-20 | the comment explaining why **`/invite` is pre-auth and not open**: "Accepting an invitation IS a registration … Someone who already has a session and opens an invite link is sent home rather than shown a form that would build a second account under the first one's cookies." → **invitations feature owns line 20** |
| 29 | `OPEN_PREFIXES = ['/termos','/privacidade']` → **legal feature owns this line** |
| 23-28 | the comment on why legal pages are "open" and not "pre-auth" (a logged-in reader must not be bounced) |
| 31-32 | `matches()` — exact-or-`${p}/` prefix match |
| 39 | `const authed = req.cookies.has('access_token')` — coarse cookie gate; comment 36-38 notes `refresh_token` is path-scoped to `/api/auth` |
| 41-44 | `/` cannot be a prefix (`'/anything'.startsWith('/')`), so OPEN is checked first by exact/slash match |
| 48-53 | unauthenticated + not pre-auth → redirect to `/login?from=<pathname>` |
| 54-59 | authenticated + pre-auth → redirect to `/` |
| 63-65 | `config.matcher = ['/((?!api\|_next/static\|_next/image\|favicon.svg\|.*\\..*).*)']` — `/api` excluded, so the BFF is never proxied |

**No OAuth-, CSRF- or refresh-specific casing in `proxy.ts`.** Note there is **no `/platform`
entry** — the platform panel is gated client-side only (`platform/layout.tsx:34-36`).

### `apps/web/src/app/api/[...path]/route.ts` — per-path special-casing

**There is none.** This is worth stating plainly for the generator: the BFF is fully path-agnostic.

| line(s) | behaviour |
| --- | --- |
| 12 | `API_BASE = process.env.API_INTERNAL_URL ?? 'http://localhost:4201'` |
| 13-20 | `HOP_BY_HOP` stripped both directions |
| 22-32 | `CLIENT_IP_HEADER` / `CLIENT_IP_TRUSTED_HOPS` (default `0`) — **rate-limit feature** |
| 34-53 | `CLIENT_CONTROLLED` — 12 forwarding headers deleted on the way in (**rate-limit feature**) |
| 55-71 | `resolveClientIp()` counts hops **from the right** (**rate-limit feature**) |
| 74-75 | `target = ${API_BASE}/api/${path.map(encodeURIComponent).join('/')}${search}` — no branch on path |
| 82-85 | re-adds a single sanitised `x-forwarded-for` + `x-forwarded-host` + `x-forwarded-proto` |
| 88 | `redirect: 'manual'` — **this is what makes the OAuth `302` redirects work through the BFF without any oauth-specific code**; the upstream `Location` header is copied verbatim by the generic loop at 100-103 |
| 89-95 | body forwarded for non-GET/HEAD with `duplex: 'half'` |
| 99-104 | response headers copied except hop-by-hop; `set-cookie` handled separately via `getSetCookie()` so **multiple** auth cookies survive (**auth feature depends on line 104**) |
| 114-120 | all 7 verbs exported to the same `handle` |

Consequence for the generator: removing OAuth, invitations, CSRF or refresh requires **zero** edits
to this file. Removing the rate-limit feature would strip 22-32, 34-53, 55-71 and 82-83.

### `apps/web/src/hooks/use-auth.tsx` — feature-specific fields

The hook file itself is thin (72 lines) and carries **no feature-specific fields of its own** — it
re-exports `UserDto` from `@dontpanic/shared`. Line-by-line:

| line(s) | export | feature |
| --- | --- | --- |
| 6-14 | type imports: `ChangePasswordInput`, `LoginInput`, `LoginResponse`, `SignupInput`, `SignupResponse`, `UpdateProfileInput`, `UserDto` | auth + profile + signup |
| 16-23 | `useUser()` → `api<UserDto>('/users/me')`, `queryKey: ['me']`, `retry: false`, `staleTime: 60_000` | auth |
| 25-32 | `useLogin()` → `POST /auth/login`, invalidates `['me']` | **auth (login)** |
| 34-43 | `useSignup()` → `POST /auth/signup`; the doc comment at 34-37 documents that signup creates company+first admin | **public signup** |
| 45-56 | `useLogout()` → `POST /auth/logout`, `qc.clear()`, `router.replace('/login')` | **auth (logout)** |
| 58-65 | `useUpdateProfile()` → `PATCH /users/me`, `qc.setQueryData(['me'], user)` | **profile** |
| 67-72 | `useChangePassword()` → `PATCH /users/me/password` | **profile (password)** |

**The feature-specific fields live in `packages/shared/src/user.ts:13-23` (`userDtoSchema`), not
here:**

| shared line | field | feature |
| --- | --- | --- |
| 14-16 | `id`, `email`, `name` | core |
| 17 | `avatarUrl: z.string().url().nullable()` | **profile/files** |
| 18 | `role: RoleEnum` (`SUPERADMIN\|ADMIN\|USER`, defined at :9) | **RBAC/platform** — consumed by `app-sidebar.tsx:29` and `admin/page.tsx:36,45` |
| 19 | `emailVerified: z.boolean()` | **auth (verification)** |
| 20 | `twoFactorEnabled: z.boolean()` | **2FA** |
| 21-22 | `createdAt`, `updatedAt` | core |

**There is no `tenant` and no `plan` on `UserDto`.** Tenant/plan state reaches the web through a
different path — `usePlatformAccess()` (`components/platform/platform-api.tsx`) for the platform
panel, and `TenantGate` / `TrialBanner` (`components/tenant/*`) for the company shell. The 2FA
onboarding uses its own `securityStatusSchema` (`packages/shared/src/user.ts:27-32`:
`twoFactorEnabled`, `twoFactorRequired`, `shouldPrompt`). A generator pruning the tenancy or plan
feature must therefore look at `components/tenant/**` and `components/platform/platform-api.tsx`,
**not** at `use-auth.tsx`.

### `apps/web/messages/pt-BR.json` — top-level namespaces

Both files are **575 lines and line-for-line aligned**; the ranges below are identical in
`en-US.json`.

| lines | namespace | owning feature |
| --- | --- | --- |
| 2-19 | `common` | core/shell (`appName`, `tagline`, `dontPanic`, `loading`, `save`, `cancel`, …). Lines 4-5 (`tagline`, `dontPanic`) are **humour** |
| 20-27 | `nav` | shell. `dashboard`(21)→dashboard, `profile`(22)→profile, `admin`(23)→admin/users, `logout`(24)→auth, `theme`(25)→theming, **`language`(26)→i18n** |
| 28-128 | `auth` | **auth**, with sub-namespaces: `login` 29-42, `signup` 43-63 (**public signup**), `forgot` 64-70, `reset` 71-80, `verify` 81-93, `captcha` 94-98 (**captcha**), `oauth` 99-115 (**social login**), `completeSignup` 116-127 (**social login**) |
| 129-154 | `dashboard` | **dashboard**. `cards.secure` 135-138, **`cards.i18n` 139-142 → i18n**, `cards.swappable` 143-146; `variation` 148-153 → dashboard metric cards. Line 133 `answer: "A resposta é 42."` = **humour** |
| 155-225 | `profile` | **profile**. `tabs` 158-161, `avatar` 162-167 (**files**), `nameSection` 168-172, `email` 173-182, `passwordSection` 183-189, `twoFactor` 190-202 (**2FA**), `sessions` 203-214 (**auth/sessions**), `danger` 215-224 (**LGPD/account deletion**) |
| 226-293 | `admin` | **admin/users** (227-251 table copy), `invite` 252-264 (**invitations**), `invitations` 265-292 (**invitations**) |
| 294-310 | `session` | **auth (session-ended dialog)**; keys `expired` 298-301, `signed-in-elsewhere` 302-305, `reuse-detected` 306-309 mirror `sessionEndReasons` in shared |
| 311-325 | `errors` | shell. `notFound` 312-317, `serverError` 318-323, `generic` 324. **Lines 316 & 322 (`marvin`) = humour**; 314/320/324 are joke-flavoured copy |
| **326-331** | **`easter`** | **easter-eggs — the only wholly-humour namespace** |
| 332-339 | `twoFactorPrompt` | **2FA** |
| 340-354 | `twoFactorSetup` | **2FA** |
| 355-362 | `validation` | **i18n-coupled** — consumed exclusively through `applyZodI18n` (`providers.tsx:25`, `zod-error-map.ts:20-40`) |
| 363-380 | `tenant` | **tenancy/plans**. `blocked` 364-368 (TenantGate), `trial` 369-374 (TrialBanner), `construction` 375-379 (UnderConstruction) |
| 381-398 | `legal` | **legal**. `document` 382-388, `page` 389-397 |
| 399-563 | `platform` | **platform** (the largest namespace). `nav` 403-407, `status` 408-413, `overview` 414-428, `tenants` 429-455, `plans` 456-498 (incl. `plans.form`), `suspendDialog` 499-507, `planDialog` 508-514, `trialDialog` 515-521, `toast` 522-531, `createTenant` 532-562 |
| 564-574 | `invite` | **invitations** (public accept screen) |

### The key-parity test — how it works and whether an asymmetric prune fails

`apps/web/src/i18n/messages.test.ts`:

- Lines 2-3 import **both** catalogues statically (`import ptBR from '../../messages/pt-BR.json'`,
  `import enUS from '../../messages/en-US.json'`).
- Lines 6-12 `deepKeys()` recursively flattens to dot-paths of every **leaf** (it recurses on any
  non-null object, so a namespace contributes all its leaves, not its own name).
- Lines 15-16 build sorted key lists.
- Lines 18-25 the parity assertion: `onlyInPt = ptKeys.filter(k => !enKeys.includes(k))`,
  `onlyInEn` symmetrically, then `expect(onlyInPt).toEqual([])`, `expect(onlyInEn).toEqual([])`, and
  finally `expect(ptKeys).toEqual(enKeys)`.
- Lines 27-40 a second test: no leaf may be the empty string, in either locale.

**Yes — dropping a namespace from only one file fails the suite, loudly and by name.** Removing
`easter` (326-331) from `pt-BR.json` alone makes `onlyInEn` = `['easter.consoleSubtitle',
'easter.consoleTitle', 'easter.konamiDescription', 'easter.konamiTitle']`, and the custom message at
line 23 (`` `keys present only in en-US: ${onlyInEn.join(', ')}` ``) prints exactly those four
paths. So the generator **must prune both files identically** — and, helpfully, cannot get it wrong
silently. Two corollaries:

1. Under i18n level (i) (one messages file), `messages.test.ts` must be **deleted**, not kept — with
   only one catalogue its static `import enUS` breaks the module resolution.
2. Also note that the two files are byte-aligned line-for-line, which means a generator can apply
   the *same* line ranges to both — verified: `grep -n '^  "'` returns identical line numbers
   (2,20,28,129,155,226,294,311,326,332,340,355,363,381,399,564) for both files.

### `apps/web/vitest.config.mts` coverage config naming feature files

| line | entry | feature named |
| --- | --- | --- |
| 12 | `include: ['src/**/*.{test,spec}.{ts,tsx}']` (test discovery) | — |
| 16-22 | the comment explaining the coverage scope ("the UI kit, the record/dashboard/chart component layer, the api/utils libs, **the i18n locale map, the language switcher** and the login screen"; "Full Next.js pages/layouts, server-only routes, RSC hooks and **the dev-time proxy** are integration/e2e concerns") | i18n |
| 24 | `'src/components/ui/**/*.{ts,tsx}'` | UI kit |
| **25** | `'src/components/language-switcher.tsx'` | **i18n** |
| 26 | `'src/components/session-ended-dialog.tsx'` | auth/sessions |
| 27 | `'src/components/records/**/*.{ts,tsx}'` | records/CRUD kit |
| 28 | `'src/components/dashboard/**/*.{ts,tsx}'` | dashboard |
| 29 | `'src/components/charts/**/*.{ts,tsx}'` | charts |
| 30 | `'src/components/tenant/**/*.{ts,tsx}'` | tenancy/plans |
| 31 | `'src/components/legal/**/*.{ts,tsx}'` | legal |
| 32 | `'src/components/platform/**/*.{ts,tsx}'` | platform |
| 33 | `'src/lib/**/*.ts'` | core libs (incl. `br-format.ts`, `masks.ts`, `zod-error-map.ts`, `captcha.ts`, `auth-config.ts`) |
| **34** | `'src/i18n/locales.ts'` | **i18n** |
| 35 | `'src/app/(auth)/login/**/*.tsx'` | auth (login) |
| 37-43 | `exclude`: `**/*.stories.*`, `**/*.{test,spec}.*`, `src/components/ui/sonner.tsx` | — |
| 44-46 | the comment recording the achieved numbers (99.5/97/100/99.7) and why branches sit at 88 ("the few defensive paths (redirect param, inset prop, **same-locale no-op**)") | i18n — the "same-locale no-op" is `language-switcher.tsx:31` |
| 47-52 | `thresholds: { statements: 99, branches: 88, functions: 95, lines: 99 }` | — |

**Generator rule:** every feature removal that deletes a directory named in 24-35 must delete the
matching `include` line, and **must re-measure the four thresholds at 48-51** — they are absolute
floors pinned at the currently-achieved numbers, so removing well-covered code (the UI kit, the
platform components) can push the *remaining* aggregate below 99/88/95/99 and fail CI for reasons
that look unrelated to the removal.

### `apps/web/.storybook` — does it glob stories?

`apps/web/.storybook/main.ts:14` — **yes**: `stories: ['../src/**/*.stories.@(ts|tsx)']`. A single
glob, so **no per-feature story paths to prune**; deleting a feature's `*.stories.tsx` files is
sufficient and `main.ts` needs no edit. Other lines: `15` addons (`@storybook/addon-docs`,
`@storybook/addon-a11y`), `16-19` framework `@storybook/nextjs`, `20` `staticDirs: ['../public']`,
`21-24` `reactDocgen`.

`apps/web/.storybook/preview.tsx` — **does** name a feature: lines **56-68** define the
`globalTypes.locale` toolbar (pt-BR/en-US with 🇧🇷/🇺🇸 flags), whose comment at 57 says it exists
"for components that read it (e.g. LanguageSwitcher)" → **remove with i18n**. Lines 13-18
(`FONT_VARS`), 21-39 (`withTheme` decorator) and 42-55 (`globalTypes.theme`) belong to
**theming**; 71-82 (`layout`, `nextjs.appDirectory: true`, `controls`, `backgrounds`, `a11y`) are
core.

Existing story files, by feature: `components/brand.stories.tsx` (brand),
`components/flags.stories.tsx` + `components/language-switcher.stories.tsx` (**i18n**),
`components/theme-toggle.stories.tsx` (theming), `components/ui/*.stories.tsx` (UI kit — several
carry Hitchhiker copy, see easter-eggs §(k) item 8).

---

## A2 · Migration baseline

Six migrations, 671 SQL lines total:

| directory | lines |
| --- | --- |
| `20260613074545_init` | 134 |
| `20260613122947_two_factor_remind_at` | 2 |
| `20260911105130_tenancy` | 228 |
| `20260911105200_row_level_security` | 143 |
| `20260911105300_app_role` | 51 |
| `20260912120000_invitations_and_oauth` | 110 |
| `migration_lock.toml` | 3 |

`migration_lock.toml` in full:

```toml
# Please do not edit this file manually
# It should be added in your version-control system (e.g., Git)
provider = "postgresql"
```

The schema is a Prisma **schema folder** (`apps/api/prisma.config.ts:11` → `schema: 'prisma/schema'`)
with 5 files and **15 models + 6 enums**: `auth.prisma` (RefreshToken, PasswordResetToken,
EmailVerificationToken, TwoFactorBackupCode, LegalAcceptance, AuditLog; enums SessionEndReason,
LegalDocumentKind), `tenancy.prisma` (Plan, Tenant, TenantBranding, TenantParameter, User, Profile,
Permission; enums TenantStatus, Role), `invitations.prisma` (Invitation; enum InvitationStatus),
`oauth.prisma` (OAuthAccount; enum OAuthProviderName), `main.prisma` (generator + datasource only).
**There is no file/upload model** — the `files` feature is storage-adapter-only and contributes no
SQL whatsoever.

### 1. Statement-by-statement classification

AUTO = `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema` regenerates it from
`schema.prisma`, so the generator must **not** carry the text; it re-derives it after pruning models.
MANUAL = not expressible in the Prisma schema language; must be preserved verbatim.

| migration file | lines | statement | verdict |
| --- | --- | --- | --- |
| `..._init` | 1-2 | `CREATE TYPE "Role"` | AUTO (superseded — see note) |
| `..._init` | 4-86 | `CREATE TABLE` × 6 (`users`, `refresh_tokens`, `password_reset_tokens`, `email_verification_tokens`, `two_factor_backup_codes`, `audit_logs`) | AUTO |
| `..._init` | 88-119 | `CREATE (UNIQUE) INDEX` × 12 | AUTO |
| `..._init` | 121-134 | `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` × 5 | AUTO |
| `..._two_factor_remind_at` | 1-2 | `ALTER TABLE "users" ADD COLUMN "twoFactorRemindAt"` | AUTO (folds into the `users` CREATE TABLE) |
| `..._tenancy` | 1-8 | `CREATE TYPE` × 3 (`SessionEndReason`, `LegalDocumentKind`, `TenantStatus`) | AUTO |
| `..._tenancy` | 10-11 | `ALTER TYPE "Role" ADD VALUE 'SUPERADMIN'` | AUTO (the baseline emits `CREATE TYPE "Role" AS ENUM ('SUPERADMIN','ADMIN','USER')` in one shot) |
| `..._tenancy` | 13-27 | `ALTER TABLE … ADD COLUMN` × 3 (`audit_logs` +5 cols, `refresh_tokens` +1, `users` +4) | AUTO (fold into CREATE TABLE) |
| `..._tenancy` | 29-147 | `CREATE TABLE` × 6 (`legal_acceptances`, `plans`, `tenants`, `tenant_branding`, `tenant_parameters`, `profiles`, `permissions` — 7) | AUTO |
| `..._tenancy` | 149-198 | `CREATE (UNIQUE) INDEX` × 13 | AUTO |
| `..._tenancy` | 200-228 | `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` × 10 | AUTO |
| `..._row_level_security` | 1-17 | header comment | MANUAL (prose worth keeping) |
| `..._row_level_security` | **19** | `CREATE SCHEMA IF NOT EXISTS app;` | **MANUAL #1** |
| `..._row_level_security` | **23-26** | `CREATE OR REPLACE FUNCTION app.current_tenant_id()` | **MANUAL #2** |
| `..._row_level_security` | **28-31** | `CREATE OR REPLACE FUNCTION app.is_platform_admin()` | **MANUAL #3** |
| `..._row_level_security` | **33-36** | `CREATE OR REPLACE FUNCTION app.is_system()` | **MANUAL #4** |
| `..._row_level_security` | **39-44** | `CREATE OR REPLACE FUNCTION app.tenant_visible(uuid)` | **MANUAL #5** |
| `..._row_level_security` | **51-89** | `CREATE OR REPLACE FUNCTION app.apply_tenant_rls()` | **MANUAL #6** |
| `..._row_level_security` | **91** | `SELECT app.apply_tenant_rls();` | **MANUAL #7** |
| `..._row_level_security` | **96-120** | `CREATE OR REPLACE FUNCTION app.apply_user_owned_rls()` | **MANUAL #8** |
| `..._row_level_security` | **122** | `SELECT app.apply_user_owned_rls();` | **MANUAL #9** |
| `..._row_level_security` | **125-140** | anonymous `DO $$ … $$;` applying the profile-children policy to `permissions` | **MANUAL #10** |
| `..._row_level_security` | 142-143 | trailing comment about the global unique e-mail | MANUAL (prose) |
| `..._app_role` | 1-12 | header comment | MANUAL (prose) |
| `..._app_role` | **14-23** | `DO $$ … CREATE ROLE dontpanic_app … / ALTER ROLE … $$;` | **MANUAL #11** |
| `..._app_role` | **25** | `GRANT USAGE ON SCHEMA public TO dontpanic_app;` | **MANUAL #12** |
| `..._app_role` | **26** | `GRANT USAGE ON SCHEMA app TO dontpanic_app;` | **MANUAL #13** |
| `..._app_role` | **27** | `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;` | **MANUAL #14** |
| `..._app_role` | **30** | `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;` | **MANUAL #15** |
| `..._app_role` | **31** | `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;` | **MANUAL #16** |
| `..._app_role` | **35-36** | `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT … ON TABLES` | **MANUAL #17** |
| `..._app_role` | **37-38** | `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT … ON SEQUENCES` | **MANUAL #18** |
| `..._app_role` | **39-40** | `ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT EXECUTE ON FUNCTIONS` | **MANUAL #19** |
| `..._app_role` | **45-51** | `DO $$ … REVOKE ALL ON TABLE public._prisma_migrations … $$;` | **MANUAL #20** |
| `..._invitations_and_oauth` | 1-11 | header comment | MANUAL (prose) |
| `..._invitations_and_oauth` | 13-14 | `CREATE TYPE "InvitationStatus"`, `CREATE TYPE "OAuthProviderName"` | AUTO |
| `..._invitations_and_oauth` | 24 | `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL` | AUTO — `tenancy.prisma:163` already says `passwordHash String?`, so a from-empty baseline emits the column nullable |
| `..._invitations_and_oauth` | 27-47 | `CREATE TABLE "invitations"` | AUTO |
| `..._invitations_and_oauth` | 49-52 | `CREATE (UNIQUE) INDEX` × 4 on `invitations` | AUTO |
| `..._invitations_and_oauth` | **65-67** | `CREATE UNIQUE INDEX "invitations_tenant_email_pending_key" … WHERE "status" = 'PENDING'` | **MANUAL #21** (Prisma cannot express a partial index — `invitations.prisma:26-31`) |
| `..._invitations_and_oauth` | 69-76 | `ALTER TABLE "invitations" ADD CONSTRAINT` × 4 FK | AUTO |
| `..._invitations_and_oauth` | 79-90 | `CREATE TABLE "oauth_accounts"` | AUTO |
| `..._invitations_and_oauth` | 95-100 | `CREATE (UNIQUE) INDEX` × 4 on `oauth_accounts` | AUTO |
| `..._invitations_and_oauth` | 102-105 | `ALTER TABLE "oauth_accounts" ADD CONSTRAINT` × 2 FK | AUTO |
| `..._invitations_and_oauth` | **110** | `SELECT app.apply_tenant_rls();` | **MANUAL #22** (redundant with #7 *if* the baseline creates all tables before the sweep — see §3) |

**Total MANUAL statements: 22** (20 if the baseline collapses the two `apply_tenant_rls()` sweep
calls into one and drops the invitations one — but see §3: keep exactly one sweep, placed last).
Every other statement in all six files is AUTO.

### 2. Verbatim MANUAL statements, in dependency order

Tags: `GLOBAL` = always emitted. `PER-FEATURE` = only when that feature/table is selected.
Ownership feature names use the 13-feature vocabulary from the brief.

---

#### Fragment `rls-00-schema` — owner `multi-tenancy` — GLOBAL

```sql
CREATE SCHEMA IF NOT EXISTS app;
```

#### Fragment `rls-01-context-readers` — owner `multi-tenancy` — GLOBAL

```sql
-- ── Reading the context ────────────────────────────────────────────────────
-- NULLIF handles the empty string: ''::uuid would raise a syntax error.
CREATE OR REPLACE FUNCTION app.current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid;
  $$;

CREATE OR REPLACE FUNCTION app.is_platform_admin() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.platform_admin', true), '') = 'on';
  $$;

CREATE OR REPLACE FUNCTION app.is_system() RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT coalesce(current_setting('app.system', true), '') = 'on';
  $$;

-- The single predicate behind every tenant policy.
CREATE OR REPLACE FUNCTION app.tenant_visible(row_tenant_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
    SELECT app.is_platform_admin()
        OR app.is_system()
        OR (row_tenant_id IS NOT NULL AND row_tenant_id = app.current_tenant_id());
  $$;
```

Note for single-tenant mode: `app.is_platform_admin()` stays even with the platform panel gone —
`TwoFactorGateGuard:53` still calls `asPlatform` for a tenant-less user, and dropping the function
would break `app.tenant_visible`.

#### Fragment `rls-02-sweep-function` — owner `multi-tenancy` — GLOBAL

```sql
-- ── Applying the policies automatically ────────────────────────────────────
-- Scans the public schema and protects every table that has a tenantId column.
-- Idempotent: call it at the end of any migration that creates tables, which is
-- exactly what keeps a new table from being left out by forgetfulness. The
-- `tenants` table is handled separately (it isolates on its own `id`).
CREATE OR REPLACE FUNCTION app.apply_tenant_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOR t IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenantId'
        AND NOT a.attisdropped
        AND c.relname <> '_prisma_migrations'
    LOOP
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      -- FORCE is what makes the table owner obey as well. Without it the
      -- application (which owns the schema) would bypass RLS silently.
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I
           USING (app.tenant_visible("tenantId"))
           WITH CHECK (app.tenant_visible("tenantId"))', t);
    END LOOP;

    -- `tenants` has no tenantId: its primary key IS the tenant.
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = 'tenants' AND c.relkind = 'r') THEN
      ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS tenant_isolation ON public.tenants;
      CREATE POLICY tenant_isolation ON public.tenants
        USING (app.tenant_visible(id))
        WITH CHECK (app.tenant_visible(id));
    END IF;
  END;
  $$;
```

**There are no literal `CREATE POLICY` statements for tenant tables anywhere in the repo** — all of
them are `EXECUTE format(...)` inside this function (and inside `app.apply_user_owned_rls()` and the
`permissions` DO block below). Same for `ALTER TABLE … ENABLE/FORCE ROW LEVEL SECURITY`: the only
literal, non-`format()` occurrences in the whole repo are the three inside this function's `tenants`
branch (lines 81-86 of the RLS migration, quoted above). The generator therefore never has to emit
a per-table policy fragment.

#### Fragment `rls-03-user-owned-function` — owner `multi-tenancy` (needs `2fa` for one array entry) — GLOBAL, self-guarding

```sql
-- ── Credential tables ──────────────────────────────────────────────────────
-- They carry no tenantId (they belong to a user, who belongs to a tenant), so
-- they isolate through their owner with the same predicate.
CREATE OR REPLACE FUNCTION app.apply_user_owned_rls() RETURNS void
  LANGUAGE plpgsql AS $$
  DECLARE
    t text;
  BEGIN
    FOREACH t IN ARRAY ARRAY[
      'refresh_tokens', 'password_reset_tokens',
      'email_verification_tokens', 'two_factor_backup_codes'
    ] LOOP
      IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
        EXECUTE format(
          'CREATE POLICY tenant_isolation ON public.%I
             USING (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))
             WITH CHECK (EXISTS (SELECT 1 FROM public.users u
                            WHERE u.id = %I."userId" AND app.tenant_visible(u."tenantId")))',
          t, t, t);
      END IF;
    END LOOP;
  END;
  $$;
```

The `IF EXISTS` per entry means the generator can emit this **verbatim and unedited** even when
`two_factor_backup_codes` is absent (`2fa` off): the loop skips it. Editing the array is optional
tidiness, never a correctness requirement.

#### Fragment `rls-04-profile-children` — owner `multi-tenancy` — PER-TABLE (`permissions`)

```sql
-- ── Profile children, linked by profileId ──────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['permissions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I
         USING (EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))
         WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = %I."profileId" AND app.tenant_visible(p."tenantId")))',
      t, t, t);
  END LOOP;
END $$;
```

⚠️ **Unlike the previous fragment this one has NO `IF EXISTS` guard.** If a generated project has no
`permissions` table it fails with `relation "public.permissions" does not exist`. `permissions` is
part of the always-on `multi-tenancy` core (profiles + permissions are what `provisionTenant` and
the seed create), so in practice it is always present — but if the generator ever makes the
profile/permission model optional it must either drop this fragment or copy the `IF EXISTS` shape
from `rls-03`. **Recommendation: add the `IF EXISTS` guard when emitting**, matching `rls-03`.

#### Fragment `rls-05-partial-index-invitations` — owner `invitations` — PER-FEATURE

```sql
-- At most one LIVE invitation per address per company.
--
-- A partial index, because the constraint only applies to PENDING rows: after
-- an invitation is accepted or revoked the same person may legitimately be
-- invited again, and a plain UNIQUE(tenantId, email) would refuse that forever.
-- Prisma's schema language cannot express a partial index, which is why this
-- lives here and is documented on the model.
--
-- It also closes the race the service's pre-check cannot: two admins inviting
-- the same colleague at the same moment both see "no pending invitation" and
-- both insert. Postgres refuses the second, and the service translates it.
CREATE UNIQUE INDEX "invitations_tenant_email_pending_key"
  ON "invitations"("tenantId", "email")
  WHERE "status" = 'PENDING';
```

Must run **after** `CREATE TABLE "invitations"` (AUTO). The service side depends on it:
`invitations.service.ts` translates the `P2002` into a 409, and `tenant-crud.ts:58-69`'s raw-message
branch exists because Prisma cannot see partial indexes.

#### Fragment `rls-06-sweep-call` — owner `multi-tenancy` — GLOBAL, **must be the last DDL**

```sql
SELECT app.apply_tenant_rls();
SELECT app.apply_user_owned_rls();
```

(In the original history these are two separate statements at `..._row_level_security:91` and `:122`,
plus a repeat of the first at `..._invitations_and_oauth:110`. In a single baseline, one call to each
placed after every `CREATE TABLE` is equivalent and strictly safer.)

#### Fragment `role-00-create` — owner `multi-tenancy` — GLOBAL

```sql
-- ═══════════════════════════════════════════════════════════════════════════
-- An application role with no special privileges.
--
-- Why: a SUPERUSER (and any role with BYPASSRLS) ignores Row Level Security —
-- including with FORCE ROW LEVEL SECURITY. The database owner IS a superuser,
-- so the application must NOT connect as that user: every policy would be
-- decoration.
--
-- From here on there are two distinct connections:
--   DATABASE_URL        -> restricted role, used by the API at runtime (RLS applies)
--   DATABASE_ADMIN_URL  -> database owner, used only by migrate/seed (DDL)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dontpanic_app') THEN
    -- NOSUPERUSER + NOBYPASSRLS are the entire point of this file.
    CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  ELSE
    ALTER ROLE dontpanic_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;
```

**Generator must template the role name and password.** `dontpanic_app` appears in five places that
have to agree: this migration, `.env.example:49` (`DATABASE_URL`), `docker-compose.dev.yml:60` and
`:96`, `apps/api/test/e2e-setup.ts:17-18`, and the prose at `CLAUDE.md:105`/`539` and
`README.md:150`/`445`, plus the production checklist `PENDENCIAS.template.md:38`. A hard-coded
password in a migration is fine for dev and must be flagged in the generated production checklist.

#### Fragment `role-01-grants` — owner `multi-tenancy` — GLOBAL

```sql
GRANT USAGE ON SCHEMA public TO dontpanic_app;
GRANT USAGE ON SCHEMA app TO dontpanic_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO dontpanic_app;

-- Data: yes. Structure and policies: no.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dontpanic_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dontpanic_app;

-- Tables created by future migrations inherit the same privileges, so adding a
-- module never means coming back here.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO dontpanic_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO dontpanic_app;
```

**No table is ever named.** Everything is `ON ALL TABLES IN SCHEMA public` /
`ALTER DEFAULT PRIVILEGES`. This is the single best property of the whole baseline for a generator:
pruning any model changes nothing here. See Risks §5.

#### Fragment `role-02-revoke-migrations` — owner `multi-tenancy` — GLOBAL

```sql
-- The application role cannot read the migration history.
-- Conditional: in the shadow database `migrate dev` builds to detect drift,
-- this table does not exist yet when the migration runs.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations') THEN
    REVOKE ALL ON TABLE public._prisma_migrations FROM dontpanic_app;
  END IF;
END $$;
```

The `IF EXISTS` is load-bearing and the comment says why: `prisma migrate dev` replays the baseline
into a **shadow database** where `_prisma_migrations` does not exist yet. Remove the guard and every
subsequent `migrate dev` in the generated project fails. Do not "simplify" it.

### 3. Ordering constraints

Hard dependencies, in the order the generator must emit them:

1. **`CREATE SCHEMA app`** (#1) before any `app.*` function — `rls-00` before `rls-01`.
2. **`app.current_tenant_id` / `is_platform_admin` / `is_system`** (#2-#4) before
   **`app.tenant_visible`** (#5): `tenant_visible`'s body calls all three. Postgres resolves SQL
   function bodies at creation time, so the order is enforced, not stylistic.
3. **`app.tenant_visible`** before **`app.apply_tenant_rls`** and **`app.apply_user_owned_rls`**
   (#6, #8) — the policy text they `EXECUTE format(...)` references it. (plpgsql bodies are parsed
   lazily, so this one would survive a wrong order until first call; do not rely on it.)
4. **Every `CREATE TABLE`** (all AUTO) before the **sweep calls** (#7, #9, #10, #22). This is the
   one ordering mistake that fails silently in the dangerous direction: a table created *after* the
   sweep gets no policy, no `ENABLE ROW LEVEL SECURITY`, and — because `role-01`'s
   `ALTER DEFAULT PRIVILEGES` grants it full DML to `dontpanic_app` — becomes a fully readable,
   fully writable, **completely unisolated** table. **Emit `rls-06-sweep-call` as the last DDL in
   the baseline, after every table and index.**
5. **`CREATE TABLE "invitations"`** before the **partial unique index** (#21).
6. **`CREATE ROLE dontpanic_app`** (#11) before every `GRANT`/`ALTER DEFAULT PRIVILEGES` (#12-#19)
   and before the `REVOKE` (#20).
7. **`CREATE SCHEMA app`** and the `app.*` functions before `GRANT USAGE ON SCHEMA app` /
   `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app` (#13, #14) — `ON ALL FUNCTIONS` is a snapshot of
   what exists *now*, not a standing rule. Functions created after that GRANT are covered only by
   `ALTER DEFAULT PRIVILEGES IN SCHEMA app` (#19), which is why #19 exists. Emit the whole `rls-*`
   block before the whole `role-*` block.
8. **All `CREATE TABLE` before `GRANT … ON ALL TABLES IN SCHEMA public`** (#15) — same snapshot
   semantics. (`ALTER DEFAULT PRIVILEGES` (#17) covers later tables, but the generated project's
   first boot happens with only the baseline applied, so get the snapshot right.)

**Recommended single-file baseline order:**

```
1. CREATE TYPE   (all enums, AUTO)
2. CREATE TABLE  (all models, AUTO)
3. CREATE INDEX  (all, AUTO)
4. ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY (all, AUTO)
5. rls-05  partial unique index on invitations           [if invitations]
6. rls-00  CREATE SCHEMA app
7. rls-01  context readers + tenant_visible
8. rls-02  apply_tenant_rls()
9. rls-03  apply_user_owned_rls()
10. role-00 CREATE ROLE
11. role-01 grants + default privileges
12. role-02 REVOKE on _prisma_migrations
13. rls-04  permissions DO block (add the IF EXISTS guard)
14. rls-06  SELECT app.apply_tenant_rls(); SELECT app.apply_user_owned_rls();   ← LAST
```

#### `migration_lock.toml`

Emit it, verbatim, with `provider` matching the selected `DB_PROVIDER`
(`postgresql` / `mysql` / `sqlite` per CLAUDE.md's adapter table). **Without this file
`prisma migrate dev` in the generated project prompts/errors about an unknown provider.** Note the
whole RLS+role layer is Postgres-only: if the generator ever offers `mysql`/`sqlite`, fragments
`rls-*` and `role-*` cannot be emitted and multi-tenancy loses its hard guarantee — that combination
should be refused, not silently degraded.

#### `_prisma_migrations`

The baseline is a normal migration directory, e.g.
`apps/api/prisma/migrations/00000000000000_init/migration.sql`, plus `migration_lock.toml` beside it.
Then:

- **Fresh generated project (the normal case):** the user runs `pnpm --filter @dontpanic/api db:migrate`
  (`apps/api/package.json:19` → `dotenv -e ../../.env -- prisma migrate dev`) against an empty
  database. Prisma applies the baseline and writes its own `_prisma_migrations` row. Nothing special
  is needed, and `migrate dev` keeps working for the user's own later migrations.
- **The shadow-database catch:** `migrate dev` replays the baseline into a throwaway shadow DB to
  detect drift. Two things make that survive — both already handled, both must be preserved:
  `role-00`'s `IF NOT EXISTS` on the role (the role is cluster-wide and already exists on the second
  run) and `role-02`'s `IF EXISTS` on `_prisma_migrations` (absent in the shadow DB). Removing
  either guard breaks the generated project's second migration, not its first.
- The shadow database is created by the **owner** connection. `prisma.config.ts:19-23` reads
  `DATABASE_ADMIN_URL` first, falling back to `DATABASE_URL`. The generated `.env.example` must ship
  both (lines 44-50 of the current file are the model), and the generated README must say that
  `db:migrate`/`db:seed` need the owner while the app needs the restricted role.
- **Do NOT `migrate resolve --applied`** in the generator. That is for adopting an existing
  database; a generated project starts empty and baselining it as "already applied" would leave the
  schema uncreated.
- If the generator instead offers a "deploy" path, that is `db:migrate:deploy`
  (`apps/api/package.json:20`), which is idempotent — this is exactly what the e2e
  `global-setup.ts:63-67` does, overriding **both** `DATABASE_URL` and `DATABASE_ADMIN_URL` (see the
  comment at `:54-61`: overriding only one silently migrates the wrong database).
- `apps/api/package.json:24-26` (`"prisma": { "seed": "tsx prisma/seed.ts" }`) and
  `prisma.config.ts:24-28` (`migrations.path` + `migrations.seed`) both point at the seed; keep both
  in sync in the generated project.

### 4. Per-feature baseline SQL fragments (13 features)

| feature | baseline SQL fragments contributed |
| --- | --- |
| **multi-tenancy** | **All of `rls-00` … `rls-04`, `rls-06`, `role-00` … `role-02`** (18 of the 22 MANUAL statements) plus the AUTO tables `tenants`, `tenant_branding`, `tenant_parameters`, `profiles`, `permissions` and the `tenantId` columns/indexes/FKs on `users`, `audit_logs`, `legal_acceptances`. **Not removable** — this is the fragment set the whole baseline is organised around. |
| **oauth** | **None manual.** Schema-only: `CREATE TYPE "OAuthProviderName"`, `CREATE TABLE "oauth_accounts"`, its 4 indexes and 2 FKs — all AUTO from `prisma/schema/oauth.prisma`. Its isolation comes free from the `tenantId` column + `rls-06` sweep (`oauth.prisma:14-22` documents exactly that). `passwordHash` nullable is AUTO too. |
| **invitations** | **`rls-05`** (the partial unique index) — the only feature besides multi-tenancy that owns a MANUAL statement. Everything else (`CREATE TYPE "InvitationStatus"`, `CREATE TABLE "invitations"`, 4 indexes, 4 FKs) is AUTO. |
| **2fa** | **None manual.** AUTO: `CREATE TABLE "two_factor_backup_codes"` + index + FK, and `users.twoFactorEnabled` / `twoFactorSecret` / `twoFactorRemindAt`. It *does* affect `rls-03`'s array literal (`'two_factor_backup_codes'`), but that fragment self-guards with `IF EXISTS`, so **no edit needed**. |
| **files** | **None at all.** There is no file/upload model in `prisma/schema/**` (15 models, checked exhaustively). Storage is adapters + MinIO/S3 only. Zero SQL. |
| **platform** | **None at all.** The platform panel reads `tenants`, `plans`, `users` — tables owned by `multi-tenancy` and `plans`. It creates no table, adds no column, and contributes no policy (`PrismaService.asPlatform` uses the existing `app.is_platform_admin()` path, already in `rls-01`). |
| **audit** | **None manual.** AUTO: `CREATE TABLE "audit_logs"` + `tenantId`/`userId`/`action`/`entity,entityId` indexes + 2 FKs. Isolation free via `tenantId` + sweep. |
| **plans** | **None manual.** AUTO: `CREATE TABLE "plans"`, `plans_code_key`, and `tenants.planId` + its FK + `tenants_planId_idx`. **Note:** `plans` has **no `tenantId`** — it is platform-level reference data, so the sweep deliberately skips it and it is readable by every tenant through the plain GRANT. That is correct and intentional; do not "fix" it by adding a policy. |
| **i18n** | **None at all.** No SQL. (`tenants.locale` / `currency` / `timezone` columns are AUTO and belong to `multi-tenancy`.) |
| **queue** | **None at all.** BullMQ state lives in Redis. The `tokens.purge-expired` job deletes from `password_reset_tokens` / `email_verification_tokens`, which the `core` fragment already creates. Zero SQL. |
| **captcha** | **None at all.** Config + adapters only. |
| **public-signup** | **None at all.** It is `PUBLIC_SIGNUP_ENABLED` + a service + a form. It writes `tenants`/`users`/`profiles`/`permissions`/`legal_acceptances`, all owned by other features. |
| **easter-eggs** | **None at all.** |
| *(core — always emitted, listed for completeness)* | AUTO only: `CREATE TYPE "Role"`, `CREATE TABLE "users"`, `refresh_tokens` (+ `SessionEndReason`), `password_reset_tokens`, `email_verification_tokens`, `legal_acceptances` (+ `LegalDocumentKind`), their indexes and FKs. `users_email_key` is **globally** unique — the RLS migration's closing comment (lines 142-143) notes this is what lets the tenant-less SUPERADMIN work without an extra partial index. |

Summary: **only two features own MANUAL SQL** — `multi-tenancy` (18 statements + 2 sweep calls) and
`invitations` (1 statement: the partial index). Eleven of the thirteen features contribute no manual
SQL at all, and six contribute no SQL whatsoever.

### 5. Risks

**5.1 — Does `apply_tenant_rls()` self-heal when a table is absent? YES, fully.** It is a *dynamic*
sweep of `pg_class`/`pg_attribute`, not a table list:

```sql
    FOR t IN
      SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND a.attname = 'tenantId'
        AND NOT a.attisdropped
        AND c.relname <> '_prisma_migrations'
    LOOP
```

Consequences for the generator, all good: pruning `invitations` or `oauth_accounts` means the loop
simply does not see them — no edit, no failure. Adding a product table with a `tenantId` column
means it is protected the moment the sweep runs again, which is why `CLAUDE.md:116-118` says to end
every migration with the call. The `tenants` branch is guarded by its own `IF EXISTS` (lines 79-80),
and `DROP POLICY IF EXISTS` before each `CREATE POLICY` makes the whole function idempotent and
safe to call from every future migration.

`apply_user_owned_rls()` is **not** dynamic — it is a fixed 4-element array — but each entry is
wrapped in `IF EXISTS (SELECT 1 FROM pg_class …)` (lines 105-106), so it also degrades cleanly.
**Emit both functions unedited.**

**5.2 — The one fragment that does NOT self-heal: `rls-04` (`permissions`).** Quoted in §2: the
`FOREACH t IN ARRAY ARRAY['permissions']` DO block has **no `IF EXISTS`**. It will raise
`relation "public.permissions" does not exist` if that table is pruned. Fix by adding the same guard
`rls-03` uses. Flagging this is the single most concrete SQL-level defect for a generator.

**5.3 — The silent mis-generation: a table created after the sweep.** Covered in §3 constraint 4.
There is no error, no warning, and `role-01`'s `ALTER DEFAULT PRIVILEGES` guarantees the app role
can read and write it. A generator bug that appends a feature's `CREATE TABLE` after
`rls-06-sweep-call` produces a working application with one unisolated table. Mitigation: emit
`rls-06` last, unconditionally, and add a smoke test to the generated e2e suite that asserts every
`public` table with a `tenantId` column has `relrowsecurity AND relforcerowsecurity` and a
`tenant_isolation` policy. (The repo does not have such a test today — worth adding.)

**5.4 — GRANTs do not enumerate tables. No per-feature editing needed.** Verified across all of
`..._app_role/migration.sql`: `GRANT … ON ALL TABLES IN SCHEMA public`,
`GRANT … ON ALL SEQUENCES IN SCHEMA public`, `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app`, plus
three `ALTER DEFAULT PRIVILEGES`. The **only** object named explicitly anywhere in the grants block
is `public._prisma_migrations` in the `REVOKE` (line 49) — and that one is `IF EXISTS`-guarded. So
pruning models never requires touching `role-01`.

**5.5 — `ON ALL … IN SCHEMA` is a snapshot.** It grants on objects existing at execution time only.
This is why the ordering rules in §3 (constraints 7 and 8) matter, and why the three
`ALTER DEFAULT PRIVILEGES` statements exist. If the generator splits the baseline into multiple
migration files, `role-01` must come after all `CREATE TABLE` in the *earlier* files, or the later
files' tables rely solely on default privileges — which works, but only because #17/#18 are there.
Do not drop them as "redundant".

**5.6 — The hard-coded role password.** `CREATE ROLE dontpanic_app LOGIN PASSWORD 'dontpanic_app'`
ships a known credential in a checked-in migration. Fine for dev (it matches `.env.example:49` and
`docker-compose.dev.yml:60`/`:96`), and the repo already lists "confirm `DATABASE_URL` points at the
restricted role" on the production checklist (`PENDENCIAS.template.md:38`). The generated project's
checklist must add: *rotate the `<app_role>` password before any non-local deploy.* If the generator
templates the role name it must update all seven agreeing sites listed under `role-00`.

**5.7 — `assertNotSuperuser` only warns outside production.** `prisma.service.ts:60-63` throws on
`NODE_ENV === 'production'` and otherwise `logger.error`s. A generated project run in dev with
`DATABASE_URL` pointed at the owner has **no isolation at all** and only a log line to say so. This
is the failure `tenant-isolation.e2e-spec.ts` exists to catch (see Trap 3.6) — another reason not to
drop that spec, and a reason the generated `.env.example` must keep the two-URL comment block
(`.env.example:44-50`) verbatim.

**5.8 — `plans` has no `tenantId` and is therefore unprotected by design.** Every tenant's
connection can `SELECT` every row of `plans` (and `INSERT`/`UPDATE`/`DELETE` it, per the blanket
GRANT — writes are gated only by the application's `SuperAdminGuard`). This is the current repo's
posture, not a generator bug, but a generated single-tenant or platform-less project that drops the
`SuperAdminGuard` layer while keeping the table leaves plan rows writable by any authenticated
session. Worth a note in the generated production checklist.

---

## A3 · Dead code and already-unused dependencies

Found while mapping. None of it belongs to a feature; all of it is stuff the generator can drop
unconditionally, or should stop pretending is wired. Listed because a generator that prunes features
*and* ships this is shipping known dead weight, and because three of these items sit inside coverage
`include` globs and therefore carry threshold weight.

### A3.1 — Unused UI/logic scaffolding (shipped for the product author, wired to nothing)

Verified by grepping for importers outside the file's own test/story:

| path | consumers | note |
| --- | --- | --- |
| `apps/web/src/components/records/{fields,keyboard-list,record-page}.tsx` (+ 3 tests) | **none** | inside the vitest coverage `include` (`vitest.config.mts:27`) |
| `apps/web/src/components/dashboard/{metric-card,panel,dashboard-skeleton}.tsx` (+ tests) | **none** (`variation.ts` only by `metric-card.tsx:7`) | inside coverage `include` (`:28`) |
| `apps/web/src/hooks/{use-grid-keyboard,use-synced-rows,use-hotkey}.ts` (+ tests) | **none** | `use-debounced-value.ts` **is** used (`platform/tenants/page.tsx:10`) |
| `apps/web/src/components/charts/bar-chart.tsx` (+ test) | only `components/platform/signups-chart.tsx:4` | orphaned when **platform** goes; coverage `include` `:29` |
| `apps/web/src/lib/br-format.ts` (+ test) | only its own test | dead today; coverage `include` `src/lib/**` `:33` |
| `apps/api/src/common/sequence/sequence.service.ts` (+ spec) | **none** | per-tenant sequence generator with `pg_advisory_xact_lock`, no caller |
| `apps/api/src/common/crud/tenant-crud.ts` (+ spec) | **none** | the tenant-scoped CRUD base class, no subclass |
| `apps/api/src/common/audit/actor.ts` (`actorOf`) | **none** | dead helper with a 100%-covered spec |

**Generator recommendation:** make this a single opt-in flag (`scaffolding` / `building-blocks`),
default **on** for a boilerplate (they are the point of a boilerplate) but off for `minimal`. If
off, delete the matching `vitest.config.mts` `include` lines (27, 28, 29) with them.

### A3.2 — Declared-but-never-imported npm dependencies (remove in every configuration)

| dep | declared | evidence |
| --- | --- | --- |
| `@fastify/static` | `apps/api/package.json:38` | zero imports repo-wide — which also means `LOCAL_STORAGE_PUBLIC_URL` (`env.ts:70`) points at a route the API never serves. A local-only storage build must **add** this wiring. |
| `@fastify/rate-limit` | `apps/api/package.json:37` | zero imports; throttling is `@nestjs/throttler` |
| `@aws-sdk/s3-request-presigner` | `apps/api/package.json:30` | zero imports; also drop `pnpm-workspace.yaml:39` |

### A3.3 e A3.4 — removidas desta cópia pública

Duas subseções deste apêndice enumeravam garantias que a documentação do boilerplate
afirma e o código não cumpre, mais dois defeitos no SQL de isolamento. Elas saíram
quando o repositório passou a ser público: são falhas **abertas** de um produto que
terceiros já instalam, e uma lista curada delas — ordenada por severidade, com o que
cada uma deixa acessível — é material de exploração, não de engenharia.

O conteúdo foi preservado fora do repositório e é acompanhado pelos mantenedores. Se
você encontrou algo parecido, use o canal de segurança do boilerplate em vez de abrir
issue pública.

## 4 · Consolidated dependency graph

Read `A → B` as "**A needs B**". `⇒` is hard (A cannot be emitted without B, or without a rewrite);
`→` is soft (A compiles and runs without B; something specific is lost, named in the note).

```
                                    ┌──────────────────────────┐
                                    │  multi-tenancy  (F9)     │  ← everything, always
                                    │  RLS · TenantContext ·   │    NOT REMOVABLE
                                    │  prisma.db · app_role    │    (single-tenant mode instead)
                                    └────────────▲─────────────┘
                                                 │ ⇒ (all)
        ┌──────────────┐   ⇒ invitations   ┌─────┴──────┐   ⇒ plans      ┌──────────┐
        │  platform    │──────────────────▶│ invitations │──── → ───────▶│  plans   │
        │    (F5)      │──── ⇒ plans ──────────────┐ │  │                │   (F7)   │
        │              │──── ⇒ audit ───────┐      │ │  │── → queue      └────▲─────┘
        │              │──── ⇒ provisionTenant     │ │  │── → audit           │ →
        └──────┬───────┘                    │      │ │  └── ⇒ @SystemScope    │ (only writer
               │ ← → (plans' only writer)   │      │ │                        │  is the panel)
               └────────────────────────────┼──────┼─┼────────────────────────┘
                                            ▼      │ │
                                    ┌──────────────┴─┴──┐
                                    │   audit   (F6)    │ ← auth · users · admin · oauth
                                    │  DO NOT REMOVE    │   (5 independent writers, ~30 sites)
                                    └───────────────────┘

   ┌──────────┐  → (2FA diversion, security-critical)   ┌──────────┐
   │  oauth   │───────────────────────────────────────▶ │   2fa    │
   │   (F1)   │  → (reads PUBLIC_SIGNUP_ENABLED)        │   (F3)   │
   │          │──────────────┐                          └────┬─────┘
   │          │  owns User.passwordHash nullability          │ ⇒ forTenant/asPlatform
   └──────────┘              ▼                               ▼  (guard runs before interceptor)
                    ┌─────────────────┐              [multi-tenancy]
                    │ public-signup   │ → plans (isDefault via provisionTenant)
                    │     (F12)       │ ⇒ provisionTenant
                    └─────────────────┘

   ┌──────────┐         ┌──────────┐         ┌──────────┐         ┌──────────────┐
   │ captcha  │ (none)  │  files   │ (none)  │  queue   │ ← auth  │ easter-eggs  │ → i18n
   │  (F11)   │         │   (F4)   │         │  (F10)   │ ← users │    (F13)     │ → dashboard
   │ CLEAN    │         │          │         │ DI-level │ ← invit.│              │ → error filter
   └──────────┘         └──────────┘         └──────────┘         └──────────────┘

   ┌──────────────────────────────────────────────────────────────────────────┐
   │  i18n (F8)  ← 50 web components · 5 API controllers (NEXT_LOCALE cookie) │
   │             ← a SECOND bilingual system in the API (EmailLocale)         │
   │  single-language: OK   ·   no-i18n: DO NOT REMOVE IN V1                  │
   └──────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Edge-by-edge, with evidence

| edge | kind | evidence | what is lost / required |
| --- | --- | --- | --- |
| everything → multi-tenancy | ⇒ | `prisma.db`, `TenantContext`, RLS | not removable |
| platform ⇒ invitations | hard | `platform.module.ts:2,19`; `platform-tenants.service.ts:20,74,196-206,243-254` | `POST /platform/tenants` invites the first admin and creates **no user**; without invitations it must be rewritten (three substitutes, F2(k)) |
| platform ⇒ plans | hard | `platform-plans.controller.ts` + `services/platform-plans.service.ts` (whole files), `platform-tenants.service.ts:169-175,314-330`, `app/platform/plans/page.tsx` | the panel's plan CRUD and `changePlan` |
| platform ⇒ audit | hard | `platform-audit.ts:13-26`, call sites `platform-tenants.service.ts:208,349`, asserted at `spec:408-411,598-606` | the only audit writer whose failure **aborts** the business transaction |
| platform ⇒ provisionTenant | hard | `platform-tenants.service.ts:21,177` | shared with signup, oauth and the seed |
| plans → platform | soft (reverse) | only `Plan` writers are `platform-plans.service.ts:40,53,89-92` + `seed.ts:22-34` | plans without platform = a model only the seed writes; limits still enforce |
| invitations → plans | soft | `invitations.service.ts:223` (courtesy) and `:518-520` (authoritative, inside the user-creating `tx`) | the seat limit; **and, in reverse, `assertCanAddUser` loses its only two callers** |
| invitations → queue | soft | `invitations.service.ts:186-194`, job name `'mail.send'` (`jobs.ts:14`), `jobId: invitation:<sha256>` at `:193` | the `jobId` dedup that stops a retried request mailing twice; no synchronous equivalent |
| invitations → audit | soft | `invitations.service.ts:26` + `writeAudit` at 253, 385, 440, 566 | makes `common/audit/audit.util.ts` a *shared* helper, not a platform one |
| invitations ⇒ @SystemScope + TenantContext.run | hard | `public-invitations.controller.ts:48,57`; `invitations.service.ts:512-520` | accept runs in system scope and hand-passes the resolved tenant |
| oauth → 2fa | soft in code, **required when both are on** | `oauth.service.ts:76-82,228-242,325-332,642-653`; `auth.service.ts:341,653`; `shared/auth.ts:155` | with 2fa off the branch is unreachable and drops out; with 2fa on, **omitting it is a documented security regression** (CLAUDE.md 354-365, 580-581) |
| oauth → public-signup | soft | `oauth.service.ts:119,404-407,430-432,594-596` | the third callback outcome ("identity nobody has") loses its destination; must hard-refuse and delete `/signup/complete` |
| oauth owns `passwordHash?` | inversion | `tenancy.prisma:158-163`; migration `..._invitations_and_oauth:24`; only `null` writer is `oauth.service.ts:474` | **without oauth it should become `String` NOT NULL** — that also deletes `ABSENT_PASSWORD_HASH` + the null branch of `verifyPassword` (`crypto.util.ts:26-62`) and two spec cases (`crypto.util.spec.ts:80-90,104-110`) which otherwise fail to typecheck |
| oauth owns the CSRF exemption + urlencoded parser | seam | `main.ts:18,82-91` | Apple posts `form_post`; removing the module without these two edits leaves a dangling import and silently re-narrows the request surface |
| 2fa ⇒ forTenant/asPlatform | hard | `two-factor-gate.guard.ts:16-22,45-57` | guards run **before** interceptors; reading via `prisma.db` makes the gate **fail open** |
| queue ← auth/users/invitations | DI-level | `auth.service.ts:105`, `users.service.ts:62`, `invitations.service.ts:93` — `@Inject(QUEUE_PROVIDER)` as **required** ctor params; `QueueModule` is `@Global()` | editing two of three gives a *runtime* Nest resolution failure, not a compile error |
| queue: empty job union | **does not compile** | verified against `typescript@6.0.3`: emptying `JobPayloads` makes `JobName`/`JobEnvelope` `never` and `job-router.service.ts:38,54` fail `TS2339` | "queue port with zero jobs" is not emittable — keep `mail.send` or delete the abstraction |
| files → plans | **none** | `Plan.maxStorageMb` is never enforced; `AvatarService` never injects `PlanLimitsService` | independent in both directions |
| files → multi-tenancy | DB only | `avatar.service.ts:19-21` keys objects `avatars/${userId}.webp` — **not** tenant-scoped; only the DB write is RLS-confined | a build that later adds tenant documents must not copy this key scheme |
| captcha → anything | **none** | all five `@RequireCaptcha` sites are in `auth.controller.ts` (57, 80, 94, 174, 191) | textbook clean removal |
| easter-eggs → i18n | soft | `easter-eggs.tsx:4,22` (`easter` namespace), `not-found.tsx:29`, `error.tsx:40` | prune in a consistent order or the parity test fires |
| easter-eggs → the global error filter | seam | `all-exceptions.filter.ts:12,72` + `shared/common.ts:29-30` (`marvin?: string`) | every error response in the system carries it, and the filter's spec asserts it on three statuses |
| i18n ← the API | hidden | `NEXT_LOCALE` read as a raw string at `auth.controller.ts:42`, `oauth.controller.ts:53`, `users.controller.ts:51`, `invitations.controller.ts:47`, `public-invitations.controller.ts:43`; a second `STRINGS` table at `email-templates.ts:13-32` and `invitation-email.ts:23`; `Tenant.locale` → `mailLocale()` (`platform-tenants.service.ts:56-62,253`) | pruning only the web leaves the product emailing the wrong language |
| platform → Role.SUPERADMIN | owns it | `tenant-scope.interceptor.ts:48`, `tenant-status.guard.ts:55`, `profile-permissions.service.ts:69`, `permission.guard.ts:66-68`, `oauth.service.ts:289`, `superadmin.guard.ts:23`, `seed.ts:47` | the enum value does **not** survive platform removal, and `User.tenantId` may then become NOT NULL |
| web: invitations → platform (one file) | accident | `apps/web/src/components/admin/invitations-table.tsx:13` imports `formatDate` from `@/components/platform/format` | the single cross-feature web import; move `format.ts` to `src/lib/` or inline the helper |

---

## 5 · Invalid combinations

The generator must refuse these, or fix them up automatically and say so.

| # | combination | why it is invalid | what to do |
| --- | --- | --- | --- |
| I1 | **platform ON + invitations OFF** | `POST /platform/tenants` creates no user by design — it invites. Without invitations a created company is unreachable. | Refuse in v1. (If ever supported: create the admin with a null hash + mail a password-reset token — which re-couples to the `passwordHash` decision.) |
| I2 | **platform ON + plans OFF** | `/platform/plans`, `plan-form-dialog`, `changePlan`, `platform-tenants.service.ts:169-175,314-330` are plan CRUD. | Refuse, or force plans ON. |
| I3 | **platform ON + audit OFF** | `platform-audit.ts:15-21`: "if the trail cannot be written, the change must not happen either", asserted by two spec cases. | Refuse, or force audit ON (which v1 does anyway). |
| I4 | **audit OFF (the `AuditLog` model)** | 5 independent writers, ~30 call sites, and `users.service.ts:384-401` *returns* audit rows in the LGPD export (`shared/user.ts:136`). | Not offered in v1. Only `common/audit/**` (4 files, incl. dead `actorOf`) and the `'audit'` entry in `permissionModules` are independently removable. |
| I5 | **oauth ON + 2fa ON, without the 2FA diversion** | `TwoFactorGateGuard` only checks that 2FA is *enabled*, never that this session passed it. "Sign in with Google" becomes strictly weaker than typing the password. | Not a config: the generator **must** emit `oauth.service.ts:325-332,228-242`, `AuthService.createLoginTicket`, `LOGIN_TICKET_TTL`, `TWO_FACTOR_TICKET_COOKIE` and `login/page.tsx:87-118` whenever both are on. |
| I6 | **oauth ON + public-signup OFF, leaving the ticket path** | the ticket redirects to `/signup/complete`, which no longer exists → a 404 holding a valid signup ticket. | Auto-fix: hard-refuse unknown identities (`no_account`), delete `signup/complete/page.tsx`, `completeOAuthSignupSchema`, `POST complete-signup` (and its `@SystemScope()`), `signup_disabled`, and `oauthProvidersResponseSchema.signupEnabled`. |
| I7 | **oauth OFF + `passwordHash` left nullable** | compiles fine — that is the hazard. 20 lines of untestable timing-equalisation code that the `functions: 100` floor still demands, and a null nobody stops a future feature from writing. | Auto-fix: `passwordHash String`, drop `ABSENT_PASSWORD_HASH` + the null branch + the two spec cases. |
| I8 | **queue port emitted with zero jobs** | verified compile failure: `TS2339: Property 'name' does not exist on type 'never'` at `job-router.service.ts:38` and `:54`; `enqueue<N extends JobName>` becomes uncallable. | Exactly two legal shapes: keep the port **with `mail.send`**, or delete `core/queue/**` + `infra/queue/**` and inject `MAIL_PROVIDER` in all **three** services (`auth.service.ts:105`, `users.service.ts:62`, `invitations.service.ts:93`) — editing two of three fails at Nest boot, not at compile. |
| I9 | **i18n removed entirely (level ii)** | 50 non-test files call `useTranslations`/`getTranslations`, 9 call `useLocale`, 18 test/story harnesses wrap the provider, 575 lines × 2 languages of copy, the Zod error map, and a second bilingual system in the API. The generator would have to *author the UI*. | Not offered in v1. Offer single-language only (11 files deleted, 12 seam edits, **zero** changes to the 50 call sites). |
| I10 | **multi-tenancy removed** | decision already taken; and the machinery never asks "how many tenants" — only "what is this request's scope". | Not offered. Single-tenant mode: one fixed seeded tenant, UI hidden, RLS byte-identical. |
| I11 | **single-tenant mode + public signup ON** | in single-tenant mode signup *is* company creation. | Auto-fix: force `PUBLIC_SIGNUP_ENABLED=false` **and** `NEXT_PUBLIC_SIGNUP_ENABLED=false` (`.env.example:164` and `:282`) and do not emit `signup.service.ts`. Half-writing the pair gives a form that 403s on every submit. |
| I12 | **single-tenant mode + platform ON**, or **platform OFF + the SUPERADMIN seed kept** | a tenant-less SUPERADMIN can log in, gets `{kind:'platform'}` scope (crosses tenants) and has no UI constraining it. | Drop `seed.ts:15,36-50,101` with the platform feature. If the seed keeps it, keep the panel. |
| I13 | **single-tenant mode with the `tid` JWT claim dropped** | `TenantScopeInterceptor:47-56` computes a `null` scope, skips the transaction, `prisma.db` falls through to the unscoped base client, and under `FORCE ROW LEVEL SECURITY` **every query returns zero rows with no error**. The app looks like an empty database. | Never touch `token.service.ts:111` (`tid: user.tenantId ?? null`). Nor `TenantContext.requireTenantId()`'s throw (`tenant-context.ts:39-47`) — a fixed-id default there is a cross-tenant write the day a second tenant exists. |
| I14 | **`DB_PROVIDER=mysql` or `sqlite` with multi-tenancy** | the whole RLS + restricted-role layer (`rls-*`, `role-*` fragments) is Postgres-only. | Refuse; do not silently degrade the hard guarantee to application-level filtering. |
| I15 | **Redis dropped from compose while bullmq is on, or with more than one API replica** | `ioredis` is shared by `bullmq-queue.adapter.ts:3` **and** `redis-cache.adapter.ts:2`; the throttler rides the **cache** port (`app.module.ts:102`), so rate-limit counters follow `CACHE_DRIVER`. With a memory cache, N replicas give N× the budget on every `@SensitiveThrottle()` route — plus lockout state, refresh rotation, pending-2FA secrets and pending e-mail changes all go per-process. | Allow dropping Redis only behind an explicit "single instance, no horizontal scaling" answer, and never with bullmq. |
| I16 | **files "port without UI" (level iii)** | `avatar.service.ts:16` is the **only** `STORAGE_PROVIDER` injection site; the build ships an unreachable port. | Do not offer this level. Offer "s3 adapter only → local" and "no uploads at all". |
| I17 | **a local-only storage build without static serving** | `@fastify/static` is declared (`package.json:38`) but never imported, so `LOCAL_STORAGE_PUBLIC_URL` points at a route the API does not serve — avatars 404. | If emitting local-only storage, **add** the `@fastify/static` wiring; it is a pre-existing bug, not a generator one. |
| I18 | **easter-eggs OFF with the stock docs** | the joke is in the *explanations*, not appended to them (CLAUDE.md epigraph line 3, the `(Don't Panic.)` at 20, the whole `## Humor` 549-556; README's ASCII banner 1-8, badge 19, paragraphs 323-327 and 621-625) — and the API still e-mails "Don't Panic" to customers (`email-templates.ts:18,27,88`, `invitation-email.ts:28,42,136`). | Ship a sober variant of `CLAUDE.md`/`README.md` (templatised prose, not a delete list) and rewrite the two e-mail templates. Do **not** rename the Hitchhiker test fixtures — `invitation-email.spec.ts:21,35` assert exact subject strings. |
| I19 | **public-signup OFF + invitations OFF + platform OFF** | technically valid, and `db:seed` is then the **only** account-creation path in the entire product. | Allowed, but it must be in the generated README's TL;DR, not a footnote. `auth.e2e-spec.ts` must also be rewritten to seed via `ownerDb()` — it births every account through `POST /auth/signup` at lines 91, 243, 342, 347, 359, 363, 372, 380, 389, 410. |
| I20 | **pruning the `permissions` table while emitting `rls-04`** | that `DO` block is the one RLS fragment with **no `IF EXISTS`** guard → `relation "public.permissions" does not exist`. | Profiles/permissions are core; if ever made optional, add the guard (copy the shape from `app.apply_user_owned_rls()`). |

---

## 6 · Suggested presets

Derived from the hard edges in §4, not from taste. Every preset below is internally consistent
against §5.

| feature | `minimal` | `saas` | `saas-completo` | `interno` |
| --- | --- | --- | --- | --- |
| **multi-tenancy** (F9) | single-tenant | full | full | full |
| **audit** (F6) | on | on | on | on |
| **public-signup** (F12) | off | **on** | **on** | off |
| **invitations** (F2) | off | on | on | on |
| **platform** (F5) | off | on | on | on |
| **plans** (F7) | off | on | on | on |
| **2fa** (F3) | off | on | on | on (`TWO_FACTOR_REQUIRED=true`) |
| **oauth** (F1) | off | off | **on** (all 3) | off |
| **captcha** (F11) | off | on (turnstile) | on (turnstile) | on |
| **files** (F4) | off | on (s3) | on (s3) | on (local) |
| **queue** (F10) | port + memory | bullmq + worker | bullmq + worker | bullmq + worker |
| **i18n** (F8) | single-language | both | both | single-language |
| **easter-eggs** (F13) | off (sober docs) | off (sober docs) | **on** | off (sober docs) |
| **scaffolding** (A3.1) | off | on | on | on |

### Why each one holds together

**`minimal` — an internal tool for one organisation.** Single-tenant forces public-signup off
(I11), which makes the platform panel pointless, which releases **plans** (platform ⇒ plans) and
**invitations** (platform ⇒ invitations) — and with plans gone, invitations-off costs nothing,
because `assertCanAddUser` had no other caller anyway. `audit` stays because it is not removable in
v1 and because an internal tool is exactly where "who did what" matters. Queue collapses to the
port with `mail.send` (I8), which keeps the three `@Inject(QUEUE_PROVIDER)` constructors intact.
Redis may leave `docker-compose.yml` **only** if the user also confirms a single instance (I15).
**The generated README must lead with: run `db:seed` or nobody can log in** (I19) — and
`auth.e2e-spec.ts` has to be reseeded through `ownerDb()`.

**`saas` — the default, and the one most people want.** Everything that pays rent, minus the two
things that cost a third-party console on day one. `platform` pulls `plans`, `invitations` and
`audit` in with it (all three hard edges), so this is the *cheapest* preset that includes the
operator panel at all — you cannot have a bit of it. `oauth` is off, which is worth a whole
paragraph of saved complexity: `passwordHash` goes back to `NOT NULL` (I7), `main.ts` keeps its
plain CSRF hook and answers 415 to urlencoded again, `validateEnv` loses 34 lines of boot checks,
and the 2FA ticket cookie disappears from `packages/shared`. Captcha on, because `saas` means a
public signup form exists.

**`saas-completo` — the whole boilerplate, as shipped.** Adds `oauth` (which obliges the 2FA
diversion, I5) and the easter eggs. The extra operational burden is real and should be stated at
generation time: three provider consoles, `OAUTH_CALLBACK_BASE_URL` matching character for
character, and `NEXT_PUBLIC_OAUTH_PROVIDERS` agreeing with `OAUTH_PROVIDERS` or the extra button
404s. `validateEnv` fails the boot on any half-configuration, which is the point.

**`interno` — multi-tenant but sales-led: no self-service signup.** The interesting preset,
because it is the one the invitation rework was built for. Multi-tenancy stays **full** (you have
many customer companies), but the only doors are the operator panel and invitations:
`POST /platform/tenants` creates the company and invites its first admin, that admin invites the
rest. Public signup off, so `signup.service.ts`, `/signup` and the `auth.signup.*` i18n block go —
**except** `auth.signup.acceptTerms` / `.acceptTermsRequired` (both locale files, lines 54-55),
which `apps/web/src/app/invite/[token]/page.tsx:61,253,257` renders. Captcha stays on because
`login` and `forgot-password` are still public forms. `TWO_FACTOR_REQUIRED=true` is the natural
default here. Storage local rather than S3 suits an on-prem deploy — which means the
`@fastify/static` wiring must be added (I17).

### Generator implementation order

The order matters, because several steps feed the next:

1. **Resolve the feature set** against §5. Auto-fix I6, I7, I11, I12; refuse I1-I4, I9, I10, I14.
2. **Prune the Prisma schema** — models, enums, fields, and *every* back-relation (Prisma refuses to
   validate a relation field whose target model is gone).
3. **Generate the baseline** with `prisma migrate diff --from-empty`, then splice the MANUAL
   fragments in the order fixed in **A2 §3**, with the sweep call **last**.
4. **Prune `packages/shared`** and rebuild it — `apps/api` and `apps/web` both compile against
   `dist/`, so this must happen before either app is type-checked.
5. **Prune the API**: exclusive files → `app.module.ts` imports and guards → module files →
   controllers → services → DTOs → `env.ts` + `validateEnv` → `env.spec.ts` → `seed.ts`.
6. **Recompute `system-scope.decorator.spec.ts:48-73`** from the surviving `@SystemScope()` sites
   (rule 2 in §0). Never copy the literal array.
7. **Prune the web**: routes → components → nav → `proxy.ts` prefixes → `lib/` → hooks →
   `vitest.config.mts` `include` lines.
8. **Prune both locale files in lockstep** (rule 1 in §0), then delete `messages.test.ts` if only
   one catalogue survives.
9. **Prune the docs** — `CLAUDE.md` sections and individual "O que NÃO fazer" bullets (§1 table),
   `README.md` PT *and* EN halves, and swap in the sober variant if easter-eggs is off.
10. **Prune dependencies** (`package.json` × 4, plus `pnpm-workspace.yaml` `overrides` /
    `allowBuilds` / `onlyBuiltDependencies` / `minimumReleaseAgeExclude`), and drop the A3.2
    already-dead ones unconditionally. Respect the deliberate locks in `CLAUDE.md:505-513`.
11. **Prune `docker-compose.yml`** — MinIO with S3, Redis only under I15.
12. **Re-measure coverage thresholds** in `apps/api/jest.config.js:47-54` and
    `apps/web/vitest.config.mts:47-52` (rule 3 in §0). `functions: 100` is the brittle one.
13. **Run the generated project's own gates**: `pnpm build`, `pnpm lint`, `pnpm typecheck`,
    `pnpm test`, `pnpm test:e2e`. The e2e suite is the only thing that proves the baseline SQL, the
    restricted role and the RLS policies actually landed.
