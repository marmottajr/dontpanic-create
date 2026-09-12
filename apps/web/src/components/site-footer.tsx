import { Shell } from './layout';
import { RichText } from './rich-text';
import { NPM_PACKAGE, REPO_URL } from '@/content/stack';
import type { Messages } from '@/i18n/messages';

/**
 * O rodapé, em quatro colunas.
 *
 * Os rótulos dos links são, na maioria, identificadores — `README.md`, `CLAUDE.md`,
 * `docs/decisions/`, GitHub Issues, npm. Isso não é economia de tradução: é que
 * traduzir o nome de um arquivo faria a pessoa procurar no repositório por algo que
 * não existe. O que traduz são os títulos das colunas e a prosa.
 *
 * A piada fica no fim, sozinha, e é a única da página. A regra do projeto é essa:
 * humor nas bordas, nunca onde há consequência.
 */
export function SiteFooter({ messages }: { messages: Messages }): React.ReactElement {
  const { footer, nav } = messages;

  const columns = [
    {
      title: footer.productTitle,
      links: [
        { href: '#proof', text: nav.proof },
        { href: '#how', text: nav.how },
        { href: '#inside', text: nav.inside },
        { href: '#faq', text: nav.faq },
      ],
    },
    {
      title: footer.docsTitle,
      links: [
        { href: `${REPO_URL}#readme`, text: 'README.md' },
        { href: `${REPO_URL}/blob/main/CLAUDE.md`, text: 'CLAUDE.md' },
        { href: `${REPO_URL}/tree/main/docs/decisions`, text: 'docs/decisions/' },
      ],
    },
    {
      title: footer.contactTitle,
      links: [
        { href: REPO_URL, text: 'github.com/marmottajr/dontpanic' },
        { href: `${REPO_URL}/issues`, text: 'GitHub Issues' },
        { href: `https://www.npmjs.com/package/${NPM_PACKAGE}`, text: `npm · ${NPM_PACKAGE}` },
      ],
    },
  ];

  return (
    <footer className="border-t border-rule py-14">
      <Shell>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))] lg:gap-8">
          <div>
            <p className="masthead text-[15px] text-amber">
              <span className="block">Don’t</span>
              <span className="block">Panic</span>
            </p>
            <p className="measure-tight mt-4 text-small text-dim">{footer.brandNote}</p>
            <p className="measure-tight mt-3 text-meta text-faint">
              <RichText>{footer.sourceNote}</RichText>
            </p>
            <p className="mt-3 font-mono text-meta text-faint">{footer.license}</p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="label text-faint">{column.title}</h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      rel={link.href.startsWith('#') ? undefined : 'noreferrer noopener'}
                      className="text-small text-dim hover:text-ink"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p className="measure mt-12 border-t border-rule pt-6 text-small italic text-faint">
          {footer.joke}
        </p>
      </Shell>
    </footer>
  );
}
