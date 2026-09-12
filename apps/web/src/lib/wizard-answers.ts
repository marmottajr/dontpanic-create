/**
 * A tradução entre "resposta humana" e receita.
 *
 * O assistente pergunta "como as pessoas vão entrar?"; a receita guarda
 * `publicSignup` e `invitations`. Uma pergunta, dois campos — e é essa costura que
 * mora aqui, em funções puras, longe do componente.
 *
 * Duas razões para ser um arquivo próprio: dá para testar a leitura e a escrita sem
 * renderizar um modal, e deixa óbvio o único lugar onde uma resposta de gente vira
 * decisão de gerador. A tentação de espalhar `if (choice === 'invite')` pelos passos é
 * exactamente como uma resposta passa a significar coisas diferentes em dois lugares.
 */

import type { FeatureSelection, Recipe } from './recipe-bridge';

export type EntryChoice = 'open' | 'invite' | 'seed';
export type LanguageChoice = 'one' | 'many';

/**
 * Como se entra no sistema, lido da receita.
 *
 * `publicSignup` ligado ganha de tudo: se o cadastro está aberto, a porta é aberta,
 * tenha ou não convite. E "convite sem cadastro" só é distinguível de "só o seed" por
 * `invitations` — que é justamente a diferença que a pergunta quer capturar.
 */
export function entryChoice(features: FeatureSelection): EntryChoice {
  if (features.publicSignup) return 'open';
  return features.invitations ? 'invite' : 'seed';
}

/** Os dois campos que cada resposta implica. */
export function entryFeatures(choice: EntryChoice): {
  publicSignup: boolean;
  invitations: boolean;
} {
  switch (choice) {
    case 'open':
      // Cadastro aberto sem convite existiria, mas é uma combinação que ninguém pede:
      // quem deixa qualquer um entrar também quer poder chamar um colega.
      return { publicSignup: true, invitations: true };
    case 'invite':
      return { publicSignup: false, invitations: true };
    case 'seed':
      return { publicSignup: false, invitations: false };
  }
}

export function languageChoice(recipe: Recipe): LanguageChoice {
  return recipe.features.i18n && recipe.i18n.locales.length > 1 ? 'many' : 'one';
}

/**
 * Uma linha da revisão.
 *
 * `step` é para onde o botão "editar" volta; `value` é o texto já resolvido. Os valores
 * que são identificador — locale, driver — ficam em `mono`, porque vão para dentro do
 * projeto e não se traduzem.
 */
export interface ReviewRow {
  step:
    | 'name'
    | 'preset'
    | 'tenancy'
    | 'entry'
    | 'social'
    | 'twoFactor'
    | 'languages'
    | 'plans'
    | 'files'
    | 'captcha';
  label: string;
  value: string;
  mono?: boolean;
}
