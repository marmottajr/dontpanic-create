'use client';

import { useEffect, useState } from 'react';

import { CommandBlock } from '../command-block';
import { CopyButton } from '../copy-button';
import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import type { PresetId } from '@/lib/recipe-bridge';
import type { CommandChip } from '@/lib/use-configurator';

/**
 * O painel que mostra o resultado: comando, flags e link.
 *
 * Os chips existem para uma coisa: fazer entender que **o comando é a configuração**.
 * Cada chip é um token do comando, e removê-lo devolve aquela decisão ao preset. Não
 * são uma segunda representação do estado — vêm da mesma `toFlags` que monta a linha
 * (ver `use-configurator.ts`), então não podem discordar dela.
 */
export function CommandPanel({
  messages,
  command,
  chips,
  preset,
  shareQuery,
  blocked,
}: {
  messages: Messages;
  command: string;
  chips: CommandChip[];
  preset: PresetId;
  shareQuery: string;
  blocked: boolean;
}): React.ReactElement {
  const c = messages.configurator;
  const [shareUrl, setShareUrl] = useState('');

  // A URL absoluta só existe no navegador — com export estático não há como saber o
  // host na build, e chutar um produziria um link que não funciona em preview.
  useEffect(() => {
    setShareUrl(`${window.location.origin}${window.location.pathname}${shareQuery}`);
  }, [shareQuery]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-h3 font-semibold">{c.commandTitle}</h3>
        <p className="mt-1.5 text-meta text-dim">{c.commandNote}</p>
      </div>

      {/* O rótulo da moldura é o programa que vai rodar, não uma tradução: o
          cabeçalho `<h3>` acima já nomeia o bloco, e repetir o nome ali gastaria a
          faixa que serve para dizer o que se está olhando. */}
      <CommandBlock
        command={command}
        label="npx"
        copy={c.copy}
        copied={c.copied}
        copyFailed={c.copyFailed}
      />

      {blocked ? (
        <p role="alert" className="border-l-2 border-amber pl-3 text-meta text-amber">
          {c.blockedByName}
        </p>
      ) : null}

      <div>
        <h3 className="rail mb-1">{c.flagsTitle}</h3>
        <p className="mb-2 text-meta text-dim">{c.flagsNote}</p>
        {chips.length === 0 ? (
          /*
           * Zero flags é o caso do preset intocado, e é um estado a mostrar, não a
           * esconder: é ele que explica por que o comando é tão curto.
           *
           * O que NÃO se pode fazer aqui é imprimir `--preset=saas`. O CLI omite a flag
           * do preset padrão de propósito, então exibi-la como chip diria que o comando
           * contém um token que ele não contém — e o chip existe justamente para provar
           * que a lista e a linha são a mesma coisa.
           */
          <p className="font-mono text-meta text-dim" aria-label={preset}>
            —
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.flag}>
                {chip.onRemove ? (
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    aria-label={`${c.removeFlag} ${chip.flag}`}
                    className="group inline-flex items-center gap-1.5 rounded-control border border-rule bg-well px-2 py-1 font-mono text-[0.72rem] text-text hover:border-amber"
                  >
                    <span>{chip.flag}</span>
                    <span aria-hidden="true" className="text-dim group-hover:text-amber">
                      ×
                    </span>
                  </button>
                ) : (
                  <span className="inline-flex rounded-control border border-rule px-2 py-1 font-mono text-[0.72rem] text-dim">
                    {chip.flag}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-rule pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="rail">{c.shareTitle}</h3>
          <CopyButton
            value={shareUrl}
            idleLabel={c.shareCopy}
            copiedLabel={c.shareCopied}
            failedLabel={c.copyFailed}
            variant="quiet"
          />
        </div>
        <p className="mt-2 break-all font-mono text-[0.72rem] text-dim">{shareQuery}</p>
        <p className="measure mt-2 text-meta text-dim">
          <RichText>{c.shareNote}</RichText>
        </p>
      </div>
    </div>
  );
}
