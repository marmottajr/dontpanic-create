'use client';

import { useRef } from 'react';

import { Shell } from './layout';
import { RichText } from './rich-text';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext } from '@/lib/configurator-context';

/**
 * A chamada entre "A prova" e "Como funciona".
 *
 * É o único convite a abrir o assistente fora do hero e do cabeçalho, e a posição é o
 * argumento: a pessoa acabou de ler os cinco erros e está no ponto mais convencido da
 * página. A nota em mono responde, antes de o dedo chegar ao botão, a objeção que todo
 * botão de produto levanta — "isto vai me pedir e-mail?".
 *
 * Não é uma `<Section>`: não tem título de seção nem entra na navegação. É um bloco
 * emoldurado dentro do ritmo vertical, como no desenho — e a moldura é o que o separa
 * das duas seções entre as quais ele mora.
 */
export function CtaSection({ messages }: { messages: Messages }): React.ReactElement {
  const { wizard } = useConfiguratorContext();
  const button = useRef<HTMLButtonElement>(null);
  const { cta } = messages;

  return (
    <section className="border-t border-rule py-14 sm:py-[72px]">
      <Shell>
        <div className="grid-safe grid items-center gap-7 border border-rule bg-surface p-[26px] sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:gap-12">
          <div>
            <h2 className="display measure-tight text-balance text-h2">{cta.title}</h2>
            <p className="measure mt-3.5 text-dim">
              <RichText>{cta.text}</RichText>
            </p>
          </div>

          <div>
            <button
              ref={button}
              type="button"
              onClick={() => wizard.openWizard(button.current)}
              className="w-full rounded-1 bg-amber px-5 py-3.5 font-semibold text-on-amber hover:brightness-105"
            >
              {messages.wizard.openHero} →
            </button>
            <p className="mt-2.5 text-center font-mono text-meta text-faint lg:text-left">
              {cta.note}
            </p>
          </div>
        </div>
      </Shell>
    </section>
  );
}
