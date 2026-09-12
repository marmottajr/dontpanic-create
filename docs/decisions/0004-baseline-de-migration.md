# 0004 — Baseline de migration montada de fragmentos, não gerada pelo Prisma

**Status:** aceita

## Contexto

O boilerplate tem 6 migrations. O projeto gerado não pode herdá-las: um projeto sem
convites nunca teve convites, e um histórico que cria a tabela `invitations` em setembro
de 2026, com o nome de outro projeto, é falso em dois sentidos. O sentido operacional é
o que dói: `prisma migrate dev` compara o estado final do histórico com o schema, então
com a tabela criada no histórico e ausente do schema podado, o **primeiro `db:migrate`
do usuário** ofereceria um `DROP TABLE` para desfazer o que a baseline acabou de fazer.

Então o projeto gerado recebe **uma** migration, `prisma/migrations/0_init/migration.sql`,
que produz num banco vazio exatamente o schema que a receita pediu. A pergunta é de
onde sai o DDL dela.

Parte do conteúdo não é derivável de schema nenhum e teria de ser concatenada à mão em
qualquer alternativa:

- o schema `app` e as funções de contexto (`current_tenant_id`, `is_platform_admin`,
  `is_system`, `tenant_visible`);
- `app.apply_tenant_rls()` — a varredura que protege toda tabela com `tenantId` — e
  `app.apply_user_owned_rls()`;
- `ENABLE` / `FORCE ROW LEVEL SECURITY` e as políticas;
- os índices parciais, como o `UNIQUE(tenantId, email) WHERE status = 'PENDING'` dos
  convites, que a linguagem do Prisma não sabe expressar;
- a role restrita, seus `GRANT`s e os `ALTER DEFAULT PRIVILEGES`.

## Opções

**(a) `prisma migrate diff --from-empty --to-schema-datamodel`** no projeto gerado. É a
ferramenta certa e produz o DDL canônico do schema podado. Exige o CLI do Prisma **com
os engines baixados** — ou seja, acontece depois do `pnpm install`, que é opcional
(`--no-install`) e depende de rede. Isso inverte a ordem do pipeline (env e git
passariam a depender do install) e cria um modo de falha novo: um projeto gerado, com
todos os arquivos no lugar, **sem migration nenhuma**, descoberto no `db:migrate`.

**(b) Montar a baseline do SQL que o boilerplate já tem**, filtrando o que a poda de
features removeu.

## Decisão

(b). A baseline é montada em `packages/cli/src/prisma.ts`, a partir dos arquivos
`migration.sql` que vieram no template, em fases de dependência:

```
enums → tables → alters → indexes → constraints → rls → app-role → final-sweep
```

Cada aresta é uma falha real se invertida. Duas merecem nome:

- **`app-role` depois de `tables`**: `GRANT … ON ALL TABLES IN SCHEMA public` só alcança
  o que existe naquele instante. Rodar antes das tabelas concede permissão sobre o
  vazio; o `migrate` termina com sucesso e a API recusa toda query em runtime.
- **`final-sweep` por último**: `SELECT app.apply_tenant_rls()` é idempotente e fecha o
  arquivo, para que nenhuma tabela criada acima fique fora do isolamento — a mesma
  disciplina que o boilerplate exige de toda migration nova.

O que torna (b) seguro é uma propriedade do gerador de migrations do Prisma: ele
**rotula cada statement** (`-- CreateTable`, `-- CreateEnum`, `-- CreateIndex`,
`-- AddForeignKey`, `-- AlterTable`) e emite um statement por objeto, com o nome do
objeto entre aspas. Não é parsing de SQL arbitrário — é reagrupar a saída de um gerador.
O SQL manual passa inteiro, verbatim, comentários incluídos: são a melhor documentação
que o projeto gerado pode ter, no lugar onde ela importa.

O que torna (b) honesto é que **nenhum fragmento de DDL é versionado neste repo**. Ele
vem do template, que o `sync-template` materializa de uma tag do boilerplate. Se o
boilerplate mudar uma coluna, a baseline do próximo sync muda junto; não há cópia à mão
para apodrecer.

Uma transformação de verdade acontece: `ALTER TYPE … ADD VALUE` é **dobrado** no
`CREATE TYPE` correspondente. No histórico, `Role` nasce com `('ADMIN','USER')` e ganha
`'SUPERADMIN'` numa migration posterior — duas transações. Na baseline os dois cairiam
na mesma, e `ALTER TYPE … ADD VALUE` dentro de transação é território de pegadinha do
Postgres. Dobrar elimina a questão.

**A opção (a) continua valendo — como verificação.** No CI de conformidade: gerar,
instalar, rodar `migrate diff --from-migrations … --to-schema-datamodel` e exigir saída
vazia. Lá ela não custa nada e prova tudo.

## Consequências

**A favor:** a geração é offline, determinística e independente do `pnpm install`. Duas
execuções da mesma receita produzem o mesmo arquivo, o que é o que permite ao CI de
conformidade comparar execuções. O SQL manual — que é o ativo de segurança do produto —
viaja verbatim, sem tradução.

**Contra:** o filtro de statements precisa entender o suficiente do SQL do Prisma para
saber o que cada statement exige. Toda regra nova do gerador de migrations do Prisma
(um tipo de statement inédito) chega aqui como um statement não classificado. Por isso o
default é **passar adiante** o que não foi reconhecido, e não descartar: perder DDL em
silêncio produziria uma coluna faltando, sem pista de quem a removeu.

O filtro de colunas erra deliberadamente para o lado de **manter**. Uma coluna a mais faz
o `migrate dev` do usuário oferecer um `DROP COLUMN` — chato, visível, corrigível. Uma
coluna a menos quebra a aplicação num INSERT, em runtime.

**O que rejeitamos:** fragmentos de SQL escritos à mão neste repo, um por feature. Seria
a variante de (b) que parece mais organizada e é a pior das três: DDL duplicado longe do
schema que ele descreve, sem nada que force a atualização quando o boilerplate mudar — e
o sintoma seria uma coluna faltando no projeto gerado, com o boilerplate compilando.

**O que o RLS não negocia:** a baseline mantém o Row Level Security em **toda** receita,
inclusive `--no-multi-tenant` (ADR 0002). Se os fragmentos `rls` ou `app-role` saírem
vazios, a geração emite aviso: sem a role restrita a API conectaria como dono do banco,
e aí nenhuma política vale nada.
