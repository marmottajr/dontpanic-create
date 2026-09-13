# Design aprovado × site implementado

Comparação feita em 13/09/2026, com o canvas do Claude Design de um lado e
`localhost:4210` do outro. As capturas estão neste diretório: `design-*.jpg` é o mockup,
`site-*.jpg` é o que está no ar.

**A lista está separada em três grupos, e a separação é o ponto:** nem toda diferença é um
erro do site. Em alguns lugares o site diverge porque o mockup afirma coisas que o código
não sustenta — e ali o site é que está certo.

---

## 1. O site tem de mudar (o design está melhor)

### 1.1 Falta o bloco de chamada entre "A prova" e "Como funciona"

O design tem um bloco inteiro que o site não tem:

> **Doze perguntas. Um comando no fim.**
> Uma pergunta por tela, em português, com o que muda no sistema escrito embaixo. Nada de
> treze interruptores de uma vez.
> **[ Montar o meu sistema → ]**
> `sem cadastro · dá para voltar em qualquer passo`

É o único ponto da página, fora do hero e do header, que convida a abrir o assistente — e
está exatamente onde a pessoa acabou de ler os cinco erros e está mais convencida. A nota
"sem cadastro" responde a objeção que todo mundo tem antes de clicar.

### 1.2 "Como funciona" tem título e forma diferentes

| | Design | Site |
| --- | --- | --- |
| Título | **Quatro passos, e o quarto é `pnpm dev`.** | "Como funciona" + lead "Quatro passos, e só o terceiro demora." |
| Forma | 4 colunas, régua fina no topo de cada, número pequeno em mono | Cards com borda, 2×2 |

O título do design é melhor: já entrega a promessa em vez de anunciar a seção. E as quatro
colunas com régua são coerentes com a grade de especificação anotada do resto da página —
os cards com borda destoam.

### 1.3 O lead do hero

O do design fala do **benefício**; o do site repete a stack, que já está no eyebrow logo
acima:

> **Design:** "Escolha o que o seu sistema precisa. Receba um comando. O código chega com o
> nome do seu projeto em tudo — pacotes, banco, variáveis de ambiente — e com as escolhas
> difíceis já feitas do jeito certo."
>
> **Site:** "DontPanic é um boilerplate SaaS full-stack — NestJS, Next.js, Prisma, Postgres
> com Row Level Security de verdade. Cada escolha de segurança já foi feita, está explicada
> no `CLAUDE.md`…"

### 1.4 Rótulo do segundo botão

`Ver os cinco erros` (design) é mais concreto que `Ver os erros que isso evita` (site) — diz
quantos são, e o número é verificável descendo a página.

---

## 2. O site está certo, o mockup é que erra

**Não copiar estes.** São casos em que o design afirma o que o código não faz.

| Onde | Mockup | Realidade | Por quê |
| --- | --- | --- | --- |
| Comando do hero | `pnpm dlx dontpanic@latest init meu-app` | `npx create-dontpanic 'Nome'` | O pacote publicado é `create-dontpanic`, e a interface não tem subcomando `init`. O comando do mockup não roda. |
| Porta no 3º número | `localhost:3000` | `:4200` / `:4201` | O boilerplate inteiro vive no range 42xx — é convenção dele, documentada no `CLAUDE.md`. |
| 1º número | 78.412 | **78.533** | Medido no repositório. |
| 2º número | 6 recursos plugáveis | **5** | O banco saiu da lista de ports: trocá-lo exige mexer no `schema.prisma`, não numa variável de ambiente. |
| 5º item da prova | webhook de pagamento sem assinatura verificada | `DATABASE_URL` apontando para o dono do banco | Grep na API: zero ocorrências de webhook/stripe/billing. Num bloco que promete "coberto por teste · N casos", um item inventado derruba a credibilidade dos outros quatro. |

---

## 3. Diferenças que são escolha, não erro

- **Eyebrow do hero.** Design: `BOILERPLATE SAAS · NESTJS + NEXT.JS + PRISMA`. Site
  acrescenta `· POSTGRES`. A favor de manter: o Postgres não é detalhe de stack aqui, é onde
  mora o argumento (RLS). A favor de tirar: linha mais curta respira melhor.
- **Campo de nome no hero.** O site tem um campo com botão "Começar"; o design vai direto ao
  assistente. O campo adianta o passo 1 para quem já sabe o que quer, ao custo de um
  elemento a mais na dobra.
- **Nota sob os botões.** Design: "Doze perguntas em linguagem de gente. Dá para pular
  qualquer uma." Site: "Precisa de Node 24 e pnpm. Para escolher as partes, responda o
  assistente — são doze perguntas." A do design convida; a do site informa um pré-requisito
  real que evita frustração no terminal. Dá para ter as duas, em linhas separadas.
