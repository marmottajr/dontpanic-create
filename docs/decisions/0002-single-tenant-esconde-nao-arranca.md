# 0002 — Single-tenant esconde, não arranca

**Status:** aceita

## Contexto

Multi-tenancy no dontpanic não é um módulo: é o modelo de acesso a dados. Row Level
Security no Postgres, `SET LOCAL` por request, `prisma.db` carregando escopo,
`TenantContext`, `tenantId` denormalizado em `oauth_accounts` só para a varredura de
RLS alcançar a tabela, `PlanLimitsService` com advisory lock por empresa. Aparece em
32 dos 126 arquivos da API.

Muita gente que quer o boilerplate quer um app single-tenant.

## Decisão

`--no-multi-tenant` **não remove o RLS**. Gera o projeto com:

- um tenant fixo criado no seed, com id conhecido
- o escopo sempre aberto nesse tenant
- seletor de empresa, painel `/platform` e telas de gestão de tenant fora da UI
- `SUPERADMIN` fora do seed

## Consequências

**A favor:** um caminho de código, não dois. O RLS continua provado pelo
`tenant-isolation.e2e-spec.ts`, que é o teste que dá lastro ao argumento de segurança.
Custa uma fração do esforço de arrancar.

**Contra:** o projeto gerado carrega uma coluna `tenantId` que aquele produto nunca vai
usar de verdade, e uma política de RLS que sempre avalia true. O custo é uma coluna
indexada e um predicado que o Postgres resolve com constante — barato.

**O que rejeitamos:** arrancar o RLS sob `--no-multi-tenant`. Seria manter duas versões
de todo acesso a dados, e a versão sem RLS é justamente a que não podemos provar segura.
Vender "segurança de fábrica" e entregar o caminho não testado é o pior dos dois mundos.
