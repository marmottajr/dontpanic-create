import { LocaleSwitcher } from './locale-switcher';
import { Shell } from './section';
import { ThemeToggle } from './theme-toggle';
import { REPO_URL } from '@/content/stack';
import type { Locale } from '@/i18n/locales';
import type { Messages } from '@/i18n/messages';

export function SiteHeader({
  locale,
  messages,
}: {
  locale: Locale;
  messages: Messages;
}): React.ReactElement {
  const { nav } = messages;

  const links = [
    { href: '#proof', text: nav.proof },
    { href: '#build', text: nav.configure },
    { href: '#how', text: nav.how },
    { href: '#inside', text: nav.inside },
    { href: '#faq', text: nav.faq },
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-bg/92 backdrop-blur-sm">
      <Shell className="flex h-14 items-center gap-3">
        <a
          href="#top"
          className="font-bold tracking-[0.02em] w-condensed text-[0.95rem] whitespace-nowrap"
        >
          DontPanic
        </a>

        {/* Sem `aria-label`: é o único <nav> da página, e rotulá-lo com o texto de uma
            das seções ("A prova") faria o leitor de tela anunciar a navegação inteira
            pelo nome de um dos seus itens. */}
        <nav className="ml-4 hidden flex-1 items-center gap-5 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-meta text-dim w-condensed hover:text-text"
            >
              {link.text}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a
            href={REPO_URL}
            rel="noreferrer noopener"
            className="hidden text-meta text-dim w-condensed hover:text-text sm:block"
          >
            {nav.repo}
          </a>
          <LocaleSwitcher current={locale} label={nav.languageLabel} />
          <ThemeToggle
            label={nav.themeLabel}
            options={{ light: nav.themeLight, dark: nav.themeDark, system: nav.themeSystem }}
          />
        </div>
      </Shell>
    </header>
  );
}
