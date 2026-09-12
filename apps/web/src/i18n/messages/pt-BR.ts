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
 * - **No assistente a regra se inverte:** ali não há jargão. "Seu sistema vai atender
 *   várias empresas?" em vez de "habilitar multi-tenancy com RLS". Quem responde
 *   àquelas perguntas pode não saber o que é RLS — e não precisa saber para escolher.
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
    nameCta: 'Começar',
    commandLabel: 'Comando do preset padrão',
    commandNote:
      'Precisa de Node 24 e pnpm. Para escolher as partes, responda o assistente — são doze perguntas.',
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
    eyebrow: 'Erros que passam no review',
    title: 'A prova',
    lead: 'Nada aqui é hipotético. São erros que produzem código que compila, passa no teste e passa no code review — e que aparecem meses depois, num usuário que não é você. Cada um está decidido no boilerplate, com o motivo ao lado da decisão e o teste nomeado embaixo.',
    labels: {
      whatHappens: 'O que acontece',
      ours: 'No DontPanic',
      seal: 'coberto por teste',
      cases: 'casos',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Login social',
        title: 'A identidade social casada pelo e-mail',
        whatHappens:
          'Endereço corporativo é reciclado. A Ana sai da empresa, o RH devolve `ana@empresa.com` ao próximo contratado, ele entra com o Google e **herda a conta da Ana**: histórico, permissões, tudo. Ninguém invadiu nada — o sistema fez exatamente o que estava escrito, e o teste, que tinha um usuário só, passou.',
        ours: 'A chave da identidade é o `providerAccountId` imutável — `sub` no Google e na Apple, o id numérico no GitHub — com `@@unique([provider, providerAccountId])`. O `email` em `oauth_accounts` é campo de exibição e pode estar velho. E e-mail que o provedor não marcou como verificado não vincula nada: o callback devolve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Segundo fator',
        title: 'A sessão emitida no callback do OAuth sem checar o segundo fator',
        whatHappens:
          'Quem ligou o código de seis dígitos de propósito descobre que “entrar com o Google” nunca o pede. O login social fica **estritamente mais fraco** que digitar a senha, e o segundo fator passa a ser opcional para quem souber em qual botão clicar. O `TwoFactorGateGuard` não pega: ele verifica que o 2FA está *habilitado*, nunca que *esta* sessão passou por ele.',
        ours: 'Se `twoFactorEnabled`, o callback não emite sessão: cria o mesmo ticket que `POST /auth/login` criaria, entrega num cookie de cinco minutos e uso único, e redireciona para `/login?twofactor=1`. Cookie e não query string — query string entra no histórico do navegador, no header `Referer` e no log de todo proxy no caminho.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolamento',
        title: 'O isolamento entre empresas confiado ao `where` da aplicação',
        whatHappens:
          'A garantia virou disciplina humana, repetida em cada consulta, por todo mundo que entrar no time depois de você. O primeiro `findUnique({ where: { id } })` por chave primária — escrito com pressa, ou por um agente que não conhecia a regra — devolve a linha de outra empresa. E não falha: **devolve dados, com status 200**.',
        ours: 'O isolamento é do Postgres, não da aplicação: Row Level Security, com o escopo declarado por `SET LOCAL` dentro da transação do request. Sem escopo nenhum, `current_setting(…, true)` devolve NULL e a política não casa — esquecer o escopo dá resultado **vazio**, nunca a linha da empresa errada. O filtro na aplicação continua lá, como conveniência; a garantia é a de baixo.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessões',
        title: 'O reset de senha que não derruba as sessões abertas',
        whatHappens:
          'A pessoa troca a senha justamente porque desconfia que alguém entrou. O hash novo não invalida nada: o refresh token do invasor **continua renovando sozinho**, e ele fica dentro da conta muito depois da troca — indefinidamente, enquanto continuar usando o sistema.',
        ours: '`resetPassword` grava a senha nova e o consumo do token na mesma transação e, depois do commit, chama `revokeAllForUser` — toda sessão existente morre, registrada na auditoria como logout deliberado. O refresh rotativo fecha o resto: um token antigo reapresentado revoga a família inteira.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Banco',
        title: 'A `DATABASE_URL` apontando para o dono do banco',
        whatHappens:
          'SUPERUSER — e qualquer role com `BYPASSRLS` — ignora Row Level Security mesmo com `FORCE ROW LEVEL SECURITY`. **Toda política vira decoração**, e o isolamento volta a depender de nenhuma query esquecer um `where`. Pior: os seus testes de isolamento passam, porque exercitam o filtro da aplicação, que está lá e está certo.',
        ours: 'A aplicação conecta com uma role restrita, criada `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; o dono do banco fica só em `DATABASE_ADMIN_URL`, para `migrate` e `seed`. A API **recusa subir** em produção se detectar superuser. E a suíte e2e roda sob a role restrita — é isso que faz o teste de isolamento provar alguma coisa em vez de repetir a intenção do código.',
      },
    ],
    moreTitle: 'Mais cinco, pelo mesmo desenho',
    more: [
      'Ligar `trustProxy: true` para acabar com um 429 indevido. Confiar em todo hop é aceitar qualquer `X-Forwarded-For` — e o browser **pode** setá-lo, porque ele não está na lista de forbidden headers do fetch: um balde novo de rate limit a cada request. Aqui o IP é contado da direita, com `CLIENT_IP_TRUSTED_HOPS`, e o BFF apaga todo header de forwarding vindo do navegador.',
      'Ler o banco num guard, antes de o escopo de tenant existir. O Nest roda guards **antes** de interceptors, então a política de RLS devolve zero linhas, o guard conclui “este usuário não tem 2FA” e libera — sem erro e sem log. Aqui, guard que lê o banco abre escopo próprio e falha fechado.',
      'Disparar o e-mail de convite dentro da transação. Um rollback entrega um link válido apontando para uma empresa que não existe, e não sobra registro para o suporte encontrar. Aqui, `issue()` grava no `tx` do chamador e o envio acontece depois do commit.',
      'Responder “esta conta usa login social” num login com senha. Vira oráculo: dá para enumerar, cronometrando o formulário, exatamente quais endereços não têm senha. Aqui o erro é o genérico de sempre e paga o mesmo custo de Argon2 — `verifyPassword(null, …)` verifica contra o hash de algo que ninguém conhece antes de responder `false`.',
      'Contar assentos antes de gravar o usuário. Dois pedidos simultâneos leem “falta um” e ambos criam: contar não tranca nada. Aqui o `pg_advisory_xact_lock` por empresa e por recurso fica dentro da mesma transação da escrita.',
    ],
  },

  configurator: {
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Como você chama o produto. Todo o resto é derivado daqui.',
    slugLabel: 'Slug',
    slugHelp: 'Diretório, pacote npm e identificadores. Minúsculas, dígitos e hífen.',
    slugDerived: 'derivado do nome',
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

    driverLabels: {
      db: 'Banco',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Fila',
      captcha: 'Captcha',
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
    flagsNote: 'Só o que difere do ponto de partida.',
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
        summary: 'Senha, isolamento no banco e a suíte de testes. Nada além disso.',
        audience:
          'Para quem vai construir o produto inteiro e só quer a base de acesso já provada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multi-empresa de verdade: convites, planos com limite de assentos, 2FA e fila durável.',
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

  wizard: {
    open: 'Montar',
    openHero: 'Montar o meu sistema',
    close: 'Fechar',
    next: 'Continuar',
    back: 'Voltar',
    finish: 'Ver o comando',
    recommended: 'Usar o recomendado',
    progress: 'Passo {n} de {total}',
    yes: 'Sim',
    no: 'Não',
    edit: 'Editar',
    steps: {
      name: {
        eyebrow: 'Nome',
        question: 'Como o seu sistema vai se chamar?',
        help: 'Pode ser o nome do produto ou o da empresa. Tudo o mais sai daí: a pasta, o pacote, o banco de dados e até o usuário que o Postgres cria. As formas prontas aparecem aqui embaixo enquanto você digita.',
      },
      preset: {
        eyebrow: 'Ponto de partida',
        question: 'Qual destes mais parece com o que você vai construir?',
        help: 'Isto só responde as próximas perguntas por você. Nada fica travado: se uma resposta não servir, mude no passo dela ou na revisão do fim.',
      },
      tenancy: {
        eyebrow: 'Empresas',
        question:
          'Seu sistema vai atender várias empresas diferentes, cada uma vendo só os próprios dados?',
        help: 'É a diferença entre um produto que você vende para muitos clientes e um sistema que roda para uma empresa só.',
        choices: {
          yes: {
            label: 'Sim, várias empresas',
            help: 'Cada empresa fica separada dentro do banco pelo próprio Postgres, e não por um filtro que alguém pode esquecer de escrever. Vem com painel de administração e troca de empresa.',
          },
          no: {
            label: 'Não, uma empresa só',
            help: 'O sistema nasce com uma empresa fixa e as telas de troca ficam fora. A separação continua dentro do banco — só não aparece na tela, porque não há o que trocar.',
          },
        },
      },
      entry: {
        eyebrow: 'Entrada',
        question: 'Como as pessoas vão conseguir entrar no sistema?',
        help: 'Quem pode criar uma conta é a decisão que mais muda o seu produto — e a que mais dá errado quando fica para depois.',
        choices: {
          open: {
            label: 'Qualquer um pode se cadastrar',
            help: 'Tem formulário de cadastro aberto, e quem se cadastra cria a própria empresa. É o que um produto vendido pela internet precisa.',
          },
          invite: {
            label: 'Só quem for convidado',
            help: 'Um administrador convida por e-mail e o convidado escolhe a própria senha. Ninguém fica sabendo a senha de outra pessoa, e o clique no link é o que prova que aquele e-mail existe.',
          },
          seed: {
            label: 'Só quem eu criar direto',
            help: 'Sem cadastro e sem convite: a única conta é a que o sistema cria na instalação. Serve para uso interno — e significa que as outras pessoas você cria à mão.',
          },
        },
      },
      social: {
        eyebrow: 'Login social',
        question: 'Você quer o botão de entrar com Google, Apple ou GitHub?',
        help: 'Some um passo para o usuário, e some também a senha esquecida. Em troca, cada provedor precisa de uma chave que você cria no site deles.',
        choices: {
          yes: {
            label: 'Sim',
            help: 'A conta é reconhecida pelo identificador que o provedor dá, nunca pelo e-mail: endereço de trabalho é reciclado, e casar por e-mail é como alguém herda a conta de quem saiu da empresa.',
          },
          no: {
            label: 'Não',
            help: 'Só e-mail e senha, e o código dos provedores sai do projeto — é menos coisa para manter. Para ter de volta, gere outra vez com o login social ligado.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Segundo fator',
        question: 'As pessoas devem poder exigir um código do celular para entrar?',
        help: 'É o código de seis dígitos de um app como o Google Authenticator. Quem liga protege a conta mesmo que a senha vaze.',
        choices: {
          yes: {
            label: 'Sim',
            help: 'Cada pessoa liga na própria conta, com códigos de reserva para o caso de perder o celular. O login social respeita isso: com o segundo fator ligado, entrar pelo Google não pula a etapa.',
          },
          no: {
            label: 'Não',
            help: 'Entrar é só senha. Saem o código, a tela de configuração e os códigos de reserva.',
          },
        },
      },
      languages: {
        eyebrow: 'Idiomas',
        question: 'O sistema vai falar mais de um idioma?',
        help: 'Isto é sobre o produto que você vai gerar, não sobre esta página.',
        choices: {
          one: {
            label: 'Um idioma',
            help: 'As telas e os e-mails saem num idioma só. O encanamento de tradução continua no código, então acrescentar um segundo depois não é refazer as telas.',
          },
          many: {
            label: 'Mais de um',
            help: 'Você escolhe quais. Um teste garante que nenhum idioma fique com uma frase faltando — que é como uma tela aparece em inglês no meio do português.',
          },
        },
      },
      plans: {
        eyebrow: 'Planos',
        question: 'Você vai vender planos com limite, do tipo “até 10 usuários”?',
        help: 'É o que separa um plano básico de um avançado dentro do próprio sistema.',
        choices: {
          yes: {
            label: 'Sim',
            help: 'Cada empresa ganha um limite de pessoas e contadores por recurso. O limite é conferido no momento de gravar, com tranca no banco: dois convites aceitos no mesmo segundo não passam do teto.',
          },
          no: {
            label: 'Não',
            help: 'Sem limite e sem contadores. Ninguém é barrado por tamanho.',
          },
        },
      },
      files: {
        eyebrow: 'Arquivos',
        question: 'As pessoas vão enviar arquivos — foto de perfil, anexos, documentos?',
        help: 'Muda onde os arquivos ficam guardados e como chegam ao navegador.',
        choices: {
          yes: {
            label: 'Sim',
            help: 'O envio vai direto para o armazenamento, por um link assinado. Funciona com Amazon S3, MinIO, Cloudflare R2 ou o disco da máquina, e trocar entre eles é mudar uma linha de configuração.',
          },
          no: {
            label: 'Não',
            help: 'Sem envio de arquivo e sem foto de perfil. Menos código, e nenhum bucket para configurar.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robôs',
        question: 'As telas públicas precisam de proteção contra robôs?',
        help: 'Vale para cadastro, login e recuperação de senha — as telas que um robô tenta no atacado.',
        choices: {
          yes: {
            label: 'Sim',
            help: 'Vem com o Cloudflare Turnstile, e o reCAPTCHA do Google como alternativa. Se o provedor cair, o sistema recusa em vez de liberar — o inverso é como um formulário fica aberto sem ninguém notar.',
          },
          no: {
            label: 'Não',
            help: 'Sem quebra-cabeça na tela. O limite de tentativas por endereço de rede continua valendo, então não é “sem proteção”: é sem essa camada.',
          },
        },
      },
      review: {
        eyebrow: 'Revisão',
        question: 'Confira antes de rodar.',
        help: 'Cada linha volta para a pergunta que a gerou. O comando é exatamente o que o gerador vai receber.',
      },
      done: {
        eyebrow: 'Pronto',
        question: 'É só copiar e rodar.',
        help: 'Cole no terminal, na pasta onde você quer o projeto. Dois minutos depois você está olhando a tela de login dele.',
      },
    },
  },

  how: {
    title: 'Como funciona',
    lead: 'Quatro passos, e só o terceiro demora.',
    steps: [
      {
        title: 'Responda o assistente',
        body: 'Doze perguntas em linguagem de gente, e o ponto de partida já responde a maioria. A URL guarda a escolha, então dá para mandar o link a quem decide junto antes de rodar qualquer coisa.',
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
    stackHead: { tech: 'Tecnologia', solves: 'O que ela resolve' },
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
    factoryTitle: 'De fábrica',
    factory: [
      {
        label: 'Acesso e sessão',
        text: 'Senha com Argon2, sessão em cookie httpOnly, refresh rotativo com detecção de reuso — token roubado derruba a família inteira. Trocar a senha encerra as outras sessões.',
      },
      {
        label: 'Isolamento no banco',
        text: 'Row Level Security no Postgres, com o escopo declarado por request. Tabela nova com `tenantId` se protege sozinha: `SELECT app.apply_tenant_rls();` no fim da migration.',
      },
      {
        label: 'Convites e onboarding',
        text: 'Token guardado só como hash, no máximo um convite pendente por e-mail (índice único parcial) e o e-mail saindo depois do commit — nunca dentro da transação.',
      },
      {
        label: 'Cinco trocas por variável',
        text: 'Storage, e-mail, cache, fila e captcha atrás de interfaces: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Trabalho em segundo plano',
        text: 'BullMQ no Redis, com worker em processo separado e o tenant viajando junto com o job. Sem ele, o job veria um banco vazio e diria que deu certo.',
      },
      {
        label: 'Testes que provam',
        text: 'Unitários com o banco mockado, e2e contra um Postgres de verdade sob a role restrita, e o kit de UI do web no Vitest.',
      },
    ],
    decisionsTitle: 'A parte que ninguém escreve',
    decisionsText:
      'Cada decisão de segurança tem um arquivo em `docs/decisions/` e uma seção no `CLAUDE.md`, com o motivo e o que acontece se alguém a desfizer. É o que um agente lê antes de escrever — e o que você lê seis meses depois, quando não lembra por que aquilo está assim.',
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
        a: 'A matriz de presets, integralmente: o CI gera um projeto de cada preset, exige zero ocorrência do nome antigo e roda install, typecheck, unit e e2e. Mais all-on, all-off e cada feature desligada isoladamente sobre o preset SaaS. Quatorze features booleanas são 16.384 combinações, e o CI não testa 16.384 projetos: combinações fora dessa matriz são permitidas e não testadas — e o CLI diz isso, numa linha, sem drama. Um boilerplate que promete garantia que não verifica é pior que um que declara o limite.',
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
    brandNote:
      'Gerador de projetos a partir do boilerplate DontPanic. Você escolhe as partes; o comando gera o repositório.',
    sourceNote: 'Os números desta página saem de `wc -l` e `grep` no repositório. Confira.',
    license: 'MIT',
    productTitle: 'Produto',
    docsTitle: 'Documentação',
    contactTitle: 'Contato',
    joke: 'Este rodapé foi montado por uma inteligência do tamanho de um planeta. Ele contém quatro listas de links. Não se preocupe: o resto do código é mais interessante.',
  },
};
