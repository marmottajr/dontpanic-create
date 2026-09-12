import { RichText } from './rich-text';
import { Section } from './section';
import { PROOF_ARTIFACTS, PROOF_ORDER } from '@/content/proofs';
import type { Messages } from '@/i18n/messages';

/**
 * "A prova" — a seção que carrega o argumento, e a única sem uma única piada.
 *
 * Decisões editoriais que estão no desenho:
 *
 * - **O código errado é cinza.** Nada de moldura vermelha nem ícone de alerta. O
 *   trecho tem que parecer aceitável, porque é exatamente isso que ele é num pull
 *   request — e é essa a tese da seção. Colori-lo de perigo entregaria a resposta antes
 *   da pergunta e destruiria o argumento.
 * - **Sem numeração.** Cinco erros independentes não são uma sequência; o marcador
 *   estrutural é o `surface`, que diz onde no repositório o assunto mora.
 * - **O verdete aparece uma vez por item**, na régua do parágrafo “No DontPanic”. É a
 *   única cor que significa "isto está provado por teste", e gastá-la em outro lugar
 *   apagaria o significado.
 */
export function ProofSection({ messages }: { messages: Messages }): React.ReactElement {
  const { proof } = messages;
  const copyById = new Map(proof.items.map((item) => [item.id, item]));

  return (
    <Section
      id="proof"
      title={proof.title}
      lead={proof.lead}
      /*
       * A marginália traz só a origem.
       *
       * Antes ela abria com `{items.length} + {more.length}`, que renderizava "5 + 3" —
       * cinco erros detalhados mais três descritos em texto. Só que isso está claro para
       * quem escreveu o componente e para mais ninguém: um "5 + 3" solto na margem não
       * diz o que está somando, e um número que o leitor não consegue interpretar é
       * ruído com aparência de dado. Rotulá-lo exigiria uma chave nova nos sete idiomas
       * para explicar uma contagem que a própria seção já mostra ao ser lida.
       *
       * O caminho do repositório se explica pela convenção `owner/repo` e não precisa de
       * tradução, então é o que fica.
       */
      rail={<span className="font-mono">marmottajr/dontpanic</span>}
    >
      <div className="space-y-14">
        {PROOF_ORDER.map((id) => {
          const artifact = PROOF_ARTIFACTS[id];
          const copy = copyById.get(id);
          if (!copy) return null;

          return (
            <article key={id} className="border-t border-rule pt-7">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h3 className="measure text-h3 font-semibold tracking-[-0.01em]">
                  <RichText>{copy.title}</RichText>
                </h3>
                <span className="font-mono text-meta text-dim">{artifact.surface}</span>
              </div>

              <div className="mt-6 grid gap-7 lg:grid-cols-2 lg:gap-10">
                <div className="min-w-0">
                  <p className="rail mb-2">{proof.labels.code}</p>
                  <div className="well">
                    <code>{artifact.code}</code>
                  </div>
                  <div className="mt-5">
                    <p className="rail mb-1.5">{proof.labels.whyItPasses}</p>
                    <p className="text-small text-dim">
                      <RichText>{copy.whyItPasses}</RichText>
                    </p>
                  </div>
                </div>

                <div className="min-w-0 space-y-5">
                  <div>
                    <p className="rail mb-1.5">{proof.labels.whatHappens}</p>
                    <p className="text-small">
                      <RichText>{copy.whatHappens}</RichText>
                    </p>
                  </div>
                  <div className="border-l-2 border-verdigris pl-4">
                    <p className="rail mb-1.5 text-verdigris">{proof.labels.ours}</p>
                    <p className="text-small">
                      <RichText>{copy.ours}</RichText>
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-14 border-t border-rule pt-7">
        <h3 className="text-h3 font-semibold">{proof.moreTitle}</h3>
        <ul className="mt-5 space-y-4">
          {proof.more.map((item) => (
            <li
              key={item.slice(0, 24)}
              className="measure border-l border-rule pl-4 text-small text-dim"
            >
              <RichText>{item}</RichText>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
