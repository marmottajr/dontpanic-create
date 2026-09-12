'use client';

import { useRef } from 'react';

import { Shell } from './layout';
import { LocaleSwitcher } from './locale-switcher';
import { ThemeToggle } from './theme-toggle';
import type { Locale } from '@/i18n/locales';
import type { Messages } from '@/i18n/messages';
import { useConfiguratorContext } from '@/lib/configurator-context';

/**
 * O cabeçalho.
 *
 * A marca em duas linhas à esquerda — "DON'T" sobre "PANIC", as duas com cinco letras,
 * o que as faz alinhar nas duas margens sem truque. O botão âmbar de montar fica
 * sempre visível, inclusive no telefone: é a única ação da página, e escondê-la atrás
 * de um menu sanduíche a tornaria opcional.
 */
export function SiteHeader({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}): React.ReactElement {
  const { wizard } = useConfiguratorContext();
  const button = useRef<HTMLButtonElement>(null);
  const { nav } = messages;

  const links = [
    { href: '#proof', text: nav.proof },
    { href: '#how', text: nav.how },
    { href: '#inside', text: nav.inside },
    { href: '#faq', text: nav.faq },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-bg/92 backdrop-blur-sm">
      <Shell className="flex h-16 items-center gap-2 sm:gap-4">
        <a href="#top" className="masthead shrink-0 text-[13px] text-amber">
          <span className="block">Don’t</span>
          <span className="block">Panic</span>
        </a>

        <nav className="ml-6 hidden flex-1 items-center gap-6 lg:flex">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-small text-dim hover:text-ink">
              {link.text}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher current={locale} label={nav.languageLabel} />
          <ThemeToggle
            label={nav.themeLabel}
            options={{ light: nav.themeLight, dark: nav.themeDark, system: nav.themeSystem }}
          />
          <button
            ref={button}
            type="button"
            onClick={() => wizard.openWizard(button.current)}
            className="shrink-0 whitespace-nowrap rounded-1 bg-amber px-4 py-2.5 text-small font-semibold text-on-amber hover:brightness-105"
          >
            {messages.wizard.open}
          </button>
        </div>
      </Shell>
    </header>
  );
}
