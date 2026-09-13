import type { Messages } from './types';

/**
 * Português europeu.
 *
 * Não é o pt-BR com outra ortografia: muda o léxico técnico — utilizador, ficheiro,
 * base de dados, palavra-passe, registo, predefinição, equipa — e muda a construção
 * verbal ("está a correr", não "está rodando"). Traduzir só os acentos produziria um
 * texto que um leitor de Lisboa identifica como brasileiro na segunda linha, o que é
 * pior que não oferecer o idioma.
 */
export const ptPT: Messages = {
  meta: {
    title: 'DontPanic — o boilerplate SaaS com as decisões de segurança já tomadas',
    description:
      'Gere um projecto novo — um SaaS full-stack em NestJS e Next.js, de raiz — com multi-tenancy por Row Level Security, 2FA, convites e login social. As decisões que uma IA erra em silêncio vêm já tomadas, documentadas e testadas.',
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
      'Comece um SaaS novo com as decisões de segurança já tomadas — as que uma IA erra em silêncio.',
    lead: 'Responde a dez perguntas, copia um comando e recebe **um repositório novo**: vazio do seu produto e cheio do resto — login, 2FA, convites, empresas isoladas dentro da base de dados, fila de trabalhos e testes. Com o nome do seu projecto em tudo: pacotes, base de dados, variáveis de ambiente.',
    notThis:
      'Não é um analisador: o DontPanic **não olha para o código que já tem**. É o ponto de partida de um projecto de raiz.',
    nameCta: 'Começar',
    ctaNote: 'Dez perguntas em linguagem corrente. Pode saltar qualquer uma.',
    commandLabel: 'Comando da predefinição padrão',
    commandNote: 'Precisa de Node 24 e pnpm.',
    ctaProof: 'Ver as cinco decisões',
    facts: [
      {
        value: '78 533',
        label: 'linhas de TypeScript que compilam, passam no lint e passam nos testes',
      },
      {
        value: '5',
        label: 'recursos substituíveis por variável de ambiente, sem tocar na lógica',
      },
      {
        value: '2 min',
        label: 'do npx ao `pnpm dev`, com a base de dados migrada e o admin semeado',
      },
    ],
  },

  cta: {
    title: 'Dez perguntas. Um comando no fim.',
    text: 'Uma pergunta por ecrã, em linguagem corrente, com o que muda no sistema escrito por baixo. Nada de catorze interruptores de uma vez.',
    note: 'sem registo · dá para voltar em qualquer passo',
  },

  proof: {
    eyebrow: 'Cinco erros, já decididos aqui',
    title: 'A prova',
    lead: 'Nada aqui é hipotético. São erros que produzem código que compila, passa no teste e passa no code review — e que aparecem meses depois, num utilizador que não é você. Não somos nós que os vamos encontrar no seu código: **cada um já está decidido no código que recebe**, com o motivo ao lado da decisão e o teste nomeado em baixo.',
    labels: {
      whatHappens: 'O que acontece',
      ours: 'No DontPanic',
      seal: 'coberto por testes',
      cases: 'casos',
    },
    items: [
      {
        id: 'oauth-identity',
        eyebrow: 'Início de sessão social',
        title: 'A identidade social associada pelo endereço de e-mail',
        whatHappens:
          'Endereço da empresa é reciclado. A Ana sai, os recursos humanos devolvem `ana@empresa.pt` ao contratado seguinte, ele entra com o Google e **herda a conta da Ana**: histórico, permissões, tudo. Ninguém invadiu nada — o sistema fez exactamente o que estava escrito, e o teste, que tinha um utilizador só, passou.',
        ours: 'A chave da identidade é o `providerAccountId` imutável — `sub` no Google e na Apple, o id numérico no GitHub — com `@@unique([provider, providerAccountId])`. O `email` em `oauth_accounts` é campo de apresentação e pode estar velho. E um endereço que o fornecedor não marcou como verificado não associa nada: o callback devolve `unverified_email`.',
      },
      {
        id: 'oauth-2fa',
        eyebrow: 'Segundo factor',
        title: 'A sessão emitida no callback do OAuth sem verificar o segundo factor',
        whatHappens:
          'Quem activou o código de seis dígitos de propósito descobre que “entrar com o Google” nunca o pede. O início de sessão social fica **estritamente mais fraco** que escrever a palavra-passe, e o segundo factor passa a ser opcional para quem souber em que botão clicar. O `TwoFactorGateGuard` não apanha: ele verifica que o 2FA está *activado*, nunca que *esta* sessão passou por ele.',
        ours: 'Se `twoFactorEnabled`, o callback não emite sessão: cria o mesmo ticket que `POST /auth/login` criaria, entrega-o num cookie de cinco minutos e uso único, e redirecciona para `/login?twofactor=1`. Cookie e não query string — a query string entra no histórico do navegador, no header `Referer` e no log de todos os proxies do caminho.',
      },
      {
        id: 'rls-where',
        eyebrow: 'Isolamento',
        title: 'O isolamento entre empresas confiado ao `where` da aplicação',
        whatHappens:
          'A garantia tornou-se disciplina humana, repetida em cada consulta, por todos os que entrarem na equipa depois de você. O primeiro `findUnique({ where: { id } })` por chave primária — escrito com pressa, ou por um agente que não conhecia a regra — devolve a linha de outra empresa. E não falha: **devolve dados, com estado 200**.',
        ours: 'O isolamento é do Postgres, não da aplicação: Row Level Security, com o escopo declarado por `SET LOCAL` dentro da transacção do pedido. Sem escopo nenhum, `current_setting(…, true)` devolve NULL e a política não casa — esquecer o escopo dá resultado **vazio**, nunca a linha da empresa errada. O filtro na aplicação continua lá, como conveniência; a garantia é a de baixo.',
      },
      {
        id: 'password-reset',
        eyebrow: 'Sessões',
        title: 'A reposição de palavra-passe que não encerra as sessões abertas',
        whatHappens:
          'A pessoa troca a palavra-passe justamente porque desconfia que alguém entrou. O hash novo não invalida nada: o refresh token do invasor **continua a renovar-se sozinho**, e ele fica dentro da conta muito depois da troca — indefinidamente, enquanto continuar a usar o sistema.',
        ours: 'O `resetPassword` grava a palavra-passe nova e o consumo do token na mesma transacção e, depois do commit, chama `revokeAllForUser` — todas as sessões existentes morrem, registadas na auditoria como logout deliberado. O refresh rotativo fecha o resto: um token antigo reapresentado revoga a família inteira.',
      },
      {
        id: 'db-owner',
        eyebrow: 'Base de dados',
        title: 'A `DATABASE_URL` a apontar para o proprietário da base de dados',
        whatHappens:
          'SUPERUSER — e qualquer role com `BYPASSRLS` — ignora Row Level Security mesmo com `FORCE ROW LEVEL SECURITY`. **Todas as políticas passam a ser decoração**, e o isolamento volta a depender de nenhuma query esquecer um `where`. Pior: os seus testes de isolamento passam, porque exercitam o filtro da aplicação, que está lá e está certo.',
        ours: 'A aplicação liga-se com uma role restrita, criada `NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`; o proprietário fica apenas em `DATABASE_ADMIN_URL`, para `migrate` e `seed`. A API **recusa arrancar** em produção se detectar superuser. E a suíte e2e corre sob a role restrita — é isso que faz o teste de isolamento provar algo em vez de repetir a intenção do código.',
      },
    ],
    moreTitle: 'Mais cinco, pelo mesmo desenho',
    more: [
      'Activar `trustProxy: true` para acabar com um 429 indevido. Confiar em todos os hops é aceitar qualquer `X-Forwarded-For` — e o navegador **pode** defini-lo, porque não está na lista de forbidden headers do fetch: um balde novo de rate limit a cada pedido. Aqui o IP é contado a partir da direita, com `CLIENT_IP_TRUSTED_HOPS`, e o BFF apaga todos os headers de forwarding vindos do navegador.',
      'Ler a base de dados num guard, antes de o escopo de tenant existir. O Nest corre guards **antes** dos interceptors, logo a política de RLS devolve zero linhas, o guard conclui “este utilizador não tem 2FA” e deixa passar — sem erro e sem log. Aqui, um guard que lê a base de dados abre escopo próprio e falha fechado.',
      'Enviar o e-mail de convite dentro da transacção. Um rollback entrega um link válido a apontar para uma empresa que não existe, e não fica registo para o suporte encontrar. Aqui, o `issue()` grava no `tx` de quem o chamou e o envio acontece depois do commit.',
      'Responder “esta conta usa início de sessão social” num login com palavra-passe. Torna-se um oráculo: é possível enumerar, cronometrando o formulário, exactamente quais endereços não têm palavra-passe. Aqui o erro é o genérico de sempre e paga o mesmo custo de Argon2 — o `verifyPassword(null, …)` verifica contra o hash de algo que ninguém conhece antes de responder `false`.',
      'Contar lugares antes de gravar o utilizador. Dois pedidos simultâneos leem “falta um” e ambos criam: contar não tranca nada. Aqui o `pg_advisory_xact_lock` por empresa e por recurso fica dentro da mesma transacção da escrita.',
    ],
  },

  configurator: {
    nameLabel: 'Nome',
    namePlaceholder: 'Acme Corp',
    nameHelp: 'Como chama o produto. Tudo o resto é derivado daqui.',
    slugLabel: 'Slug',
    slugHelp: 'Directório, pacote npm e identificadores. Minúsculas, dígitos e hífen.',
    slugDerived: 'derivado do nome',
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

    driverLabels: {
      db: 'Base de dados',
      storage: 'Storage',
      mail: 'E-mail',
      cache: 'Cache',
      queue: 'Fila',
      captcha: 'Captcha',
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
    flagsNote: 'Só o que difere do ponto de partida.',
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
        text: 'Avatar e anexos guardados fora da base de dados, atrás do port de storage: S3, MinIO, R2 ou disco local, trocáveis por `STORAGE_DRIVER`.',
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
        summary: 'Palavra-passe, isolamento na base de dados e a suíte de testes. Nada além disso.',
        audience:
          'Para quem vai construir o produto inteiro e só quer a base de acesso já provada.',
      },
      saas: {
        label: 'SaaS',
        summary:
          'Multi-empresa a sério: convites, planos com limite de lugares, 2FA e fila durável.',
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
    whatChangesLabel: 'O que muda no seu sistema',
    steps: {
      name: {
        eyebrow: 'Nome',
        question: 'Como se vai chamar o seu sistema?',
        help: 'Pode ser o nome do produto ou o da empresa. Tudo o resto sai daí: a pasta, o pacote, a base de dados e até o utilizador que o Postgres cria. As formas derivadas aparecem aqui em baixo enquanto escreve.',
        whatChanges:
          'O nome entra em 531 sítios, em três caixas diferentes: pacote, escopo do pnpm, nome de base de dados, prefixo de variável de ambiente, bucket, e o SQL que cria a role restrita do Postgres. O CI prova que não sobrou nenhum — gera com um nome de teste e exige zero ocorrências do antigo num `grep -ri`.',
      },
      preset: {
        eyebrow: 'Ponto de partida',
        question: 'Qual destes se parece mais com o que vai construir?',
        help: 'Isto só responde às próximas perguntas por você. Nada fica travado: se uma resposta não servir, mude no passo dela ou na revisão do fim.',
        whatChanges:
          'O ponto de partida apenas preenche as respostas seguintes. O CI testa a matriz das quatro integralmente: gera um projecto de cada, instala, verifica tipos e corre unitários e e2e. Fora dela, a combinação é permitida e não testada — e o CLI di-lo, numa linha.',
      },
      tenancy: {
        eyebrow: 'Empresas',
        question:
          'O seu sistema vai servir várias empresas diferentes, cada uma a ver apenas os próprios dados?',
        help: 'É a diferença entre «o cliente A viu o dado do cliente B» e «a base de dados recusou a linha antes de a aplicação dar por isso».',
        whatChanges:
          "A separação é do Postgres, não da aplicação: cada pedido declara o seu escopo com `SET LOCAL` dentro da transacção, e as políticas de Row Level Security comparam com `current_setting('app.current_tenant_id', true)`. Sem escopo, a comparação nunca é verdadeira — o resultado vem vazio, nunca da empresa errada. Uma tabela nova com `tenantId` protege-se sozinha: `SELECT app.apply_tenant_rls();` no fim da migration.",
        choices: {
          yes: {
            label: 'Sim, várias empresas',
            help: 'Cada empresa fica separada dentro da base de dados pelo próprio Postgres, e não por um filtro que alguém pode esquecer-se de escrever. Vem com painel de administração e troca de empresa.',
          },
          no: {
            label: 'Não, uma empresa só',
            help: 'O sistema nasce com uma empresa fixa e os ecrãs de troca ficam de fora. A separação continua dentro da base de dados — só não aparece no ecrã, porque não há o que trocar.',
          },
        },
      },
      entry: {
        eyebrow: 'Entrada',
        question: 'Como é que as pessoas vão conseguir entrar no sistema?',
        help: 'É a diferença entre acordar com mil contas de teste e ter de criar cada pessoa à mão. Quem pode criar conta é a decisão que mais muda o seu produto — e a que corre pior quando fica para depois.',
        whatChanges:
          "O convite guarda apenas o SHA-256 do token: base de dados vazada não rende link utilizável. Um índice único parcial (`WHERE status = 'PENDING'`) garante no máximo um convite vivo por e-mail e por empresa, e fecha a corrida de dois admins a convidar o mesmo colega no mesmo instante. O e-mail sai depois do commit — dentro da transacção, um rollback entregaria um link válido para uma empresa que não existe.",
        choices: {
          open: {
            label: 'Qualquer um se pode registar',
            help: 'Há formulário de registo aberto, e quem se regista cria a própria empresa. É o que um produto vendido pela internet precisa.',
          },
          invite: {
            label: 'Só quem for convidado',
            help: 'Um administrador convida por e-mail e o convidado escolhe a própria palavra-passe. Ninguém fica a saber a palavra-passe de outra pessoa, e o clique no link é o que prova que aquele endereço existe.',
          },
          seed: {
            label: 'Só as contas que eu criar',
            help: 'Sem registo e sem convite: a única conta é a que o sistema cria na instalação. Serve para uso interno — e significa que as outras pessoas cria-as à mão.',
          },
        },
      },
      social: {
        eyebrow: 'Início de sessão social',
        question: 'Quer o botão de entrar com Google, Apple ou GitHub?',
        help: 'É a diferença entre mais uma palavra-passe para o seu utilizador esquecer e um botão que ele já usa em todo o lado. Em troca, cada fornecedor pede uma chave que você cria no site deles.',
        whatChanges:
          'A conta é reconhecida pelo `providerAccountId` imutável, com `@@unique([provider, providerAccountId])` — nunca pelo e-mail, que é reciclado quando alguém sai da empresa. Um endereço que o fornecedor não marcou como verificado não associa nada: o callback devolve `unverified_email`. A lista de `OAUTH_PROVIDERS` e a do web têm de coincidir, senão o botão a mais dá 404; o gerador escreve os dois lados.',
        choices: {
          yes: {
            label: 'Sim, quero o botão',
            help: 'Google e GitHub activados, Apple disponível. As chaves cria-as na consola de cada um e cola no `.env`.',
          },
          no: {
            label: 'Não, só e-mail e palavra-passe',
            help: 'O código dos fornecedores sai do projecto — é menos coisa para manter. Para o ter de volta, gere outra vez com o início de sessão social activado.',
          },
        },
      },
      twoFactor: {
        eyebrow: 'Segundo factor',
        question: 'As pessoas devem poder exigir um código do telemóvel para entrar?',
        help: 'É a diferença entre «roubaram-lhe a palavra-passe» e «roubaram-lhe a palavra-passe e não entraram». A pessoa regista uma aplicação de autenticação uma vez e depois escreve seis dígitos quando o sistema pedir.',
        whatChanges:
          'O segundo factor vale em todas as portas de entrada, incluindo o início de sessão social: o callback não emite sessão, entrega um ticket no cookie `dp_2fa_ticket` — cinco minutos, queimado ao fim de poucas tentativas erradas — e a sessão real só nasce depois dos seis dígitos. Vêm códigos de recuperação de uso único, e `TWO_FACTOR_REQUIRED=true` passa a exigir o factor de toda a gente.',
        choices: {
          yes: {
            label: 'Sim, quero segundo factor',
            help: 'Cada pessoa activa na própria conta, com códigos de recuperação para o caso de perder o telemóvel. Para exigir de toda a gente, o projecto já traz `TWO_FACTOR_REQUIRED`.',
          },
          no: {
            label: 'Agora não',
            help: 'Entrar é só palavra-passe. Dá para activar depois — mas gerando o projecto de novo, porque responder não aqui remove o código do segundo factor.',
          },
        },
      },
      languages: {
        eyebrow: 'Idiomas',
        question: 'O sistema vai falar mais do que um idioma?',
        help: 'Isto é sobre o produto que vai gerar, não sobre esta página.',
        whatChanges:
          'Cada idioma é um ficheiro de mensagens dos dois lados, API e web. Um teste compara o conjunto de chaves entre eles e falha quando falta uma — que é exactamente como um ecrã aparece em inglês no meio do português, em produção.',
        choices: {
          one: {
            label: 'Um idioma',
            help: 'Os ecrãs e os e-mails saem num idioma só. O encanamento de tradução continua no código, portanto acrescentar um segundo depois não é refazer os ecrãs.',
          },
          many: {
            label: 'Mais do que um',
            help: 'Escolhe quais. Um teste garante que nenhum idioma fica com uma frase a faltar — que é como um ecrã aparece em inglês no meio do português.',
          },
        },
      },
      plans: {
        eyebrow: 'Planos',
        question: 'Vai vender planos com limite, do tipo “até 10 utilizadores”?',
        help: 'É a diferença entre cobrar por plano e torcer para ninguém abusar. É o que separa um plano básico de um avançado dentro do próprio sistema.',
        whatChanges:
          'O limite é conferido no momento que consome o lugar — o aceite do convite —, dentro da mesma transacção que cria o utilizador, com `pg_advisory_xact_lock` por empresa e por recurso. Contar antes de gravar não tranca nada: dois aceites no mesmo segundo passariam do tecto.',
        choices: {
          yes: {
            label: 'Sim, vou vender planos',
            help: 'Cada empresa ganha um limite de pessoas e contadores por recurso, com os ecrãs de uso e de troca de plano.',
          },
          no: {
            label: 'Não, todos iguais',
            help: 'Sem limite e sem contadores. Ninguém é travado por tamanho.',
          },
        },
      },
      files: {
        eyebrow: 'Ficheiros',
        question: 'As pessoas vão enviar ficheiros — fotografia de perfil, anexos, documentos?',
        help: 'Muda onde os ficheiros ficam guardados e como chegam ao navegador.',
        whatChanges:
          'O ficheiro sobe pela API e vai para o armazenamento pelo port `StorageProvider`, que tem três operações: `putObject`, `deleteObject` e `getPublicUrl`. Trocar S3 por MinIO, R2 ou disco local é mudar `STORAGE_DRIVER` no `.env` — a lógica não sabe qual está por trás.',
        choices: {
          yes: {
            label: 'Sim, vão enviar ficheiros',
            help: 'Avatar e anexos guardados fora da base de dados. Funciona com Amazon S3, MinIO, Cloudflare R2 ou o disco da máquina, e trocar entre eles é mudar uma linha de configuração.',
          },
          no: {
            label: 'Não é preciso',
            help: 'Sem envio de ficheiros e sem fotografia de perfil. Menos código, e nenhum bucket para configurar.',
          },
        },
      },
      captcha: {
        eyebrow: 'Robôs',
        question: 'Os ecrãs públicos precisam de protecção contra robôs?',
        help: 'É a diferença entre um robô testar mil palavras-passe por minuto e parar no primeiro puzzle. Vale para registo, início de sessão e recuperação de palavra-passe.',
        whatChanges:
          'O captcha entra nas rotas marcadas com `@RequireCaptcha`: registo, início de sessão, reenvio de verificação e recuperação de palavra-passe. `CAPTCHA_DRIVER` e `NEXT_PUBLIC_CAPTCHA_DRIVER` têm de combinar, senão todos os envios dão 400 por um token que o ecrã nunca teve como obter — o gerador escreve os dois. Fornecedor em baixo responde 503, não «passa toda a gente»: `CAPTCHA_FAIL_OPEN=false` é a predefinição.',
        choices: {
          yes: {
            label: 'Sim, quero protecção',
            help: 'Vem com o Cloudflare Turnstile, e o reCAPTCHA da Google como alternativa. As chaves cria-as no fornecedor.',
          },
          no: {
            label: 'Agora não',
            help: 'Sem puzzle no ecrã. O limite de tentativas por endereço de rede continua a valer, portanto não é «sem protecção»: é sem essa camada.',
          },
        },
      },
      review: {
        eyebrow: 'Revisão',
        question: 'Confirme antes de correr.',
        help: 'Cada linha volta à pergunta que a gerou. O comando é exactamente o que o gerador vai receber.',
      },
      done: {
        eyebrow: 'Pronto',
        question: 'É só copiar e correr.',
        help: 'Cole no terminal, na pasta onde quer o projecto. Dois minutos depois está a olhar para o ecrã de início de sessão dele.',
      },
    },
  },

  how: {
    title: 'Quatro passos, e o quarto é `pnpm dev`.',
    steps: [
      {
        title: 'Responda às perguntas',
        body: 'Aqui no site, uma de cada vez. Cada uma diz o que muda no código se responder sim ou não. Pode saltar com «usar o recomendado».',
      },
      {
        title: 'Copie o comando',
        body: 'O último ecrã mostra um comando só, com as suas escolhas lá dentro. Tem link partilhável, se quiser discutir a configuração com a equipa antes.',
      },
      {
        title: 'Corra no terminal',
        body: 'Descarrega o código, renomeia tudo para o seu projecto — pacotes, base de dados, variáveis, container —, levanta Postgres e Redis no Docker e semeia a base de dados.',
      },
      {
        title: '`pnpm dev`',
        body: 'API em `:4201`, web em `:4200`, e-mail capturado pelo Mailpit em `:4207`. O início de sessão do admin semeado está no README.',
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
    stackHead: { tech: 'Tecnologia', solves: 'O que resolve' },
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
    factoryTitle: 'De fábrica',
    factory: [
      {
        label: 'Acesso e sessão',
        text: 'Palavra-passe com Argon2, sessão em cookie httpOnly, refresh rotativo com detecção de reutilização — token roubado derruba a família inteira. Trocar a palavra-passe encerra as outras sessões.',
      },
      {
        label: 'Isolamento na base de dados',
        text: 'Row Level Security no Postgres, com o escopo declarado por pedido. Uma tabela nova com `tenantId` protege-se sozinha: `SELECT app.apply_tenant_rls();` no fim da migration.',
      },
      {
        label: 'Convites e onboarding',
        text: 'Token guardado apenas como hash, no máximo um convite pendente por e-mail (índice único parcial) e o e-mail a sair depois do commit — nunca dentro da transacção.',
      },
      {
        label: 'Cinco trocas por variável',
        text: 'Storage, e-mail, cache, fila e captcha atrás de interfaces: `STORAGE_DRIVER`, `MAIL_DRIVER`, `CACHE_DRIVER`, `QUEUE_DRIVER`, `CAPTCHA_DRIVER`.',
      },
      {
        label: 'Trabalho em segundo plano',
        text: 'BullMQ no Redis, com worker em processo separado e o tenant a viajar junto com o job. Sem ele, o job veria uma base de dados vazia e diria que correu bem.',
      },
      {
        label: 'Testes que provam',
        text: 'Unitários com a base de dados simulada, e2e contra um Postgres a sério sob a role restrita, e o kit de UI do web no Vitest.',
      },
    ],
    decisionsTitle: 'A parte que ninguém escreve',
    decisionsText:
      'Cada decisão de segurança tem um ficheiro em `docs/decisions/` e uma secção no `CLAUDE.md`, com o motivo e o que acontece se alguém a desfizer. É o que um agente lê antes de escrever — e o que você lê seis meses depois, quando já não se lembra por que está assim.',
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
        q: 'Isto analisa a aplicação que já tenho?',
        a: 'Não. O DontPanic não lê, não audita nem corrige código existente — **gera um projecto novo**, de raiz, com essas decisões já tomadas lá dentro. Se a sua aplicação já está de pé, o que se aproveita aqui é a leitura: gere um projecto de exemplo e compare com o seu, ou percorra «A prova» e confirme, no seu próprio código, se cada um dos cinco casos está resolvido. O comando não toca em nada do que já escreveu.',
      },
      {
        q: 'O que é testado, exactamente?',
        a: 'A matriz de predefinições, na íntegra: o CI gera um projecto de cada predefinição, exige zero ocorrências do nome antigo e corre install, typecheck, unitários e e2e. Mais all-on, all-off e cada feature desactivada isoladamente sobre a predefinição SaaS. Catorze features booleanas são 16 384 combinações, e o CI não testa 16 384 projectos: combinações fora dessa matriz são permitidas e não testadas — e o CLI di-lo, numa linha, sem drama. Um boilerplate que promete garantias que não verifica é pior que um que declara o limite.',
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
    brandNote:
      'Gerador de projectos a partir do boilerplate DontPanic. Escolhe as partes; o comando gera o repositório.',
    sourceNote: 'Os números desta página saem de `wc -l` e `grep` no repositório. Confirme.',
    license: 'MIT',
    productTitle: 'Produto',
    docsTitle: 'Documentação',
    contactTitle: 'Contacto',
    joke: 'Este rodapé foi montado por uma inteligência do tamanho de um planeta. Contém quatro listas de links. Não entre em pânico: o resto do código é mais interessante.',
  },
};
