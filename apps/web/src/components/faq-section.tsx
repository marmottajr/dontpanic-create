import { Section } from './layout';
import { RichText } from './rich-text';
import type { Messages } from '@/i18n/messages';

/**
 * `<details>` nativo, e não um acordeão próprio: ele já abre com Enter e Espaço, já
 * anuncia o estado, e é encontrável pelo Ctrl+F do navegador mesmo fechado nos motores
 * que implementam `hidden=until-found`. Um acordeão em JavaScript só empataria.
 *
 * O marcador é `+` / `−` em mono, como o design pede — e `group-open:` faz a troca em
 * CSS, sem estado em React.
 */
export function FaqSection({ messages }: { messages: Messages }): React.ReactElement {
  const { faq } = messages;

  return (
    <Section id="faq" title={faq.title} lead={faq.lead}>
      <div>
        {faq.items.map((item, index) => (
          <details
            key={item.q}
            className="group border-t border-rule last:border-b"
            open={index === 0}
          >
            <summary className="flex cursor-pointer list-none items-baseline gap-3.5 py-4 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="font-mono text-amber">
                <span className="group-open:hidden">+</span>
                <span className="hidden group-open:inline">−</span>
              </span>
              <span className="text-h3 font-semibold">{item.q}</span>
            </summary>
            <p className="measure pb-6 pl-[1.6rem] text-small text-dim">
              <RichText>{item.a}</RichText>
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}
