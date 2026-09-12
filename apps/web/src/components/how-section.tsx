import { Section } from './layout';
import { RichText } from './rich-text';
import type { Messages } from '@/i18n/messages';

/**
 * Aqui a numeração é legítima pelo motivo mais simples: os quatro passos SÃO uma
 * sequência temporal, e o número diz em que ponto dela a pessoa está.
 */
export function HowSection({ messages }: { messages: Messages }): React.ReactElement {
  const { how } = messages;

  return (
    <Section id="how" title={how.title} lead={how.lead}>
      <ol className="grid gap-px bg-rule sm:grid-cols-2">
        {how.steps.map((step, index) => (
          <li key={step.title} className="bg-bg p-[26px]">
            <div className="flex items-baseline gap-3">
              <span className="label text-amber tabular-nums">
                {String(index + 1).padStart(2, '0')}
              </span>
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

      <div className="mt-12 border-t border-rule pt-6">
        <h3 className="text-h3 font-semibold">{how.renameTitle}</h3>
        <p className="measure mt-3 text-small text-dim">
          <RichText>{how.renameLead}</RichText>
        </p>
        <ul className="mt-5 space-y-3">
          {how.renameItems.map((item) => (
            <li key={item.slice(0, 24)} className="measure flex gap-3 text-small">
              <span aria-hidden="true" className="mt-[0.6em] h-px w-3 shrink-0 bg-dim/60" />
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
