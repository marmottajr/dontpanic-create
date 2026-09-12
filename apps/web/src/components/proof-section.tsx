import { Section } from './layout';
import { RichText } from './rich-text';
import { PROOF_ARTIFACTS, PROOF_ORDER } from '@/content/proofs';
import type { Messages } from '@/i18n/messages';

/**
 * "A prova" — a seção que carrega o argumento, e a única sem uma única piada.
 *
 * Decisões editoriais que estão no desenho, não no texto:
 *
 * - **O código é cinza.** Nada de moldura vermelha nem ícone de alerta. O trecho tem
 *   que parecer aceitável, porque é exactamente isso que ele é num pull request — e é
 *   essa a tese da seção. Colori-lo de perigo entregaria a resposta antes da pergunta.
 * - **A barra de caminho de arquivo** em cima do código diz onde aquilo mora no
 *   repositório. Uma citação sem procedência é uma anedota.
 * - **O selo verde nomeia o teste e conta os casos.** É o compromisso mais forte da
 *   página: o número sai de `grep -cE '^\\s+(it|test)\\(' <arquivo>` no repo do
 *   boilerplate, e o arquivo aparece embaixo. Quem duvidar, confere.
 * - **A numeração é legítima aqui**: não é uma sequência de passos, mas os itens são
 *   referenciáveis — "o 03" — e o número em mono âmbar é o que transforma o cabeçalho
 *   em etiqueta de especificação.
 */
export function ProofSection({ messages }: { messages: Messages }): React.ReactElement {
  const { proof } = messages;
  const copyById = new Map(proof.items.map((item) => [item.id, item]));

  return (
    <Section id="proof" eyebrow={proof.eyebrow} title={proof.title} lead={proof.lead}>
      <div className="space-y-14 sm:space-y-16">
        {PROOF_ORDER.map((id, position) => {
          const artifact = PROOF_ARTIFACTS[id];
          const copy = copyById.get(id);
          if (!copy) return null;

          return (
            <article key={id} className="border-t border-rule pt-6">
              <p className="label label-wide text-amber">
                {String(position + 1).padStart(2, '0')} · {copy.eyebrow}
              </p>
              <h3 className="measure mt-2.5 text-h3 font-semibold">
                <RichText>{copy.title}</RichText>
              </h3>

              <div className="grid-safe mt-6 grid items-start gap-7 lg:grid-cols-2 lg:gap-10">
                <div className="code-block">
                  <div className="code-path">{artifact.file}</div>
                  <div className="code-body">
                    <code>{artifact.code}</code>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="label text-dim">{proof.labels.whatHappens}</p>
                    <p className="mt-2">
                      <RichText>{copy.whatHappens}</RichText>
                    </p>
                  </div>

                  <div className="border-l-2 border-proof pl-4">
                    <p className="label text-proof">{proof.labels.ours}</p>
                    <p className="mt-2">
                      <RichText>{copy.ours}</RichText>
                    </p>

                    <p className="mt-3.5 inline-flex flex-wrap items-baseline gap-x-2 rounded-1 border border-proof bg-proof-wash px-2.5 py-1.5 font-mono text-meta">
                      <span aria-hidden="true" className="text-proof">
                        ✓
                      </span>
                      <span>
                        {proof.labels.seal} · {artifact.testCases} {proof.labels.cases}
                      </span>
                      <span className="text-faint">{artifact.testSpec}</span>
                    </p>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-14 border-t border-rule pt-6">
        <h3 className="label label-wide text-dim">{proof.moreTitle}</h3>
        <ul className="mt-5 grid gap-4 lg:grid-cols-2 lg:gap-x-10">
          {proof.more.map((item) => (
            <li key={item.slice(0, 24)} className="border-l border-rule pl-4 text-small text-dim">
              <RichText>{item}</RichText>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
