import { Configurator } from '@/components/configurator/configurator';
import { FaqSection } from '@/components/faq-section';
import { Hero } from '@/components/hero';
import { HowSection } from '@/components/how-section';
import { InsideSection } from '@/components/inside-section';
import { ProofSection } from '@/components/proof-section';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { buildCommand, DEFAULT_PRESET, presetRecipe } from '@/lib/recipe-bridge';
import { SAMPLE_PROJECT } from '@/lib/recipe-url';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = getMessages(locale);

  /**
   * O comando do hero é renderizado no servidor, a partir da mesma `buildCommand` que
   * o configurador usa. É por isso que ele existe no HTML estático: o visitante que
   * chega e copia a primeira linha que vê leva um comando válido, sem esperar
   * JavaScript. E é o mesmo texto que o configurador mostra ao abrir, então não há
   * salto quando ele hidrata.
   */
  const defaultCommand = buildCommand(
    presetRecipe(DEFAULT_PRESET, { ...SAMPLE_PROJECT }),
    DEFAULT_PRESET,
  );

  return (
    <>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-amber-solid focus:px-3 focus:py-2 focus:text-meta focus:font-semibold focus:text-on-amber"
      >
        {messages.nav.skipToContent}
      </a>

      <SiteHeader locale={locale} messages={messages} />

      <main id="content">
        <Hero messages={messages} command={defaultCommand} />
        <ProofSection messages={messages} />
        <Configurator messages={messages} />
        <HowSection messages={messages} />
        <InsideSection messages={messages} />
        <FaqSection messages={messages} />
      </main>

      <SiteFooter messages={messages} />
    </>
  );
}
