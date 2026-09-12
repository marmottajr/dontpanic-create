import { RichText } from './rich-text';
import { Section } from './section';
import type { Messages } from '@/i18n/messages';

/**
 * `<details>` nativo, e não um acordeão próprio: ele já abre com Enter e Espaço, já
 * anuncia estado, e é pesquisável pelo Ctrl+F do navegador mesmo fechado nos motores
 * que implementam `hidden=until-found`. Um acordeão em JavaScript só empataria.
 */
export function FaqSection({ messages }: { messages: Messages }): React.ReactElement {
  const { faq } = messages;

  return (
    <Section
      id="faq"
      title={faq.title}
      lead={faq.lead}
      rail={<span className="font-mono">docs/decisions/0001–0003</span>}
    >
      <div>
        {faq.items.map((item, index) => (
          <details key={item.q} className="group border-t border-rule" open={index === 0}>
            <summary className="flex cursor-pointer list-none items-baseline gap-3 py-4 text-h3 font-semibold [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="mt-[0.35em] shrink-0 text-amber transition-transform group-open:rotate-90"
              >
                <svg viewBox="0 0 8 10" width="7" height="9" fill="none">
                  <path d="M1 1l5 4-5 4" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </span>
              <span>{item.q}</span>
            </summary>
            <p className="measure pb-6 pl-[1.15rem] text-small text-dim">
              <RichText>{item.a}</RichText>
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
