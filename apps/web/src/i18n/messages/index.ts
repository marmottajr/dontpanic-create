import type { Locale } from '../locales';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { ptBR } from './pt-BR';
import { ptPT } from './pt-PT';
import type { Messages } from './types';

export const MESSAGES: Record<Locale, Messages> = {
  'pt-br': ptBR,
  'pt-pt': ptPT,
  en,
  es,
  fr,
  de,
  it,
};

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

export type { Messages };
