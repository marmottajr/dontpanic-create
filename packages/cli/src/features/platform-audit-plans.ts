/**
 * Fragmento do manifesto: `platform`, `audit` e `plans`.
 *
 * Transcrição fiel de `docs/maps/feature-surface.md` — F5 (linhas 1804-2293),
 * F6 (2294-2482) e F7 (2483-2686), mais as quatro regras globais (19-66) e a
 * tabela de fragmentos SQL (4967-4990). Nada aqui é projeto novo: cada costura
 * abaixo cita a linha do mapa que a justifica.
 *
 * Todos os padrões são ÂNCORAS regex, nunca string literal com indentação:
 * o template é sincronizado de um repo vivo e precisa sobreviver a reformatação
 * (`prettier`, refactor de nome, quebra de linha). Ver docs/decisions/0001.
 */

import type { FeatureManifest } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// F5 · platform — o painel do SUPERADMIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `platform` é REMOÇÃO COM COSTURAS (mapa 168).
 *
 * Duas consequências que não são óbvias e estão codificadas abaixo:
 *
 * 1. **`Role.SUPERADMIN` não sobrevive.** O valor existe para um único
 *    propósito — marcar o operador — e depois da remoção TODO leitor dele
 *    desaparece: `tenant-scope.interceptor.ts:48`, `tenant-status.guard.ts:55`,
 *    `profile-permissions.service.ts:69`, `oauth.service.ts:289`,
 *    `superadmin.guard.ts:23`, `platform-api.ts:78` e `seed.ts:47`
 *    (mapa, F5 (c), linha 1929). Deixar o valor no enum seria um estado que
 *    nenhum código sabe produzir nem tratar.
 * 2. **`User.tenantId` pode virar NOT NULL.** A nulidade tem exatamente uma
 *    razão documentada (`tenancy.prisma:150`, "Null only for SUPERADMIN"), e o
 *    lado do Postgres concorda: a nota final da migration de RLS (linhas
 *    142-143) diz que a unicidade GLOBAL de `User.email` é o que dispensa um
 *    índice parcial para o SUPERADMIN, ou seja nenhum artefato de RLS depende
 *    de `tenantId` nulo; `app.tenant_visible()` já trata NULL defensivamente
 *    (`row_tenant_id IS NOT NULL AND …`), então apertar a coluna só estreita o
 *    predicado (mapa, F5 (c), linha 1930). **Mas** os ramos fail-closed da
 *    aplicação ficam de pé de propósito: `tenant-scope.interceptor.ts:50-54` e
 *    `tenant-status.guard.ts:57-60` continuam existindo, porque `AuthUser` vem
 *    de um JWT e não do banco — a coluna NOT NULL não garante que o claim veio.
 *
 * `requires` é hard: o painel importa `InvitationsService`, `PlanLimitsService`
 * (via os controllers de plano) e `writePlatformAudit` — ver (k), linhas
 * 2278-2285, e as precondições I1-I3 no topo do dossiê (linhas 1806-1812).
 */
export const platformManifest: FeatureManifest = {
  id: 'platform',
  label: 'Painel da plataforma (SUPERADMIN)',
  summary:
    'Back-office do operador em /platform: estatísticas, CRUD de empresas e de planos, suspender/reativar/estender trial.',

  /**
   * (k) do mapa, linhas 2278-2285:
   * - `plans`: `platform-plans.controller.ts` + `platform-plans.service.ts` são
   *   CRUD de plano inteiros, e `platform-tenants.service.ts:169-175, 314-330`
   *   valida/troca `planId`. Dependência dura (precondição I1, linha 1808).
   * - `audit`: `platform-tenants.service.ts:23,208,349` → `writePlatformAudit`,
   *   e `platform-audit.ts:26` é o ÚNICO escritor de auditoria do repo cuja
   *   falha aborta a transação de negócio (precondição I3, linha 1812).
   * - `invitations`: `platform.module.ts:19` importa `InvitationsModule` e
   *   `POST /platform/tenants` NÃO cria usuário — ele convida
   *   (`platform-tenants.service.ts:196-206`).
   */
  // `multiTenant` acrescentado na integração: o painel atravessa empresas e em
  // single-tenant existe uma só (I12, mapa 5233; F9 em 3040). É a ÚNICA das quatro
  // arestas que o `validateRecipe` do recipe.ts já valida hoje — as outras três são
  // divergência conhecida, registrada no teste de coerência.
  requires: ['multiTenant', 'invitations', 'plans', 'audit'],

  deletePaths: [
    // (a) linhas 1816-1833: a árvore inteira, 16 arquivos. Verificado no mapa:
    // nada fora dela importa de lá além de `app.module.ts:33`.
    'apps/api/src/modules/platform/**',

    // (a) linhas 1838-1841: as três rotas do App Router + o layout próprio.
    'apps/web/src/app/platform/**',

    // (a) linhas 1841-1858: os componentes, ARQUIVO POR ARQUIVO e não por glob.
    // `components/platform/format.ts` (+ seu teste) é o único import
    // cross-feature da web (`admin/invitations-table.tsx:13` usa `formatDate`,
    // mapa linha 1862) e por isso FICA — o gerador só subtrai, não sabe criar
    // `src/lib/format.ts` para repontar o import. Consequência aceita: a linha
    // `'src/components/platform/**'` do `include` de cobertura do vitest
    // (`vitest.config.mts:32`) também fica, e continua resolvendo — para
    // `format.ts`, que tem 100% de cobertura pelo próprio `format.test.ts`.
    'apps/web/src/components/platform/change-plan-dialog.tsx',
    'apps/web/src/components/platform/create-tenant-dialog.tsx',
    'apps/web/src/components/platform/create-tenant-dialog.test.tsx',
    'apps/web/src/components/platform/dialogs.test.tsx',
    'apps/web/src/components/platform/extend-trial-dialog.tsx',
    'apps/web/src/components/platform/plan-form-dialog.tsx',
    'apps/web/src/components/platform/plan-form-dialog.test.tsx',
    'apps/web/src/components/platform/platform-api.ts',
    'apps/web/src/components/platform/platform-api.test.tsx',
    'apps/web/src/components/platform/signups-chart.tsx',
    'apps/web/src/components/platform/signups-chart.test.tsx',
    'apps/web/src/components/platform/stat-card.tsx',
    'apps/web/src/components/platform/stat-card.test.tsx',
    'apps/web/src/components/platform/suspend-tenant-dialog.tsx',
    'apps/web/src/components/platform/tenant-status-badge.tsx',
    'apps/web/src/components/platform/tenant-status-badge.test.tsx',
    'apps/web/src/components/platform/tenants-table.tsx',
    'apps/web/src/components/platform/tenants-table.test.tsx',

    // NÃO deletado, decisão registrada: `apps/web/src/components/charts/**`
    // (`bar-chart.tsx` + teste) fica órfão — `signups-chart.tsx:4` era seu único
    // importador (mapa linha 1863). O mapa deixa a escolha para o gerador;
    // mantemos, porque é SVG escrito à mão com teste próprio (vira componente
    // de amostra, coerente com a feature `scaffolding`) e porque deletá-lo
    // obrigaria a mexer também no `include` de cobertura do vitest (linha 29).
  ],

  prisma: {
    // Nenhum model é exclusivo do platform (mapa linha 1932): o painel só LÊ
    // `tenants` / `plans` / `users`.
    dropFields: [
      // (c) do dossiê de `plans`, linhas 2570-2572: estes três campos são
      // PLATFORM-owned, não plan-owned. Único escritor:
      // `platform-tenants.service.ts` (suspend/reactivate/cancel); único leitor:
      // `platformTenantDtoSchema` (`shared/tenant.ts:211`). Com o painel fora,
      // ninguém escreve nem lê — ficam órfãos.
      // `Tenant.status`, `Tenant.trialEndsAt` e `@@index([status])` NÃO entram
      // aqui: são lidos pelo `TenantStatusGuard` a cada request.
      { model: 'Tenant', fields: ['suspendedAt', 'suspendedReason', 'canceledAt'] },
    ],
    tighten: [
      // Ver o doc-comment do manifesto: `SUPERADMIN` era a única razão
      // documentada da nulidade (`tenancy.prisma:150`), e a nota da migration de
      // RLS (142-143) confirma que nenhum artefato de isolamento depende dela.
      { model: 'User', field: 'tenantId', to: 'required' },
      // `OAuthAccount.tenantId` "segue `User.tenantId`" (mapa linha 1931), mas
      // DELIBERADAMENTE não entra: o model só existe quando `oauth` está ligado,
      // e `tighten` não tem como ser condicional. Nullable ali é inócuo — a
      // coluna existe apenas para o sweep do `app.apply_tenant_rls()` achar a
      // tabela, e o predicado já trata NULL.
    ],
  },

  seams: [
    // ─── specs de NÚCLEO que afirmam comportamento de SUPERADMIN ─────────────────
    //
    // `Role.SUPERADMIN` e o escopo `{ kind: 'platform' }` saem com esta feature, e nove
    // specs de arquivos que SOBREVIVEM os mencionam. Não é cosmético: os dois deixam de
    // existir nos TIPOS, então os arquivos não compilam sob ts-jest. E essa falha não
    // aparece no `pnpm typecheck` do projeto gerado — o tsconfig de build exclui
    // `*.spec.ts` —, só em `pnpm test`. Foi a última classe de erro a aparecer.
    {
      file: 'apps/api/src/modules/auth/guards/tenant-status.guard.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('lets the SUPERADMIN through", end: '\\}\\);' },
      reason:
        'O teste afirma que o operador de plataforma atravessa o guard sem empresa. Sem o papel, `authed({ role: \'SUPERADMIN\' })` não tipa.',
    },
    {
      file: 'apps/api/src/modules/auth/guards/permission.guard.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('refuses the SUPERADMIN", end: '\\}\\);' },
      reason:
        'O teste que prova a decisão "SUPERADMIN não passa em rota de negócio". Some com o papel — e a decisão que ele documentava deixa de existir junto, o que é coerente: sem painel não há operador de plataforma.',
    },
    {
      file: 'apps/api/src/modules/auth/services/profile-permissions.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('marks the SUPERADMIN as platform operator", end: '\\}\\);' },
      reason:
        'O teste do `platformOperator: true`. O campo sai do contrato resolvido com a feature.',
    },
    {
      file: 'apps/api/src/modules/auth/services/profile-permissions.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*platformOperator:',
      reason:
        'A propriedade `platformOperator` nas asserções `toEqual` dos testes que SOBREVIVEM (o de "grants nothing when there is no authenticated user"). Um `toEqual` com chave a mais falha em runtime, não em tipo.',
    },
    {
      file: 'apps/api/src/infra/prisma/prisma.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('declares the platform scope for a SUPERADMIN", end: '\\}\\);' },
      reason:
        'O teste de `asPlatform()`, método que sai com a feature. É o escopo que atravessa empresas; sem painel não há quem o abra.',
    },
    {
      file: 'apps/api/src/infra/tenancy/tenant-context.spec.ts',
      kind: 'replace',
      pattern: "kind: 'platform'",
      replacement: "kind: 'system'",
      reason:
        'Dois testes usam `{ kind: \'platform\' }` como escopo QUALQUER, para provar que o contexto é limpo ao fim do `run`. Trocar por `system` preserva exatamente o que eles verificam em vez de apagá-los — o comportamento testado não tem nada a ver com plataforma.',
    },
    {
      file: 'apps/api/src/infra/tenancy/tenant-scope.interceptor.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('opens the platform scope for a SUPERADMIN", end: '\\}\\);' },
      reason:
        'Os DOIS testes que abrem escopo de plataforma para o SUPERADMIN (com e sem tenant no token). O `dropBlock` itera, então o par sai numa costura só.',
    },
    {
      file: 'apps/api/src/infra/queue/bullmq-queue.adapter.spec.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*\\['platform', \\{ kind: 'platform' \\}\\],",
      required: false,
      reason:
        'A entrada `platform` da tabela `it.each<[string, TenantScope]>` que prova que só um escopo de tenant contribui id. A entrada `system` FICA e continua provando a regra. Elemento completo numa linha, então remover por linha é seguro. `required: false`: o adapter só existe com bullmq.',
    },
    {
      file: 'apps/api/src/infra/queue/memory-queue.adapter.spec.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*\\['platform', \\{ kind: 'platform' \\}\\],",
      reason:
        'Idem no adapter de memória, que existe em qualquer configuração de fila.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*suspended(At|Reason):|^\\s*canceledAt:',
      required: false,
      reason:
        'A escrituração de suspensão (`suspendedAt`, `suspendedReason`, `canceledAt`) sai do model com o painel — é ele quem suspende e reativa. As linhas são propriedades completas da fixture.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('never leaks the internal suspension bookkeeping", end: '\\}\\);' },
      required: false,
      reason:
        'O teste existe para provar que a escrituração de suspensão não vaza no DTO; sem os campos não há o que não vazar.',
    },
    // ── app.module.ts — a maior costura do repo (mapa linhas 89-96) ──────────
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: "\\./modules/platform/platform\\.module",
      reason:
        'Mapa F5 (b) linha 1871: sem remover o import o `nest build` falha com módulo inexistente; casado pelo especificador e não pelo nome da classe porque o import pode ser reordenado.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*PlatformModule,\\s*$",
      reason:
        'Mapa F5 (b) linha 1872: a entrada no array `imports` do @Module (linha 121 do repo). Casado como linha inteira e sozinha para não atingir o import, que a costura anterior já removeu.',
    },

    // ── PrismaService — o escopo `platform` do Postgres ──────────────────────
    {
      file: 'apps/api/src/infra/prisma/prisma.service.ts',
      kind: 'dropBlock',
      block: {
        start: "case 'platform':",
        end: "break;",
      },
      reason:
        "Mapa F5 (b) linha 1873: o `SET LOCAL app.platform_admin` dentro de `withScope`. Sai junto com o membro 'platform' de `TenantScope`, senão o switch fica com um case cujo tipo o TS já não admite.",
    },
    {
      file: 'apps/api/src/infra/prisma/prisma.service.ts',
      kind: 'dropBlock',
      block: {
        start: "/\\*\\*\\s*Crosses tenants\\.",
        end: "return this\\.withScope\\(\\{\\s*kind: 'platform'\\s*\\}, fn\\);\\s*\\}",
      },
      reason:
        'Mapa F5 (b) linha 1874: o método `asPlatform()` inteiro, com seu doc. ORDEM IMPORTA — só pode sair depois da costura em `two-factor-gate.guard.ts:45-53`, que é o único chamador de produção fora de `modules/platform/` (mapa linhas 2273-2277).',
    },
    // NÃO mexer em `assertNotSuperuser()` (prisma.service.ts:37-64): mapa linha
    // 1875 é explícito — é sobre a ROLE do Postgres (`rolsuper`/`rolbypassrls`),
    // não sobre `Role.SUPERADMIN`. Removê-la desligaria todo o RLS em silêncio.

    // ── TenantContext — a união de escopos ──────────────────────────────────
    {
      file: 'apps/api/src/infra/tenancy/tenant-context.ts',
      kind: 'replace',
      pattern: "\\|\\s*\\{\\s*kind: 'platform'\\s*\\}",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1877: `TenantScope` perde o membro `platform`. É isto que transforma qualquer resquício de escopo de plataforma em erro de compilação em vez de código morto silencioso.',
    },
    {
      file: 'apps/api/src/infra/tenancy/tenant-context.ts',
      kind: 'dropLinesMatching',
      pattern: "\\*\\s*-\\s*`platform`\\s*—\\s*SUPERADMIN",
      reason:
        'Mapa F5 (b) linha 1876: a linha de doc que descreve o escopo removido. Doc que descreve escopo inexistente é o que faz o próximo leitor procurar código que não existe.',
    },

    // ── TenantScopeInterceptor — de onde o escopo nasce ─────────────────────
    {
      file: 'apps/api/src/infra/tenancy/tenant-scope.interceptor.ts',
      kind: 'replace',
      pattern: "user\\.role === 'SUPERADMIN'\\s*\\?\\s*\\{\\s*kind: 'platform'\\s*\\}\\s*:\\s*",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1879: o ternário colapsa para `user.tenantId ? { kind: tenant } : null`. O ramo `null` e seu comentário (52-54) FICAM VERBATIM — a regra "usuário sem tenant não recebe escopo nenhum" deixa de ser sobre SUPERADMIN e passa a valer para todo mundo, que é o fail-closed que o RLS depende.',
    },

    // ── PermissionGuard — "o SUPERADMIN não passa em rota de negócio" ───────
    {
      file: 'apps/api/src/modules/auth/guards/permission.guard.ts',
      kind: 'replace',
      pattern: "if \\(resolved\\.platformOperator\\) \\{[\\s\\S]*?\\}\\s*",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1882: esta era A aplicação da regra "operador de plataforma não lê dados de empresa". Sai junto com `ResolvedPermissions.platformOperator`; deixar o `if` sem o campo é erro de tipo, deixar o campo sem o `if` é uma flag que ninguém checa.',
    },
    {
      file: 'apps/api/src/modules/auth/guards/permission.guard.ts',
      kind: 'replace',
      pattern:
        " \\* - \\*\\*The SUPERADMIN does not pass\\.\\*\\*[\\s\\S]*?`/api/platform/\\*`\\.\\n",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1881: o bullet de doc das "três decisões". Os outros dois (ADMIN passa sempre / sem perfil nada) ficam — eles descrevem mecanismos que sobrevivem.',
    },

    // ── TenantStatusGuard ───────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/auth/guards/tenant-status.guard.ts',
      kind: 'dropLinesMatching',
      pattern: "if \\(user\\.role === 'SUPERADMIN'\\) return true;",
      reason:
        'Mapa F5 (b) linha 1885: com o atalho fora, o `throw` de "conta sem empresa" (58-60) passa a ser o caminho de qualquer usuário sem tenant — correto, e ainda mais correto depois que `User.tenantId` vira NOT NULL.',
    },
    {
      file: 'apps/api/src/modules/auth/guards/tenant-status.guard.ts',
      kind: 'replace',
      pattern: "\\s*and so does the SUPERADMIN[\\s\\S]*?belong to no company\\.",
      replacement: '.',
      reason:
        'Mapa F5 (b) linha 1884: a frase de doc que explica um atalho que já não existe. O resto do doc (roda depois do JwtAuthGuard, lê em escopo do próprio tenant) descreve mecanismo que fica.',
    },

    // ── TwoFactorGateGuard — o único chamador de asPlatform fora do módulo ──
    {
      file: 'apps/api/src/modules/auth/guards/two-factor-gate.guard.ts',
      kind: 'replace',
      pattern:
        "// A SUPERADMIN has no tenant[\\s\\S]*?this\\.prisma\\.asPlatform\\(read\\)\\);",
      replacement:
        "if (!tenantId) throw new ForbiddenException('two_factor_setup_required');\n    const dbUser = await this.prisma.forTenant(tenantId, read);",
      reason:
        'Mapa F5 (b) linha 1887 e (k) linhas 2273-2277: é o ÚNICO `asPlatform()` de produção fora de `modules/platform/`. O `if (!tenantId)` explícito entra porque `AuthUser.tenantId` continua opcional (vem de um claim de JWT, não do banco) — e este guard é justamente o que já virou no-op silencioso uma vez por ler sem escopo: falhar fechado é obrigatório, não estilo.',
    },

    // ── ProfilePermissionsService ────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/auth/services/profile-permissions.service.ts',
      kind: 'replace',
      pattern: "/\\*\\* Platform operator[\\s\\S]*?platformOperator: boolean;\\s*",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1891: o campo sai de `ResolvedPermissions`. Remover o campo é o que faz o compilador apontar cada lugar que ainda o preenche, em vez de deixar uma flag sempre `false`.',
    },
    {
      file: 'apps/api/src/modules/auth/services/profile-permissions.service.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*platformOperator: false,\\s*$",
      reason:
        'Mapa F5 (b) linhas 1892 e 1894: as duas atribuições (`EMPTY` e o retorno do perfil resolvido) somem juntas com o campo — um padrão só, porque `dropLinesMatching` apaga toda linha que casa.',
    },
    {
      file: 'apps/api/src/modules/auth/services/profile-permissions.service.ts',
      kind: 'dropLinesMatching',
      pattern: "user\\.role === 'SUPERADMIN'",
      reason:
        'Mapa F5 (b) linha 1893: o early-return que marcava o operador. Com ele fora, um usuário com role inexistente cai no caminho normal e termina em `EMPTY` — fail-closed.',
    },

    // ── OAuth — só existe quando `oauth` está ligado ─────────────────────────
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'replace',
      pattern: "user\\.deletedAt \\|\\| user\\.role === 'SUPERADMIN'",
      replacement: 'user.deletedAt',
      reason:
        'Mapa F5 (b) linha 1896: a recusa de ressuscitar SUPERADMIN por botão social perde o referente. `required: false` porque o arquivo inteiro só existe quando a feature `oauth` está instalada — ausência aqui é configuração, não defeito.',
      required: false,
    },

    // ── packages/shared ─────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/user.ts',
      kind: 'replace',
      pattern: "z\\.enum\\(\\[\\s*'SUPERADMIN',\\s*'ADMIN',\\s*'USER'\\s*\\]\\)",
      replacement: "z.enum(['ADMIN', 'USER'])",
      reason:
        'Mapa F5 (d) linha 1948: `RoleEnum` é a fronteira de contrato (Zod em `@dontpanic/shared`). Tem de casar com o `enum Role` do Prisma, senão a API aceita por validação um valor que o banco recusa.',
    },
    {
      file: 'packages/shared/src/user.ts',
      kind: 'replace',
      pattern:
        " \\* Platform-level role\\. SUPERADMIN[\\s\\S]*?decided by the profile permissions\\.",
      replacement:
        ' * Role inside a tenant; fine-grained access is decided by the profile\n * permissions.',
      reason:
        'Mapa F5 (d) linha 1947: o doc descrevia um papel que já não existe. Reescrito em vez de apagado porque o restante da frase (perfil decide o fino) continua verdadeiro.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const suspendTenantSchema",
        end: "export type ExtendTrialInput = z\\.infer<typeof extendTrialSchema>;",
      },
      reason:
        'Mapa F5 (d) linha 1945: `suspendTenantSchema` e `extendTrialSchema` são entradas exclusivas do painel. `changePlanSchema` (logo abaixo) NÃO entra neste bloco — é `plans` que o remove, e os dois blocos não se sobrepõem de propósito.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "//\\s*──+\\s*Platform operator panel",
        end: "export type PlatformCreateTenantResponse = z\\.infer<typeof platformCreateTenantResponseSchema>;",
      },
      reason:
        'Mapa F5 (d) linhas 1939-1944: o banner + `platformTenantListQuerySchema`, `platformTenantDtoSchema`, `platformCreateTenantSchema` e a resposta. Um bloco só, do banner ao fim, para não deixar tipo exportado sem schema (o `index.ts` é barrel de `export *`, então nada lá precisa mudar — mapa linha 1952).',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const platformStatsDtoSchema",
        end: "export type PlatformStatsDto = z\\.infer<typeof platformStatsDtoSchema>;",
      },
      reason:
        'Mapa F5 (d) linha 1944: o DTO da primeira página do painel. Separado do bloco anterior porque `upsertPlanSchema` (propriedade de `plans`) fica entre os dois no arquivo.',
    },
    {
      file: 'packages/shared/src/oauth.ts',
      kind: 'replace',
      pattern: "\\(deleted, or a SUPERADMIN\\)",
      replacement: '(deleted)',
      reason:
        'Mapa F5 (d) linha 1950: doc que cita um papel removido. `required: false` porque o arquivo só existe com `oauth` instalado.',
      required: false,
    },

    // ── Prisma schema: o valor do enum e os docs da nulidade ────────────────
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropLinesMatching',
      pattern: "^\\s*SUPERADMIN\\s*$",
      reason:
        'Mapa F5 (c) linha 1929: `enum Role` passa a `{ ADMIN, USER }`. Padrão ancorado em linha SOZINHA para não atingir as linhas de doc acima do enum, que citam a palavra em prosa. Ver também `sqlFragments` — na baseline isto colapsa no `CREATE TYPE "Role"`, então não há `ALTER TYPE` a remover.',
    },
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'replace',
      pattern: "///\\s*Platform-level role\\. SUPERADMIN[\\s\\S]*?lives in Profile/Permission\\.",
      replacement: '/// Role inside a tenant; fine-grained access lives in Profile/Permission.',
      reason:
        'Mapa F5 (c) linha 1929: o doc do `enum Role` descrevia o operador. Reescrito porque a segunda metade (perfil decide o fino) continua válida.',
    },
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropLinesMatching',
      pattern: "///\\s*Null only for SUPERADMIN",
      reason:
        'Mapa F5 (c) linha 1930: era a ÚNICA razão documentada da nulidade de `User.tenantId`. Sai junto com o `tighten` — doc que explica uma nulidade que já não existe é o que faz alguém reverter o aperto.',
    },
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropLinesMatching',
      pattern: "@@index\\(\\[planId\\]\\)",
      reason:
        'Índice órfão de `Tenant.planId`, que sai com `plans`. Repetido aqui como rede: `platform requires plans`, então quando `platform` sai `plans` pode ficar — e neste caso o índice PERMANECE necessário. Marcado `required: false` justamente por isso.',
      required: false,
    },
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropLinesMatching',
      pattern: "///\\s*Recorded by the platform operator when suspending",
      reason:
        'Doc de `Tenant.suspendedReason`, campo que `prisma.dropFields` remove acima (mapa, dossiê de plans, linha 2571). O doc está na linha anterior ao campo e não é varrido pelo `dropFields`.',
    },

    // ── Testes e helpers ────────────────────────────────────────────────────
    {
      file: 'apps/api/test/prisma-mock.ts',
      kind: 'dropLinesMatching',
      pattern: "asPlatform",
      reason:
        'Mapa F5 (b) linhas 1904-1906: as três linhas (doc, campo da interface do mock, atribuição do `jest.fn`) casam com o mesmo padrão. Deixar o mock com um helper que o `PrismaService` já não tem é uma assinatura de mock divergindo do real — exatamente o tipo de teste que passa mentindo.',
    },

    // ── Seed ────────────────────────────────────────────────────────────────
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: "Seeding writes across tenants and creates the platform operator, so it needs",
      replacement: 'Seeding writes across tenants, so it needs',
      reason:
        'Mapa F5 (g) linha 1997: só a oração do operador sai. A conexão de OWNER continua obrigatória (escrita cross-tenant sob RLS), então o resto do comentário fica — apagá-lo convidaria alguém a apontar o seed para a role restrita.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropLinesMatching',
      pattern: "const SUPERADMIN_EMAIL",
      reason: 'Mapa F5 (g) linha 1998: a constante do e-mail do operador.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropBlock',
      block: {
        start: "//\\s*The platform operator\\. Belongs to no company",
        end: "role: 'SUPERADMIN',[\\s\\S]*?\\}\\);",
      },
      reason:
        'Mapa F5 (g) linha 1999: o `prisma.user.upsert` que cria o operador, com seu comentário de 4 linhas. O bloco fecha no `});` depois de `role: SUPERADMIN` para não engolir o upsert da empresa demo, que vem logo abaixo e FICA.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropLinesMatching',
      pattern: "console\\.log\\(`🌱 Seeded platform operator",
      reason:
        'Mapa F5 (g) linha 2000: o log de credencial semeada. Anunciar uma conta que não foi criada faz o primeiro login do usuário falhar sem explicação.',
    },

    // ── SQL manual: rls-01 é o único lugar do RLS que fala de plataforma ────
    {
      file: 'apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql',
      kind: 'dropBlock',
      block: {
        start: "CREATE OR REPLACE FUNCTION app\\.is_platform_admin\\(\\)",
        end: "\\$\\$;",
      },
      reason:
        'Mapa F5 (j) linhas 2077-2081: `app.is_platform_admin()` é o ÚNICO SQL específico de plataforma em toda a camada de RLS. `app.current_tenant_id()` e `app.is_system()` pertencem a tenancy/auth e ficam. ATENÇÃO: a §4 do mapa (linha 4976) diz que `platform` não possui fragmento SQL nenhum e atribui `rls-01` a `multi-tenancy` — contradição registrada no relatório; esta costura existe para o caso de o gerador emitir o arquivo de migration como está.',
    },
    {
      file: 'apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql',
      kind: 'replace',
      pattern: "SELECT app\\.is_platform_admin\\(\\)\\s*\\n\\s*OR ",
      replacement: 'SELECT ',
      reason:
        'Mapa F5 (j) linha 2078: o disjunto de plataforma sai de `app.tenant_visible`, deixando `SELECT app.is_system() OR (row_tenant_id IS NOT NULL AND …)`. Remover a função sem remover o disjunto quebra TODA política de RLS (função inexistente) — as duas costuras são indivisíveis.',
    },
    {
      file: 'apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql',
      kind: 'replace',
      pattern: "no\\n-- extra partial index is needed for the SUPERADMIN, who belongs to no tenant\\.",
      replacement: 'no\n-- extra partial index is needed per tenant.',
      reason:
        'Mapa F5 (j) linhas 2101-2106: a nota de fechamento é a justificativa citada em (c) para `User.tenantId` poder virar NOT NULL. A propriedade que ela afirma (e-mail único GLOBALMENTE) sobrevive; só o referente SUPERADMIN sai.',
    },

    // ── i18n: regra global 1 do mapa (linhas 40-45) — ou os dois, ou nenhum ──
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform',
      reason:
        'Mapa F5 (e) linhas 1870-1881 do bloco i18n: o namespace `platform` inteiro (399-563). `nav.admin` e `tenant.*` FICAM — são a tela `/admin` da empresa e o `TrialBanner`, não o painel.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform',
      reason:
        'Par obrigatório do anterior: `apps/web/src/i18n/messages.test.ts:18-25` compara chave por chave os dois arquivos e nomeia as órfãs. Editar só um lado dá suíte vermelha num clone novo, que é o que treina o usuário a apagar a asserção e destruir o guard (regra global 1, mapa linhas 40-45).',
    },

    // ── invitations: a exportação que perde o único importador ──────────────
    {
      file: 'apps/api/src/modules/invitations/invitations.module.ts',
      kind: 'replace',
      pattern: "exports:\\s*\\[\\s*InvitationsService\\s*\\]",
      replacement: 'exports: []',
      reason:
        'Mapa F5 (b) linha 1902: `platform` era o ÚNICO consumidor externo de `InvitationsService` (verificado por grep no mapa). `required: false` porque o arquivo só existe com `invitations` instalado — e mesmo que exista, um export sem importador é apenas ruído, não quebra.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.controller.ts',
      kind: 'replace',
      pattern: "\\s*//[^\\n]*SUPERADMIN is deliberately not in that list[\\s\\S]*?own door\\.",
      replacement: '',
      reason:
        'Mapa F5 (b) linha 1901: comentário que explica por que o SUPERADMIN está fora da lista de papéis convidáveis — sem o papel, a explicação aponta para o nada. `required: false`: só existe com `invitations`.',
      required: false,
    },

    // ── CLAUDE.md: podas POR BULLET, não por seção ──────────────────────────
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: "\\|\\s*`platform`\\s*\\|[^\\n]*atravessa empresas",
      reason:
        'Mapa F5 (h) linha 2008: a linha `platform` da tabela de escopos, dentro de "Multi-tenancy". A SEÇÃO NÃO SAI — `tenant`, `system`, RLS, `DATABASE_URL` e `@SystemScope()` não são do painel (mapa linha 2012). Por isso é seam e não `docSections`.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: "\\s*\\(ou `asPlatform` para o SUPERADMIN\\)",
      replacement: '',
      reason:
        'Mapa F5 (h) linha 2009: o parêntese dentro do bullet "Guard que lê o banco tem que abrir escopo próprio". O bullet FICA inteiro — é a lição do `TwoFactorGateGuard` que virou no-op, e ela vale mais depois da remoção, não menos.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: "-\\s*\\*\\*SUPERADMIN não passa\\*\\*[\\s\\S]*?empresa\\.\\n",
      replacement: '',
      reason:
        'Mapa F5 (h) linha 2010: o bullet inteiro de "Permissões". Os vizinhos (ADMIN passa sempre / sem perfil, nada) ficam. Um CLAUDE.md gerado que avisa sobre um papel que o projeto não tem ensina o agente a procurar código inexistente.',
    },

    // ── README.md (bilíngue: PT e EN, o mapa dá as duas metades) ────────────
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "\\*\\*Back-office do operador\\*\\*|\\*\\*Operator back-office\\*\\*",
      reason:
        'Mapa F5 (h) linhas 2018-2020: o bullet de destaque, PT (79) e EN (374), num padrão só.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "\\|\\s*`superadmin@[^|]*\\|",
      reason:
        'Mapa F5 (h) linhas 2019-2020: a linha da tabela de credenciais do seed (PT 108, EN 402). O e-mail é derivado do nome do projeto pelo motor de rename, então o padrão casa pelo prefixo e não pelo domínio.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "\\|\\s*`platform`\\s*\\|",
      reason:
        'Mapa F5 (h) linhas 2018-2020: a linha `platform` da tabela de escopos, nas duas metades do README (PT 139, EN 434).',
    },
  ],

  /**
   * (f) do mapa, linhas 1985-1989: `grep -niE 'plan|platform|audit|superadmin|trial'`
   * sobre `.env.example`, `config/env.ts` e `config/env.spec.ts` devolve ZERO.
   * Nenhuma condicional de `validateEnv` toca o painel.
   */
  envKeys: [],

  /**
   * (i) do mapa, linhas 2024-2028: NENHUMA dependência fica sem uso. Os quatro
   * manifests foram checados — a web não tem biblioteca de gráfico nenhuma (o
   * gráfico de signups é SVG à mão), e o painel usa só `lucide-react`, `sonner`,
   * `next-intl`, `@tanstack/react-query`, `@nestjs/*`, `nestjs-zod` e
   * `@prisma/client`, todos usados pelo resto da aplicação.
   */
  deps: [],

  docSections: [
    // Mapa F5 (h) linha 2011: a sub-seção `### Criar empresa pelo painel da
    // plataforma` (CLAUDE.md 277-285) sai INTEIRA — é o único heading
    // exclusivamente do painel. O resto de "Convites" fica, com as podas por
    // bullet acima.
    'Criar empresa pelo painel da plataforma',
  ],

  /**
   * §4 do mapa, linha 4976: `platform` — "None at all". O painel só LÊ tabelas
   * de `multi-tenancy` e `plans`; não cria tabela, não adiciona coluna e não
   * contribui política — `asPlatform` usa o caminho `app.is_platform_admin()`
   * que JÁ vive em `rls-01`, fragmento de `multi-tenancy`. Por isso a lista é
   * vazia e as duas edições no `rls-01` foram modeladas como `seams` no arquivo
   * de migration (ver acima). Contradição com F5 (j) registrada no relatório.
   */
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F6 · audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `audit` é **alwaysOn** — veredito do mapa (linha 169): **DO NOT REMOVE IN V1**.
 *
 * As listas de remoção estão VAZIAS DE PROPÓSITO. Isto é decisão registrada,
 * não esquecimento. A evidência, toda do dossiê F6 (mapa 2294-2482):
 *
 * **1. `auditLog.create` vive em CINCO serviços independentes**, quatro deles
 * fora de `common/audit/`, cada um com o seu próprio helper privado `audit()`:
 *   - `modules/auth/services/auth.service.ts:626` (método público `audit()`,
 *     601-639, com doc de RLS/fail-open em 610-624) — **13 call sites**
 *     (195, 267, 275, 370, 380, 393, 446, 463, 470, 481, 537, 564, 596);
 *   - `modules/users/services/users.service.ts:466` (453-479) — **8 call sites**
 *     (121, 190, 244, 293, 307, 346, 377, 436);
 *   - `modules/admin/admin-users.service.ts:161` (154-172) — **4 call sites**
 *     (96, 119-121, 145);
 *   - `modules/auth/oauth/oauth.service.ts:679` (665-691) — **3 call sites**
 *     (327, 338, 512);
 *   - `modules/platform/support/platform-audit.ts:26` via `writeAudit` —
 *     `platform-tenants.service.ts:208, 349`; mais `invitations.service.ts:26`
 *     chamando `writeAudit` em **4 pontos** (253, 385, 440, 566).
 * Soma: **~30 call sites** espalhados por auth, users, admin, oauth,
 * invitations e platform. É isto que faz a remoção deixar de ser subtração e
 * virar refactor de seis módulos.
 *
 * **2. A exportação LGPD RETORNA linhas de auditoria.**
 * `users.service.ts:384-401` (`exportData`) faz
 * `this.prisma.db.auditLog.findMany({ where: { userId } })` e devolve o array em
 * `userDataExportSchema` (`packages/shared/src/user.ts:129-139`). Remover
 * `audit` **muda a forma de uma resposta motivada por lei** (direito de acesso),
 * não apenas um log. O mapa é explícito (linha 2473): isto tem de ser uma
 * DECISÃO exposta ao usuário, nunca uma poda silenciosa. E a prosa legal do
 * próprio produto promete o registro (`legal/privacy-content.ts:82`,
 * `terms-content.ts:106`) — a política de privacidade passaria a declarar um
 * registro que o sistema não mantém.
 *
 * **3. `platform` depende de `audit` de um jeito único.**
 * `platform-audit.ts:13-21`: é o ÚNICO escritor de auditoria do repo cuja falha
 * **aborta a transação de negócio** ("se a trilha não pode ser escrita, a
 * mudança não deve acontecer"), asseverado por
 * `platform-tenants.service.spec.ts:408-411` e `:598-606`. Todos os outros
 * engolem o erro e logam `warn`, porque uma escrita pré-tenant
 * (`auth.forgot_password` com `tenantId` nulo) tem de poder falhar sob RLS sem
 * derrubar o request (`auth.service.ts:610-624`).
 *
 * **Independentemente removível, e NÃO removido aqui:** o MÓDULO DE PERMISSÃO
 * `'audit'` (`packages/shared/src/permissions.ts:11`). Nenhuma rota de produção
 * usa `@RequirePermission('audit', …)` (grep zero, mapa linha 2466), e
 * `SYSTEM_PROFILE_PERMISSIONS.ADMIN` deriva de `permissionModules` por
 * `Object.fromEntries`, então tirar `'audit'` da lista encolhe a matriz sozinho.
 * Só três testes têm o literal (`require-permission.decorator.spec.ts:24,28`,
 * `profile-permissions.service.spec.ts:146,186,192,197`,
 * `permission.guard.spec.ts:76`). Fica de fora da v1 porque é a constante que o
 * produto edita, não uma feature — e porque o ganho (uma string) não paga
 * reapontar três suítes.
 *
 * **Ordenação que o CLI deve impor (mapa linha 2475):** se `audit` pudesse ser
 * desligado, `platform` teria de cair junto. Como `audit` é `alwaysOn`, essa
 * aresta é automaticamente satisfeita — e é por isso que `platformManifest`
 * lista `audit` em `requires` mesmo assim: a aresta fica documentada no grafo
 * para o dia em que a v2 tornar `audit` opcional.
 */
export const auditManifest: FeatureManifest = {
  id: 'audit',
  label: 'Trilha de auditoria',
  summary:
    'AuditLog imutável de quem fez o quê, escrito por auth, users, admin, oauth, invitations e platform — e devolvido na exportação LGPD.',

  /** v1: o CLI RECUSA desligar. Ver o doc-comment acima para a evidência. */
  alwaysOn: true,

  // Todas as listas abaixo são vazias por DECISÃO (veredito do mapa, linha 169).
  // Não transcrevemos as costuras de remoção: emitir um plano de remoção para
  // uma feature que o CLI não deixa desligar convidaria alguém a executá-lo.
  deletePaths: [],
  seams: [],

  // (f) mapa linhas 2405-2407: nenhuma env var de auditoria existe.
  envKeys: [],
  // (i) mapa linhas 2427-2429: usa só `@prisma/client` e o `Logger` do
  // `@nestjs/common` — ambos core.
  deps: [],
  // (h) mapa linhas 2413-2420: nenhuma seção inteira pertence a `audit`; as
  // menções são orações dentro de seções que ficam ("Permissões" 137-138,
  // "Testes" 528-529). E "Política de dependências" fala de `pnpm audit`, que é
  // outra coisa — mapa linha 2417 avisa explicitamente para NÃO tocar.
  docSections: [],
  // §4 mapa linha 4977: "None manual". `audit_logs` é protegida pelo sweep
  // dinâmico `app.apply_tenant_rls()` por ter coluna `tenantId` — política
  // gerada pelo loop, não escrita por tabela.
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F7 · plans — PlanLimitsService + feature flags
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `plans` é REMOÇÃO COM COSTURAS (mapa linha 170).
 *
 * **O erro que este manifesto existe para não cometer:**
 * `TenantStatus`, `Tenant.status` e `Tenant.trialEndsAt` **NÃO são do `plans`**.
 * O mapa é enfático (F7 (c), linhas 2568-2569 e 2575): o `TenantStatusGuard` os
 * lê em TODO request (`tenant-status.guard.ts:62-68`,
 * `select: { status, trialEndsAt, deletedAt }`), e `assertTenantAllowed`
 * (`tenant-access.ts:23-47`, inclusive o ramo `TRIAL` em 37-43) é o mecanismo
 * pelo qual um operador desativa uma empresa à mão. Outros leitores:
 * `oauth.service.ts:296`, `trial-banner.tsx:24,29,31`,
 * `platform-stats.service.ts:36-39`, `shared/tenant.ts:16-18`,
 * `tenant-isolation.e2e-spec.ts:43`. **NENHUMA costura aqui toca nisso** — nem o
 * enum, nem as duas colunas, nem `@@index([status])`, nem
 * `FALLBACK_TRIAL_DAYS` (`tenant-provisioning.ts:21-22`, que com `plans` fora
 * passa a ser a ÚNICA fonte da duração do trial), nem `TrialBanner`, nem
 * `TenantGate` (que reage a um 403 do guard, não a um `Plan`). Se o seu diff
 * mexeu em `status`/`trialEndsAt`, ele está errado.
 *
 * Segundo não-óbvio: `sequence.service.ts:62` tem seu próprio
 * `pg_advisory_xact_lock(hashtext(...))` para sequências por tenant
 * (mapa linha 2540). **O padrão de advisory lock não é propriedade do `plans`** —
 * não o trate como tal.
 *
 * `requires` fica VAZIO de propósito: `plans` sobrevive sem `platform`
 * (precondição I2, mapa linha 1810). O custo, que o gerador deve AVISAR: com o
 * painel fora, o único escritor de `Plan` passa a ser o seed
 * (`platform-plans.service.ts:40,53,89-92` eram os `create`/`update`; não existe
 * delete) — os limites continuam sendo impostos de verdade, mas o operador não
 * tem UI para mudar plano. A aresta dura é a inversa: `platform requires plans`.
 */
export const plansManifest: FeatureManifest = {
  id: 'plans',
  label: 'Planos e limites',
  summary:
    'Plan + PlanLimitsService: maxUsers e contadores nomeados impostos com pg_advisory_xact_lock, feature flags fail-closed, e o CRUD de planos do painel.',

  deletePaths: [
    // (a) mapa linhas 2487-2488.
    'apps/api/src/modules/tenants/services/plan-limits.service.ts',
    'apps/api/src/modules/tenants/services/plan-limits.service.spec.ts',

    // Os arquivos de plano DENTRO de `platform` (mapa linhas 2489-2496:
    // `platform-plans.controller.ts`, `platform-plans.service.ts` + spec,
    // `app/platform/plans/page.tsx`, `plan-form-dialog.tsx` + teste,
    // `change-plan-dialog.tsx`) NÃO são listados aqui de propósito: como
    // `platform requires plans`, desligar `plans` obriga `platform` a estar
    // desligado, e o `platformManifest` já apaga aquelas árvores inteiras.
    // Listá-los duas vezes só criaria um `deletePaths` que falha por caminho
    // inexistente. Pela mesma razão `dialogs.test.tsx` (que o mapa diz para
    // EDITAR, não deletar, "unless platform also goes" — linha 2498) não
    // precisa de costura: platform sempre também vai.
  ],

  prisma: {
    dropBlocks: [
      // (c) mapa linha 2565: `model Plan` inteiro (tenancy.prisma 5-37),
      // inclusive a back-relation `tenants Tenant[]` que vive dentro dele.
      'Plan',
    ],
    dropFields: [
      // (c) mapa linhas 2566-2567: ambos ficam órfãos. `@@index([planId])` (97)
      // é removido por uma seam (abaixo), porque não é campo.
      // `status`, `trialEndsAt` e `@@index([status])` FICAM — ver o
      // doc-comment do manifesto.
      { model: 'Tenant', fields: ['planId', 'plan'] },
    ],
  },

  seams: [
    // ─── specs que mencionam plano em arquivos que SOBREVIVEM ────────────────────
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.spec.ts',
      kind: 'replace',
      pattern: 'toTenantDto\\((tenant\\([^)]*\\)), [^)]*\\)',
      replacement: 'toTenantDto($1)',
      reason:
        '`toTenantDto` perde o segundo parâmetro (o nome do plano) com a feature. As chamadas de dois argumentos no spec dão `TS2554`; a captura preserva o primeiro argumento como ele está.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*plan(Id|Name):',
      reason:
        'As duas propriedades de plano na asserção `toEqual` do DTO. Chave a mais num `toEqual` falha em runtime.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('reports a null plan name when the tenant has no plan", end: '\\}\\);' },
      reason: 'O teste é inteiramente sobre `planName`, que sai do DTO.',
    },
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*expect\\(dto\\.planName\\)',
      reason:
        'A asserção de `planName` no teste de `me()`, que SOBREVIVE — ele prova que a empresa vem do escopo e não de um argumento, o que é núcleo de multi-tenancy.',
    },
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('plan'", end: '\\}\\);' },
      reason:
        'O `describe` inteiro de `service.plan()` — o método sai com a feature. Os de `me`, `update` e `branding` ficam.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('trial and plan'", end: '\\}\\);' },
      reason:
        'O `describe` que exercita a escolha do plano em `provisionTenant` — `planName` sai de `ProvisionedTenant` e `planId` de `ProvisionTenantInput`, então os testes não compilam. O provisionamento em si (empresa, perfis, permissões) continua coberto pelos outros describes.',
    },
    // ── tenancy.prisma: o índice órfão ──────────────────────────────────────
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropLinesMatching',
      pattern: "@@index\\(\\[planId\\]\\)",
      reason:
        'Mapa F7 (c) linha 2568: índice sobre uma coluna que acabou de sair. `prisma validate` falha com índice apontando para campo inexistente, então esta costura é obrigatória, não cosmética.',
    },

    // ── tenant-access.ts: o mapeamento do DTO da empresa ────────────────────
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.ts',
      kind: 'replace',
      pattern: "import type \\{ Plan, Tenant \\} from '@prisma/client';",
      replacement: "import type { Tenant } from '@prisma/client';",
      reason:
        'Mapa F7 (b) linha 2533: o tipo `Plan` deixa de ser gerado pelo Prisma, então o import vira erro de compilação — é o primeiro lugar em que a remoção aparece.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.ts',
      kind: 'replace',
      pattern:
        "export function toTenantDto\\(\\s*tenant: Tenant,\\s*plan\\?: Pick<Plan, 'name'> \\| null,?\\s*\\)",
      replacement: 'export function toTenantDto(tenant: Tenant)',
      reason:
        'Mapa F7 (b) linha 2534: a assinatura perde o segundo argumento. Os 4 call sites (`signup.service.ts:122`, `tenants.service.ts:33,49`, `platform-tenants.service.ts:41`) são ajustados por costuras próprias ou já sumiram com o painel.',
    },
    {
      file: 'apps/api/src/modules/auth/support/tenant-access.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*planId: tenant\\.planId,\\s*$|^\\s*planName: plan\\?\\.name \\?\\? null,\\s*$",
      reason:
        'Mapa F7 (b) linha 2535: as duas linhas do objeto retornado. Um padrão só, alternado, porque `dropLinesMatching` apaga toda linha que casa e as duas são vizinhas. `assertTenantAllowed` (23-47) fica VERBATIM — lê apenas `status`/`trialEndsAt`/`deletedAt`.',
    },

    // ── signup.service.ts: planName atravessava o fluxo de signup ───────────
    {
      file: 'apps/api/src/modules/auth/services/signup.service.ts',
      kind: 'replace',
      pattern: "const \\{ tenant, user, planName \\}",
      replacement: 'const { tenant, user }',
      reason:
        'Mapa F7 (b) linha 2539: `provisionTenant` deixa de devolver `planName`; desestruturar um campo inexistente é erro de tipo com `exactOptionalPropertyTypes`/strict.',
    },
    {
      file: 'apps/api/src/modules/auth/services/signup.service.ts',
      kind: 'replace',
      pattern: "return \\{ tenant, user, planName \\}",
      replacement: 'return { tenant, user }',
      reason: 'Mapa F7 (b) linha 2539: o retorno do serviço perde o mesmo campo.',
    },
    {
      file: 'apps/api/src/modules/auth/services/signup.service.ts',
      kind: 'replace',
      pattern: "toTenantDto\\(tenant, planName \\? \\{ name: planName \\} : null\\)",
      replacement: 'toTenantDto(tenant)',
      reason:
        'Mapa F7 (b) linha 2539: o call site casa com a nova assinatura de 1 argumento de `toTenantDto`.',
    },

    // ── TenantsModule: o @Global existia por causa dos limites de plano ─────
    {
      file: 'apps/api/src/modules/tenants/tenants.module.ts',
      kind: 'dropImport',
      pattern: "\\./services/plan-limits\\.service",
      reason: 'Mapa F7 (b) linha 2541: o provider deixa de existir como arquivo.',
    },
    {
      file: 'apps/api/src/modules/tenants/tenants.module.ts',
      kind: 'replace',
      pattern: "providers:\\s*\\[\\s*PlanLimitsService,\\s*TenantsService\\s*\\]",
      replacement: 'providers: [TenantsService]',
      reason:
        'Mapa F7 (b) linha 2541: os dois providers estão na MESMA linha, então `dropLinesMatching` levaria `TenantsService` junto — daí `replace` com âncora que nomeia os dois.',
    },
    {
      file: 'apps/api/src/modules/tenants/tenants.module.ts',
      kind: 'replace',
      pattern: "exports:\\s*\\[\\s*PlanLimitsService,\\s*TenantsService\\s*\\]",
      replacement: 'exports: [TenantsService]',
      reason:
        'Mapa F7 (b) linha 2541: mesma situação no array `exports`. O `@Global()` e seu doc de 6-10 PODEM sair (existiam só porque limites de plano são impostos onde quer que um recurso seja criado), mas não os removemos: `TenantsService` continua exportado, e manter o decorator é inócuo enquanto remover cedo demais quebraria qualquer módulo de produto que já contasse com ele.',
    },

    // ── tenants.controller.ts: as duas rotas de plano ───────────────────────
    {
      file: 'apps/api/src/modules/tenants/tenants.controller.ts',
      kind: 'dropImport',
      pattern: "\\./services/plan-limits\\.service",
      reason: 'Mapa F7 (b) linha 2542: o controller injetava `PlanLimitsService` só para `usage()`.',
    },
    {
      file: 'apps/api/src/modules/tenants/tenants.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*PlanDto,\\s*$|^\\s*PlanUsageDto,\\s*$",
      reason:
        'Mapa F7 (b) linha 2542: os dois tipos saem do `import type { … } from \'@dontpanic/shared\'`, que é multilinha — por isso o padrão casa a linha do membro, não o import inteiro.',
    },
    {
      file: 'apps/api/src/modules/tenants/tenants.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "private readonly planLimits: PlanLimitsService",
      reason: 'Mapa F7 (b) linha 2542: o parâmetro do construtor.',
    },
    {
      file: 'apps/api/src/modules/tenants/tenants.controller.ts',
      kind: 'replace',
      pattern: "@Get\\('me/plan'\\)[\\s\\S]*?return this\\.planLimits\\.usage\\(\\);\\s*\\}",
      replacement: '',
      reason:
        "Mapa F7 (b) linha 2542: `GET /tenants/me/plan` e `GET /tenants/me/plan-usage` saem juntas, num bloco só, porque são contíguas e o fim do bloco (`this.planLimits.usage()`) é inequívoco. O `@RequirePermission('settings')` da classe e as rotas de branding FICAM.",
    },

    // ── tenants.service.ts ──────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.ts',
      kind: 'dropLinesMatching',
      pattern: "include: \\{ plan: \\{ select: \\{ name: true \\} \\} \\},",
      reason:
        'Mapa F7 (b) linha 2543: as duas leituras (linhas 30 e 47) carregavam o nome do plano para o DTO; um padrão só cobre as duas.',
    },
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.ts',
      kind: 'replace',
      pattern: "toTenantDto\\(tenant, tenant\\.plan\\)",
      replacement: 'toTenantDto(tenant)',
      reason:
        'Mapa F7 (b) linha 2543: casa com a nova assinatura de `toTenantDto`. ATENÇÃO: há dois call sites idênticos (33 e 49) — o motor tem de aplicar em TODAS as ocorrências, senão o segundo fica quebrado.',
    },
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*PlanDto,?\\s*$",
      reason: 'Mapa F7 (b) linha 2543: o tipo `PlanDto` sai do import de `@dontpanic/shared`.',
    },
    {
      file: 'apps/api/src/modules/tenants/services/tenants.service.ts',
      kind: 'replace',
      pattern: "async plan\\(\\)[\\s\\S]*?\\n  \\}",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2543: o método `plan()` inteiro (52-77), que servia `GET /tenants/me/plan`. Âncora pelo nome do método e pelo fechamento no nível do corpo da classe, sem depender da indentação interna.',
    },

    // ── tenant-provisioning.ts: a porta compartilhada (signup/painel/oauth/seed)
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'replace',
      pattern: "/\\*\\* Explicit plan[\\s\\S]*?planId\\?: string \\| null;",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2546: `planId` sai de `ProvisionTenantInput`. Este arquivo é o núcleo extraído para que signup, painel, conclusão de OAuth e seed não divirjam — uma edição errada aqui divergem as quatro portas de uma vez.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'dropLinesMatching',
      pattern: "planName: string \\| null;",
      reason: 'Mapa F7 (b) linha 2547: `planName` sai de `ProvisionedTenant`.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      // O código real é um ternário de três linhas (`const plan = input.planId ? … : …;`),
      // não um `await` direto — daí `dropBlock`, que remove linhas inteiras do início ao
      // fim, em vez de um `replace` cuja âncora dependia da forma antiga.
      kind: 'dropBlock',
      block: {
        start: 'const plan = input\\.planId',
        end: 'isDefault: true, active: true',
      },
      reason:
        'Mapa F7 (b) linha 2548: a busca do plano explícito ou do `isDefault: true, active: true`. `tx.plan` já não existe no client gerado, então isto é erro de compilação, não limpeza opcional.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'replace',
      pattern: "input\\.trialDays \\?\\? plan\\?\\.trialDays \\?\\? FALLBACK_TRIAL_DAYS",
      replacement: 'input.trialDays ?? FALLBACK_TRIAL_DAYS',
      reason:
        'Mapa F7 (b) linha 2549: `FALLBACK_TRIAL_DAYS` (21-22) FICA e passa a ser a única fonte da duração do trial. O trial sobrevive à remoção de planos — é `Tenant.status`/`trialEndsAt`, lidos pelo `TenantStatusGuard`.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'dropLinesMatching',
      pattern: "planId: plan\\?\\.id \\?\\? null,",
      reason: 'Mapa F7 (b) linha 2550: o campo sai do `data` do `tenant.create`.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'replace',
      pattern: "return \\{ tenant, adminProfileId, planName: plan\\?\\.name \\?\\? null \\};",
      replacement: 'return { tenant, adminProfileId };',
      reason: 'Mapa F7 (b) linha 2551: o retorno casa com `ProvisionedTenant` sem `planName`.',
    },

    // ── invitations: os DOIS call sites de assertCanAddUser ─────────────────
    // Mapa F7 (k) linhas 2664-2672 e F2: `invitations` é dono de AMBOS. Nada
    // mais no repo chama `assertCanAddUser` — nem `admin-users.service.ts`,
    // apesar de `plan-limits.service.ts:97-104` documentar um caminho de
    // reativação (invariante declarada e NÃO ligada, mapa linha 2675).
    {
      file: 'apps/api/src/modules/invitations/invitations.service.ts',
      kind: 'dropImport',
      pattern: "\\.\\./tenants/services/plan-limits\\.service",
      reason:
        'Mapa F7 (b) linha 2553. `required: false` porque o arquivo só existe com `invitations` instalado — e a direção dura é a inversa: é `invitations` que possui os dois call sites, não `plans` que precisa de `invitations`.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.service.ts',
      kind: 'dropLinesMatching',
      pattern: "private readonly planLimits: PlanLimitsService",
      reason:
        'Mapa F7 (b) linha 2553: o parâmetro do construtor. `required: false`: só existe com `invitations`.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.service.ts',
      kind: 'replace',
      pattern: "[^\\n]*\\n?[^\\n]*await this\\.planLimits\\.assertCanAddUser\\(tx\\);\\n",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2554: a checagem de CORTESIA na EMISSÃO (223) mais o comentário que a chama de cortesia. Ela nunca foi a garantia — entre o convite e o clique alguém pode entrar, sair ou o plano mudar; ela só evita convite para plano já cheio. `required: false`: só existe com `invitations`.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.service.ts',
      kind: 'replace',
      pattern:
        "await TenantContext\\.run\\(\\{ scope: \\{ kind: 'tenant', tenantId \\}, tx \\}, \\(\\) =>\\s*this\\.planLimits\\.assertCanAddUser\\(tx\\),\\s*\\);",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2555 e (k) linhas 2666-2672: a checagem AUTORITATIVA no ACEITE (518-520), dentro da MESMA transação que cria o usuário (522-530) — é isso que mantém o `pg_advisory_xact_lock` e a contagem em volta da escrita. O `TenantContext.run` explícito existe porque o aceite corre em escopo `system` (não há tenant antes de resolver o token), e sai junto: é o único motivo não-platform de um service chamar `TenantContext.run` com `tx` explícito. `required: false`: só existe com `invitations`.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.module.ts',
      kind: 'replace',
      pattern: "\\s*//[^\\n]*PlanLimitsService arrives from the @Global TenantsModule[^\\n]*",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2556: comentário que explica uma injeção que já não acontece. `required: false`: só existe com `invitations`.',
      required: false,
    },

    // ── boilerplate v0.4.0: assento e sessão única PASSARAM a depender do plano ──
    // O #39 ligou duas regras que antes eram só coluna: `concurrentSessions` agora é
    // imposto no `TokenService` (um plano sem ele dá uma sessão viva), e reativar um
    // usuário no painel de admin pergunta ao `PlanLimitsService` se há assento. As duas
    // leem o model `Plan` e importam `plan-limits.service`, que saem com esta feature —
    // então saem junto, e a regra volta a ser a de antes do plano: sessões concorrentes
    // livres e reativação sem teto. Nenhuma das duas é `required: false`: os arquivos
    // são do núcleo de auth/admin e existem em qualquer receita.
    {
      file: 'apps/api/src/modules/auth/services/token.service.ts',
      kind: 'dropImport',
      pattern: '\\.\\./\\.\\./tenants/services/plan-limits\\.service',
      reason:
        'Import de `planAllowsConcurrentSessions`, de um arquivo que sai em deletePaths — sem esta costura o typecheck para em token.service.ts com TS2307.',
    },
    {
      file: 'apps/api/src/modules/auth/services/token.service.ts',
      kind: 'replace',
      pattern:
        'const tokens = await this\\.mint\\(user, familyId, ctx\\);\\n(\\s*)await this\\.enforceSingleSession\\(user, familyId\\);\\n\\s*return tokens;',
      replacement: 'return this.mint(user, familyId, ctx);',
      reason:
        'O `issueTokensForUser` volta a só emitir: sem plano não há flag `concurrentSessions` a impor, e a chamada apontaria para o método removido abaixo.',
    },
    {
      file: 'apps/api/src/modules/auth/services/token.service.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: { start: 'private async enforceSingleSession\\(', end: '^  \\}$' },
      reason:
        'O método inteiro com o doc-comment que o justifica: ele lê `tenant.plan.features`, relação que o Prisma Client deixa de conhecer quando `Plan` sai (TS2353 no `select`). O fim é o `  }` do método; os `return` internos ficam em 4 espaços.',
    },
    {
      file: 'apps/api/src/modules/auth/services/token.service.spec.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "describe\\('issueTokensForUser \\(single session per plan\\)'",
        end: '^  \\}\\);$',
      },
      reason:
        'Os cinco testes da sessão única por plano, com o comentário que os apresenta. Testariam um comportamento que não existe mais neste projeto.',
    },
    {
      file: 'apps/api/src/modules/auth/services/token.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*tenant: \\{ findUnique: jest\\.',
      reason:
        'O mock de `prisma.tenant.findUnique` (tipo e valor) existia só para a leitura do plano no `enforceSingleSession`.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropImport',
      pattern: '\\.\\./tenants/services/plan-limits\\.service',
      reason: 'Import de arquivo que sai em deletePaths (TS2307 em admin-users.service.ts).',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*private readonly planLimits: PlanLimitsService,\\s*$',
      reason: 'O parâmetro do construtor: sem `plans` o provider não existe e o Nest não conseguiria resolver a injeção.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*if \\(active\\) await this\\.planLimits\\.assertCanAddUser\\(tx\\);\\s*$',
      reason:
        'A checagem de assento na reativação. Sem plano não há teto de usuários: reativar volta a ser só virar o booleano, dentro da mesma transação.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: { start: "it\\('refuses the reactivation when the plan has no seat left'", end: '^    \\}\\);$' },
      reason: 'O teste do plano cheio: com `plans` desligado não existe plano para encher.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'replace',
      pattern:
        "\\s*expect\\(planLimits\\.assertCanAddUser\\)\\.toHaveBeenCalledWith\\(prisma\\);\\n\\s*// The same client[^\\n]*\\n\\s*// transaction would[^\\n]*\\n\\s*// to protect\\.",
      replacement: '',
      reason:
        'A asserção de que a reativação consulta o plano, com o comentário que explica por que ela usa o mesmo client da transação. Sai antes da costura de linha abaixo para o comentário não ficar órfão.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'replace',
      pattern: "reactivates only after the plan is asked, inside the same transaction",
      replacement: 'reactivates inside a transaction',
      reason: 'O nome do teste afirmava a consulta ao plano, que acabou de sair.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*(let planLimits: any;|planLimits = \\{ assertCanAddUser: |expect\\(planLimits\\.assertCanAddUser\\))',
      reason: 'A declaração e o mock de `planLimits`, e as asserções `not.toHaveBeenCalled` sobre ele nos outros testes de setActive.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'replace',
      pattern: 'new AdminUsersService\\(prisma, tokenService, planLimits\\)',
      replacement: 'new AdminUsersService(prisma, tokenService)',
      reason: 'O construtor perdeu o parâmetro `planLimits` na costura de admin-users.service.ts.',
    },

    // ── packages/shared ─────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*planId: z\\.string\\(\\)\\.uuid\\(\\)\\.nullable\\(\\),\\s*$|^\\s*planName: z\\.string\\(\\)\\.nullable\\(\\),\\s*$",
      reason:
        'Mapa F7 (d) linha 2578: as duas chaves saem de `tenantDtoSchema`. `trialEndsAt` (101) FICA — é o `TrialBanner`. Padrão ancorado em `.nullable()` para não atingir o `planId: z.string().uuid().nullish()` de `platformCreateTenantSchema`, que é do painel.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const planDtoSchema",
        end: "export type PlanUsageDto = z\\.infer<typeof planUsageDtoSchema>;",
      },
      reason:
        'Mapa F7 (d) linhas 2579-2581: `planDtoSchema`, `planUsageEntrySchema` e `planUsageDtoSchema` com seus docs, num bloco contíguo. Inclui o doc de `concurrentSessions` — feature DECLARADA e nunca implementada (`plan-limits.service.ts:93` só a lê para o DTO; nada a impõe, e `SessionEndReason.SIGNED_IN_ELSEWHERE` nunca é escrito — mapa linha 2677).',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const changePlanSchema",
        end: "export type ChangePlanInput = z\\.infer<typeof changePlanSchema>;",
      },
      reason:
        'Mapa F7 (d) linha 2582: entrada do `PATCH /platform/tenants/:id/plan`. Fica FORA do bloco que o `platformManifest` remove (suspend/extendTrial) de propósito — as duas costuras são vizinhas e não se sobrepõem.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const upsertPlanSchema",
        end: "export type UpsertPlanInput = z\\.infer<typeof upsertPlanSchema>;",
      },
      reason:
        'Mapa F7 (d) linha 2586: o contrato de `POST/PATCH /platform/plans`, com `maxUsers` e `isDefault`. Também vive entre dois blocos do `platformManifest`, e por isso tem de ser um `dropBlock` próprio. `RESERVED_TENANT_SLUGS` (33-60) FICA — `billing` e `superadmin` ali são palavras reservadas, não referências a feature (mapa linha 2588).',
    },

    // ── web: use-tenant.ts ──────────────────────────────────────────────────
    // O SPEC importa os mesmos símbolos: `PLAN_QUERY_KEY`, `PLAN_USAGE_QUERY_KEY`,
    // `isAtLimit`, `usePlan`, `usePlanUsage`. Sem estas costuras o web falha com cinco
    // `TS2305` num arquivo de teste — e o arquivo NÃO pode ser apagado, porque também
    // cobre `useTenant`/`useBranding`, que sobrevivem.
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.ts',
      kind: 'dropImportSpecifier',
      pattern: '^(PLAN_QUERY_KEY|PLAN_USAGE_QUERY_KEY|isAtLimit|usePlan|usePlanUsage)$',
      target: '^\\./use-tenant$',
      required: false,
      reason:
        'Especificadores de plano no spec de `use-tenant`. `required: false` porque a extensão do arquivo varia (.ts/.tsx) entre versões do boilerplate; a costura irmã cobre a outra.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.tsx',
      kind: 'dropImportSpecifier',
      pattern: '^(PLAN_QUERY_KEY|PLAN_USAGE_QUERY_KEY|isAtLimit|usePlan|usePlanUsage)$',
      target: '^\\./use-tenant$',
      required: false,
      reason:
        'Idem, na variante `.tsx` — que é a do template atual. Ver a costura irmã acima.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.tsx',
      kind: 'dropBlock',
      block: { start: "describe\\('isAtLimit'", end: '\\}\\);' },
      required: false,
      reason:
        'O `describe` que exercita `isAtLimit` — a função sai com os planos. Os `describe` de queries e mutations FICAM: cobrem `useTenant`/`useBranding`, que sobrevivem.',
    },
    // Os usos remanescentes têm de sair como BLOCO, não por linha. Um
    // `dropLinesMatching` levava `const plan = renderHook(() => usePlan(), …)` e deixava
    // o `await waitFor(() => expect(plan.result…))` que o referencia — `TS2304` sobre uma
    // variável que a própria costura apagou. A unidade certa é o trecho do teste.
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "apiMock\\.mockResolvedValue\\(\\{ id: 'p1', code: 'pro' \\}\\)",
        end: "'/tenants/me/plan'\\);",
      },
      required: false,
      reason:
        'A metade de PLANO do teste "reads branding and the plan without retrying": o mock, o `renderHook(usePlan)`, o `waitFor` e o `expect` da rota. A metade de BRANDING fica — `useBranding` sobrevive aos planos, e apagar o teste inteiro tiraria a cobertura dela.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.tsx',
      kind: 'dropLinesMatching',
      // Ancorado no INÍCIO do statement (`^\\s*expect\\(`), o que garante que cada linha
      // casada é um statement completo — o único caso em que remover por linha é seguro.
      // As duas asserções ficam no teste "keeps the query keys stable", que sobrevive por
      // causa de `TENANT_QUERY_KEY` e `BRANDING_QUERY_KEY`.
      pattern: '^\\s*expect\\((PLAN_QUERY_KEY|PLAN_USAGE_QUERY_KEY)\\)',
      required: false,
      reason:
        'As duas asserções de chave de query de plano no teste de estabilidade de chaves. O teste FICA: metade dele cobre `TENANT_QUERY_KEY`/`BRANDING_QUERY_KEY`, que sobrevivem aos planos.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.test.tsx',
      kind: 'dropBlock',
      block: { start: "it\\('reads how much of the plan is spent'", end: '\\}\\);' },
      required: false,
      reason:
        'O teste inteiro de `usePlanUsage` — o hook sai com os planos, então não há metade a preservar aqui (ao contrário do teste de branding+plano acima).',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*PlanDto,\\s*$|^\\s*PlanUsageDto,\\s*$|^\\s*PlanUsageEntry,\\s*$",
      reason: 'Mapa F7 (b) linha 2565: os três tipos saem do `import type` multilinha.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "export const PLAN_QUERY_KEY",
        end: "queryFn: \\(\\) => api<PlanUsageDto>\\('/tenants/me/plan-usage'\\),[\\s\\S]*?\\n\\}",
      },
      reason:
        'Mapa F7 (b) linhas 2566-2567: `PLAN_QUERY_KEY` + `usePlan()` e `PLAN_USAGE_QUERY_KEY` + `usePlanUsage()` são contíguos, então um bloco só cobre os dois — e as rotas que eles chamam acabaram de sair do controller. `useTenant`/`useBranding`, no mesmo arquivo, FICAM.',
    },
    {
      file: 'apps/web/src/components/tenant/use-tenant.ts',
      kind: 'replace',
      pattern: "/\\*\\* No room for one more[\\s\\S]*?export function isAtLimit[\\s\\S]*?\\n\\}",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2568: `isAtLimit()` opera sobre `PlanUsageEntry`, tipo que acabou de sair do contrato. `trial-banner.tsx` NÃO é tocado (mapa linha 2570): ele lê `tenant.status`/`trialEndsAt` de `tenantDtoSchema`, ambos sobreviventes.',
    },

    // ── Seed ────────────────────────────────────────────────────────────────
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern:
        "//\\s*A starter plan\\.[\\s\\S]*?const plan = await prisma\\.plan\\.upsert\\(\\{[\\s\\S]*?\\n  \\}\\);\\n",
      replacement: '',
      reason:
        'Mapa F7 (g) linhas 2601-2602: o `plan.upsert` do plano `free` e seu comentário. `prisma.plan` já não existe no client, então o seed nem compila sem esta costura.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropLinesMatching',
      pattern: "planId: plan\\.id,",
      reason:
        'Mapa F7 (g) linha 2603: o vínculo na empresa demo. O `status: ACTIVE` da linha acima FICA — a demo passa a nascer ativa e sem trial, coerente com `tenant-provisioning.ts:65-71`.',
    },

    // ── e2e: só limpeza ─────────────────────────────────────────────────────
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: ",\\s*\"plans\"",
      replacement: '',
      reason:
        'Mapa F7 (b) linha 2559 e (k) linha 2679: `"plans"` é o último nome do `TRUNCATE TABLE` do helper. `TRUNCATE` de tabela inexistente aborta o setup. `global-setup.ts:87-94` descobre tabelas dinamicamente (`pg_tables`) e NÃO precisa de edição.',
    },

    // ── CLAUDE.md: bullets de "Convites" que são acoplamento com planos ─────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: "-\\s*\\*\\*O limite de plano vale no ACEITE\\.\\*\\*[\\s\\S]*?é que falha\\.\\n",
      replacement: '',
      reason:
        'Mapa F7 (h) linha 2610: o bullet inteiro (CLAUDE.md 238-243) explica `assertCanAddUser`, o `pg_advisory_xact_lock` e por que a emissão é cortesia. Sem `PlanLimitsService` ele documenta um mecanismo ausente. `required: false`: a seção "Convites" só existe com `invitations` instalado.',
      required: false,
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        "-\\s*\\*\\*O aceite corre em escopo `system`\\*\\*[\\s\\S]*?está vazio\\.\\n",
      replacement: '',
      reason:
        'Mapa F7 (h) linha 2610: o bullet 244-248 existe só para explicar por que o tenant é passado à mão ao `PlanLimitsService` via `TenantContext.run`. O FATO de o aceite correr em escopo `system` continua verdadeiro, mas sua única consequência documentada era esta. `required: false`: depende de `invitations`.',
      required: false,
    },

    // ── README.md ───────────────────────────────────────────────────────────
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "-\\s*\\*\\*Planos\\*\\*\\s*—|-\\s*\\*\\*Plans\\*\\*\\s*—",
      reason:
        'Mapa F7 (h) linhas 2617-2618: o bullet de destaque, PT (78) e EN (373), num padrão só. O README é bilíngue (PT e depois EN) e as duas metades têm de sair juntas.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: "\\*\\*Planos\\.\\*\\*[\\s\\S]*?\\n\\n",
      replacement: '',
      reason:
        'Mapa F7 (h) linha 2617: o parágrafo `**Planos.**` (PT 166-168). Bloco delimitado por linha em branco para não invadir o parágrafo seguinte.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: "\\*\\*Plans\\.\\*\\*[\\s\\S]*?\\n\\n",
      replacement: '',
      reason:
        'Mapa F7 (h) linha 2618: o parágrafo `**Plans.**` (EN 462-465), par obrigatório do anterior.',
    },
  ],

  /**
   * (f) do mapa, linhas 2595-2597: NENHUMA. Não existe env var de plano, trial
   * ou limite em `.env.example` nem em `apps/api/src/config/env.ts`; nenhuma
   * condicional de `validateEnv`, nenhum caso em `env.spec.ts`. Os limites vêm
   * de linhas da tabela `plans`, não de configuração — que é justamente por que
   * trocar de plano não exige redeploy.
   */
  envKeys: [],

  /**
   * (i) do mapa, linhas 2623-2625: NENHUMA. Não há SDK de cobrança, Stripe nem
   * biblioteca de gráfico em nenhum dos quatro manifests. O
   * `pg_advisory_xact_lock` é SQL cru via `$executeRaw`.
   */
  deps: [],

  docSections: [
    // Mapa F7 (h) linha 2609: `### Planos` (CLAUDE.md 140-146) sai INTEIRA —
    // heading + o parágrafo sobre `PlanLimitsService`, `maxUsers`, os contadores
    // de `Plan.limits`, o `pg_advisory_xact_lock` por empresa e por recurso, e a
    // regra de feature flag fail-closed. É toda a documentação de planos dentro
    // de "Multi-tenancy"; as seções vizinhas ("Permissões", a tabela de escopos)
    // ficam.
    'Planos',
  ],

  /**
   * §4 do mapa, linha 4978: `plans` — "None manual". Tudo é AUTO do schema
   * (`CREATE TABLE "plans"`, `plans_code_key`, `tenants.planId` + FK + índice),
   * então deletar `model Plan` basta.
   *
   * A observação que o mapa manda NÃO "consertar": `plans` **não tem coluna
   * `tenantId`**, então o sweep `app.apply_tenant_rls()` (filtro
   * `a.attname = 'tenantId'`) deliberadamente a ignora — não existe
   * `CREATE POLICY` nem `FORCE ROW LEVEL SECURITY` para `plans` em lugar
   * nenhum do repo. É dado de referência de nível de plataforma, legível por
   * toda empresa pelo GRANT simples, e isso é correto e intencional.
   */
  sqlFragments: [],
};
