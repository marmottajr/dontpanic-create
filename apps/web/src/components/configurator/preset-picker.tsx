'use client';

import { RichText } from '../rich-text';
import type { Messages } from '@/i18n/messages';
import { PRESET_IDS, type PresetId } from '@/lib/recipe-bridge';
import { cn } from '@/lib/cn';

export function PresetPicker({
  messages,
  value,
  dirty,
  onChange,
  onReset,
}: {
  messages: Messages;
  value: PresetId;
  /** A receita já divergiu do preset? Só então o botão de descartar faz sentido. */
  dirty: boolean;
  onChange: (preset: PresetId) => void;
  onReset: () => void;
}): React.ReactElement {
  const c = messages.configurator;

  return (
    <fieldset>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-h3 font-semibold">{c.presetLegend}</legend>
        {dirty ? (
          <button
            type="button"
            onClick={onReset}
            className="text-meta text-amber underline-offset-2 hover:underline"
          >
            {c.presetReset}
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {PRESET_IDS.map((preset) => {
          const copy = c.presets[preset];
          const selected = preset === value;

          return (
            <label key={preset} className="min-w-0">
              <input
                type="radio"
                name="preset"
                value={preset}
                checked={selected}
                onChange={() => onChange(preset)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'block h-full cursor-pointer border p-3.5 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
                  selected
                    ? 'border-amber bg-amber-solid/8'
                    : 'border-rule hover:border-rule-strong',
                )}
              >
                <span className="flex items-baseline gap-2">
                  <span className={cn('text-small font-semibold', selected && 'text-amber')}>
                    {copy.label}
                  </span>
                  <span className="font-mono text-[0.72rem] text-dim">--preset={preset}</span>
                </span>
                <span className="mt-1.5 block text-meta text-dim">
                  <RichText>{copy.summary}</RichText>
                </span>
                <span className="mt-2 block border-t border-rule pt-2 text-meta text-dim">
                  {copy.audience}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
