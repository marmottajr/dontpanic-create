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
 * **Procurável ONDE**, porque os termos não vêm todos do mesmo repositório:
 *
 * - No boilerplate (`marmottajr/dontpanic`), medido com `grep -ril` sobre os arquivos
 *   rastreados: `RLS` em 91 arquivos, `CAPTCHA` em 66, `slug` em 54, `OAuth` em 47,
 *   `TOTP` em 43, `invitations` em 34, `i18n` em 32, `OIDC` em 5, `feature flag` em 4,
 *   `multi-tenancy` em 4, `object storage` em 2, `publicSignup` em 1.
 * - No gerador, não no boilerplate: `preset` é `PRESETS` e a flag `--preset` em
 *   `packages/cli/src/recipe.ts`; `npm scope` é o campo `npmScope` de `NameForms` em
 *   `packages/cli/src/naming.ts`. Quem procurar por eles no repo do boilerplate não
 *   acha — e está certo, porque ali eles não existem: são conceitos de quem gera, não
 *   do que foi gerado.
 *
 * `public signup` e `invitations` ficam em inglês — e não em "signup público ·
 * convites" — por duas razões que se somam: é o id de feature que está no código
 * (`publicSignup`, `invitations`, `--public-signup`, `--invitations`), e o termo tem
 * que ser o mesmo nos sete idiomas para servir de ponte.
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
