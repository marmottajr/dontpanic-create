# Prompt para o Claude Design

Cole o bloco abaixo no Claude Design. Depois de gerar, me mande o resultado que eu adapto o
código da landing (`apps/web`) ao design system que sair.

---

Preciso de um **design system completo e a landing page** de um produto para desenvolvedores.

## O produto

**DontPanic** é um boilerplate SaaS full-stack (NestJS + Next.js + Prisma + Postgres). A
pessoa escolhe, no site, quais partes quer no sistema dela — login em duas etapas, múltiplas
empresas, múltiplos idiomas, cobrança por plano, upload de arquivos — e recebe **um comando
de terminal** que baixa o código já com o nome do projeto dela em tudo: pacotes, banco de
dados, variáveis de ambiente.

O argumento de venda não é "economize tempo". É mais afiado: **as decisões de segurança que
uma IA erra em silêncio quando você pede "faça um SaaS" já vêm tomadas, documentadas e
testadas.** Erros como casar identidade social pelo e-mail (endereço reciclado herda a conta
de outra pessoa) ou emitir sessão no callback do OAuth sem checar o segundo fator. Erros que
compilam, passam no teste, passam no code review — e aparecem meses depois, num usuário que
não é você.

**O público é desenvolvedor sênior e tech lead.** Isso define o tom: nada de ilustração
genérica de startup, nada de gradiente roxo, nada de "revolucione seu workflow". Erro técnico
no conteúdo destrói a credibilidade da página inteira.

## A identidade que já existe (mantenha e refine)

- **O nome é "Don't Panic"** — a capa do Guia do Mochileiro das Galáxias. O letreiro é
  `DON'T` sobre `PANIC`, empilhado: cinco letras cada, então formam um bloco alinhado nas
  duas margens sem truque de layout. É o achado tipográfico da marca.
- **Âmbar/amarelo sobre fundo quase preto.** A cor é a da capa do Guia.
- **Tipografia:** títulos em Archivo (ou similar sem-serifa geométrica com eixo de largura
  variável, esticada a ~125% no letreiro); corpo de texto legível em tamanho generoso;
  monoespaçada para código, comandos e identificadores.
- **Humor nerd com parcimônia**, na voz do Marvin (o androide deprimido). E uma regra de ouro
  que não se quebra: **humor nunca aparece onde se fala de segurança.** A seção de provas é
  sóbria; o rodapé e as páginas de erro podem ter graça.
- **Dark mode e light mode**, ambos desenhados de propósito — não um invertido do outro.

## O que desenhar

### 1. Design system (a base)

- Escala de cores completa: fundo, superfícies elevadas, réguas/bordas, texto primário,
  secundário e apagado, o âmbar da marca, e **uma segunda cor de acento** para marcar "isto
  está provado por teste" (hoje é um verde-azulado). Nos dois temas.
- Escala tipográfica com nomes claros (display, h1, h2, h3, corpo, lead, small, meta,
  código). Inclua a régua de leitura (largura máxima de linha confortável).
- Escala de espaçamento, raios de canto, elevação.
- Componentes: botão (primário, secundário, texto), campo de texto com rótulo e mensagem de
  erro, seletor em cartão (radio grande), interruptor, chip removível, **bloco de código com
  botão de copiar**, bloco de terminal, tabela de dados densa, acordeão, seletor de idioma
  com bandeira, alternador de tema, modal, barra de progresso de etapas.

### 2. A landing page (uma artboard por seção)

1. **Hero** — o letreiro à esquerda, o argumento à direita, e o comando de terminal já
   visível e copiável. Três números de credibilidade abaixo (78 mil linhas de TypeScript que
   compilam e passam no lint; 6 recursos plugáveis por variável de ambiente; 2 minutos do
   comando ao sistema rodando).
2. **A prova** — a seção mais importante. Cada item tem três partes: *o código que passa no
   review* (num bloco de código **cinza, sem moldura vermelha e sem ícone de alerta** — o
   trecho tem que parecer aceitável, porque é exatamente isso que ele é num pull request),
   *o que acontece* (a consequência, em prosa), e *no DontPanic* (a decisão correta, marcada
   com a cor de "provado por teste"). Desenhe para 5 itens.
3. **Como funciona** — 4 passos: escolhe no site → copia o comando → roda → `pnpm dev`.
4. **O que vem dentro** — a stack e o que é de fábrica.
5. **Perguntas** — acordeão.
6. **Rodapé.**

### 3. O configurador — e aqui está o pedido central

Hoje o configurador é um formulário numa seção da página. **Quero que seja um modal em
assistente, passo a passo.** O motivo: quem chega não sabe o que é "multi-tenancy" nem
"Row Level Security", e um formulário com treze interruptores de uma vez faz a pessoa
desistir ou escolher errado.

Desenhe o fluxo assim:

- **Um botão grande na página abre o modal.**
- **Uma pergunta por passo.** A pessoa escolhe e clica em **Continuar**. Nada de mostrar
  tudo junto.
- **Cada passo explica o que é aquilo, em linguagem de gente** — não jargão. Junto da
  explicação, uma linha dizendo o que muda no sistema se ela disser sim ou não. Exemplo do
  tom: em vez de "habilitar multi-tenancy com RLS", pergunte **"Seu sistema vai atender
  várias empresas diferentes, cada uma vendo só os próprios dados?"**, e explique que isso é
  o que separa um sistema vendido para várias empresas de uma ferramenta interna de uma só.
- **Barra de progresso** no topo, mostrando em que passo está e quantos faltam.
- **Voltar** sempre disponível, sem perder o que já foi escolhido.
- **Um passo pode ser pulado** com um "usar o recomendado".
- **A tela final mostra o comando**, grande, com botão de copiar, mais um resumo em lista do
  que foi escolhido, e um **link compartilhável** da configuração.

Os passos, na ordem (cada um é uma configuração real do boilerplate):

| # | A pergunta, em linguagem de gente | O que configura |
| - | --------------------------------- | --------------- |
| 1 | **Como se chama o seu projeto?** Mostre, enquanto a pessoa digita, o que o nome vira: nome do banco, prefixo das variáveis, pacotes. É o momento em que ela entende que o rename é sério. | nome e slug |
| 2 | **Quer começar de um ponto de partida?** Quatro cartões: mínimo, SaaS (recomendado), completo, ferramenta interna. Cada um com uma frase de "para quem é". | preset |
| 3 | **Vai atender várias empresas, cada uma vendo só os próprios dados?** | multi-tenancy |
| 4 | **Como as pessoas entram?** Qualquer um se cadastra / só por convite / os dois. | signup público e convites |
| 5 | **Quer "entrar com Google/Apple/GitHub"?** | login social |
| 6 | **Quer pedir um código do celular além da senha?** | 2FA |
| 7 | **Em quantos idiomas?** | i18n |
| 8 | **Vai cobrar por plano, com limites?** | planos |
| 9 | **As pessoas vão subir arquivos?** | upload e storage |
| 10 | **Quer proteção contra robôs nos formulários públicos?** | captcha |
| 11 | **Revisão** — a lista do que foi escolhido, cada linha editável (volta para aquele passo). | — |
| 12 | **Pronto** — o comando, o botão de copiar, o link compartilhável, e os próximos passos. | — |

Desenhe **pelo menos 5 destes passos** como artboards separadas, incluindo
obrigatoriamente: o passo 1 (nome, com as formas derivadas aparecendo), o passo 2 (os quatro
cartões de ponto de partida), um passo de pergunta sim/não com explicação (o 3 ou o 6), a
revisão (11) e a tela final com o comando (12).

Mostre também **o estado de erro** do passo 1: a pessoa digitou um nome que não serve (por
exemplo "api", que é reservado), com a mensagem explicando e um botão que aplica a sugestão.

## Requisitos que não são negociáveis

- **Responsivo a partir de 380px.** O modal em celular é o caso difícil: pense nele antes.
- **Acessível:** navegação por teclado no assistente inteiro, foco visível, contraste AA.
- **Multi-idioma:** o header tem um seletor com 7 idiomas (pt-BR, pt-PT, inglês, espanhol,
  francês, alemão, italiano), com bandeira **e** o código do idioma — bandeira representa
  país, não idioma, e sem o rótulo fica ambíguo.
- Textos em **português do Brasil**. Termos técnicos e identificadores ficam no original
  (`Row Level Security`, `pnpm`, `DATABASE_URL`).

## O que eu não quero

Ilustração de pessoas em isométrico. Mockup de laptop flutuando. Gradiente roxo-azul.
Emoji como ícone de seção. "Simples, rápido e poderoso". Badge de "trusted by" sem
ninguém confiando ainda. Qualquer coisa que pareça um template de Tailwind que eu já vi
em vinte sites.
