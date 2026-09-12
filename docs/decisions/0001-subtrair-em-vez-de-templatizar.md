# 0001 — Subtrair em vez de templatizar

**Status:** aceita

## Contexto

O gerador precisa produzir variações do boilerplate. Duas técnicas possíveis:

1. **Templating** — o código base recebe diretivas (`{{#if twoFactor}}`) e o gerador
   as resolve.
2. **Subtração** — o código base é real e completo, e o gerador apaga o que não foi
   pedido.

## Decisão

Subtração.

## Consequências

**A favor:** o repo base compila, roda, tem `pnpm dev` e passa 99% de cobertura. É o
produto demonstrando o que vende. Um dev pode clonar o dontpanic direto e ignorar o
gerador — e a experiência é a mesma.

**Contra:** exige *costuras*. Um `app.module.ts` com 16 imports precisa que a linha do
`OAuthModule` seja localizável e removível. Onde a costura não existe, precisamos
criá-la no repo dontpanic (extrair para arquivo próprio, registrar por lista) em vez de
marcar com comentário condicional.

**O que rejeitamos junto:** blocos `// #if feature` no código. Sobrevivem ao build mas
poluem 800 arquivos e convidam o próximo dev a aninhá-los. Se uma costura ficar
impossível sem eles, a resposta certa é refatorar o dontpanic, não marcar o código.
