import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../../globals.css';
import { TagManager } from '@/components/analytics';
import { themeBootstrapScript } from '@/components/theme-toggle';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_INFO,
  SITE_URL,
  isLocale,
  localeUrl,
  type Locale,
} from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';

/**
 * Este é um *root layout*: renderiza `<html>` e `<body>`.
 *
 * O motivo de ele viver dentro de `[locale]`, e não em `app/layout.tsx`, é o atributo
 * `lang`. Ele tem que dizer o idioma real da página — é o que faz um leitor de tela
 * escolher a pronúncia certa e o que um buscador usa para saber que esta página é a
 * alemã. Um layout na raiz não conhece o locale, então `lang` só poderia ser um chute
 * corrigido depois por JavaScript, o que chega tarde para os dois.
 *
 * Há dois root layouts no app, um por grupo de rotas: este, e o de `(redirect)` que
 * serve a raiz `/`.
 */

export const dynamicParams = false;

export function generateStaticParams(): { locale: Locale }[] {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const { meta } = getMessages(locale);

  /**
   * `hreflang` recíproco: cada página aponta para todas as outras, inclusive para si
   * mesma, mais um `x-default`. Sem isso, sete páginas de conteúdo equivalente
   * competem entre si na indexação em vez de se declararem traduções uma da outra — e
   * o buscador escolhe uma, arbitrariamente, para todos os idiomas.
   */
  const languages: Record<string, string> = {};
  for (const candidate of LOCALES) {
    languages[LOCALE_INFO[candidate].tag] = localeUrl(candidate);
  }
  languages['x-default'] = localeUrl(DEFAULT_LOCALE);

  return {
    metadataBase: new URL(SITE_URL),
    title: meta.title,
    description: meta.description,
    alternates: { canonical: localeUrl(locale), languages },
    openGraph: {
      type: 'website',
      title: meta.title,
      description: meta.description,
      url: localeUrl(locale),
      locale: LOCALE_INFO[locale].tag,
      siteName: 'DontPanic',
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;

  return (
    <html lang={LOCALE_INFO[locale].tag} suppressHydrationWarning>
      <body>
        {/* Primeiro filho do body, e síncrono: aplica o tema salvo antes da primeira
            pintura. Qualquer coisa assíncrona chega depois do flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <TagManager />
        {/*
         * Só os dois pesos que a primeira tela usa de fato.
         *
         * Archivo é o letreiro e os títulos; Plex Sans 400 é o corpo. Pré-carregar os
         * seis arquivos competiria com o próprio HTML pela banda inicial e atrasaria a
         * primeira pintura — o oposto do que um preload existe para fazer. Os outros
         * pesos chegam pelo `@font-face`, quando o texto que os usa aparece.
         */}
        <link
          rel="preload"
          href="/fonts/archivo-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/plex-sans-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {children}
      </body>
    </html>
  );
}
