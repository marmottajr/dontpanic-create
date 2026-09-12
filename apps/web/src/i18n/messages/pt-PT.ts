import type { Messages } from './types';

/**
 * Português europeu.
 *
 * Não é o pt-BR com outra ortografia: muda o léxico técnico — utilizador, ficheiro,
 * base de dados, palavra-passe, registo, predefinição, equipa — e muda a construção
 * verbal (“está a correr”, não “está rodando”). Traduzir só os acentos produziria um
 * texto que um leitor de Lisboa identifica como brasileiro na segunda linha, o que é
 * pior que não oferecer o idioma.
 */
export const ptPT: Messages = {
  meta: {
    title: 'DontPanic — o boilerplate SaaS com as decisões de segurança já tomadas',
    description:
      'Gere um SaaS full-stack em NestJS e Next.js com multi-tenancy por Row Level Security, 2FA, convites e início de sessão social. As decisões que uma IA erra em silêncio já vêm tomadas, documentadas e testadas.',
  },

  nav: {
    skipToContent: 'Ir para o conteúdo',
    proof: 'A prova',
    configure: 'Montar o comando',
    how: 'Como funciona',
    inside: 'O que vem dentro',
    faq: 'Perguntas',
    repo: 'Repositório',
    languageLabel: 'Idioma',
    themeLabel: 'Tema',
    themeLight: 'Claro',
    themeDark: 'Escuro',
    themeSystem: 'Sistema',
  },

  hero: {
    mastheadLabel: 'Don’t Panic',
    title:
      'As decisões de segurança que uma IA erra em silêncio vêm já tomadas, documentadas e testadas.',
    lead: 'O DontPanic é um boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres com Row Level Security a sério. Cada escolha de segurança já foi feita, está explicada no `CLAUDE.md` que o seu agente lê antes da primeira linha, e tem teste que falha quando alguém a desfaz. De caminho, o contexto é gasto no seu produto em vez de redescobrir como se faz refresh token com rotação.',
    commandLabel: 'Comando da predefinição padrão',
    commandNote:
      'Precisa de Node 24 e pnpm. Para escolher as partes, monte o seu comando mais abaixo.',
    ctaConfigure: 'Montar o meu comando',
    ctaProof: 'Ver os erros que isto evita',
    facts: [
      {
        value: '78 533',
        label: 'linhas de TypeScript que compilam, passam no lint e passam nos testes',
      },
      { value: '5', label: 'recursos substituíveis por variável de ambiente, sem tocar na lógica' },
      {
        value: '2 min',
        label: 'do npx ao `pnpm dev`, com a base de dados migrada e o admin semeado',
      },
    ],
  },

  proof: {
    title: 'A prova',
    lead: 'Nada aqui é hipotético. São erros que produzem código que compila, passa no teste e passa no code review — e que aparecem meses depois, num utilizador que não é você. Cada um está decidido no boilerplate, com o motivo escrito ao lado da decisão.',
    labels: {
      surface: 'Onde vive',
      code: 'O código que passa no review',
      whyItPasses: 'Porque ninguém o apanha',
      whatHappens: 'O que acontece',
      ours: 'No DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Casar a identidade social pelo endereço de e-mail',
        whyItPasses:
          'Compila, e funciona em todos os inícios de sessão do seu ambiente de desenvolvimento. O teste — que tem um utilizador só — passa. O review aprova, porque é assim que a maioria dos tutoriais de OAuth faz.',
        whatHappens:
          'Endereço da empresa é reciclado. A Ana sai, os recursos humanos devolvem `ana@empresa.pt` ao contratado seguinte, ele entra com o Google e **herda a conta da Ana**: histórico, permissões, tudo. Ninguém invadiu nada — o sistema fez exactamente o que estava escrito.',
        ours: 'A chave da identidade é o `providerAccountId` imutável — `sub` no Google e na Apple, o id numérico no GitHub — com `@@unique([provider, providerAccountId])`. O `email` em `oauth_accounts` é campo de apresentação e pode estar velho. E um endereço que o fornecedor não marcou como verificado não associa nada: o callback devolve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Emitir sessão no callback do OAuth sem verificar o segundo factor',
        whyItPasses:
          'O `TwoFactorGateGuard` existe e está registado. Ele verifica que o 2FA está *activado* — nunca que *esta* sessão passou por ele. O teste de 2FA cobre o fluxo de palavra-passe, e o fluxo de palavra-passe está correcto.',
        whatHappens:
          'Quem activou TOTP de propósito descobre que “entrar com o Google” nunca pede o código. O início de sessão social fica **estritamente mais fraco** que escrever a palavra-passe, e o segundo factor passa a ser opcional para quem souber em que botão clicar.',
        ours: 'Se `twoFactorEnabled`, o callback não emite sessão: cria o mesmo ticket que `POST /auth/login` criaria, entrega-o num cookie de cinco minutos e uso único, e redirecciona para `/login?twofactor=1`. Cookie e não query string — a query string entra no histórico do navegador, no header `Referer` e no log de todos os proxies do caminho.',
      },
      {
        id: 'trust-proxy',
        title: 'Activar `trustProxy: true` para resolver um 429 indevido',
        whyItPasses:
          'Resolve o sintoma de imediato: o rate limit volta a distinguir clientes, o 429 desaparece e o deploy sai com o problema resolvido. Nenhum teste apanha isto, porque um teste não forja headers.',
        whatHappens:
          "Confiar em todos os hops é aceitar qualquer `X-Forwarded-For` — e `X-Forwarded-For` **não** está na lista de forbidden headers do fetch, ou seja, o navegador pode defini-lo. Um `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipAleatorio() } })` recebe um balde novo a cada pedido, e o rate limit do início de sessão deixa de existir. Contar hops a partir da esquerda acaba no mesmo sítio: o load balancer faz append, logo em `X-Forwarded-For: <forjado>, <real>` o primeiro elemento é o que o atacante escreveu.",
        ours: '`CLIENT_IP_HEADER` e `CLIENT_IP_TRUSTED_HOPS`, contados **a partir da direita**. O BFF apaga todos os headers de forwarding vindos do navegador e reescreve um só, sanitizado. A predefinição é zero hops: não envia IP nenhum e trata todos os que estão atrás do proxy como um cliente só — limita demais, e não é contornável.',
      },
      {
        id: 'guard-scope',
        title: 'Ler a base de dados num guard, antes de o escopo de tenant existir',
        whyItPasses:
          'O Nest corre guards **antes** dos interceptors. Quando o guard executa, o interceptor que abre a transacção com `SET LOCAL` ainda não correu: `prisma.db` cai no cliente base, sem escopo, e a política de RLS devolve zero linhas. Não dá erro. Cobertura verde, 200 OK, nada nos logs.',
        whatHappens:
          'O guard conclui “este utilizador não tem 2FA” e **deixa passar**. Foi exactamente assim que o `TwoFactorGateGuard` do próprio DontPanic se tornou um no-op silencioso — o bug está no histórico do repositório, e a lição ficou escrita a seguir.',
        ours: 'Um guard que lê a base de dados abre escopo próprio, com `this.prisma.forTenant(tenantId, …)` ou `asPlatform`, e **falha fechado** quando a leitura vem vazia. A regra, com a história do bug ao lado, está na secção de multi-tenancy do `CLAUDE.md` — o ficheiro que o seu agente lê antes de escrever o próximo guard.',
      },
      {
        id: 'db-owner',
        title: 'Apontar a `DATABASE_URL` para o proprietário da base de dados',
        whyItPasses:
          'É o que o tutorial manda e é o utilizador que o `docker compose` do Postgres cria. Pior: os seus testes de isolamento passam, porque exercitam o filtro da aplicação — que está lá, e está certo.',
        whatHappens:
          'SUPERUSER — e qualquer role com `BYPASSRLS` — ignora Row Level Security mesmo com `FORCE ROW LEVEL SECURITY`. **Todas as políticas passam a ser decoração**, e o isolamento entre empresas passa a depender de nenhuma query esquecer um `where`, para sempre, em todo o código futuro.',
        ours: 'A aplicação liga-se com uma role restrita, criada `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; o proprietário fica apenas em `DATABASE_ADMIN_URL`, para `migrate` e `seed`. A API **recusa arrancar** em produção se detectar superuser. E a suíte e2e corre sob a role restrita — é isso que faz o `tenant-isolation.e2e-spec.ts` provar algo em vez de repetir a intenção do código.',
      },
    ],
    moreTitle: 'Mais três, pelo mesmo desenho',
    more: [
      'Enviar o e-mail de convite dentro da transacção. Um rollback entrega um link válido a apontar para uma empresa que não existe, e não fica registo para o suporte encontrar. Aqui, o `issue()` grava no `tx` de quem o chamou e o envio acontece depois do commit.',
      'Responder “esta conta usa início de sessão social” num login com palavra-passe. Torna-se um oráculo: é possível enumerar, cronometrando o formulário, exactamente quais endereços não têm palavra-passe. Aqui o erro é o genérico de sempre e paga o mesmo custo de Argon2 — o `verifyPassword(null, …)` verifica contra o hash de algo que ninguém conhece antes de responder `false`.',
      'Contar lugares antes de gravar o utilizador. Dois pedidos simultâneos leem “falta um” e ambos criam: contar não tranca nada. Aqui o `pg_advisory_xact_lock` por empresa e por recurso fica dentro da mesma transacção da escrita.',
    ],
  },

  configurator: {
    title: 'Monte o comando',
    lead: 'Nada é gerado aqui. Esta página monta uma string — o gerador vive no CLI, versionado junto com o template, e é ele que decide o que entra no seu repositório. Sem servidor, sem fila de build, sem zip para expirar em cache.',

    nameLegend: 'O nome do projecto',
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Como chama o produto. Tudo o resto é derivado daqui.',
    slugLabel: 'Slug',
    slugHelp: 'Directório, pacote npm e identificadores. Minúsculas, dígitos e hífen.',
    slugDerived: 'derivado do nome',
    slugCustom: 'personalizado',
    slugReset: 'Voltar ao derivado',
    applySuggestion: 'Usar',

    derivedTitle: 'O que esse nome se torna',
    derivedNote:
      'O rename não é um `sed` no nome da pasta: passa pelo SQL que cria a role do Postgres, pelo escopo do pnpm e por nomes de base de dados e de bucket ao mesmo tempo — onde o SQL recusa hífen e o S3 recusa sublinhado.',
    derivedLabels: {
      dbName: 'base de dados de dev',
      dbNameE2e: 'base de dados de e2e',
      dbRole: 'role restrita do Postgres',
      npmScope: 'escopo do pnpm',
      seedAdminEmail: 'admin do seed',
      bucket: 'bucket de object storage',
      screaming: 'prefixo de env',
      pascal: 'classes e tipos',
    },

    presetLegend: 'Ponto de partida',
    presetNote:
      'Uma predefinição é um conjunto de padrões. Tudo abaixo continua editável, e o comando mostra só o que mudou.',
    presetReset: 'Descartar as alterações desta predefinição',

    featuresLegend: 'O que entra',
    featuresNote:
      'O gerador subtrai: o template é o repositório real, que compila e corre, e desactivar uma feature apaga os ficheiros dela. Nada de `{{#if}}` no código.',
    groups: {
      access: 'Acesso',
      tenancy: 'Empresas',
      ops: 'Operação',
      extras: 'Extras',
    },

    driversLegend: 'Adapters',
    driversNote:
      'Trocar de fornecedor é trocar uma variável de ambiente — o domínio depende do port, não do fornecedor. Estas escolhas entram no `.env` do projecto gerado.',
    driverLabels: {
      db: 'Base de dados',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Fila',
      captcha: 'Captcha',
    },

    oauthLegend: 'Fornecedores de início de sessão social',
    oauthNote:
      'A API e o web têm de listar os mesmos nomes, senão o botão a mais dá 404. O gerador escreve os dois lados.',

    localesLegend: 'Idiomas do projecto',
    localesNote: 'Os idiomas do produto que vai gerar. Não têm relação com o idioma desta página.',
    defaultLocaleLabel: 'Idioma predefinido',

    optionsLegend: 'Na geração',
    optionLabels: {
      git: 'Correr `git init` e o primeiro commit',
      install: 'Correr `pnpm install` no fim',
      docker: 'Emitir `docker-compose.yml` com os serviços usados',
      force: 'Sobrescrever o directório de destino se já existir',
    },

    issuesTitle: 'Combinação incoerente',
    issueError: 'Impede a geração',
    issueWarning: 'Permitido, com reserva',
    noIssues: 'Combinação coerente.',

    commandTitle: 'O seu comando',
    commandNote: 'Isto é a configuração. Não existe outro sítio onde ela viva.',
    copy: 'Copiar comando',
    copied: 'Comando copiado',
    copyFailed: 'Não foi possível copiar — seleccione o texto e copie',
    flagsTitle: 'As flags',
    flagsNote: 'Só o que difere da predefinição. Remova uma para voltar ao padrão dela.',
    removeFlag: 'Remover',
    shareTitle: 'Link desta configuração',
    shareNote:
      'A configuração está no URL, legível. Envie no Slack e o colega entende o que é antes de abrir.',
    shareCopy: 'Copiar link',
    shareCopied: 'Link copiado',
    blockedByName: 'Corrija o nome antes de usar o comando.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolamento entre empresas no Postgres, por Row Level Security. Desactivado, o RLS fica: o projecto nasce com um tenant fixo e a troca de empresa fora da interface.',
      },
      twoFactor: {
        label: '2FA por TOTP',
        text: 'Segundo factor com aplicação autenticadora, códigos de recuperação e ticket de uso único entre a palavra-passe e a sessão.',
      },
      oauth: {
        label: 'Início de sessão social',
        text: 'Google, Apple e GitHub, activados por fornecedor. Identidade pelo `providerAccountId`, e o callback respeita o 2FA.',
      },
      invitations: {
        label: 'Convites',
        text: 'A porta para uma empresa que já existe: o convidado escolhe a própria palavra-passe, e o clique no link é o que prova o endereço.',
      },
      publicSignup: {
        label: 'Registo público',
        text: 'O formulário que deixa um desconhecido criar empresa e tornar-se o primeiro admin. Desactivado, sobram o convite e o seed.',
      },
      files: {
        label: 'Upload de ficheiros',
        text: 'Avatar e anexos por URL pré-assinado, atrás do port de storage: S3, MinIO, R2 ou disco local.',
      },
      platform: {
        label: 'Painel da plataforma',
        text: 'A área do SUPERADMIN em `/platform`: cria a empresa, convida o primeiro admin e atravessa tenants com escopo próprio.',
      },
      audit: {
        label: 'Trilho de auditoria',
        text: 'Quem fez o quê, gravado fora da transacção do pedido para não desaparecer com um rollback.',
      },
      plans: {
        label: 'Planos e limites',
        text: '`maxUsers` e contadores nomeados por empresa, com advisory lock por recurso — contar antes de gravar não bloqueia nada.',
      },
      i18n: {
        label: 'Internacionalização',
        text: 'Mensagens por idioma nos dois lados, com teste de paridade de chaves entre os ficheiros de tradução.',
      },
      queue: {
        label: 'Fila de jobs',
        text: 'BullMQ no Redis, com worker em processo separado. O tenant viaja com o job: sem ele o RLS devolve zero linhas e o job mente que correu bem.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile ou reCAPTCHA nas rotas que adivinham segredo, a falhar fechado quando o fornecedor cai.',
      },
      easterEggs: {
        label: 'Piadas do Guia',
        text: 'A voz do Marvin nas margens, `GET /teapot` a devolver 418 e o Konami no dashboard. Nunca numa mensagem de segurança.',
      },
      scaffolding: {
        label: 'Blocos de construção',
        text: 'Grelha de registos, cartões de dashboard e `sequence.service.ts`: prontos, testados e importados por nada — o ponto de partida dos seus ecrãs de CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Mínimo',
        summary: 'Palavra-passe, multi-tenancy com RLS e a suíte de testes. Nada além disso.',
        audience:
          'Para quem vai construir o produto inteiro e só quer a base de acesso já provada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multi-empresa a sério: convites, planos com limite de lugares, 2FA, início de sessão social e fila durável.',
        audience:
          'Para produto vendido por subscrição, com mais de uma empresa cliente na mesma base de dados.',
      },
      complete: {
        label: 'Completo',
        summary: 'O boilerplate inteiro, sem subtrair nada — incluindo o Marvin.',
        audience: 'Para ver tudo a funcionar antes de decidir o que remover.',
      },
      internal: {
        label: 'Interno',
        summary:
          'Uma empresa só e nenhuma porta pública: entra quem foi convidado, com 2FA e auditoria.',
        audience: 'Para ferramenta de equipa, back-office ou ERP que nunca vai ter registo aberto.',
      },
    },
  },

  how: {
    title: 'Como funciona',
    lead: 'Quatro passos, e só o terceiro demora.',
    steps: [
      {
        title: 'Escolha as partes',
        body: 'Uma predefinição como ponto de partida e os toggles por cima. O URL guarda a escolha, portanto é possível enviar o link a quem decide em conjunto antes de correr o que seja.',
      },
      {
        title: 'Copie o comando',
        body: 'A página não gera nada: monta a string. É o CLI, versionado junto com o template, que decide o conteúdo do seu repositório — por isso a mesma receita produz o mesmo projecto hoje e dentro de dois anos.',
      },
      {
        title: 'Corra o npx',
        body: 'O gerador copia o template, apaga o que não pediu, poda o schema do Prisma, monta a baseline do SQL, troca o nome em todas as formas, escreve o `.env` com segredos gerados e corre `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'Com o Docker de pé, a base de dados migrada e o admin semeado. Dois minutos depois do `npx` está a olhar para o ecrã de início de sessão do seu produto.',
      },
    ],
    renameTitle: 'O rename é provado, não conferido',
    renameLead:
      'O nome do projecto aparece em sítios que nenhuma revisão humana cobre. O portão é mecânico: o CI gera com um nome de teste, corre `grep -ri` a exigir zero ocorrências do nome antigo e só então instala, verifica tipos e corre a suíte inteira, e2e incluído.',
    renameItems: [
      '531 ocorrências em 199 ficheiros, em três caixas diferentes.',
      'Dentro do SQL que cria a role restrita do Postgres, onde uma substituição parcial produz uma role sem GRANT — e o sintoma é «zero linhas», não um erro.',
      'Em nome de base de dados e de bucket ao mesmo tempo, onde o SQL recusa hífen e o S3 recusa sublinhado.',
    ],
  },

  inside: {
    title: 'O que vem dentro',
    lead: 'O template é o repositório real do DontPanic, na tag que o gerador declara. Não é uma versão de demonstração: é o código que corre o próprio CI.',
    stackTitle: 'A stack',
    stackRoles: [
      'API, com Fastify por baixo',
      'Web, com o BFF que fala com a API em vez do navegador',
      'Base de dados, com driver adapters e Row Level Security',
      'Contratos de pedido e resposta, partilhados entre API e web',
      'Palavra-passe e sessão, com refresh rotativo e detecção de reutilização',
      'Fila durável, com worker em processo separado',
      'Testes: unitários, de componente e e2e',
      'Monorepo, com cache de build',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Cinco recursos onde trocar de fornecedor é trocar uma variável de ambiente. O domínio depende da interface; o fornecedor é detalhe substituível.',
    portsHead: { resource: 'Recurso', adapters: 'Adapters', env: 'Variável' },
    portsResources: ['Ficheiros', 'E-mail', 'Cache', 'Jobs', 'Captcha'],
    numbersTitle: 'Os números',
    numbers: [
      { value: '78 533', label: 'linhas de TypeScript' },
      { value: '~99%', label: 'de statements cobertos na API, com threshold aplicado no CI' },
      { value: '100%', label: 'de statements cobertos no kit de UI do web' },
      { value: '531', label: 'ocorrências do nome trocadas em 199 ficheiros, provadas por grep' },
    ],
  },

  faq: {
    title: 'Perguntas',
    lead: 'As que merecem uma resposta honesta antes de correr o comando.',
    items: [
      {
        q: 'O que é testado, exactamente?',
        a: 'A matriz de predefinições, na íntegra: o CI gera um projecto de cada predefinição, exige zero ocorrências do nome antigo e corre install, typecheck, unitários e e2e. Mais all-on, all-off e cada feature desactivada isoladamente sobre a predefinição SaaS. Treze features booleanas são 8192 combinações, e o CI não testa 8192 projectos: combinações fora dessa matriz são permitidas e não testadas — e o CLI di-lo, numa linha, sem drama. Um boilerplate que promete garantias que não verifica é pior que um que declara o limite.',
      },
      {
        q: 'E se eu não quiser multi-tenancy?',
        a: 'O `--no-multi-tenant` esconde, não arranca. O projecto nasce com um tenant fixo criado no seed, o escopo sempre aberto nele, e o selector de empresa, o painel `/platform` e o SUPERADMIN fora da interface. O Row Level Security continua lá e continua provado pelo `tenant-isolation.e2e-spec.ts`; o custo é uma coluna indexada e um predicado que o Postgres resolve com constante. Arrancá-lo significaria manter duas versões de todo o acesso a dados — e a versão sem RLS é justamente a que não podemos provar segura.',
      },
      {
        q: 'Posso actualizar depois?',
        a: 'O projecto gerado é seu, não uma dependência: não existe `pnpm update` que traga novidade do DontPanic para dentro dele, e isso é de propósito — vai editar este código no primeiro dia. O que existe é reprodutibilidade: a mesma receita com a mesma versão do template gera o mesmo projecto hoje e dentro de dois anos, portanto é possível gerar de novo e comparar diffs quando quiser adoptar algo do upstream.',
      },
      {
        q: 'E a licença?',
        a: 'MIT, no gerador e no template. O que sai do `npx` é seu: sem atribuição obrigatória, sem royalties, sem cláusula que muda de valor se o seu produto crescer. Pode fechar o código do que gerar.',
      },
      {
        q: 'Preciso de Docker?',
        a: 'Para correr a suíte de testes, não: os adapters `memory`, `console` e `local` existem justamente para correr sem nada de pé. Para desenvolver a sério precisa de um Postgres — e o `docker compose` do projecto levanta Postgres, Redis, MinIO e Mailpit em portas que não colidem com as suas. Se já tem estes serviços, aponte o `.env` para eles e gere com `--no-docker`.',
      },
      {
        q: 'Funciona com Claude Code, Cursor e afins?',
        a: 'O projecto gerado traz um `CLAUDE.md` podado para as features que escolheu — só as secções que existem no seu código. É onde estão as decisões de segurança e o motivo de cada uma, no formato que um agente lê antes de escrever. O efeito secundário é o que provavelmente o trouxe aqui: o contexto é gasto no seu produto, não em redescobrir como se faz refresh token com rotação.',
      },
    ],
  },

  footer: {
    tagline: 'Um boilerplate SaaS que já tomou as decisões chatas.',
    repo: 'Código no GitHub',
    license: 'MIT',
    sourceNote: 'Os números desta página saem de `wc -l` e `grep` no repositório. Confirme.',
    marvin:
      'Aqui estou eu, com um cérebro do tamanho de um planeta, a montar uma linha de comando. Chamam a isto satisfação no trabalho.',
  },
};
