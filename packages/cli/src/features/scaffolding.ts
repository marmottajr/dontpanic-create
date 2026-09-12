/**
 * Fragmento de manifesto — feature `scaffolding` (recomendação A3.1 do mapa) mais os
 * itens A3.2 (deps fantasma) e I17 (storage local sem static serving).
 *
 * Transcrição fiel de `docs/maps/feature-surface.md`. Toda linha citada nos comentários
 * é proveniência do mapa, nunca padrão de busca.
 *
 * Provenência principal:
 *  - A3.1 (tabela + recomendação): mapa 5077-5092
 *  - A3.2 (deps declaradas e nunca importadas): mapa 5096-5101
 *  - Regra global 3 (thresholds de cobertura são pisos absolutos): mapa 55-61
 *  - Inventário do `vitest.config.mts` (qual `include` pertence a qual diretório): mapa 4461-4487
 *  - I17: mapa 5238 (+ nota em 5303)
 *  - charts/ pertence ao dossiê de **platform**, não a esta feature: mapa 1866 e 1919
 */

import type { FeatureId, FeatureManifest, SeamEdit } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// scaffolding — os blocos de construção que o boilerplate traz e não usa
// ─────────────────────────────────────────────────────────────────────────────

export const scaffoldingManifest: FeatureManifest = {
  id: 'scaffolding',
  label: 'Blocos de construção (scaffolding)',
  summary:
    'Kit de UI e de lógica pronto para a primeira tela de produto — componentes de registro/dashboard, hooks de grid, formatadores BR, gerador de sequência por tenant e a base de CRUD tenant-scoped. Nada no boilerplate os importa.',

  // `requires`: NENHUM. A auditoria (mapa 5077-5087) não encontrou consumidor
  // algum fora dos próprios testes, em nenhuma direção — estes arquivos não
  // dependem de feature nenhuma e feature nenhuma depende deles.
  // (`metric-card.tsx:85` chama `useTranslations('dashboard.variation')`, o que é
  // consumo de i18n — e i18n não é removível na v1, então não gera `requires`.)

  // `alwaysOn` deliberadamente AUSENTE: é removível. Default ligado (é o ponto de
  // um boilerplate) e desligado no preset `minimal` — mapa 5092.

  deletePaths: [
    // A3.1 linha 1 — `records/{fields,keyboard-list,record-page}.tsx` (+ 3 testes),
    // consumidores: **nenhum**. O diretório morre inteiro; confirmado no repo vivo
    // que ele contém exatamente esses 3 componentes e seus 3 `*.test.tsx`.
    'apps/web/src/components/records/**',

    // A3.1 linha 2 — `dashboard/{metric-card,panel,dashboard-skeleton}.tsx` (+ testes),
    // consumidores: **nenhum**. `variation.ts` é importado só por `metric-card.tsx:7`,
    // então vai junto no diretório (não é exceção: é folha do próprio bloco morto).
    'apps/web/src/components/dashboard/**',

    // A3.1 linha 3 — os hooks de grid, consumidores: **nenhum**.
    // CUIDADO: `use-debounced-value.ts` **é** usado (`platform/tenants/page.tsx:10`)
    // e `use-auth.tsx` é espinha (mapa 205) — por isso os hooks saem NOMEADOS,
    // nunca por glob de diretório.
    'apps/web/src/hooks/use-grid-keyboard.ts',
    'apps/web/src/hooks/use-grid-keyboard.test.tsx',
    'apps/web/src/hooks/use-synced-rows.ts',
    'apps/web/src/hooks/use-synced-rows.test.ts',
    'apps/web/src/hooks/use-hotkey.ts',
    'apps/web/src/hooks/use-hotkey.test.ts',

    // A3.1 linha 5 — `lib/br-format.ts`, consumidor: só o próprio teste.
    // NÃO existe linha de `include` própria para ele: ele cai no glob
    // `src/lib/**/*.ts` (`vitest.config.mts:33`), que sobrevive porque `masks.ts`,
    // `zod-error-map.ts`, `api.ts` e `utils.ts` continuam lá. Só o piso muda.
    'apps/web/src/lib/br-format.ts',
    'apps/web/src/lib/br-format.test.ts',

    // A3.1 linha 6 — gerador de sequência por tenant com `pg_advisory_xact_lock`,
    // sem chamador nenhum.
    'apps/api/src/common/sequence/sequence.service.ts',
    'apps/api/src/common/sequence/sequence.service.spec.ts',

    // A3.1 linha 7 — a classe base de CRUD tenant-scoped, sem subclasse.
    // Os vizinhos `common/crud/serialization.ts` (+ spec) FICAM: é o interceptor de
    // serialização que barra `passwordHash`/`twoFactorSecret`, espinha (mapa 197).
    'apps/api/src/common/crud/tenant-crud.ts',
    'apps/api/src/common/crud/tenant-crud.spec.ts',

    // A3.1 linha 8 — `actorOf`. O ARQUIVO inteiro sai porque `actor.ts` exporta só
    // esse helper morto; o que NÃO pode sair é `common/audit/audit.util.ts` (+ spec),
    // que é o writer real da trilha. Ver também I4/A3.3: `common/audit/**` tem 4
    // arquivos e só estes dois são desta feature.
    'apps/api/src/common/audit/actor.ts',
    'apps/api/src/common/audit/actor.spec.ts',
  ],

  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️  A PARTICULARIDADE DESTA FEATURE — LEIA ANTES DE MEXER  ⚠️
  //
  // Apagar os arquivos acima SEM apagar as linhas de `include` de cobertura
  // correspondentes não dá erro nenhum na geração: dá um projeto gerado cuja
  // suíte nasce VERMELHA. `vitest.config.mts:47-52` fixa pisos ABSOLUTOS
  // (99/88/95/99) cravados nos números atingidos (mapa 55-61 e 4483-4487); se o
  // glob fica e o diretório vai, o denominador de cobertura muda e o threshold
  // reprova o CI num clone novo — falha que não se parece nada com a remoção que
  // a causou, e que treina o usuário a editar a asserção.
  //
  // Por isso os dois primeiros seams são `required: true` (default, omitido):
  // se o padrão não casar, a geração DEVE falhar em vez de entregar CI vermelho.
  // ───────────────────────────────────────────────────────────────────────────
  seams: [
    {
      // mapa 4470 — `vitest.config.mts:27` é a linha do kit de registros.
      file: 'apps/web/vitest.config.mts',
      kind: 'dropLinesMatching',
      pattern: "'src/components/records/[^']*'",
      reason:
        'O glob de cobertura tem que morrer com o diretório: os pisos de vitest.config.mts:47-52 são absolutos e cravados no número atingido, então deixar o include apontando para um diretório apagado muda o denominador e reprova o threshold no CI de um clone novo (mapa 55-61, 4470, 4483-4487).',
    },
    {
      // mapa 4471 — `vitest.config.mts:28` é a linha do dashboard.
      file: 'apps/web/vitest.config.mts',
      kind: 'dropLinesMatching',
      pattern: "'src/components/dashboard/[^']*'",
      reason:
        'Mesmo mecanismo da linha de records: include sobrevivendo a diretório apagado altera o denominador de cobertura e derruba os pisos absolutos de vitest.config.mts:47-52, entregando suíte vermelha de fábrica (mapa 55-61, 4471, 4483-4487).',
    },

    // NOTA: a linha 29 (`src/components/charts/**`) NÃO é desta feature. O mapa
    // 1866 e 1919 dizem que `charts/bar-chart.tsx` tem um importador real
    // (`components/platform/signups-chart.tsx:4`) e que a linha 29 sai "only if
    // charts/ is dropped too" — ou seja, ela pertence ao dossiê de **platform**.
    // A recomendação em 5092 cita "(27, 28, 29)", o que contradiz a própria tabela
    // A3.1 em 5081; ver CHARTS_ORPHAN_WHEN_PLATFORM_OFF abaixo.

    {
      // Regra global 1 (mapa 40-45): chave de locale sai dos DOIS arquivos ou de
      // nenhum. `dashboard.variation` (4 chaves) é consumida só por
      // `metric-card.tsx:85` — verificado no repo vivo.
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'dashboard.variation',
      required: false,
      reason:
        'Copy órfã: `dashboard.variation` só é lida por metric-card.tsx:85, que foi apagado. required:false porque no modo mono-idioma (i18n nível i) um dos dois catálogos pode já não existir, e falhar aí bloquearia uma combinação legítima — deixar a chave é inofensivo (a paridade de messages.test.ts:18-25 só quebra se sair de um arquivo só).',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'dashboard.variation',
      required: false,
      reason:
        'Par obrigatório do seam de pt-BR: pela regra global 1 (mapa 40-45) uma chave removida de um catálogo só faz messages.test.ts:18-25 falhar nomeando a órfã; required:false pelo mesmo motivo do par (mono-idioma pode ter apagado o arquivo).',
    },

    // ⚠️  KIND INVENTADO — ver "NEW SEAMKINDS NEEDED" no relatório.
    // Nenhum `SeamKind` existente expressa "re-medir a cobertura e reescrever os
    // quatro números". `replace` exigiria saber o número final na hora de escrever
    // o manifesto, que é exatamente o que não se sabe.
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'relaxCoverageThresholds',
      pattern: 'thresholds:\\s*\\{[^}]*\\}',
      reason:
        'Regra global 3 (mapa 55-61): os pisos são absolutos e cravados no atingido, então apagar código BEM COBERTO (records/dashboard/hooks têm teste dedicado) move o agregado do que sobra e pode reprovar 99/88/95/99 por um motivo que não se parece com a remoção — o gerador precisa re-medir ou emitir pisos ligeiramente menores.',
    },
    {
      file: 'apps/api/jest.config.js',
      kind: 'relaxCoverageThresholds',
      pattern: 'coverageThreshold:\\s*\\{[\\s\\S]*?\\}\\s*,?\\s*\\}',
      reason:
        'Mesmo mecanismo no backend: jest.config.js:47-54 fixa 97/92/100/97 e `functions: 100` não tem folga alguma — sequence.service.ts, tenant-crud.ts e actor.ts saem com spec 100% coberta, então o agregado restante tem que ser re-medido ou o piso baixado (mapa 55-61).',
    },
  ],

  // Sem env própria, sem Prisma, sem SQL, sem serviço de compose: A3.1 é código
  // puro. Sem `deps` própria também — os arquivos só importam react, lucide-react
  // e next-intl, todos usados por muitas outras telas (verificado no repo vivo).

  // `docSections`: nenhuma. Nenhuma seção do CLAUDE.md documenta este scaffolding
  // (A3.3, mapa 5104-5117, lista o que é documentado-mas-não-ligado; nada de A3.1
  // aparece lá).
};

// ─────────────────────────────────────────────────────────────────────────────
// A3.2 — deps declaradas e nunca importadas (mapa 5096-5101)
// ─────────────────────────────────────────────────────────────────────────────

/** Deps fantasma do A3.2 — saem em QUALQUER configuração. */
export const GHOST_DEPS: { workspace: string; remove: string[] }[] = [
  {
    workspace: 'apps/api',
    remove: [
      // `apps/api/package.json:38`. Zero imports no repo inteiro — o que também
      // significa que `LOCAL_STORAGE_PUBLIC_URL` (`env.ts:70`) aponta para uma rota
      // que a API nunca serve. Confirmado no repo vivo: `grep -rn "fastify/static"`
      // em apps/ e packages/ não retorna nada.
      // ⚠️ VOLTA com storage `local` — ver LOCAL_STORAGE_STATIC_FIX (I17).
      '@fastify/static',

      // `apps/api/package.json:37`. Zero imports; o throttling é `@nestjs/throttler`
      // (guard global em `app.module.ts`, contadores no Redis pela porta de cache).
      // Manter a dep sugere uma segunda camada de rate limit que não existe.
      '@fastify/rate-limit',

      // `apps/api/package.json:30`. Zero imports: o adapter S3 usa só
      // `@aws-sdk/client-s3` (PutObject/DeleteObject) e nunca gera URL pré-assinada
      // — os avatares são públicos via `getPublicUrl`. Sai junto a linha de
      // `minimumReleaseAgeExclude` em `pnpm-workspace.yaml:39` (ver GHOST_DEP_SEAMS).
      '@aws-sdk/s3-request-presigner',
    ],
  },
];

/** Costuras que acompanham a remoção das deps fantasma (ex.: pnpm-workspace.yaml). */
export const GHOST_DEP_SEAMS: SeamEdit[] = [
  {
    // mapa 5101 ("also drop `pnpm-workspace.yaml:39`"). Verificado no repo vivo:
    // a linha 39 é `- '@aws-sdk/s3-request-presigner@3.1068.0'`, dentro de
    // `minimumReleaseAgeExclude`. É a ÚNICA menção às três deps fantasma fora do
    // package.json (nem `@fastify/static` nem `@fastify/rate-limit` aparecem em
    // overrides, allowBuilds ou onlyBuiltDependencies).
    file: 'pnpm-workspace.yaml',
    kind: 'dropLinesMatching',
    pattern: '@aws-sdk/s3-request-presigner@[\\d.]+',
    reason:
      'A exceção de minimumReleaseAgeExclude existe só para permitir instalar uma versão recém-publicada desta dep; sem a dep, a linha é uma exceção de supply-chain pendurada num pacote que o projeto não usa mais — ruído que o próximo leitor interpreta como "alguém precisou afrouxar isso por um motivo" (mapa 5101).',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// I17 — storage `local` sem static serving (mapa 5238, nota em 5303)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * I17: com storage `local`, `@fastify/static` volta e precisa ser REGISTRADO.
 *
 * Substância do I17, verbatim-em-substância: "`@fastify/static` é declarado
 * (`package.json:38`) mas nunca importado, então `LOCAL_STORAGE_PUBLIC_URL` aponta
 * para uma rota que a API não serve — avatares dão 404. Ao emitir storage local-only,
 * **adicione** a fiação do `@fastify/static`; é um bug pré-existente, não do gerador."
 *
 * Isto é a única exceção declarada ao "só subtrair" da decisão 0001: o gerador tem a
 * chance de não propagar um defeito do repo base, e o preço de propagá-lo é um projeto
 * gerado em que todo avatar enviado dá 404.
 */
export const LOCAL_STORAGE_STATIC_FIX = {
  /** Condição de aplicação, para o `apply.ts` avaliar: `recipe.drivers.storage === 'local'`. */
  appliesWhen: { driver: 'storage', equals: 'local' } as const,

  /** Provenância no mapa. */
  provenance: 'feature-surface.md:5238 (I17), 5099 (A3.2), 5303',

  /**
   * A dep volta para o workspace da API — anulando a remoção de GHOST_DEPS.
   * `apply.ts` tem que aplicar este re-add DEPOIS do pruning de deps fantasma.
   * Versão do boilerplate hoje: `^10.1.3` (`apps/api/package.json:38`).
   */
  readdDeps: [{ workspace: 'apps/api', add: ['@fastify/static'], version: '^10.1.3' }],

  /** O arquivo que recebe a fiação: o bootstrap do Fastify. */
  file: 'apps/api/src/main.ts',

  /**
   * Duas costuras, ambas INSERÇÕES expressas como `replace` re-emitindo a âncora,
   * porque o contrato atual só tem kinds subtrativos. Ver "NEW SEAMKINDS NEEDED".
   *
   * Âncoras escolhidas de propósito entre o que é ESPINHA (mapa 191, 98-100):
   *  - o import do `@fastify/helmet` (core, sempre presente) e não o do
   *    `@fastify/multipart`, que é da feature `files` e pode ter sido apagado;
   *  - o `app.enableCors(` (core) e não o bloco de multipart, pelo mesmo motivo.
   */
  seams: [
    {
      file: 'apps/api/src/main.ts',
      kind: 'replace',
      pattern: "import\\s+helmet\\s+from\\s+'@fastify/helmet';",
      replacement:
        "import { resolve } from 'node:path';\nimport helmet from '@fastify/helmet';\nimport fastifyStatic from '@fastify/static';",
      reason:
        'Ancorado no import do helmet porque ele é espinha do bootstrap (mapa 191) — ancorar no @fastify/multipart falharia exatamente na combinação em que o fix importa (storage local com a feature files reduzida), e `resolve` entra junto porque o @fastify/static exige root absoluto.',
    },
    {
      file: 'apps/api/src/main.ts',
      kind: 'replace',
      pattern: 'app\\.enableCors\\(',
      replacement: [
        '// I17: LOCAL_STORAGE_PUBLIC_URL aponta para uma rota que a API não servia.',
        '// Registrado no Fastify, não no Nest: setGlobalPrefix(\'api\') não se aplica a',
        '// plugin, então o prefixo casa com o pathname da própria env.',
        'const localPublic = new URL(config.get(\'LOCAL_STORAGE_PUBLIC_URL\', { infer: true }));',
        'await app.register(fastifyStatic, {',
        "  root: resolve(config.get('LOCAL_STORAGE_DIR', { infer: true })),",
        "  prefix: localPublic.pathname.replace(/\\/?$/, '/'),",
        '  index: false,',
        '  decorateReply: false,',
        '});',
        '',
        'app.enableCors(',
      ].join('\n'),
      reason:
        'Sem este registro o adapter local grava o arquivo em LOCAL_STORAGE_DIR e devolve uma URL que ninguém serve — todo avatar enviado dá 404 (I17, mapa 5238); o prefixo é derivado do pathname de LOCAL_STORAGE_PUBLIC_URL em vez de fixado em /files para os dois lados não poderem divergir em silêncio, que é a mesma armadilha de CAPTCHA_DRIVER/NEXT_PUBLIC_CAPTCHA_DRIVER.',
    },
  ] satisfies SeamEdit[],

  /**
   * ⚠️ O snippet acima é INFERÊNCIA de melhor-evidência, não texto do mapa.
   * O mapa diz *que* a fiação falta e *por que* (I17 + A3.2), nunca o código.
   * Evidência usada:
   *  - `LocalStorageAdapter` documenta ele mesmo: "Serve `dir` statically to expose publicUrl";
   *  - `.env.example:29` → `http://localhost:4201/files` (pathname `/files`);
   *  - `main.ts:41` → `app.setGlobalPrefix('api')` só afeta controllers do Nest,
   *    então o plugin serve em `/files/...` e a env continua verdadeira.
   */
  snippetIsInference: true,

  notes: [
    // Defeito PRÉ-EXISTENTE adjacente, encontrado ao conferir I17: o default de
    // `env.ts:70` é `http://localhost:3001/files` enquanto a API roda em 4201 e o
    // `.env.example:29` diz 4201. Quem sobe com o default (sem .env) ganha avatar
    // apontando para uma porta onde não há nada. Fica fora dos seams porque a
    // lógica de portas 42xx é do gerador, não desta feature.
    'env.ts:70 tem default de porta 3001, divergente do .env.example:29 (4201) — decidir com o dono da lógica de portas.',
    // O avatar é carregado pelo browser direto da API (é `<img src>` com URL
    // absoluta), o que é o mesmo que já acontece com S3/MinIO — não viola a regra
    // "nunca fale com a API sem passar pelo BFF", que é sobre chamadas de dados.
    'A URL pública é consumida por <img src>, direto, como no driver s3 — não passa pelo BFF por construção.',
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Extra: o item de A3.1 que NÃO é desta feature
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `charts/bar-chart.tsx` aparece na tabela A3.1 (mapa 5081) mas TEM importador real:
 * `components/platform/signups-chart.tsx:4`. O mapa resolve isso no dossiê de platform
 * (linha 1866: "becomes orphaned when platform goes"; linha 1919:
 * "`vitest.config.mts` | 29 | remove only if `charts/` is dropped too").
 *
 * A recomendação de A3.1 (mapa 5092) cita "(27, 28, 29)" e, nesse ponto, CONTRADIZ a
 * própria tabela: aplicar a linha 29 junto com `scaffolding` OFF e `platform` ON apaga
 * o glob de um diretório que continua existindo e sendo coberto — e apagar o diretório
 * junto quebraria a compilação de `signups-chart.tsx`. Fica aqui, para o dossiê de
 * platform consumir, em vez de dentro de `scaffoldingManifest`.
 */
export const CHARTS_ORPHAN_WHEN_PLATFORM_OFF = {
  provenance: 'feature-surface.md:1866, 1919, 5081 (vs. a recomendação em 5092)',
  ownedBy: 'platform' as const,
  onlyDeadWhen: 'features.platform === false',
  deletePaths: [
    'apps/web/src/components/charts/bar-chart.tsx',
    'apps/web/src/components/charts/bar-chart.test.tsx',
  ],
  seams: [
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'dropLinesMatching',
      pattern: "'src/components/charts/[^']*'",
      reason:
        'Mesma mecânica de denominador das linhas 27/28, mas só quando platform sai: com platform ligado o diretório sobrevive porque signups-chart.tsx:4 o importa, e apagar o include deixaria código de produção fora da medição (mapa 1919).',
    },
  ] satisfies SeamEdit[],
};

/**
 * Correções de VERDADE na documentação, aplicadas em QUALQUER configuração.
 *
 * Não pertencem a feature nenhuma: são afirmações que o `CLAUDE.md` do boilerplate faz e
 * que o repo não sustenta — a categoria A3.3 do mapa ("documented guarantees that are not
 * actually wired", mapa 5104-5117). Um gerador que poda features com cuidado e ainda
 * propaga uma garantia inexistente está entregando a pior parte do boilerplate: o projeto
 * gerado afirma ter uma proteção que não tem, e quem ler o `CLAUDE.md` — humano ou agente —
 * vai tomar decisão contando com ela.
 *
 * O caso concreto: o `pnpm-workspace.yaml` tem `minimumReleaseAgeExclude` (a lista de
 * exceções) e NÃO tem `minimumReleaseAge` (a política). Ou seja, existe a lista de quem
 * está isento de uma regra que nunca foi escrita, e o `CLAUDE.md:495` afirma que a regra
 * evita adotar releases recém-publicados. Não evita nada. A frase é reescrita para dizer o
 * que é verdade e o que falta fazer — em vez de apagada, porque a intenção documentada é
 * útil e o conserto é de uma linha no `pnpm-workspace.yaml`.
 */
export const DOC_TRUTH_SEAMS: SeamEdit[] = [
  {
    file: 'CLAUDE.md',
    kind: 'replace',
    pattern:
      '`minimumReleaseAge` no `pnpm-workspace\\.yaml` evita adotar releases recém-publicados \\(supply-chain\\)\\.',
    replacement:
      '`minimumReleaseAge` no `pnpm-workspace.yaml` **ainda não está configurado** — só a lista ' +
      '`minimumReleaseAgeExclude` existe, então hoje não há atraso nenhum na adoção de release ' +
      'novo. Para ligar a proteção de supply-chain de fato, acrescente `minimumReleaseAge: 1440` ' +
      '(minutos) ao `pnpm-workspace.yaml`; a lista de exceções já está lá esperando.',
    reason:
      'A3.3 do mapa (5104-5117): garantia documentada e não implementada. `pnpm-workspace.yaml` declara `minimumReleaseAgeExclude` sem `minimumReleaseAge`, então a política que a frase promete não existe — há só a lista de isentos de uma regra ausente. Propagar a frase entrega um projeto que AFIRMA ter proteção de supply-chain e não tem, que é pior que não afirmar nada. Se a costura deixar de casar, confira se o boilerplate finalmente configurou a política (aí a frase fica) ou se só reescreveu o texto.',
  },
];

/**
 * Arquivos que só ficam órfãos quando um PAR de features sai junto.
 *
 * O `deletePaths` de um manifesto não tem condicionalidade — ele descreve "o que é
 * exclusivo desta feature" —, e existe um caso que nenhum dos dois lados pode declarar
 * sozinho: `apps/web/src/lib/auth-config.ts` tem exatamente duas metades, a de oauth
 * (`parseOAuthProviders`, `enabledOAuthProviders`, `oauthEnabled`, `oauthStartUrl`) e a
 * de public-signup (`readFlag`, `signupEnabled`). Cada feature remove a sua e o arquivo
 * sobrevive — correto. Mas quando as DUAS saem, o que resta é um doc-comment: um arquivo
 * sem nenhum `export`, o que para o TypeScript **não é um módulo**. O spec dele então
 * falha com `TS2306: File … is not a module`, num arquivo que ninguém editou de propósito.
 *
 * Declarar isto explicitamente é melhor que a alternativa tentadora — o aplicador
 * detectar "arquivo ficou sem exports" e apagar por conta própria. Essa heurística
 * apagaria um módulo de efeito colateral legítimo, e a decisão ficaria invisível no
 * relatório. Aqui a regra tem nome, dono e motivo.
 */
export const FILES_ORPHANED_BY_FEATURE_PAIRS: {
  when: readonly FeatureId[];
  paths: readonly string[];
  reason: string;
}[] = [
  {
    when: ['oauth', 'publicSignup'],
    paths: ['apps/web/src/lib/auth-config.ts', 'apps/web/src/lib/auth-config.test.ts'],
    reason:
      'As duas únicas metades de `auth-config.ts` são oauth e public-signup. Com as duas fora sobra só o doc-comment — arquivo sem export nenhum, que o TS não considera módulo, e o spec quebra com TS2306.',
  },
];
