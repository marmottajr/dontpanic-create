/**
 * Fragmento de manifesto: `i18n` (F8) e `multiTenant` (F9).
 *
 * Transcrito de `docs/maps/feature-surface.md` — F8 nas linhas 2687-3009, F9 nas
 * linhas 3010-3280, as quatro regras globais nas linhas 40-66, o inventário de
 * fragmentos SQL nas linhas 4967-4990 e a armadilha I13 na linha 5234. A decisão
 * vinculante para `multiTenant` é `docs/decisions/0002-single-tenant-esconde-nao-arranca.md`.
 *
 * Convenções deste arquivo, iguais às do resto do manifesto:
 *  - todo `pattern` é FONTE de regex (sem flags) e é ÂNCORA, não string literal:
 *    usa `\s*` e classes negadas para sobreviver a reindentação/prettier;
 *  - `required: true` é o default e por isso é omitido; `required: false` só
 *    aparece onde o mapa diz que a costura pode legitimamente não existir
 *    (arquivo que só existe se outra feature estiver instalada, ou linha que o
 *    manifesto de outra feature já removeu antes);
 *  - `{{...}}` num `replacement` é um PLACEHOLDER de tempo de execução que o
 *    `apply.ts` tem de substituir a partir da receita (`recipe.i18n.defaultLocale`).
 *    O manifesto é estático; o idioma sobrevivente não é.
 */

import type { FeatureManifest } from '../types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// F8 · i18n
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ATENÇÃO — `i18n: false` NÃO é "sem i18n". É **um idioma só**.
 *
 * O mapa (linhas 2687-2696) fecha a questão com um número: **50 arquivos-fonte
 * não-teste chamam `useTranslations`/`getTranslations`**, mais 9 com `useLocale`
 * e 18 harnesses de teste/story que embrulham `NextIntlClientProvider`. Arrancar
 * o next-intl significaria reescrever a UI inteira e reautorar ~575 linhas de
 * cópia em duas línguas como literais inline — veredito do mapa para o nível (ii):
 * **DO NOT REMOVE IN V1** (linha 2689). Este manifesto emite **só o nível (i)**:
 * mantém `next-intl`, mantém `request.ts`, mantém o provider no `layout.tsx`,
 * mantém os 50 call sites intactos — e poda o segundo catálogo, o seletor de
 * idioma e o sistema bilíngue artesanal da API.
 *
 * Não existe, e não deve existir, nenhuma entrada `deps` removendo `next-intl`
 * (mapa linha 2977: "Level (i): KEEP").
 *
 * O que o manifesto NÃO consegue expressar (o `apply.ts` resolve em runtime):
 *  - QUAL catálogo morre. `apps/web/messages/pt-BR.json` e `en-US.json` são
 *    intercambiáveis; o sobrevivente é `recipe.i18n.defaultLocale`. Por isso
 *    nenhum dos dois está em `deletePaths` e toda costura sobre eles é
 *    `required: false`.
 *  - Qual literal entra nos `replacement` marcados com `{{i18n.defaultLocale}}`
 *    (tag BCP-47 do web, ex. `pt-BR`) e `{{i18n.emailLocale}}` (a chave estreita
 *    de `EmailLocale`, ex. `pt-BR` ou `en`).
 *
 * Os dois catálogos são podados **em lockstep** (regra global 1, linhas 40-47):
 * são 575 linhas alinhadas linha a linha e `apps/web/src/i18n/messages.test.ts`
 * é um teste de paridade de chaves que nomeia os órfãos. Com um único catálogo
 * restante o teste não tem com o que comparar — e é por isso, e só por isso, que
 * ele entra em `deletePaths`.
 */
export const i18nManifest: FeatureManifest = {
  id: 'i18n',
  label: 'i18n (multi-idioma)',
  summary:
    'Catálogos pt-BR/en-US com paridade testada, seletor de bandeira e seleção de idioma de e-mail na API. Desligar não remove o next-intl: colapsa tudo para um idioma só.',

  // i18n não depende de nenhuma outra feature: não há `requires`.
  // Mapa 3000-3008 (§k) lista dependências em sentido inverso — platform e
  // invitations dependem do `EmailLocale` da API, não o contrário.

  /**
   * Mapa 2698-2718 (§a), nível (i). Os 10 arquivos exclusivos que podem ser
   * nomeados estaticamente. `apps/web/messages/<outro-locale>.json` é o 11º e
   * fica de fora de propósito — ver o comentário do manifesto.
   *
   * `apps/web/src/i18n/request.ts` NÃO entra aqui: o nível (i) o mantém e só
   * troca a leitura do cookie por uma constante (costuras abaixo).
   */
  deletePaths: [
    // `locales.ts` NÃO é apagado — é PODADO para um idioma (costuras abaixo).
    //
    // Apagá-lo obrigava a reescrever `request.ts` para um locale constante, e isso tinha
    // uma consequência que nada no mapa antecipava: a versão original chama
    // `await cookies()`, e ler cookie é o que OPTA todas as páginas por renderização
    // dinâmica. Sem essa chamada, o Next passou a prerenderizar `/login` estaticamente e
    // o build morreu com "useSearchParams() should be wrapped in a suspense boundary" —
    // num arquivo que o gerador não tocou, por um mecanismo (estático vs. dinâmico) que
    // não aparece em nenhuma costura.
    //
    // Manter `locales.ts` com um único idioma é a subtração mínima e deixa `request.ts`
    // intacto: ele continua lendo o cookie, `isLocale` continua válido (aceitando só o
    // idioma que sobrou) e o opt-in dinâmico continua de pé.
    'apps/web/src/i18n/locales.test.ts',
    'apps/web/src/i18n/locale-actions.ts',
    // Teste de paridade pt-BR ↔ en-US: sai porque com um catálogo só não há
    // par a comparar. Regra do coordenador: apagar SOMENTE quando resta um
    // único catálogo — que é exatamente o caso do nível (i).
    'apps/web/src/i18n/messages.test.ts',
    'apps/web/src/components/language-switcher.tsx',
    'apps/web/src/components/language-switcher.test.tsx',
    'apps/web/src/components/language-switcher.stories.tsx',
    // flags.tsx: SVGs BR/US inline, consumidos só pelo seletor (mapa 2716).
    'apps/web/src/components/flags.tsx',
    'apps/web/src/components/flags.test.tsx',
    'apps/web/src/components/flags.stories.tsx',
  ],

  // Prisma: NENHUMA mudança no nível (i). Mapa 2769-2775 — `Tenant.locale`,
  // `Tenant.currency`, `Tenant.timezone` e `Plan.currency` são lidos de verdade
  // em 7 arquivos (platform-tenants.service.ts:56-62/233/253, tenant-access.ts:63-65,
  // tenant-provisioning.ts:31-33/84-86, tenants.service.ts:71) e custam três
  // colunas TEXT NOT NULL DEFAULT. Derrubá-las é o nível (ii). Por isso não há
  // chave `prisma` neste manifesto.

  seams: [
    // ── web · o seletor de idioma e seus dois pontos de montagem ──────────────
    {
      file: 'apps/web/src/components/app-sidebar.tsx',
      kind: 'dropImport',
      pattern: '@/components/language-switcher',
      reason:
        'O seletor é apagado inteiro (mapa 2715, §a), então o import na sidebar (mapa 2724, linha 10) fica pendurado e o build do Next falha na resolução do módulo.',
    },
    {
      file: 'apps/web/src/components/app-sidebar.tsx',
      kind: 'replace',
      pattern:
        '<div\\s+className="[^"]*justify-between[^"]*">\\s*<LanguageSwitcher[^>]*/>\\s*<ThemeToggle\\s*/>\\s*</div>',
      replacement: '<ThemeToggle />',
      reason:
        'Mapa 2724 (linhas 71-74): o wrapper `flex justify-between` existe só para separar seletor e ThemeToggle; removendo o seletor sem colapsar o wrapper o ThemeToggle fica encostado à esquerda num flex de um item só.',
    },
    // Terceiro ponto de montagem do seletor, que o dossiê não listou: `auth-shell.tsx`
    // é a moldura de TODA tela deslogada (login, forgot, reset, verify, /invite). Sem
    // estas duas costuras o web não compila — `TS2307` no módulo apagado.
    {
      file: 'apps/web/src/components/auth-shell.tsx',
      kind: 'dropImport',
      pattern: '^@/components/language-switcher$',
      reason:
        'Import do seletor na moldura das telas deslogadas (auth-shell.tsx:3). O componente sai inteiro em `deletePaths`, então o import pendurado quebra a resolução de módulo do Next.',
    },
    {
      file: 'apps/web/src/components/auth-shell.tsx',
      kind: 'replace',
      pattern:
        '<div\\s+className="flex items-center gap-1">\\s*<LanguageSwitcher\\s*/>\\s*<ThemeToggle\\s*/>\\s*</div>',
      replacement: '<ThemeToggle />',
      reason:
        'O wrapper `flex items-center gap-1` existe para separar seletor e ThemeToggle; com um item só ele é ruído. Mesma decisão da sidebar (mapa 2724).',
    },
    {
      file: 'apps/web/src/app/platform/layout.tsx',
      kind: 'dropImport',
      pattern: '^@/components/language-switcher$',
      required: false,
      reason:
        'Mapa 2725 (linha 8). `required: false` porque o header do painel `/platform` só existe se a feature `platform` estiver instalada — e ela não existe em modo single-tenant (mapa 3040).',
    },
    {
      file: 'apps/web/src/app/platform/layout.tsx',
      kind: 'dropLinesMatching',
      pattern: '<LanguageSwitcher\\s*/>',
      required: false,
      reason:
        'Mapa 2725 (linha 53): a montagem do seletor no cluster `ml-auto` do header da plataforma. Ausente junto com a feature `platform`.',
    },

    // ── web · o card de marketing "Multilíngue" do dashboard ─────────────────
    {
      file: 'apps/web/src/app/(dashboard)/page.tsx',
      kind: 'replace',
      pattern: 'import\\s*\\{\\s*Boxes,\\s*Languages,\\s*ShieldCheck\\s*\\}',
      replacement: 'import { Boxes, ShieldCheck }',
      reason:
        'Mapa 2728 (linha 3): o ícone `Languages` do lucide serve apenas ao card i18n; deixá-lo importado sem uso derruba o lint (`no-unused-vars`) do projeto gerado.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/page.tsx',
      kind: 'replace',
      pattern: "'secure'\\s*\\|\\s*'i18n'\\s*\\|\\s*'swappable'",
      replacement: "'secure' | 'swappable'",
      reason:
        'Mapa 2728 (linha 11): `CardKey` é a união que o `useTranslations(\'dashboard\')` indexa; manter `i18n` aqui depois de apagar `dashboard.cards.i18n.*` do catálogo faz o next-intl estourar em runtime na chave ausente.',
    },
    {
      file: 'apps/web/src/app/(dashboard)/page.tsx',
      kind: 'dropLinesMatching',
      pattern: "\\{\\s*key:\\s*'i18n',\\s*icon:\\s*Languages\\s*\\},",
      reason:
        'Mapa 2728 (linha 15): a entrada do card i18n na grade de 3 cards do hero. Sai junto com as chaves `dashboard.cards.i18n.*`.',
    },

    // ── web · chaves de catálogo que o i18n possui (lockstep nos DOIS arquivos) ─
    // Mapa 2726-2727 e 2941-2944 (§e): as ÚNICAS chaves de propriedade da
    // própria feature i18n são `nav.language` e `dashboard.cards.i18n.*`.
    // Ambas as costuras são `required: false` porque exatamente UM dos dois
    // catálogos sobrevive e o outro já foi apagado pelo `apply.ts`.
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'nav.language',
      required: false,
      reason:
        'Mapa 2726 (linha 26): único rótulo de nav que o seletor consome. Ausente se pt-BR foi o catálogo descartado — a poda de chaves só se aplica ao catálogo sobrevivente.',
    },
    {
      file: 'apps/web/messages/pt-BR.json',
      kind: 'dropJsonKey',
      pattern: 'dashboard.cards.i18n',
      required: false,
      reason:
        'Mapa 2727 (linhas 139-142): o card "Multilíngue / troque pela bandeira" mente num projeto de idioma único. Mesmo motivo de `required: false`.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'nav.language',
      required: false,
      reason:
        'Regra global 1 (mapa 40-47): os catálogos são podados em lockstep ou `messages.test.ts` nomeia o órfão. Aqui `messages.test.ts` já saiu, mas a simetria é mantida porque só um dos dois arquivos existe no projeto gerado.',
    },
    {
      file: 'apps/web/messages/en-US.json',
      kind: 'dropJsonKey',
      pattern: 'dashboard.cards.i18n',
      required: false,
      reason:
        'Par lockstep da chave `dashboard.cards.i18n` em pt-BR (mapa 2727, linhas 139-142).',
    },

    // ── web · request.ts: cookie de locale → constante ───────────────────────
    // Mapa 2969-2973 ("Level (i) mechanics"): mantém `request.ts`, troca as
    // linhas 3 e 8-10 por um locale constante, para que a leitura do cookie e o
    // `isLocale` saiam junto com `locales.ts`.
    // O TIPO DE RETORNO de `mailLocale()` tem de colapsar junto com o corpo.
    //
    // Uma costura irmã já reduz o corpo a `return '<locale>';`, mas a assinatura continuava
    // `: 'pt-BR' | 'en'` — e com `EmailLocale` reduzido a uma chave, devolver a união dá
    // `TS2322` no ponto em que o valor é passado ao mailer, não aqui. É o par que precisa
    // sair junto: corpo sem assinatura compila mentindo sobre o contrato.
    {
      file: 'apps/api/src/modules/platform/services/platform-tenants.service.ts',
      kind: 'replace',
      pattern: "function mailLocale\\(locale: string\\): 'pt-BR' \\| 'en'",
      replacement: "function mailLocale(_locale: string): '{{i18n.emailLocale}}'",
      required: false,
      reason:
        'Assinatura de `mailLocale()` no painel da plataforma. O parâmetro vira `_locale` porque o corpo colapsado não o lê mais e o `noUnusedParameters` do projeto gerado recusa o nome sem underscore. `required: false`: o arquivo só existe com a feature `platform`.',
    },

    // ─── specs que passam um locale que deixou de existir ────────────────────────
    //
    // `EmailLocale` colapsa para a única chave que sobrou, então todo `locale: 'en'` num
    // spec deixa de tipar. Classe que só aparece em `pnpm test` (o tsconfig de build
    // exclui `*.spec.ts`), e por isso foi a última a ser encontrada.
    {
      file: 'apps/api/src/modules/auth/support/email-templates.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('builds an English email when locale=en", end: '\\}\\);' },
      required: false,
      reason:
        'O teste do template em inglês. `required: false` porque, se o idioma que sobrou FOR o inglês, é o teste em pt-BR que sai — e aí a costura irmã é que casa.',
    },
    {
      file: 'apps/api/src/modules/auth/support/email-templates.spec.ts',
      kind: 'dropBlock',
      block: { start: "it\\('falls back to pt-BR for an unknown locale", end: '\\}\\);' },
      required: false,
      reason:
        'O fallback de locale desconhecido deixa de ser observável quando só existe um locale: qualquer entrada resolve para ele, e o teste passaria por construção sem provar nada.',
    },
    // Todo `locale: '<idioma descartado>'` em spec vira o idioma que SOBROU.
    //
    // Reescrever em vez de apagar é deliberado: nesses testes o locale é um parâmetro de
    // passagem — o que eles afirmam é que o e-mail foi enfileirado, que o convite foi
    // emitido, que o link tem o token. Apagá-los tiraria cobertura de caminhos que são
    // núcleo. E a troca é feita pela chave DESCARTADA (`{{i18n.droppedEmailLocaleKey}}`),
    // não pela literal `'en'`: se o idioma que sobrar for o inglês, é o `'pt-BR'` dos
    // specs que precisa mudar, e a costura funciona nos dois sentidos sem duplicação.
    ...[
      'apps/api/src/modules/auth/services/auth.service.spec.ts',
      'apps/api/src/modules/invitations/invitations.service.spec.ts',
      // `invitation-email.spec.ts` NÃO entra aqui: nele o locale não é de passagem — os
      // testes afirmam o ASSUNTO do e-mail em inglês, palavra por palavra. Reescrever o
      // locale fazia o template renderizar em português e a asserção comparar contra o
      // texto inglês. Ali o tratamento é outro: ver as duas costuras abaixo.
    ].map((file) => ({
      file,
      kind: 'replace' as const,
      pattern: "locale: '{{i18n.droppedEmailLocaleKey}}'",
      replacement: "locale: '{{i18n.emailLocale}}'",
      required: false,
      reason:
        'Locale de passagem em spec: o teste continua provando o que provava (e-mail enfileirado, convite emitido, link com token), só deixa de nomear um idioma que o projeto não tem mais. `required: false` porque os specs de convite só existem com a feature `invitations`.',
    })),
    // Os dois testes de `invitation-email.spec.ts` que afirmam o texto EM INGLÊS.
    //
    // Assimetria conhecida e aceita na v1: as âncoras nomeiam os testes ingleses porque os
    // quatro presets têm `defaultLocale: 'pt'`, então é sempre o inglês que sai. Numa
    // receita `--i18n=en` seriam os três testes em pt-BR que precisariam sair — o
    // `apply.ts` emite um aviso alto nesse caso, em vez de gerar uma suíte vermelha em
    // silêncio. O mapa (I18) alerta justamente para não mexer nas fixtures do Guia do
    // Mochileiro aqui: os assuntos são comparados com `toBe`, string exata.
    {
      file: 'apps/api/src/modules/invitations/support/invitation-email.spec.ts',
      kind: 'dropBlock',
      block: {
        start: "it\\('carries the link in both the button and the plain-text part",
        end: '\\}\\);',
      },
      required: false,
      reason:
        'Afirma `mail.subject` em inglês com `toBe` (string exata) e o corpo com "Marvin invited you to join". Com o inglês fora, o template renderiza em pt-BR e a comparação falha — e não há reescrita possível: o assunto do teste É o texto inglês. A cobertura do link no botão e no texto puro continua nos testes pt-BR do mesmo arquivo.',
    },
    {
      file: 'apps/api/src/modules/invitations/support/invitation-email.spec.ts',
      kind: 'dropBlock',
      block: {
        start: "it\\('states the deadline in UTC, whatever the machine thinks",
        end: '\\}\\);',
      },
      required: false,
      reason:
        'Mesmo caso: formata o prazo com o locale inglês e compara a string montada. O teste irmão em pt-BR cobre a formatação de data que sobra.',
    },
    {
      // DEPOIS dos dois `dropBlock` acima, de propósito: as costuras de um arquivo são
      // aplicadas na ordem do array, então quando esta roda só sobrou o teste que passa
      // o locale sem afirmar o texto dele ("escapes everything that came from a human").
      // Esse é reescrito em vez de apagado — ele prova a escapagem de HTML vinda de
      // entrada humana, que é defesa contra injeção e não tem nada de i18n.
      file: 'apps/api/src/modules/invitations/support/invitation-email.spec.ts',
      kind: 'replace',
      pattern: "locale: '{{i18n.droppedEmailLocaleKey}}'",
      replacement: "locale: '{{i18n.emailLocale}}'",
      required: false,
      reason:
        'O locale remanescente no teste de escapagem de HTML, que não afirma texto traduzido nenhum. Reescrito para o idioma que sobrou: apagar o teste tiraria a cobertura da defesa contra injeção no e-mail de convite.',
    },
    {
      file: 'apps/api/src/modules/platform/services/platform-tenants.service.spec.ts',
      kind: 'dropBlock',
      block: {
        start: 'it\\([\'"]mails in English when that is the company',
        end: '\\}\\);',
      },
      required: false,
      reason:
        'Este teste é SOBRE a escolha de idioma ("mails in English when that is the company\'s language") — com um idioma só não há escolha a provar, e `mailLocale()` passou a ser constante. Diferente dos de cima, aqui não há o que reescrever: o assunto do teste desapareceu. `required: false`: arquivo só existe com `platform`.',
    },

    // ── web · locales.ts podado para um idioma ───────────────────────────────
    //
    // As três costuras antigas sobre `request.ts` (tirar o import de `./locales`, tirar
    // `next/headers` e trocar a leitura do cookie por uma constante) FORAM REMOVIDAS: ver
    // a nota em `deletePaths`. `request.ts` sai intacto.
    {
      file: 'apps/web/src/i18n/locales.ts',
      kind: 'replace',
      pattern: 'export const locales = \\[[^\\]]*\\] as const;',
      replacement: "export const locales = ['{{i18n.defaultLocale}}'] as const;",
      reason:
        'A lista de idiomas colapsa para o único que a receita pediu. É a fonte de `Locale`, de `isLocale` e do array que o seletor iterava — com um elemento, `isLocale` passa a aceitar só ele, que é exatamente o comportamento de single-language.',
    },
    {
      file: 'apps/web/src/i18n/locales.ts',
      kind: 'replace',
      pattern: "export const defaultLocale: Locale = '[^']*';",
      replacement: "export const defaultLocale: Locale = '{{i18n.defaultLocale}}';",
      reason:
        'O default tem de ser o idioma que sobrou, senão ele não está em `locales` e o tipo `Locale` recusa a atribuição. A tag vem da varredura de `apps/web/messages` (o `pt` da receita é `pt-BR` no catálogo).',
    },
    {
      file: 'apps/web/src/i18n/locales.ts',
      kind: 'dropLinesMatching',
      pattern: "^\\s*'{{i18n.droppedLocaleTag}}':",
      reason:
        'A entrada do idioma descartado em `localeMeta` (rótulo, sigla e bandeira). O `Record<Locale, …>` deixaria de tipar com uma chave que já não é um `Locale`.',
    },

    // ── web · cobertura e Storybook ──────────────────────────────────────────
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'dropLinesMatching',
      pattern: "'src/components/language-switcher\\.tsx'",
      reason:
        'Regra global 3 (mapa 55-63) + mapa 2729: entrada do `include` de cobertura apontando para arquivo apagado. Deixá-la não é fatal no v8, mas o `apply.ts` precisa remensurar os thresholds porque o piso de branches 88% foi calibrado COM o branch defensivo `if (next === locale) return;` do seletor.',
    },
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'dropLinesMatching',
      pattern: "'src/i18n/locales\\.test\\.ts'",
      required: false,
      reason:
        'A entrada de cobertura do SPEC de locales, que é apagado. A entrada de `src/i18n/locales.ts` FICA: o arquivo sobrevive podado, e tirá-lo da medição esconderia código de produção.',
    },
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'replace',
      pattern: ',\\s*the i18n locale map, the language switcher',
      replacement: '',
      reason:
        'Mapa 2729 (comentário na linha 18): o comentário enumera o escopo de cobertura e nomeia "the i18n locale map, the language switcher", ambos removidos. Comentário desatualizado num arquivo de threshold é como alguém "conserta" o CI baixando o piso.',
    },
    {
      file: 'apps/web/vitest.config.mts',
      kind: 'replace',
      pattern: ',\\s*same-locale no-op',
      replacement: '',
      reason:
        'Mapa 2729 (comentário 44-46): a justificativa do piso de branches em 88% cita explicitamente o "same-locale no-op" do seletor. Com o seletor fora, o piso precisa ser remensurado e a razão registrada deixa de valer.',
    },
    {
      file: 'apps/web/.storybook/preview.tsx',
      kind: 'dropBalancedBlock',
      pattern: 'locale:\\s*\\{',
      reason:
        'Mapa 2730 (linhas 56-68): a toolbar `globalTypes.locale` (itens pt-BR/en-US, 🇧🇷/🇺🇸) existe só para o LanguageSwitcher — o próprio comentário da linha 57 diz isso. É um literal de objeto aninhado (toolbar → items → 2 objetos), então `dropBlock` por delimitador de linha pararia no `},` errado: precisa de contagem de chaves.',
    },

    // ── API · o SEGUNDO sistema bilíngue, artesanal, que não passa pelo next-intl ─
    // Mapa 2989-3000 (§k.2) — "a acoplagem mais surpreendente da feature":
    // `EmailLocale = 'pt-BR' | 'en'` em auth/support/email-templates.ts:1 com a
    // tabela `STRINGS` em :13-32, e o gêmeo em invitations/support/invitation-email.ts:1,23
    // (+ `formatDeadline` em :73-80). Consumidores: auth.service.ts, users.service.ts,
    // invitations.service.ts, signup.service.ts, platform-tenants.service.ts.
    // "Remover multi-idioma" parece mudança só do web; sem colapsar isto o produto
    // continua mandando e-mail em português para usuário inglês (ou o inverso)
    // dependendo de um cookie que ninguém mais escreve.
    {
      file: 'apps/api/src/modules/auth/support/email-templates.ts',
      kind: 'replace',
      pattern: "export type EmailLocale\\s*=\\s*'pt-BR'\\s*\\|\\s*'en';",
      replacement: "export type EmailLocale = '{{i18n.emailLocale}}';",
      reason:
        'Mapa 2990 (email-templates.ts:1): colapsar a união para um literal é o que faz o compilador achar todo `Record<EmailLocale, …>` e toda comparação `locale === \'en\'` que sobrou. Sem isso o sistema bilíngue da API continua de pé e escolhe idioma por um cookie inexistente.',
    },
    {
      file: 'apps/api/src/modules/auth/support/email-templates.ts',
      kind: 'dropBalancedBlock',
      pattern: '{{i18n.droppedEmailLocaleKey}}:\\s*\\{',
      reason:
        'Mapa 2990 (email-templates.ts:13-32): a tabela `STRINGS: Record<EmailLocale, CodeStrings>` tem uma entrada por idioma; a do idioma descartado sai. O `pattern` é PARAMETRIZADO PELO LOCALE (`pt-BR` ou `en`) — o apply.ts precisa montá-lo; o manifesto não pode nomeá-lo estaticamente. Literal de objeto aninhado (greeting é arrow function), daí a contagem de chaves.',
    },
    {
      file: 'apps/api/src/modules/invitations/support/invitation-email.ts',
      kind: 'dropBalancedBlock',
      pattern: '{{i18n.droppedEmailLocaleKey}}:\\s*\\{',
      required: false,
      reason:
        'Mapa 2990-2991 e 3004 (invitation-email.ts:23): o gêmeo da tabela `STRINGS`, com o mesmo colapso. `required: false` porque o arquivo só existe se a feature `invitations` estiver instalada.',
    },
    {
      file: 'apps/api/src/modules/invitations/support/invitation-email.ts',
      kind: 'replace',
      pattern: "locale\\s*===\\s*'en'\\s*\\?\\s*'en-US'\\s*:\\s*'pt-BR'",
      replacement: "'{{i18n.defaultLocale}}'",
      reason:
        'Mapa 2991 (invitation-email.ts:73-80, `formatDeadline`): o `Intl.DateTimeFormat` escolhe a tag BCP-47 pelo locale do convite. Com um idioma só, a escolha é constante — e um prazo formatado na convenção errada é exatamente o que faz alguém perder um dia útil.',
    },

    // ── API · as cinco cópias da linha que lê o cookie do web ────────────────
    // Mapa 2980-2988 (§k.1): cinco controllers duplicam
    // `const locale = cookies?.['NEXT_LOCALE'] === 'en-US' ? 'en' : 'pt-BR';`
    // e o NOME do cookie é definido no web (locales.ts:4) e duplicado como
    // string crua na API — a acoplagem é invisível ao compilador. Sem i18n
    // essas cinco linhas leem um cookie que ninguém escreve e degradam em
    // silêncio para 'pt-BR': mina, não quebra. Cada costura come as DUAS linhas
    // (a leitura de `cookies` e o ternário) porque a variável local fica sem uso.
    {
      file: 'apps/api/src/modules/auth/auth.controller.ts',
      kind: 'replace',
      pattern:
        "const\\s+cookies\\s*=\\s*\\(req as ReqWithCookies\\)\\.cookies;\\s*const\\s+locale\\s*=\\s*cookies\\?\\.\\['NEXT_LOCALE'\\][^;]*;",
      replacement: "const locale = '{{i18n.emailLocale}}';",
      reason:
        'Mapa 2982 (auth.controller.ts:42): fixa o idioma de e-mail em vez de derivá-lo de um cookie que o projeto gerado nunca escreve. `ReqWithCookies` permanece em uso neste arquivo (refresh/logout leem REFRESH_COOKIE), então o alias de tipo NÃO sai.',
    },
    {
      file: 'apps/api/src/modules/auth/oauth/oauth.controller.ts',
      kind: 'replace',
      pattern:
        "const\\s+cookies\\s*=\\s*\\(req as ReqWithCookies\\)\\.cookies;\\s*const\\s+locale\\s*=\\s*cookies\\?\\.\\['NEXT_LOCALE'\\][^;]*;",
      replacement: "const locale = '{{i18n.emailLocale}}';",
      required: false,
      reason:
        'Mapa 2983 (oauth.controller.ts:53). `required: false` porque o arquivo só existe com a feature `oauth`. `ReqWithCookies` continua usado (OAUTH_STATE_COOKIE, linha 131).',
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'replace',
      pattern:
        "const\\s+cookies\\s*=\\s*\\(req as ReqWithCookies\\)\\.cookies;\\s*const\\s+locale\\s*=\\s*cookies\\?\\.\\['NEXT_LOCALE'\\][^;]*;",
      replacement: "const locale = '{{i18n.emailLocale}}';",
      reason:
        "Prosa que descreve feature ausente. Num repo cujo `CLAUDE.md` \u00e9 dirigido a agentes de IA, documenta\u00e7\u00e3o de c\u00f3digo que n\u00e3o est\u00e1 ali n\u00e3o \u00e9 ru\u00eddo: \u00e9 instru\u00e7\u00e3o errada com a autoridade do arquivo oficial. Proven\u00e2ncia: Mapa 2984 (users.controller.ts:51).",
    },
    {
      file: 'apps/api/src/modules/users/users.controller.ts',
      kind: 'dropLinesMatching',
      pattern: 'type\\s+ReqWithCookies\\s*=\\s*FastifyRequest\\s*&',
      reason:
        'Neste controller (linha 36) o alias `ReqWithCookies` tem um único uso — a leitura do cookie de locale, que a costura anterior eliminou. Alias sem uso quebra o lint do projeto gerado.',
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.controller.ts',
      kind: 'replace',
      pattern:
        "const\\s+cookies\\s*=\\s*\\(req as ReqWithCookies\\)\\.cookies;\\s*const\\s+locale\\s*=\\s*cookies\\?\\.\\['NEXT_LOCALE'\\][^;]*;",
      replacement: "const locale = '{{i18n.emailLocale}}';",
      required: false,
      reason:
        'Mapa 2986 (invitations.controller.ts:47). `required: false`: arquivo só existe com a feature `invitations`.',
    },
    {
      file: 'apps/api/src/modules/invitations/invitations.controller.ts',
      kind: 'dropLinesMatching',
      pattern: 'type\\s+ReqWithCookies\\s*=\\s*FastifyRequest\\s*&',
      required: false,
      reason:
        'Como em users.controller.ts, o alias (linha 23) tinha uso único na leitura do locale. `required: false` pelo mesmo motivo da costura anterior.',
    },
    {
      file: 'apps/api/src/modules/invitations/public-invitations.controller.ts',
      kind: 'replace',
      pattern:
        "const\\s+cookies\\s*=\\s*\\(req as ReqWithCookies\\)\\.cookies;\\s*const\\s+locale\\s*=\\s*cookies\\?\\.\\['NEXT_LOCALE'\\][^;]*;",
      replacement: "const locale = '{{i18n.emailLocale}}';",
      required: false,
      reason:
        'Mapa 2985 (public-invitations.controller.ts:43). `required: false`: arquivo só existe com `invitations`. `ReqWithCookies` segue em uso (linhas 68-72).',
    },

    // ── API · mailLocale() na criação de empresa pelo painel ─────────────────
    {
      file: 'apps/api/src/modules/platform/services/platform-tenants.service.ts',
      kind: 'replace',
      pattern:
        "return locale\\.toLowerCase\\(\\)\\.startsWith\\('en'\\)\\s*\\?\\s*'en'\\s*:\\s*'pt-BR';",
      replacement: "return '{{i18n.emailLocale}}';",
      required: false,
      reason:
        'Mapa 2777-2782 e 3002 (platform-tenants.service.ts:56-62, chamado em :253): `mailLocale()` estreita o `Tenant.locale` BCP-47 livre para um idioma com template. Com um idioma só a resposta é constante — e o spec :357-361 assere justamente "locale `en-GB` → `en`", então o apply.ts precisa reescrever ou remover esse caso. `required: false`: arquivo só existe com a feature `platform`.',
    },

    // ── docs ────────────────────────────────────────────────────────────────
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: 'arquivos,\\s*i18n,\\s*temas',
      replacement: 'arquivos, temas',
      reason:
        'Mapa 2952 (§h, CLAUDE.md linha 5): a frase de apresentação lista i18n entre o que "vem de fábrica". Num projeto de idioma único isso é falso e é a primeira coisa que um agente de IA lê.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern: ',\\s*paridade de chaves i18n',
      replacement: '',
      reason:
        'Mapa 2953 (§h, CLAUDE.md linha 520, seção `## Testes`): o bullet do frontend promete um teste de paridade de chaves i18n que foi apagado junto com `messages.test.ts`.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'RBAC,\\s*i18n\\s*e\\s*testes',
      replacement: 'RBAC e testes',
      reason: 'Mapa 2956 (§h, README linha 12): o blurb do badge.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'arquivos,\\s*i18n,\\s*temas',
      replacement: 'arquivos, temas',
      reason: 'Mapa 2957 (§h, README linha 57): frase de features em PT.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: '\\s*\\+\\s*next-intl',
      replacement: '',
      reason:
        'Mapa 2958 e 2962 (§h, README linhas 63 e 358): a linha de stack, em PT e em EN, credita `next-intl`. ATENÇÃO: a substituição precisa valer para TODAS as ocorrências — o README é bilíngue e a mesma linha aparece duas vezes.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '-\\s*\\*\\*i18n\\*\\*\\s*—\\s*pt-BR \\+ en-US com seletor',
      reason: 'Mapa 2959 (§h, README linha 81): o bullet de feature i18n, em PT, sai inteiro.',
    },
    {
      file: 'README.md',
      kind: 'dropLinesMatching',
      pattern: '-\\s*\\*\\*i18n\\*\\*\\s*—\\s*pt-BR \\+ en-US with an SVG flag switcher',
      reason: 'Mapa 2963 (§h, README linha 376): o mesmo bullet, em EN.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: ',\\s*paridade de\\s+chaves i18n',
      replacement: '',
      reason:
        'Mapa 2960 (§h, README linha 299): a frase quebra de linha entre "paridade de" e "chaves i18n", por isso o `\\s+` no meio do padrão.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: 'i18n,\\s*theming',
      replacement: 'theming',
      reason: 'Mapa 2961 (§h, README linha 353): frase de features em EN.',
    },
    {
      file: 'README.md',
      kind: 'replace',
      pattern: ',\\s*i18n key\\s+parity',
      replacement: '',
      reason:
        'Mapa 2964 (§h, README linha 597): bullet de testes em EN; também quebra linha entre "key" e "parity".',
    },
  ],

  /**
   * Mapa 2925-2934 (§f): `NEXT_PUBLIC_DEFAULT_LOCALE` é a única variável de
   * ambiente da feature — e está **MORTA HOJE**: nenhum leitor em `apps/`,
   * `packages/`, `docker-compose*.yml` ou `Dockerfile.*`. O default real é o
   * `defaultLocale: Locale = 'pt-BR'` hardcoded em `i18n/locales.ts:3`, que
   * este manifesto apaga. É exatamente a armadilha que o CLAUDE.md 558-570
   * descreve: um `NEXT_PUBLIC_*` que parece autoritativo e não é.
   *
   * `apps/api/src/config/env.ts` não tem NENHUMA variável de locale/i18n
   * (confirmado por grep de LOCALE/intl no mapa 2932-2934).
   */
  envKeys: ['NEXT_PUBLIC_DEFAULT_LOCALE'],

  /**
   * Mapa 2975-2979 (§i): NADA se torna dependência sem uso no nível (i).
   * `next-intl@^4.14.3` (apps/web/package.json:36) CONTINUA usado por 50
   * componentes, `request.ts`, `layout.tsx` e `next.config.ts`. Removê-lo é o
   * nível (ii), que o mapa veta para a v1. `@radix-ui/react-dropdown-menu` e
   * `lucide-react` sobrevivem porque `user-menu.tsx` e `theme-toggle.tsx`
   * também os usam.
   */
  deps: [],

  /** Nenhum serviço de docker-compose tem relação com i18n. */
  composeServices: [],

  /**
   * Mapa 2954-2955 (§h): **não existe seção dedicada a i18n no CLAUDE.md**.
   * As duas menções (linha 5 e linha 520) são podas por bullet e estão em
   * `seams`. Nenhum heading é apagado inteiro.
   */
  docSections: [],

  /**
   * Mapa 2991-2995 (§j) e 4983 (inventário de fragmentos): i18n contribui
   * **zero SQL**. As colunas `tenants.locale` / `currency` / `timezone` e
   * `plans.currency` são DDL AUTO gerada pelo Prisma e pertencem a
   * `multi-tenancy`. Nenhuma tabela, índice, enum ou política de RLS é de i18n.
   */
  sqlFragments: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// F9 · multi-tenancy — modo single-tenant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ATENÇÃO — `multiTenant: false` **ESCONDE E SEMEIA. NÃO ARRANCA.**
 *
 * Vinculante: `docs/decisions/0002-single-tenant-esconde-nao-arranca.md`.
 * Multi-tenancy não é um módulo, é o modelo de acesso a dados: RLS no Postgres,
 * `SET LOCAL` por request, `prisma.db` carregando escopo, `TenantContext`,
 * `tenantId` denormalizado em `oauth_accounts`, `pg_advisory_xact_lock` do
 * `PlanLimitsService`. Aparece em 32 dos 126 arquivos da API.
 *
 * **ZERO LINHA da máquina de isolamento se move.** O mapa (3016-3021) explica
 * por quê: a máquina nunca pergunta "quantos tenants existem?", ela pergunta
 * "qual é o escopo deste request?" — e com um tenant essa pergunta ainda tem
 * resposta (`tid` do JWT). Por isso este manifesto **não tem** e não pode ter
 * `deletePaths` cobrindo `apps/api/src/infra/tenancy/**` ou
 * `apps/api/src/infra/prisma/**` (mapa 3024-3062 lista o inventário intocável,
 * arquivo por arquivo e linha por linha).
 *
 * O que muda: (a) um tenant fixo semeado com id conhecido, (b) escopo sempre
 * aberto nele, (c) seletor de empresa / painel `/platform` / telas de gestão de
 * tenant fora da UI, (d) `SUPERADMIN` fora do seed, (e) signup público forçado
 * a `false` nas duas metades.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ARMADILHA I13 (mapa linha 5234 e §3.1 em 3177-3184) — LEIA ANTES DE "SIMPLIFICAR"
 * ───────────────────────────────────────────────────────────────────────────
 * A "simplificação óbvia" em modo single-tenant é: só há um tenant, então pare
 * de pôr `tid` no JWT e pare de derivar escopo. Resultado:
 * `TenantScopeInterceptor:47-56` calcula `user.tenantId ? … : null`, recebe
 * `null`, chama `next.handle()` **sem abrir transação com escopo**, e
 * `PrismaService.db` (147-151) cai no cliente base sem escopo. Sob
 * `FORCE ROW LEVEL SECURITY`, com `app.tenant_visible()` devolvendo false para
 * um setting NULL, **toda query devolve zero linhas e nenhum erro**. A aplicação
 * parece um banco vazio.
 *
 * Por isso:
 *  - **NÃO TOQUE** em `apps/api/src/modules/auth/services/token.service.ts:111`
 *    (`tid: user.tenantId ?? null`). É a única entrada do interceptor.
 *  - **NÃO TOQUE** no `throw` de `TenantContext.requireTenantId()`
 *    (`apps/api/src/infra/tenancy/tenant-context.ts:39-47`). Devolver um id fixo
 *    ali faria `tenantWhere()` (tenant-crud.ts:34-36) e `TenantCrud.create`
 *    (132-140) terem sucesso FORA de qualquer escopo — e, no dia em que um
 *    segundo tenant existir (o modo single-tenant deixa a máquina capaz disso),
 *    esse default vira escrita cross-tenant.
 *
 * Nenhuma costura deste manifesto toca esses dois arquivos. Se alguém adicionar
 * uma, este comentário é o motivo para recusar o PR.
 */
export const multiTenantManifest: FeatureManifest = {
  id: 'multiTenant',
  label: 'Multi-tenancy (multi-empresa)',
  summary:
    'Várias empresas isoladas por Row Level Security. Desligar NÃO remove o RLS: gera modo single-tenant — um tenant fixo no seed, escopo sempre aberto nele, telas de plataforma e criação de empresa fora da UI.',

  // Sem `requires`: multi-tenancy não depende de nenhuma outra feature — é a
  // espinha. As arestas são no sentido INVERSO (`platform` e `publicSignup`
  // exigem `multiTenant`) e pertencem aos manifestos daquelas features.
  // Ver o relatório: o resolvedor do CLI é quem força platform/publicSignup off.

  /**
   * VAZIO DE PROPÓSITO. ADR 0002 e mapa 3013-3022: nenhum arquivo de isolamento
   * é apagado. As superfícies que somem em modo single-tenant —
   * `apps/api/src/modules/platform/**`, `apps/api/src/modules/auth/services/signup.service.ts`,
   * `apps/web/src/app/platform/**`, `apps/web/src/components/platform/**`,
   * `apps/web/src/app/(auth)/signup/**` — são apagadas pelos manifestos de
   * `platform` (F5) e `publicSignup` (F12), que ficam desligados por dependência.
   * Duplicá-las aqui faria o segundo manifesto falhar em arquivo já inexistente.
   *
   * E o que explicitamente **NÃO** é apagado, contra a intuição:
   *  - `apps/api/src/modules/tenants/**` — é a empresa gerindo a si mesma
   *    (`GET/PATCH /tenants/me`, branding, plano): num produto single-tenant
   *    isso se chama "Configurações". Não renomeie a rota; renomear quebra o
   *    contrato compartilhado (mapa 3043).
   *  - `tenant-provisioning.ts` — o seed chama o mesmo caminho, e é o que
   *    impede seed e provisionamento de divergirem (mapa 3044).
   *  - `apps/web/src/components/tenant/tenant-gate.tsx` — armadilha 3.7
   *    (mapa 3271-3275): UM tenant ainda pode ser SUSPENDED/CANCELED e o
   *    `TenantStatusGuard` ainda 403a a API inteira. Transformar o gate em
   *    no-op pinta o shell enquanto todo request falha.
   *  - `apps/api/test/tenant-isolation.e2e-spec.ts` — armadilha 3.6
   *    (mapa 3258-3268): é o ÚNICO teste que prova que a role restrita está
   *    realmente em uso; `assertNotSuperuser` apenas avisa fora de produção.
   */
  deletePaths: [],

  /**
   * Nenhuma mudança de Prisma. ADR 0002 ("Consequências"): o projeto gerado
   * carrega a coluna `tenantId` e uma política de RLS que sempre avalia true —
   * custo de uma coluna indexada e um predicado resolvido por constante.
   * Arrancar significaria manter duas versões de todo acesso a dados, e a
   * versão sem RLS é justamente a que não podemos provar segura.
   */

  seams: [
    // ── signup público: desligado nas DUAS metades ───────────────────────────
    // Armadilha 3.9 (mapa 3276-3280): `signup.service.ts:38-48` explica que a
    // metade da API é autoritativa e a do web só decide se o formulário
    // renderiza. Escrever uma e não a outra produz formulário que 403a em todo
    // submit. Em modo single-tenant signup público não pode existir: signup É
    // criação de empresa.
    {
      file: '.env.example',
      kind: 'replace',
      pattern: '(?<!NEXT_)PUBLIC_SIGNUP_ENABLED\\s*=\\s*true',
      replacement: 'PUBLIC_SIGNUP_ENABLED=false',
      required: false,
      reason:
        'Mapa 3035 (.env.example:164). O lookbehind `(?<!NEXT_)` é obrigatório: sem ele o padrão também casa `NEXT_PUBLIC_SIGNUP_ENABLED` e as duas metades viram uma. `required: false` porque o manifesto de `publicSignup` pode ter removido a chave inteira antes.',
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern: 'NEXT_PUBLIC_SIGNUP_ENABLED\\s*=\\s*true',
      replacement: 'NEXT_PUBLIC_SIGNUP_ENABLED=false',
      required: false,
      reason:
        'Mapa 3036 (.env.example:282) e armadilha 3.9: a metade do web tem de concordar, ou o formulário renderiza e todo submit responde 403 (`signup.service.ts:38-48`). `required: false` pelo mesmo motivo da costura anterior.',
    },
    {
      file: '.env.example',
      kind: 'replace',
      pattern:
        '#\\s*PUBLIC_SIGNUP_ENABLED decides whether a stranger[\\s\\S]*?#\\s*every submit answers 403 for a route that is turned off\\.',
      replacement: [
        '# Single-tenant installation: public signup cannot exist here, because',
        '# signup IS company creation and this product has exactly one company.',
        '# Both halves are off and both must stay off; flipping the API half back',
        '# on would re-open tenant creation on a product whose owner was told',
        '# there is only one tenant.',
        '#',
        '# The only doors to a first user are the seed and an invitation from an',
        '# already-authenticated admin. Run the seed or nobody can log in.',
      ].join('\n'),
      required: false,
      reason:
        'Mapa 3035 manda reescrever o comentário de 155-163: ele hoje apresenta `true` como "o comportamento que um clone sempre teve" e explica como religar — instrução ativamente errada num projeto single-tenant, e é comentário de .env que operador lê antes de decidir.',
    },
    {
      file: 'apps/api/src/config/env.ts',
      kind: 'replace',
      pattern: 'PUBLIC_SIGNUP_ENABLED:\\s*boolish\\(true\\)',
      replacement: 'PUBLIC_SIGNUP_ENABLED: boolish(false)',
      required: false,
      reason:
        'Mapa 3037 (env.ts:123): o default do schema Zod precisa concordar com o `.env.example`, senão um deploy sem a variável religa a criação de empresa. `required: false` porque `publicSignup` pode ter removido a chave.',
    },

    // ── seed: o tenant fixo e a saída do SUPERADMIN ──────────────────────────
    // Armadilha 3.5 (mapa 3253-3257): apagar o painel `/platform` sem apagar o
    // SUPERADMIN do seed cria uma conta que passa o JwtAuthGuard, é liberada
    // pelo `TenantStatusGuard:55` e recebe `{kind:'platform'}` do
    // `TenantScopeInterceptor:48-49` — um escopo que atravessa tenants, numa
    // conta sem UI que a constranja, num produto cujo dono ouviu "só existe um
    // tenant". Todas as costuras do seed são `required: false` porque o
    // manifesto de `platform` (F5) pode reivindicar as mesmas linhas.
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropBlock',
      block: {
        start: '//\\s*The platform operator\\.',
        end: '\\}\\);',
      },
      required: false,
      reason:
        'Mapa 3162 (seed.ts:40-50) + armadilha 3.5: o upsert do usuário `role: SUPERADMIN` SEM `tenantId` — exatamente a forma que o `TenantScopeInterceptor:52-54` recusa, então mantê-lo cria conta que loga e não vê nada (ou pior, atravessa empresas). O `end` casa o primeiro `});` depois do bloco, que é o fecho do upsert.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropLinesMatching',
      pattern: 'const\\s+SUPERADMIN_EMAIL\\s*=',
      required: false,
      reason:
        'A constante (seed.ts:15) tinha dois usos: o upsert removido acima e o console.log removido abaixo. Constante sem uso quebra o lint do projeto gerado.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'dropLinesMatching',
      pattern: 'console\\.log\\(.*Seeded platform operator',
      required: false,
      reason:
        'seed.ts:101 imprime credencial de um operador de plataforma que não existe mais — e imprimir credencial de conta inexistente é o tipo de saída que faz alguém procurar a tela correspondente por uma hora.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'insertBefore',
      pattern: 'const\\s+PASSWORD\\s*=',
      replacement: [
        '// The one tenant this installation will ever have. The id is fixed so the',
        '// seed is referenceable and re-runnable; the upsert below keys on `slug`,',
        '// so re-seeding stays idempotent either way.',
        "const SINGLE_TENANT_ID = '00000000-0000-4000-8000-000000000001';",
      ].join('\n'),
      reason:
        'ADR 0002 pede "um tenant fixo criado no seed, com id conhecido"; mapa 3164 diz "emit the id deterministically if the generator wants it referenceable". UUID v4-shaped porque `Tenant.id` é `@default(uuid()) @db.Uuid` (tenancy.prisma:47) — um id fora do formato UUID é recusado pelo Postgres, não pelo Prisma.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: 'create:\\s*\\{\\s*slug:',
      replacement: 'create: {\n      id: SINGLE_TENANT_ID,\n      slug:',
      reason:
        'Mapa 3164 (seed.ts:53-63): fixa o id do tenant único. O padrão `create: { slug:` é exclusivo do upsert de Tenant — o do Plan abre com `code:`, os de Profile com `tenantId:` e os de User com `email:`.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: '//\\s*One demo company, so a fresh clone has something to log into\\.',
      replacement:
        '// The single tenant of this installation. `status: ACTIVE` on purpose:\n  // there is no trial to expire, and TenantGate/TenantStatusGuard still\n  // enforce SUSPENDED/CANCELED if the operator ever sets one.',
      reason:
        'Mapa 3163-3164: o comentário chama a linha de "empresa de demonstração", o que num produto single-tenant descreve errado a única linha que o produto tem — e convida o próximo leitor a apagá-la.',
    },
    {
      file: 'apps/api/prisma/seed.ts',
      kind: 'replace',
      pattern: '`isDefault`\\s*is what a public signup lands on\\.',
      replacement:
        'With public signup closed,\n  // `isDefault` is simply the plan the seed attaches to the single tenant.',
      required: false,
      reason:
        'Mapa 3161 (seed.ts:21): sem signup público a frase descreve um caminho que não existe. `required: false` porque o bloco do Plan sai inteiro junto com a feature `plans`.',
    },

    // ── CLAUDE.md · a seção de multi-tenancy é REESCRITA, nunca apagada ──────
    // Mapa 3123-3155: o mapa lista explicitamente o que REESCREVER e o que
    // MANTER VERBATIM. As linhas 3141-3155 enumeram os parágrafos de segurança
    // que single-tenant não muda — incluindo o callout "Para agentes de IA"
    // (83-86), "Sem escopo nenhum, nada é visível" (96-97), "`tenantId` nunca
    // vem do cliente" (101-102), "use `this.prisma.db`" (103-104), o parágrafo
    // do `DATABASE_URL`/role restrita (105-109, "o parágrafo mais importante
    // para um projeto gerado"), o de guards-antes-de-interceptors com a
    // anedota do TwoFactorGateGuard (110-115), `app.apply_tenant_rls()`
    // (116-118), "a suíte e2e roda sob a role restrita" (123) e "sem perfil,
    // nada" (135). Por isso `docSections` está VAZIO e tudo aqui é poda por
    // bullet.
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '##\\s*Multi-tenancy\\s*—\\s*o isolamento é do Postgres, não da aplicação',
      replacement:
        '## Multi-tenancy — o isolamento é do Postgres, não da aplicação\n\n> **Modo single-tenant:** este projeto foi gerado com um tenant fixo. O\n> isolamento continua **ligado** — RLS, `SET LOCAL`, `prisma.db`, tudo de pé.\n> Não é decoração: é o que impede que a coluna `tenantId` vire opcional na\n> cabeça de alguém no dia em que um segundo tenant aparecer.',
      reason:
        'Mapa 3127-3128 (CLAUDE.md:81): sem este aviso o leitor de um projeto single-tenant conclui que a máquina de RLS é resíduo e começa a "limpar" — e a primeira limpeza é o `tid` do JWT (armadilha I13).',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '\\|\\s*`platform`\\s*\\|\\s*`SUPERADMIN`, no painel `/platform`\\s*\\|\\s*atravessa empresas\\s*\\|',
      replacement:
        '| `platform` | `SUPERADMIN` — painel **não emitido** em single-tenant | atravessa empresas |',
      reason:
        'Mapa 3129-3130 (CLAUDE.md:93): a tabela dos três escopos aponta para um painel `/platform` que não existe no projeto gerado. Doc que descreve tela inexistente manda o leitor procurar o arquivo.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '\\|\\s*`system`\\s*\\|\\s*caminho de autenticação e signup\\s*\\|',
      replacement: '| `system`   | caminho de autenticação (e aceite de convite)      |',
      reason:
        'Mapa 3131-3132 (CLAUDE.md:94): signup não existe em single-tenant, então o escopo `system` cobre apenas autenticação e o aceite de convite. Listar signup mantém viva a ideia de que existe uma porta para criar empresa.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        'Existe porque autenticar alguém exige encontrá-lo\\s*\\n?\\s*pelo e-mail antes de saber a empresa, e registrar empresa nova acontece quando ainda não há\\s*\\n?\\s*tenant\\.',
      replacement:
        'Existe porque autenticar alguém exige encontrá-lo\n  pelo e-mail antes de saber a empresa.',
      reason:
        'Mapa 3133-3135 (CLAUDE.md:119-122): a segunda justificativa ("registrar empresa nova") deixa de existir em single-tenant. Manter uma justificativa morta para `@SystemScope()` é exatamente como a exceção se alarga — e o teste de allowlist (`system-scope.decorator.spec.ts:29-75`) é o que cobra a conta.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        '\\*\\*SUPERADMIN não passa\\*\\* em rota de negócio\\.',
      replacement:
        '**SUPERADMIN não passa** em rota de negócio — e em modo single-tenant o painel de plataforma nem é emitido, nem há SUPERADMIN no seed.',
      reason:
        'Mapa 3136-3138 (CLAUDE.md:132-134): o bullet da seção `### Permissões` explica onde o SUPERADMIN entra, apontando para `/api/platform/*` e `/platform`, que não são emitidos. O resto do bullet (ADMIN passa sempre; sem perfil, nada) continua verbatim.',
    },
    {
      file: 'CLAUDE.md',
      kind: 'replace',
      pattern:
        'Quem entra e por onde:\\s*\\*\\*signup público\\*\\*\\s*\\(opcional,\\s*`PUBLIC_SIGNUP_ENABLED`\\),\\s*\\*\\*convite\\*\\*',
      replacement:
        'Quem entra e por onde: **o seed** — que cria o tenant único e o primeiro admin — e **convite**',
      reason:
        'Mapa 3139-3140 (CLAUDE.md:75-77) + armadilha 3.8 (mapa 3269-3272): com signup fora, `provisionTenant` só alcançável pelo seed e convite exigindo um convidador autenticado, um projeto single-tenant que nunca rodou o seed tem ZERO usuários e nenhuma forma de criar um. Isso tem de estar no texto, não numa nota de pé.',
    },
  ],

  /**
   * VAZIO. `PUBLIC_SIGNUP_ENABLED` e `NEXT_PUBLIC_SIGNUP_ENABLED` **não são
   * removidas** — são viradas para `false` (costuras acima). A diferença
   * importa: chave ausente cai no default do schema Zod
   * (`env.ts:123 boolish(true)`), o que RELIGARIA a criação de empresa.
   * Remover a chave e o default juntos é decisão do manifesto de `publicSignup`.
   */
  envKeys: [],

  /**
   * VAZIO. Nada se torna dependência sem uso: a máquina de isolamento é
   * `@prisma/client` + `@prisma/adapter-pg` + PL/pgSQL, todos núcleo. Não há
   * pacote npm exclusivo de multi-tenancy.
   */
  deps: [],

  /**
   * VAZIO. Postgres é sempre emitido — é onde o RLS mora. Redis, MinIO e
   * Mailpit pertencem a cache/queue, storage e mail (mapa 213-215).
   */
  composeServices: [],

  /**
   * VAZIO, e isto é o coração da ADR 0002. A seção `## Multi-tenancy` do
   * CLAUDE.md (linhas 81-148) é **REESCRITA, não apagada** — mapa 3123-3155
   * lista nove parágrafos que devem sair **verbatim** no projeto gerado, entre
   * eles o callout "Para agentes de IA", o parágrafo do `DATABASE_URL`/role
   * restrita e o de guards-antes-de-interceptors. Apagar a seção entregaria um
   * projeto com RLS ligado e sem uma linha explicando por quê — o modo mais
   * barato de alguém apontar o `DATABASE_URL` para o dono do banco.
   * As reescritas por bullet estão em `seams`.
   */
  docSections: [],

  /**
   * VAZIO — e o comentário é a parte importante.
   *
   * Mapa 4971: multi-tenancy possui **`rls-00-schema`, `rls-01-context-readers`,
   * `rls-02-sweep-function`, `rls-03-user-owned-function`, `rls-04-profile-children`,
   * `rls-06-sweep-call`, `role-00-create`, `role-01-grants`,
   * `role-02-revoke-migrations`** — 18 das 22 instruções MANUAIS da baseline,
   * mais as tabelas AUTO `tenants`/`tenant_branding`/`tenant_parameters`/
   * `profiles`/`permissions` e as colunas/índices/FKs `tenantId` em `users`,
   * `audit_logs` e `legal_acceptances`. É o conjunto em torno do qual a
   * baseline inteira é organizada, e o mapa o marca "Not removable".
   *
   * Em modo single-tenant **TODOS continuam emitidos**, na ordem canônica do
   * mapa 4916-4925, com `rls-06-sweep-call` como **último DDL** da baseline
   * (regra global 4, mapa 64-68): tabela criada depois da varredura não recebe
   * política, não recebe `FORCE ROW LEVEL SECURITY` e — por causa do
   * `ALTER DEFAULT PRIVILEGES` do `role-01` — fica com DML completo para a role
   * da aplicação. Uma aplicação que funciona com uma tabela silenciosamente
   * sem isolamento.
   *
   * `sqlFragments` descreve o que SAI da baseline quando a feature sai. Nada
   * sai. Daí a lista vazia — não é omissão.
   */
  sqlFragments: [],
};
