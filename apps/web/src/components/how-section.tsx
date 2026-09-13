import { Section } from './layout';
import { RichText } from './rich-text';
import type { Messages } from '@/i18n/messages';

/**
 * "Como funciona", em quatro colunas com régua fina no topo.
 *
 * A forma vem do desenho, e o motivo de ela ser melhor que os cartões que estavam aqui
 * é coerência: o resto da página é grade de especificação anotada — réguas finas,
 * rótulo em mono, sem moldura. Quatro cartões com borda eram a única ilha de outro
 * idioma visual.
 *
 * O título entrega a promessa em vez de anunciar a seção, e passa por `RichText` porque
 * carrega `pnpm dev` entre acentos graves: o quarto passo é literalmente o comando, e
 * escrevê-lo em mono é o que faz o título ser verificável olhando a quarta coluna.
 *
 * A numeração é legítima: os quatro passos são uma sequência temporal, e o número diz
 * em que ponto dela a pessoa está.
 */
export function HowSection({ messages }: { messages: Messages }): React.ReactElement {
  const { how, nav } = messages;

  return (
    <Section id="how" eyebrow={nav.how} title={<RichText>{how.title}</RichText>}>
      <ol className="grid gap-8 sm:grid-cols-2 sm:gap-x-10 lg:grid-cols-4">
        {how.steps.map((step, index) => (
          <li key={step.title} className="border-t border-rule pt-4">
            <p className="label text-faint tabular-nums">{String(index + 1).padStart(2, '0')}</p>
            <h3 className="mt-2.5 font-semibold">
              <RichText>{step.title}</RichText>
            </h3>
            <p className="mt-2 text-small text-dim">
              <RichText>{step.body}</RichText>
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-14 border-t border-rule pt-6">
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
