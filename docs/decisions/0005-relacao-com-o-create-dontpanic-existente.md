# 0005 — Relação com o `create-dontpanic` que já existe

**Status:** aceita (pendente de confirmação do Marcio sobre a estratégia de publicação)

## Contexto

Descoberto durante a auditoria, e não sabido quando este projeto começou: **já existe um
gerador**, em `packages/create-dontpanic` dentro do próprio repo do boilerplate, publicado no
npm como `create-dontpanic@0.3.0`.

O que ele faz hoje:

- troca `package.json:name` e `container_name`
- copia o template (materializado por `scripts/build-template.mjs`)
- prompts básicos com `@clack/prompts`

O que ele **não** faz — e o teste dele prova que é intencional, não esquecimento
(`src/scaffold.test.ts:52-63` verifica que `POSTGRES_USER: dontpanic` permanece intacto):

- não renomeia o escopo pnpm `@dontpanic/*` (203 ocorrências)
- não renomeia a role do Postgres `dontpanic_app` (29 ocorrências, 13 num SQL de migration)
- não toca `.env`, nem os bancos, nem o bucket, nem o branding
- não tem seleção de features
- gera um projeto cujo CI quebra no primeiro push (ver `docs/achados-no-boilerplate.md`, item 1)

Ou seja: é um scaffolder de nome de pasta, não um gerador de projeto.

## Decisão

O gerador novo **substitui** o `create-dontpanic`, e o nome no npm é reaproveitado em vez de
abandonado. Três consequências práticas:

1. **O nome `create-dontpanic` não está tomado por terceiros — é do Marcio.** A conclusão
   anterior de que precisaríamos do escopo `@dontpanic/*` por indisponibilidade estava errada.
   Publicar como `create-dontpanic@1.0.0` mantém `npx create-dontpanic` funcionando e é o
   caminho mais curto para quem já conhece.

2. **`packages/cli` deste repo é o sucessor.** O `packages/create-dontpanic` do boilerplate
   deve ser aposentado — mas só depois de o sucessor passar o CI de conformidade, e com um
   release de transição que avise quem usa a versão antiga.

3. **O CI de conformidade tem que excluir `packages/create-dontpanic/template/`** da
   verificação. É uma cópia integral gitignorada do próprio repo: sem a exclusão, o `grep`
   de conformidade conta 879 ocorrências em vez de 506, e renomear ali é inútil porque o
   diretório é regenerado.

## Ponto aberto para o Marcio

O gerador vive neste repo separado (pedido dele), enquanto o antecessor vive dentro do
boilerplate. As duas opções de publicação:

- **`create-dontpanic@1.0.0` a partir deste repo** — um só nome, um só caminho, `npx
  create-dontpanic` continua valendo. Exige tirar o pacote antigo do boilerplate para os dois
  não disputarem a mesma versão.
- **`@dontpanic/create` como nome novo** — coexistência pacífica, ao custo de dois pacotes
  fazendo a mesma coisa no npm e de um comando mais longo.

A recomendação é a primeira. Enquanto não houver decisão, o `package.json` deste pacote
declara `@dontpanic/create`, que é trocável numa linha.
