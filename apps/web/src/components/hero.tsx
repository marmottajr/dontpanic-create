'use client';

import { useRef } from 'react';

import { CommandBlock } from './command-block';
import { Shell } from './layout';
import { RichText } from './rich-text';
import { HERO_META } from '@/content/stack';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext } from '@/lib/configurator-context';

/**
 * O hero.
 *
 * O letreiro é dimensionado pelo **contêiner**, não pela viewport: `cqw` mede a coluna
 * em que ele está, então "DON'T / PANIC" fecha nas duas margens tanto no telefone
 * (onde a coluna é a tela) quanto no desktop (onde é metade dela). Com `vw` isso só
 * acertaria numa largura e sobraria ou faltaria em todas as outras.
 *
 * "DON'T" e "PANIC" têm cinco letras cada — empilhadas, formam um bloco alinhado sem
 * truque de layout. É o achado tipográfico que justifica esticar o eixo `wdth` do
 * Archivo: a capa do Guia, em letras grandes e amigáveis.
 *
 * O letreiro é a marca; o `<h1>` é o argumento. Deixar o letreiro ser o `<h1>` daria
 * uma página cujo título é o nome do produto — bonito e sem informação.
 */
export function Hero({ messages }: { messages: Messages }): React.ReactElement {
  const ctx = useConfiguratorContext();
  const { hero } = messages;
  const startButton = useRef<HTMLButtonElement>(null);

  return (
    <section id="top" className="pt-8 pb-14 sm:pt-12 sm:pb-[72px]">
      <Shell>
        <p className="label label-wide text-faint">{HERO_META}</p>

        <div className="mt-7 grid items-start gap-8 lg:grid-cols-[minmax(0,34%)_minmax(0,1fr)] lg:gap-14">
          <div className="[container-type:inline-size]">
            <p
              role="img"
              aria-label={hero.mastheadLabel}
              className="masthead select-none text-amber"
              style={{ fontSize: 'max(38px, 25.1cqw)' }}
            >
              <span className="block">Don’t</span>
              <span className="block">Panic</span>
            </p>
          </div>

          <div className="min-w-0">
            <h1 className="display measure text-h2">{hero.title}</h1>
            <p className="measure mt-5 text-lead text-dim">
              <RichText>{hero.lead}</RichText>
            </p>

            {/* O campo de nome aqui não é um segundo configurador: é a primeira
                pergunta do assistente, adiantada. Quem digita e clica entra no modal
                já no passo 2, com o nome no lugar. */}
            <div className="mt-7 flex flex-col gap-2 sm:flex-row">
              <label htmlFor="hero-name" className="sr-only">
                {messages.configurator.nameLabel}
              </label>
              <input
                id="hero-name"
                type="text"
                value={ctx.recipe.project.displayName}
                onChange={(event) => ctx.setDisplayName(event.target.value)}
                placeholder={messages.configurator.namePlaceholder}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-1 border border-rule bg-surface px-3.5 py-3 text-ink placeholder:text-faint"
              />
              <button
                ref={startButton}
                type="button"
                onClick={() => ctx.wizard.openWizard(startButton.current)}
                className="shrink-0 rounded-1 bg-amber px-5 py-3 font-semibold text-on-amber hover:brightness-105"
              >
                {hero.nameCta}
              </button>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2">
              <button
                type="button"
                onClick={() => ctx.wizard.openWizard(null)}
                className="text-small font-semibold text-amber underline-offset-4 hover:underline"
              >
                {messages.wizard.openHero} →
              </button>
              <a href="#proof" className="text-small text-dim underline-offset-4 hover:underline">
                {hero.ctaProof}
              </a>
            </div>
          </div>
        </div>

        <div className="mt-12">
          <CommandBlock
            command={ctx.command}
            label={hero.commandLabel}
            copy={messages.configurator.copy}
            copied={messages.configurator.copied}
            copyFailed={messages.configurator.copyFailed}
            size="large"
          />
          <p className="mt-2.5 text-small text-dim">
            <RichText>{hero.commandNote}</RichText>
          </p>
        </div>

        <dl className="mt-12 grid border-t border-rule sm:grid-cols-3">
          {hero.facts.map((fact) => (
            <div
              key={fact.label}
              className="border-b border-rule py-5 sm:border-b-0 sm:border-r sm:px-6 sm:first:pl-0 sm:last:border-r-0"
            >
              <dt className="display text-[28px] leading-none tabular-nums">{fact.value}</dt>
              <dd className="measure-tight mt-2 text-small text-dim">
                <RichText>{fact.label}</RichText>
              </dd>
            </div>
          ))}
        </dl>
      </Shell>
    </section>
  );
}
