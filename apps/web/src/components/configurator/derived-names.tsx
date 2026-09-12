import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import type { NameForms } from '@/lib/recipe-bridge';

/**
 * As formas derivadas do nome.
 *
 * É a parte do configurador que convence: mostra que o rename atravessa o identificador
 * SQL, a role do Postgres, o escopo do pnpm e o bucket — lugares com regras que se
 * contradizem (SQL recusa hífen, S3 recusa sublinhado) e que uma substituição ingênua
 * quebraria em silêncio.
 *
 * Os valores **não são traduzidos**: são identificadores que vão para dentro do
 * projeto. Só o rótulo muda de idioma.
 */
export function DerivedNames({
  messages,
  names,
}: {
  messages: Messages;
  names: NameForms;
}): React.ReactElement {
  const c = messages.configurator;

  const rows: { label: string; value: string }[] = [
    { label: c.derivedLabels.dbName, value: names.dbName },
    { label: c.derivedLabels.dbRole, value: names.dbRole },
    { label: c.derivedLabels.dbNameE2e, value: names.dbNameE2e },
    { label: c.derivedLabels.npmScope, value: `@${names.npmScope}/*` },
    { label: c.derivedLabels.seedAdminEmail, value: names.seedAdminEmail },
    { label: c.derivedLabels.bucket, value: names.bucket },
    { label: c.derivedLabels.screaming, value: `${names.screaming}_*` },
    { label: c.derivedLabels.pascal, value: `${names.pascal}Module` },
  ];

  return (
    <div>
      <h3 className="text-h3 font-semibold">{c.derivedTitle}</h3>
      <dl className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 border-t border-rule py-2">
            <dt className="rail flex-1">{row.label}</dt>
            <dd className="min-w-0 break-all font-mono text-[0.78rem] text-amber">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="measure mt-4 text-meta text-dim">
        <RichText>{c.derivedNote}</RichText>
      </p>
    </div>
  );
}
