import { RichText } from './rich-text';
import { Section } from './section';
import { PORTS, STACK } from '@/content/stack';
import type { Messages } from '@/i18n/messages';

export function InsideSection({ messages }: { messages: Messages }): React.ReactElement {
  const { inside } = messages;

  return (
    <Section
      id="inside"
      title={inside.title}
      lead={inside.lead}
      rail={<span className="font-mono">apps/api · apps/web · packages/shared</span>}
    >
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
        {/* `min-w-0` nas duas colunas: a tabela de ports tem `min-w-[30rem]` e, sem
            isto, a largura mínima automática do item de grid passa por cima da faixa e
            arrasta a página inteira para a rolagem horizontal num telefone. */}
        <div className="min-w-0">
          <h3 className="text-h3 font-semibold">{inside.stackTitle}</h3>
          <dl className="mt-5">
            {STACK.map((name, index) => (
              <div key={name} className="border-t border-rule py-2.5 sm:flex sm:gap-4">
                <dt className="font-mono text-meta text-text sm:w-[13.5rem] sm:shrink-0">{name}</dt>
                <dd className="text-meta text-dim">{inside.stackRoles[index]}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0">
          <h3 className="text-h3 font-semibold">{inside.portsTitle}</h3>
          <p className="mt-3 text-small text-dim">{inside.portsLead}</p>
          <div className="scroll-thin mt-5 overflow-x-auto">
            <table className="w-full min-w-[30rem] border-collapse text-left">
              <thead>
                <tr className="rail border-b border-rule-strong">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {inside.portsHead.resource}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    {inside.portsHead.adapters}
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    {inside.portsHead.env}
                  </th>
                </tr>
              </thead>
              <tbody>
                {PORTS.map((row, index) => (
                  <tr key={row.port} className="border-b border-rule align-top">
                    <th scope="row" className="py-2.5 pr-3 text-meta font-normal">
                      {inside.portsResources[index]}
                      <span className="block font-mono text-[0.72rem] text-dim">{row.port}</span>
                    </th>
                    <td className="py-2.5 pr-3 font-mono text-[0.72rem] text-dim">
                      {row.adapters}
                    </td>
                    <td className="py-2.5 font-mono text-[0.72rem] text-amber">{row.env}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-12 border-t border-rule pt-7">
        <h3 className="text-h3 font-semibold">{inside.numbersTitle}</h3>
        <dl className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {inside.numbers.map((fact) => (
            <div key={fact.label}>
              <dt className="text-[1.5rem] font-bold leading-none tabular-nums w-wide">
                {fact.value}
              </dt>
              <dd className="mt-2 text-meta text-dim">
                <RichText>{fact.label}</RichText>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Section>
  );
}
