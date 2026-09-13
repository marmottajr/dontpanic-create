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
  /**
   * O que muda conforme a resposta. Sem jargão — e, onde existir uma boa, começando
   * pela **consequência** e não pelo mecanismo: "é a diferença entre roubaram a senha
   * dela e roubaram a senha dela e não entraram" ensina o valor numa frase, enquanto
   * "é o código de seis dígitos de um app autenticador" descreve a engrenagem antes de
   * dizer para que ela serve. Onde não houver antítese natural, não force: uma
   * inventada lê pior que a explicação direta.
   */
  help: string;
}

/**
 * Um passo que faz uma pergunta — os dez do meio; revisão e "pronto" não têm.
 *
 * `whatChanges` é o bloco técnico do fim da tela: é onde o passo devolve o que o resto
 * dele evitou de propósito, e é o que faz a mesma tela servir a quem nunca ouviu falar
 * de RLS e a quem quer saber exactamente o que vai para o repositório.
 *
 * **Toda afirmação aqui é medida no boilerplate**, não no mockup: nomes de cookie, de
 * variável de ambiente, de função SQL e de índice. É a regra do ADR 0006 no ponto em
 * que ela mais importa, porque este é o texto que um leitor cético vai conferir.
 */
export interface WizardQuestion extends WizardStep {
  whatChanges: string;
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
    /**
     * A frase que diz o que o DontPanic **não** é.
     *
     * Existe porque a página falhou nisso: um leitor não-técnico leu o `title`, viu
     * "IA", "erro" e "segurança", viu a seção "A prova" listando cinco defeitos, e
     * concluiu que isto era um analisador — "eu tenho um app e uso a ferramenta para
     * descobrir o que está errado nele". Descrever só o que a coisa é não desfaz uma
     * categoria errada já formada; o negativo explícito desfaz.
     */
    notThis: string;
    nameCta: string;
    /** Convida: o que esperar do assistente. Fica sob os botões. */
    ctaNote: string;
    commandLabel: string;
    /** Informa um pré-requisito real, sob o bloco de comando. */
    commandNote: string;
    ctaProof: string;
    facts: Fact[];
  };

  /**
   * A chamada entre "A prova" e "Como funciona".
   *
   * É o único convite a abrir o assistente fora do hero e do cabeçalho, e está no
   * ponto em que a pessoa acabou de ler os cinco erros. A nota responde a objeção que
   * todo mundo tem antes de clicar num botão de produto.
   */
  cta: {
    title: string;
    text: string;
    note: string;
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
    /** Rótulo do bloco técnico: "O QUE MUDA NO SEU SISTEMA". */
    whatChangesLabel: string;
    steps: {
      name: WizardQuestion;
      preset: WizardQuestion;
      tenancy: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      entry: WizardQuestion & {
        choices: { open: WizardChoice; invite: WizardChoice; seed: WizardChoice };
      };
      social: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      twoFactor: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      languages: WizardQuestion & { choices: { one: WizardChoice; many: WizardChoice } };
      plans: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      files: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      captcha: WizardQuestion & { choices: { yes: WizardChoice; no: WizardChoice } };
      review: WizardStep;
      done: WizardStep;
    };
  };

  how: {
    /**
     * O título entrega a promessa em vez de anunciar a seção — e carrega `pnpm dev`
     * entre acentos graves, então é renderizado com `RichText`, não como texto cru.
     * O rótulo da seção reaproveita `nav.how`: é a mesma palavra, e duas chaves para
     * o mesmo texto divergem na primeira revisão.
     */
    title: string;
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
