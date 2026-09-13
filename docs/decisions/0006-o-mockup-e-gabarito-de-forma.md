# 0006 — O mockup é gabarito de forma; a verdade vem do código

**Status:** aceita (regra do Marcio, 13/09/2026)

## Contexto

O design da landing nasce no Claude Design, como mockup navegável. Ele traz três coisas ao
mesmo tempo, e elas têm autoridades diferentes:

1. **Layout** — grade, hierarquia, espaçamento, onde cada seção entra.
2. **Voz** — o jeito de escrever: frases curtas, verbo na frente, sem jargão de marketing.
3. **Conteúdo** — os números, os comandos, os nomes de arquivo, as contagens de teste.

Para produzir um mockup completo, quem desenha precisa preencher o terceiro com *alguma
coisa*. E foi o que aconteceu: o mockup trouxe `pnpm dlx dontpanic@latest init meu-app`
(comando que não existe), `localhost:3000` (o projeto vive no range 42xx), "78.412 linhas",
"6 recursos plugáveis" e um quinto erro sobre webhook de pagamento — que a API não tem.

## Decisão

**O mockup é autoridade sobre forma e voz. O código é autoridade sobre conteúdo.**

Ao implementar qualquer tela a partir de um design:

- **Copie** a estrutura, a ordem das seções, a hierarquia tipográfica, o comprimento e o
  ritmo das frases, o tom.
- **Meça** tudo que é afirmação verificável: comandos (rodam?), portas, contagens de linha,
  número de adapters, casos de teste, nomes de arquivo, nomes de variável.
- Quando os dois discordam, **o código ganha** — e o texto é reescrito para dizer a verdade
  no mesmo tom que o mockup usava.

## Por que isto não é preciosismo

A página inteira se sustenta num único argumento: *aqui as decisões de segurança já foram
tomadas e estão provadas por teste*. O leitor é desenvolvedor sênior, e o bloco de provas
exibe contagens (`coberto por teste · 46 casos`) ao lado de nomes de spec.

Basta que ele tente **um** comando que não roda, ou confira **um** número que não bate, para
que todos os outros percam o valor. Um dado inventado não custa aquele dado: custa a
credibilidade do conjunto, que é o único ativo que a página tem.

É a mesma disciplina que o boilerplate aplica a si mesmo — `docs/achados-no-boilerplate.md`
registra sete garantias que o `CLAUDE.md` afirmava e o código não cumpria. Seria incoerente
cobrar isso do produto e não da página que o vende.

## Consequência prática

Quando um número da landing muda porque o código mudou, isso não é retrabalho — é o sistema
funcionando. E quando um texto do mockup não sobrevive à medição, o que se preserva dele é a
**frase**: mesmo comprimento, mesmo ritmo, conteúdo corrigido.
