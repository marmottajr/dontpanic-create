# 0003 — Presets em vez de matriz livre

**Status:** aceita

## Contexto

13 features booleanas são 8192 combinações. O CI não testa 8192 projetos.

## Decisão

A landing oferece **presets** como porta de entrada, com toggles por cima. O CI de
conformidade testa a matriz de presets integralmente, mais um punhado de combinações
de risco conhecido (all-on, all-off, e cada feature desligada isoladamente sobre o
preset `saas`).

Combinações fora dessa matriz são *permitidas* e *não testadas* — e o CLI diz isso,
uma linha, sem drama.

## Consequências

O número de execuções de CI fica linear no número de features (N+2) em vez de
exponencial. A honestidade sobre o que é testado é parte do produto: um boilerplate
que promete garantias que não verifica é pior que um que declara o limite.
