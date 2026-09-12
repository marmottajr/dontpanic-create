import type { Messages } from './types';

/**
 * Idioma de origem. O texto nasce aqui e é traduzido a partir deste arquivo.
 *
 * Convenções do conteúdo, válidas para os sete idiomas:
 *
 * - `` `assim` `` marca código, identificador, nome de arquivo e variável de ambiente.
 *   **Nunca se traduz** o que está entre acentos graves.
 * - `**assim**` marca ênfase, e é usado com parcimônia — em geral no verbo que carrega
 *   a consequência ("e **libera**").
 * - Termo técnico consagrado fica no original: Row Level Security, guard, interceptor,
 *   token, rollback, commit, preset. Traduzir "guard" por "guarda" custaria a
 *   credibilidade que a seção "A prova" existe para construir.
 */
export const ptBR: Messages = {
  meta: {
    title: 'DontPanic — o boilerplate SaaS com as decisões de segurança já tomadas',
    description:
      'Gere um SaaS full-stack em NestJS e Next.js com multi-tenancy por Row Level Security, 2FA, convites e login social. As decisões que uma IA erra em silêncio já vêm tomadas, documentadas e testadas.',
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
      'As decisões de segurança que uma IA erra em silêncio já vêm tomadas, documentadas e testadas.',
    lead: 'DontPanic é um boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres com Row Level Security de verdade. Cada escolha de segurança já foi feita, está explicada no `CLAUDE.md` que o seu agente lê antes da primeira linha, e tem teste que falha quando alguém a desfaz. De quebra, o contexto é gasto no seu produto em vez de redescobrir como se faz refresh token com rotação.',
    commandLabel: 'Comando do preset padrão',
    commandNote:
      'Precisa de Node 24 e pnpm. Para escolher as partes, monte o seu comando mais abaixo.',
    ctaConfigure: 'Montar o meu comando',
    ctaProof: 'Ver os erros que isso evita',
    facts: [
      {
        value: '78.533',
        label: 'linhas de TypeScript que compilam, passam no lint e passam nos testes',
      },
      { value: '5', label: 'recursos plugáveis por variável de ambiente, sem tocar na lógica' },
      { value: '2 min', label: 'do npx ao `pnpm dev`, com o banco migrado e o admin semeado' },
    ],
  },

  proof: {
    title: 'A prova',
    lead: 'Nada aqui é hipotético. São erros que produzem código que compila, passa no teste e passa no code review — e que aparecem meses depois, num usuário que não é você. Cada um está decidido no boilerplate, com o motivo escrito ao lado da decisão.',
    labels: {
      surface: 'Onde mora',
      code: 'O código que passa no review',
      whyItPasses: 'Por que ninguém pega',
      whatHappens: 'O que acontece',
      ours: 'No DontPanic',
    },
    items: [
      {
        id: 'oauth-identity',
        title: 'Casar a identidade social pelo e-mail',
        whyItPasses:
          'Compila, e funciona em todos os logins do seu ambiente de desenvolvimento. O teste — que tem um usuário só — passa. O review aprova, porque é assim que a maioria dos tutoriais de OAuth faz.',
        whatHappens:
          'Endereço corporativo é reciclado. A Ana sai da empresa, o RH devolve `ana@empresa.com` ao próximo contratado, ele entra com o Google e **herda a conta da Ana**: histórico, permissões, tudo. Ninguém invadiu nada — o sistema fez exatamente o que estava escrito.',
        ours: 'A chave da identidade é o `providerAccountId` imutável — `sub` no Google e na Apple, o id numérico no GitHub — com `@@unique([provider, providerAccountId])`. O `email` em `oauth_accounts` é campo de exibição e pode estar velho. E e-mail que o provedor não marcou como verificado não vincula nada: o callback devolve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        title: 'Emitir sessão no callback do OAuth sem checar o segundo fator',
        whyItPasses:
          'O `TwoFactorGateGuard` existe e está registrado. Ele verifica que o 2FA está *habilitado* — nunca que *esta* sessão passou por ele. O teste de 2FA cobre o fluxo de senha, e o fluxo de senha está correto.',
        whatHappens:
          'Quem ligou TOTP de propósito descobre que “entrar com o Google” nunca pede o código. O login social fica **estritamente mais fraco** que digitar a senha, e o segundo fator passa a ser opcional para quem souber em qual botão clicar.',
        ours: 'Se `twoFactorEnabled`, o callback não emite sessão: cria o mesmo ticket que `POST /auth/login` criaria, entrega num cookie de cinco minutos e uso único, e redireciona para `/login?twofactor=1`. Cookie e não query string — query string entra no histórico do navegador, no header `Referer` e no log de todo proxy no caminho.',
      },
      {
        id: 'trust-proxy',
        title: 'Ligar `trustProxy: true` para consertar um 429 indevido',
        whyItPasses:
          'Conserta o sintoma na hora: o rate limit volta a distinguir clientes, o 429 desaparece e o deploy sai com o problema resolvido. Nenhum teste pega isso, porque teste não forja header.',
        whatHappens:
          "Confiar em todo hop é aceitar qualquer `X-Forwarded-For` — e `X-Forwarded-For` **não** está na lista de forbidden headers do fetch, ou seja, o browser pode setá-lo. Um `fetch('/api/auth/login', { headers: { 'x-forwarded-for': ipAleatorio() } })` ganha um balde novo a cada request, e o rate limit do login deixa de existir. Contar hops da esquerda acaba no mesmo lugar: o load balancer faz append, então em `X-Forwarded-For: <forjado>, <real>` o primeiro elemento é o que o atacante digitou.",
        ours: '`CLIENT_IP_HEADER` e `CLIENT_IP_TRUSTED_HOPS`, contados **da direita**. O BFF apaga todo header de forwarding vindo do browser e reescreve um só, sanitizado. O default é zero hops: não manda IP nenhum e trata todo mundo atrás do proxy como um cliente só — limita demais, e não é burlável.',
      },
      {
        id: 'guard-scope',
        title: 'Ler o banco num guard, antes de o escopo de tenant existir',
        whyItPasses:
          'O Nest roda guards **antes** de interceptors. Quando o guard executa, o interceptor que abre a transação com `SET LOCAL` ainda não rodou: `prisma.db` cai no cliente base, sem escopo, e a política de RLS devolve zero linhas. Não dá erro. Cobertura verde, 200 OK, nada nos logs.',
        whatHappens:
          'O guard conclui “este usuário não tem 2FA” e **libera**. Foi exatamente assim que o `TwoFactorGateGuard` do próprio DontPanic virou um no-op silencioso — o bug está no histórico do repositório, e a lição ficou escrita junto.',
        ours: 'Guard que lê o banco abre escopo próprio, com `this.prisma.forTenant(tenantId, …)` ou `asPlatform`, e **falha fechado** quando a leitura vem vazia. A regra, com a história do bug ao lado, está na seção de multi-tenancy do `CLAUDE.md` — o arquivo que o seu agente lê antes de escrever o próximo guard.',
      },
      {
        id: 'db-owner',
        title: 'Apontar a `DATABASE_URL` para o dono do banco',
        whyItPasses:
          'É o que o tutorial manda e é o usuário que o `docker compose` do Postgres cria. Pior: os seus testes de isolamento passam, porque exercitam o filtro da aplicação — que está lá, e está certo.',
        whatHappens:
          'SUPERUSER — e qualquer role com `BYPASSRLS` — ignora Row Level Security mesmo com `FORCE ROW LEVEL SECURITY`. **Toda política vira decoração**, e o isolamento entre empresas passa a depender de nenhuma query esquecer um `where`, para sempre, em todo código futuro.',
        ours: 'A aplicação conecta com uma role restrita, criada `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; o dono do banco fica só em `DATABASE_ADMIN_URL`, para `migrate` e `seed`. A API **recusa subir** em produção se detectar superuser. E a suíte e2e roda sob a role restrita — é isso que faz `tenant-isolation.e2e-spec.ts` provar alguma coisa em vez de repetir a intenção do código.',
      },
    ],
    moreTitle: 'Mais três, pelo mesmo desenho',
    more: [
      'Disparar o e-mail de convite dentro da transação. Um rollback entrega um link válido apontando para uma empresa que não existe, e não sobra registro para o suporte encontrar. Aqui, `issue()` grava no `tx` do chamador e o envio acontece depois do commit.',
      'Responder “esta conta usa login social” num login com senha. Vira oráculo: dá para enumerar, cronometrando o formulário, exatamente quais endereços não têm senha. Aqui o erro é o genérico de sempre e paga o mesmo custo de Argon2 — `verifyPassword(null, …)` verifica contra o hash de algo que ninguém conhece antes de responder `false`.',
      'Contar assentos antes de gravar o usuário. Dois pedidos simultâneos leem “falta um” e ambos criam: contar não tranca nada. Aqui o `pg_advisory_xact_lock` por empresa e por recurso fica dentro da mesma transação da escrita.',
    ],
  },

  configurator: {
    title: 'Monte o comando',
    lead: 'Nada é gerado aqui. Esta página monta uma string — o gerador mora no CLI, versionado junto com o template, e é ele que decide o que entra no seu repositório. Sem servidor, sem fila de build, sem zip para expirar em cache.',

    nameLegend: 'O nome do projeto',
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Como você chama o produto. Todo o resto é derivado daqui.',
    slugLabel: 'Slug',
    slugHelp: 'Diretório, pacote npm e identificadores. Minúsculas, dígitos e hífen.',
    slugDerived: 'derivado do nome',
    slugCustom: 'personalizado',
    slugReset: 'Voltar ao derivado',
    applySuggestion: 'Usar',

    derivedTitle: 'O que esse nome vira',
    derivedNote:
      'O rename não é um `sed` no nome da pasta: passa pelo SQL que cria a role do Postgres, pelo escopo do pnpm e por nomes de banco e de bucket ao mesmo tempo — onde o SQL recusa hífen e o S3 recusa sublinhado.',
    derivedLabels: {
      dbName: 'banco de dev',
      dbNameE2e: 'banco de e2e',
      dbRole: 'role restrita do Postgres',
      npmScope: 'escopo do pnpm',
      seedAdminEmail: 'admin do seed',
      bucket: 'bucket de object storage',
      screaming: 'prefixo de env',
      pascal: 'classes e tipos',
    },

    presetLegend: 'Ponto de partida',
    presetNote:
      'Um preset é um conjunto de padrões. Tudo abaixo continua editável, e o comando mostra só o que você mudou.',
    presetReset: 'Descartar as mudanças deste preset',

    featuresLegend: 'O que entra',
    featuresNote:
      'O gerador subtrai: o template é o repositório real, que compila e roda, e desligar uma feature apaga os arquivos dela. Nada de `{{#if}}` no código.',
    groups: {
      access: 'Acesso',
      tenancy: 'Empresas',
      ops: 'Operação',
      extras: 'Extras',
    },

    driversLegend: 'Adapters',
    driversNote:
      'Trocar de provedor é trocar uma variável de ambiente — o domínio depende do port, não do fornecedor. Estas escolhas entram no `.env` do projeto gerado.',
    driverLabels: {
      db: 'Banco',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Fila',
      captcha: 'Captcha',
    },

    oauthLegend: 'Providers de login social',
    oauthNote:
      'A API e o web precisam listar os mesmos nomes, senão o botão extra dá 404. O gerador escreve os dois lados.',

    localesLegend: 'Idiomas do projeto',
    localesNote:
      'Os idiomas do produto que você vai gerar. Não têm relação com o idioma desta página.',
    defaultLocaleLabel: 'Idioma padrão',

    optionsLegend: 'Na geração',
    optionLabels: {
      git: 'Rodar `git init` e o primeiro commit',
      install: 'Rodar `pnpm install` no fim',
      docker: 'Emitir `docker-compose.yml` com os serviços usados',
      force: 'Sobrescrever o diretório de destino se ele já existir',
    },

    issuesTitle: 'Combinação incoerente',
    issueError: 'Impede a geração',
    issueWarning: 'Permitido, com ressalva',
    noIssues: 'Combinação coerente.',

    commandTitle: 'O seu comando',
    commandNote: 'Isto é a configuração. Não existe outro lugar onde ela viva.',
    copy: 'Copiar comando',
    copied: 'Comando copiado',
    copyFailed: 'Não deu para copiar — selecione o texto e copie',
    flagsTitle: 'As flags',
    flagsNote: 'Só o que difere do preset. Remova uma para voltar ao padrão dele.',
    removeFlag: 'Remover',
    shareTitle: 'Link desta configuração',
    shareNote:
      'A configuração está na URL, legível. Mande no Slack e o colega entende o que é antes de abrir.',
    shareCopy: 'Copiar link',
    shareCopied: 'Link copiado',
    blockedByName: 'Corrija o nome antes de usar o comando.',

    features: {
      multiTenant: {
        label: 'Multi-tenancy',
        text: 'Isolamento entre empresas no Postgres, por Row Level Security. Desligado, o RLS fica: o projeto nasce com um tenant fixo e a troca de empresa fora da interface.',
      },
      twoFactor: {
        label: '2FA por TOTP',
        text: 'Segundo fator com app autenticador, códigos de backup e ticket de uso único entre a senha e a sessão.',
      },
      oauth: {
        label: 'Login social',
        text: 'Google, Apple e GitHub, ligados por provider. Identidade pelo `providerAccountId`, e o callback respeita o 2FA.',
      },
      invitations: {
        label: 'Convites',
        text: 'A porta para uma empresa que já existe: o convidado escolhe a própria senha, e o clique no link é o que prova o endereço.',
      },
      publicSignup: {
        label: 'Registro público',
        text: 'O formulário que deixa um desconhecido criar empresa e virar o primeiro admin. Desligado, sobram o convite e o seed.',
      },
      files: {
        label: 'Upload de arquivos',
        text: 'Avatar e anexos por URL pré-assinada, atrás do port de storage: S3, MinIO, R2 ou disco local.',
      },
      platform: {
        label: 'Painel da plataforma',
        text: 'A área do SUPERADMIN em `/platform`: cria empresa, convida o primeiro admin e atravessa tenants em escopo próprio.',
      },
      audit: {
        label: 'Trilha de auditoria',
        text: 'Quem fez o quê, gravado fora da transação do request para não desaparecer junto com um rollback.',
      },
      plans: {
        label: 'Planos e limites',
        text: '`maxUsers` e contadores nomeados por empresa, com advisory lock por recurso — contar antes de gravar não tranca nada.',
      },
      i18n: {
        label: 'Internacionalização',
        text: 'Mensagens por idioma nos dois lados, com teste de paridade de chaves entre os arquivos de tradução.',
      },
      queue: {
        label: 'Fila de jobs',
        text: 'BullMQ no Redis, com worker em processo separado. O tenant viaja com o job: sem ele o RLS devolve zero linhas e o job mente que deu certo.',
      },
      captcha: {
        label: 'Captcha',
        text: 'Turnstile ou reCAPTCHA nas rotas que adivinham segredo, falhando fechado quando o provedor cai.',
      },
      easterEggs: {
        label: 'Piadas do Guia',
        text: 'A voz do Marvin nas bordas, `GET /teapot` devolvendo 418 e o Konami no dashboard. Nunca numa mensagem de segurança.',
      },
      scaffolding: {
        label: 'Blocos de construção',
        text: 'Grid de registros, cards de dashboard e `sequence.service.ts`: prontos, testados e importados por nada — o ponto de partida das suas telas de CRUD.',
      },
    },

    presets: {
      minimal: {
        label: 'Mínimo',
        summary: 'Senha, multi-tenancy com RLS e a suíte de testes. Nada além disso.',
        audience:
          'Para quem vai construir o produto inteiro e só quer a base de acesso já provada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multi-empresa de verdade: convites, planos com limite de assentos, 2FA, login social e fila durável.',
        audience:
          'Para produto vendido por assinatura, com mais de uma empresa cliente no mesmo banco.',
      },
      complete: {
        label: 'Completo',
        summary: 'O boilerplate inteiro, sem subtrair nada — inclusive o Marvin.',
        audience: 'Para ver tudo funcionando antes de decidir o que remover.',
      },
      internal: {
        label: 'Interno',
        summary:
          'Uma empresa só e nenhuma porta pública: entra quem foi convidado, com 2FA e auditoria.',
        audience: 'Para ferramenta de time, back-office ou ERP que nunca vai ter cadastro aberto.',
      },
    },
  },

  how: {
    title: 'Como funciona',
    lead: 'Quatro passos, e só o terceiro demora.',
    steps: [
      {
        title: 'Escolha as partes',
        body: 'Um preset como ponto de partida e os toggles por cima. A URL guarda a escolha, então dá para mandar o link a quem decide junto antes de rodar qualquer coisa.',
      },
      {
        title: 'Copie o comando',
        body: 'A página não gera nada: monta a string. É o CLI, versionado junto com o template, que decide o conteúdo do seu repositório — por isso a mesma receita produz o mesmo projeto hoje e em dois anos.',
      },
      {
        title: 'Rode o npx',
        body: 'O gerador copia o template, apaga o que você não pediu, poda o schema do Prisma, monta a baseline do SQL, troca o nome em toda forma, escreve o `.env` com segredos gerados e roda `git init`.',
      },
      {
        title: '`pnpm dev`',
        body: 'Com o Docker em pé, o banco migrado e o admin semeado. Dois minutos depois do `npx` você está olhando a tela de login do seu produto.',
      },
    ],
    renameTitle: 'O rename é provado, não conferido',
    renameLead:
      'O nome do projeto aparece em lugares que nenhuma revisão humana cobre. O portão é mecânico: o CI gera com um nome de teste, roda `grep -ri` exigindo zero ocorrência do nome antigo e só então instala, tipa e roda a suíte inteira, e2e incluído.',
    renameItems: [
      '531 ocorrências em 199 arquivos, em três caixas diferentes.',
      'Dentro do SQL que cria a role restrita do Postgres, onde uma substituição parcial produz uma role sem GRANT — e o sintoma é “zero linhas”, não erro.',
      'Em nome de banco e de bucket ao mesmo tempo, onde o SQL recusa hífen e o S3 recusa sublinhado.',
    ],
  },

  inside: {
    title: 'O que vem dentro',
    lead: 'O template é o repositório real do DontPanic, na tag que o gerador declara. Não é uma versão de demonstração: é o código que roda o próprio CI.',
    stackTitle: 'A stack',
    stackRoles: [
      'API, com Fastify por baixo',
      'Web, com o BFF que fala com a API no lugar do browser',
      'Banco, com driver adapters e Row Level Security',
      'Contratos de request e response, compartilhados entre API e web',
      'Senha e sessão, com refresh rotativo e detecção de reuso',
      'Fila durável, com worker em processo separado',
      'Testes: unit, componente e e2e',
      'Monorepo, com cache de build',
    ],
    portsTitle: 'Ports & Adapters',
    portsLead:
      'Cinco recursos onde trocar de provedor é trocar uma variável de ambiente. O domínio depende da interface; o fornecedor é detalhe plugável.',
    portsHead: { resource: 'Recurso', adapters: 'Adapters', env: 'Variável' },
    portsResources: ['Arquivos', 'E-mail', 'Cache', 'Jobs', 'Captcha'],
    numbersTitle: 'Os números',
    numbers: [
      { value: '78.533', label: 'linhas de TypeScript' },
      { value: '~99%', label: 'de statements cobertos na API, com threshold aplicado no CI' },
      { value: '100%', label: 'de statements cobertos no kit de UI do web' },
      { value: '531', label: 'ocorrências do nome trocadas em 199 arquivos, provadas por grep' },
    ],
  },

  faq: {
    title: 'Perguntas',
    lead: 'As que valem uma resposta honesta antes de você rodar o comando.',
    items: [
      {
        q: 'O que exatamente é testado?',
        a: 'A matriz de presets, integralmente: o CI gera um projeto de cada preset, exige zero ocorrência do nome antigo e roda install, typecheck, unit e e2e. Mais all-on, all-off e cada feature desligada isoladamente sobre o preset SaaS. Treze features booleanas são 8.192 combinações, e o CI não testa 8.192 projetos: combinações fora dessa matriz são permitidas e não testadas — e o CLI diz isso, numa linha, sem drama. Um boilerplate que promete garantia que não verifica é pior que um que declara o limite.',
      },
      {
        q: 'E se eu não quiser multi-tenancy?',
        a: '`--no-multi-tenant` esconde, não arranca. O projeto nasce com um tenant fixo criado no seed, o escopo sempre aberto nele, e o seletor de empresa, o painel `/platform` e o SUPERADMIN fora da interface. O Row Level Security continua lá e continua provado pelo `tenant-isolation.e2e-spec.ts`; o custo é uma coluna indexada e um predicado que o Postgres resolve com constante. Arrancar significaria manter duas versões de todo acesso a dados — e a versão sem RLS é justamente a que não podemos provar segura.',
      },
      {
        q: 'Posso atualizar depois?',
        a: 'O projeto gerado é seu, não uma dependência: não existe `pnpm update` que traga novidade do DontPanic para dentro dele, e isso é de propósito — você vai editar esse código no primeiro dia. O que existe é reprodutibilidade: a mesma receita com a mesma versão do template gera o mesmo projeto hoje e em dois anos, então dá para gerar de novo e comparar diffs quando quiser adotar algo do upstream.',
      },
      {
        q: 'E a licença?',
        a: 'MIT, no gerador e no template. O que sai do `npx` é seu: sem atribuição obrigatória, sem royalty, sem cláusula que muda de valor se o seu produto crescer. Você pode fechar o código do que gerar.',
      },
      {
        q: 'Preciso do Docker?',
        a: 'Para rodar a suíte de testes, não: os adapters `memory`, `console` e `local` existem justamente para rodar sem nada em pé. Para desenvolver de verdade você precisa de um Postgres — e o `docker compose` do projeto sobe Postgres, Redis, MinIO e Mailpit em portas que não colidem com as suas. Se você já tem esses serviços, aponte o `.env` para eles e gere com `--no-docker`.',
      },
      {
        q: 'Funciona com Claude Code, Cursor e afins?',
        a: 'O projeto gerado traz um `CLAUDE.md` podado para as features que você escolheu — só as seções que existem no seu código. É onde estão as decisões de segurança e o motivo de cada uma, no formato que um agente lê antes de escrever. O efeito colateral é o que provavelmente te trouxe aqui: o contexto é gasto no seu produto, não em redescobrir como se faz refresh token com rotação.',
      },
    ],
  },

  footer: {
    tagline: 'Um boilerplate SaaS que já tomou as decisões chatas.',
    repo: 'Código no GitHub',
    license: 'MIT',
    sourceNote: 'Os números desta página saem de `wc -l` e `grep` no repositório. Confira.',
    marvin:
      'Aqui estou eu, com um cérebro do tamanho de um planeta, montando uma linha de comando. Chamam isso de satisfação no trabalho.',
  },
};
