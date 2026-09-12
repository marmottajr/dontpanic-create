import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  TEMPLATE_DIR_ENV_VAR,
  TEMPLATE_DOTFILE_RESTORES,
  copyTemplate,
  resolveTemplateDir,
  restoreDotfileName,
} from '../src/template.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Andaime
// ─────────────────────────────────────────────────────────────────────────────

async function tree(
  prefix: string,
  files: Record<string, string | Uint8Array>,
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    if (typeof content === 'string') await writeFile(abs, content, 'utf8');
    else await writeFile(abs, content);
  }
  return root;
}

const target = (): Promise<string> => mkdtemp(join(tmpdir(), 'dpc-target-'));

async function listRel(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
      else out.push(rel);
    }
  }
  await walk(root, '');
  return out.sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// Restauração de dotfiles
// ─────────────────────────────────────────────────────────────────────────────

describe('restauração de dotfiles', () => {
  it('a tabela é injetiva nas duas direções', () => {
    // O mapa confirmou que não existe nenhum arquivo chamado literalmente `gitignore`
    // ou `npmrc` (sem ponto) no repo base — é isso que garante que a restauração não
    // pode colidir com um arquivo legítimo e que a transformação é reversível.
    const froms = Object.keys(TEMPLATE_DOTFILE_RESTORES);
    assert.equal(new Set(froms).size, froms.length);
    for (const [from, to] of Object.entries(TEMPLATE_DOTFILE_RESTORES)) {
      assert.ok(to.startsWith('.'), `${to} deveria ser um dotfile`);
      assert.ok(!from.startsWith('.'), `${from} não deveria já ser um dotfile`);
    }
  });

  it('restaura as duas convenções e deixa o resto em paz', () => {
    assert.equal(restoreDotfileName('gitignore'), '.gitignore');
    assert.equal(restoreDotfileName('_gitignore'), '.gitignore');
    assert.equal(restoreDotfileName('npmrc'), '.npmrc');
    assert.equal(restoreDotfileName('package.json'), 'package.json');
    // Já é dotfile: o npm não mangla `.dockerignore`/`.editorconfig`, então eles chegam
    // com o ponto e não devem ser tocados.
    assert.equal(restoreDotfileName('.dockerignore'), '.dockerignore');
  });

  it('restaura .gitignore em QUALQUER nível da árvore', async () => {
    // O `.gitignore` da raiz é o essencial (sem ele o primeiro `git add .` do usuário
    // commita `node_modules`, `.next` e o `.env` com os segredos dele), mas a tabela é
    // aplicada por basename e não por caminho, de propósito: um `.gitignore` aninhado
    // que o template adquira amanhã já nasce coberto.
    const tpl = await tree('dpc-tpl-', {
      gitignore: 'node_modules/\n.env\n',
      npmrc: 'auto-install-peers=true\n',
      'apps/web/gitignore': '.next/\n',
      'package.json': '{}',
    });
    const dest = await target();

    const result = await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await listRel(dest), [
      '.gitignore',
      '.npmrc',
      'apps/web/.gitignore',
      'package.json',
    ]);
    assert.equal(await readFile(join(dest, '.gitignore'), 'utf8'), 'node_modules/\n.env\n');
    assert.equal(result.dotfilesRestored.length, 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O que nunca é copiado
// ─────────────────────────────────────────────────────────────────────────────

describe('exclusões da cópia', () => {
  it('não copia lockfile — o projeto gerado nasce sem ele', async () => {
    // O lockfile referencia os pacotes de workspace pelo nome VELHO. Depois do rename
    // ele descreve `@dontpanic/shared` num projeto onde só existe `@acme/shared`, e o
    // `pnpm install --frozen-lockfile` do CI do gerado falha com
    // `ERR_PNPM_OUTDATED_LOCKFILE` — mensagem que fala de lockfile, não de nome.
    const tpl = await tree('dpc-tpl-', {
      'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
      'package-lock.json': '{}',
      'package.json': '{}',
    });
    const dest = await target();

    const result = await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await listRel(dest), ['package.json']);
    assert.ok(result.skipped.includes('pnpm-lock.yaml'));
    assert.equal(result.filesCopied, 1);
  });

  it('não copia .env — é o .env real de quem sincronizou o template', async () => {
    const tpl = await tree('dpc-tpl-', {
      '.env': 'JWT_SECRET=segredo-de-verdade\n',
      '.env.example': 'JWT_SECRET=\n',
      'package.json': '{}',
    });
    const dest = await target();

    await copyTemplate(dest, { templateDir: tpl });

    // O `.env.example` FICA: é o template a partir do qual o passo de env escreve o
    // `.env` novo, com segredos novos.
    assert.deepEqual(await listRel(dest), ['.env.example', 'package.json']);
  });

  it('não copia node_modules, .git nem artefato de build', async () => {
    const tpl = await tree('dpc-tpl-', {
      'node_modules/.modules.yaml': 'x',
      '.git/HEAD': 'ref: refs/heads/main',
      'apps/api/dist/main.js': 'x',
      'apps/web/.next/build-manifest.json': '{}',
      '.turbo/turbo-build.log': 'x',
      'coverage/index.html': '<html>',
      'apps/api/tsconfig.tsbuildinfo': '{}',
      'apps/api/src/main.ts': 'export {};',
    });
    const dest = await target();

    await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await listRel(dest), ['apps/api/src/main.ts']);
  });

  it('não copia packages/create-dontpanic — nem o pacote, nem sua cópia do repo', async () => {
    // `template/` ali dentro é uma cópia integral gitignorada do próprio repositório,
    // com 373 ocorrências fantasma do nome. Copiá-la faria o rename trabalhar nelas e
    // contaminaria a verificação final: o mapa mediu 506 linhas com a exclusão contra
    // 879 sem ela.
    const tpl = await tree('dpc-tpl-', {
      'packages/create-dontpanic/package.json': '{ "name": "create-dontpanic" }',
      'packages/create-dontpanic/template/README.md': '# DontPanic',
      'packages/shared/package.json': '{ "name": "@dontpanic/shared" }',
    });
    const dest = await target();

    await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await listRel(dest), ['packages/shared/package.json']);
  });

  it('não copia .husky/_ nem a configuração local de uma máquina', async () => {
    const tpl = await tree('dpc-tpl-', {
      '.husky/_/husky.sh': 'x',
      '.husky/pre-commit': 'pnpm lint-staged',
      '.claude/settings.local.json': '{ "mcpServers": {} }',
      '.claude/settings.json': '{}',
    });
    const dest = await target();

    await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await listRel(dest), ['.claude/settings.json', '.husky/pre-commit']);
  });

  it('copia binário byte a byte', async () => {
    // O copiador não olha conteúdo — é o RENAME que precisa distinguir texto de
    // binário. Aqui a garantia é que um favicon chega intacto.
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0xff]);
    const tpl = await tree('dpc-tpl-', { 'apps/web/public/icon.png': bytes });
    const dest = await target();

    await copyTemplate(dest, { templateDir: tpl });

    const copied = await readFile(join(dest, 'apps/web/public/icon.png'));
    assert.deepEqual(new Uint8Array(copied), bytes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Contagem, dry-run e contenção
// ─────────────────────────────────────────────────────────────────────────────

describe('copyTemplate', () => {
  it('conta os arquivos copiados, para o GenerationReport', async () => {
    const tpl = await tree('dpc-tpl-', {
      'package.json': '{}',
      'apps/api/src/main.ts': 'export {};',
      'apps/web/src/app/page.tsx': 'export default () => null;',
      gitignore: 'node_modules/\n',
      'pnpm-lock.yaml': 'x',
    });
    const dest = await target();

    const result = await copyTemplate(dest, { templateDir: tpl });

    assert.equal(result.filesCopied, 4);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.templateDir, tpl);
    assert.equal(result.targetDir, dest);
  });

  it('dryRun conta sem escrever', async () => {
    const tpl = await tree('dpc-tpl-', { 'package.json': '{}', gitignore: 'x' });
    const dest = await target();

    const result = await copyTemplate(dest, { templateDir: tpl, dryRun: true });

    assert.equal(result.filesCopied, 2);
    assert.deepEqual(await readdir(dest), []);
  });

  it('escreve só dentro do destino', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'dpc-jail-'));
    const dest = join(parent, 'project');
    const sibling = join(parent, 'sibling');
    await mkdir(sibling, { recursive: true });
    const tpl = await tree('dpc-tpl-', { 'a/b/c.ts': 'x' });

    await copyTemplate(dest, { templateDir: tpl });

    assert.deepEqual(await readdir(sibling), []);
    assert.deepEqual(await listRel(dest), ['a/b/c.ts']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Resolução do diretório
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveTemplateDir', () => {
  it('honra o override de ambiente', async () => {
    // O CI de conformidade e os testes geram projetos a partir de uma árvore montada na
    // hora, não do template publicado.
    const tpl = await tree('dpc-tpl-', { 'package.json': '{}' });
    const previous = process.env[TEMPLATE_DIR_ENV_VAR];
    process.env[TEMPLATE_DIR_ENV_VAR] = tpl;
    try {
      assert.equal(await resolveTemplateDir(), tpl);
    } finally {
      if (previous === undefined) delete process.env[TEMPLATE_DIR_ENV_VAR];
      else process.env[TEMPLATE_DIR_ENV_VAR] = previous;
    }
  });

  it('recusa um override que não existe, em vez de devolver árvore vazia', async () => {
    // Falhar aqui é o ponto: um caminho inexistente que passa silenciosamente aparece
    // três passos depois como "template vazio", e a causa já não é óbvia.
    const previous = process.env[TEMPLATE_DIR_ENV_VAR];
    process.env[TEMPLATE_DIR_ENV_VAR] = join(tmpdir(), 'nao-existe-dpc-xyz');
    try {
      await assert.rejects(resolveTemplateDir(), /não existe/);
    } finally {
      if (previous === undefined) delete process.env[TEMPLATE_DIR_ENV_VAR];
      else process.env[TEMPLATE_DIR_ENV_VAR] = previous;
    }
  });

  it('sem template sincronizado, o erro diz o que fazer', async () => {
    // Neste repo o `template/` não é versionado (a fonte da verdade é a tag do repo
    // dontpanic), então a mensagem tem de nomear `pnpm sync-template`.
    const previous = process.env[TEMPLATE_DIR_ENV_VAR];
    delete process.env[TEMPLATE_DIR_ENV_VAR];
    try {
      await resolveTemplateDir();
      // Se o template ESTIVER sincronizado, resolver é o comportamento certo e não há
      // o que asserir aqui.
    } catch (error) {
      assert.match(String(error), /sync-template/);
    } finally {
      if (previous !== undefined) process.env[TEMPLATE_DIR_ENV_VAR] = previous;
    }
  });
});
