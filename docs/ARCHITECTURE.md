# Arquitetura do gerador

## O que este repo é

Dois artefatos e um portão:

| Artefato | Onde | O que faz |
| -------- | ---- | --------- |
| `create-dontpanic` | `packages/cli` | CLI que gera um projeto a partir de uma receita |
| Landing page | `apps/web` | Site estático que monta a linha de comando |
| Conformance CI | `.github/workflows` | Gera projetos por preset e prova que compilam e passam |

## O princípio: o site é burro, o CLI é a verdade

A landing page **não gera código**. Ela monta uma string:

```
npx create-dontpanic acme --preset=saas --i18n=pt,en --no-oauth
```

Sem servidor, sem fila de build, sem zip para expirar em cache. O site pode ser
export estático atrás de CDN, e não existe estado para divergir do código.

Toda a lógica de geração mora no CLI, versionada junto com o número de versão do
template. Uma receita mais um `@version` produzem o mesmo projeto hoje e em dois anos.

## O princípio: subtrair, nunca templatizar

O template é o **repo dontpanic real, que compila e roda**. O gerador só apaga.

A alternativa — encher o código de `{{#if twoFactor}}` — destrói exatamente o ativo
que estamos vendendo: um repo onde `pnpm test` passa e `pnpm dev` sobe. Um boilerplate
que não roda no próprio CI não convence ninguém de que é seguro.

Consequência: cada feature removível precisa de **costuras** (seams) — pontos onde a
remoção é cirúrgica e localizável por padrão âncora, não por string exata. Ver
`docs/maps/feature-surface.md`.

## O princípio: o rename é provado, não conferido

O nome do projeto aparece em ~531 lugares, em 3 caixas, e dentro de SQL que cria uma
role do Postgres. Nenhuma revisão humana garante isso.

O portão é mecânico: gera com o nome `acme`, roda `grep -ri dontpanic` e exige **zero**,
e só então `install && typecheck && test && test:e2e`. Se passar, o rename está certo
por construção. Ver `.github/workflows/conformance.yml`.

## Fluxo de geração

```
argv/prompts ──▶ Recipe ──┬──▶ validação (deps de feature, slug legal)
                          │
                          ├──▶ NameForms (deriva 13 formas de um nome)
                          │
      template/ ──────────┼──▶ cópia para targetDir
                          │
                          ├──▶ manifesto: apaga arquivos das features desligadas
                          ├──▶ manifesto: aplica costuras nos arquivos que sobrevivem
                          ├──▶ prisma: poda schema + monta baseline SQL
                          ├──▶ rename: 13 formas em todo arquivo de texto + caminhos
                          ├──▶ env: escreve .env com segredos gerados
                          ├──▶ compose: emite só os serviços necessários
                          ├──▶ docs: poda seções do CLAUDE.md das features ausentes
                          │
                          └──▶ git init, pnpm install, próximos passos
```

A ordem não é arbitrária:

- **Remoção antes do rename.** Renomear primeiro faria o motor gastar trabalho em
  arquivos que vão ser apagados, e — pior — os padrões âncora do manifesto são escritos
  contra o repo original. Depois do rename, `@dontpanic/shared` já não existe para casar.
- **Prisma antes do rename.** A baseline SQL é montada a partir de fragmentos que
  mencionam a role `dontpanic_app`; o rename passa por cima dela como passa por
  qualquer outro arquivo, num só lugar.
- **Env por último, antes do git.** Os valores gerados (segredos, URLs de banco com a
  role nova) já nascem com o nome final e não devem ser reescritos pelo rename.

## Por que o gerador vive em outro repo

Pedido do Marcio, e tem uma razão que sustenta: o ciclo de release do gerador não é o
do boilerplate. A divergência que isso cria — gerador falando de um código que mudou —
não é evitada por proximidade de diretório, e sim detectada por teste: o CI de
conformidade sincroniza o template de uma **tag** do `marmottajr/dontpanic` e falha
quando uma costura do manifesto deixa de casar. Falhar no CI do gerador é o sinal certo,
e chega antes do usuário.

O template não é versionado aqui (ver `.gitignore`): `pnpm sync-template` o materializa
a partir da tag declarada em `packages/cli/template.json`.
