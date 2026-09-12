import { RichText } from './rich-text';
import { Shell } from './section';
import { NPM_PACKAGE, REPO_URL } from '@/content/stack';
import type { Messages } from '@/i18n/messages';

export function SiteFooter({ messages }: { messages: Messages }): React.ReactElement {
  const { footer } = messages;

  return (
    <footer className="border-t border-rule py-12">
      <Shell>
        <div className="spec">
          <div className="rail">
            <span className="font-mono">{NPM_PACKAGE}</span>
            <div className="mt-1">{footer.license}</div>
          </div>
          <div>
            <p className="measure text-lead">{footer.tagline}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-small">
              <a href={REPO_URL} rel="noreferrer noopener" className="text-amber hover:underline">
                {footer.repo}
              </a>
              <span className="text-meta text-dim">
                <RichText>{footer.sourceNote}</RichText>
              </span>
            </div>
            {/* A voz do Marvin vive aqui e no 404. Nunca numa mensagem de segurança. */}
            <p className="measure mt-10 text-meta italic text-dim">{footer.marvin}</p>
          </div>
        </div>
      </Shell>
    </footer>
  );
}
