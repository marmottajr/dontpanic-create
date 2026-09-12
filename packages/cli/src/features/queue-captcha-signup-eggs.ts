/**
 * Fragmento do manifesto: F10 queue · F11 captcha · F12 public-signup · F13 easter-eggs.
 *
 * Transcrição fiel de `docs/maps/feature-surface.md` (commit mapeado `4b32926`).
 * Nada aqui é design: cada linha tem procedência no mapa, anotada em `reason` ou em
 * comentário. Caminhos são relativos à raiz do PROJETO GERADO, como o mapa escreve.
 *
 * Regras globais do mapa (linhas 37-65) que atravessam os quatro dossiês:
 *  1. Os dois arquivos de locale ou nenhum — `pt-BR.json` e `en-US.json` são alinhados
 *     linha a linha e `apps/web/src/i18n/messages.test.ts:18-25` nomeia a chave órfã.
 *  2. A allowlist de `@SystemScope()` (`system-scope.decorator.spec.ts:48-73`) é
 *     COMPUTADA, não copiada: public-signup muda `auth.controller.ts:8` → `:7`.
 *  3. Thresholds de cobertura são pisos absolutos (`apps/api/jest.config.js:47-54`,
 *     `apps/web/vitest.config.mts:47-52`) — remover suíte densa move o agregado.
 *     Vale para os quatro: adapters de captcha, adapters/worker de fila,
 *     `signup.service.spec.ts` e `marvin.spec.ts` são todos alta cobertura.
 *  4. Nunca emitir `CREATE TABLE` depois de `SELECT app.apply_tenant_rls();`.
 *     Irrelevante aqui: nenhuma das quatro features contribui DDL (mapa 4967-4990).
 *
 * Decisão 0001 (subtrair em vez de templatizar): o repo base compila e passa a suíte;
 * o gerador só apaga. Onde a costura não existe, ela é criada no dontpanic — nunca
 * com `// #if feature`.
 */

import type { FeatureManifest } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// F10 · queue — mapa linhas 3281-3485
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ATENÇÃO — LEIA ANTES DE "SIMPLIFICAR" ESTE MANIFESTO.
 *
 * "Remover a fila" NÃO é "apagar os jobs". O mapa oferece dois níveis e este
 * manifesto codifica o NÍVEL (i) — **porta + driver `memory`** —, que o mapa chama
 * de "the sane option" (mapa 173 e 3403-3418). Não existe terceira opção, e em
 * particular NÃO existe "porta de fila vazia, pronta para o primeiro job do usuário":
 *
 *  • O mapa VERIFICOU contra o TypeScript do próprio repo (`typescript@6.0.3`,
 *    `--strict`) que uma união vazia **não compila** (mapa 3399-3412):
 *        nevertest.ts(6,20): error TS2339: Property 'name' does not exist on type 'never'.
 *        nevertest.ts(9,71): error TS2339: Property 'name' does not exist on type 'never'.
 *    Com `interface JobPayloads {}`, `JobName` vira `never`, `JobEnvelope` vira
 *    `never`, e tanto o `switch (envelope.name)` (`job-router.service.ts:38`) quanto
 *    o `(unknown as JobEnvelope).name` (`:54`) falham com TS2339. De quebra,
 *    `QueueProvider.enqueue<N extends JobName>` (`queue.provider.ts:30-34`) fica
 *    INCHAMÁVEL — nenhum tipo satisfaz `N`.
 *    => Por isso `core/queue/jobs.ts` SOBREVIVE com `'mail.send'` dentro.
 *       NÃO coloque `apps/api/src/core/queue/**` em `deletePaths`.
 *
 *  • TRÊS services tomam `QUEUE_PROVIDER` como parâmetro de construtor
 *    **obrigatório** (mapa 3422-3427), e `QueueModule` é `@Global()`
 *    (`queue.module.ts:9`), então remover o módulo sem editar os três dá falha de
 *    resolução do Nest **no boot** (não erro de compilação):
 *        AuthService         — apps/api/src/modules/auth/services/auth.service.ts:105
 *        UsersService        — apps/api/src/modules/users/services/users.service.ts:62
 *        InvitationsService  — apps/api/src/modules/invitations/invitations.service.ts:93
 *    No nível (i) os três ficam INTACTOS — é exatamente o que torna este nível
 *    barato. Quem descer para o nível (ii) tem de editar os três JUNTOS.
 *
 *  • O QUE SE PERDE no nível (i): `tokens.purge-expired`. Ele é enfileirado em um
 *    único lugar, `worker.ts:42-46` (`repeatCron: '17 * * * *'`,
 *    `jobId: 'tokens-purge-expired'`, `systemWide: true`), e o worker é apagado.
 *    `JobRouter.purgeExpiredTokens()` (`:64-76`) é a ÚNICA limpeza de
 *    `passwordResetToken`/`emailVerificationToken` expirados e **não tem substituto**
 *    (mapa 3378-3381). O gerador deve AVISAR o usuário, não sumir com isso em
 *    silêncio: sem re-hospedar (cron container, `pg_cron`, ou limpeza inline
 *    best-effort — auth já faz uma versão estreita em `auth.service.ts:133`), duas
 *    tabelas que guardam links de reset com cara de vivo crescem sem limite.
 *    Corolário do `never`: tirar o job da união OBRIGA tirar o `case` no mesmo
 *    commit — é justamente o que o `never` no `default` existe para forçar.
 *
 *  • O QUE TAMBÉM SE PERDE: o `jobId` de deduplicação em
 *    `invitations.service.ts:186-194` (`invitation:${sha256(rawToken)}`), que impede
 *    um request HTTP repetido de mandar o mesmo convite duas vezes. O adapter
 *    `memory` IGNORA `jobId` (`memory-queue.adapter.ts:22-42`), então a garantia
 *    desaparece mesmo mantendo a porta. Não há equivalente síncrono; o mais próximo
 *    é um check de idempotência em `Invitation.lastSentAt` (`invitations.service.ts:145`).
 *
 *  • `bullmq` SAI da `apps/api/package.json` (único consumidor era
 *    `bullmq-queue.adapter.ts:2`). `ioredis` **FICA**: dois consumidores
 *    independentes, o adapter de fila E `infra/cache/redis-cache.adapter.ts:2`
 *    (mapa 3335-3338).
 *
 *  • REDIS e o serviço `worker` do compose: o serviço `worker` de
 *    `docker-compose.dev.yml:83-109` sai nos dois níveis. **Redis NUNCA sai só pela
 *    fila** (mapa 3305 e 3413-3421): o throttler monta no port de cache
 *    (`app.module.ts:100-102` → `CacheThrottlerStorage`), e com cache em memória N
 *    réplicas dão N× o orçamento em toda rota `@SensitiveThrottle()` — regressão de
 *    segurança, não de conveniência; lockout e rotação de refresh também viram
 *    per-process. Redis só pode cair com `CACHE_DRIVER=memory` **e** instância única,
 *    e isso é decisão do dossiê de cache, não desta feature.
 */
export const queueManifest: FeatureManifest = {
  id: 'queue',
  label: 'Fila de jobs',
  summary:
    'Trabalho em background com port tipado; o nível removível troca o worker bullmq pelo driver memory inline.',

  // Nenhuma outra feature precisa estar ligada: no nível (i) a porta sobrevive e os
  // três construtores que injetam QUEUE_PROVIDER (auth, users, invitations) não são
  // tocados. Evidência: mapa 3422-3427.
  requires: [],

  // Nível (i): só o caminho bullmq + o processo worker. `core/queue/**`,
  // `memory-queue.adapter.ts`, `job-router.service.ts`, `queue.module.ts` e
  // `health/queue.health.ts` FICAM (mapa 3287-3294 vs 3296-3308).
  deletePaths: [
    'apps/api/src/infra/queue/bullmq-queue.adapter.ts',
    'apps/api/src/infra/queue/bullmq-queue.adapter.spec.ts',
    'apps/api/src/worker.ts',
    'apps/api/src/worker.spec.ts',
  ],

  // Mapa 3310-3313: fila não adiciona modelo nem coluna; estado de job vive no Redis.
  // Grep em `prisma/schema/*.prisma` por queue/job: zero. Nada de Prisma aqui.

  seams: [
    // ── apps/api/src/infra/queue/queue.module.ts (mapa 3318-3319) ──────────────
    {
      file: 'apps/api/src/infra/queue/queue.module.ts',
      kind: 'dropImport',
      pattern: 'bullmq-queue\\.adapter',
      reason:
        'O adapter bullmq foi apagado; o import pendurado quebra o build do Nest antes de qualquer teste rodar.',
    },
    {
      file: 'apps/api/src/infra/queue/queue.module.ts',
      kind: 'replace',
      pattern:
        "config\\.get\\('QUEUE_DRIVER'[\\s\\S]*?backoffMs: config\\.get\\('QUEUE_BACKOFF'[^)]*\\),\\s*\\}\\)",
      replacement: 'new MemoryQueueAdapter()',
      reason:
        'Com um único driver o ternário de `useFactory` perde sentido e ainda leria as envs QUEUE_* que saíram do schema Zod — o `config.get` com `{ infer: true }` deixaria de tipar.',
    },
    {
      file: 'apps/api/src/infra/queue/queue.module.ts',
      kind: 'dropLinesMatching',
      pattern: "if \\(this\\.config\\.get\\('QUEUE_DRIVER'[^)]*\\)[^;]*!== 'memory'\\) return;",
      reason:
        'O guard de `onModuleInit` existia para o API não consumir sob bullmq; com só o driver inline o consumo passa a ser sempre necessário — mantê-lo faria nenhum handler ser registrado e todo job ser descartado com warning (`memory-queue.adapter.ts:34-37`).',
    },
    {
      file: 'apps/api/src/infra/queue/queue.module.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'With `bullmq` this does nothing',
        end: 'background work it was split apart to avoid\\.',
      },
      reason:
        'O doc-comment de `onModuleInit` explica o contraste com bullmq, que deixou de existir; comentário que descreve código ausente é a forma mais eficiente de enganar o próximo leitor.',
    },

    // ── apps/api/src/core/queue/jobs.ts (mapa 3322-3323, 3399-3418) ───────────
    {
      file: 'apps/api/src/core/queue/jobs.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Deletes password-reset and e-mail-verification rows',
        end: "'tokens\\.purge-expired': Record<string, never>;",
      },
      reason:
        "Sem worker ninguém enfileira `tokens.purge-expired` (único enqueue era `worker.ts:42-46`); a entrada tem de sair da união JUNTO com o `case` do JobRouter — remover um lado só quebra o build, que é o propósito do `never` no `default`. O arquivo NÃO é apagado: união vazia dá TS2339 (mapa 3399-3412).",
    },

    // ── apps/api/src/infra/queue/job-router.service.ts (mapa 3324-3325, 3417-3418) ──
    {
      file: 'apps/api/src/infra/queue/job-router.service.ts',
      kind: 'dropBlock',
      block: {
        start: "case 'tokens\\.purge-expired':",
        end: 'return;',
      },
      reason:
        'O `case` e a entrada em `JobPayloads` são as duas metades do mesmo fato; a exaustividade por `never` no `default` (`:49-55`) falha o build se só uma sair.',
    },
    {
      file: 'apps/api/src/infra/queue/job-router.service.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Single-use credentials that nobody consumed',
        end: 'private async purgeExpiredTokens\\(\\): Promise<void> \\{[\\s\\S]*?\\n  \\}',
      },
      reason:
        'Sem o `case` que a chamava, `purgeExpiredTokens` fica código morto que o ESLint sinaliza e o threshold de `functions: 100` (`jest.config.js:47-54`) passa a cobrar sem ter teste. AVISE o usuário: esta é a única limpeza de tokens expirados e não tem substituto (mapa 3378-3381).',
    },
    {
      file: 'apps/api/src/infra/queue/job-router.service.ts',
      kind: 'replace',
      pattern:
        'Errors propagate: that is what makes the queue retry, and it is the\\s*//\\s*whole reason mail moved off the request path\\.',
      replacement:
        'Errors propagate to whoever enqueued: with the inline driver there is no\n        // retry, so a failure has to reach the caller instead of being swallowed.',
      reason:
        'O comentário promete retry, que o driver `memory` não tem (`memory-queue.adapter.ts:41` awaita inline); manter a promessa é pior que não ter comentário.',
    },

    // ── apps/api/src/config/env.ts (mapa 3352-3355) ───────────────────────────
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'replace',
      pattern:
        "// `bullmq` runs work in a separate worker process[\\s\\S]*?// without a worker\\. Inline is not a queue: no durability, no retry\\.",
      replacement:
        '// Jobs run inline in whoever enqueued them. This is NOT a durable queue:\n  // no retry, no separate process. Mail failures surface in the request log.',
      reason:
        'O comentário do bloco `// --- background jobs ---` descreve `src/worker.ts`, que foi apagado, e oferece uma escolha de driver que não existe mais.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'replace',
      pattern: "QUEUE_DRIVER: z\\.enum\\(\\['bullmq', 'memory'\\]\\)\\.default\\('bullmq'\\),",
      replacement: "QUEUE_DRIVER: z.enum(['memory']).default('memory'),",
      reason:
        'Manter `bullmq` no enum deixaria um `.env` legítimo levar o boot a instanciar um adapter apagado; reduzir o enum faz o Zod recusar o valor com mensagem, em vez de o Nest falhar na resolução.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: "QUEUE_NAME: z\\.string\\(\\)\\.default\\(",
        end: "QUEUE_BACKOFF: z\\.coerce\\.number\\(\\)\\.default\\(2000\\),",
      },
      reason:
        'QUEUE_NAME/PREFIX/CONCURRENCY/ATTEMPTS/BACKOFF só eram lidas por `queue.module.ts` ao construir o adapter bullmq; sem consumidor, viram superfície de configuração que promete um comportamento inexistente. `env.spec.ts` não tem caso `QUEUE_*` (mapa 3362) — nada a podar lá.',
    },

    // ── .env.example (mapa 3344-3347) ─────────────────────────────────────────
    {
      file: '.env.example',
      kind: 'replace',
      pattern:
        '# `bullmq` puts work on Redis and a SEPARATE worker process consumes it[\\s\\S]*?QUEUE_BACKOFF=2000',
      replacement:
        '# Jobs run inline in whoever enqueued them. NOT a durable queue: no retry,\n# no separate worker process. A slow SMTP host slows the request.\nQUEUE_DRIVER=memory',
      reason:
        'O bloco `# Background jobs` inteiro (header + prosa + 6 chaves bullmq) descrevia o worker e o Redis; no nível (i) sobra um único knob de uma posição. Trocar em um só `replace` evita deixar prosa órfã apontando para `pnpm --filter api worker`.',
    },

    // ── apps/api/package.json (mapa 3300-3301) ────────────────────────────────
    {
      file: 'apps/api/package.json',
      kind: 'dropJsonKey',
      pattern: 'scripts.worker',
      reason:
        'Script `node dist/worker.js` apontando para um arquivo que o `nest build` não emite mais: falha silenciosa no deploy, descoberta quando o e-mail não sai.',
    },
    {
      file: 'apps/api/package.json',
      kind: 'dropJsonKey',
      pattern: 'scripts.worker:dev',
      reason:
        'Mesmo motivo do `worker`: `tsx watch src/worker.ts` sem `src/worker.ts`. O root `package.json` e o `turbo.json` NÃO têm task de worker (mapa 3302-3303) — nada a editar lá.',
    },

    // ── Dockerfile.api (mapa 3307) ────────────────────────────────────────────
    {
      file: 'Dockerfile.api',
      kind: 'dropBlock',
      block: {
        start: 'The worker ships in this SAME image',
        end: 'how a deploy corrupts its own schema history\\.',
      },
      reason:
        'O comentário instrui a subir um segundo container com `node dist/worker.js`, que não existe mais. O `CMD` da linha seguinte fica INTACTO — ele roda `dist/main.js`.',
    },

    // ── apps/web/** ───────────────────────────────────────────────────────────
    // Mapa 3340-3342: NADA. Nenhuma rota, componente ou chave i18n menciona
    // fila/worker; o web é agnóstico porque o e-mail é fire-and-forget atrás da API.
    // Mapa 3316-3317: `main.ts` também não tem referência a fila (grep verificado).

    // ── apps/api/test/** (mapa 3297-3299) ─────────────────────────────────────
    // `test/setup.ts:11` e `test/e2e-setup.ts:26-30` põem `QUEUE_DRIVER='memory'`:
    // FICAM no nível (i) — agora são o único literal válido. `e2e-app.ts` e
    // `prisma-mock.ts` não mudam; as asserções de e-mail do e2e dependem do adapter
    // memory rodar inline ("Awaited on purpose", `memory-queue.adapter.ts:41`).

    // ── CLAUDE.md ─────────────────────────────────────────────────────────────
    // A seção `## Fila de jobs` NÃO é `docSections`: no nível (i) ela é PODADA, não
    // apagada (mapa 3372-3373). Por isso costuras, não seção.
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: 'worker:dev',
      reason:
        'A linha do TL;DR manda abrir um segundo terminal para o worker ("sem ele, e-mail não sai") — instrução que o nível (i) torna falsa nos dois sentidos: não há worker e o e-mail sai inline.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '`bullmq`, `memory`',
      replacement: '`memory`',
      reason:
        'Célula de adapters da linha `Jobs` na tabela de Ports & Adapters (mapa 3370): a linha SOBREVIVE no nível (i) porque a porta sobrevive; só a lista de adapters encolhe.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: '`QUEUE_DRIVER=bullmq` põe o trabalho no Redis',
        end: 'perdido junto com o request\\.',
      },
      reason:
        'Parágrafo que vende a separação de processos como o objetivo da feature; no nível (i) o processo separado não existe e o texto passaria a descrever uma arquitetura que o projeto gerado não tem.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '`QUEUE_DRIVER=memory` roda inline em quem enfileirou[\\s\\S]*?ou o e-mail simplesmente não sai\\.',
      replacement:
        '`QUEUE_DRIVER=memory` roda o job inline em quem enfileirou. **Não é uma fila**: sem\ndurabilidade, sem retry, sem processo separado. É o único driver deste projeto — um SMTP\nlento atrasa a resposta, e uma falha de envio aparece no log do request, não numa retentativa.',
      reason:
        'O parágrafo original descreve `memory` como o driver de teste e termina exigindo o worker em produção; virando o único driver, a prosa precisa dizer o que se paga por isso em vez de apontar para uma alternativa apagada.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: { start: '\\*\\*Erro propaga\\.\\*\\*', end: 'retry em perda silenciosa\\.' },
      reason:
        'O bullet justifica deixar a exceção subir "porque é isso que faz o BullMQ repetir" — sem BullMQ a razão desaparece (mapa 3372-3373).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: { start: '\\*\\*`jobId` deduplica\\.\\*\\*', end: 'dois e-mails\\.' },
      reason:
        'Garantia específica do bullmq: o adapter memory ignora `jobId` inteiramente (`memory-queue.adapter.ts:22-42`), então o bullet prometeria uma proteção contra convite duplicado que o projeto gerado não tem.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: { start: '### Em produção', end: '^---\\s*$' },
      reason:
        'Subseção inteiramente sobre o worker na mesma imagem, o `dist/worker.js` e a regra de quem roda migration; nada dela sobrevive sem o worker (mapa 3372-3373).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: 'Não subir produção com `QUEUE_DRIVER=memory`',
      reason:
        'Bullet de `## O que NÃO fazer` (mapa 3374-3375): a proibição INVERTE de sentido no nível (i), porque `memory` passa a ser o único driver. O bullet vizinho sobre `systemWide: true` FICA — a porta sobrevive e a armadilha de RLS continua real.',
    },
    // Mapa 3376: o bullet de convites ("Não disparar o e-mail de convite dentro da
    // transação") FICA nos dois níveis — é regra sobre fronteira de transação, não
    // sobre fila. NÃO crie costura para ele.
    // Mapa 3383-3387: README.md não tem seção de fila/worker/jobs; suas duas tabelas
    // de Ports & Adapters têm 5 linhas e NENHUMA linha `Jobs`. Zero costura em README.

    // ── pnpm-workspace.yaml (mapa 3339) ───────────────────────────────────────
    {
      file: 'pnpm-workspace.yaml',
      kind: 'dropLinesMatching',
      pattern: 'msgpackr-extract',
      required: false,
      reason:
        'Build script transitivo do bullmq deixado desabilitado; inofensivo se ficar, por isso opcional — a entrada pode já ter sido podada ou nunca ter existido numa versão futura do lockfile.',
    },
  ],

  // Nível (i) mantém QUEUE_DRIVER (reduzido a `memory`); só as chaves bullmq saem.
  envKeys: [
    'QUEUE_NAME',
    'QUEUE_PREFIX',
    'QUEUE_CONCURRENCY',
    'QUEUE_ATTEMPTS',
    'QUEUE_BACKOFF',
    // REDIS_URL / REDIS_PORT NÃO entram aqui: pertencem ao cache e ao throttler
    // (mapa 3348-3350, 3413-3421). Removê-los pela fila é regressão de rate limit.
  ],

  // `ioredis` FICA (cache), `@nestjs/terminus` FICA (3 indicadores restantes),
  // `nodemailer` FICA. Evidência: mapa 3333-3342.
  deps: [{ workspace: 'apps/api', remove: ['bullmq'] }],

  // Só o consumidor separado. Redis NUNCA sai pela fila sozinha (mapa 3305, 3419-3421).
  composeServices: ['worker'],

  // A seção `## Fila de jobs` é podada por costura, não apagada: no nível (i) o
  // catálogo tipado e o "tenant viaja com o job" continuam verdadeiros.
  docSections: [],

  // Mapa 4980: "queue — None at all. BullMQ state lives in Redis."
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F11 · captcha — mapa linhas 3486-3697
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ÚNICA REMOÇÃO LIMPA do mapa (mapa 174): port/adapter de livro-texto.
 * 13 arquivos exclusivos, um guard global, um decorator, 5 call sites,
 * ZERO SQL, ZERO Prisma, ZERO dependência npm (todo adapter usa `global.fetch`,
 * e o web injeta o script do provedor à mão em `lib/captcha.ts:53-75`).
 *
 * A armadilha de deploy que tem de ficar registrada em algum lugar, porque ela
 * desaparece junto com a documentação: `CAPTCHA_DRIVER` (API) e
 * `NEXT_PUBLIC_CAPTCHA_DRIVER` (web) são DUAS METADES DA MESMA DECISÃO e têm de
 * andar juntas. Se a API exige e o front não renderiza o widget, TODO submit vira
 * 400 por um token que a tela nunca teve como obter — e o erro é opaco de propósito
 * (`CaptchaRequired` cobre ausente, inválido e score baixo), então ninguém descobre
 * pela mensagem. É a mesma armadilha de `PUBLIC_SIGNUP_ENABLED` /
 * `NEXT_PUBLIC_SIGNUP_ENABLED` e de `OAUTH_PROVIDERS` / `NEXT_PUBLIC_OAUTH_PROVIDERS`.
 * Removendo a feature as duas metades saem juntas — é o único jeito de não deixar
 * meia-configuração para trás.
 *
 * Remover captcha NÃO enfraquece rate limit: são camadas independentes
 * (`app.module.ts:67-105` throttler vs `app.module.ts:133` guard) — mapa 3690-3693.
 */
export const captchaManifest: FeatureManifest = {
  id: 'captcha',
  label: 'Captcha',
  summary:
    'Verificação de humano nos formulários não autenticados: port CaptchaProvider, adapters Turnstile/reCAPTCHA e guard global por rota marcada.',

  // Independente de tudo: não há acoplamento além das rotas de auth (mapa 3670-3693).
  requires: [],

  deletePaths: [
    // API — os diretórios ficam VAZIOS, então o mapa (3488-3506) manda apagar o
    // diretório inteiro, não arquivo por arquivo.
    'apps/api/src/core/captcha',
    'apps/api/src/infra/captcha',
    'apps/api/src/common/decorators/require-captcha.decorator.ts',
    'apps/api/src/common/guards/captcha.guard.ts',
    'apps/api/src/common/guards/captcha.guard.spec.ts',
    // Web — não existe `captcha.stories.tsx` (verificado no mapa 3506).
    'apps/web/src/components/captcha.tsx',
    'apps/web/src/lib/captcha.ts',
    'apps/web/src/lib/captcha.test.ts',
  ],

  // Mapa 3608-3611: captcha é stateless; grep em `apps/api/prisma/**` por
  // `captcha|CAPTCHA` dá zero. Nenhum model, enum, campo ou relação.

  seams: [
    // ── apps/api/src/app.module.ts (mapa 3512-3516) ───────────────────────────
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: 'guards/captcha\\.guard',
      reason: 'Import do guard global apagado; sem isso o módulo raiz não compila.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropImport',
      pattern: 'infra/captcha/captcha\\.module',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import do m\u00f3dulo apagado; mesma raz\u00e3o.",
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*CaptchaModule,\\s*$',
      reason:
        'Entrada em `imports` do AppModule (uma das 16). O módulo provia CAPTCHA_PROVIDER para o guard; sem os dois, a linha é referência a classe inexistente.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'dropLinesMatching',
      pattern: 'APP_GUARD,\\s*useClass: CaptchaGuard',
      reason:
        'Registro do guard global (um dos seis). É o que fazia `@RequireCaptcha` valer; removido o decorator, o guard não teria metadata para ler e viraria um no-op custoso em toda request.',
    },
    {
      file: 'apps/api/src/app.module.ts',
      kind: 'replace',
      pattern:
        'throttle \\(pre-auth\\), then\\s*//\\s*prove you are human \\(one outbound call, only on tagged routes\\), then\\s*//\\s*authenticate',
      replacement: 'throttle (pre-auth), then\n    // authenticate',
      reason:
        'O comentário de ordem dos guards (o racional que explica por que são seis e nessa sequência) enumera o passo "prove you are human"; deixá-lo descreveria um guard que não está mais na lista logo abaixo — o mapa (3516) manda reescrever, não só apagar linha.',
    },
    // Mapa 3517: `main.ts` — NENHUMA mudança. Captcha não toca o bootstrap.

    // ── apps/api/src/modules/auth/auth.controller.ts (mapa 3518-3519, 3672-3680) ──
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropImport',
      pattern: 'require-captcha\\.decorator',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import do decorator apagado.",
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "@RequireCaptcha\\('signup'\\)",
      required: false,
      // Ausência legítima: se `publicSignup` foi removido antes, o handler
      // `POST auth/signup` inteiro (linhas 46-61) já saiu e com ele o decorator.
      reason:
        'Um dos 5 call sites. `required: false` porque a rota de signup pode já ter sido apagada pela remoção de public-signup (mapa 3694-3696), e a ausência então é correta, não falha de geração.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "@RequireCaptcha\\('resend-verification'\\)",
      reason: 'Um dos 5 call sites (mapa 3676): rota `POST auth/resend-verification`.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "@RequireCaptcha\\('login'\\)",
      reason:
        'Um dos 5 call sites (mapa 3677): rota `POST auth/login`. O `@SensitiveThrottle()` da mesma rota FICA — camada independente.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "@RequireCaptcha\\('forgot-password'\\)",
      reason: 'Um dos 5 call sites (mapa 3678): rota `POST auth/forgot-password`.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: "@RequireCaptcha\\('reset-password'\\)",
      reason:
        'O quinto e último call site (mapa 3679): rota `POST auth/reset-password`. Esta lista é EXAUSTIVA no repo — os demais hits de grep são docs e testes.',
    },

    // ── comentários em arquivos que sobrevivem (mapa 3520-3523) ───────────────
    {
      file: 'apps/api/src/modules/invitations/public-invitations.controller.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: { start: 'No `@RequireCaptcha`', end: '256 bits' },
      required: false,
      reason:
        'Doc-comment que justifica a AUSÊNCIA deliberada de captcha na rota pública de convite; sem captcha no projeto a justificativa não tem referente. `required: false` porque o arquivo só existe se `invitations` estiver ligada.',
    },
    {
      file: 'apps/api/src/modules/auth/services/signup.service.ts',
      kind: 'replace',
      pattern: 'Same trap as the captcha driver — the two halves must agree',
      replacement: 'The two halves of this flag must agree',
      reason:
        'O comentário usa o captcha como precedente da armadilha das duas metades; o precedente desaparece mas a armadilha (`PUBLIC_SIGNUP_ENABLED` vs `NEXT_PUBLIC_SIGNUP_ENABLED`) continua. `required: false` não é preciso: se public-signup saiu, o arquivo inteiro saiu e a costura é aplicada num arquivo ausente — ver nota abaixo.',
      required: false,
    },
    {
      file: 'apps/api/src/infra/oauth/oauth-http.ts',
      kind: 'replace',
      pattern: 'Generous compared to the captcha timeout',
      replacement: 'Generous for an interactive redirect flow',
      reason:
        'Comentário que calibra o timeout por comparação com `CAPTCHA_TIMEOUT`, env que deixa de existir. `required: false` porque o arquivo só existe se `oauth` estiver ligada.',
      required: false,
    },

    // ── testes que sobrevivem (mapa 3524-3529) ────────────────────────────────
    {
      file: 'apps/api/src/common/decorators/decorators.spec.ts',
      kind: 'dropImport',
      pattern: 'require-captcha\\.decorator',
      reason: 'Import de um módulo apagado dentro de um spec que sobrevive.',
    },
    {
      file: 'apps/api/src/common/decorators/decorators.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('@RequireCaptcha\\(\\)'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'O arquivo SOBREVIVE — ele também testa `@Public`, `@Roles` e `@SensitiveThrottle`; só o `describe` do captcha sai.',
    },
    {
      file: 'apps/api/test/security.e2e-spec.ts',
      kind: 'dropImport',
      pattern: 'core/captcha/captcha\\.provider|infra/captcha/turnstile\\.adapter',
      reason:
        'Imports de `CAPTCHA_PROVIDER` e `TurnstileAdapter` usados para sobrescrever o provider no app de teste.',
    },
    {
      file: 'apps/api/test/security.e2e-spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('captcha guard'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'O arquivo SOBREVIVE: o `describe` de rate limit (linhas 25-74) é independente e continua sendo o que prova o throttler. Só o bloco de captcha sai.',
    },
    {
      file: 'apps/api/test/security.e2e-spec.ts',
      kind: 'replace',
      pattern: 'o guard de `@RequireCaptcha\\(\\)`|the `@RequireCaptcha\\(\\)` guard',
      replacement: 'the global throttler',
      required: false,
      reason:
        'O doc-comment do arquivo anuncia os dois assuntos do spec; sobrando um, o texto tem de parar de prometer o outro. Opcional porque a frase exata pode ter sido reescrita no repo vivo.',
    },
    // Mapa 3530: `test/e2e-setup.ts` — NENHUMA mudança. Ele nunca seta
    // `CAPTCHA_DRIVER`; é o default `none` do schema que deixa o e2e captcha-free.
    // Mapa 3531: `test/prisma-mock.ts` — nenhuma mudança.

    // ── packages/shared (mapa 3595-3607) ──────────────────────────────────────
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Captcha token, when CAPTCHA_DRIVER is on',
        end: 'export const captchaTokenSchema = z\\.string\\(\\)[^;]*;',
      },
      reason:
        'O schema Zod do token e seu doc-comment. É a fronteira de contrato: saindo daqui, api e web param de esperar o campo ao mesmo tempo — que é justamente o que impede as duas metades de divergirem.',
    },
    {
      file: 'packages/shared/src/auth.ts',
      kind: 'dropLinesMatching',
      pattern: 'captchaToken: captchaTokenSchema,',
      reason:
        'As 4 ocorrências em `resendVerificationSchema`, `loginSchema`, `forgotPasswordSchema` e `resetPasswordSchema` (mapa 3599-3602). Uma única costura porque todas as linhas são idênticas e todas saem.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropLinesMatching',
      pattern: 'captchaToken: captchaTokenSchema,',
      required: false,
      reason:
        'A ocorrência em `signupSchema` (mapa 3606). `required: false` porque `signupSchema` inteiro já pode ter saído com a remoção de public-signup.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropImport',
      pattern: "\\./auth'",
      required: false,
      reason:
        'O import de `captchaTokenSchema` em `tenant.ts` existe SÓ para `signupSchema`. Opcional porque a remoção de public-signup também o deixa órfão e pode tê-lo removido primeiro — as duas features reivindicam a mesma linha por razões diferentes, e aplicar duas vezes é no-op.',
    },
    // Mapa 3607: nenhuma constante de cookie, nenhuma entrada em `permissionModules`.
    // `packages/shared/src/index.ts` são star-exports: NÃO muda (mapa 207-209).

    // ── apps/api/src/config/env.ts (mapa 3646-3663) ───────────────────────────
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: '// --- captcha ---',
        end: 'CAPTCHA_FAIL_OPEN: boolish\\(false\\),',
      },
      reason:
        'O bloco inteiro do schema Zod: DRIVER, SECRET_KEY, MIN_SCORE, TIMEOUT e FAIL_OPEN, com a prosa que explica a falha fechada.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: "if \\(parsed\\.data\\.CAPTCHA_DRIVER !== 'none'",
        end: '^\\s*\\}\\s*$',
      },
      reason:
        'A regra CONDICIONAL de `validateEnv` que falha o boot quando um driver está ligado sem `CAPTCHA_SECRET_KEY`. Sem ela e sem o bloco do schema, `parsed.data.CAPTCHA_DRIVER` não existe e o TypeScript recusa o arquivo. O bloco de OAuth e o de `!parsed.success` FICAM (mapa 3663).',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('captcha'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'Os 5 casos: default off, recusa driver sem secret, aceita driver com secret, rejeita driver desconhecido, rejeita score fora de 0..1 (mapa 3665-3669). Sem o schema eles não compilam.',
    },

    // ── .env.example (mapa 3636-3644) ─────────────────────────────────────────
    {
      file: '.env.example',
      kind: 'dropBlock',
      // Âncora em `\b` e não em `\s*$`: a linha real é
      // `# Captcha  --  human verification on the unauthenticated forms`, com prosa
      // depois do título. Ancorar em fim de linha é a armadilha nº 1 do .env.example,
      // cujas seções todas levam uma frase explicativa no próprio cabeçalho.
      block: { start: '^#\\s+Captcha\\b', end: 'NEXT_PUBLIC_CAPTCHA_SITE_KEY=' },
      reason:
        'O bloco `# Captcha` inteiro, incluindo as DUAS metades: as chaves da API e as `NEXT_PUBLIC_*` do web. Elas saem juntas porque é exatamente o meio-ligado que transforma todo submit em 400 por um token que a tela nunca gerou.',
    },

    // ── apps/web (mapa 3553-3594) ─────────────────────────────────────────────
    // Cinco formulários compartilham o MESMO padrão de 7 pontos: imports de
    // `Captcha`/`CaptchaHandle`/`captchaEnabled`, `useTranslations('auth.captcha')`,
    // o `useRef<CaptchaHandle>`, o gate `captchaEnabled && !captchaToken`, o
    // `captchaToken` no payload do mutate, o `captchaRef.current?.reset()` + os
    // branches de erro `CaptchaRequired`/503, e o `<Captcha action="..." />`.
    // Padrões âncora por nome de símbolo cobrem os cinco arquivos uniformemente.
    ...(
      [
        ['apps/web/src/app/(auth)/login/page.tsx', 'login'],
        ['apps/web/src/app/(auth)/signup/page.tsx', 'signup'],
        ['apps/web/src/app/(auth)/forgot-password/page.tsx', 'forgot-password'],
        ['apps/web/src/app/(auth)/reset-password/page.tsx', 'reset-password'],
        ['apps/web/src/app/(auth)/verify-email/page.tsx', 'resend-verification'],
      ] as const
    ).flatMap(([file, action]) => [
      {
        file,
        kind: 'dropImport' as const,
        pattern: '@/components/captcha|@/lib/captcha',
        required: false,
        reason: `Imports de Captcha/CaptchaHandle/captchaEnabled na tela de ${action}. Opcional porque a página de signup só existe se public-signup estiver ligada (mapa 3694-3696).`,
      },
      {
        file,
        kind: 'dropLinesMatching' as const,
        pattern: "useTranslations\\('auth\\.captcha'\\)|useRef<CaptchaHandle>",
        required: false,
        reason: `O namespace i18n \`auth.captcha\` e o ref do widget na tela de ${action}; as chaves saem dos dois arquivos de mensagens, então um \`useTranslations\` pendurado quebraria em runtime, não no build.`,
      },
      {
        file,
        kind: 'dropBlock' as const,
        // O fim é o `}` que fecha o `if`, NÃO o `return;` de dentro dele. O bloco real é
        //
        //     const captchaToken = await captchaRef.current?.getToken();
        //     if (captchaEnabled && !captchaToken) {
        //       toast.error(tCaptcha('required'));
        //       return;
        //     }
        //
        // e parar no `return;` deixava o `}` órfão — cinco telas de auth
        // sintaticamente inválidas de uma vez. `^\\s*\\}\\s*$` casa a primeira linha que
        // contém apenas o fechamento, que é exatamente o do `if` (o corpo não tem
        // sub-bloco).
        block: {
          start: 'const captchaToken = await captchaRef\\.current\\?\\.getToken\\(\\)',
          end: '^\\s*\\}\\s*$',
        },
        required: false,
        reason: `O gate pré-submit (\`captchaEnabled && !captchaToken\`) na tela de ${action}: sem widget não há token a esperar, e o gate impediria todo submit.`,
      },
      {
        file,
        kind: 'dropLinesMatching' as const,
        pattern: 'captchaToken(:|,)|captchaRef\\.current\\?\\.reset\\(\\)',
        required: false,
        reason: `O campo no payload do mutate e o reset de token de uso único na tela de ${action}. O reset existia porque o token é one-shot: sem ele o segundo envio falhava sempre.`,
      },
      {
        file,
        kind: 'dropLinesMatching' as const,
        pattern: '<Captcha\\s',
        required: false,
        reason: `A renderização do widget na tela de ${action}, com \`action="${action}"\` — o nome tinha de casar com o \`@RequireCaptcha('${action}')\` do controller para o v3 não aceitar token gerado em outra página.`,
      },
      {
        file,
        kind: 'dropBlock' as const,
        block: { start: "CaptchaRequired", end: '^\\s*\\}\\s*$' },
        required: false,
        reason: `Os branches de erro \`CaptchaRequired\` e 503 na tela de ${action}: códigos que a API deixa de emitir.`,
      },
    ]),
    {
      file: 'apps/web/src/app/(auth)/signup/signup.test.tsx',
      kind: 'dropLinesMatching',
      pattern: 'captcha: \\{',
      required: false,
      reason:
        'A chave `captcha` no fixture de mensagens do teste. Opcional porque o arquivo é apagado inteiro se public-signup sair (mapa 3586).',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'replace',
      pattern:
        'Same trap as the captcha \\(see `\\./captcha\\.ts` and the CLAUDE\\.md section\\):',
      replacement: 'The same trap in both cases:',
      reason:
        'O doc-comment de `auth-config.ts` referencia `./captcha.ts`, que foi apagado — um `see` apontando para arquivo inexistente. Só comentário: NÃO há dependência de código entre os dois (mapa 3697).',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'replace',
      pattern:
        "exactly as with the captcha's site key vs\\. secret key split\\.",
      replacement: 'the secret halves stay on the API.',
      reason: 'Mesma razão: a analogia perde o referente (mapa 3588).',
    },
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'replace',
      pattern: 'Like the captcha module',
      replacement: 'Like the other build-time flags',
      reason: 'Comentário com referente apagado (mapa 3589).',
    },

    // ── i18n: as DUAS metades, sob pena de falhar o teste de paridade ─────────
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.captcha',
      reason:
        'O bloco `auth.captcha` inteiro (`required`/`failed`/`unavailable`) — a ÚNICA i18n de captcha em 16 namespaces. Tem de sair de pt-BR E en-US: `apps/web/src/i18n/messages.test.ts:18-25` nomeia a chave órfã se só um lado for podado (regra global 1).',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.captcha',
      reason:
        'A metade en-US do mesmo bloco. Os dois arquivos são alinhados linha a linha (575 linhas cada); podar um só é falha garantida — boa falha, mas falha.',
    },

    // ── CLAUDE.md: linha da tabela de ports + bullets (NÃO são docSections) ───
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: '\\| Captcha\\s*\\|',
      reason:
        'Linha única da tabela de Ports & Adapters em `## Arquitetura` (mapa 3707 → CLAUDE.md:59). Uma linha de tabela não é seção: modelada como costura com âncora nas palavras distintivas da linha.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropLinesMatching',
      pattern: 'Não expor `CAPTCHA_SECRET_KEY`',
      reason:
        'Bullet de `## O que NÃO fazer` que pertence a captcha (mapa 133 e 3720-3721). Trim por bullet, não seção: os bullets vizinhos são de outras features.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: ' — a mesma armadilha que o captcha já tem, pela mesma razão',
      replacement: '',
      reason:
        'Dentro de `## Convites` (mapa 3718): a frase usa o captcha como precedente da armadilha das duas metades. A armadilha de signup permanece; o precedente não.',
    },

    // ── README.md (mapa 3625-3634) — bilíngue, dois blocos distintos ──────────
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: { start: '\\*\\*Captcha\\.\\*\\* Port `CaptchaProvider`', end: '"passa todo mundo"\\.' },
      reason:
        'Metade PT: parágrafo + tabela de drivers + prosa de falha fechada. Âncora no texto português para não casar com a metade EN, que é um bloco separado.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: { start: '\\*\\*Captcha\\.\\*\\* A `CaptchaProvider` port', end: '"everyone gets in"\\.' },
      reason:
        'Metade EN do mesmo conteúdo. O README é bilíngue (PT depois EN) e as duas metades têm de ser podadas juntas, ou a documentação passa a discordar de si mesma.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '\\| Captcha\\s*\\|',
      reason:
        'As DUAS linhas `Captcha` das tabelas de ports (README.md:251 pt e :550 en). Um único `dropLinesMatching` cobre ambas porque as linhas são idênticas.',
    },
  ],

  // Todas as chaves, as duas metades juntas. Meia-configuração é a falha (mapa 3636-3644).
  envKeys: [
    'CAPTCHA_DRIVER',
    'CAPTCHA_SECRET_KEY',
    'CAPTCHA_MIN_SCORE',
    'CAPTCHA_TIMEOUT',
    'CAPTCHA_FAIL_OPEN',
    'NEXT_PUBLIC_CAPTCHA_DRIVER',
    'NEXT_PUBLIC_CAPTCHA_SITE_KEY',
  ],

  // Mapa 3685-3689: NENHUMA. Todo adapter usa `global.fetch`; o web injeta o script
  // do provedor à mão. Sem `@marsidev/react-turnstile`, sem `react-google-recaptcha`.
  // Verificado nos quatro `package.json`.
  deps: [],

  composeServices: [],

  // Seção inteira apagada por título exato (mapa 3706-3712).
  docSections: ['Captcha — decisão de deploy obrigatória'],

  // Mapa 4982: "captcha — None at all. Config + adapters only."
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F12 · public-signup — mapa linhas 3698-4020
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O ferrão desta feature não é o código do signup — é a SUÍTE E2E.
 *
 * `apps/api/test/auth.e2e-spec.ts` **faz nascer TODA conta** por
 * `POST /api/auth/signup` (linhas 91, 243, 342, 347, 359, 363, 372, 380, 389, 410;
 * o próprio doc-comment do arquivo, 15-18, diz isso). Apagar a rota sem reescrever a
 * suíte entrega um projeto gerado cuja suíte e2e **não consegue criar um usuário** —
 * ou seja, um deliverable quebrado, vermelho no primeiro `pnpm test:e2e` de um clone
 * novo, num lugar que não parece ter relação com "desliguei o registro público".
 *
 * O que o mapa PRESCREVE (mapa 3730-3735): reescrever a suíte para semear
 * tenants/usuários com `ownerDb()` (`apps/api/test/e2e-app.ts:214`), exatamente como
 * `invitations.e2e-spec.ts`, `tenant-isolation.e2e-spec.ts` e
 * `table-store.e2e-spec.ts` JÁ fazem. O mapa chama isso de "the single biggest cost
 * of the removal". Isso não é expressável por regex de costura — daí o `swapVariant`
 * abaixo (ver NEW SEAMKINDS no relatório): o gerador troca o arquivo por uma variante
 * pré-escrita que semeia via `ownerDb()` e mantém os testes de verify→login→refresh→
 * logout, 2FA, lockout e CSRF que NÃO são sobre signup. Regras da suíte e2e que a
 * variante tem de respeitar: cada suíte é dona de um prefixo e apaga o seu com
 * `DELETE` (nunca `TRUNCATE`), e fecha com `closeOwnerDb()` no `afterAll`.
 *
 * Duas outras coisas que o mapa faz questão de separar:
 *
 *  • `apps/web/src/lib/auth-config.ts` é COMPARTILHADO com oauth. Propriedade por
 *    linha (mapa 3756-3759): oauth é dono da linha 1 (`import { oauthProviders }`) e
 *    de 46-88 (`parseOAuthProviders`/`enabledOAuthProviders`/`oauthEnabled`/
 *    `oauthStartUrl`); public-signup é dono de 26-44 (`readFlag` + `signupEnabled`) e
 *    do bullet 10-12 do doc-comment. `readFlag` não tem outro chamador no arquivo,
 *    então sai com `signupEnabled`. **O ARQUIVO SOBREVIVE se oauth sobreviver** — por
 *    isso as costuras aqui removem SÓ a metade de public-signup e nada mais, e as que
 *    caem na metade de oauth são `required: false`. O mesmo vale para
 *    `auth-config.test.ts`, onde só o `describe('signupEnabled')` sai.
 *
 *  • `User.passwordHash` nullable é artefato de OAUTH, não de signup
 *    (`tenancy.prisma:158-163`, migration `20260912120000…:16-24`). Public-signup
 *    sempre grava hash (`signup.service.ts:73,93`). NÃO aperte esse campo aqui.
 *    E `Plan.isDefault` NÃO fica órfão: `provisionTenant` cai nele também para tenant
 *    criado pelo operador (`platform-tenants.service.ts:165`).
 */
export const publicSignupManifest: FeatureManifest = {
  id: 'publicSignup',
  label: 'Registro público',
  summary:
    'Formulário aberto em que um desconhecido cria empresa + primeiro admin; a alternativa é entrar só por convite, seed e painel da plataforma.',

  // A remoção é segura por si: as outras duas portas de criação de empresa (seed e
  // `POST /platform/tenants`) passam pelo MESMO `provisionTenant` (mapa 3971-3987),
  // extraído justamente para as portas não divergirem, e `InvitationsService` não
  // importa `SignupService`.
  //
  // `multiTenant` acrescentado na integração, por I11 (mapa 5232): em modo single-tenant
  // o cadastro público É a criação de empresa, e uma empresa é tudo que existe. O mapa
  // trata isso como auto-fix ("force PUBLIC_SIGNUP_ENABLED=false **e**
  // NEXT_PUBLIC_SIGNUP_ENABLED=false") — e forçar desligado é precisamente o que uma
  // aresta `requires` produz no `reconcileRecipe`. Meia-escrita do par dá formulário que
  // renderiza e 403 em todo submit, a mesma armadilha do captcha meio-ligado.
  requires: ['multiTenant'],

  deletePaths: [
    'apps/api/src/modules/auth/services/signup.service.ts',
    'apps/api/src/modules/auth/services/signup.service.spec.ts',
    'apps/web/src/app/(auth)/signup/page.tsx',
    'apps/web/src/app/(auth)/signup/signup.test.tsx',
    // Condicionalmente exclusivo (mapa 3752-3755): a tela de conclusão de cadastro
    // social só existe para o "terceiro caso" do OAuth, que perde o destino quando o
    // signup sai como código. Apagar caminho inexistente é no-op, então entra aqui
    // mesmo quando oauth já o levou embora.
    'apps/web/src/app/(auth)/signup/complete',
    // NÃO apagar: `apps/api/src/modules/tenants/support/tenant-provisioning.ts` (+spec)
    // e `apps/web/src/components/platform/signups-chart.tsx` (+test) — o gráfico plota
    // tenants criados por dia e conta empresa criada pelo operador também (mapa 3760-3765).
  ],

  // Mapa 3830-3832: nenhum model, enum, campo ou relação é signup-específico.
  // `PUBLIC_SIGNUP_ENABLED` é env. Três COMENTÁRIOS de schema pedem reescrita, não
  // remoção — ver as costuras em `prisma/schema/*.prisma` abaixo.

  seams: [
    // ── A SUÍTE E2E — o item mais caro da remoção ──────────────────────────────
    {
      file: 'apps/api/test/auth.e2e-spec.ts',
      // ⚠ SEAMKIND NOVO — não existe em `SeamKind` ainda; o pai é dono de `types.ts`.
      // Este literal NÃO TIPA até `'swapVariant'` ser adicionado ao union.
      kind: 'swapVariant',
      replacement: 'assets/variants/api/test/auth.e2e-spec.no-public-signup.ts',
      // `required: false` porque o ASSET ainda não existe no pacote do gerador. Não é
      // tolerância: é a diferença entre "o gerador está incompleto aqui" — que sai como
      // aviso alto, nomeando o asset que falta — e "o gerador está quebrado", que mataria
      // toda geração sem public-signup. Escrever a variante é trabalho pendente, e o
      // aviso é o que impede que ele seja esquecido.
      required: false,
      reason:
        'A suíte faz nascer TODA conta por `POST /api/auth/signup` (91, 243, 342, 347, 359, 363, 372, 380, 389, 410 e o doc-comment 15-18); o mapa (3730-3735) prescreve reescrevê-la para semear com `ownerDb()` (`e2e-app.ts:214`), como invitations/tenant-isolation/table-store já fazem. Sem isso o projeto gerado tem uma suíte e2e incapaz de criar usuário — deliverable quebrado, vermelho no primeiro clone. Nenhuma regex expressa essa reescrita, daí a variante pré-escrita.',
    },

    // ── apps/api/src/modules/auth/** (mapa 3768-3782) ─────────────────────────
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropImport',
      pattern: 'services/signup\\.service',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import do service apagado.",
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'dropLinesMatching',
      pattern: '^\\s*SignupService,\\s*$',
      reason:
        'Provider de `SignupService` no AuthModule; mantido, o Nest falha a resolução no boot por uma classe que não existe.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.module.ts',
      kind: 'replace',
      pattern: 'Auth: register, login, refresh',
      replacement: 'Auth: login, refresh',
      reason:
        'O doc-comment do módulo enumera as responsabilidades; "register" deixa de ser uma delas (mapa 3771).',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropImport',
      pattern: 'services/signup\\.service',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import de `SignupService` no controller.",
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: 'private readonly signupService: SignupService,',
      reason:
        'Parâmetro de construtor; sem o provider no módulo, o Nest não resolve e a falha é no boot, não na compilação.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Self-serve company registration: the entry point for a new customer',
        end: 'return this\\.signupService\\.signup\\(dto, this\\.ctx\\(req\\)\\);\\s*\\n\\s*\\}',
      },
      reason:
        'O handler `POST auth/signup` inteiro: doc-comment, `@Public()`, `@SystemScope()`, `@Post`, `@SensitiveThrottle()`, `@RequireCaptcha` e corpo. Ele leva consigo UM `@SystemScope()` — daí a costura na allowlist abaixo.',
    },
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'dropLinesMatching',
      pattern: 'SignupResponse|SignupDto',
      reason:
        'O tipo de resposta (import de `@dontpanic/shared`) e o DTO na lista de imports do controller (mapa 3772, 3775).',
    },
    {
      file: 'apps/api/src/modules/auth/dto/auth.dto.ts',
      kind: 'dropLinesMatching',
      pattern: 'signupSchema,|export class SignupDto extends createZodDto\\(signupSchema\\) \\{\\}',
      reason:
        'O import do schema e a classe DTO: `signupSchema` sai de `@dontpanic/shared`, então as duas linhas param de compilar juntas.',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'replace',
      pattern: 'Public so SignupService reuses the same verification path\\.',
      replacement:
        'Public so the users module and the invitation accept path reuse the same verification path.',
      reason:
        '`sendVerificationCode` FICA — `users.service.ts` e o aceite de convite precisam dele —, mas o comentário justifica a visibilidade por um chamador que deixou de existir (mapa 3776).',
    },
    {
      file: 'apps/api/src/modules/auth/services/auth.service.ts',
      kind: 'replace',
      pattern: 'Public so SignupService writes through the same audit path\\.',
      replacement: 'Public so other modules write through the same audit path.',
      reason: 'Mesma razão para o método `audit` (mapa 3777).',
    },

    // ── allowlist COMPUTADA de @SystemScope() — regra global 2 ────────────────
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'replace',
      pattern: "'modules/auth/auth\\.controller\\.ts:8'",
      replacement: "'modules/auth/auth.controller.ts:7'",
      reason:
        'A asserção é um array EXATO de `arquivo:contagem` (`:48-73`) e o handler de signup levava um dos 8 `@SystemScope()` do controller. Emitir o literal do repo num projeto podado dá suíte vermelha num clone novo e TREINA o usuário a editar a asserção — destruindo o guard (regra global 2, mapa 46-54). O ideal é o gerador RECONTAR e emitir o número medido; este `replace` é o piso, não a solução.',
    },
    {
      file: 'apps/api/src/infra/tenancy/system-scope.decorator.spec.ts',
      kind: 'replace',
      pattern: 'signup, verify-email',
      replacement: 'verify-email',
      reason:
        'O comentário da allowlist nomeia `signup` primeiro (mapa 3784); comentário e array têm de contar a mesma história, senão o próximo a mexer acredita no comentário.',
    },
    {
      file: 'apps/api/src/infra/tenancy/tenant-scope.interceptor.ts',
      kind: 'replace',
      pattern: 'Authentication and company signup have to run outside the isolation',
      replacement: 'Authentication has to run outside the isolation',
      reason:
        'Comentário do interceptor (mapa 3783): o escopo `system` continua existindo (aceite de convite o usa), mas o signup de empresa deixa de ser um dos motivos.',
    },
    {
      file: 'apps/api/src/modules/platform/services/platform-stats.service.ts',
      kind: 'replace',
      pattern: 'How far back the signup series goes',
      replacement: 'How far back the new-company series goes',
      required: false,
      reason:
        'Só prosa: a série `signups` FICA e conta tenants criados por qualquer porta (mapa 3782). `required: false` porque o arquivo só existe se `platform` estiver ligada.',
    },

    // ── Prisma: três comentários reescritos, nenhuma coluna removida ──────────
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'replace',
      pattern: 'The plan a public signup lands on\\. Exactly one plan should carry it\\.',
      replacement: 'The plan a newly provisioned company lands on. Exactly one plan should carry it.',
      reason:
        '`isDefault` NÃO fica órfão: `provisionTenant` cai nele para tenant criado pelo operador também (mapa 3834-3836, 3958-3962). Só o doc muda — remover a coluna seria quebrar o painel da plataforma.',
    },
    {
      file: 'apps/api/prisma/schema/tenancy.prisma',
      kind: 'replace',
      pattern: 'Created by the signup flow;',
      replacement: 'Created when a company is provisioned;',
      reason: 'Doc de `Profile` (mapa 3837): a criação continua, a porta muda.',
    },
    {
      file: 'apps/api/prisma/schema/invitations.prisma',
      kind: 'replace',
      pattern: 'Public signup creates a company plus its first administrator\\.',
      replacement: 'A company and its first administrator are created by the seed or the platform panel.',
      required: false,
      reason:
        'Header do schema de convites (mapa 3838). `required: false` porque o arquivo só existe se `invitations` estiver ligada.',
    },

    // ── packages/shared (mapa 3842-3874) ──────────────────────────────────────
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: 'export const signupSchema = z\\.object\\(\\{',
        end: 'export type SignupInput = z\\.infer<typeof signupSchema>;',
      },
      reason:
        'O contrato de request do signup. Fronteira de contrato: saindo daqui, api e web param de o esperar ao mesmo tempo. `RESERVED_TENANT_SLUGS` (33-60) FICA — também usado por `oauth.service.ts:51` e `platform-tenants.service.ts:25`.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropBlock',
      block: {
        start: 'Signup response: the company created and its first user\\.',
        end: 'export type SignupResponse = z\\.infer<typeof signupResponseSchema>;',
      },
      reason: 'O contrato de resposta, consumido por `useSignup()` e pelo controller (mapa 3846).',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'dropImport',
      pattern: "\\./auth'",
      required: false,
      reason:
        'O import de `captchaTokenSchema` existia só para `signupSchema`. Opcional: a remoção de captcha reivindica a mesma linha (mapa 3847), e quem chegar primeiro a leva — aplicar duas vezes é no-op.',
    },
    {
      file: 'packages/shared/src/tenant.ts',
      kind: 'replace',
      pattern: 'Two things separate it from `signupSchema`',
      replacement: 'Two things characterise it',
      required: false,
      reason:
        'Doc de `platformCreateTenantSchema` (mapa 3848) comparando com um schema apagado. Opcional porque o schema só existe se `platform` estiver ligada.',
    },
    {
      file: 'packages/shared/src/oauth.ts',
      kind: 'dropLinesMatching',
      pattern: "'signup_disabled',|signupEnabled: z\\.boolean\\(\\),",
      required: false,
      reason:
        'A entrada em `oauthErrorCodes` e o campo `signupEnabled` do payload de discovery (mapa 3854-3856). `required: false` porque o arquivo só existe se `oauth` estiver ligada — sem signup como código, a identidade social desconhecida só pode ser recusada (`no_account`), então o código e o campo perdem sentido.',
    },
    {
      file: 'packages/shared/src/oauth.ts',
      kind: 'dropBlock',
      block: {
        start: 'export const completeOAuthSignupSchema',
        end: 'export type CompleteOAuthSignupResponse = z\\.infer<[^>]*>;',
      },
      required: false,
      reason:
        'O contrato da tela "complete seu cadastro", que existia só para criar empresa a partir de identidade social verificada (mapa 3857). Opcional: depende de oauth estar ligada.',
    },
    {
      file: 'packages/shared/src/invitation.ts',
      kind: 'replace',
      pattern:
        'Public signup creates a company and its first administrator; everyone else',
      replacement: 'The seed and the platform panel create a company and its first administrator; everyone else',
      required: false,
      reason: 'Comentário (mapa 3860). Opcional: depende de `invitations` estar ligada.',
    },
    {
      file: 'packages/shared/src/invitation.ts',
      kind: 'replace',
      pattern: '`acceptTerms` é `literal\\(true\\)` for the same reason it is on signup|`acceptTerms` is `literal\\(true\\)` for the same reason it is on signup',
      replacement: '`acceptTerms` is `literal(true)` so an unchecked box fails validation',
      required: false,
      reason:
        'Comentário que explica por referência a um schema apagado (mapa 3861). A razão (caixa desmarcada tem de falhar, não registrar recusa como aceite) é boa demais para se perder junto com a referência.',
    },

    // ── apps/api/src/modules/auth/oauth/** — a perna "identidade desconhecida" ─
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      kind: 'dropBlock',
      block: {
        start: 'private signupEnabled\\(\\)',
        end: '^\\s*\\}\\s*$',
      },
      required: false,
      reason:
        'O helper que lê `PUBLIC_SIGNUP_ENABLED` (`:594-596`) e a env que ele lê saem juntos; deixá-lo faria `config.get` recusar a chave no tipo `Env`. Opcional: só existe se `oauth` estiver ligada (mapa 3990-3999).',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.service.ts',
      // REESCRITO na integração. A versão anterior apagava toda LINHA com
      // `this.signupEnabled()`, e duas delas são `if (!this.signupEnabled()) {` — apagar a
      // linha leva o `{` e desbalanceia o arquivo.
      //
      // A edição certa é menor e semanticamente mais forte: o PREDICADO passa a ser
      // constante-falso. Isso é exatamente o que I6 (mapa 5227) manda fazer — recusar duro
      // a identidade que ninguém tem — e consegue de graça, sem tocar nos dois gates: o
      // `parkPendingRegistration` (:404) continua devolvendo `no_account`/`signup_disabled`
      // e o `completeSignup` (:430) continua lançando 403. O campo de `listProviders()`
      // (:119) passa a publicar `false` para o browser, que é a verdade.
      //
      // E é obrigatório de qualquer forma: `PUBLIC_SIGNUP_ENABLED` sai do schema de env
      // com esta feature, então `config.get('PUBLIC_SIGNUP_ENABLED')` deixaria de tipar.
      kind: 'replace',
      pattern: "return this\\.config\\.get\\('PUBLIC_SIGNUP_ENABLED'[^;]*;",
      replacement:
        '// Registro público removido pelo gerador: identidade social desconhecida é\n    // recusada de vez (I6), e `PUBLIC_SIGNUP_ENABLED` já não existe no env.\n    return false;',
      required: false,
      reason:
        'O predicado que os três usos do flag consultam: o campo de `listProviders()` (:119), o desvio de `parkPendingRegistration` (:404-407) e o 403 de `completeSignup` (:430-432). Vira constante-falso em vez de ter as linhas apagadas — duas delas são `if (!this.signupEnabled()) {` e levariam o `{` junto. Mapa 4001-4008 e I6. Opcional: depende de oauth.',
    },

    // ── apps/web (mapa 3789-3806) ─────────────────────────────────────────────
    {
      file: 'apps/web/src/hooks/use-auth.tsx',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: 'Self-serve signup creates the company and its first administrator',
        end: '^\\}\\s*$',
      },
      reason: 'O hook `useSignup()` inteiro com seu doc-comment; não há mais rota para chamar.',
    },
    {
      file: 'apps/web/src/hooks/use-auth.tsx',
      kind: 'dropLinesMatching',
      pattern: '^\\s*SignupInput,\\s*$|^\\s*SignupResponse,\\s*$',
      reason:
        'Os dois tipos na lista de imports de `@dontpanic/shared`. ATENÇÃO: é um import com MUITAS bindings (`ChangePasswordInput`, `LoginInput`, `UserDto`, …) — `dropImport` mataria o import inteiro e quebraria o arquivo; por isso `dropLinesMatching` nas linhas das duas bindings, o que só funciona porque o repo formata uma binding por linha (Prettier). Ver NEW SEAMKINDS no relatório: `dropImportBinding` é a costura correta.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropImport',
      pattern: '@/lib/auth-config',
      required: false,
      reason:
        'Import de `signupEnabled`. `required: false` porque, se oauth estiver ligada, a página pode importar `oauthEnabled` do MESMO módulo e o import tem de sobreviver — nesse caso a binding sai, não o import (ver `dropImportBinding` no relatório).',
    },
    {
      file: 'apps/web/src/app/(auth)/login/page.tsx',
      kind: 'dropBlock',
      block: { start: '\\{signupEnabled && \\(', end: '\\)\\}' },
      reason:
        'O bloco do link "criar conta" (mais o comentário acima dele): a única entrada de navegação do signup em toda a web (mapa 3877-3879).',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropBlock',
      block: { start: "describe\\('LoginPage — registration gating'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'O `describe` que testa exatamente o gating removido. O resto do arquivo SOBREVIVE — é o teste da tela de login, listado na espinha não-removível.',
    },
    {
      file: 'apps/web/src/app/(auth)/login/login.test.tsx',
      kind: 'dropLinesMatching',
      pattern: "signup: 'Create one',|getByRole\\('link', \\{ name: 'Create one' \\}\\)",
      reason:
        'A chave de fixture e a asserção do link `/signup` que vivem DENTRO de um teste que fica (mapa 3795-3796); deixá-las quebra um teste que nada tem a ver com signup.',
    },
    {
      file: 'apps/web/src/app/(auth)/verify-email/page.tsx',
      kind: 'replace',
      pattern: 'href="/signup"',
      replacement: 'href="/login"',
      reason:
        'O fallback "sem e-mail" aponta para `/signup`, rota que deixa de existir — um 404 no fim de um fluxo de verificação. A chave i18n `auth.verify.goToLogin` FICA; só o href muda (mapa 3798, 3898-3899).',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlockWithLeadingDoc',
      block: {
        start: '- `NEXT_PUBLIC_SIGNUP_ENABLED` vs the API',
        end: 'no hint it was pointless to fill in\\.',
      },
      reason:
        'O bullet 10-12 do doc-comment. ARQUIVO COMPARTILHADO com oauth: o arquivo SOBREVIVE se oauth sobreviver, e o bullet vizinho (`NEXT_PUBLIC_OAUTH_PROVIDERS`) é de oauth — por isso a poda é por bullet, não por arquivo (mapa 3756-3757).',
    },
    {
      file: 'apps/web/src/lib/auth-config.ts',
      kind: 'dropBlock',
      block: {
        start: 'Anything but an explicit "off" is on',
        end: 'export const signupEnabled = readFlag\\(process\\.env\\.NEXT_PUBLIC_SIGNUP_ENABLED, true\\);',
      },
      reason:
        'A metade de public-signup do arquivo: `readFlag()` (que não tem outro chamador) e `signupEnabled`, com os dois doc-comments. O que vem DEPOIS — `parseOAuthProviders`, `enabledOAuthProviders`, `oauthEnabled`, `oauthStartUrl` — é de oauth e FICA, junto com a linha 1 (`import { oauthProviders }`).',
    },
    {
      file: 'apps/web/src/lib/auth-config.test.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('signupEnabled'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'Só os 5 casos de `signupEnabled` (mapa 3803). O arquivo é compartilhado: os casos de `parseOAuthProviders` ficam.',
    },
    {
      file: 'apps/web/src/proxy.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*'/signup',\\s*$",
      reason:
        'Entrada em `PRE_AUTH_PREFIXES` (que também cobria `/signup/complete` por prefixo). Mantida, o proxy protegeria uma rota inexistente.',
    },
    {
      file: 'apps/web/src/proxy.ts',
      kind: 'replace',
      pattern: 'so it belongs with `/signup` and not with the open pages',
      replacement: 'so it belongs with the pre-auth pages and not with the open ones',
      required: false,
      reason:
        'O comentário do `/invite` se explica por referência a `/signup` (mapa 3805-3806). Opcional: a linha só existe se `invitations` estiver ligada.',
    },
    {
      file: 'apps/web/src/proxy.test.ts',
      // `'/signup'` é um elemento do array do `for (const path of [...]) {` — a linha
      // inteira carrega o `{` do laço, então apagá-la desbalanceia o arquivo. Sai só o
      // elemento, com a vírgula que o seguia.
      kind: 'replace',
      pattern: "'/signup',\\s*",
      replacement: '',
      reason: 'O caminho na lista iterada do teste de prefixos pre-auth (mapa 3807).',
    },
    {
      file: 'apps/web/src/proxy.test.ts',
      kind: 'dropBlock',
      block: { start: "it\\('keeps the social signup completion screen pre-auth'", end: '^\\s*\\}\\);\\s*$' },
      required: false,
      reason:
        'Vai junto com `/signup/complete` (mapa 3808). Opcional: pode já ter saído pela remoção de oauth.',
    },
    {
      file: 'apps/web/e2e/smoke.spec.ts',
      kind: 'dropBlock',
      block: { start: "test\\('signup page renders the company registration form'", end: '^\\}\\);\\s*$' },
      reason: 'Smoke test de uma página apagada (mapa 3809).',
    },

    // ── i18n: as DUAS metades, e a EXCEÇÃO de duas chaves ─────────────────────
    // ⚠ NÃO apague o namespace `auth.signup` inteiro. `apps/web/src/app/invite/
    // [token]/page.tsx:61` faz `useTranslations('auth.signup')` e renderiza
    // `ts('acceptTerms')` (:253) e `ts('acceptTermsRequired')` (:257). Essas duas
    // chaves têm de sobreviver enquanto `invitations` existir (mapa 3888-3897).
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.login.noAccount',
      reason: 'Rótulo do link "criar conta" removido da tela de login (mapa 3884).',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'auth.login.signup',
      reason: "Chave de i18n de uma tela que n\u00e3o existe mais. Os DOIS cat\u00e1logos s\u00e3o podados em lockstep (regra global 1 do mapa): `messages.test.ts` compara os conjuntos de chaves e nomeia a \u00f3rf\u00e3, ent\u00e3o podar um lado s\u00f3 d\u00e1 su\u00edte vermelha. Proven\u00e2ncia: Texto do link \"criar conta\" (mapa 3885).",
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.login.noAccount',
      reason:
        'Metade en-US. Regra global 1: chave removida de um arquivo só falha `apps/web/src/i18n/messages.test.ts:18-25`, que nomeia a órfã.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'auth.login.signup',
      reason: 'Metade en-US da mesma chave, pela mesma razão de paridade.',
    },
    ...(['pt-BR', 'en-US'] as const).flatMap((locale) =>
      [
        'title',
        'subtitle',
        'companyLegend',
        'adminLegend',
        'companyName',
        'companyNamePlaceholder',
        'slug',
        'slugHint',
        'slugTaken',
        'emailTaken',
        'submit',
        'hasAccount',
        'signin',
        'success',
        'closedTitle',
        'closedBody',
        'closedInvite',
      ].map((key) => ({
        file: `apps/web/messages/${locale}.json`,
        kind: 'dropJsonKey' as const,
        pattern: `auth.signup.${key}`,
        reason:
          locale === 'pt-BR'
            ? `Chave de \`auth.signup\` que sai. O NAMESPACE NÃO é apagado: \`acceptTerms\` e \`acceptTermsRequired\` ficam para \`invite/[token]/page.tsx:61,253,257\` (mapa 3888-3897). \`closedTitle\`/\`closedBody\`/\`closedInvite\` existiam SÓ para o card "fechado" do estado runtime-OFF (\`signup/page.tsx:102-106\`), então saem sempre.`
            : `Metade en-US da mesma chave — os dois arquivos são alinhados linha a linha e o teste de paridade nomeia a órfã (regra global 1).`,
      })),
    ),

    // ── env (mapa 3901-3921) ──────────────────────────────────────────────────
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'dropBlock',
      block: {
        start: '// Whether the public signup form works at all',
        end: 'PUBLIC_SIGNUP_ENABLED: boolish\\(true\\),',
      },
      // Sobreposição: o bloco do schema Zod em `env.ts` é vizinho dos blocos de oauth e
      // captcha, e a poda de uma feature vizinha pode já ter levado a linha que serve de
      // fim aqui. Ver a nota equivalente no `.env.example`.
      required: false,
      reason:
        'A chave e a prosa que explica por que o default `true` é decisão de deploy e não default seguro. O HEADER `// --- who may get in ---` FICA se as envs `INVITATION_*` (124-130) sobreviverem — apagá-lo deixaria as duas envs de convite sem seção. NÃO há branch em `validateEnv` para remover: o flag é cobrado no service (`signup.service.ts:46-48`) e em `oauth.service.ts:594-596`, deliberadamente (mapa 3916-3920).',
    },
    {
      file: 'apps/api/src/config/env.spec.ts',
      kind: 'dropBlock',
      block: { start: "describe\\('public signup'", end: '^\\s*\\}\\);\\s*$' },
      reason:
        'Os dois casos: "defaults to on, preserving the behaviour a clone has always had" e "honours an explicit false" (mapa 3923-3925). Sem a chave no schema não compilam.',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: { start: 'PUBLIC_SIGNUP_ENABLED', end: 'PUBLIC_SIGNUP_ENABLED=true' },
      reason:
        'Comentário + chave. O header `# Who may get in -- public signup and invitations` deve ser RETITULADO se a metade de convites (166-175) ficar, não apagado (mapa 3903-3906).',
    },
    {
      file: '.env.example',
      kind: 'dropBlock',
      block: { start: 'NEXT_PUBLIC_SIGNUP_ENABLED', end: 'NEXT_PUBLIC_SIGNUP_ENABLED=true' },
      // `required: false` por SOBREPOSIÇÃO, não por tolerância: a seção "metades públicas"
      // do `.env.example` é compartilhada com oauth e captcha, e se uma delas sair primeiro
      // a chave já não está lá para ser o fim do bloco. Ausência aqui significa
      // "outra feature já levou", que é o resultado desejado.
      required: false,
      reason:
        'A metade `NEXT_PUBLIC_*`. As duas saem juntas: em desacordo, o formulário renderiza e todo submit dá 403 — a mesma armadilha do captcha. O preâmbulo 275-279 usa "um formulário de signup que sempre 403" como EXEMPLO e precisa de reescrita, mas FICA (ele também cobre `NEXT_PUBLIC_OAUTH_PROVIDERS`).',
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern: 'a signup form that always 403s',
      replacement: 'a form the API will always refuse',
      required: false,
      reason:
        'O preâmbulo das "metades públicas" (mapa 3907-3908) ilustra com o signup; o parágrafo sobrevive porque cobre oauth também.',
    },

    // ── seed: só comentários (mapa 3927-3937) ─────────────────────────────────
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: '`isDefault` is what a public signup lands on\\.',
      replacement: '`isDefault` is what a newly provisioned company lands on.',
      reason:
        'Nenhuma mudança FUNCIONAL no seed — ele nunca chamou a rota de signup (escreve via `prisma` direto sob `DATABASE_ADMIN_URL`). Só o comentário, porque `isDefault` continua sendo lido por `provisionTenant`.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      // Âncora encurtada: no arquivo real a frase quebra depois de "the —", então
      // nenhuma âncora que inclua "the same code path" casa numa única linha.
      pattern: 'so seed and signup cannot drift',
      replacement: 'so the provisioning doors cannot drift',
      reason:
        'Com o signup fora, o seed passa a ser A porta de bootstrap (mapa 3935-3937) — o comentário tem de apontar para as portas que sobraram, e o `db:seed` deve continuar em destaque no TL;DR.',
    },

    // ── CLAUDE.md (mapa 3939-3956) ────────────────────────────────────────────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '\\*\\*signup público\\*\\* \\(opcional, `PUBLIC_SIGNUP_ENABLED`\\), \\*\\*convite\\*\\*',
      replacement: '**convite**',
      reason:
        'O bullet "Quem entra e por onde" de `## Autenticação (resumo)` enumera as portas; sobra convite + login social (mapa 3941-3942).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'caminho de autenticação e signup',
      replacement: 'caminho de autenticação',
      reason:
        'Linha do escopo `system` na tabela de `## Multi-tenancy` (mapa 3943). A seção de multi-tenancy é intocável no resto — isto é uma célula de tabela, não a seção.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'e registrar empresa nova acontece quando ainda não há\\s*tenant',
      replacement: 'e aceitar um convite acontece antes de haver sessão',
      reason:
        'O bullet de `@SystemScope()` justifica a exceção por "registrar empresa nova"; o aceite de convite passa a ser a razão restante (mapa 3944).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '`POST /auth/signup` cria \\*\\*empresa \\+ primeiro admin\\*\\*, e só isso\\.',
      replacement:
        'Empresa + primeiro admin nascem pelo seed ou pelo painel da plataforma, e só por lá.',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Abertura de `## Convites` (mapa 3945).",
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: '\\*\\*Registro público virou opcional\\.\\*\\*',
        end: 'a mesma armadilha que o captcha já tem, pela mesma razão\\.',
      },
      reason:
        'O parágrafo inteiro sobre `PUBLIC_SIGNUP_ENABLED` / `NEXT_PUBLIC_SIGNUP_ENABLED` (mapa 3946): descreve um flag que deixa de existir.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'o mesmo que o signup e o seed usam — foi extraído justamente para as três\\s*portas não divergirem',
      replacement: 'o mesmo que o seed usa — foi extraído justamente para as portas não divergirem',
      reason:
        'Três portas viram duas (mapa 3947). O helper `provisionTenant` NÃO sai: é ele que garante que empresa criada pelo operador seja indistinguível da criada pelo seed.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'dropBlock',
      block: {
        start: 'O terceiro caso — identidade que\\s*ninguém tem',
        end: 'identidade provada em identidade autodeclarada\\.',
      },
      required: false,
      reason:
        'Em `## Login social`: o parágrafo do "terceiro caso" depende de `PUBLIC_SIGNUP_ENABLED=true` e da tela `/signup/complete` (mapa 3949). `required: false` porque a seção só existe se `oauth` estiver ligada.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'Rotas marcadas com `@RequireCaptcha\\(.<ação>.\\)`: signup, ',
      replacement: 'Rotas marcadas com `@RequireCaptcha(\'<ação>\')`: ',
      required: false,
      reason:
        'A lista de rotas de `## Captcha` nomeia signup (mapa 3950). `required: false`: só relevante se captcha estiver ligada.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: '`@SensitiveThrottle\\(\\)` — login, signup, verify-email',
      replacement: '`@SensitiveThrottle()` — login, verify-email',
      reason:
        'A lista de rotas apertadas em `## Rate limit` (mapa 3951). O decorator e a camada FICAM — é decisão de deploy, não feature.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'fluxos signup→verify→login→refresh→logout',
      replacement: 'fluxos verify→login→refresh→logout',
      reason:
        'A descrição da suíte e2e em `## Testes` (mapa 3952) — e ela tem de concordar com a variante de `auth.e2e-spec.ts` que o gerador emite.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        ' Mesma regra para `PUBLIC_SIGNUP_ENABLED` /\\s*`NEXT_PUBLIC_SIGNUP_ENABLED` — em desacordo, o formulário aparece e todo submit dá 403\\.',
      replacement: '',
      reason:
        'Bullet de `## O que NÃO fazer` COMPARTILHADO com oauth (mapa 134, 3954-3955): a metade de OAuth ("não ligar OAuth só de um lado") FICA, só a frase de signup sai. Trim por frase, não por bullet nem por seção.',
    },
    // Mapa 3956: o bullet de `@SystemScope()` (linha 582) FICA — o aceite de convite
    // ainda o usa; só a CONTAGEM de rotas muda, e isso está na costura da allowlist.

    // ── README.md (mapa 3958-3970) — bilíngue ─────────────────────────────────
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '\\| Signup público\\s*\\||\\| Public signup\\s*\\|',
      reason:
        'A linha da tabela "Quem entra, e por onde" / "Who gets in" nas DUAS metades do README (mapa 3966). Um só `dropLinesMatching` por padrão alternado cobre pt e en.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: 'PUBLIC_SIGNUP_ENABLED',
      reason:
        'As frases do `[!WARNING]` (pt 208-209 / en 507-508) e qualquer outra menção ao flag. A metade de OAuth do WARNING FICA (mapa 3967).',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'Três portas, e duas delas são decisão de deploy',
      replacement: 'Duas portas, e uma delas é decisão de deploy',
      reason: "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: O lead da tabela de portas (mapa 3966).",
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: 'cobrindo signup → verify → login → refresh → logout|signup → verify → login',
      reason:
        'A descrição da suíte nas seções `Testes` / `Testing` (mapa 3970), que passaria a prometer um fluxo que a variante do spec não tem.',
    },
  ],

  envKeys: ['PUBLIC_SIGNUP_ENABLED', 'NEXT_PUBLIC_SIGNUP_ENABLED'],

  // Mapa 4010-4016: NENHUMA. `signup.service.ts` importa só `@nestjs/common`,
  // `@nestjs/config`, `argon2`, `@prisma/client` e `@dontpanic/shared` — argon2 é
  // usado por auth/users/admin-users/crypto.util/invitations. A página web usa
  // react-hook-form / @hookform/resolvers / sonner / lucide-react, todos
  // compartilhados com login, forgot-password, reset-password e invite.
  // Verificado nos quatro `package.json`.
  deps: [],

  composeServices: [],

  // Nenhuma SEÇÃO inteira de CLAUDE.md pertence a public-signup: tudo é trim de
  // frase, célula de tabela ou parágrafo dentro de seções que sobrevivem.
  docSections: [],

  // Mapa 4983: "public-signup — None at all. It is PUBLIC_SIGNUP_ENABLED + a service
  // + a form." Ele ESCREVE em tenants/users/profiles/permissions/legal_acceptances,
  // todas de outras features. E duas coisas que uma poda descuidada erraria:
  // `plans.isDefault` (ainda lido por `provisionTenant`) e
  // `ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP NOT NULL` (é de OAUTH).
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F13 · easter-eggs — mapa linhas 4021-4245
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A FRONTEIRA QUE ESTE MANIFESTO DESENHA, E POR QUÊ.
 *
 * O mapa (4023-4038) separa duas coisas que vivem sob "humor" e exige que o gerador
 * as trate separadamente:
 *
 *  A. OS EASTER EGGS ENUMERADOS — `marvin.ts`, `GET /teapot`, o handler do Konami, o
 *     `console.log` secreto, as falas do Marvin no 404/500, o namespace `easter`.
 *     Delimitado: 3 arquivos exclusivos + ~12 costuras. É isto que este manifesto
 *     remove, e é REMOÇÃO LIMPA.
 *
 *  B. A VOZ DA MARCA — **NÃO REMOVER EM V1** (mapa 176, 4023-4038). Não é escolha de
 *     gosto; é que a voz não é *apagável*, só *renomeável*, e renomear já é o trabalho
 *     do gerador. Duas evidências que decidem a fronteira:
 *       • `marvin` PEGA CARONA NO ENVELOPE GLOBAL DE ERRO: `all-exceptions.filter.ts`
 *         (12, 72) + `packages/shared/src/common.ts:29-30`. TODA resposta de erro do
 *         sistema carrega o campo. O filtro é registrado globalmente e seu spec asserta
 *         o campo em TRÊS status diferentes (`:45`, `:65`, `:105`) — um build "sem
 *         humor" que esquecer o spec falha `pnpm test` num lugar que não parece ter
 *         relação com humor. Por isso o envelope entra nas costuras de A (é
 *         delimitado e verificado), mas o resto de B não.
 *       • A PIADA ESTÁ TECIDA NAS *EXPLICAÇÕES* DOS DOCS, não pendurada nelas
 *         (mapa 4130-4160): "travá-lo com a própria tabela permitiria trancar-se fora
 *         de casa", "o job termina 'com sucesso' tendo visto um banco vazio",
 *         "derivar do e-mail produziria empresas chamadas `joao-silva-gmail-com`",
 *         "um `fetch(… x-forwarded-for: ipAleatório)` ganha um balde novo a cada
 *         request". Apagar essas linhas apaga o CONTEÚDO junto com o tom. O mapa
 *         prescreve uma VARIANTE sóbria dos docs (prosa reescrita, mesmo conteúdo),
 *         não uma poda — e classifica os blocos "pergunte ao Marcio" como
 *         *orientação valiosa para agentes*, não humor.
 *     Também em B, e fora do alcance de qualquer regex: o logo de toalha
 *     (`brand.tsx:12,48,77`), o badge "42" (`:13`), `@utility bg-guide`
 *     (`globals.css:179-185`, usado por 5 telas), `@utility caret-blink`
 *     (`:187-199`), o fallback de iniciais do avatar para "42"
 *     (`user-menu.tsx:25`), os rodapés "the answer is 42"
 *     (`(dashboard)/layout.tsx:26`, `auth-shell.tsx:37`), ~20 mensagens de sucesso
 *     da API terminando em "Don't Panic.", as três mensagens de erro do validador de
 *     env (`env.ts:240,244,280`), os rodapés e saudações dos DOIS templates de e-mail
 *     (`email-templates.ts:18,27,88`, `invitation-email.ts:28,42,136`) e o corpo do
 *     e-mail de reset (`auth.service.ts:561-562`) — estes últimos são ENVIADOS AO
 *     CLIENTE, então um build "sem humor" que só limpa a UI ainda manda piada por
 *     e-mail. E TODA fixture de teste (Arthur Dent, Ford Prefect, Zaphod,
 *     Slartibartfast, Sirius Cybernetics): o mapa (4238-4245) manda **não renomear em
 *     v1** — são dados inertes, e renomear não compra nada enquanto arrisca dezenas
 *     de asserções exatas (ex.: `invitation-email.spec.ts:21,35` assertam assunto
 *     literal contendo "Sirius Cybernetics").
 *
 * Consequência prática: NENHUMA costura deste manifesto toca B. `docSections` leva a
 * seção `## Humor`, e a segunda frase do primeiro bullet de `## O que NÃO fazer` sai —
 * isso é o limite. Se alguém quiser B, a resposta é a variante sóbria dos docs + o
 * pass de rename, não mais linhas aqui.
 */
export const easterEggsManifest: FeatureManifest = {
  id: 'easterEggs',
  label: 'Easter eggs',
  summary:
    'Konami no dashboard, console secreto, GET /teapot (418), falas do Marvin no 404/500 e no envelope global de erro.',

  // CORRIGIDO na integração: `requires: ['i18n']` estava ERRADO, e o erro vinha de ler
  // `i18n: false` como "sem i18n". Não é isso: o veredito do mapa para a F8 é
  // "single-language OK, remoção total NÃO NA V1" (mapa 171), então `i18n` desligado
  // significa UM catálogo em vez de dois — `next-intl`, `useTranslations` e o namespace
  // `easter` continuam existindo. A aresta dura proibiria easter eggs num projeto
  // monolíngue, que é exatamente o preset `minimal`/`interno`, sem nenhuma razão técnica.
  //
  // O acoplamento real (mapa 4223-4227, §4 em 5208) é de ORDEM de poda, não de
  // existência: `easter-eggs.tsx:4,22` usa `useTranslations('easter')` e
  // `not-found.tsx:2,7,29` / `error.tsx:4,15,40` leem chaves. Quem garante a consistência
  // é o lockstep dos dois catálogos (regra global 1) — e o teste de paridade
  // `messages.test.ts` acusa se alguém podar um lado só.
  requires: [],

  deletePaths: [
    'apps/api/src/common/marvin.ts',
    'apps/api/src/common/marvin.spec.ts',
    // Único importador: `(dashboard)/page.tsx:6,25`. Não existe teste nem story
    // para este componente (mapa 4047-4050).
    'apps/web/src/components/easter-eggs.tsx',
  ],

  // Mapa 4061-4064: nenhum campo persistido. O único hit de grep em
  // `prisma/schema/*.prisma` é a piada do header de `main.prisma:1`, que é voz de
  // marca (B) e fica.

  seams: [
    // ── GET /teapot (mapa 4069, 4231-4234) ────────────────────────────────────
    {
      file: 'apps/api/src/app.controller.ts',
      kind: 'dropBlock',
      block: { start: 'Easter egg: HTTP 418', end: '^\\s*\\}\\s*$' },
      reason:
        'O handler `@Get(\'teapot\')` inteiro: doc-comment, `@Public()`, `@HttpCode(418)` e o corpo com o campo `marvin`. O decorator `@Public()` NÃO sai — `hello()` também o usa. NÃO existe teste para esta rota (não há `app.controller.spec.ts` e grep por teapot em `apps/api/test/` é vazio); a única cobertura de 418 é `all-exceptions.filter.spec.ts:61-65`.',
    },

    // ── GET / (mapa 4070-4071) ────────────────────────────────────────────────
    {
      file: 'apps/api/src/app.service.ts',
      kind: 'dropLinesMatching',
      pattern: "hint: \"Don't Panic\\.\"|answer: 42,|marvin: \"Life\\? Don't talk to me about life\\.\"",
      reason:
        'Os três campos-piada de `GET /`, deixando `{ message: \'Hello, World!\' }`. Têm de sair JUNTO com o spec: `app.service.spec.ts` usa `toEqual`, que é exato — editar o service sem o spec quebra a suíte.',
    },
    {
      file: 'apps/api/src/app.service.spec.ts',
      kind: 'dropLinesMatching',
      pattern: "hint:|answer: 42|marvin:",
      reason:
        'As asserções-espelho (`:8-10`). `toEqual` compara a forma toda: a costura do service e esta são uma só edição em dois arquivos.',
    },

    // ── O ENVELOPE GLOBAL DE ERRO — a única costura que chega em produção ─────
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.ts',
      kind: 'dropImport',
      pattern: '\\.\\./marvin',
      reason: '`marvinQuip` foi apagado com `marvin.ts`.',
    },
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.ts',
      kind: 'dropLinesMatching',
      pattern: 'marvin: marvinQuip\\(status\\),',
      reason:
        'O campo `marvin` no corpo de TODA resposta de erro do sistema (`:72`). É a única costura de easter-eggs que alcança body de erro em produção — por isso está aqui e não na categoria B: é delimitada e verificada.',
    },
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.ts',
      kind: 'replace',
      pattern: "Adds Marvin's deadpan flavour on non-sensitive errors,",
      replacement: 'Shapes every error into one predictable envelope,',
      reason:
        'O doc-comment do filtro (`:30`) anuncia o campo removido; a regra de ouro que ele codifica (humor nunca em erro de segurança real) desaparece junto com o humor.',
    },
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.spec.ts',
      kind: 'dropImport',
      pattern: '\\.\\./marvin',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import de `marvinQuip` no spec.",
    },
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.spec.ts',
      kind: 'dropLinesMatching',
      pattern: 'marvin: marvinQuip\\(|body\\.marvin',
      reason:
        'Os 5 pontos de asserção (`:36` no nome do teste, `:45`, `:65`, `:102-105`) em TRÊS status diferentes. O mapa (4228-4231) avisa: um build sem humor que esquecer este spec falha `pnpm test` num lugar que não parece ter relação com humor. O arquivo SOBREVIVE — ele testa o envelope, não a piada.',
    },
    {
      file: 'apps/api/src/common/filters/all-exceptions.filter.spec.ts',
      kind: 'replace',
      pattern: ' and Marvin quip',
      replacement: '',
      reason: 'Nome de teste (`:36`) que promete um campo que não existe mais.',
    },

    // ── packages/shared (mapa 4073-4081) ──────────────────────────────────────
    {
      file: 'packages/shared/src/common.ts',
      kind: 'dropBlock',
      block: {
        start: "Marvin's deadpan, non-sensitive commentary\\.",
        end: 'marvin\\?: string;',
      },
      reason:
        'O campo em `ApiErrorBody` (`:29-30`). Remoção genuinamente limpa de 2 linhas: é OPCIONAL (`marvin?`), o único produtor é `all-exceptions.filter.ts:72` e nenhum código web o lê (`apps/web/src/lib/api.ts` não o expõe).',
    },

    // ── apps/web (mapa 4082-4093) ─────────────────────────────────────────────
    {
      file: 'apps/web/src/app/(dashboard)/page.tsx',
      kind: 'dropImport',
      pattern: '@/components/easter-eggs',
      reason: "Import de arquivo que sai em `deletePaths`: sem esta costura sobra um `import` apontando para m\u00f3dulo inexistente, e o `tsc` do projeto gerado para com `TS2307` num arquivo que o usu\u00e1rio n\u00e3o sabe que o gerador editou. Proven\u00e2ncia: Import do componente apagado.",
    },
    {
      file: 'apps/web/src/app/(dashboard)/page.tsx',
      kind: 'dropLinesMatching',
      pattern: '<EasterEggs />',
      reason:
        'O ÚNICO ponto de montagem do Konami e do `console.log` secreto (`:25`). Corolário do mapa (4234-4236): quem remover a feature `dashboard` levaria os dois embora em silêncio.',
    },
    {
      file: 'apps/web/src/app/not-found.tsx',
      kind: 'dropLinesMatching',
      pattern: "\\{t\\('marvin'\\)\\}",
      reason:
        'A fala do Marvin no 404 (`:29`). As linhas 20-22 (o `404` gigante) e 25-27 (título/corpo) são cromo de 404 comum e FICAM.',
    },
    {
      file: 'apps/web/src/app/error.tsx',
      kind: 'dropLinesMatching',
      pattern: "\\{t\\('marvin'\\)\\}",
      reason: "Linha que referencia s\u00edmbolo removido; sobrando, o build do projeto gerado falha apontando para o arquivo certo pelo motivo errado. Proven\u00e2ncia: A fala do Marvin na tela de 500 (`:40`).",
    },
    {
      file: 'apps/web/src/app/error.tsx',
      kind: 'dropBlock',
      block: { start: 'Don&apos;t Panic\\.', end: 'Don&apos;t Panic\\.' },
      reason:
        'O eyebrow "Don\'t Panic." do 500 (`:29-31`) — um dos dois elementos-piada da página. Bloco de uma linha porque start e end coincidem: é o texto do elemento, e o resto da página fica.',
    },
    {
      file: 'apps/web/src/app/global-error.tsx',
      kind: 'dropBlock',
      block: { start: 'Don&apos;t Panic\\.', end: 'Don&apos;t Panic\\.' },
      reason:
        'O eyebrow do global-error (`:27-29`). Este arquivo é deliberadamente livre de providers (ver seu comentário `:6-10`), então suas strings são LITERAIS, não chaves i18n — o que o torna imune ao teste de paridade e invisível numa poda de mensagens.',
    },
    {
      file: 'apps/web/src/app/global-error.tsx',
      kind: 'replace',
      pattern: 'We hit an unexpected error\\. The towel is on its way\\.',
      replacement: 'We hit an unexpected error. Please try again.',
      reason:
        'String literal com a piada da toalha (`:34`). Substituída, não removida: é a única cópia que a tela tem para mostrar, e uma tela de erro global sem texto é pior que uma sem piada.',
    },

    // ── i18n: as DUAS metades (regra global 1) ────────────────────────────────
    ...(['pt-BR', 'en-US'] as const).flatMap((locale) => [
      {
        file: `apps/web/messages/${locale}.json`,
        kind: 'dropJsonKey' as const,
        pattern: 'easter',
        reason: `O namespace \`easter\` inteiro (\`consoleTitle\`, \`consoleSubtitle\`, \`konamiTitle\`, \`konamiDescription\`) no arquivo ${locale}. Os dois arquivos têm 575 linhas alinhadas linha a linha; podar um só falha \`apps/web/src/i18n/messages.test.ts:18-25\`, que nomeia a órfã (regra global 1).`,
      },
      {
        file: `apps/web/messages/${locale}.json`,
        kind: 'dropJsonKey' as const,
        pattern: 'errors.notFound.marvin',
        reason: `A fala do Marvin no 404 em ${locale}, consumida por \`not-found.tsx:29\`. \`errors.notFound.body\` ("Esta página se perdeu no hiperespaço.") FICA: é cópia load-bearing, categoria B — o mapa (4101-4108) pede substituição sóbria, não remoção.`,
      },
      {
        file: `apps/web/messages/${locale}.json`,
        kind: 'dropJsonKey' as const,
        pattern: 'errors.serverError.marvin',
        reason: `A fala do Marvin no 500 em ${locale}, consumida por \`error.tsx:40\`. \`errors.serverError.body\`, \`errors.generic\`, \`common.dontPanic\`, \`common.tagline\`, \`dashboard.answer\` e \`dashboard.helloWorld\` FICAM — são voz de marca (B), e o mapa manda tratá-las por reescrita/rename, nunca por delete.`,
      },
    ]),

    // ── CLAUDE.md: o bullet, não a seção (a seção está em docSections) ────────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: ' Não colocar humor em mensagens que exponham internals\\.',
      replacement: '',
      reason:
        'SEGUNDA frase do primeiro bullet de `## O que NÃO fazer` (mapa 130, 4121-4123). A primeira frase ("Não logar segredos, tokens ou senhas") é regra de segurança real e FICA — por isso trim de frase, não `dropLinesMatching` na linha inteira.',
    },

    // ── README.md (mapa 4162-4176) ────────────────────────────────────────────
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: { start: '^```text\\s*$', end: '^```\\s*$' },
      reason:
        'O bloco de ASCII art `DONT PANIC!` (linhas 1-8, figlet de box-drawing dentro de uma cerca ```text). É o primeiro bloco do arquivo, então a âncora de cerca casa nele antes de qualquer outro.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: "img\\.shields\\.io/badge/Don't%20Panic-42",
      reason: "Linha que referencia s\u00edmbolo removido; sobrando, o build do projeto gerado falha apontando para o arquivo certo pelo motivo errado. Proven\u00e2ncia: O badge \"42\" do shields.io (linha 19).",
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: 'Tem um Konami code escondido no dashboard',
        // Só 'num erro de segurança real.': no README a frase está quebrada em duas
        // linhas ("...e nunca aparece" / "num erro de segurança real."), e a âncora é
        // casada linha a linha. Uma âncora que atravessa quebra de linha nunca casa em
        // markdown com wrap — e aqui ela fez a geração parar, porque o aplicador se
        // recusa a apagar até o fim do arquivo quando o bloco não fecha.
        end: 'num erro de segurança real\\.',
      },
      reason:
        'Parágrafo PT de humor (323-325) que documenta exatamente os eggs removidos: Konami, console e `GET /api/teapot`. Âncora em português para não casar com a metade EN.',
    },
    {
      file: 'README.md',
      kind: 'dropBlock',
      block: {
        start: 'There is a Konami code hidden in the dashboard',
        end: 'shows up in a real security error\\.',
      },
      reason: 'Metade EN do mesmo parágrafo (621-623). As duas metades do README saem juntas.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '_"Não entre em pânico\\."_ — a capa do Guia|_"Don\'t Panic\\."_ — the cover of the Guide',
      reason:
        'As duas epígrafes de fechamento (327 pt e 625 en, a última linha do arquivo). São voz de marca, mas o mapa as inclui explicitamente na "minimal humour-off README prune" (4174-4176), então saem aqui.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: "\\s*# API :4201 · Web :4200 +\\(Don't Panic\\.\\)|\\s*\\(Don't Panic\\.\\)",
      replacement: '',
      required: false,
      reason:
        'Os comentários `(Don\'t Panic.)` no fim das linhas de `pnpm dev` nos dois quick-starts (95 pt, 390 en). `required: false` porque a formatação exata do comentário inline varia e a ausência não quebra nada.',
    },

    // ── apps/api/prisma/seed.ts (mapa 4110-4119) ──────────────────────────────
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: "\\s+\\(Don't Panic\\.\\)",
      replacement: '',
      reason:
        'O sufixo do `console.log` final do seed (`:102`). As outras linhas que o mapa cita no seed — `PASSWORD = \'DontPanic42!\'` (`:14`), `name: \'Zaphod Beeblebrox\'` (`:91`), os e-mails `@dontpanic.dev` e o `slug: \'dontpanic\'` (`:15-16,54,57`) — são RENAME de marca (categoria B) e pertencem ao motor de rename + à geração de segredos, NÃO a este manifesto.',
    },

    // NADA de costura para: `brand.tsx`, `globals.css` (`bg-guide`, `caret-blink`),
    // `user-menu.tsx:25` (fallback "42"), os rodapés de `(dashboard)/layout.tsx:26` e
    // `auth-shell.tsx:37`, os templates de e-mail, as ~20 mensagens de sucesso da API,
    // as mensagens do validador de env, as fixtures de teste e as stories. Tudo isso é
    // categoria B — ver o comentário grande acima deste objeto. Mexer aqui exige
    // redesenho visual (`bg-guide` é usado por 5 telas) ou quebra dezenas de asserções
    // exatas, e não é o que "remover os easter eggs" significa.
  ],

  // Mapa 4109-4110: NENHUMA env liga ou desliga o humor; `.env.example` não tem toggle
  // e `apps/api/src/config/env.ts` também não. As três strings "Don't Panic" em
  // `env.ts:240,244,280` são mensagens do VALIDADOR (categoria B).
  envKeys: [],

  // Mapa 4218-4221: NENHUMA. `easter-eggs.tsx` usa só `react`, `next-intl` e `sonner`,
  // todos com dezenas de outros consumidores; `marvin.ts` não importa nada.
  deps: [],

  composeServices: [],

  // A seção `## Humor (com parcimônia)` sai inteira, por título exato (mapa 4121-4122).
  docSections: ['Humor (com parcimônia)'],

  // Mapa 4984 e 4207-4216: "easter-eggs — None at all." Grep por marvin|teapot nas
  // 6 migrations: zero linhas. Nenhum humor é persistido.
  sqlFragments: [],
};
