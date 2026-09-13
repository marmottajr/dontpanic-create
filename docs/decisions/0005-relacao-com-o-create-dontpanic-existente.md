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
- gera um projeto cujo CI quebra no primeiro push (template sem lockfile, `--frozen-lockfile` no workflow)

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

## Decidido: `create-dontpanic@1.0.0`, a partir deste repositório

O pacote deste repo **assume o nome** `create-dontpanic`, em `1.0.0`. Quem já conhece
`npx create-dontpanic` continua com o mesmo comando e passa a receber o gerador de
verdade; quem nunca usou não precisa aprender um nome de transição.

`1.0.0` e não `0.4.0` porque a mudança de comportamento é grande: o antecessor trocava o
nome da pasta e do container, e este renomeia o escopo pnpm, a role do Postgres, o banco,
o bucket e o branding, remove features e monta a baseline de migration. Manter `0.x`
sugeriria continuidade onde há substituição.

### O que isso exige do boilerplate

**Duas coisas, e ambas do lado de `marmottajr/dontpanic`:**

1. **Desativar o `.github/workflows/publish-create-dontpanic.yml`.** Ele dispara em tag
   `v*` e publica `create-dontpanic` a partir de `packages/create-dontpanic`. Com os dois
   repositórios ativos, o mesmo nome tem dois publicadores e o último a rodar ganha — e o
   boilerplate ganha por acidente, porque a tag `v*` dele é empurrada com mais frequência.
   Desativar (apagar, ou trocar o trigger por `workflow_dispatch`) é o que impede uma
   release do boilerplate de sobrescrever o gerador com o instalador antigo.

2. **Aposentar `packages/create-dontpanic`.** Pode sair num PR próprio, depois de o
   sucessor estar publicado. Enquanto estiver lá, o `sync-template` já o exclui do
   template e o CI de conformidade já o ignora nos greps — então ele não atrapalha, só
   confunde quem lê o repositório.

O segredo `NPM_TOKEN` precisa existir em `marmottajr/dontpanic-create` com permissão de
publish para `create-dontpanic`.
