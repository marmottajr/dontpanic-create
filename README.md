# DontPanic — gerador e landing page

Este repo contém as duas metades da porta de entrada do
[DontPanic](https://github.com/marmottajr/dontpanic): o site onde a pessoa escolhe o que quer
no seu SaaS, e o CLI que entrega exatamente aquilo.

O boilerplate em si **não** vive aqui. Vive em `marmottajr/dontpanic`, e este repo o consome
por tag.

```
packages/cli/     create-dontpanic — o gerador
apps/web/         a landing page (Next.js, export estático)
docs/             arquitetura, decisões e os mapas da auditoria
```

## Como funciona, em uma frase

O site monta uma linha de comando; o CLI a executa contra uma cópia real do boilerplate,
apagando o que não foi pedido e renomeando o que sobrou.

```bash
npx create-dontpanic acme --preset=saas --i18n=pt,en --no-oauth
```

> **É o mesmo `npx` de sempre.** `create-dontpanic` já existia no registry — era o
> instalador anterior, que vivia em `packages/create-dontpanic` dentro do boilerplate e
> trocava só `package.json:name` e `container_name`. Este pacote o **sucede** no mesmo
> nome, em `1.0.0`, para que quem já conhece o comando não precise aprender outro.
>
> Consequência operacional: o `publish-create-dontpanic.yml` do boilerplate tem de ser
> desativado, ou os dois repositórios publicam o mesmo nome e o último a rodar ganha. Ver
> [ADR 0005](docs/decisions/0005-relacao-com-o-create-dontpanic-existente.md).

Nenhum servidor gera código. O site é estático e a receita cabe na própria URL, o que quer
dizer que um link de configuração pode ser colado num Slack e continuar valendo em dois anos.

## Desenvolvimento

```bash
pnpm install
pnpm sync-template          # materializa o template a partir da tag do boilerplate
pnpm build
pnpm test
pnpm --filter web dev       # a landing em :3000
```

O `sync-template` precisa do repo do boilerplate por perto (por padrão `../dontpanic`) e
**recusa rodar se aquele working tree estiver sujo** — template tirado de repo sujo é
irreprodutível.

## O portão de qualidade

O rename atravessa ~490 ocorrências do nome em 199 arquivos, em variantes que incluem o SQL
que cria a role do Postgres. Revisão humana não dá conta disso, então a garantia é mecânica:

```bash
pnpm conformance
```

Gera um projeto por preset, exige **zero** ocorrências do nome antigo, e então roda
`install → build → typecheck → lint → test` em cada um. Se o boilerplate mudar de um jeito
que desfaça uma costura do manifesto, é aqui que aparece — antes do usuário.

### O e2e é passo local, e isso é deliberado

`pnpm conformance` **não** roda a suíte e2e por padrão, e o CI também não. Ela sobe
Postgres, aplica as migrations, cria a role restrita e abre um navegador: são minutos por
caso, vezes oito casos.

O que fica de fora tem nome. `tenant-isolation.e2e-spec.ts` é o **único** teste que prova
que o isolamento entre empresas continua de pé no projeto **gerado**, depois da poda de
features e do rename — e ele é justamente o que falha calado: sem o escopo certo, o Row
Level Security devolve zero linhas em vez de erro, e o projeto parece estar funcionando
com um banco vazio.

Por isso, **antes de empurrar mudanças no caminho de geração**:

```bash
docker compose up -d                        # na pasta do dontpanic, para ter o Postgres
pnpm conformance --e2e                      # a matriz inteira
pnpm conformance --case=preset-saas --e2e   # só o preset default, mais rápido
```

Um hook de `pre-commit` lembra disso — mas só quando o commit toca `src/features/`,
`src/seams/`, o motor de rename, a baseline do Prisma, a geração de env ou a tag do
template. Ele avisa e **não bloqueia**: um hook que impede o commit ensina a decorar
`--no-verify`, e aí o próximo aviso também é pulado. O `pnpm install` o instala
(`core.hooksPath`); para pular num commit específico, `git commit --no-verify`.

Para rodar a matriz com e2e no CI sob demanda: **Actions › Conformidade › Run workflow ›
marcar "Incluir a suíte e2e"**.

## O que o gerador faz, concretamente

Um `npx` resolve, numa passada, o que separava "clonei o boilerplate" de "tenho o meu projeto":

| Passo | O que acontece |
| ----- | -------------- |
| **Remove features** | Apaga arquivos exclusivos e aplica costuras cirúrgicas nos arquivos que sobrevivem — `app.module.ts`, `schema.prisma`, `.env.example`, navegação, catálogos de i18n e as seções do `CLAUDE.md` que documentavam a feature ausente |
| **Monta a baseline** | Uma migration só, em vez do histórico de 6. Sem isso, o primeiro `db:migrate` do usuário ofereceria um `DROP TABLE` para desfazer o que a baseline acabou de criar |
| **Renomeia** | ~490 ocorrências em 199 arquivos, em 17 regras ordenadas por especificidade, incluindo o SQL que cria a role do Postgres e cinco formas de apóstrofo |
| **Verifica** | Se sobrou uma ocorrência, a geração **falha**. Um projeto meio renomeado quebra no `pnpm install` com uma mensagem que não aponta para a causa |
| **Gera segredos** | JWT, CSRF, MinIO e a senha do seed, todos sorteados. A senha do boilerplate é **rotacionada**, não renomeada — `AcmeCorp42!` seria previsível para quem sabe a origem, e a origem é pública |
| **Enxuga a infra** | `docker-compose.yml` só com os serviços que a receita usa, e o override de dev podado junto — um `depends_on` órfão faz o `up` esperar para sempre, sem erro |

## Leitura obrigatória antes de mexer

| Documento | O que resolve |
| --------- | ------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | o desenho, o fluxo de geração e por que a ordem das etapas não é arbitrária |
| [`docs/decisions/`](docs/decisions/) | as decisões tomadas e o que foi rejeitado junto |
| [`docs/maps/`](docs/maps/) | a auditoria do boilerplate: onde está cada ocorrência do nome, cada feature e cada variável de ambiente |
| [`docs/achados-no-boilerplate.md`](docs/achados-no-boilerplate.md) | defeitos encontrados no boilerplate durante a auditoria, ainda não corrigidos |

Os mapas foram produzidos por auditoria do repo e são a especificação do gerador. Mudou o
boilerplate? O mapa correspondente envelheceu, e o CI de conformidade é quem avisa.
