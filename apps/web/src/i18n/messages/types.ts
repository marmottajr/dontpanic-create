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

import type { FeatureId } from '@/lib/recipe-bridge';
import type { PresetId } from '@/lib/recipe-bridge';

export const PROOF_IDS = [
  'oauth-identity',
  'oauth-2fa',
  'trust-proxy',
  'guard-scope',
  'db-owner',
] as const;

export type ProofId = (typeof PROOF_IDS)[number];

export interface ProofCopy {
  id: ProofId;
  /** O erro, enunciado. */
  title: string;
  /** Por que ninguém pega: compila, passa no teste, passa no review. */
  whyItPasses: string;
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

export interface Messages {
  meta: {
    title: string;
    description: string;
  };

  nav: {
    skipToContent: string;
    proof: string;
    configure: string;
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
    commandLabel: string;
    commandNote: string;
    ctaConfigure: string;
    ctaProof: string;
    facts: Fact[];
  };

  proof: {
    title: string;
    lead: string;
    labels: {
      surface: string;
      code: string;
      whyItPasses: string;
      whatHappens: string;
      ours: string;
    };
    items: ProofCopy[];
    moreTitle: string;
    more: string[];
  };

  configurator: {
    title: string;
    lead: string;

    nameLegend: string;
    nameLabel: string;
    namePlaceholder: string;
    nameHelp: string;
    slugLabel: string;
    slugHelp: string;
    slugDerived: string;
    slugCustom: string;
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

    presetLegend: string;
    presetNote: string;
    presetReset: string;

    featuresLegend: string;
    featuresNote: string;
    groups: {
      access: string;
      tenancy: string;
      ops: string;
      extras: string;
    };

    driversLegend: string;
    driversNote: string;
    driverLabels: {
      db: string;
      storage: string;
      mail: string;
      cache: string;
      queue: string;
      captcha: string;
    };

    oauthLegend: string;
    oauthNote: string;

    localesLegend: string;
    localesNote: string;
    defaultLocaleLabel: string;

    optionsLegend: string;
    optionLabels: {
      git: string;
      install: string;
      docker: string;
      force: string;
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
    /** Um papel por item de `STACK` — mesma ordem, mesmo comprimento. */
    stackRoles: string[];
    portsTitle: string;
    portsLead: string;
    portsHead: { resource: string; adapters: string; env: string };
    /** Um nome por linha de `PORTS` — mesma ordem, mesmo comprimento. */
    portsResources: string[];
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
    repo: string;
    license: string;
    sourceNote: string;
    marvin: string;
  };
}
