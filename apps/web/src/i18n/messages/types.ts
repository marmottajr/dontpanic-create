/**
 * A forma de um dicionário.
 *
 * É escrita à mão, e não inferida de `typeof ptBR`, por um motivo: inferir faria o
 * idioma de origem definir o contrato em silêncio, e acrescentar uma chave só nele
 * passaria pelo compilador nos outros seis como opcional. Declarado assim, faltar
 * chave em qualquer idioma é erro de tipo antes de ser erro de tela.
 *
 * O teste de paridade em `messages.test.ts` cobre o que o tipo não alcança:
 * comprimento de array e string vazia.
 *
 * Nada de `enum` aqui — nem em nada que os testes importem. `enum` não sobrevive a
 * `node --test --experimental-strip-types`, que é como o CLI roda os seus testes: um
 * tipo que atravesse a fronteira entre os dois pacotes tem que ser apagável.
 */

import type { FeatureId, PresetId } from '@/lib/recipe-bridge';

export const PROOF_IDS = [
  'oauth-identity',
  'oauth-2fa',
  'rls-where',
  'password-reset',
  'db-owner',
] as const;

export type ProofId = (typeof PROOF_IDS)[number];

export interface ProofCopy {
  id: ProofId;
  /** O assunto, em caixa alta, ao lado do número: "LOGIN SOCIAL". */
  eyebrow: string;
  /** O erro, enunciado. */
  title: string;
  /** A consequência concreta, com a vítima nomeada. */
  whatHappens: string;
  /** O que o DontPanic faz em vez disso. */
  ours: string;
}

export interface LabelledText {
  label: string;
  text: string;
}

export interface Fact {
  value: string;
  label: string;
}

export interface Step {
  title: string;
  body: string;
}

export interface QandA {
  q: string;
  a: string;
}

/** Cabeçalho comum a todo passo do assistente. */
export interface WizardStep {
  /** Rótulo curto do passo, em caixa alta — aparece no topo e na revisão. */
  eyebrow: string;
  /** A pergunta, em linguagem de gente. */
  question: string;
  /** O que muda conforme a resposta. Sem jargão. */
  help: string;
}

/** Uma escolha, com o que ela implica. */
export interface WizardChoice {
  label: string;
  help: string;
}

export interface Messages {
  meta: {
    title: string;
    description: string;
  };

  nav: {
    skipToContent: string;
    proof: string;
    how: string;
    inside: string;
    faq: string;
    repo: string;
    languageLabel: string;
    themeLabel: string;
    themeLight: string;
    themeDark: string;
    themeSystem: string;
  };

  hero: {
    /** Como um leitor de tela anuncia o letreiro. */
    mastheadLabel: string;
    title: string;
    lead: string;
    nameCta: string;
    commandLabel: string;
    commandNote: string;
    ctaProof: string;
    facts: Fact[];
  };

  proof: {
    eyebrow: string;
    title: string;
    lead: string;
    labels: {
      whatHappens: string;
      ours: string;
      /** "coberto por teste" — o selo do bloco verde. */
      seal: string;
      /** "casos", o substantivo que acompanha a contagem. */
      cases: string;
    };
    items: ProofCopy[];
    moreTitle: string;
    more: string[];
  };

  configurator: {
    nameLabel: string;
    namePlaceholder: string;
    nameHelp: string;
    slugLabel: string;
    slugHelp: string;
    slugDerived: string;
    slugReset: string;
    applySuggestion: string;

    derivedTitle: string;
    derivedNote: string;
    derivedLabels: {
      dbName: string;
      dbNameE2e: string;
      dbRole: string;
      npmScope: string;
      seedAdminEmail: string;
      bucket: string;
      screaming: string;
      pascal: string;
    };

    driverLabels: {
      db: string;
      storage: string;
      mail: string;
      cache: string;
      queue: string;
      captcha: string;
    };

    issuesTitle: string;
    issueError: string;
    issueWarning: string;
    noIssues: string;

    commandTitle: string;
    commandNote: string;
    copy: string;
    copied: string;
    copyFailed: string;
    flagsTitle: string;
    flagsNote: string;
    removeFlag: string;
    shareTitle: string;
    shareNote: string;
    shareCopy: string;
    shareCopied: string;
    blockedByName: string;

    features: Record<FeatureId, LabelledText>;
    presets: Record<PresetId, { label: string; summary: string; audience: string }>;
  };

  /**
   * O assistente.
   *
   * Uma pergunta por tela, em linguagem de gente: "Seu sistema vai atender várias
   * empresas diferentes?" em vez de "habilitar multi-tenancy com RLS". O preset do
   * passo 2 pré-responde os oito seguintes, então quem já sabe o que quer só clica
   * Continuar — é isso que faz doze passos não cansarem.
   */
  wizard: {
    open: string;
    openHero: string;
    close: string;
    next: string;
    back: string;
    finish: string;
    /** Pula o passo aceitando o que o preset já escolheu. */
    recommended: string;
    /** "Passo {n} de {total}" — `{n}` e `{total}` são substituídos. */
    progress: string;
    yes: string;
    no: string;
    /** Na revisão: volta ao passo daquela linha. */
    edit: string;
    steps: {
      name: WizardStep;
      preset: WizardStep;
      tenancy: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      entry: WizardStep & {
        choices: { open: WizardChoice; invite: WizardChoice; seed: WizardChoice };
      };
      social: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      twoFactor: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      languages: WizardStep & { choices: { one: WizardChoice; many: WizardChoice } };
      plans: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      files: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      captcha: WizardStep & { choices: { yes: WizardChoice; no: WizardChoice } };
      review: WizardStep;
      done: WizardStep;
    };
  };

  how: {
    title: string;
    lead: string;
    steps: Step[];
    renameTitle: string;
    renameLead: string;
    renameItems: string[];
  };

  inside: {
    title: string;
    lead: string;
    stackTitle: string;
    stackHead: { tech: string; solves: string };
    /** Um papel por item de `STACK` — mesma ordem, mesmo comprimento. */
    stackRoles: string[];
    factoryTitle: string;
    /** Seis tópicos, na grade 2×3. */
    factory: LabelledText[];
    decisionsTitle: string;
    decisionsText: string;
    numbersTitle: string;
    numbers: Fact[];
  };

  faq: {
    title: string;
    lead: string;
    items: QandA[];
  };

  footer: {
    tagline: string;
    brandNote: string;
    sourceNote: string;
    license: string;
    productTitle: string;
    docsTitle: string;
    contactTitle: string;
    joke: string;
  };
}
