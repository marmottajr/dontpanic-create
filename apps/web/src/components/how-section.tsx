import { RichText } from './rich-text';
import { Section } from './section';
import type { Messages } from '@/i18n/messages';

/**
 * Aqui a numeração é legítima: os quatro passos são uma sequência temporal, e o número
 * diz em que ponto dela a pessoa está. É o único lugar da página com marcador numérico.
 */
export function HowSection({ messages }: { messages: Messages }): React.ReactElement {
  const { how } = messages;

  return (
    <Section
      id="how"
      title={how.title}
      lead={how.lead}
      rail={<span className="font-mono">npx → pnpm dev</span>}
    >
      <ol className="grid gap-px bg-rule sm:grid-cols-2">
        {how.steps.map((step, index) => (
          <li key={step.title} className="bg-bg p-5 sm:p-6">
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-meta text-amber tabular-nums">{index + 1}</span>
              <h3 className="text-h3 font-semibold">
                <RichText>{step.title}</RichText>
              </h3>
            </div>
            <p className="mt-3 text-small text-dim">
              <RichText>{step.body}</RichText>
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-12 border-t border-rule pt-7">
        <h3 className="text-h3 font-semibold">{how.renameTitle}</h3>
        <p className="measure mt-3 text-small text-dim">
          <RichText>{how.renameLead}</RichText>
        </p>
        <ul className="mt-5 space-y-3">
          {how.renameItems.map((item) => (
            <li key={item.slice(0, 24)} className="measure flex gap-3 text-small">
              <span aria-hidden="true" className="mt-[0.55em] h-px w-3 shrink-0 bg-rule-strong" />
              <span>
                <RichText>{item}</RichText>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
