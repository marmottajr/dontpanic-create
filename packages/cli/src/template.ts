/**
 * Localização e cópia do template.
 *
 * O template é o repo `dontpanic` REAL — um monorepo que compila, roda e passa nos
 * testes —, materializado em `<pacote>/template` por `pnpm sync-template` a partir da
 * tag declarada em `packages/cli/template.json`. Não é versionado neste repo, e não é
 * baixado em runtime: viaja dentro do tarball do npm, porque um gerador que faz
 * `git clone` na hora depende da rede, do GitHub e de o usuário ter `git` — e falha nos
 * três de formas diferentes.
 *
 * Este módulo faz exatamente duas coisas, e a segunda é a que custa:
 *
 * 1. **Achar** o diretório do template dentro do pacote publicado.
 * 2. **Copiar** para o destino, desfazendo o que o `npm publish` fez com os dotfiles e
 *    deixando de fora o que nunca deve viajar.
 */

import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NEVER_TRAVERSE,
  NEVER_TRAVERSE_REL_PATHS,
  assertWithin,
  isNeverCopied,
  isUnderAnyRelPath,
  listFiles,
  pathExists,
} from './util/fs.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Onde vive o template
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATE_DIR_NAME = 'template';

/**
 * Escape para o CI de conformidade e para os testes, que geram projetos a partir de uma
 * árvore montada na hora em vez do template publicado.
 */
export const TEMPLATE_DIR_ENV_VAR = 'DONTPANIC_CREATE_TEMPLATE_DIR';

/**
 * Resolve o diretório do template.
 *
 * Sobe a partir deste arquivo procurando o diretório que tem `package.json` E
 * `template/`. Subir em vez de calcular um número fixo de níveis porque o mesmo código
 * roda de três lugares diferentes: `src/` (via `--experimental-strip-types`, nos
 * testes), `dist/` (o pacote publicado) e um bundle achatado, se algum dia houver. Um
 * `../..` literal acerta em um e erra nos outros — e erra devolvendo um caminho que não
 * existe, o que aparece como "template vazio" e não como "não achei o template".
 */
export async function resolveTemplateDir(): Promise<string> {
  const override = process.env[TEMPLATE_DIR_ENV_VAR];
  if (override !== undefined && override.length > 0) {
    const abs = resolve(override);
    if (!(await pathExists(abs))) {
      throw new Error(`${TEMPLATE_DIR_ENV_VAR}=${override} aponta para um caminho que não existe.`);
    }
    return abs;
  }

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let hop = 0; hop < 8; hop += 1) {
    const candidate = join(dir, TEMPLATE_DIR_NAME);
    if ((await pathExists(join(dir, 'package.json'))) && (await pathExists(candidate))) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    'Não encontrei o diretório `template/` do pacote.\n' +
      'Num clone deste repo, rode `pnpm sync-template` — o template não é versionado ' +
      'aqui de propósito (a fonte da verdade é a tag do repo dontpanic).\n' +
      `Para apontar para outra árvore, defina ${TEMPLATE_DIR_ENV_VAR}.`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Dotfiles: desfazendo o que o npm faz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nome no template → nome no projeto gerado.
 *
 * O `npm publish` trata alguns dotfiles como especiais **dentro de qualquer diretório do
 * tarball**, inclusive dentro de `template/`, e inclusive quando o `package.json` declara
 * `"files": ["dist", "template"]`:
 *
 * - `.gitignore` é **renomeado** para `.npmignore` quando não há `.npmignore` — então o
 *   projeto gerado nasceria sem `.gitignore` e o primeiro `git add .` do usuário
 *   commitaria `node_modules`, `.next` e o `.env` com os segredos dele.
 * - `.npmrc` é **sempre** excluído, sem opção de configurar. E o `.npmrc` do boilerplate
 *   (`auto-install-peers=true`, `strict-peer-dependencies=false`) é funcionalmente
 *   necessário: sem ele o `pnpm install` do projeto gerado tropeça em peers (é o mesmo
 *   isolamento estrito que obriga o workaround de `zod/v4/core` no `next.config.ts`).
 *
 * A convenção é guardá-los sem o ponto no template e restaurar o nome na cópia. Tabela e
 * não `if`: a mudança é reversível e injetiva — o mapa confirmou que não existe nenhum
 * arquivo chamado literalmente `gitignore` ou `npmrc` no repo base, então a restauração
 * não pode colidir com um arquivo legítimo.
 *
 * `_gitignore` também é aceito porque é a convenção de outros geradores (Vite, Nx) e o
 * `sync-template` de um dia pode passar a usá-la; aceitar as duas grafias custa uma
 * linha e evita um template que copia mas não restaura.
 */
export const TEMPLATE_DOTFILE_RESTORES: Readonly<Record<string, string>> = {
  gitignore: '.gitignore',
  _gitignore: '.gitignore',
  npmrc: '.npmrc',
  _npmrc: '.npmrc',
  gitattributes: '.gitattributes',
  _gitattributes: '.gitattributes',
  npmignore: '.npmignore',
  _npmignore: '.npmignore',
};

/** Aplica a tabela a um basename. Devolve o mesmo nome quando não há entrada. */
export function restoreDotfileName(name: string): string {
  return TEMPLATE_DOTFILE_RESTORES[name] ?? name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cópia
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Caminhos que não são copiados, além de `NEVER_TRAVERSE_REL_PATHS`.
 *
 * Lista SEPARADA do `fs.ts` de propósito: `NEVER_TRAVERSE_REL_PATHS` é compartilhada com
 * o motor de rename e com `verifyRename`, e pôr isto lá faria o verificador fechar os
 * olhos para o arquivo — que é justamente o oposto do que se quer. Aqui ele não é
 * copiado; se um dia aparecer no projeto gerado por outro caminho, o gate ainda falha
 * nomeando-o.
 *
 * `publish-create-dontpanic.yml` existe por um único motivo: publicar o pacote
 * `packages/create-dontpanic/`, que nunca é copiado (§3.5 do mapa). Copiar o workflow e
 * não o pacote produz um CI que falha em cada tag `v*` do usuário, referenciando um
 * diretório que não existe — e, como o nome do pacote é uma regra-guarda (não
 * renomeável, §3.4/§3.5), suas 13 ocorrências seriam falha BLOQUEANTE em toda geração.
 * Não copiar é a mesma decisão que já se tomou sobre o pacote, aplicada ao par dele.
 */
export const NEVER_COPY_REL_PATHS = ['.github/workflows/publish-create-dontpanic.yml'];

export interface CopyTemplateOptions {
  /** Raiz do template. Default: `resolveTemplateDir()`. */
  templateDir?: string;
  /** Nada é escrito; só se conta o que seria copiado. */
  dryRun?: boolean;
}

export interface CopyTemplateResult {
  templateDir: string;
  targetDir: string;
  /** Alimenta `GenerationReport.filesCopied`. */
  filesCopied: number;
  /** Pares `nome no template` → `nome no projeto` efetivamente restaurados. */
  dotfilesRestored: { from: string; to: string }[];
  /** Caminhos relativos deliberadamente não copiados, para o `--verbose`. */
  skipped: string[];
}

/**
 * Copia o template para o destino.
 *
 * O que **nunca** é copiado, e por que cada um:
 *
 * - Tudo em `NEVER_TRAVERSE` (`node_modules`, `.git`, `dist`, `.next`, `.turbo`,
 *   `coverage`, …): artefato de build ou histórico. `.git` é o crítico — copiar o
 *   histórico do boilerplate para dentro do projeto do usuário reintroduz o nome antigo
 *   em `git log -p`, onde nenhum rename alcança.
 * - `packages/create-dontpanic/` **e** `packages/create-dontpanic/template/`. O segundo é
 *   uma cópia integral gitignorada do próprio repo, com 373 ocorrências fantasma do
 *   nome: copiá-la faria o rename trabalhar nelas e contaminaria a verificação final (o
 *   mapa mediu 506 linhas com a exclusão contra 879 sem ela). O primeiro é o gerador
 *   ANTIGO, que não é o produto (mapa §3.5).
 * - **Lockfile.** O `pnpm-lock.yaml` referencia os pacotes de workspace pelo nome VELHO;
 *   depois do rename ele descreve `@dontpanic/shared` num projeto onde só existe
 *   `@acme/shared`, e o `pnpm install --frozen-lockfile` do CI do projeto gerado falha
 *   com `ERR_PNPM_OUTDATED_LOCKFILE` — uma mensagem que fala de lockfile, não de nome. O
 *   projeto nasce sem lockfile e o primeiro `pnpm install` o escreve, já com o nome novo.
 * - `.env`. É o `.env` real da máquina de quem sincronizou o template, com segredos de
 *   dev dentro. O projeto gerado recebe um `.env` novo, com segredos novos, no passo de
 *   env.
 * - `.husky/_/` e `.claude/settings.local.json`: gerado no `prepare` e configuração local
 *   de uma máquina específica.
 */
export async function copyTemplate(
  targetDir: string,
  options: CopyTemplateOptions = {},
): Promise<CopyTemplateResult> {
  const templateDir = options.templateDir ?? (await resolveTemplateDir());
  const dryRun = options.dryRun ?? false;

  const excluded = [...NEVER_TRAVERSE_REL_PATHS, ...NEVER_COPY_REL_PATHS];
  const entries = await listFiles(templateDir, { skipRelPaths: excluded });

  let filesCopied = 0;
  const dotfilesRestored: { from: string; to: string }[] = [];
  const skipped: string[] = [];

  if (!dryRun) await mkdir(targetDir, { recursive: true });

  for (const entry of entries) {
    const segments = entry.rel.split('/');
    const name = segments[segments.length - 1] ?? '';

    if (isNeverCopied(name)) {
      skipped.push(entry.rel);
      continue;
    }
    // Defensivo: `listFiles` já não atravessa `NEVER_TRAVERSE` como diretório, mas um
    // arquivo com um desses nomes (um `dist` solto, por exemplo) escaparia.
    if (NEVER_TRAVERSE.has(name)) {
      skipped.push(entry.rel);
      continue;
    }
    if (isUnderAnyRelPath(entry.rel, excluded)) {
      skipped.push(entry.rel);
      continue;
    }

    const restored = restoreDotfileName(name);
    const relOut = [...segments.slice(0, -1), restored].join('/');
    // `assertWithin` antes de toda escrita: um `..` num nome de arquivo do template — ou
    // um template adulterado — significaria escrever fora do diretório do usuário.
    const dest = assertWithin(targetDir, relOut);

    if (!dryRun) {
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(entry.path, dest);
    }

    filesCopied += 1;
    if (restored !== name) dotfilesRestored.push({ from: entry.rel, to: relOut });
  }

  return { templateDir, targetDir, filesCopied, dotfilesRestored, skipped };
}
