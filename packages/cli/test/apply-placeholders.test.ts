import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { expandPlaceholders } from '../src/features/apply.ts';
import { presetRecipe } from '../src/recipe.ts';
import type { Recipe } from '../src/types.ts';

const PROJECT = { displayName: 'Acme Corp', slug: 'acme-corp' };

/** Uma receita de idioma único, como a reconciliação a deixa: `locales` já colapsado. */
function singleLanguage(locale: string): Recipe {
  const recipe = presetRecipe('saas', PROJECT);
  recipe.features.i18n = false;
  recipe.i18n.locales = [locale];
  recipe.i18n.defaultLocale = locale;
  return recipe;
}

const TEMPLATE =
  'fica={{i18n.emailLocale}} sai={{i18n.droppedEmailLocaleKey}} tag={{i18n.droppedLocaleTag}}';

describe('expandPlaceholders — o idioma descartado num projeto de idioma único', () => {
  it('só português: descarta o inglês', () => {
    assert.equal(expandPlaceholders(TEMPLATE, singleLanguage('pt')), 'fica=pt-BR sai=en tag=en-US');
  });

  it('só inglês: descarta o português, e não o próprio inglês', () => {
    // O defeito: o descartado era "a receita menos o default", que com `locales` colapsado
    // dava lista vazia, e o fallback `en` valia sempre. As costuras apagavam o bloco `en` de
    // `email-templates.ts` num projeto que só fala inglês, e ele não compilava.
    assert.equal(expandPlaceholders(TEMPLATE, singleLanguage('en')), 'fica=en sai=pt-BR tag=pt-BR');
  });

  it('aceita a tag com região, que é o que a varredura dos catálogos devolve', () => {
    assert.equal(
      expandPlaceholders(TEMPLATE, singleLanguage('en'), 'en-US'),
      'fica=en sai=pt-BR tag=pt-BR',
    );
  });
});
