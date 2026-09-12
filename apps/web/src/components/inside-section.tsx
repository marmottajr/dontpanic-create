import { Section } from './layout';
import { RichText } from './rich-text';
import { STACK } from '@/content/stack';
import type { Messages } from '@/i18n/messages';

/**
 * "O que vem dentro": a stack como tabela densa à esquerda, o que vem de fábrica como
 * grade de tópicos à direita.
 *
 * A tabela é tabela de verdade — `<table>` com `<th scope>` —, não uma grade de divs.
 * São duas colunas de dados relacionados, e um leitor de tela precisa poder dizer "Zod,
 * contratos de request e response" em vez de ler dezesseis fragmentos soltos.
 *
 * No fim, o bloco com régua `--proof`: a parte do produto que ninguém escreve e que é,
 * na prática, o que esta página inteira está vendendo.
 */
export function InsideSection({ messages }: { messages: Messages }): React.ReactElement {
  const { inside } = messages;

  return (
    <Section id="inside" title={inside.title} lead={inside.lead}>
      <div className="grid-safe grid gap-12 lg:grid-cols-2 lg:gap-10">
        <div>
          <h3 className="label label-wide text-dim">{inside.stackTitle}</h3>
          <div className="scroll-thin mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-rule">
                  <th scope="col" className="label py-2 pr-4 text-faint">
                    {inside.stackHead.tech}
                  </th>
                  <th scope="col" className="label py-2 text-faint">
                    {inside.stackHead.solves}
                  </th>
                </tr>
              </thead>
              <tbody>
                {STACK.map((name, index) => (
                  <tr key={name} className="border-b border-rule align-baseline">
                    <th scope="row" className="py-2.5 pr-4 font-mono text-small font-normal">
                      {name}
                    </th>
                    <td className="py-2.5 text-small text-dim">{inside.stackRoles[index]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="label label-wide text-dim">{inside.factoryTitle}</h3>
          <div className="mt-4 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {inside.factory.map((topic) => (
              <div key={topic.label}>
                <h4 className="font-semibold">{topic.label}</h4>
                <p className="mt-1.5 text-small text-dim">
                  <RichText>{topic.text}</RichText>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-12 border-l-2 border-proof bg-proof-wash p-[26px]">
        <h3 className="label text-proof">{inside.decisionsTitle}</h3>
        <p className="measure mt-2.5">
          <RichText>{inside.decisionsText}</RichText>
        </p>
      </div>

      <div className="mt-12 border-t border-rule pt-6">
        <h3 className="label label-wide text-dim">{inside.numbersTitle}</h3>
        <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {inside.numbers.map((fact) => (
            <div key={fact.label}>
              <dt className="display text-[26px] leading-none tabular-nums">{fact.value}</dt>
              <dd className="mt-2 text-small text-dim">
                <RichText>{fact.label}</RichText>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
