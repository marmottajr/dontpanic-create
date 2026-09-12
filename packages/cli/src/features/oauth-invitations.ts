import type { FeatureManifest } from '../types.ts';

/**
 * Fragmento do manifesto — F1 `oauth` e F2 `invitations`.
 *
 * Transcrito de `docs/maps/feature-surface.md` (F1: linhas 223-720, F2: 721-1230) e da
 * tabela canônica de fragmentos SQL (A2 §4, linhas 4967-4990). Toda `reason` cita a
 * mecânica que a costura protege, não o que ela faz — é o texto que aparece no erro
 * quando o padrão âncora deixa de casar depois de um refactor no repo base.
 *
 * KINDS NOVOS usados aqui (não existem em types.ts — o agente pai é o dono daquele arquivo):
 *  - 'dropBlockWithLeadingDoc': igual a `dropBlock`, mas apaga também o comentário
 *    (`/** … *\/` ou corrida de `//`) imediatamente acima de `block.start`. Sem ele, um
 *    `dropBlock` que começa DENTRO do JSDoc deixa um `/**` órfão que engole o bloco
 *    seguinte, e um que começa na declaração deixa um doc-comment descrevendo código
 *    que não existe mais.
 *  - 'manualRewrite': o arquivo sobrevive mas a região apontada por `pattern` não é
 *    produzível por subtração (ver docs/decisions/0001) — o gerador tem de emitir uma
 *    variante escrita à mão, identificada em `replacement`.
 */

export const oauthManifest: FeatureManifest = {
  id: 'oauth',
  label: 'Login social (Google · Apple · GitHub)',
  summary:
    'Entrar com Google, Apple ou GitHub: adapters por provider, vinculação por providerAccountId imutável e tela de completar cadastro para identidade desconhecida.',

  // (k), map 938-985: o 2FA é dependência DURA e de segurança, não de conveniência —
  // `oauth.service.ts:325-332` desvia para `AuthService.createLoginTicket` quando
  // `user.twoFactorEnabled`, e o `TwoFactorGateGuard` NÃO cobre isso (só verifica que o
  // 2FA está habilitado, nunca que esta sessão passou por ele). Sem esse desvio, "entrar
  // com o Google" é estritamente mais fraco que digitar a senha.
  // `publicSignup` entra porque o terceiro desfecho do callback (`unknown-identity`) lê
  // `PUBLIC_SIGNUP_ENABLED` (oauth.service.ts:594-596) e termina em
  // `signup/complete/page.tsx`.
  //
  // CORRIGIDO na integração — e é correção, não preferência. NENHUMA das duas é
  // `requires`. O §4 do mapa classifica as duas arestas como SOFT: "soft in code,
  // required when both are on" para o 2FA (mapa 5198) e "soft" para o public-signup
  // (5199). As duas invalidezes correspondentes são de EMISSÃO, não de combinação:
  //
  //  - I5 (5226) não diz "oauth exige 2fa"; diz que, quando as duas estão ligadas, o
  //    desvio de 2FA é obrigatório na emissão. Com 2fa desligado o ramo
  //    `if (user.twoFactorEnabled)` é inalcançável e cai fora — o mapa escreve isso em
  //    679. Declarar a aresta dura proibiria uma combinação que o mapa chama de coerente,
  //    e que o `validateRecipe` não proíbe: o gerador passaria a recusar receita que a
  //    landing oferece.
  //  - I6 (5227) é AUTO-FIX, não recusa: sem public-signup, o terceiro desfecho do
  //    callback recusa duro (`no_account`) e `/signup/complete` é apagado. As costuras
  //    que fazem isso estão abaixo, `required: false` porque só existem na presença da
  //    outra feature.
  //
  // O acoplamento continua expresso — em costuras condicionais e nos `reason` —, só não
  // como aresta do grafo. É a diferença entre "não pode ser gerado" e "tem que ser
  // gerado assim".
  requires: [],

  deletePaths: [
    // (a), map 227-243: diretórios inteiros. O port e os três adapters não têm
    // consumidor fora de si mesmos — `id-token.ts` e `oauth-http.ts` são importados
    // apenas pelos adapters, e `callback-url.ts` apenas pelo módulo e pelo service.
    'apps/api/src/core/oauth',
    'apps/api/src/infra/oauth',
    // `oauth-form-post.ts` vive aqui dentro e é importado pelo `main.ts:18` — daí a
    // costura de bootstrap abaixo; sem ela o build quebra num import órfão.
    'apps/api/src/modules/auth/oauth',
    'packages/shared/src/oauth.ts',
    'apps/web/src/components/oauth-buttons.tsx',
    'apps/web/src/components/oauth-buttons.test.tsx',
    // Diretório inteiro: a tela "complete seu cadastro" só existe porque provedor nenhum
    // sabe nome e slug da empresa. Nenhuma outra rota do App Router é exclusiva de oauth.
    'apps/web/src/app/(auth)/signup/complete',
    // (a) caveat 2, map 282-288: `cookies.ts` tem UM consumidor de produção — o handoff
    // OAuth→2FA em `login/page.tsx:23,104,105`. Com oauth fora ele é código morto que
    // continua DENTRO do glob de cobertura `src/lib/**/*.ts` (vitest.config.mts:33), e
    // código morto não coberto derruba `statements: 99` / `functions: 95`
    // (vitest.config.mts:47-52). Tem de sair junto, com o teste.
    'apps/web/src/lib/cookies.ts',
    'apps/web/src/lib/cookies.test.ts',
  ],

  prisma: {
    dropFiles: ['apps/api/prisma/schema/oauth.prisma'],
    dropFields: [
      // (c), map 343-350: back-relations obrigatórias. Prisma recusa VALIDAR um campo de
      // relação cujo modelo alvo não existe — não é limpeza estética, é o schema não
      // compilar. Ninguém lê `oauthAccounts` (grep acha só estas duas linhas).
      { model: 'Tenant', fields: ['oauthAccounts'] },
      { model: 'User', fields: ['oauthAccounts'] },
    ],
    // (c), map 359-403: `passwordHash` é nullable EXCLUSIVAMENTE por causa do social — o
    // único escritor de `passwordHash: null` no repo é `oauth.service.ts:474`
    // (`completeSignup`); todo outro caminho grava hash de verdade. Apertar para NOT NULL
    // é obrigação do gerador, e o perigo é o oposto: deixar nullable NÃO quebra o build.
    // Ficariam ~20 linhas de código de segurança (a equalização de tempo do
    // `ABSENT_PASSWORD_HASH`) descrevendo uma conta que não pode existir, cuja cobertura
    // o piso `functions: 100` (apps/api/jest.config.js:52) continua exigindo; e nada
    // impediria uma feature futura de gravar `null`, produzindo uma conta que não loga e
    // não pode ser informada do motivo — exatamente a classe de bug que o NOT NULL pega
    // na inserção.
    tighten: [{ model: 'User', field: 'passwordHash', to: 'required' }],
  },

  seams: [
    // ── API · bootstrap e módulos ────────────────────────────────────────────────
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: "\\./modules/auth/oauth/oauth\\.module",
      reason:
        'O `app.module.ts` é a maior costura do repo (16 módulos); import órfão de um diretório apagado é erro de compilação no primeiro `nest build`, não em runtime. Provenance: map 291.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: "\\s*OAuthModule,",
      reason:
        'Entrada no array `imports` do @Module. Deixá-la referencia um símbolo que o import acima já não traz — e o erro aponta para o decorator, não para a feature. Provenance: map 292.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropImport',
      pattern: "\\./modules/auth/oauth/oauth-form-post",
      reason:
        '`registerOAuthFormPostParser` e `skipsCsrf` moram no diretório de oauth; este é o único import do bootstrap que cruza a fronteira da feature. Provenance: map 293.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropBlock',
      block: {
        start: "Sign in with Apple posts its callback from appleid\\.apple\\.com",
        end: "skipsCsrf\\(\\s*m\\s*,\\s*req\\.url\\s*\\)\\s*\\)\\s*return\\s+done\\(\\)\\s*;",
      },
      reason:
        'Isenção de CSRF de escopo global dentro do hook `preHandler`: existe só porque a Apple posta o callback de appleid.apple.com, que não tem como carregar o token double-submit. Sem oauth a isenção passa a ser um buraco permanente no CSRF de TODAS as mutações. As linhas do `return csrfProtection.call(...)` ficam. Provenance: map 294.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'dropBlock',
      block: {
        start: "Apple's form_post body",
        end: "registerOAuthFormPostParser\\(\\s*fastify\\s*\\)\\s*;",
      },
      reason:
        'O parser de urlencoded existe só para o `response_mode=form_post` da Apple; sem ele o Fastify volta a responder 415 para `application/x-www-form-urlencoded` em toda rota, que é exatamente o comportamento pré-oauth. Mantê-lo alarga a superfície de parsing sem nenhuma rota que a use. Provenance: map 295.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropBlock',
      block: { start: "Exported for the OAuth module", end: "\\s*AuthService,\\s*$" },
      reason:
        '`AuthService` está em `exports` só para o OAuthModule reusar `createLoginTicket`; grep confirma zero importadores fora de `modules/auth/`. Ele CONTINUA em `providers` — apagar do lugar errado derruba a injeção no próprio AuthController. Provenance: map 296.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      // `dropBlock`, não `dropBlockWithLeadingDoc`: o bloco cabe INTEIRO dentro de um
      // comentário (é um parágrafo, não um símbolo). O outro kind sobe absorvendo o
      // doc-comment de cima — que aqui é este mesmo comentário —, come a abertura e
      // deixa o fechamento órfão, o que torna o arquivo sintaticamente inválido.
      kind: 'dropBlock',
      block: {
        start: "Public because password login is no longer the only way",
        end: "the copy is the one that stops getting the fixes\\.",
      },
      reason:
        'Só o parágrafo do JSDoc que justifica `createLoginTicket` ser público. O método fica: `login()` o chama em auth.service.ts:266, e sem oauth ele pode voltar a `private`. Apagar o método junto quebra o passo de 2FA por senha. Provenance: map 297.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropBlock',
      block: {
        start: "exposed for clarity / potential reuse",
        end: "static readonly LOGIN_TICKET_TTL",
      },
      // Sobreposição direta com `twoFactor`, que remove `const LOGIN_TICKET_TTL` e o
      // `static readonly` junto (a constante só serve ao passo do segundo fator). Quando
      // as duas features saem, `twoFactor` corre primeiro (ordem de `FEATURE_IDS`) e esta
      // costura não tem mais o que fechar — o que é exatamente o resultado certo.
      required: false,
      reason:
        'O `static readonly LOGIN_TICKET_TTL` existe unicamente para `oauth.service.ts:651` ler o TTL do ticket de fora da classe. Sem esse consumidor é superfície pública sem motivo, e o TTL continua vivo na const de módulo. Provenance: map 298.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'dropBlock',
      block: {
        start: "`verifyPassword` also covers the account with no password at all",
        end: "passwords both in the message below and on the clock\\.",
      },
      reason:
        'Comentário que descreve o caso social-only (conta sem senha). A chamada `verifyPassword(user.passwordHash, …)` na linha seguinte FICA — com `passwordHash` NOT NULL ela segue compilando e continua pagando o custo Argon2 que impede o timing de virar oráculo. Provenance: map 299.',
    },

    // ── API · crypto.util — o par que precisa sair junto do `tighten` ────────────
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "const ABSENT_PASSWORD_HASH = argon2\\.hash\\(",
        end: "const ABSENT_PASSWORD_HASH = argon2\\.hash\\(",
      },
      reason:
        '`ABSENT_PASSWORD_HASH` é o hash-de-nada usado para igualar o tempo de resposta entre "conta sem senha" e "senha errada" — uma defesa contra enumerar quais endereços são social-only. Com `passwordHash` NOT NULL não existe mais conta que ele descreva: ficariam ~20 linhas de código de segurança intestáveis cuja cobertura o piso `functions: 100` (apps/api/jest.config.js:52) ainda cobra. Provenance: map 300, 359-403.',
    },
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.ts',
      kind: 'dropBlock',
      block: {
        start: "Verify a password against a stored hash that may not exist\\.",
        end: "constant-time work above exists to deny\\.",
      },
      reason:
        'O JSDoc inteiro de `verifyPassword` fala de nullability trazida pelo social sign-in; com a assinatura estreitando para `string` ele passa a documentar um contrato que o tipo já não permite. Provenance: map 300, 375-379.',
    },
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.ts',
      kind: 'replace',
      pattern: "passwordHash:\\s*string\\s*\\|\\s*null\\s*\\|\\s*undefined\\s*,",
      replacement: 'passwordHash: string,',
      reason:
        'Estreitar a assinatura é o que faz o compilador provar que nenhum chamador passa null. Os quatro chamadores (auth.service.ts:245, users.service.ts:105,229,324) seguem compilando porque o Prisma passa a tipar a coluna como `string`. Provenance: map 377-378.',
    },
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.ts',
      kind: 'dropBlock',
      block: { start: "if \\(\\s*!passwordHash\\s*\\)\\s*\\{", end: "\\n\\s*\\}\\n" },
      reason:
        'O braço null-tolerante de `verifyPassword` fica inalcançável quando a coluna é NOT NULL, e com a assinatura estreitada o `!passwordHash` vira comparação que o TS marca como sempre falsa. Provenance: map 374-376.',
    },
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.spec.ts',
      kind: 'dropBlock',
      block: { start: "The three shapes an absent credential arrives in", end: "\\}\\s*\\)\\s*;" },
      reason:
        'O `it.each` passa `null` e `undefined` para `verifyPassword`; com o parâmetro estreitado para `string` estes dois casos NÃO COMPILAM e a suíte falha em typecheck, não em asserção — o erro aparece longe da remoção e parece não ter relação com oauth. Provenance: map 300, 380-382.',
    },
    {
      file: 'apps/api/src/modules/auth/support/crypto.util.spec.ts',
      kind: 'dropBlock',
      block: {
        start: "it\\('still pays the Argon2 cost when there is no hash'",
        end: "\\}\\s*\\)\\s*;",
      },
      reason:
        'Mesmo motivo do anterior: o teste de tempo constante chama `verifyPassword(null, …)` e deixa de typecheckar. Ele também mede o custo do `ABSENT_PASSWORD_HASH`, que acabou de ser apagado. Provenance: map 300, 380-382.',
    },

    // ── API · comentários que passam a mentir ────────────────────────────────────
    {
      file: 'apps/api/src/modules/auth/services/signup.service.ts',
      kind: 'replace',
      pattern: "the platform panel and the OAuth completion use",
      replacement: 'the platform panel uses',
      reason:
        '`provisionTenant` foi extraído justamente para as portas não divergirem; listar uma porta que não existe mais manda o próximo leitor procurar código apagado. Provenance: map 301.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'replace',
      pattern: "three unrelated doors now lead here — public signup, the\\s*\\*?\\s*operator creating a company from the platform panel, and an unknown social\\s*\\*?\\s*identity finishing its registration —",
      replacement:
        'two unrelated doors now lead here — public signup and the\n * operator creating a company from the platform panel —',
      reason:
        'Doc-comment apenas, zero mudança de código: `provisionTenant` continua idêntico. Mas é ele que documenta POR QUE o helper existe, e um leitor que procura a terceira porta acha um diretório apagado. Provenance: map 305.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.spec.ts',
      kind: 'replace',
      pattern: "signup, the platform panel and\\s*//\\s*the OAuth completion must all produce the same company",
      replacement: 'signup and the platform panel must both produce the same company',
      reason:
        'Comentário do teste que enumera as portas do `provisionTenant`. O teste em si continua válido. Provenance: map 306.',
    },

    // ── API · allowlist de @SystemScope() — regra global 2 do mapa ───────────────
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'dropBlock',
      block: {
        start: "`POST auth/oauth/complete-signup`",
        end: "'modules/auth/oauth/oauth\\.controller\\.ts:1',",
      },
      reason:
        'A allowlist de `@SystemScope()` é CALCULADA por varredura e comparada a um array literal (regra global 2, map 46-54). Emitir o array do repo num projeto sem oauth dá suíte vermelha em clone novo — o que treina o usuário a editar a asserção, destruindo a guarda que impede `@SystemScope()` de vazar para rota de negócio. A lista passa a ser exatamente `["modules/auth/auth.controller.ts:8", "modules/invitations/public-invitations.controller.ts:2"]` (só a primeira entrada se invitations também sair). Provenance: map 307.',
    },

    // ── API · e2e ───────────────────────────────────────────────────────────────
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: ",\\s*\"oauth_accounts\"",
      replacement: '',
      reason:
        'O `TRUNCATE TABLE` do `resetDb()` nomeia as tabelas de domínio explicitamente; citar uma tabela que não existe faz TODA a suíte e2e falhar no primeiro `beforeEach`, antes de qualquer asserção. Nunca use TRUNCATE dentro de uma suíte para "consertar" isso — ele toma ACCESS EXCLUSIVE e trava contra conexões vivas da aplicação. Provenance: map 308.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: "`invitations` and `oauth_accounts` are named explicitly",
      replacement: '`invitations` is named explicitly',
      reason:
        'O comentário é a razão pela qual a lista é explícita em vez de depender do CASCADE; com uma das duas tabelas fora ele descreve um inventário errado. Se invitations também sair, o bloco inteiro do comentário vai embora. Provenance: map 308.',
      required: false,
    },

    // ── shared ──────────────────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/index.ts',
      kind: 'dropLinesMatching',
      pattern: "export \\* from '\\./oauth';",
      reason:
        'O `index.ts` é só star-exports (linhas 6-14) e muda EXCLUSIVAMENTE para `invitation` e `oauth`; um re-export de arquivo apagado quebra o build do `packages/shared`, que é pré-requisito de api e web. Provenance: map 330-331.',
    },
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "export const TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket';",
        end: "export const TWO_FACTOR_TICKET_COOKIE = 'dp_2fa_ticket';",
      },
      reason:
        'O nome do cookie vive no shared para que API e web leiam a MESMA string — um nome que combinasse por coincidência falharia do jeito mais silencioso possível. Só o social precisa dele: depois de senha, `POST /auth/login` devolve o ticket no corpo da resposta, porque há corpo; um 302 não tem esse canal. O próprio doc-block diz "Only social sign-in needs it" (auth.ts:151-153). Provenance: map 319-322.',
    },

    // ── web ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropImport',
      pattern: "@dontpanic/shared",
      reason:
        'Único import de `@dontpanic/shared` no arquivo, e ele traz apenas `oauthProviders`/`OAuthProvider` — símbolos de um módulo apagado. As metades `readFlag`/`signupEnabled` (linhas 26-44) são de public-signup e ficam. Provenance: map 314, (a) caveat 1.',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      // `dropBlock`, não `dropBlockWithLeadingDoc`: o bloco cabe INTEIRO dentro de um
      // comentário (é um parágrafo, não um símbolo). O outro kind sobe absorvendo o
      // doc-comment de cima — que aqui é este mesmo comentário —, come a abertura e
      // deixa o fechamento órfão, o que torna o arquivo sintaticamente inválido.
      kind: 'dropBlock',
      block: {
        start: "`NEXT_PUBLIC_OAUTH_PROVIDERS` vs the providers the API actually has keys",
        end: "broken page, not a login\\.",
      },
      reason:
        'Bullet do doc-block sobre as duas metades que precisam concordar. O bullet do `NEXT_PUBLIC_SIGNUP_ENABLED` fica — é a mesma armadilha, de public-signup. Provenance: map 314.',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "export function parseOAuthProviders\\(",
        end: "\\n\\}",
      },
      reason:
        'A ordem dos botões vem do constante compartilhado, não da ordem digitada no env — sem `oauthProviders` do shared a função não tem de onde ler. Provenance: map 314, (a) caveat 1 (linhas 46-88 do arquivo).',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlock',
      block: {
        start: "export const enabledOAuthProviders",
        end: "\\)\\s*;",
      },
      reason:
        'Lê `process.env.NEXT_PUBLIC_OAUTH_PROVIDERS` no load do módulo (o Next inlineia em build-time); sem `parseOAuthProviders` não compila. Provenance: map 314.',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlock',
      block: {
        start: "Empty list = no social sign-in at all",
        end: "export const oauthEnabled",
      },
      reason:
        '`oauthEnabled` é o que fazia o `<OAuthButtons>` se apagar sozinho (separador incluído) quando nenhum provider está configurado — sem botões não há o que decidir. Provenance: map 314.',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "export function oauthStartUrl\\(",
        end: "\\n\\}",
      },
      reason:
        'Constrói a URL de navegação `/api/auth/oauth/:provider/start` (via BFF, nunca fetch: a rota responde 302 e um XHR seguiria o redirect em background). Sem rota de oauth na API é um link para 404. Provenance: map 314, 337-339.',
    },
    // Arquivo PARCIALMENTE exclusivo (map 259, (a) caveat 1): as linhas 1-49 testam
    // `signupEnabled` (public-signup) e FICAM; 50-98 são os três describes de oauth. Está
    // dentro do glob de cobertura `src/lib/**/*.ts`, então apagá-lo inteiro levaria
    // `signupEnabled` a zero cobertura e derrubaria o piso — tem de ser podado.
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'dropImport',
      pattern: "\\./auth-config",
      reason:
        'O import estático traz só `parseOAuthProviders` e `oauthStartUrl`, ambos apagados. Os testes de `signupEnabled` usam o helper `load()`, que faz `import(\'./auth-config\')` dinâmico — não dependem deste import. Provenance: map 259.',
    },
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'dropBlock',
      // `\n});` na coluna zero fecha o describe de topo; um `});` qualquer casaria com o
      // primeiro `it` de dentro.
      block: { start: "describe\\('parseOAuthProviders'", end: "\\n\\}\\);" },
      reason:
        'Testa a normalização e a ORDEM dos providers — que vem do constante compartilhado, não do que foi digitado no env, para os botões não reembaralharem entre deployments. Símbolo apagado. Provenance: map 259.',
    },
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('enabledOAuthProviders / oauthEnabled'", end: "\\n\\}\\);" },
      reason:
        'Testa a leitura de `NEXT_PUBLIC_OAUTH_PROVIDERS` no load do módulo. Símbolos apagados. Provenance: map 259.',
    },
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('oauthStartUrl'", end: "\\n\\}\\);" },
      reason:
        'Testa que a URL do botão social passa pelo BFF e nunca endereça a origem da API direto. Símbolo apagado. Provenance: map 259.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      // Era `dropLinesMatching` com âncora de "um especificador por linha", e no template
      // esse import é de UMA linha (`import { loginSchema, oauthErrorCodeSchema, type
      // LoginInput, type LoginResponse } from '@dontpanic/shared';`). A costura não casava
      // nada e o `oauthErrorCodeSchema` ia inteiro para o gerado, onde o shared já não o
      // exporta — `TS2305` no pacote contra o qual api e web compilam.
      kind: 'dropImportSpecifier',
      pattern: '^(TWO_FACTOR_TICKET_COOKIE|oauthErrorCodeSchema)$',
      target: '@dontpanic/shared',
      reason:
        'Named imports de `@dontpanic/shared` que apontam para símbolos apagados. `loginSchema`, `LoginInput` e `LoginResponse` ficam no mesmo import — por isso o especificador sai, não o statement. Provenance: map 316.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImport',
      pattern: "@/lib/cookies",
      reason:
        '`clearCookie`/`readCookie` só servem ao handoff OAuth→2FA; `apps/web/src/lib/cookies.ts` é apagado por cobertura (ver deletePaths). Provenance: map 317.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImport',
      pattern: "@/components/oauth-buttons",
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Componente apagado. Provenance: map 318.",
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "const tOauth = useTranslations\\('auth\\.oauth\\.errors'\\)",
      reason:
        'Namespace i18n `auth.oauth.errors` sai dos dois arquivos de mensagem; um `useTranslations` apontando para namespace inexistente é erro de runtime do next-intl, não de build. Provenance: map 319.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "const oauthErrorHandled = useRef\\(false\\)",
        end: "\\}\\s*,\\s*\\[\\s*searchParams\\s*,\\s*tOauth\\s*\\]\\s*\\)\\s*;",
      },
      reason:
        'O leitor de `?error=<code>` do callback social, com o JSDoc que explica por que o código é traduzido (nunca ecoado cru) e por que sai da barra de endereço. Sem callback de oauth nenhum `?error=` chega aqui. Provenance: map 320.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "const twoFactorHandoffHandled = useRef\\(false\\)",
        end: "\\}\\s*,\\s*\\[\\s*searchParams\\s*,\\s*tOauth\\s*\\]\\s*\\)\\s*;",
      },
      reason:
        'O handoff `?twofactor=1` + cookie: é a metade web do desvio que impede o login social de pular o segundo fator. Os estados `ticket`/`code`/`verifying` (linhas 57-59) FICAM — o passo de 2FA por senha usa os mesmos. Provenance: map 321.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlock',
      block: {
        start: "Renders itself away — separator included — when no provider is",
        end: "<OAuthButtons intent=\"login\"",
      },
      reason:
        'Call site do botão social na tela de login (um dos dois que existem no app; o outro é o signup). Provenance: map 322.',
    },
    // Era `manualRewrite` — um no-op que só avisava. Consequência medida no projeto
    // gerado: 7 dos 9 testes de web falhando, porque os `describe` de oauth continuavam
    // exercitando `<OAuthButtons>` e o handoff por cookie, ambos apagados. Um deliverable
    // com suíte vermelha no primeiro `pnpm test` é pior que um sem os testes.
    //
    // O motivo original para não cortar por regex era o piso `statements: 99` do
    // `vitest.config.mts` medido COM a tela de oauth. Isso deixou de valer: o
    // `sync-template` já afrouxa os pisos e a costura `relaxCoverageThresholds` cuida do
    // resto, então remover os blocos é agora a opção certa — e a única que gera verde.
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: { start: "describe\\('LoginPage — social sign-in'", end: '\\}\\);' },
      reason:
        'Os três testes de `<OAuthButtons>` e de tradução do `?error=` (login.test.tsx:284-338). O componente sai em `deletePaths`, então sem esta costura o arquivo importa um módulo inexistente e a suíte do web nem carrega. Provenance: map 323.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "describe\\('LoginPage — second factor after social sign-in'",
        end: '\\}\\);',
      },
      reason:
        'Os quatro testes do handoff OAuth→2FA por cookie (login.test.tsx:340-392): leem `TWO_FACTOR_TICKET_COOKIE`, que sai de `@dontpanic/shared` com o oauth. É o desvio de 2FA do callback (I5) — existe só quando há callback social. Provenance: map 323.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBalancedBlock',
      pattern: '^\\s*oauth:\\s*\\{',
      reason:
        'O stub do namespace de mensagens `oauth` na fixture (login.test.tsx:66-…). Sai junto com as chaves `auth.oauth.*` dos dois catálogos; deixá-lo é um stub de tradução que nenhum componente pede. Provenance: map 323.',
    },
    {
      file: 'apps/web/src/app/(auth)/signup/page.tsx',
      kind: 'dropImport',
      pattern: "@/components/oauth-buttons",
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Componente apagado. Provenance: map 324.",
    },
    {
      file: 'apps/web/src/app/(auth)/signup/page.tsx',
      kind: 'dropBlock',
      block: {
        start: "`intent=signup`: a brand-new identity coming back from the provider",
        end: "<OAuthButtons intent=\"signup\"",
      },
      reason:
        'Segundo e último call site do botão social. O `intent=signup` é o que distingue "identidade nova vira empresa a nomear" de "identidade nova recebe `no_account`" no login. Provenance: map 324.',
    },
    // Mesma correção do `login.test.tsx`: era `manualRewrite` e deixava um teste vermelho.
    {
      file: 'apps/web/src/app/(auth)/signup/signup.test.tsx',
      kind: 'dropBlock',
      block: {
        start: "it\\('offers the social buttons with intent=signup when registration is on'",
        end: '\\}\\);',
      },
      reason:
        'O teste que afirma o `href` de `/api/auth/oauth/google/start?intent=signup` (signup.test.tsx:120-127) — rota que a API deixa de servir. O teste vizinho ("offers no social buttons on the closed state either") FICA: ele afirma AUSÊNCIA de botão, continua verdadeiro sem oauth, e pertence a public-signup. Provenance: map 325.',
    },
    {
      file: 'apps/web/src/app/(auth)/signup/signup.test.tsx',
      kind: 'dropBalancedBlock',
      pattern: '^\\s*oauth:\\s*\\{',
      reason:
        'O stub do namespace `oauth` na fixture de mensagens (signup.test.tsx:53-…). Provenance: map 325.',
    },

    // ── web · i18n — os dois arquivos em lock-step (regra global 1) ──────────────
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.oauth',
      reason:
        'Sub-namespace inteiro (`separator`, `continueWith`, `provider.*`, `errors.*`). Os dois arquivos de mensagem são alinhados linha a linha e testados por paridade de chaves em `apps/web/src/i18n/messages.test.ts:18-25` — remover de um só nomeia as chaves órfãs e falha a suíte. Provenance: map 327-328.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.oauth',
      reason:
        'Par obrigatório do anterior: ou os dois arquivos, ou nenhum (regra global 1, map 40-45). Provenance: map 327-328.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.completeSignup',
      reason:
        'Textos da tela "complete seu cadastro", que só existe porque provedor nenhum sabe nome e slug da empresa. O namespace `auth` sobrevive. Provenance: map 329.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.completeSignup',
      reason: 'Par obrigatório do anterior (regra global 1). Provenance: map 329.',
    },

    // ── env ─────────────────────────────────────────────────────────────────────
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: {
        start: "Social sign-in \\(OAuth\\)\\s*--\\s*optional, per provider",
        end: "OAUTH_GITHUB_CLIENT_SECRET=",
      },
      reason:
        'Bloco inteiro com cabeçalho e réguas (linhas 177-226 do arquivo): não são só as variáveis, é a prosa que ensina as pegadinhas de cada provider (Services ID vs App ID da Apple, o JWT ES256 rotativo, o `/user/emails` do GitHub). Deixar o cabeçalho sem variáveis nenhuma é pior que remover os dois. Provenance: map 332-334.',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: {
        start: "Mirrors OAUTH_PROVIDERS, same names, same spelling",
        end: "NEXT_PUBLIC_OAUTH_PROVIDERS=",
      },
      reason:
        'A metade pública. Só o prefixo `NEXT_PUBLIC_*` chega ao browser; o cabeçalho "The public halves" e `NEXT_PUBLIC_SIGNUP_ENABLED` ficam se public-signup ficar. Provenance: map 332.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: { start: "--- social sign-in ---", end: "OAUTH_GITHUB_CLIENT_SECRET: z\\.string\\(\\)" },
      reason:
        'Bloco `// --- social sign-in ---` do schema Zod (env.ts:132-157). As chaves somem do tipo `Env`, que é o que faz o compilador achar todo `config.get("OAUTH_…")` restante. Provenance: map 336-337.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: "The providers named in OAUTH_PROVIDERS, normalised and de-duplicated",
        // Fecho de função no nível de módulo: `\n}` na coluna zero é inequívoco aqui.
        end: "\\n\\}",
      },
      reason:
        '`OAUTH_PROVIDER_NAMES`, o tipo `OAuthProviderName` e `parseOAuthProviders` (env.ts:171-183). `parseOAuthProviders` tem dois consumidores: o `validateEnv` abaixo e `infra/oauth/oauth.module.ts`. Provenance: map 338.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "const OAUTH_REQUIRED_KEYS",
        // `\n};` na coluna zero: o objeto tem um array aninhado (`apple: [ … ],`) que
        // fecha com `],`, então a primeira linha que é só `};` é a do próprio objeto.
        end: "\\n\\};",
      },
      reason:
        'A tabela de credenciais obrigatórias por provider, mantida como DADO justamente para que o check de boot nunca divirja da lista de providers que existem (env.ts:185-201). Provenance: map 339.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: "A provider listed but not configured would render a button that leads",
        // A âncora de fim ia até `oauthProblems.join('\\n')`, que é o MEIO do `throw`:
        // sobravam a vírgula, o `);` e o `}` de fechamento, e o arquivo do schema de env
        // ficava sintaticamente inválido — o que o `assertBalanced` pegou. O fim tem de
        // ser o fechamento do bloco `if`, não a última expressão interessante dentro dele.
        end: "oauthProblems\\.join\\('\\\\n'\\),\\s*\\n\\s*\\);\\s*\\n\\s*\\}",
      },
      reason:
        'Os três checks de `validateEnv` (env.ts:249-282) e o throw que os consome: credencial faltando por provider listado, `OAUTH_CALLBACK_BASE_URL` obrigatório quando a lista não está vazia, e nome desconhecido na lista. `validateEnv` conserva o parse Zod, o check de captcha e o `return parsed.data;` — apagar demais aqui faz o boot deixar de validar o env inteiro. Provenance: map 340-347.',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      // O próprio `reason` original previu o problema e escolheu a ferramenta errada: no
      // template o import é de UMA linha (`import { parseOAuthProviders, parseTrustProxy,
      // validateEnv } from './env';`), então `dropLinesMatching` nunca casa e
      // `dropImport` levaria os outros dois símbolos. `dropImportSpecifier` é a costura
      // que resolve os dois formatos — e continua correta se o prettier quebrar o import.
      kind: 'dropImportSpecifier',
      pattern: 'parseOAuthProviders',
      target: '\\./env',
      reason:
        'Named import de um símbolo apagado; `parseTrustProxy` e `validateEnv` ficam. Provenance: map 349.',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropBlock',
      // Três fechos seguidos: o último `it`, o `describe('parseOAuthProviders')` aninhado e
      // o `describe('oauth')`. Um `\\}\\);` isolado casaria com o primeiro `it` de dentro.
      block: { start: "describe\\('oauth'", end: "\\}\\);\\s*\\}\\);\\s*\\}\\);" },
      reason:
        'Bloco `describe(\'oauth\')` inteiro (env.spec.ts:139-203), incluindo o `describe(\'parseOAuthProviders\')` aninhado. `describe(\'invitations\')` (126-137) e `describe(\'parseTrustProxy\')` (205+) não são tocados por oauth. Provenance: map 350-359.',
    },

    // ── prisma · o comentário que justifica a nullability ────────────────────────
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'dropBlock',
      block: {
        start: "Null for an account that only signs in through a provider",
        end: "and is the supported way to add a password later\\.",
      },
      reason:
        'Doc-comment `///` de 5 linhas acima de `passwordHash` (tenancy.prisma:158-162) explicando por que a coluna é nullable. Com o `tighten` para NOT NULL ele descreve o oposto do schema — e é ele que um leitor futuro usaria para justificar voltar a aceitar null. Provenance: map 372.',
    },

    // ── docs · bullets de "O que NÃO fazer" (não são docSections) ────────────────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        "- Não ligar OAuth só de um lado: `OAUTH_PROVIDERS` e `NEXT_PUBLIC_OAUTH_PROVIDERS` listam os mesmos\\s*\\n\\s*nomes, ou o botão extra dá 404\\. Mesma regra para `PUBLIC_SIGNUP_ENABLED` /",
      replacement:
        '- Não ligar o registro público só de um lado: `PUBLIC_SIGNUP_ENABLED` /',
      reason:
        'O bullet é COMPARTILHADO: a primeira metade é de oauth, a segunda de public-signup, e a fronteira cai no meio de uma linha. Apagar o bullet inteiro tiraria o aviso do `PUBLIC_SIGNUP_ENABLED`, que é a mesma armadilha (o formulário aparece e todo submit dá 403). Provenance: map 364 (CLAUDE.md 568-570).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: "- Não vincular conta social por e-mail que o provedor não verificou",
        end: "Endereço reciclado herdaria conta alheia\\.",
      },
      reason:
        'Bullet de 2 linhas (CLAUDE.md 571-572) sobre a chave de identidade ser o `providerAccountId`. Um CLAUDE.md gerado não deve avisar sobre feature que não foi instalada — o aviso manda o próximo dev procurar `oauth_accounts`. Provenance: map 365.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: "- Não dizer \"esta conta usa login social\" num erro de login",
        end: "inválida, com o mesmo custo de Argon2, senão vira oráculo de enumeração\\.",
      },
      reason:
        'Bullet de 2 linhas (CLAUDE.md 573-574). Sem contas social-only não há oráculo a negar, e o `ABSENT_PASSWORD_HASH` que o implementava já saiu. Provenance: map 366.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: "- Não emitir sessão num callback de OAuth sem checar `twoFactorEnabled`",
        end: "não cobre isso, e o login social viraria um jeito de pular o segundo fator\\.",
      },
      reason:
        'Bullet de 2 linhas (CLAUDE.md 580-581), o cruzamento oauth × 2fa. Provenance: map 368.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        "e \\*\\*login social\\*\\* \\(opcional, por provider\\)\\. Cada um tem\\s*\\n\\s*seção própria abaixo; `passwordHash` é nullable por causa do social\\.",
      replacement: 'Cada um tem seção própria abaixo.',
      reason:
        'O bullet "Quem entra e por onde" da seção `## Autenticação (resumo)` (CLAUDE.md 75-77) enumera as portas e termina afirmando que `passwordHash` é nullable — afirmação que o `tighten` acabou de inverter. Provenance: map 362.',
    },

    // ── README (bilíngue: PT e depois EN — os dois lados ou nenhum) ──────────────
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern:
        "^- \\*\\*(Login social|Social sign-in)\\*\\* — .*(passwordHash|nullable|no password)",
      reason:
        'Bullet de `### O que já vem pronto` (README 74) e seu par em `### What comes built in` (369). O PT ainda afirma que `passwordHash` é nullable. Provenance: map 371, 375.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "^\\| (Login social|Social sign-in)\\s*\\|",
      reason:
        'Linha da tabela das três portas, nos dois idiomas (README 193 e 490). A tabela passa a ter duas linhas. Provenance: map 372, 376.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: "\\*\\*Login social\\*\\* com Google, Apple e GitHub, opcional por provider",
        end: "passa por uma tela que pede nome e slug, porque provedor nenhum tem como saber isso\\.",
      },
      reason:
        'Parágrafo PT de `### Autenticação e controle de acesso` (README 201-205). Provenance: map 373.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: "\\*\\*Social sign-in\\*\\* with Google, Apple and GitHub",
        end: "any way of knowing those\\.",
      },
      reason:
        'Par em inglês do parágrafo anterior (README 499-504). O README é bilíngue PT-depois-EN; editar um lado só deixa as duas metades discordando sobre o que o produto faz. Provenance: map 377.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern:
        "; `OAUTH_PROVIDERS` /\\s*\\n>\\s*`NEXT_PUBLIC_OAUTH_PROVIDERS` em desacordo rendem um botão que sempre dá 404\\. E\\s*\\n>\\s*`OAUTH_CALLBACK_BASE_URL` precisa bater \\*\\*caractere a caractere\\*\\* com o redirect URI registrado em\\s*\\n>\\s*cada provider\\. A API recusa subir se um provider listado estiver sem credencial\\.",
      replacement: '.',
      reason:
        'Poda do `[!WARNING]` PT (README 207-212): a fronteira entre a metade de public-signup (o 403 do formulário) e a de oauth (o 404 do botão, o `OAUTH_CALLBACK_BASE_URL` caractere a caractere, o boot que recusa subir) cai NO MEIO DE UMA LINHA, então não há linha inteira a apagar. O aviso das duas metades do `PUBLIC_SIGNUP_ENABLED` fica. Provenance: map 374.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern:
        "; `OAUTH_PROVIDERS` / `NEXT_PUBLIC_OAUTH_PROVIDERS` out of\\s*\\n>\\s*sync render a button that always 404s\\. And `OAUTH_CALLBACK_BASE_URL` must match the redirect URI\\s*\\n>\\s*registered with each provider \\*\\*character for character\\*\\*\\. The API refuses to boot if a listed\\s*\\n>\\s*provider is missing its credentials\\.",
      replacement: '.',
      reason:
        'Par em inglês da poda anterior (README 506-511). O README é bilíngue PT-depois-EN; editar um lado só deixa as duas metades discordando sobre o que o produto exige. Provenance: map 378.',
    },
  ],

  envKeys: [
    'OAUTH_PROVIDERS',
    'OAUTH_CALLBACK_BASE_URL',
    'OAUTH_GOOGLE_CLIENT_ID',
    'OAUTH_GOOGLE_CLIENT_SECRET',
    'OAUTH_APPLE_CLIENT_ID',
    'OAUTH_APPLE_TEAM_ID',
    'OAUTH_APPLE_KEY_ID',
    'OAUTH_APPLE_PRIVATE_KEY',
    'OAUTH_GITHUB_CLIENT_ID',
    'OAUTH_GITHUB_CLIENT_SECRET',
    // A metade pública, lida pelo web em build-time. Ligar só um dos lados é a armadilha
    // documentada: listando a mais, o botão extra dá 404.
    'NEXT_PUBLIC_OAUTH_PROVIDERS',
  ],

  // (i), map 381-395: NENHUMA dependência npm fica sem uso, e isso é um achado, não um
  // esquecimento. Não há `jose` nem `jsonwebtoken` em nenhum dos quatro package.json — o
  // client secret ES256 da Apple é assinado com a stdlib (`node:crypto`:
  // `createPrivateKey`/`createSign`), o `id_token` é decodificado à mão em `id-token.ts`
  // (chega por TLS do token endpoint, não é verificado criptograficamente) e as chamadas
  // HTTP usam o `fetch` global. `@nestjs/jwt` é o JWT de SESSÃO, usado pelo `TokenService`
  // — manter. No web, `oauth-buttons.tsx` só importa react, next-intl, lucide-react e o
  // `Button` local, todos já usados em outro lugar.
  deps: [],

  // Nenhum serviço de docker-compose é de oauth: os providers são HTTP de terceiros.
  composeServices: [],

  docSections: ['Login social — decisão de deploy opcional'],

  // (j) + A2 §4 (map 4972): oauth NÃO tem SQL manual. `CREATE TYPE "OAuthProviderName"`,
  // `CREATE TABLE "oauth_accounts"`, seus 4 índices e 2 FKs são todos AUTO — o
  // `prisma migrate diff` os regenera a partir de `prisma/schema/oauth.prisma`, então
  // apagar o arquivo de schema basta. O isolamento vem de graça do `tenantId`
  // denormalizado + a varredura `rls-06-sweep-call`, que é de multi-tenancy e é sempre
  // emitida por último. A nullability de `passwordHash` também é AUTO: com o `tighten`
  // acima, a baseline nasce `"passwordHash" TEXT NOT NULL` e o
  // `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL` simplesmente não é
  // gerado.
  sqlFragments: [],
};

export const invitationsManifest: FeatureManifest = {
  id: 'invitations',
  label: 'Convites',
  summary:
    'A única porta para uma empresa que já existe: o ADMIN convida, o convidado escolhe a própria senha e o clique no link mailado é o que prova o endereço.',

  // (k), map 1068-1105 e 1218-1221: nenhuma feature precisa estar LIGADA para convites
  // funcionarem. A dependência de `plans` é real (dois call sites de `assertCanAddUser`)
  // mas o mapa descreve a remoção: caem os dois call sites e convites ficam sem limite de
  // assento. A de `queue` é apenas o job genérico `mail.send` — não há job de convite —, e
  // o nível (i) de remoção de queue preserva o port `QueueProvider`, então
  // `this.queue.enqueue` continua compilando. `platform` é a seta INVERSA: é o painel que
  // depende de convites (ver as costuras `required: false` abaixo). `oauth`, `2fa` e
  // `public-signup` não têm dependência nenhuma nos dois sentidos. `multiTenant` é
  // `alwaysOn`, então listá-lo seria ruído — mas a dependência é estrutural: dois dos três
  // `@SystemScope()` do repo estão aqui.
  requires: [],

  deletePaths: [
    // (a), map 723-738: diretório inteiro do módulo, incluindo `support/invitation-email.ts`
    // (que só importa o tipo `EmailLocale` do auth) e os dois specs.
    'apps/api/src/modules/invitations',
    // Único e2e da feature; 64 hits de `invit` e não toca em mais nada.
    'apps/api/test/invitations.e2e-spec.ts',
    'packages/shared/src/invitation.ts',
    // `layout.tsx` (empresta o `AuthShell`) + `[token]/page.tsx` + `[token]/invite.test.tsx`.
    'apps/web/src/app/invite',
    // O diretório só contém `invite-user-dialog.tsx` e `invitations-table.tsx`; fica vazio.
    // Nenhum dos dois está no `include` de cobertura do vitest (que cobre
    // components/{ui,records,dashboard,charts,tenant,legal,platform}, não components/admin),
    // então apagá-los não move nenhum piso.
    'apps/web/src/components/admin',
  ],

  prisma: {
    dropFiles: ['apps/api/prisma/schema/invitations.prisma'],
    dropFields: [
      // (c), map 830-838: as quatro back-relations são OBRIGATÓRIAS — o Prisma não valida
      // um campo de relação apontando para modelo apagado. Ninguém as lê (grep por
      // `invitationsSent`, `invitationAccepted`, `Tenant.invitations`, `Profile.invitations`
      // acha só estas linhas de schema); o lado FORWARD é que é usado, dentro do service.
      { model: 'Tenant', fields: ['invitations'] },
      { model: 'User', fields: ['invitationsSent', 'invitationAccepted'] },
      { model: 'Profile', fields: ['invitations'] },
    ],
    // `Role` (tenancy.prisma:142-146) é COMPARTILHADO: `Invitation.role` só o referencia,
    // `User.role` é o dono. Fica. E `User.passwordHash` NÃO é afetado por convites —
    // `accept()` sempre grava hash de verdade (invitations.service.ts:491 → 529); a
    // nullability é decisão de oauth.
  },

  seams: [
    // ── API · módulos ───────────────────────────────────────────────────────────
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: "\\./modules/invitations/invitations\\.module",
      reason:
        'Import órfão de diretório apagado quebra o `nest build`. O `main.ts` NÃO muda: zero hits de `invit` no bootstrap. Provenance: map 771.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: "\\s*InvitationsModule,",
      reason: 'Entrada no array `imports` do @Module. Provenance: map 772.',
    },
    {
      file: 'apps/api/src/modules/platform/platform.module.ts',
      kind: 'dropImport',
      pattern: "\\.\\./invitations/invitations\\.module",
      reason:
        'PLATFORM DEPENDE DE CONVITES, uma direção só: criar empresa convida o primeiro admin, então o painel empresta o mesmo service que um ADMIN de empresa usa. Se `platform` estiver desligado o arquivo já não existe, daí `required: false`. Provenance: map 781, 1109-1116.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/platform/platform.module.ts',
      kind: 'dropBlock',
      block: {
        start: "Creating a company invites its first administrator, so the panel borrows",
        end: "imports: \\[InvitationsModule\\],",
      },
      reason:
        'O comentário de 3 linhas e o `imports: [InvitationsModule]` — que vira `imports: []`, obrigatório e não opcional no Nest 12 (`ModuleMetadata[\'imports\']` deixou de ser opcional, e é por isso que o `@nestjs/throttler` está travado com `imports: []` explícito). Ausente se `platform` estiver fora. Provenance: map 782.',
      required: false,
    },

    // ── API · platform · a parte que subtração não produz ────────────────────────
    {
      file: 'apps/api/src/modules/platform/services/platform-tenants.service.ts',
      kind: 'manualRewrite',
      pattern: "async create\\(",
      replacement: 'platform-tenants.service.create.invitations-off',
      reason:
        'O mapa é explícito: `create()` tem de ser REESCRITO, não podado (map 783-786; ranges: 122-271, com 133-137 doc, 145 `adminEmail`, 159/162 pré-check, 192-206 `invitations.issue(tx, …)`, 221-223 metadados de auditoria, 233 tupla de retorno, 236-256 o short-circuit de `sendInvitation` + `dispatchInvitationEmail` pós-commit, 264-266 o braço `email` da tradução do P2002, e o helper `mailLocale()` em 55-63 que só serve à linha 253). Subtrair tudo isso deixa a opção (1) do mapa — empresa criada sem administrador nenhum, inalcançável até alguém se cadastrar nela, o que o `provisionTenant` não permite: EMPRESA MORTA. O mapa recomenda a opção (3): criar o primeiro admin e mandar um token de PASSWORD RESET em vez do convite, reusando `PasswordResetToken` + `AuthService.forgotPassword`, o que preserva "quem recebe escolhe a própria credencial" — mas isso exige `User.passwordHash` NULLABLE e portanto acopla de volta à decisão de oauth (map 1131-1139). Decisão de produto: PERGUNTAR AO MARCIO. Ausente se `platform` estiver fora.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/platform/services/platform-tenants.service.spec.ts',
      kind: 'manualRewrite',
      pattern: "InvitationsService",
      replacement: 'platform-tenants.service.spec.invitations-off',
      reason:
        'O spec mocka `InvitationsService` e afirma duas coisas que deixam de existir: que o convite é emitido DENTRO da transação e que o e-mail sai DEPOIS dela (33 hits de `invit`). O mapa não dá ranges porque o arquivo não tem região isolável — a asserção está entrelaçada com o teste de criação de empresa, que sobrevive. Ausente se `platform` estiver fora. Provenance: map 787.',
      required: false,
    },
    {
      file: 'apps/api/src/modules/platform/platform.controller.ts',
      kind: 'replace',
      pattern: "summary: 'Create a company and invite its first administrator'",
      replacement: "summary: 'Create a company'",
      reason:
        'O `@ApiOperation` alimenta o Swagger em `/docs`; prometer um convite que o endpoint já não emite é contrato publicado errado. O doc-comment acima (61-65) diz que a resposta não contém senha nem usuário e que `invitationSent` avisa se o e-mail saiu — some com o campo. Provenance: map 788.',
      required: false,
    },

    // ── API · comentários que passam a apontar para código apagado ───────────────
    {
      file: 'apps/api/src/modules/admin/admin-users.service.ts',
      kind: 'replace',
      pattern:
        "Both\\s*\\*?\\s*are fixed by the invitation flow \\(InvitationsModule\\): the invitee chooses\\s*\\*?\\s*their own password, and clicking a mailed link is what proves the mailbox is\\s*\\*?\\s*theirs\\. Adding a `create` back here would reopen both holes at once\\.",
      replacement:
        'Reintroduzir um `create` aqui reabriria as duas falhas de uma vez.',
      reason:
        'O doc-comment explica POR QUE não existe "criar usuário" no /admin, apontando para o InvitationsModule como o conserto. Sem convites o texto manda o leitor procurar um módulo apagado — e, pior, tira a única explicação de por que o endpoint não existe, que é justamente o que faz alguém reintroduzi-lo. O endpoint em si JÁ está removido; nada precisa ser restaurado (ver o alerta em `docSections`). Provenance: map 778.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-users.controller.ts',
      kind: 'replace',
      pattern:
        "There is no POST here: a new colleague arrives through\\s*\\*?\\s*`POST /admin/invitations`, never through an admin choosing their password\\.",
      replacement:
        'There is no POST here: an administrator must never choose another person\u2019s password.',
      reason:
        'Comentário de classe apontando para uma rota que deixou de existir. Provenance: map 779.',
    },
    {
      file: 'apps/api/src/modules/admin/admin-profiles.controller.ts',
      kind: 'replace',
      pattern: "It exists because inviting someone means choosing what they will be able to",
      replacement: 'It exists because assigning someone a profile means choosing what they will be able to',
      reason:
        'Só o comentário. O controller `/admin/profiles` SOBREVIVE: além do picker do dialog de convite, a tela de usuários da empresa também o consome. Provenance: map 780.',
    },
    {
      file: 'apps/api/src/modules/tenants/support/tenant-provisioning.ts',
      kind: 'replace',
      pattern: "\\(the first user, the legal\\s*\\*?\\s*acceptance, the invitation\\)",
      replacement: '(the first user, the legal acceptance)',
      reason:
        'Doc-comment apenas, zero mudança de código. É a frase que explica por que `provisionTenant` exige transação aberta pelo chamador — a lista do que morre junto. Provenance: map 790.',
    },

    // ── API · allowlist de @SystemScope() — regra global 2 ───────────────────────
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'dropBlock',
      block: {
        start: "`GET auth/invitations/:token` and `POST auth/invitations/accept`",
        end: "'modules/invitations/public-invitations\\.controller\\.ts:2',",
      },
      reason:
        'A allowlist é CALCULADA por varredura e comparada a um array literal (regra global 2, map 46-54); emitir o array do repo num projeto sem convites dá suíte vermelha em clone novo, o que treina o usuário a editar a asserção e destrói a guarda que impede `@SystemScope()` de migrar para rota de negócio. A lista passa a ser exatamente `["modules/auth/auth.controller.ts:8", "modules/auth/oauth/oauth.controller.ts:1"]` (só a primeira se oauth também sair). Provenance: map 791.',
    },

    // ── API · e2e ───────────────────────────────────────────────────────────────
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'dropBlock',
      block: {
        start: "Checked separately because an invitation can outlive having no user at",
        end: "ownerDb\\(\\)\\.invitation\\.findMany\\(",
      },
      reason:
        'O `assertCleanStart()` checa convites SEPARADAMENTE porque um convite sobrevive a não haver usuário nenhum (empresa criada no painel tem admin convidado e nenhuma conta). Com o model apagado, `ownerDb().invitation` não existe no client gerado e o arquivo não compila — o que derruba TODA a suíte e2e, não só a de convites. Provenance: map 792.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: "if \\(users\\.length === 0 && invitations\\.length === 0\\) return;",
      replacement: 'if (users.length === 0) return;',
      reason:
        'A guarda do fail-fast. `assertCleanStart()` existe para FALHAR a suíte seguinte nomeando o que ficou para trás — limpar em silêncio esconderia o defeito e ele voltaria. Provenance: map 792.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'dropBlock',
      block: {
        start: "invitations\\.length > 0",
        end: ": null,",
      },
      reason:
        'O braço da mensagem de erro que lista os e-mails dos convites remanescentes. Provenance: map 792.',
    },
    {
      file: 'apps/api/test/e2e-app.ts',
      kind: 'replace',
      pattern: ",\\s*\"invitations\"",
      replacement: '',
      reason:
        'A lista do `TRUNCATE TABLE` em `resetDb()` nomeia as tabelas de domínio explicitamente; citar uma tabela inexistente faz toda a suíte e2e falhar no primeiro reset, antes de qualquer asserção. E nunca troque isso por um TRUNCATE dentro da suíte: ele toma ACCESS EXCLUSIVE e trava contra as conexões vivas da aplicação escrevendo auditoria fora de banda. Provenance: map 793.',
    },

    // ── shared ──────────────────────────────────────────────────────────────────
    {
      file: 'packages/shared/src/index.ts',
      kind: 'dropLinesMatching',
      pattern: "export \\* from '\\./invitation';",
      reason:
        'O `index.ts` é só star-exports e muda EXCLUSIVAMENTE para `invitation` e `oauth`; um re-export de arquivo apagado quebra o build do shared, que api e web consomem. Provenance: map 888-889.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "\\*\\*No password\\.\\*\\* The operator names the first administrator",
        end: "the address gets proven by the acceptance instead of being taken on faith\\.",
      },
      reason:
        'Bullet do doc-block de `platformCreateTenantSchema` (tenant.ts:223-225) que é integralmente sobre convites. O bullet dos termos comerciais fica. Provenance: map 873-874.',
      required: false,
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: "The first administrator, who receives the invitation\\.",
        end: "adminName: z\\.string\\(\\)",
      },
      reason:
        '`adminEmail` e `adminName` do contrato de criação de empresa pelo painel. Contrato e service mudam juntos ou o Zod recusa o payload que a tela manda. Provenance: map 875.',
      required: false,
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: "sendInvitation: z\\.boolean\\(\\)\\.default\\(true\\),",
        end: "sendInvitation: z\\.boolean\\(\\)\\.default\\(true\\),",
      },
      reason:
        '`sendInvitation` existia para importação e para cliente configurado antes da reunião de kickoff: criar a empresa com o convite pendente e sem mandar e-mail. Sem convite não há o que adiar. O JSDoc acima sai junto. Provenance: map 876.',
      required: false,
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'replace',
      pattern: "What the operator gets back: the company, and whether the invite went out\\.",
      replacement: 'What the operator gets back: the company.',
      reason:
        'Doc de uma linha de `platformCreateTenantResponseSchema`, cujo campo `invitationSent` sai na costura seguinte. Provenance: map 877.',
      required: false,
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropLinesMatching',
      pattern: "invitationSent: z\\.boolean\\(\\),",
      reason:
        '`invitationSent` é o que o painel lê para escolher entre dois toasts. Sair do schema é o que faz o compilador achar o `result.invitationSent` na tela. Provenance: map 877.',
      required: false,
    },

    // ── web ─────────────────────────────────────────────────────────────────────
    {
      file: 'apps/web/src/proxy.ts',
      kind: 'dropBlock',
      block: {
        start: "Accepting an invitation IS a registration",
        end: "'/invite',",
      },
      reason:
        '`\'/invite\'` no `PRE_AUTH_PREFIXES` com as 5 linhas que o justificam: aceitar é um REGISTRO, então quem já tem sessão e abre um link de convite é mandado para casa em vez de ver um formulário que construiria uma segunda conta sob os cookies da primeira. Sem a rota `/invite`, o prefixo é regra morta. Provenance: map 795, 862-865.',
    },
    {
      file: 'apps/web/src/proxy.test.ts',
      kind: 'dropBlock',
      block: {
        start: "it\\('lets an invited stranger reach the accept screen, token and all'",
        end: "\\}\\s*\\)\\s*;",
      },
      reason:
        'Testa que o link funciona sem sessão, com o token como segmento de caminho. Provenance: map 796.',
    },
    {
      file: 'apps/web/src/proxy.test.ts',
      kind: 'dropBlock',
      block: {
        start: "it\\('sends an already signed-in visitor away from an invite link'",
        end: "\\}\\s*\\)\\s*;",
      },
      reason:
        'Par do anterior: o outro lado da regra (sessão viva → redireciona). Provenance: map 796.',
    },
    {
      file: 'apps/web/src/components/auth-shell.tsx',
      kind: 'replace',
      pattern: "/invite/",
      replacement: '/login',
      reason:
        'Só o doc-comment (linhas 9-11). O `AuthShell` FICA — existe em parte para `/invite`, mas o grupo `(auth)` também o usa. Provenance: map 797, 763-764.',
    },
    {
      file: 'apps/web/src/app/(auth)/signup/page.tsx',
      kind: 'replace',
      pattern: "from the outside; everyone else arrives by invitation\\.",
      replacement: 'from the outside.',
      reason:
        'Doc-comment da tela de signup. Provenance: map 800.',
    },
    {
      file: 'apps/web/src/app/(auth)/signup/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "\\{t\\('closedInvite'\\)\\}",
      reason:
        'Na tela de "registro fechado" esse texto diz que o acesso é por convite. Sem convites a mensagem é uma MENTIRA — e a única porta que resta é o `db:seed`. Sai com a chave i18n `auth.signup.closedInvite` nos dois idiomas. Provenance: map 801, 867.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropImport',
      pattern: "@/components/admin/invite-user-dialog",
      reason: 'Componente apagado. A tela `/admin` (lista de usuários da empresa) sobrevive. Provenance: map 802.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropImport',
      pattern: "@/components/admin/invitations-table",
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Componente apagado. Provenance: map 802.",
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropBlock',
      block: {
        start: "\"Create user with a password\" is gone from the API",
        end: "const \\[inviting, setInviting\\] = useState\\(false\\);",
      },
      reason:
        'O estado do dialog e o comentário que explica por que não existe "criar usuário com senha". ATENÇÃO: removida a feature, a tela `/admin` fica SEM NENHUMA forma de adicionar usuário — é a consequência que o mapa manda levar ao operador, não esconder. Provenance: map 803, 879-884.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "setInviting\\(true\\)",
      reason: 'O botão "Convidar usuário" no cabeçalho da lista. Provenance: map 804.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "<InvitationsTable />",
      reason: 'A tabela de convites abaixo da lista de usuários. Provenance: map 805.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/admin/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "<InviteUserDialog open=\\{inviting\\}",
      reason: 'O dialog de convite. Provenance: map 806.',
    },
    {
      file: 'apps/web/src/components/platform/create-tenant-dialog.tsx',
      kind: 'manualRewrite',
      pattern: "adminEmail|sendInvitation",
      replacement: 'create-tenant-dialog.invitations-off',
      reason:
        'Saem `adminName`/`adminEmail`/`sendInvitation` do tipo `FormState` (65-67), dos defaults `EMPTY` (83-85) e do payload de submit (144-146), MAIS o fieldset "O primeiro administrador" inteiro (305-341: `adminName`, `adminEmail`, o aviso `noPasswordNotice` e o Switch de `sendInvitation`). O JSX não tem fronteira ancorável por regex — o `<p>` de legenda e o `</div>` de fechamento são genéricos, e cortar errado deixa tags desbalanceadas que o build do Next rejeita com erro que não menciona convites. Precisa casar com a variante escolhida para `platform-tenants.service.create`. Provenance: map 807.',
      required: false,
    },
    {
      file: 'apps/web/src/components/platform/create-tenant-dialog.test.tsx',
      kind: 'manualRewrite',
      pattern: "sendInvitation|adminEmail",
      replacement: 'create-tenant-dialog.test.invitations-off',
      reason:
        'Stubs de mensagem (38-43), payload esperado do submit (116-118) e a asserção de `sendInvitation: false` (199). Este arquivo ESTÁ dentro do `include` de cobertura (`src/components/platform/**`, vitest.config.mts:32), então precisa ser EDITADO, não apagado: apagá-lo tira a cobertura do dialog que sobrevive e derruba `statements: 99`. Provenance: map 808.',
      required: false,
    },
    {
      file: 'apps/web/src/app/platform/tenants/page.tsx',
      kind: 'manualRewrite',
      pattern: "result\\.invitationSent",
      replacement: 'platform-tenants-page.toast.invitations-off',
      reason:
        'O toast tem dois desfechos porque o operador precisa distinguir "empresa com administrador convidado" de "empresa criada e ninguém avisado". Com `invitationSent` fora do contrato de resposta sobra UM desfecho — o ternário vira uma chamada só, o que é reescrita e não corte de linhas. Provenance: map 809.',
      required: false,
    },
    {
      file: 'apps/web/src/components/platform/platform-api.ts',
      kind: 'replace',
      pattern:
        "The response says whether the first administrator's invitation actually went",
      replacement: 'The response carries the created company',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Coment\u00e1rio apenas. Provenance: map 810.",
      required: false,
    },
    {
      file: 'apps/web/src/components/platform/platform-api.test.tsx',
      kind: 'manualRewrite',
      pattern: "invitation",
      replacement: 'platform-api.test.invitations-off',
      reason:
        'Dois hits de `invit`, acompanhando a mudança de forma de `PlatformCreateTenantResponse`. O mapa não dá ranges. Provenance: map 811.',
      required: false,
    },

    // ── web · i18n — os dois arquivos em lock-step (regra global 1) ──────────────
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'invite',
      reason:
        'ÚNICO namespace de topo que desaparece em qualquer das duas features (map 856). Os dois arquivos de mensagem têm 575 linhas alinhadas linha a linha e são testados por paridade em `apps/web/src/i18n/messages.test.ts:18-25`: remover de um só nomeia as chaves órfãs e falha a suíte — falha boa, mas que tem de ser respeitada. Provenance: map 856.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'invite',
      reason: 'Par obrigatório do anterior (regra global 1, map 40-45). Provenance: map 856.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'admin.inviteUser',
      reason: 'Rótulo do botão "Convidar usuário" na tela `/admin`. Provenance: map 857.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'admin.inviteUser',
      reason: 'Par obrigatório do anterior. Provenance: map 857.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'admin.invite',
      reason: 'Sub-namespace inteiro do dialog de convite. Provenance: map 858.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'admin.invite',
      reason: 'Par obrigatório do anterior. Provenance: map 858.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'admin.invitations',
      reason:
        'Sub-namespace inteiro da tabela de convites, incluindo `status.EXPIRED` — que existe só no i18n e no schema Zod porque EXPIRED é DERIVADO na leitura, nunca um valor gravado. Provenance: map 859.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'admin.invitations',
      reason: 'Par obrigatório do anterior. Provenance: map 859.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.signup.closedInvite',
      reason:
        'Texto "o acesso é por convite" na tela de registro fechado; sem convites é falso. Sai junto com o `<p>` que o renderiza. Provenance: map 867.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.signup.closedInvite',
      reason: 'Par obrigatório do anterior. Provenance: map 867.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.toast.tenantCreatedInvited',
      reason: 'Um dos dois desfechos do toast de criação de empresa. Provenance: map 868.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.toast.tenantCreatedInvited',
      reason: 'Par obrigatório do anterior. Provenance: map 868.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.toast.tenantCreatedNoInvite',
      reason: 'O outro desfecho do toast. Provenance: map 869.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.toast.tenantCreatedNoInvite',
      reason: 'Par obrigatório do anterior. Provenance: map 869.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminLegend',
      reason: 'Legenda do fieldset "O primeiro administrador". Provenance: map 870.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminLegend',
      reason: 'Par obrigatório do anterior. Provenance: map 870.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminName',
      reason: 'Campo do fieldset do primeiro administrador. Provenance: map 871.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminName',
      reason: 'Par obrigatório do anterior. Provenance: map 871.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminEmail',
      reason: 'Campo do fieldset do primeiro administrador. Provenance: map 872.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.adminEmail',
      reason: 'Par obrigatório do anterior. Provenance: map 872.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.noPasswordNotice',
      reason:
        'O aviso que explica por que o painel não pede senha do administrador — a frase inteira é sobre convite. Provenance: map 873.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.noPasswordNotice',
      reason: 'Par obrigatório do anterior. Provenance: map 873.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitation',
      reason: 'Rótulo do Switch de "mandar o convite agora". Provenance: map 874.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitation',
      reason: 'Par obrigatório do anterior. Provenance: map 874.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitationOn',
      reason: 'Texto do Switch ligado. Provenance: map 875.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitationOn',
      reason: 'Par obrigatório do anterior. Provenance: map 875.',
      required: false,
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitationOff',
      reason: 'Texto do Switch desligado. Provenance: map 876.',
      required: false,
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'platform.createTenant.sendInvitationOff',
      reason: 'Par obrigatório do anterior. Provenance: map 876.',
      required: false,
    },
    // NÃO há costura para `platform.createTenant.subtitle` (map 877, linha 535 dos dois
    // arquivos): o texto é "Cadastre a empresa e convide o primeiro administrador" e o
    // mapa manda REESCREVER, não apagar — apagar a chave quebra o dialog que sobrevive.
    // Reescrita de cópia não é subtração; vai junto com a variante manual do
    // `create-tenant-dialog`.

    // ── env ─────────────────────────────────────────────────────────────────────
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: {
        start: "An invitation is the only way into a company that already exists",
        end: "INVITATION_MAX_RESENDS=5",
      },
      reason:
        'Bloco inteiro (linhas 166-175): o comentário de 6 linhas explica que as duas variáveis são sobre o RAIO DE ALCANCE do link e não sobre armazenamento (o banco só guarda o SHA-256), e é a prosa que justifica os defaults. Deixar o cabeçalho sem as variáveis é pior que remover os dois. Provenance: map 902-904.',
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern: "Off, the only doors left are an invitation and the seed",
      replacement: 'Off, the only door left is the seed',
      reason:
        'A prosa do `PUBLIC_SIGNUP_ENABLED` (linhas 158-160) diz que um signup fechado deixa "o convite e o seed". Sem convites sobra SÓ o `db:seed` — e essa é a consequência que o mapa manda levar ao operador em vez de deixar implícita. O texto da API é diferente palavra por palavra (env.ts:114) e tem costura própria. Provenance: map 904-905.',
      required: false,
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern: "Who may get in\\s+--\\s+public signup and invitations",
      replacement: 'Who may get in  --  public signup',
      reason:
        'Cabeçalho da seção (.env.example:156). Um cabeçalho que anuncia convites sobre um bloco que só tem `PUBLIC_SIGNUP_ENABLED` manda o operador procurar variáveis que não existem. Provenance: map 902.',
      required: false,
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: "How long a mailed invitation stays good",
        end: "INVITATION_MAX_RESENDS: z\\.coerce\\.number\\(\\)",
      },
      reason:
        'Linhas 124-130 do schema Zod. Ao contrário de oauth, NÃO há lógica condicional em `validateEnv()` para convites: são dois números com bounds e default, sem check cruzado — então esta é a única costura em `env.ts`. O cabeçalho `// --- who may get in ---` (113) e `PUBLIC_SIGNUP_ENABLED` (123) ficam. Provenance: map 907-918.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'replace',
      pattern: "off, the only ways in are an invitation and the seed",
      replacement: 'off, the only way in is the seed',
      reason:
        'Espelho do texto do `.env.example`; o comentário do `PUBLIC_SIGNUP_ENABLED` enumera as portas restantes. Provenance: map 904-905.',
      required: false,
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropBlock',
      // Dois fechos seguidos: o último `it` e o `describe`. Não há describe aninhado aqui.
      block: { start: "describe\\('invitations'", end: "\\}\\);\\s*\\}\\);" },
      reason:
        'Bloco `describe(\'invitations\')` (env.spec.ts:126-137): afirma os defaults 168/5 e que um TTL além de um mês de horas é recusado. Ambos testam chaves que saíram do schema, então falham em typecheck contra o tipo `Env`. Provenance: map 920-924.',
    },

    // ── docs · bullets de "O que NÃO fazer" (não são docSections) ────────────────
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: "- Não disparar o e-mail de convite dentro da transação",
        end: "nada\\. `issue\\(\\)` grava no `tx` do chamador; o envio é depois do commit\\.",
      },
      reason:
        'Bullet de 2 linhas (CLAUDE.md 575-576). Era a regra que impedia mover o disparo do e-mail para dentro da transação — um rollback entregaria link válido apontando para empresa que não existe. Sem convites não há `issue()` a proteger. Provenance: map 947.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: "- Não criar usuário de outra pessoa definindo a senha dela",
        end: "quem entra escolhe a própria senha e o clique no link é o que prova o endereço\\.",
      },
      reason:
        'Bullet de 2 linhas (CLAUDE.md 577-578). ATENÇÃO: é ESTA regra que proíbe o endpoint de "admin cria usuário com senha" no `/admin`. Remover convites sem reinstalar algo deixa a tela `/admin` sem nenhuma forma de adicionar usuário — o mapa manda sinalizar ao operador, não apagar em silêncio (ver também o bloco de comentário em `packages/shared/src/user.ts:104-116`, que explica por que o contrato não existe e aponta para `createInvitationSchema`). Provenance: map 948, 884.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        "Quem entra e por onde: \\*\\*signup público\\*\\* \\(opcional, `PUBLIC_SIGNUP_ENABLED`\\), \\*\\*convite\\*\\* — a\\s*\\n\\s*única porta para empresa que já existe —",
      replacement: 'Quem entra e por onde: **signup público** (opcional, `PUBLIC_SIGNUP_ENABLED`)',
      reason:
        'Bullet "Quem entra e por onde" da seção `## Autenticação (resumo)` (CLAUDE.md 75-77). A frase do convite atravessa a quebra de linha, então não há linha inteira a apagar. Provenance: map 946.',
    },

    // ── README (bilíngue: os dois lados ou nenhum) ───────────────────────────────
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "^- \\*\\*(Convites|Invitations)\\*\\* — ",
      reason:
        'Bullet de `### O que já vem pronto` (README 73) e seu par em `### What comes built in` (368). Provenance: map 955, 959.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: "\\*\\*criar empresa\\*\\* \\(que convida o primeiro admin em vez de definir senha para ele\\)",
      replacement: '**criar empresa**',
      reason:
        'Bullet do back-office do operador (README 79): a cláusula entre parênteses é a única parte do bullet que descreve o comportamento que muda; o resto do bullet (estatísticas, suspender, estender trial, CRUD de planos) é de `platform`. Provenance: map 956.',
      required: false,
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: " \\(which invites its first admin rather than setting a password for them\\)",
      replacement: '',
      reason:
        'Par em inglês do bullet anterior (README 374). Provenance: map 960.',
      required: false,
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "^\\| (Convite|Invitation)\\s*\\|",
      reason:
        'Linha da tabela das três portas, nos dois idiomas (README 192 e 489). Provenance: map 957, 961.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: "\\*\\*Convites\\*\\* são a única entrada para uma empresa que já existe",
        end: "no \\*\\*aceite\\*\\*, que é onde o assento é consumido\\.",
      },
      reason:
        'Parágrafo PT de `### Autenticação e controle de acesso` (README 195-199). Provenance: map 958.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: "\\*\\*Invitations\\*\\* are the only way into a company that already exists",
        end: "\\nconsumed\\.",
      },
      reason:
        'Par em inglês do parágrafo anterior (README 492-497). O README é bilíngue PT-depois-EN; editar um lado só deixa as duas metades discordando sobre o que o produto faz. Provenance: map 962.',
    },
  ],

  envKeys: ['INVITATION_TTL_HOURS', 'INVITATION_MAX_RESENDS'],

  // (i), map 927-940: NENHUMA dependência npm fica sem uso — achado verificado por grep,
  // não suposição. `argon2` é usado por auth.service, signup.service, users.service,
  // admin-users.service e o seed; `invitation-email.ts` importa só o tipo `EmailLocale`
  // local e monta HTML/texto à mão (nenhuma lib de template); no web, os três arquivos
  // importam apenas react-hook-form, @hookform/resolvers/zod, @tanstack/react-query,
  // next-intl, sonner, lucide-react, zod e componentes `ui/` locais. Nota lateral:
  // `invitations-table.tsx:13` importa `formatDate` de `@/components/platform/format` —
  // import cruzado para dentro de `platform`, numa direção só.
  deps: [],

  // Nenhum serviço de docker-compose. O e-mail do convite sai pelo job genérico
  // `mail.send` (Mailpit em dev), que é de queue/mail, não de convites.
  composeServices: [],

  docSections: [
    // ATENÇÃO (map 945): as linhas 204-210 DENTRO desta seção são sobre
    // `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` e pertencem a
    // *public-signup*, não a convites. Se public-signup sobreviver, esse parágrafo tem de
    // ser RELOCADO (por exemplo para `## Autenticação (resumo)`) em vez de apagado — senão
    // o projeto gerado perde a única documentação da armadilha "formulário renderiza e
    // todo submit dá 403".
    'Convites — a única porta para uma empresa que já existe',
  ],

  // (j) + A2 §4 (map 4973): convites são a ÚNICA feature além de multi-tenancy que possui
  // um statement SQL MANUAL. `rls-05-partial-index-invitations` é o índice único PARCIAL
  // `invitations_tenant_email_pending_key ON "invitations"("tenantId","email") WHERE status
  // = 'PENDING'` — parcial porque a restrição só vale enquanto o convite está vivo (depois
  // de aceito ou revogado a mesma pessoa pode ser convidada de novo, e um
  // UNIQUE(tenantId,email) simples recusaria isso para sempre), e a linguagem do Prisma não
  // sabe expressar índice parcial, por isso ele vive na migration. É também o que FECHA A
  // CORRIDA que o pré-check do service não fecha: dois admins convidando o mesmo colega no
  // mesmo instante ambos leem "não há convite pendente" e ambos inserem; o Postgres recusa
  // o segundo e `translatePendingConflict` traduz o P2002 em 409. Dropá-lo faz
  // `InvitationsService.create` perder a garantia EM SILÊNCIO — `retireStalePending` não
  // tranca nada. Todo o resto (CREATE TYPE "InvitationStatus", CREATE TABLE "invitations",
  // 4 índices, 4 FKs) é AUTO, regenerado pelo `prisma migrate diff`.
  sqlFragments: ['rls-05-partial-index-invitations'],
};

// ─────────────────────────────────────────────────────────────────────────────────────
// NOTA QUE O MAPA MANDA PRESERVAR — invitations × plans (map 1093-1105)
//
// `PlanLimitsService.assertCanAddUser` (plan-limits.service.ts:105) tem EXATAMENTE DOIS
// call sites de produção, e OS DOIS são de convites:
//
//   1. `invitations.service.ts:223`, dentro de `create()` — cortesia, NÃO a garantia: só
//      evita que um ADMIN mande convite para um plano que já está cheio.
//   2. `invitations.service.ts:518-520`, dentro de `accept()` — o check AUTORITATIVO, que
//      corre no MESMO `tx` do `tx.user.create` para manter o `pg_advisory_xact_lock` e a
//      contagem em volta da escrita que consome o assento. É por isso que ele reentra em
//      escopo de tenant à mão via `TenantContext.run` — a rota de aceite corre em escopo
//      `system` (não há tenant antes de resolver o token) e o `PlanLimitsService` leria o
//      tenant do contexto do request, que ali está vazio.
//
// Consequência, e é a surpresa do dossiê: REMOVER CONVITES DEIXA A IMPOSIÇÃO DE `maxUsers`
// DA FEATURE `plans` COM ZERO CHAMADORES — `maxUsers` vira documentação. E o modo de falha
// é silencioso: `plan-limits.service.spec.ts` continua passando a 100% porque chama o
// método direto. O mapa dá três saídas: (a) manter convites, (b) recolocar um check de
// assento no que substituir a criação de usuário pelo admin, ou (c) emitir
// `PlanLimitsService` SEM `assertCanAddUser` e tirar `maxUsers` do model/DTO de plano.
// Entregar (nada) é a falha. Isto pertence ao manifesto de `plans`, não a este — está aqui
// porque é aqui que a informação foi descoberta.
