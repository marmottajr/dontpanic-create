import type { FeatureId } from '@/lib/recipe-bridge';

/**
 * Agrupamento das features para a tela.
 *
 * Vive aqui e não no CLI de propósito: o CLI precisa saber o que cada feature *é* e do
 * que depende; agrupar treze caixas de forma que caibam numa coluna de telefone é
 * problema de apresentação. Se o CLI passar a agrupar também, os dois vão discordar — e
 * a discordância que importa (dependência entre features) já é do CLI.
 *
 * A ordem dentro de cada grupo é a ordem de leitura, não a de `FEATURE_IDS`.
 */

export type FeatureGroupId = 'access' | 'tenancy' | 'ops' | 'extras';

export const FEATURE_GROUPS: { id: FeatureGroupId; features: FeatureId[] }[] = [
  /*
   * `captcha` não está aqui de propósito: ele é um controle composto, não um toggle.
   *
   * O CLI emite `--captcha=none` ou `--captcha=turnstile`, e recusa "feature desligada
   * com driver escolhido" como erro. Com um toggle separado do seletor de driver, quem
   * desligasse o captcha veria um erro pedindo para desligar um driver cujo seletor
   * acabara de desaparecer da tela — um problema sem caminho de conserto. O seletor de
   * driver, com `none` na lista, é o mesmo controle que a flag descreve.
   */
  { id: 'access', features: ['publicSignup', 'invitations', 'twoFactor', 'oauth'] },
  { id: 'tenancy', features: ['multiTenant', 'platform', 'plans'] },
  { id: 'ops', features: ['queue', 'files', 'audit', 'i18n'] },
  { id: 'extras', features: ['scaffolding', 'easterEggs'] },
];
