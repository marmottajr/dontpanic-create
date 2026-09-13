import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * O contêiner único da página: 1240px de largura máxima, com gutter que nunca some.
 *
 * Sai daqui e de nenhum outro lugar. Um segundo lugar que defina padding lateral é
 * como duas seções passam a alinhar diferente, e ninguém percebe até o print.
 */
export function Shell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('mx-auto w-full max-w-[1240px] px-5 sm:px-8', className)}>{children}</div>
  );
}

/**
 * Uma seção, com a régua de separação e o ritmo vertical de 72px do design.
 *
 * O `eyebrow` em mono caixa alta é o que dá o ar de folha de especificação — e é
 * informação, não enfeite: ele diz de que trata a seção antes de o título aparecer.
 */
export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
  className,
}: {
  id: string;
  eyebrow?: string;
  /** `ReactNode` e não `string`: alguns títulos carregam código em mono. */
  title: ReactNode;
  lead?: ReactNode;
  children?: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <section
      id={id}
      className={cn('scroll-mt-16 border-t border-rule py-14 sm:py-[72px]', className)}
    >
      <Shell>
        {eyebrow ? <p className="label label-wide text-amber">{eyebrow}</p> : null}
        <h2 className="display mt-2.5 text-h2">{title}</h2>
        {lead ? <p className="measure mt-4 text-lead text-dim">{lead}</p> : null}
        {children ? <div className="mt-10 sm:mt-12">{children}</div> : null}
      </Shell>
    </section>
  );
}
