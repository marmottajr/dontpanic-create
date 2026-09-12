import { FaqSection } from '@/components/faq-section';
import { Hero } from '@/components/hero';
import { HowSection } from '@/components/how-section';
import { InsideSection } from '@/components/inside-section';
import { ProofSection } from '@/components/proof-section';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { WizardModal } from '@/components/wizard/wizard-modal';
import { DEFAULT_LOCALE, isLocale } from '@/i18n/locales';
import { getMessages } from '@/i18n/messages';
import { ConfiguratorProvider } from '@/lib/configurator-context';

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<React.ReactElement> {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const messages = getMessages(locale);

  /**
   * Um `ConfiguratorProvider` para a página inteira.
   *
   * O cabeçalho abre o assistente, o hero mostra o comando ao vivo e o modal edita a
   * receita: os três precisam da MESMA receita. As seções de conteúdo continuam sendo
   * componentes de servidor — um provider de cliente pode receber children renderizados
   * no servidor, então nada de "A prova" vira JavaScript no navegador.
   */
  return (
    <ConfiguratorProvider>
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-1 focus:bg-amber focus:px-3 focus:py-2 focus:text-small focus:font-semibold focus:text-on-amber"
      >
        {messages.nav.skipToContent}
      </a>

      <SiteHeader locale={locale} messages={messages} />

      <main id="content">
        <Hero messages={messages} />
        <ProofSection messages={messages} />
        <HowSection messages={messages} />
        <InsideSection messages={messages} />
        <FaqSection messages={messages} />
      </main>

      <SiteFooter messages={messages} />
      <WizardModal messages={messages} />
    </ConfiguratorProvider>
  );
}
