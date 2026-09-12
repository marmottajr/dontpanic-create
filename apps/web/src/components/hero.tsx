import { CommandBlock } from './command-block';
import { RichText } from './rich-text';
import { Shell } from './section';
import { NPM_PACKAGE, REPO_URL } from '@/content/stack';
import type { Messages } from '@/i18n/messages';

/**
 * O letreiro.
 *
 * “DON’T” e “PANIC” têm cinco letras cada, então empilhados formam um bloco alinhado
 * nas duas margens sem truque de layout — é o achado tipográfico que justifica esticar
 * o eixo `wdth` do Archivo até 125%: a capa do Guia, em letras grandes e amigáveis.
 *
 * O letreiro é a marca; o `<h1>` é o argumento. Deixar o letreiro ser o `<h1>` daria
 * uma página cujo título é o nome do produto — bonito e sem informação.
 */
export function Hero({
  messages,
  command,
}: {
  messages: Messages;
  command: string;
}): React.ReactElement {
  const { hero } = messages;

  return (
    <section id="top" className="pt-10 pb-14 sm:pt-16 sm:pb-20">
      <Shell>
        {/*
         * A coluna do letreiro é `max-content`, não uma largura fixa.
         *
         * Com `minmax(0,20rem)` ela media 320px enquanto o `font-size` do letreiro
         * chegava a 7rem: "PANIC" em extrabold com o eixo `wdth` em 125% ocupa cerca de
         * 400px, então o letreiro transbordava a própria coluna e passava POR CIMA do
         * `<h1>`. Texto que estoura a coluna não a faz crescer — `minmax` dimensiona a
         * faixa, não o conteúdo, e o excesso simplesmente vaza.
         *
         * `max-content` amarra a coluna ao tamanho real do letreiro, então as duas
         * crescem juntas e o `clamp` continua livre para escolher o tamanho.
         */}
        <div className="grid items-start gap-8 lg:grid-cols-[max-content_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-0">
          <div
            role="img"
            aria-label={hero.mastheadLabel}
            className="select-none font-extrabold uppercase leading-[0.84] tracking-[-0.03em] text-amber-display w-mast text-[clamp(3.4rem,17vw,6.4rem)] lg:text-[clamp(4rem,7.4vw,7rem)]"
          >
            <div>Don’t</div>
            <div>Panic</div>
          </div>

          {/*
           * A marginália do hero.
           *
           * Sob o letreiro sobra uma faixa vertical vazia de umas trezentas alturas de
           * linha — o `<h1>` ao lado é mais alto que o bloco de duas linhas. Em vez de
           * decorar o vazio, ele recebe o mesmo tratamento que toda seção desta página
           * tem: uma faixa de metadados técnicos. Isso faz a grade anotada aparecer já
           * na primeira tela, em vez de começar só na seção seguinte, e o que está ali
           * é o que alguém procura antes de rodar um `npx` de terceiro — o nome do
           * pacote, a licença e o repositório.
           *
           * Fica escondido no telefone: numa coluna só, ele se interporia entre a marca
           * e o argumento.
           */}
          <div className="rail hidden lg:col-start-1 lg:row-start-2 lg:mt-8 lg:block">
            <div className="font-mono text-text">{NPM_PACKAGE}</div>
            <div className="mt-1">{messages.footer.license}</div>
            <a
              href={REPO_URL}
              rel="noreferrer noopener"
              className="mt-1 block font-mono hover:text-amber"
            >
              marmottajr/dontpanic
            </a>
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <h1 className="measure text-h1 font-bold tracking-[-0.02em]">{hero.title}</h1>
            <p className="measure mt-6 text-lead text-dim">
              <RichText>{hero.lead}</RichText>
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
              <a
                href="#build"
                className="inline-flex items-center rounded-control bg-amber-solid px-4 py-2.5 text-small font-semibold text-on-amber hover:brightness-105"
              >
                {hero.ctaConfigure}
              </a>
              <a href="#proof" className="text-small text-amber underline-offset-4 hover:underline">
                {hero.ctaProof}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12 sm:mt-14">
          <CommandBlock
            command={command}
            label={hero.commandLabel}
            copy={messages.configurator.copy}
            copied={messages.configurator.copied}
            copyFailed={messages.configurator.copyFailed}
            size="large"
          />
          <p className="mt-3 text-meta text-dim">
            <RichText>{hero.commandNote}</RichText>
          </p>
        </div>

        <dl className="mt-12 grid border-t border-rule sm:grid-cols-3">
          {hero.facts.map((fact) => (
            <div
              key={fact.label}
              className="border-b border-rule py-5 sm:border-b-0 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0"
            >
              <dt className="text-[1.6rem] font-bold leading-none tabular-nums w-wide">
                {fact.value}
              </dt>
              <dd className="measure-tight mt-2 text-meta text-dim">
                <RichText>{fact.label}</RichText>
              </dd>
            </div>
          ))}
        </dl>
      </Shell>
    </section>
  );
}
