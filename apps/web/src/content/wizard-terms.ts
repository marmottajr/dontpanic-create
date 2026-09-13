import type { WizardStepId } from '@/lib/configurator-context';

/**
 * O nome oficial do recurso de cada passo do assistente.
 *
 * O assistente pergunta em linguagem de gente — "as pessoas devem poder exigir um
 * código do celular?" — e este arquivo põe, ao lado, como aquilo se chama: `2FA TOTP`.
 * Quem já conhece o termo reconhece o passo em meio segundo; quem não conhece termina
 * o assistente tendo aprendido o nome da coisa.
 *
 * **Os termos NÃO são traduzidos, e é isso que os torna úteis.** São idênticos nos sete
 * idiomas porque é assim que esses recursos se chamam em qualquer lugar — e porque é
 * exactamente o que a pessoa vai digitar depois numa busca, ou procurar no `CLAUDE.md`
 * do projeto que gerou. "Row Level Security" traduzido para "segurança em nível de
 * linha" não acha nada em lugar nenhum, e a ponte que o termo existe para construir
 * desaba. Por isso eles moram aqui, em `content/`, com os nomes de feature e as flags —
 * e não nos catálogos de i18n.
 *
 * O critério de escolha é **ser procurável no repositório**, não soar bem:
 *
 * - `slug` e `npmScope` são campos de `NameForms` em `packages/cli/src/naming.ts`.
 * - `public signup` e `invitations` são os ids de feature (`publicSignup`,
 *   `invitations`) e as flags `--public-signup` / `--invitations`. Em inglês, e não em
 *   "signup público · convites", justamente porque o termo tem que ser o mesmo nos sete
 *   idiomas — e o que está no código é o inglês.
 * - Os demais aparecem no boilerplate: OIDC em 5 arquivos, TOTP em 19, OAuth em 38,
 *   CAPTCHA em 30, `feature flag` e `object storage` no `CLAUDE.md`.
 *
 * Revisão e "pronto" não têm termo: não são recursos, são momentos do assistente.
 */
export const WIZARD_TERMS: Partial<Record<WizardStepId, string>> = {
  name: 'slug · npm scope',
  preset: 'preset',
  tenancy: 'multi-tenancy · RLS',
  entry: 'public signup · invitations',
  social: 'OAuth 2.0 · OIDC',
  twoFactor: '2FA TOTP',
  languages: 'i18n',
  plans: 'plans · feature flags',
  files: 'object storage · S3',
  captcha: 'CAPTCHA',
};
