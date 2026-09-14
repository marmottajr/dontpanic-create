import type { FeatureManifest } from '../types.ts';

// Fragmento do manifesto — colado em manifest.ts depois. Sem imports de propósito.
//
// Proveniência: docs/maps/feature-surface.md — F3 (linhas 1231-1585), F4 (1586-1803),
// regras globais (37-66), inventário de rotas (102-118), fragmentos SQL (4967-4990),
// riscos de RLS (5010-5023). Números de linha aparecem só em `reason`/comentário:
// o template é sincronizado de um repo vivo e qualquer `pattern` tem que sobreviver
// a reindentação, então todos são âncoras por vocabulário, nunca por coluna.
//
// SEAMKINDS NOVOS usados aqui (o pai precisa declará-los em types.ts):
//   'dropImportSpecifier' | 'dropClassMember' | 'dropCommentSection'
//   'dropMarkdownBullet'  | 'dropArrayEntry'
// Justificativa de cada um está no relatório.

export const twoFactorManifest: FeatureManifest = {
  id: 'twoFactor',
  label: '2FA (TOTP + códigos de backup)',
  summary:
    'Segundo fator TOTP com códigos de backup de uso único, ticket de login curto, modo obrigatório ou prompt adiável, e o gate global que trava o app até o usuário configurar.',

  // `requires` VAZIO de propósito. Nada precisa estar ligado para o 2FA existir: ele
  // nasce no fluxo de senha (auth.service.ts mint do ticket + POST /auth/2fa/verify) e
  // não pede oauth, invitations, plans nem captcha (map F3(k): "PermissionGuard,
  // TenantStatusGuard, JwtAuthGuard, invitations, plans, captcha e a queue são todos
  // 2FA-independentes").
  //
  // A ARESTA EXISTE, MAS APONTA PARA CÁ: `oauth` é que depende de 2fa (map F1(k),
  // linhas 636-680) — o callback social precisa de `AuthService.createLoginTicket`,
  // `AuthService.LOGIN_TICKET_TTL`, `TWO_FACTOR_TICKET_COOKIE` e da rota
  // `POST /auth/2fa/verify`. Logo é o manifesto de `oauth` que carrega
  // `requires: ['twoFactor']`, não este. A direção importa: se o CLI honrar essa
  // aresta, desligar 2fa desliga oauth e a árvore `modules/auth/oauth/**` some
  // inteira — é exatamente por isso que TODA costura em arquivo de oauth aqui está
  // com `required: false`. Se, em vez disso, o CLI permitir oauth sem 2fa (F1(k)
  // admite: "com 2fa off o branch é simplesmente inalcançável e pode ser removido"),
  // essas costuras passam a ser obrigatórias — e emitir oauth SEM elas é regressão de
  // segurança documentada (CLAUDE.md 354-365 e o bullet 580-581).

  deletePaths: [
    // API — serviço, guard e decorator são exclusivos (map F3(a)).
    'apps/api/src/modules/auth/services/two-factor.service.ts',
    'apps/api/src/modules/auth/services/two-factor.service.spec.ts',
    'apps/api/src/modules/auth/guards/two-factor-gate.guard.ts',
    'apps/api/src/modules/auth/guards/two-factor-gate.guard.spec.ts',
    'apps/api/src/common/decorators/skip-two-factor-gate.decorator.ts',
    'apps/api/src/common/decorators/skip-two-factor-gate.decorator.spec.ts',

    // Web — a rota /setup-2fa some junto; não há entrada de nav apontando para ela
    // (map F3(e): grep em app-sidebar.tsx e user-menu.tsx não acha nada).
    'apps/web/src/app/setup-2fa/page.tsx',
    'apps/web/src/components/two-factor-gate.tsx',
    'apps/web/src/components/two-factor-prompt-dialog.tsx',
    'apps/web/src/components/two-factor-setup.tsx',
    'apps/web/src/components/profile/two-factor-card.tsx',

    // NÃO apagar, verificado pelo map F3(a) "Verified NOT exclusive":
    //   components/ui/otp-input.* — também usado por verify-email e email-card;
    //   lib/cookies.ts — helpers genéricos (só as FIXTURES do .test.ts citam 2FA);
    //   infra/prisma/prisma.service.ts (forTenant/asPlatform) — outros guards usam.
  ],

  prisma: {
    // Nenhum arquivo inteiro sai: TwoFactorBackupCode mora em auth.prisma junto com
    // RefreshToken/AuditLog, que são core.
    dropBlocks: ['TwoFactorBackupCode'],
    dropFields: [
      {
        model: 'User',
        // Os três campos ficam ÓRFÃOS sem a feature (map F3(c)); `backupCodes` é o
        // lado inverso da relação e o Prisma não valida sem ele.
        fields: ['twoFactorEnabled', 'twoFactorSecret', 'twoFactorRemindAt', 'backupCodes'],
      },
    ],
    // `tighten` VAZIO de propósito: `User.passwordHash` é nullable por causa do OAUTH,
    // não do 2FA (tenancy.prisma documenta isso no próprio campo e a migration
    // 20260912120000_invitations_and_oauth é quem tirou o NOT NULL). Apertá-lo aqui
    // quebraria contas social-only num projeto que mantém oauth. Map F3(c)
    // "INVERTED INVARIANT check".
  },

  // 2fa NÃO contribui fragmento SQL MANUAL nenhum (map §4, linha 4974): a tabela
  // `two_factor_backup_codes`, seu índice, sua FK e as três colunas em `users` são
  // todos AUTO, regerados por `prisma migrate diff` a partir do schema já podado.
  // O único toque em SQL escrito à mão é a entrada de array em `rls-03` — tratada
  // como seam abaixo, não como fragmento.
  sqlFragments: [],

  envKeys: [
    // Bloco `# 2FA (TOTP)` do .env.example + as duas chaves no Zod de env.ts.
    // Nenhuma `NEXT_PUBLIC_*`: o web não lê nada de 2FA do ambiente (verificado —
    // ao contrário de captcha/oauth/signup, que exigem as duas metades combinando).
    'TOTP_ISSUER',
    'TWO_FACTOR_REQUIRED',
  ],

  deps: [
    {
      workspace: 'apps/api',
      // otplib: só two-factor.service.ts e test/auth.e2e-spec.ts importam.
      // qrcode + @types/qrcode: só two-factor.service.ts (toDataURL). Map F3(i).
      // argon2 FICA — 5 outros consumidores.
      remove: ['otplib', 'qrcode', '@types/qrcode'],
    },
  ],

  // Nenhum serviço de compose depende de 2FA: o ticket vive no CacheProvider
  // (Redis ou memória), e Redis é necessário pelo throttler/cache de qualquer jeito.
  composeServices: [],

  // docSections VAZIO — achado real: o 2FA NÃO tem seção própria no CLAUDE.md. O que
  // ele possui são frases dentro de seções que sobrevivem (Autenticação,
  // Multi-tenancy › As regras, Login social, Rate limit, Convenções, Testes, Travas
  // deliberadas) e um bullet de "O que NÃO fazer". Todas viram `seams` abaixo.
  docSections: [],

  seams: [
    // ─── app.module.ts ───────────────────────────────────────────────────────────
    // O 2FA é dono de um guard REGISTRADO GLOBALMENTE. Não basta apagar o arquivo:
    // o APP_GUARD continua na lista de providers e o Nest falha no boot com
    // "Nest can't resolve dependencies"/módulo inexistente. E a remoção do guard
    // MUDA A PROSA do comentário de ordem — ele enumera a cadeia dos seis guards.
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: 'guards/two-factor-gate\\.guard',
      reason:
        'O TwoFactorGateGuard é registrado como APP_GUARD global (map F3(b), app.module.ts:25 e :136); deixar o import de um arquivo que deletePaths já apagou quebra o build do TS antes de qualquer teste rodar.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: 'useClass:\\s*TwoFactorGateGuard',
      reason:
        'Entrada do array de providers APP_GUARD (app.module.ts:136). Sem apagá-la o Nest tenta instanciar um guard inexistente no bootstrap — falha em runtime, não em compilação, se o import tiver sido resolvido de outro jeito.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'replace',
      // "…então 2FA, e só então a permissão fina" → "…e só então a permissão fina"
      pattern: 'then 2FA,\\s*and',
      replacement: 'and',
      reason:
        'Comentário de ordem dos guards (app.module.ts:127-131) enumera a cadeia inteira; deixar "then 2FA" descrevendo uma cadeia de cinco guards é documentação que mente, e é exatamente esse comentário que o próximo dev lê para decidir onde inserir um guard novo. Map F3(b), linha 3 da tabela.',
    },

    // main.ts: NADA. Map F3(b) é explícito — "no change (2FA touches nothing in
    // bootstrap)". Quem mexe em main.ts são oauth (CSRF + urlencoded) e files
    // (multipart). Não crie costura aqui.

    // ─── auth module ─────────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropImport',
      pattern: 'services/two-factor\\.service',
      reason: 'auth.module.ts:7 importa o serviço que deletePaths apagou.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*TwoFactorService,\\s*$',
      reason:
        'Duas ocorrências (providers :40 e exports :54). Sobrando em `exports`, o UsersModule continuaria podendo injetar um provider que não existe — erro de DI só no primeiro request que tocar users.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'replace',
      pattern: 'email verification, TOTP 2FA \\+ backup codes\\.',
      replacement: 'email verification.',
      reason:
        'Doc-comment do módulo (auth.module.ts:16-17) anuncia capacidade que o projeto gerado não tem.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropLinesMatching',
      pattern: 'TwoFactorService — the users module builds',
      reason:
        'Linha do doc-comment (auth.module.ts:25) que descreve um export removido acima.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropBlock',
      block: {
        start: 'Exported for the OAuth module, which hands off to the same second-factor',
        end: 'AuthService,',
      },
      required: false,
      reason:
        'O export `AuthService` (auth.module.ts:57-60) existe SÓ para o OAuthModule chamar createLoginTicket (map F3(k) e F1(k)). Ausente de forma legítima quando oauth também foi removido — aí o arquivo inteiro do oauth já não existe e este export já saiu com o manifesto de oauth. Se oauth ficar sem 2fa, o export perde a razão de ser e deve sair aqui.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropImport',
      pattern: 'skip-two-factor-gate\\.decorator',
      reason: 'auth.controller.ts:12 — decorator apagado por deletePaths.',
    },
    // COSTURA REMOVIDA: `AuthUserResponse` NÃO pode sair do import de `auth.controller.ts`.
    //
    // A premissa era "usado APENAS pelo handler verifyTwoFactor", e ela é falsa contra o
    // template: `refresh()` declara `Promise<AuthUserResponse>` e `let user:
    // AuthUserResponse['user']` — e refresh é núcleo, não 2FA. Dropar o especificador dava
    // `TS2304: Cannot find name 'AuthUserResponse'` em duas linhas do controller de auth.
    //
    // O mapa registra em F3(b) uma contradição exatamente aqui (dizer que o especificador
    // sai E que `login()` passa a devolver `AuthUserResponse`); a resolução correta é a
    // outra metade, já implementada: em `packages/shared` o `LoginResponse` vira ALIAS de
    // `AuthUserResponse`, então nenhuma assinatura do controller precisa ser tocada.
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropImportSpecifier',
      pattern: 'TwoFactorVerifyDto',
      reason: 'Especificador do import de ./dto/auth.dto (auth.controller.ts:24-27).',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'replace',
      pattern: 'Authenticate; sets auth cookies or returns a 2FA challenge',
      replacement: 'Authenticate; sets auth cookies',
      reason:
        '@ApiOperation de POST /auth/login (auth.controller.ts:96). Esse texto vai para o Swagger em /docs — é contrato publicado, não comentário.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropBlock',
      block: { start: "result\\.kind === 'challenge'", end: '\\}' },
      reason:
        'Branch de desafio dentro de login() (auth.controller.ts:103-105). Sem 2FA, AuthService.login devolve só { kind: "tokens" } e a comparação vira erro de narrowing do TS sobre uma união de um único membro. O `end: "}"` casa a primeira linha de fechamento depois do start, que é a do próprio if — o corpo (`return result.challenge;`) não tem chave.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropClassMember',
      pattern: 'verifyTwoFactor',
      reason:
        'Handler inteiro de POST /auth/2fa/verify com seus quatro decorators (auth.controller.ts:111-126). Precisa sair como MEMBRO, não como faixa de linhas: @Public()/@SystemScope()/@SensitiveThrottle()/@HttpCode/@ApiOperation vêm ANTES do nome do método, e um dropBlock ancorado em @Post deixaria @Public() e @SystemScope() órfãos colados no handler seguinte — o que silenciosamente tornaria POST /auth/refresh público e system-scoped.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: '@SkipTwoFactorGate\\(\\)',
      reason:
        'Decorator em logout (auth.controller.ts:158). Só existe porque o gate global travaria o logout de quem ainda não configurou o 2FA; sem o gate, é ruído que não compila.',
    },
    {
      file: 'apps/api/src/modules/auth/dto/auth.dto.ts',
      kind: 'dropImportSpecifier',
      pattern: 'twoFactorVerifySchema',
      reason: 'auth.dto.ts:8 — schema removido de packages/shared.',
    },
    {
      file: 'apps/api/src/modules/auth/dto/auth.dto.ts',
      kind: 'dropLinesMatching',
      pattern: 'class TwoFactorVerifyDto extends createZodDto',
      reason: 'auth.dto.ts:22 — DTO de uma linha, sem consumidor depois do handler sair.',
    },

    // ─── auth.service.ts ─────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropImportSpecifier',
      pattern: 'TwoFactorChallenge',
      reason: "Especificador de '@dontpanic/shared' (auth.service.ts:18), usado só pela união LoginResult.",
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropImport',
      pattern: '\\./two-factor\\.service',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: auth.service.ts:28 \u2014 servi\u00e7o apagado.",
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'replace',
      // `[^;]*` parava no PRIMEIRO `;`, e o primeiro `;` da união está DENTRO do primeiro
      // membro (`{ kind: 'tokens'; user: UserDto; … }` — separador de campos em type
      // literal). O resultado era meia união removida e o arquivo desbalanceado. Agora a
      // âncora vai até a linha do membro `challenge`, que é o fim real da declaração.
      pattern:
        "/\\*\\* Result of login[^*]*\\*/\\s*export type LoginResult =[\\s\\S]*?kind: 'challenge'[^\\n]*;",
      replacement:
        "/** Result of login: tokens to set as cookies. */\nexport type LoginResult = { kind: 'tokens'; user: UserDto; tokens: IssuedTokens };",
      reason:
        'A união LoginResult (auth.service.ts:45-48) colapsa para um membro só. `[^;]*` cobre as duas linhas de membros sem depender de indentação; manter a união de dois membros com um deles inalcançável faz o TS aceitar `result.kind === "challenge"` em qualquer call-site futuro e reintroduz o branch morto. Map F3(b).',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'const (LOGIN_TICKET_TTL|TWO_FACTOR_MAX_ATTEMPTS)\\s*=',
      reason:
        'Constantes de módulo (auth.service.ts:54-55) que só o passo do segundo fator consome.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'readonly twoFactor:\\s*TwoFactorService,',
      reason:
        'Parâmetro do construtor (auth.service.ts:103). Sem remover, o Nest continua exigindo o provider TwoFactorService no AuthModule e o boot falha na resolução de dependências.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropBlock',
      block: { start: 'if\\s*\\(user\\.twoFactorEnabled\\)\\s*\\{', // Mesmo caso: o `return … kind: 'challenge' …` é o corpo do `if`, não o fim dele.
        end: "kind: 'challenge'[^\\n]*\\n\\s*\\}" },
      reason:
        'O desvio no login que emite ticket em vez de sessão (auth.service.ts:265-269). O `end` ancora na linha do próprio return — a chave de fechamento do if fica e é removida junto pelo engine (bloco inclusive). Ordem: esta costura tem que rodar ANTES de o campo twoFactorEnabled sair do schema Prisma, senão o TS já não conhece a propriedade.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropCommentSection',
      pattern: '--- 2FA second step',
      reason:
        'Seção banner inteira (auth.service.ts:320-397): ticketKey, twoFactorFailKey, createLoginTicket e verifyTwoFactor. O idioma do repo é `// --- <assunto> ---` como separador de seção; apagar até (exclusive) o próximo banner `// --- refresh rotation & reuse detection ---` é o único corte que não depende de contar chaves aninhadas dentro de verifyTwoFactor.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'static readonly LOGIN_TICKET_TTL',
      reason:
        'auth.service.ts:653 — único consumidor é oauth.service.ts (maxAge do cookie do ticket). Sai aqui porque a constante que ela reexporta já saiu acima; a referência do lado oauth tem costura própria mais abaixo.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('returns a 2FA challenge", end: '\\}\\);' },
      reason: 'Teste do desafio (auth.service.spec.ts:298-312).',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('verifyTwoFactor'", end: '\\}\\);' },
      reason:
        'Os 6 testes de verifyTwoFactor (auth.service.spec.ts:346-428). Atenção ao threshold: jest.config.js fixa functions em 100 — remover código bem coberto MOVE o agregado restante, então o gerador tem que remedir (regra global 3 do map).',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      // RE-ANCORADO contra o template: o spec não usa `Test.createTestingModule` nem
      // nomeia `TwoFactorService`. Ele instancia o service à mão
      // (`new AuthService(prisma, makeConfig(), tokenService, twoFactor, cache, queue)`)
      // e o double é a variável local `twoFactor`. A âncora antiga vinha da leitura do
      // working tree do boilerplate, que divergiu da tag — é a classe de erro que o
      // verificador de costuras contra `template/` existe para pegar.
      kind: 'dropLinesMatching',
      pattern: '^\\s*let twoFactor: any;',
      reason:
        'Declaração do double do 2FA na fixture do spec. Sem removê-la sobra uma variável que nada atribui, e o `noUnusedLocals` do tsconfig de teste derruba o build.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      kind: 'dropBalancedBlock',
      pattern: '^\\s*twoFactor = \\{',
      reason:
        'O corpo do double (`verifyTotp`, `consumeBackupCode`). `dropBalancedBlock` e não `dropBlock` porque o objeto tem chaves aninhadas nos `jest.fn()` e nenhum regex de linha marca o fim com segurança.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      kind: 'replace',
      pattern: 'tokenService, twoFactor, cache',
      replacement: 'tokenService, cache',
      reason:
        'O double sai da lista POSICIONAL de argumentos do construtor — o spec instancia `new AuthService(...)` à mão. Deixar o argumento aqui com a variável removida é `TS2304`, e removê-lo sem remover o parâmetro do construtor (outra costura, em auth.service.ts) desalinharia `cache` com `queue`, o que COMPILA e faz o spec testar o service errado.',
    },
    {
      file: 'apps/api/src/modules/auth/services/token.service.ts',
      kind: 'replace',
      pattern: 'Used at login and after 2FA — i\\.e\\.',
      replacement: 'Used at login — i.e.',
      reason: 'Comentário em issueTokensForUser (token.service.ts:71) citando um fluxo inexistente.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled: user\\.twoFactorEnabled,',
      reason:
        'user.mapper.ts:17. Este mapper é a ÚNICA porta por onde um User sai para o cliente; deixar o campo aqui depois de ele sair do userDtoSchema é erro de tipo, e deixá-lo nos dois lados entregaria um campo sempre false que a UI não tem como usar.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.ts',
      kind: 'replace',
      pattern: 'omits passwordHash and twoFactorSecret',
      replacement: 'omits passwordHash',
      reason:
        'Doc-comment (user.mapper.ts:6). A regra "nunca vazar segredo" continua valendo; só o exemplo do 2FA deixa de existir.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled',
      reason: '7 asserções sobre o campo (map F3(b)); todas falham depois do mapper podado.',
    },

    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "it\\('shows an inline error when the 2FA code is rejected",
        end: '\\}\\);',
      },
      reason:
        'Teste do erro 401 no passo do código (login.test.tsx:215-235). O passo do código sai com a feature, então não há formulário onde digitar.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "it\\('toasts a generic error when 2FA verify fails unexpectedly",
        end: '\\}\\);',
      },
      reason:
        'Teste do 500 no `POST /auth/2fa/verify` (login.test.tsx:236-258) — rota que a API deixa de servir.',
    },

    // ─── specs que SOBREVIVEM e mencionam 2FA de passagem ────────────────────────
    //
    // Estes não saem com a feature: cobrem login limpo, o mapper e o serviço de usuários,
    // que continuam existindo. O que sai é a MENÇÃO. Descobertos rodando `pnpm test` no
    // projeto gerado: o `pnpm typecheck` do boilerplate não cobre `*.spec.ts`, então esta
    // classe de erro só aparece no jest, via ts-jest.
    {
      file: 'apps/api/src/modules/auth/services/auth.service.spec.ts',
      kind: 'replace',
      pattern: ',?\\s*twoFactorEnabled: (?:true|false)',
      replacement: '',
      reason:
        'A propriedade em `makeUser({ … })` dentro de testes que SOBREVIVEM (o de sucesso limpo do login, por exemplo). Removida como propriedade, não como linha: ela divide a linha com `id` e `failedLoginAttempts`.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorSecret',
      reason:
        'A fixture e a asserção de `twoFactorSecret` no teste "NEVER leaks the password hash or the 2FA secret" — o teste FICA (a metade do `passwordHash` é core), só as linhas do segredo de TOTP saem.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.spec.ts',
      kind: 'replace',
      pattern: 'NEVER leaks the password hash or the 2FA secret',
      replacement: 'NEVER leaks the password hash',
      reason:
        'O título do teste passa a prometer o que ele ainda verifica. Título que cita um campo inexistente é o que faz alguém procurar a cobertura que não existe.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'replace',
      pattern:
        'new UsersService\\(prisma, twoFactor, tokenService, config, cache, queue\\)',
      replacement: 'new UsersService(prisma, tokenService, cache, queue)',
      reason:
        'O spec instancia o service à mão e POSICIONALMENTE. Com `TwoFactorService` e o `ConfigService` fora do construtor (o único env que ele lia era `TWO_FACTOR_REQUIRED`), passar seis argumentos dá `TS2554`. Ajustar a ordem sem ajustar a contagem seria pior: compilaria com `cache` no lugar de `tokenService`.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*let (twoFactor|config): any;|^\\s*config = \\{ get: jest\\.fn',
      reason:
        'As declarações dos dois doubles que saíram do construtor. Sem removê-las, `noUnusedLocals` do tsconfig de teste derruba a suíte.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropBalancedBlock',
      pattern: '^\\s*twoFactor = \\{',
      reason:
        'O corpo do double de 2FA na fixture. `dropBalancedBlock` porque o objeto tem chaves aninhadas nos `jest.fn()`.',
    },

    // ─── users module ────────────────────────────────────────────────────────────    // ─── users module ────────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropImportSpecifier',
      pattern: 'SecurityStatus|TwoFactorEnableResponse|TwoFactorSetupResponse',
      reason:
        "Três especificadores do `import type { … } from '@dontpanic/shared'` (users.controller.ts:17,19-20), todos referenciados apenas pelas rotas removidas abaixo.",
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropImport',
      pattern: 'skip-two-factor-gate\\.decorator',
      reason: 'users.controller.ts:25 — decorator apagado.',
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropImportSpecifier',
      pattern: 'TwoFactorDisableDto|TwoFactorEnableDto',
      reason: 'Especificadores do import de ./dto/users.dto (users.controller.ts:31-32).',
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'replace',
      pattern: 'profile, credentials, 2FA management and LGPD data rights',
      replacement: 'profile, credentials and LGPD data rights',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Doc da classe (users.controller.ts:39).",
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropClassMember',
      pattern: 'security',
      reason:
        'GET /users/me/security (users.controller.ts:62-67) devolve o SecurityStatus que dirige o onboarding do 2FA; é a única rota consumida pelo TwoFactorGate do web, que já foi apagado. Membro, não faixa de linhas: @Get + @SkipTwoFactorGate + @ApiOperation precedem o nome.',
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropClassMember',
      pattern: 'setupTwoFactor|enableTwoFactor|snoozeTwoFactor|disableTwoFactor',
      reason:
        'As quatro rotas me/2fa/{setup,enable,snooze,disable} (users.controller.ts:87-127). Mesmo motivo do anterior: cada uma vem com @Post + @SkipTwoFactorGate + @HttpCode + @ApiOperation antes do nome do método.',
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropLinesMatching',
      pattern: '@SkipTwoFactorGate\\(\\)',
      reason:
        'Sobra o decorator em GET me (users.controller.ts:56) depois de os outros membros saírem; sem o arquivo do decorator o TS não resolve o identificador.',
    },
    {
      file: 'apps/api/src/modules/users/dto/users.dto.ts',
      kind: 'dropImportSpecifier',
      pattern: 'twoFactorEnableSchema|twoFactorDisableSchema',
      reason: 'users.dto.ts:7-8 — schemas removidos de packages/shared.',
    },
    {
      file: 'apps/api/src/modules/users/dto/users.dto.ts',
      kind: 'dropLinesMatching',
      pattern: 'class TwoFactor(Enable|Disable)Dto extends createZodDto',
      reason: 'users.dto.ts:20-21 — os dois DTOs de uma linha cada.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropImportSpecifier',
      pattern:
        'TwoFactorDisableInput|TwoFactorEnableInput|TwoFactorSetupResponse|SecurityStatus',
      reason: "Quatro especificadores de '@dontpanic/shared' (users.service.ts:19-21,25).",
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropImport',
      pattern: 'auth/services/two-factor\\.service',
      reason:
        'Import do `TwoFactorService` em `users.service.ts:34`. O service inteiro é apagado por `deletePaths`, então sem esta costura sobra um import apontando para arquivo inexistente — `TS2307`, no arquivo que serve TODA a tela de perfil.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'readonly twoFactor:\\s*TwoFactorService,',
      reason:
        'Parâmetro do construtor (users.service.ts:58) — dependência de DI que o UsersModule só conseguia satisfazer pelo export do AuthModule, já removido.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'const PENDING_2FA_TTL\\s*=',
      reason: 'users.service.ts:47 (com a linha de doc acima, casada pelo mesmo passo se o engine levar o comentário adjacente).',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropCommentSection',
      pattern: '--- 2FA ',
      reason:
        'Seção banner inteira (users.service.ts:124-245): pendingSecretKey, getSecurityStatus, snoozeTwoFactorPrompt, setupTwoFactor, enableTwoFactor, disableTwoFactor. Corta até (exclusive) o próximo banner `// --- active sessions …`; um dropBlock inclusivo comeria esse cabeçalho e um dropLinesMatching não alcança 120 linhas de corpo com chaves aninhadas.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactor(Enabled: false|Secret: null),',
      reason:
        'Anonimização do eraseAccount (users.service.ts:425-426). Sai com as colunas do Prisma; deixar as duas linhas faz o Prisma Client rejeitar a escrita com "Unknown argument".',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'tx\\.twoFactorBackupCode\\.deleteMany',
      reason:
        'users.service.ts:430 — delegate que deixa de existir no client gerado quando o model TwoFactorBackupCode sai do schema.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'cache\\.del\\(this\\.pendingSecretKey',
      reason:
        'users.service.ts:434 e o comentário "Kill every session and the pending-2FA cache entry" acima dele: pendingSecretKey saiu com a seção 2FA.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'readonly config:\\s*ConfigService<Env, true>,',
      required: false,
      // CHECK do map F3(b): `this.config` no UsersService é usado só por
      // getSecurityStatus (linha 133), que sai com a seção. Verificado no repo: é o
      // único uso. Ainda assim required:false — se um produto acrescentar qualquer
      // leitura de env neste serviço, a linha passa a ser legítima e a geração não
      // deve morrer por isso.
      reason:
        'ConfigService/Env no construtor do UsersService (users.service.ts:27,60) tem como único consumidor getSecurityStatus, que sai com a seção 2FA — um parâmetro não usado falha o noUnusedParameters. Ausência legítima se o serviço tiver ganhado outro leitor de env.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('(getSecurityStatus|snoozeTwoFactorPrompt)'", end: '\\}\\);' },
      reason: "Bloco de teste/c\u00f3digo que cobre o que foi removido: deix\u00e1-lo derruba a su\u00edte do projeto gerado no primeiro `pnpm test` de um clone novo \u2014 que \u00e9 a falha que treina o usu\u00e1rio a apagar o teste em vez de confiar nele. Proven\u00e2ncia: users.service.spec.ts:72-119.",
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('(setupTwoFactor|enableTwoFactor|disableTwoFactor)'", end: '\\}\\);' },
      reason: "Bloco de teste/c\u00f3digo que cobre o que foi removido: deix\u00e1-lo derruba a su\u00edte do projeto gerado no primeiro `pnpm test` de um clone novo \u2014 que \u00e9 a falha que treina o usu\u00e1rio a apagar o teste em vez de confiar nele. Proven\u00e2ncia: users.service.spec.ts:184-312.",
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      // A âncora ampla `twoFactor(Enabled|Secret|BackupCode)` removia LINHAS, e uma delas
      // era `prisma.user.findUnique.mockResolvedValue(makeUser({ id: 'u1', passwordHash:
      // 'SECRET-HASH', twoFactorSecret: 'TOTP-SECRET' }))` — o mock do usuário do teste de
      // export de LGPD. Sem ele o service não achava usuário e o teste falhava com
      // `NotFoundException`, a quilômetros da causa. Propriedade sai como PROPRIEDADE.
      kind: 'replace',
      pattern: ',?\\s*twoFactor(?:Enabled|Secret|RemindAt): [^,}\\n]+',
      replacement: '',
      reason:
        'As propriedades 2FA nas fixtures de testes que SOBREVIVEM (export de LGPD e anonimização). Removidas como propriedade e não como linha: elas dividem a linha com `id` e `passwordHash`, que o teste precisa.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropLinesMatching',
      // Só linhas que são STATEMENT COMPLETO: o delegate do Prisma na fixture e as
      // asserções sobre campos que já não existem.
      pattern:
        "^\\s*twoFactorBackupCode:|^\\s*expect\\((?:out\\.profile|updateCall\\.data)[^)]*twoFactor|^\\s*expect\\(cache\\.del\\)\\.toHaveBeenCalledWith\\('2fa:pending",
      reason:
        'O delegate `twoFactorBackupCode` do mock de Prisma, as duas asserções sobre `updateCall.data.twoFactor*` na anonimização, a asserção de que o export não vaza `twoFactorSecret`, e a de que a erasure limpa a chave de cache `2fa:pending:<id>`. Os TESTES ficam — provam a erasure LGPD e o export, que são core.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'replace',
      pattern: 'anonymizes the row, wipes 2FA, revokes sessions and clears the pending cache',
      replacement: 'anonymizes the row and revokes sessions',
      reason:
        'O título passa a prometer só o que o teste ainda verifica. Um título que cita "wipes 2FA" num projeto sem 2FA manda o próximo dev procurar cobertura inexistente.',
    },
    {
      file: 'apps/api/src/modules/users/users.module.ts',
      kind: 'dropLinesMatching',
      pattern: '2FA management \\(setup/enable/disable\\)|exported TwoFactorService',
      reason:
        'Duas linhas de doc-comment (users.module.ts:7-8,10-11) que descrevem por que o módulo importa o AuthModule; sem 2FA a razão citada é falsa.',
    },

    // ─── admin ───────────────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled: u\\.twoFactorEnabled,',
      reason: 'toAdminUser (admin-users.service.ts:44) — o campo sai de adminUserSchema.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactor(Enabled: false|Secret: null),',
      reason:
        'Escrita de anonimização do soft-delete administrativo (admin-users.service.ts:139-140): argumentos que o Prisma Client deixa de conhecer.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled: false,',
      reason: 'Fixture (admin-users.service.spec.ts:16).',
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled: false,',
      required: false,
      reason:
        'Fixture de usuário (invitations.service.spec.ts:60). Ausência legítima quando a feature invitations também foi removida — o arquivo já não existe.',
    },

    // ─── decorators / tenancy ────────────────────────────────────────────────────
    {
      file: 'apps/api/src/common/decorators/sensitive-throttle.decorator.ts',
      kind: 'replace',
      pattern: 'credentials,\\s*\\n?\\s*\\*?\\s*e-mail codes, TOTP, reset tokens',
      replacement: 'credentials,\n * e-mail codes, reset tokens',
      reason:
        'Doc do @SensitiveThrottle (sensitive-throttle.decorator.ts:10). Só prosa — mas é a prosa que define QUANDO aplicar o decorator, e "rota nova de auth sem @SensitiveThrottle()" é item do "O que NÃO fazer".',
    },
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'replace',
      pattern: "'modules/auth/auth\\.controller\\.ts:8'",
      replacement: "'modules/auth/auth.controller.ts:7'",
      reason:
        'REGRA GLOBAL 2 do map (linhas 46-54): a allowlist de @SystemScope() é asserção de array EXATO, computada e não copiada. POST /auth/2fa/verify é uma das 8 rotas system-scoped do auth.controller; removendo-a a contagem cai para 7. Emitir o 8 num projeto podado dá suíte vermelha em clone novo, o que TREINA o usuário a editar a asserção — destruindo justamente o guard que impede @SystemScope() de vazar para rota de negócio.',
    },
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'replace',
      pattern: 'login, 2fa/verify,',
      replacement: 'login,',
      reason:
        'O comentário da allowlist (system-scope.decorator.spec.ts:51-54) enumera as rotas na ordem em que o walker as encontra; deixar 2fa/verify ali torna a contagem 7 inexplicável para quem for auditar.',
    },

    // ─── testes / config da API ──────────────────────────────────────────────────
    {
      file: 'apps/api/test/factories.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactor(Enabled: false|Secret: null),',
      reason: 'makeUser (test/factories.ts:14-15) — a fixture tem que casar com o tipo User gerado.',
    },
    {
      file: 'apps/api/test/auth.e2e-spec.ts',
      kind: 'dropImport',
      pattern: 'otplib',
      reason:
        'test/auth.e2e-spec.ts:1 — último importador de otplib junto com two-factor.service.ts; é o que libera a remoção da dependência.',
    },
    {
      file: 'apps/api/test/auth.e2e-spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('enables 2FA and completes a TOTP login challenge", end: '\\}\\);' },
      reason: "Bloco de teste/c\u00f3digo que cobre o que foi removido: deix\u00e1-lo derruba a su\u00edte do projeto gerado no primeiro `pnpm test` de um clone novo \u2014 que \u00e9 a falha que treina o usu\u00e1rio a apagar o teste em vez de confiar nele. Proven\u00e2ncia: test/auth.e2e-spec.ts:494-535 aprox.",
    },
    {
      file: 'apps/api/test/auth.e2e-spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('rejects a 2FA challenge with a wrong code", end: '\\}\\);' },
      reason:
        'test/auth.e2e-spec.ts:536-576 aprox. Este arquivo é dono de um prefixo de slug/e-mail e limpa o que semeou com DELETE (regra 1 da suíte e2e determinística): remover um it() não afeta a limpeza, mas NUNCA troque por TRUNCATE.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      // Faltava, e o sintoma não parecia com a causa. Com a tabela apagada pelo schema, o
      // `TRUNCATE` do `resetDb()` aborta com `42P01 relation "two_factor_backup_codes" does
      // not exist` — no `beforeEach` (todo teste da suíte falha) e no `afterAll`. Como o
      // `afterAll` das suítes chama `resetDb()` ANTES de `app.close()`, a exceção pula o
      // fechamento, o servidor Nest fica escutando, e o Jest espera para sempre por um
      // handle aberto: a conformidade do preset mínimo ficou 17 minutos parada em
      // `test:e2e`, sem conexão nenhuma no Postgres. Mesma costura que `plans` e `oauth`
      // já tinham para as tabelas deles.
      pattern: '"two_factor_backup_codes",\\s*',
      replacement: '',
      reason:
        'O `TRUNCATE TABLE` do `resetDb()` nomeia as tabelas de domínio explicitamente; `two_factor_backup_codes` sai com o model `TwoFactorBackupCode`, e citar tabela inexistente derruba toda suíte e2e no primeiro reset — e, pelo `afterAll`, deixa a app aberta e o Jest pendurado.',
    },
    {
      file: 'apps/api/jest.config.js',
      kind: 'replace',
      pattern:
        '// Only our own TypeScript\\.[\\s\\S]*?untransformed\\.',
      replacement: '// Only our own TypeScript. node_modules stays untransformed.',
      reason:
        'Comentário do transform (jest.config.js:8-10) explica a cadeia ESM otplib + @otplib/* + @scure/base, que deixa de existir. É o mesmo raciocínio que sustenta a trava `node >=24.9` no CLAUDE.md — as duas prosas têm que cair juntas ou a trava fica sem justificativa registrada.',
    },
    {
      file: 'apps/api/tsconfig.e2e.json',
      kind: 'dropBlock',
      block: { start: 'Lets ts-jest transpile the one ESM-only dependency', end: '"checkJs": false' },
      reason:
        'O bloco allowJs/checkJs (tsconfig.e2e.json:4-10) existe EXCLUSIVAMENTE por causa de @scure/base sob otplib; sem otplib o arquivo pode estender tsconfig.spec.json sem override nenhum. Deixar allowJs ligado afrouxa o tsconfig mais estrito do repo — o do e2e — sem que ninguém saiba por quê.',
    },

    // ─── SQL escrito à mão: UMA entrada de array ─────────────────────────────────
    // O 2FA é dono de UMA entrada dentro do array literal da função de RLS escrita à
    // mão `app.apply_user_owned_rls()` (fragmento `rls-03-user-owned-function`,
    // migration 20260911105200_row_level_security linhas 96-122). Se a entrada ficar
    // para trás, NADA quebra: cada elemento do FOREACH é envolvido por
    // `IF EXISTS (SELECT 1 FROM pg_class …)`, então o loop simplesmente pula a tabela
    // ausente (map §5.1, linhas 5016-5018). Se o guard algum dia sair, a mesma linha
    // passa a derrubar a migration com `relation "two_factor_backup_codes" does not
    // exist` — é o defeito que o map aponta em `rls-04` (permissions), o único
    // fragmento SEM guard. Por isso: required:false, e a armadilha de ordem do map
    // F3(j) continua valendo — a função é emitida COM a lista embutida, então o
    // gerador tem que emitir o corpo já editado; não existe "emitir e depois
    // consertar".
    {
      file: 'apps/api/prisma/migrations/20260911105200_row_level_security/migration.sql',
      // `dropArrayEntry` NÃO serve: ele localiza o array por `<propriedade>: [`, e isto é
      // SQL — `FOREACH t IN ARRAY ARRAY[...]`, sem propriedade nenhuma. Um `replace` que
      // come a VÍRGULA ANTERIOR junto é o que preserva a entrada vizinha: no template as
      // duas dividem a linha física
      // (`'email_verification_tokens', 'two_factor_backup_codes'`), e um
      // `dropLinesMatching` aqui tiraria a proteção de RLS de `email_verification_tokens`,
      // que é tabela CORE — RLS ausente numa tabela core é a falha silenciosa que o §5.3
      // do mapa descreve.
      kind: 'replace',
      pattern: ",\\s*'two_factor_backup_codes'",
      replacement: '',
      required: false,
      reason:
        "Entrada do array de tabelas user-owned em app.apply_user_owned_rls() (fragmento rls-03-user-owned-function). CONTRADIÇÃO NO MAP, resolvida para o lado tolerante: F3(j) diz que a linha \"must\" virar só 'email_verification_tokens', enquanto §4 (linha 4974) e §5.1 dizem que o IF EXISTS por entrada torna a edição \"optional tidiness, never a correctness requirement\". Fica como limpeza opcional: um dropLinesMatching aqui seria ERRADO — a entrada compartilha a linha física com 'email_verification_tokens', e apagar a linha removeria a proteção de RLS de uma tabela core. Daí o kind dropArrayEntry, que remove o elemento e a vírgula adjacente.",
    },

    // ─── web ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/web/src/app/(dashboard)/layout.tsx',
      kind: 'dropImport',
      pattern: 'components/two-factor-gate',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: layout.tsx:2.",
    },
    {
      file: 'apps/web/src/app/(dashboard)/layout.tsx',
      kind: 'dropLinesMatching',
      pattern: '<TwoFactorGate\\s*/>',
      reason:
        'layout.tsx:14 — o gate é montado no shell do dashboard, fora de qualquer página; deixá-lo renderiza um componente inexistente e o Next quebra em toda rota autenticada de uma vez.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/profile/page.tsx',
      kind: 'dropImport',
      pattern: 'components/profile/two-factor-card',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: profile/page.tsx:12.",
    },
    {
      file: 'apps/web/src/app/(dashboard)/profile/page.tsx',
      kind: 'dropLinesMatching',
      pattern: '<TwoFactorCard user=\\{user\\} />|<Separator />\\s*(?=\\s*<SessionsCard)',
      reason:
        'profile/page.tsx:59-60 — o card e UM dos <Separator /> vizinhos (a aba "security" alterna card/separador; sobrando, aparecem dois traços colados). A rota /profile FICA: password, sessions e danger continuam lá.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropLinesMatching',
      pattern: 'u\\.twoFactorEnabled &&',
      reason:
        'Badge "2FA" na tabela de usuários da empresa (admin/page.tsx:151). Sai porque adminUserSchema perde o campo — é erro de tipo, não só estética.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImportSpecifier',
      pattern: 'ShieldCheck',
      reason: "Ícone lucide usado só no cabeçalho do card de 2FA (login/page.tsx:8).",
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImportSpecifier',
      pattern: 'TWO_FACTOR_TICKET_COOKIE',
      reason:
        "Especificador de '@dontpanic/shared' (login/page.tsx:12). A constante sai do pacote compartilhado nesta mesma remoção.",
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImport',
      pattern: '@/lib/cookies',
      reason:
        'login/page.tsx:23 — readCookie/clearCookie só servem ao handoff de ticket do OAuth neste arquivo. lib/cookies.ts NÃO é apagado (helpers genéricos), só este import.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropLinesMatching',
      pattern: 'type LoginUserResponse = Extract<LoginResponse',
      reason:
        'login/page.tsx:40 — o alias existe para estreitar a união LoginResponse, que colapsa em packages/shared. Sem ele, `api` (login/page.tsx:19) também perde o único uso de produção nesta tela.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropLinesMatching',
      // `const [ticket, setTicket] = …`: a âncora precisa do par completo do destructuring.
      // A versão anterior casava `const [ticket]`, que não existe no arquivo.
      pattern: 'const \\[(ticket|code|verifying), set',
      reason:
        'Estado do desafio (login/page.tsx:56-59): ticket, code, verifying, com o comentário "2FA challenge state" acima. Sem remover, o React fica com estado morto e o lint de variável não usada falha o build do web.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'A social sign-in that owed a second factor comes back as',
        end: '\\}, \\[searchParams, tOauth\\]\\);',
      },
      required: false,
      reason:
        'O useEffect do handoff por cookie `?twofactor=1` (login/page.tsx:87-118) e seu doc-comment. É caminho EXCLUSIVO de oauth (map F3(b) marca "oauth-only path"), então ausência é legítima se oauth já foi removido — o manifesto de oauth apaga o mesmo bloco. Cuidado: existe um SEGUNDO useEffect terminando com o mesmo `}, [searchParams, tOauth]);` logo acima (o de erro de OAuth); é por isso que o start ancora na frase do doc-comment, não no `useEffect(`.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlock',
      block: { start: "'twoFactorRequired' in res", end: '\\}' },
      reason:
        'login/page.tsx:148-151 — o desvio no submit de senha. Depois do colapso da união em packages/shared, `"twoFactorRequired" in res` deixa de tipar.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlock',
      block: { start: 'const onVerify = async', end: '\\};' },
      reason:
        'Handler do segundo passo (login/page.tsx:170-190), que chama POST /auth/2fa/verify — rota que já não existe na API.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlock',
      block: { start: 'if \\(ticket\\) \\{', end: 'key="login-2fa"[\\s\\S]*?\\n\\s*\\}' },
      reason:
        'O branch inteiro que troca o card pelo passo do código (login/page.tsx:192-233). O `key="login-2fa"` é a âncora estável dentro do JSX — a marcação em volta é a que mais muda entre refactors de UI.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropLinesMatching',
      pattern: 'twoFactor(Title|Subtitle)|^\\s*code:|^\\s*verify:',
      reason:
        'Fixture de mensagens (login.test.tsx:59-63): twoFactorTitle/twoFactorSubtitle saem, e code/verify ficam mortos junto.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: { start: "it\\('swaps to the 2FA step when the API requires it", end: '\\}\\);' },
      reason: "Bloco de teste/c\u00f3digo que cobre o que foi removido: deix\u00e1-lo derruba a su\u00edte do projeto gerado no primeiro `pnpm test` de um clone novo \u2014 que \u00e9 a falha que treina o usu\u00e1rio a apagar o teste em vez de confiar nele. Proven\u00e2ncia: login.test.tsx:146-160.",
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "it\\('completes login through the 2FA step",
        end: '\\}\\);',
      },
      reason:
        'Os três testes de conclusão do 2FA (login.test.tsx:190-256). ATENÇÃO ao threshold: vitest.config.mts inclui src/app/(auth)/login/**/*.tsx na cobertura e fixa statements em 99 medidos COM o branch de 2FA na página — o gerador tem que remedir depois de podar (regra global 3).',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: { start: "describe\\('LoginPage — second factor after social sign-in", end: '\\}\\);' },
      required: false,
      reason:
        'Bloco 2fa × oauth (login.test.tsx:340-406). Ausência legítima quando oauth foi removido antes — o manifesto de oauth apaga o mesmo describe.',
    },
    {
      file: 'apps/web/src/lib/cookies.test.ts',
      kind: 'replace',
      pattern: 'dp_2fa_ticket',
      replacement: 'dp_demo_cookie',
      reason:
        'lib/cookies.test.ts:22-23,32-34,62-66 usa o nome do cookie de 2FA apenas como literal de fixture; o arquivo testado (lib/cookies.ts) é genérico e FICA. Trocar o literal, não apagar o teste — apagar derrubaria a cobertura de src/lib/**, que vitest.config.mts inclui.',
    },

    // ─── packages/shared ─────────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'dropBlock',
      block: {
        start: 'When a user with 2FA logs in, the API returns a short-lived ticket',
        end: 'export type TwoFactorEnableResponse',
      },
      reason:
        'packages/shared/src/auth.ts:44-88 — os seis pares schema+tipo do 2FA (challenge, verify, enable, disable, setupResponse, enableResponse) são contíguos e ficam ENTRE resetPasswordSchema e authUserResponseSchema. Um só dropBlock ancorado no primeiro doc-comment e no último `export type` evita seis costuras frágeis. packages/shared é a fronteira de contrato: o que sai daqui é o que impede api e web de divergirem.',
    },
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'replace',
      pattern:
        '/\\*\\*\\s*\\n \\* Login can either succeed[\\s\\S]*?\\*/\\s*export const loginResponseSchema =[^;]*;\\s*export type LoginResponse =[^;]*;',
      replacement:
        '/** Login succeeds and returns the public user; tokens ride in httpOnly cookies. */\nexport const loginResponseSchema = authUserResponseSchema;\nexport type LoginResponse = AuthUserResponse;',
      reason:
        'A união loginResponseSchema (auth.ts:96-101) colapsa. MANTER o NOME como alias em vez de apagá-lo é decisão deliberada do map F3(d): há muitos call-sites importando LoginResponse (hooks/use-auth, login/page, auth.controller), e transformá-los todos multiplicaria as costuras sem ganho. Consequência: o retorno Promise<LoginResponse> do auth.controller.ts continua correto sem ser tocado.',
    },
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Cookie carrying a pending two-factor ticket from an OAuth callback',
        end: "TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket'",
      },
      reason:
        'auth.ts:141-155 — o constante do cookie e seu doc-comment. Mora no shared porque as DUAS metades leem o nome; um nome que casasse por coincidência falharia do jeito mais silencioso possível (a API entrega um ticket que a página nunca procura). Nota de direção: se 2fa fica e OAUTH sai, esta constante sai também (é canal exclusivo do redirect, como o próprio doc diz) — nesse caso a costura é do manifesto de oauth.',
    },
    {
      file: 'packages/shared/src/user.ts',
      kind: 'dropLinesMatching',
      pattern: 'twoFactorEnabled: z\\.boolean\\(\\),',
      reason:
        'Duas ocorrências: userDtoSchema (user.ts:20) e adminUserSchema (user.ts:85), as duas ÓRFÃS sem a feature. O userDtoSchema é o que o user.mapper.ts preenche — os dois lados têm que cair juntos.',
    },
    {
      file: 'packages/shared/src/user.ts',
      kind: 'dropBlock',
      block: {
        start: 'Drives the 2FA onboarding: forced setup \\(required\\) or a snoozable prompt',
        end: 'export type SecurityStatus',
      },
      reason:
        'securityStatusSchema + SecurityStatus (user.ts:26-32), contrato de GET /users/me/security, rota removida.',
    },
    {
      file: 'packages/shared/src/user.ts',
      kind: 'replace',
      pattern: 'password hash, 2FA secret, backup codes,\\s*\\n?\\s*\\*?\\s*raw tokens',
      replacement: 'password hash, raw tokens',
      reason:
        'Doc do userDataExportSchema (user.ts:131-132). A regra "segredo nunca sai no export LGPD" continua; só a lista de exemplos encolhe.',
    },
    // packages/shared/src/index.ts: NENHUMA costura. O barrel (linhas 6-14) é só
    // star-export de arquivos inteiros, e nenhum arquivo de shared é exclusivo do
    // 2FA — só invitation.ts e oauth.ts são deleções de arquivo inteiro no repo.

    // ─── env ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: { start: 'TOTP_ISSUER:\\s*z\\.string\\(\\)', end: 'TWO_FACTOR_REQUIRED:\\s*boolish' },
      reason:
        'env.ts:40-43 — as duas chaves e o comentário de duas linhas entre elas, num bloco contíguo. validateEnv() NÃO tem branch de 2FA (env.ts:234-285 só condiciona captcha e OAuth), então não há validação cruzada para podar — ao contrário de captcha/oauth, onde meio-ligado é armadilha.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'replace',
      // A enumeração atravessa a quebra de linha: `(login, register,` fecha a linha 80 e
      // `password reset, 2FA).` abre a 81. A âncora casa só a metade da segunda linha.
      pattern: 'password reset, 2FA\\)',
      replacement: 'password reset)',
      reason: 'Comentário do orçamento de rate limit sensível (env.ts:80-81).',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'env\\.TOTP_ISSUER',
      reason:
        'env.spec.ts:26 — asserção de default dentro do teste "defaults"; a chave deixa de existir no schema Zod e o TS reclama antes do Jest.',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: { start: '# 2FA \\(TOTP\\)', end: 'TWO_FACTOR_REQUIRED=' },
      reason:
        '.env.example:75-79 — cabeçalho, as duas linhas de comentário explicando modo obrigatório vs. prompt, e a chave. envKeys cuida das chaves; este bloco leva o comentário junto para o arquivo não ficar com prosa sobre uma chave ausente.',
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern: 'resend-verification, 2fa/verify, forgot/reset-password',
      replacement: 'resend-verification, forgot/reset-password',
      reason:
        '.env.example:101-102 — a prosa do AUTH_RATE_LIMIT_MAX lista as rotas sensíveis; uma delas deixa de existir.',
    },

    // seed: NENHUMA costura. Map F3(g) — grep de twoFactor|2fa|TOTP em prisma/seed.ts
    // não retorna nada; os usuários semeados deixam as colunas no default do schema.

    // ─── CLAUDE.md ───────────────────────────────────────────────────────────────
    // Nenhuma seção inteira sai (ver docSections). São frases e um bullet.
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'auth, 2FA, perfil',
      replacement: 'auth, perfil',
      reason: 'Blurb de abertura (CLAUDE.md:4) enumera o que vem de fábrica.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '\\s*\\*\\*2FA TOTP\\*\\* \\+ códigos de backup\\.',
      replacement: '',
      reason:
        'Frase dentro do bullet de "Autenticação (resumo)" (CLAUDE.md:73). O bullet fala de CSRF, 2FA e lockout numa linha só — sai a frase, ficam as outras duas.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        'Foi exatamente assim que o `TwoFactorGateGuard` virou um no-op silencioso\\.',
      replacement:
        'Um guard assim que conclui "usuário não existe" e libera é o modo de falha exato desta regra.',
      reason:
        'CLAUDE.md:110-115, "Guard que lê o banco tem que abrir escopo próprio". A REGRA NÃO SAI — ela é o aviso load-bearing para QUALQUER guard que leia o banco, e é o incidente que o TwoFactorGateGuard documenta. Removendo a feature, o projeto gerado perde o único exemplo trabalhado in-repo, então o exemplo é substituído, nunca a regra (map F3(h) é explícito: "Keep the rule, replace the example").',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropMarkdownBullet',
      pattern: 'Login social NÃO pula o 2FA',
      required: false,
      reason:
        'Bullet inteiro (CLAUDE.md:354-365, ~12 linhas de texto corrido) dentro de "Login social › As decisões que não são negociáveis". Ausência legítima quando oauth também saiu — a seção "Login social" inteira vai como docSection do manifesto de oauth. dropMarkdownBullet e não dropLinesMatching porque o bullet ocupa uma dúzia de linhas físicas envolvidas.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'verify-email, resend-verification, 2fa/verify,',
      replacement: 'verify-email, resend-verification,',
      reason:
        'Lista de rotas com @SensitiveThrottle() na seção "Rate limit" (CLAUDE.md:424). Tem que casar com o código: "rota nova de auth sem @SensitiveThrottle()" é item do "O que NÃO fazer", e a lista é onde o dev confere.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '`passwordHash` / `twoFactorSecret`',
      replacement: '`passwordHash`',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Bullet de \"Conven\u00e7\u00f5es\" (CLAUDE.md:482).",
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        'O Jest só carrega ESM nativamente com `require\\(esm\\)` a partir daí\\. É o que permitiu \\*\\*apagar\\*\\* o `esm-to-cjs-transformer\\.js`\\.',
      replacement:
        'Piso de engine do projeto; suba só depois de rodar a suíte inteira no runtime novo.',
      reason:
        'Linha `node >=24.9` da tabela "Travas deliberadas" (CLAUDE.md:511). A justificativa registrada é a cadeia ESM do otplib/@scure — que sai com o 2FA. Uma trava sem motivo é pior que nenhuma: o próximo `pnpm update --latest` a reverte em silêncio e ninguém sabe dizer o que quebrou. Re-justificar, não apagar a linha.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'login→refresh→logout, 2FA, lockout',
      replacement: 'login→refresh→logout, lockout',
      reason: 'Descrição da suíte e2e na seção "Testes" (CLAUDE.md:519).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropMarkdownBullet',
      pattern: 'callback de OAuth sem checar `twoFactorEnabled`',
      required: false,
      reason:
        'Bullet de "O que NÃO fazer" (CLAUDE.md:580-581), de propriedade CONJUNTA 2fa × oauth (map, tabela de linhas 128-145) — sai com qualquer uma das duas remoções, e por isso pode já ter saído pelo manifesto de oauth. O CLAUDE.md gerado não deve avisar sobre feature que não foi instalada, mas o inverso é pior: manter o aviso sem o mecanismo treina o dev a ignorar a lista.',
    },

    // ─── README.md ───────────────────────────────────────────────────────────────
    // O README é bilíngue (pt e depois en) e as duas metades espelham as MESMAS
    // frases; cada costura abaixo casa as duas ocorrências de uma vez, o que é
    // desejado — metade traduzida divergindo da outra é o defeito clássico aqui.
    {
      file: 'README.md',
      kind: 'replace',
      pattern: '(auth), 2FA, ',
      replacement: '$1, ',
      reason:
        'Badge (README:12) e intro pt (README:57) enumeram "RLS no Postgres, auth, 2FA, planos…".',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'alongside auth, 2FA, profiles',
      replacement: 'alongside auth, profiles',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Intro en (README:353).",
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '\\*\\*2FA TOTP\\*\\* \\+ códigos de backup|\\*\\*TOTP 2FA\\*\\* \\+ backup codes',
      reason:
        'Bullets de feature nas duas metades (README:180 pt, README:477 en) — bullets de uma linha, ao contrário dos do CLAUDE.md.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'nem `twoFactorSecret`|nor `twoFactorSecret`',
      replacement: '',
      reason:
        'Os dois [!WARNING] espelhados (README:184-185 pt, 481-482 en) sobre o que o UserDto nunca retorna.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'logout, 2FA, lockout',
      replacement: 'logout, lockout',
      reason: 'Seções de teste espelhadas (README:295 pt, 594 en).',
    },

    // ─── i18n: as duas locales ou nenhuma ────────────────────────────────────────
    // REGRA GLOBAL 1 do map: pt-BR.json e en-US.json são line-for-line alinhados e
    // apps/web/src/i18n/messages.test.ts:18-25 compara as chaves em profundidade,
    // nomeando as órfãs. Remover de um e não do outro FALHA A SUÍTE — que é uma boa
    // falha (não dá para errar em silêncio), mas tem que ser respeitada: cada
    // dropJsonKey abaixo aparece DUAS vezes, uma por arquivo.
    ...['apps/web/messages/pt-BR.json', 'apps/web/messages/en-US.json'].flatMap((file) => [
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'auth.login.twoFactorTitle',
        reason:
          'Chave do card de 2FA no login (linha 36 nos dois arquivos). A paridade profunda é conferida por i18n/messages.test.ts — remover de um só arquivo derruba a suíte do web nomeando a órfã.',
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'auth.login.twoFactorSubtitle',
        reason: 'Par da anterior (linha 37 nos dois arquivos); mesma regra de paridade.',
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'auth.login.code',
        reason:
          'Rótulo "Código de 6 dígitos" (linha 38), usado só pelo passo do segundo fator — NÃO confundir com auth.verify.*, que é verificação de e-mail e FICA.',
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'auth.login.verify',
        reason: "Chave de i18n de uma tela que n\u00e3o existe mais. Os DOIS cat\u00e1logos s\u00e3o podados em lockstep (regra global 1 do mapa): `messages.test.ts` compara os conjuntos de chaves e nomeia a \u00f3rf\u00e3, ent\u00e3o podar um lado s\u00f3 d\u00e1 su\u00edte vermelha. Proven\u00e2ncia: Bot\u00e3o do passo do c\u00f3digo (linha 39).",
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'profile.twoFactor',
        reason:
          'Bloco inteiro de 11 chaves do TwoFactorCard (linhas 190-202). profile.sessions.* FICA — não tem relação.',
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'twoFactorPrompt',
        reason: 'Namespace top-level do prompt adiável (linhas 332-339).',
      },
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'twoFactorSetup',
        reason: 'Namespace top-level da tela de setup (linhas 340-354).',
      },
    ]),

    // ─── oauth × 2fa: o lado oauth do acoplamento ────────────────────────────────
    // Todas required:false — se o CLI honrar `oauth.requires = ['twoFactor']`, a
    // árvore de oauth já não existe quando estas costuras rodam.
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropImportSpecifier',
      pattern: 'TWO_FACTOR_TICKET_COOKIE',
      required: false,
      reason:
        "Especificador de '@dontpanic/shared' (oauth.service.ts:17). Ausente de forma legítima quando oauth já foi removido.",
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'First factor proved, second still owed',
        end: "kind: 'two-factor'; ticket: string \\}",
      },
      required: false,
      reason:
        'Membro da união CallbackOutcome com seu doc-comment (oauth.service.ts:66-78). Sem 2FA o membro é inalcançável; mantê-lo obrigaria os dois handlers abaixo a continuar existindo. Ausente se oauth saiu.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropBlock',
      block: { start: "outcome\\.kind === 'two-factor'", end: '\\}' },
      required: false,
      reason:
        'O handoff que seta o cookie e redireciona para /login?twofactor=1 (oauth.service.ts:228-242). Ausente se oauth saiu.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropBlock',
      block: { start: 'Second factor owed: stop here with a ticket', // O `return` está dentro do `if (user.twoFactorEnabled) {`, então parar nele deixa
        // o `}` do if órfão. O fim tem de INCLUIR o fechamento do bloco.
        end: "kind: 'two-factor', ticket \\};\\s*\\n\\s*\\}" },
      required: false,
      reason:
        'O desvio antes de emitir sessão (oauth.service.ts:320-331), que chama AuthService.createLoginTicket e audita auth.oauth.2fa_required. Com ele fora, resolveIdentity cai sempre em issueTokensForUser → { kind: "session" }. Ausente se oauth saiu.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropClassMember',
      pattern: 'twoFactorTicketCookie',
      required: false,
      reason:
        'Método privado de opções de cookie (oauth.service.ts:642-653), cujo maxAge é AuthService.LOGIN_TICKET_TTL — estático que esta remoção apaga, então deixá-lo é erro de compilação. Ausente se oauth saiu.',
    },
    // O `auth` do construtor só existia para chamar `createLoginTicket` no desvio que a
    // costura acima apaga — e o `exports: [AuthService]` do AuthModule sai nesta mesma
    // remoção (costura de auth.module.ts). Deixar a injeção compila (noUnusedLocals está
    // desligado no base), mas o Nest não resolve um provider que o módulo importado não
    // exporta: o erro só aparece no boot, isto é, no e2e e em produção, nunca no `tsc`.
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*private readonly auth: AuthService,\\s*$',
      required: false,
      reason:
        'Parâmetro do construtor (oauth.service.ts:109) sem uso depois do desvio de 2FA, e injetando um provider que o AuthModule deixa de exportar. Ausente se oauth saiu.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropImportSpecifier',
      // Âncora exata: `RequestContext`, do mesmo import, continua em uso.
      pattern: '^AuthService$',
      target: '\\.\\./services/auth\\.service$',
      required: false,
      reason:
        'Especificador (oauth.service.ts:36). Sem o parâmetro do construtor e sem `AuthService.LOGIN_TICKET_TTL` (saiu com twoFactorTicketCookie), sobra só a menção num comentário. Ausente se oauth saiu.',
    },

    // ── oauth.service.spec.ts — o spec acompanha o service ──────────────────────────
    //
    // A costura antiga (`dropLinesMatching 'two-factor|2fa_required|twoFactorEnabled'`) foi
    // escrita contra um spec que tinha esses literais nos testes. O do template v0.4.0 prova
    // o caminho de segundo fator num `describe` próprio que não contém nenhum deles: a
    // costura só levava a linha `userRow({ twoFactorEnabled: true })` de dentro do describe,
    // e o import de `TWO_FACTOR_TICKET_COOKIE` (que sai do shared nesta remoção) ficava —
    // TS2305 em toda a família oauth=1 / twoFactor=0. Agora cada peça sai pela estrutura
    // (o describe inteiro, o import, o double), e nenhuma âncora toca a linha do `ctx` com
    // `locale`, que é costura do manifesto de i18n. Todas `required: false`: o arquivo só
    // existe com oauth ligado.
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropBlockWithLeadingDoc',
      // O `end` confere o fechamento que o `dropBlock` acha por contagem a partir do
      // `describe(` — os `it` de dentro fecham indentados e não casam `^`.
      block: {
        start: "^describe\\('OAuthService — [^']*second factor'",
        end: '^\\}\\);',
      },
      required: false,
      reason:
        'O describe dos quatro testes do handoff para o código TOTP, com o doc-comment que explica o downgrade que ele fecha. Sem 2FA não há fator a contornar: o callback sempre emite sessão, o que o describe "known identity" já prova.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropImportSpecifier',
      pattern: '^TWO_FACTOR_TICKET_COOKIE$',
      required: false,
      reason:
        'Só os testes do describe acima o usavam, e o export sai do shared nesta remoção (causa do TS2305). Se ficar sozinho no import, o statement inteiro sai.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropBlockWithLeadingDoc',
      // Bloco de uma linha: o `{` abre e fecha na própria linha, e o `end` a confere. O
      // "leading doc" aqui são os três `//` colados acima, que justificam o double.
      block: { start: '^\\s*const auth = \\{ createLoginTicket', end: 'createLoginTicket' },
      required: false,
      reason:
        'O double de AuthService e o comentário sobre compartilhar o ticket com o fluxo de senha. O service deixa de receber AuthService (costura acima).',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*auth as never,\\s*$',
      required: false,
      reason:
        'Sétimo argumento de `new OAuthService(...)`. Com o parâmetro fora do construtor, sobrar dá TS2554 (esperava 6, recebeu 7).',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'replace',
      pattern: 'cookies, auth \\}',
      replacement: 'cookies }',
      required: false,
      reason: 'O `return` do `setup()` devolvia o double para o describe de 2FA consultar `kit.auth`.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropLinesMatching',
      // Só a PROPRIEDADE da fixture — roda depois do describe ter saído, e não pode casar
      // um `userRow({ twoFactorEnabled: true })` que por acaso sobreviva.
      pattern: '^\\s*twoFactorEnabled: false,\\s*$',
      required: false,
      reason:
        'Campo da fixture `userRow` (oauth.service.spec.ts:44). A coluna sai do model User nesta remoção; o double é um objeto solto e compilaria, mas descreveria uma linha que o banco não tem.',
    },
  ],
};

export const filesManifest: FeatureManifest = {
  id: 'files',
  label: 'Upload de arquivos + storage',
  summary:
    'Upload de avatar com normalização por sharp, port StorageProvider e adapters s3 (AWS/MinIO/R2) e local, atrás de STORAGE_DRIVER.',

  // ── QUAL NÍVEL DE REMOÇÃO ESTE MANIFESTO CODIFICA ───────────────────────────
  // O map (F4, linhas 1588-1593) define TRÊS níveis:
  //   (i)   local-only — mantém FilesModule, port e LocalStorageAdapter; sai só o
  //         S3StorageAdapter + spec, os S3_*, MinIO do compose e @aws-sdk/client-s3.
  //         `STORAGE_DRIVER` colapsa no literal `local`. É uma escolha de DRIVER,
  //         não de feature — pertence a DriverSelection.storage, não a este arquivo.
  //   (ii)  nada de upload — o que está codificado aqui.
  //   (iii) port fica, UI de avatar sai — o map desqualifica sozinho: "nada mais no
  //         repo injeta STORAGE_PROVIDER (avatar.service.ts:16 é o ÚNICO ponto de
  //         injeção), então esse nível entrega um port inalcançável". Manter
  //         core/storage/** + infra/storage/** + StorageModule no app.module.ts para
  //         ninguém consumir é código morto que o próximo dev vai confundir com
  //         extension point.
  // ESCOLHA: nível (ii), o mais forte, porque é o único que corresponde a "a feature
  // está desligada". (i) é a mesma feature com um adapter só — expressável por
  // driver; (iii) não é um produto que alguém queira.
  //
  // ACHADO DO MAP, vale registrar: `files` contribui ZERO SQL e ZERO tabelas Prisma.
  // Não há modelo de arquivo/upload nos 15 models do schema (map linhas 86-87 e
  // F4(j)); tudo que a feature toca é `User.avatarUrl`, uma coluna que
  // `prisma migrate diff` regera. Nenhum índice, nenhuma policy, nenhum GRANT.
  //
  // ARMADILHA HERDADA (map F4(b)), resolvida no boilerplate v0.4.0: `@fastify/static`
  // era declarado e nunca importado, e `LOCAL_STORAGE_PUBLIC_URL` apontava para uma rota
  // que a API não servia. Agora `main.ts` o registra quando STORAGE_DRIVER=local, com o
  // prefixo vindo de `infra/storage/local-static.ts`. No nível (ii) esse registro e os
  // imports dele saem junto com o diretório — ver as costuras de `main.ts` abaixo.

  // `requires` VAZIO, com evidência (map F4(k)):
  //  - NÃO depende de plans: `Plan.maxStorageMb` existe e aparece na UI da
  //    plataforma, mas NADA o impõe — PlanLimitsService lê só `maxUsers` e os
  //    contadores nomeados, e AvatarService nunca chama PlanLimitsService (injeta
  //    apenas PrismaService e STORAGE_PROVIDER). É um limite morto.
  //  - NÃO depende de multi-tenancy além da linha de User: a chave do objeto é
  //    `avatars/${userId}.webp`, prefixo PLANO, sem partição por tenant; o
  //    isolamento está só na escrita no banco (prisma.db.user.update dentro da
  //    transação com escopo). Consequência: build sem multi-tenancy não muda a chave
  //    — e quem for adicionar documentos por tenant depois NÃO deve copiar esse
  //    esquema de chave.
  //  - Health check não enumera storage (só database, cache, queue), então remover
  //    files não muda saída de /health nem mexe em @nestjs/terminus.

  deletePaths: [
    // Diretório inteiro — o map lista os 6 arquivos, mas nenhum outro módulo importa
    // FilesModule (UsersModule não importa; as rotas de avatar vivem em
    // @Controller('users/me/avatar') dentro do FilesController, registrado à parte).
    'apps/api/src/modules/files',
    // Port e adapters — nível (ii). `sniffImageType` e o spec vão junto no diretório.
    'apps/api/src/core/storage',
    'apps/api/src/infra/storage',

    'apps/web/src/components/profile/avatar-card.tsx',

    // NÃO apagados, por recomendação explícita do map F4(a):
    //   components/ui/avatar.{tsx,test.tsx,stories.tsx} — user-menu.tsx também usa o
    //   primitivo para o avatar de INICIAIS; apagá-lo custaria isso e ainda tiraria
    //   src/components/ui/** da cobertura, movendo o threshold. Sai só o uso de
    //   `avatarUrl` dentro do user-menu (costura abaixo).
    //   Nenhum e2e-spec mira a rota de avatar (grep em apps/api/test/** por "avatar"
    //   só acha test/factories.ts).
  ],

  prisma: {
    dropFields: [
      {
        model: 'User',
        // ÚNICO campo Prisma que files possui. NÃO remover junto:
        //   Plan.maxStorageMb  — é de `plans` (coluna de exibição, limite morto);
        //   TenantBranding.logoUrl — é de branding (URL livre, nenhum upload escreve).
        fields: ['avatarUrl'],
      },
    ],
  },

  // ZERO fragmentos SQL manuais (map §4, linha 4975: "None at all"). A baseline de
  // RLS é byte-idêntica com ou sem files — nenhum dos dois arquivos de SQL escrito à
  // mão (_row_level_security, _app_role) nomeia tabela de storage.
  sqlFragments: [],

  envKeys: [
    // Portas do host para o MinIO do compose.
    'MINIO_PORT',
    'MINIO_CONSOLE_PORT',
    // O knob do port hexagonal.
    'STORAGE_DRIVER',
    // Adapter local.
    'LOCAL_STORAGE_DIR',
    'LOCAL_STORAGE_PUBLIC_URL',
    // Adapter s3/minio.
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'S3_ACCESS_KEY',
    'S3_SECRET_KEY',
    'S3_FORCE_PATH_STYLE',
    'S3_PUBLIC_URL',
    // Nenhuma NEXT_PUBLIC_*: o web nunca lê config de storage (verificado no
    // .env.example — as únicas metades NEXT_PUBLIC_* pareadas são de captcha,
    // signup e oauth). AWS_REGION/SES_* FICAM: são do adapter de e-mail SES.
    // validateEnv() não tem branch de storage (env.ts:234-285 só condiciona captcha
    // e OAuth), então não há validação cruzada para podar.
  ],

  deps: [
    {
      workspace: 'apps/api',
      remove: [
        // Único importador: infra/storage/s3-storage.adapter.ts (+ o jest.mock do spec).
        '@aws-sdk/client-s3',
        // Único import: main.ts. É o ÚNICO registro de multipart do repo.
        '@fastify/multipart',
        // Único import: main.ts, no registro do storage local (costura abaixo).
        '@fastify/static',
        // Único uso: modules/files/services/avatar.service.ts (normalização da imagem).
        // É build nativo — tirá-lo acelera de forma mensurável um `pnpm install` novo.
        'sharp',
      ],
      // NÃO remover: @aws-sdk/client-ses (adapter de e-mail SES, outra flag),
      // @nestjs/terminus (health não sonda storage), ioredis/bullmq (queue).
    },
    // apps/web: NADA a remover. @radix-ui/react-avatar só sairia se
    // components/ui/avatar.tsx fosse apagado, e o map recomenda MANTER (o user-menu
    // usa o primitivo para as iniciais). Este é um achado, não uma omissão.
    // packages/shared: nenhuma dependência de storage.
  ],

  // MinIO existe SÓ para o adapter s3. Leitura do map (§3 linha 212: "MinIO only with
  // the S3 storage adapter", e F4(b): "Level (i) local-only also drops MinIO"):
  // o serviço é DRIVER-dependente, não feature-dependente. Duas consequências que o
  // gerador não pode confundir:
  //   1. files OFF  → MinIO desnecessário (é o que este campo declara);
  //   2. files ON + STORAGE_DRIVER=local → MinIO TAMBÉM desnecessário, e isso NÃO é
  //      expressável aqui: tem que sair da resolução de drivers do compose.
  // `minio-setup` vai junto por ser só o bootstrap do bucket (mc mb + mc anonymous
  // set download), inútil sem o minio.
  composeServices: ['minio', 'minio-setup'],

  // docSections VAZIO — outro achado: files NÃO tem seção própria no CLAUDE.md, nem
  // bullet em "O que NÃO fazer" (map F4(h) confirma: "no files-specific bullet
  // exists"). O que ele possui é UMA LINHA da tabela de ports na seção "Arquitetura"
  // e menções em TL;DR, Testes e Docker — todas costuras abaixo. Apagar a seção
  // "Arquitetura" inteira levaria e-mail, cache, banco, captcha e jobs com ela.
  docSections: [],

  seams: [
    // ─── API: módulos e bootstrap ────────────────────────────────────────────────
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: 'infra/storage/storage\\.module',
      reason: 'app.module.ts:18 — diretório apagado por deletePaths.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*StorageModule,\\s*$',
      reason:
        'Entrada do array `imports` (app.module.ts:110). O StorageModule é @Global() — enquanto estiver na lista, o Nest tenta construir o factory do STORAGE_PROVIDER e falha no boot lendo STORAGE_DRIVER, chave que envKeys acabou de remover.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: 'modules/files/files\\.module',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: app.module.ts:30.",
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*FilesModule,\\s*$',
      reason:
        'Entrada do array `imports` (app.module.ts:118). Sem ela as rotas POST/DELETE users/me/avatar simplesmente deixam de ser registradas — é o único lugar onde o FilesController entra na app.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropImport',
      pattern: '@fastify/multipart',
      reason: 'main.ts:14 — dependência removida em deps.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropBlock',
      block: { start: 'Multipart uploads \\(avatars\\)', end: '\\}\\);' },
      reason:
        'O registro do parser multipart com o teto de 5MB (main.ts:93-96) — ÚNICO registro de multipart do repo, e o teto é imposto no parser, antes do sharp. O `end: "});"` casa a linha de fechamento do register; a linha do `limits:` não contém "});". Atenção à vizinhança: registerOAuthFormPostParser (oauth) fica logo acima — não confundir as duas costuras de bootstrap.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropBlockWithLeadingDoc',
      // O `if` inteiro, com o comentário colado acima que o explica. O fim é a linha `  }`
      // exata: o `await app.register(fastifyStatic, {…})` de dentro fecha com `    });`,
      // e um fim `\}\);` cortaria o bloco no meio.
      block: { start: "if \\(config\\.get\\('STORAGE_DRIVER'", end: '^  \\}$' },
      reason:
        'O registro do @fastify/static para STORAGE_DRIVER=local (boilerplate v0.4.0). Com files desligado, STORAGE_DRIVER e LOCAL_STORAGE_* saem em envKeys e infra/storage/ sai em deletePaths — o bloco leria chaves que o Env já não tem e chamaria um helper apagado, e o typecheck do projeto gerado pararia em main.ts.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropImport',
      pattern: '@fastify/static',
      reason: 'Único uso era o registro do storage local, removido acima; a dep sai em deps.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropImport',
      pattern: 'infra/storage/local-static',
      reason:
        'O helper vive em infra/storage/, apagado por deletePaths — sobraria um import para arquivo inexistente (TS2307).',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropImport',
      pattern: '^node:path$',
      reason:
        'O `resolve` de node:path só existe em main.ts para o root absoluto do @fastify/static. Sem o registro ele vira import sem uso, e o lint do projeto gerado reprova.',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'expect\\(env\\.(S3_ENDPOINT|S3_PUBLIC_URL|LOCAL_STORAGE_PUBLIC_URL)\\)',
      reason:
        'O teste das portas 42xx (boilerplate v0.4.0) confere os defaults de S3_ENDPOINT, S3_PUBLIC_URL e LOCAL_STORAGE_PUBLIC_URL, chaves que envKeys removeu do schema: sem esta costura o spec não compila (TS2339). As outras asserções do teste — API, Redis, web e mail — continuam valendo.',
    },

    // ─── API: o campo avatarUrl atravessando os serviços ─────────────────────────
    {
      file: 'apps/api/src/modules/users/services/users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: null,',
      reason:
        'Bloco de anonimização da erasure LGPD (users.service.ts:424). Sai com a coluna: o Prisma Client deixa de conhecer o argumento e a escrita falha em runtime, dentro de uma transação que o usuário disparou pelo "excluir minha conta".',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: null,',
      reason:
        'Mesma escrita, no soft-delete administrativo (admin-users.service.ts:138).',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: user\\.avatarUrl,',
      reason:
        'user.mapper.ts:14 — este mapper é a ÚNICA porta por onde um User chega ao cliente; tem que casar campo a campo com userDtoSchema, que perde avatarUrl nesta mesma remoção.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.spec.ts',
      // Duas costuras, nesta ordem, e a ordem importa: o `it('preserves a null
      // avatarUrl')` tem de sair como BLOCO (a asserção dele está numa linha com
      // parênteses e chaves), e só depois as propriedades da fixture saem por linha.
      // Um `dropLinesMatching 'avatarUrl'` sozinho levava a linha do `expect(...)` e
      // deixava o `it(` sem corpo.
      kind: 'dropBlock',
      block: { start: "it\\('preserves a null avatarUrl'", end: '\\}\\);' },
      reason: 'O teste do avatar nulo (user.mapper.spec.ts:55-57) — sai com o campo.',
    },
    {
      file: 'apps/api/src/modules/auth/support/user.mapper.spec.ts',
      kind: 'dropLinesMatching',
      // `^\\s*avatarUrl:` casa só a PROPRIEDADE, no início da linha; não casa um
      // `expect(...avatarUrl...)` no meio de uma expressão.
      pattern: '^\\s*avatarUrl:',
      reason: 'As duas linhas de fixture (user.mapper.spec.ts:10,22).',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: null,',
      required: false,
      reason:
        'Fixture (oauth.service.spec.ts:41). Ausência legítima quando oauth também foi removido — o arquivo já não existe.',
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: null,',
      required: false,
      reason:
        'Fixture (invitations.service.spec.ts:57). Ausência legítima quando invitations foi removida.',
    },
    {
      file: 'apps/api/src/modules/users/services/users.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'updateCall\\.data\\.avatarUrl',
      reason:
        'Asserção dentro do teste de anonimização (users.service.spec.ts:554). O TESTE FICA — prova a erasure LGPD; só esta asserção sai.',
    },
    {
      file: 'apps/api/test/factories.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: null,',
      reason: 'makeUser (test/factories.ts:11) — a fixture tem que casar com o tipo User gerado.',
    },
    {
      file: 'apps/api/test/setup.ts',
      kind: 'dropLinesMatching',
      pattern: "STORAGE_DRIVER: 'local',",
      reason:
        'test/setup.ts:13 — env do ambiente de unit. A chave sai do schema Zod, e env.ts faz parse estrito: chave desconhecida no objeto de teste é erro de tipo. (No nível (i) esta linha FICARIA, como único literal válido.)',
    },
    {
      file: 'apps/api/test/e2e-setup.ts',
      kind: 'dropLinesMatching',
      pattern: "process\\.env\\.STORAGE_DRIVER = 'local';",
      reason: 'test/e2e-setup.ts:32 — mesma razão, no lado e2e.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: 'helmet/multipart/swagger/cors',
      replacement: 'helmet/swagger/cors',
      reason:
        'Comentário em e2e-app.ts:66. Só prosa — a app de e2e nunca registrou multipart, então nada funcional muda; mas é o comentário que explica POR QUE a app de teste divergeu de main.ts, e citar um plugin que já não existe faz o leitor procurar código fantasma.',
    },
    // apps/api/test/prisma-mock.ts: NENHUMA costura (map F4(b) e F3(b)) — o double é
    // um saco genérico de delegates (`[delegate: string]: any`), sem conhecimento de
    // avatar nem de storage. Não crie costura aqui.
    // health.module.ts / health.controller.ts: NENHUMA costura — as probes são
    // database, cache e queue; storage não é enumerado.
    // modules/users/users.module.ts: NENHUMA costura — nunca importa FilesModule.

    // ─── packages/shared ─────────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/user.ts',
      kind: 'dropLinesMatching',
      pattern: 'avatarUrl: z\\.string\\(\\)\\.url\\(\\)\\.nullable\\(\\),',
      reason:
        'Campo de userDtoSchema (user.ts:17). packages/shared é a fronteira de contrato: sair daqui é o que garante que api e web não divergem sobre o UserDto.',
    },
    {
      file: 'packages/shared/src/user.ts',
      kind: 'dropBlock',
      block: {
        start: 'Returned after an avatar is uploaded or deleted',
        end: 'export type AvatarResponse',
      },
      reason:
        'avatarResponseSchema + AvatarResponse (user.ts:58-62). Consumidores: files.controller.ts, avatar.service.ts e avatar-card.tsx — todos apagados por deletePaths. index.ts NÃO muda: o barrel (linhas 6-14) é só star-export.',
    },

    // ─── web ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/web/src/app/(dashboard)/profile/page.tsx',
      kind: 'dropImport',
      pattern: 'components/profile/avatar-card',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: profile/page.tsx:8.",
    },
    {
      file: 'apps/web/src/app/(dashboard)/profile/page.tsx',
      kind: 'dropLinesMatching',
      pattern: '<AvatarCard user=\\{user\\} />',
      reason:
        'profile/page.tsx:51. A ROTA /profile FICA — name, email, password, 2FA, sessions e danger continuam; só o primeiro card da aba "general" sai. Nenhuma entrada de nav muda (app-sidebar.tsx aponta para /profile).',
    },
    {
      file: 'apps/web/src/components/user-menu.tsx',
      kind: 'dropLinesMatching',
      pattern: '\\{user\\.avatarUrl && <AvatarImage',
      reason:
        'user-menu.tsx:54. Tem que sair com o campo do DTO, senão é erro de tipo. O <Avatar>/<AvatarFallback> em volta FICA: é ele que desenha as iniciais, e o fallback "42" é parte da voz do produto.',
    },
    {
      file: 'apps/web/src/components/user-menu.tsx',
      kind: 'dropImportSpecifier',
      pattern: 'AvatarImage',
      reason:
        "Especificador do import de '@/components/ui/avatar' (user-menu.tsx:7). Avatar e AvatarFallback FICAM — o primitivo continua no repo justamente por causa deste uso.",
    },
    {
      file: 'apps/web/src/lib/api.ts',
      kind: 'dropBlock',
      block: { start: 'Multipart upload \\(e\\.g\\. avatar\\)', end: 'return data as T;\\s*\\n\\}' },
      reason:
        'apiUpload e seu doc-comment (lib/api.ts:187-199). Exatamente UM chamador de produção (avatar-card.tsx), apagado por deletePaths. src/lib/** está na lista de include do vitest.config.mts, então remover uma função bem coberta MOVE o agregado — remedir os thresholds (regra global 3).',
    },
    {
      file: 'apps/web/src/lib/api.test.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('apiUpload\\(\\)'", end: '\\}\\);' },
      reason:
        'Os dois testes de apiUpload (lib/api.test.ts:290-320). Saem com a função; deixá-los derruba a suíte do web imediatamente.',
    },
    // O `describe` não é tudo: o arquivo IMPORTA o tipo, declara `let apiUpload` e o
    // atribui no `beforeEach`. Sem estas três, o web falha com `TS2305` + `TS2339` num
    // arquivo cujo resto testa `api()`, que sobrevive.
    {
      file: 'apps/web/src/lib/api.test.ts',
      kind: 'dropImportSpecifier',
      pattern: '^apiUpload$',
      target: '^\\./api$',
      reason:
        'O `import type { apiUpload as apiUploadType }` (api.test.ts:4). O alias é o que o `let` abaixo tipa; sem remover os três em conjunto o arquivo não compila.',
    },
    {
      file: 'apps/web/src/lib/api.test.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*let apiUpload:|^\\s*apiUpload = mod\\.apiUpload;',
      reason:
        'A declaração e a atribuição dinâmica de `apiUpload` (api.test.ts:38,51). O módulo é recarregado por `await import()` em cada teste, e a atribuição referencia um export que já não existe.',
    },
    // apps/web/src/proxy.ts: NENHUMA costura — não há branch de arquivo/upload, e o
    // matcher já exclui /api.
    // apps/web/src/app/api/[...path]/route.ts: NENHUMA costura — o BFF repassa corpos
    // genericamente (arrayBuffer + duplex:'half'), sem tratamento especial de
    // multipart. Não invente costura aqui achando que upload precisa de exceção.

    // ─── env ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropLinesMatching',
      pattern: "STORAGE_DRIVER: z\\.enum\\(\\['s3', ?'local'\\]\\)",
      reason:
        'env.ts:46, dentro do bloco `// --- drivers (hexagonal) ---`. Uma linha só, e MAIL_DRIVER/CACHE_DRIVER/DB_PROVIDER ficam — por isso dropLinesMatching e não dropBlock no bloco de drivers.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropCommentSection',
      pattern: '--- s3 / minio ---',
      reason:
        'As 7 chaves S3_* sob o banner `// --- s3 / minio ---` (env.ts:59-66). Corta até (exclusive) o próximo banner `// --- local storage adapter ---`, que a costura seguinte remove — os dois blocos são adjacentes e cortar os dois num dropBlock só arriscaria engolir `// --- ses adapter ---`, que FICA (é do e-mail).',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropCommentSection',
      pattern: '--- local storage adapter ---',
      reason:
        'LOCAL_STORAGE_DIR + LOCAL_STORAGE_PUBLIC_URL (env.ts:68-70). Corta até (exclusive) `// --- ses adapter ---`.',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'env\\.STORAGE_DRIVER',
      reason:
        "env.spec.ts:22 — asserção de default no teste \"defaults\". (No nível (i) viraria toBe('local'); no (ii) sai.)",
    },
    {
      file: '.env.example',
      kind: 'dropLinesMatching',
      pattern: 'MINIO_(PORT|CONSOLE_PORT)=',
      reason:
        '.env.example:11-12, no bloco de portas 42xx do Docker. As portas são literais fixos — nada é renumerado quando estas saem.',
    },
    {
      file: '.env.example',
      kind: 'dropLinesMatching',
      pattern: 'STORAGE_DRIVER=',
      reason:
        '.env.example:22, com o comentário inline `# s3 | local`. As outras três linhas de driver ficam.',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: { start: '# Local storage adapter', end: 'LOCAL_STORAGE_PUBLIC_URL=' },
      reason: '.env.example:27-29 — cabeçalho + as duas chaves.',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: { start: '# S3 / MinIO \\(console at', end: 'S3_PUBLIC_URL=' },
      reason:
        '.env.example:89-96 — cabeçalho (que cita o console em :4205) + as 7 chaves. envKeys já cuida das chaves; este bloco leva o comentário para o arquivo não ficar com prosa sobre um serviço ausente.',
    },

    // seed: NENHUMA costura. Map F4(g) — grep de storage|minio|s3|avatar em
    // prisma/seed.ts dá zero; o plano semeado define maxUsers e nunca maxStorageMb,
    // e nenhum usuário recebe avatarUrl.

    // ─── docker ──────────────────────────────────────────────────────────────────
    {
      file: 'docker-compose.yml',
      kind: 'dropLinesMatching',
      pattern: '^\\s*minio_data:\\s*$',
      reason:
        'Volume nomeado no bloco `volumes:` (docker-compose.yml:84). composeServices remove os serviços minio e minio-setup, mas o volume é declarado fora deles — sobrando, o compose avisa de volume órfão e o `docker compose down -v` do dev deixa um volume para trás em todo projeto gerado.',
    },
    {
      file: 'docker-compose.dev.yml',
      kind: 'dropLinesMatching',
      pattern: 'S3_(ENDPOINT|PUBLIC_URL):\\s',
      reason:
        'Três ocorrências: S3_ENDPOINT/S3_PUBLIC_URL no serviço `api` (:63-64) e S3_ENDPOINT no `worker` (:99). No modo "tudo no Docker" os apps acham a infra pelo nome do serviço (http://minio:9000) — com o minio fora do compose, essas linhas apontam para um host que não resolve.',
    },
    // Dockerfile.api / Dockerfile.web / Dockerfile.dev: NENHUMA costura (map F4(b)).
    // root package.json e turbo.json: NENHUMA costura.

    // ─── pnpm-workspace.yaml ─────────────────────────────────────────────────────
    {
      file: 'pnpm-workspace.yaml',
      kind: 'dropLinesMatching',
      pattern: "'@aws-sdk/(client-s3|s3-request-presigner)@",
      reason:
        'Entradas de minimumReleaseAgeExclude (pnpm-workspace.yaml:37,39) para pacotes que deps acabou de remover. `@aws-sdk/client-ses@…` (:38) FICA — é do adapter de e-mail SES. Referência a pacote inexistente em minimumReleaseAgeExclude é lixo que o próximo audit/update vai fazer alguém investigar.',
    },
    {
      file: 'pnpm-workspace.yaml',
      kind: 'dropLinesMatching',
      pattern: '^\\s*sharp: true\\s*$|^\\s*- sharp\\s*$',
      reason:
        'sharp em allowBuilds (:33) e em onlyBuiltDependencies (:65). São aprovações EXPLÍCITAS de build script nativo — a política do repo é aprovar um por um, então deixar a aprovação de um pacote ausente afrouxa exatamente o gate que ela existe para fechar.',
    },

    // ─── CLAUDE.md ───────────────────────────────────────────────────────────────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'perfil,\\n>\\s*arquivos, i18n',
      replacement: 'perfil, i18n',
      reason:
        'Blurb de abertura (CLAUDE.md:4-5), que enumera o que vem de fábrica. A frase atravessa a quebra de linha E a linha seguinte é uma CITAÇÃO markdown, então começa com `> ` — que `\\s*` não casa. Ancorar `\\n>\\s*` explicitamente é o que faz a costura achar as duas metades.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '# postgres, redis, minio, mailpit',
      replacement: '# postgres, redis, mailpit',
      reason:
        'Comentário do `docker compose up -d` no TL;DR (CLAUDE.md:15). É a primeira instrução que alguém executa num clone novo.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'MinIO `:4204` /\\s*\\n?\\s*console `:4205` · ',
      replacement: '',
      reason:
        'Lista de portas de dev (CLAUDE.md:26-28). Portas são literais fixos, nada é renumerado. O `\\n?\\s*` cobre a quebra no meio da entrada do MinIO.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: '\\| Storage\\s*\\|\\s*`StorageProvider`',
      reason:
        'LINHA da tabela de ports em "Arquitetura — Ports & Adapters" (CLAUDE.md:55). Só a linha: E-mail, Cache, Banco, Captcha e Jobs continuam, e a tabela é o mapa que explica o padrão hexagonal do projeto. Por isso é seam, não docSection.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '`memory` / `console` / `local`',
      replacement: '`memory` / `console`',
      reason:
        'Bullet "Em teste, use…" logo abaixo da tabela de ports (CLAUDE.md:65) — `local` é driver de storage.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'mocka Prisma/cache/mail/storage',
      replacement: 'mocka Prisma/cache/mail',
      reason: 'Seção "Testes" (CLAUDE.md:519), descrição do que a suíte unit dubla.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'Postgres/Redis/MinIO/Mailpit',
      replacement: 'Postgres/Redis/Mailpit',
      reason:
        'Seção "Docker" (CLAUDE.md:545), lista do que o compose sobe. Tem que casar com composeServices ou o dev procura um container que nunca sobe.',
    },
    // "O que NÃO fazer" (CLAUDE.md:558-587): NENHUM bullet é de files (map F4(h)
    // confirma explicitamente). Não invente um corte aqui.

    // ─── README.md (bilíngue: pt e depois en, mesmas frases espelhadas) ──────────
    {
      file: 'README.md',
      kind: 'replace',
      pattern: ', upload de arquivos|, file uploads',
      replacement: '',
      reason: 'Intros das duas metades (README:57 pt, :353 en).',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern:
        '\\*\\*Perfis e arquivos\\*\\* — ([^\\n]*?)uploads atrás de um driver de storage trocável\\.',
      replacement: '**Perfis** — $1perfil do próprio usuário.',
      reason:
        'Bullet de feature pt (README:80). Reescrito, não apagado: o bullet também cobre perfil, que FICA.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern:
        '\\*\\*Profiles & files\\*\\* — ([^\\n]*?)uploads behind a swappable storage driver\\.',
      replacement: '**Profiles** — $1the user\'s own profile.',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Espelho en do bullet acima (README:375).",
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: '(# .*?)(, ?minio| minio,?)',
      replacement: '$1',
      reason:
        'Comentários do quick-start nas duas metades (README:90 pt, :385 en) citando minio na linha do `docker compose up -d`.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '\\| Storage\\s*\\|\\s*`StorageProvider`',
      reason: 'Linha Storage das tabelas de ports nas duas metades (README:247 pt, :546 en).',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '\\|\\s*(MinIO|`minio`)',
      reason:
        'Linha do MinIO nas tabelas de serviços (README:277 pt, :576 en). A linha do Redis (276/575) FICA — Redis serve cache e throttler.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'Postgres/Redis/MinIO/Mailpit',
      replacement: 'Postgres/Redis/Mailpit',
      reason: 'Quatro ocorrências espelhadas (README:281, 305 pt; :580, 604 en).',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'mocando Prisma/cache/mail/storage|mocking Prisma/cache/mail/storage',
      replacement: 'mocando Prisma/cache/mail',
      reason:
        'Seções de teste (README:293 pt, :592 en). ATENÇÃO: o replacement precisa ser resolvido por metade — o pt usa "mocando", o en "mocking"; se o engine não suportar replacement por alternativa casada, quebre em duas costuras.',
    },

    // ─── i18n: as duas locales ou nenhuma ────────────────────────────────────────
    // REGRA GLOBAL 1: pt-BR.json e en-US.json são line-for-line alinhados e
    // i18n/messages.test.ts:18-25 confere paridade profunda nomeando as órfãs.
    ...['apps/web/messages/pt-BR.json', 'apps/web/messages/en-US.json'].flatMap((file) => [
      {
        file,
        kind: 'dropJsonKey' as const,
        pattern: 'profile.avatar',
        reason:
          'Objeto inteiro (4 chaves: title, upload, remove, hint), linhas 162-167 nos dois arquivos. Remover de um só derruba a suíte do web. O engine tem que cuidar da vírgula final para `profile.nameSection` (linha 168) continuar parseando.',
      },
      {
        file,
        kind: 'replace' as const,
        pattern: 'Banco, storage e e-mail trocáveis por uma variável\\.|Swap database, storage and email with one variable\\.',
        replacement: 'Banco e e-mail trocáveis por uma variável.',
        reason:
          'dashboard.features.swappable.body (linha 145 nos dois arquivos). REESCREVER, NÃO REMOVER a chave: o card é genérico e continua na tela — apagar a chave derrubaria o render com "missing message", e apagar só de um arquivo derrubaria a paridade. ATENÇÃO: o replacement é a versão pt; a en precisa de costura própria ("Swap database and email with one variable.") se o engine não resolver replacement por alternativa casada.',
      },
      // NÃO remover com files (map F4(e) e F4(c)): platform.plans.form.maxStorageMb
      // (linha 486) e platform.plans.limitsSummary (470) — são de `plans`.
      // Plan.maxStorageMb é limite MORTO (nada o impõe), mas é coluna de exibição
      // daquela feature, e o painel da plataforma renderiza as duas chaves.
    ]),
  ],
};
