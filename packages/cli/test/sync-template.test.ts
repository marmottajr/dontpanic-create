import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DOTFILE_RENAMES,
  EXCLUDED_REL_PATHS,
  TEMPLATE_PATCHES,
  applyTemplatePatches,
  assertCleanRepo,
  readDeclaration,
  resolveCommit,
} from '../scripts/sync-template.ts';
import { run } from '../src/util/exec.ts';

/** Repo git descartável, com um commit. */
async function makeRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'dp-repo-'));
  await run('git', ['init', '-q', '-b', 'main'], { cwd: dir, timeout: 30_000 });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, timeout: 30_000 });
  await run('git', ['config', 'user.name', 'Test'], { cwd: dir, timeout: 30_000 });
  await writeFile(join(dir, 'README.md'), '# fixture\n', 'utf8');
  await run('git', ['add', '-A'], { cwd: dir, timeout: 30_000 });
  await run('git', ['commit', '-q', '-m', 'init'], { cwd: dir, timeout: 30_000 });
  return dir;
}

describe('assertCleanRepo', () => {
  it('aceita um repo limpo', async () => {
    const dir = await makeRepo();
    try {
      await assertCleanRepo(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recusa repo com arquivo modificado', async () => {
    // Um template tirado de um working tree sujo é irreprodutível: o template.json
    // declararia um commit que não descreve o que foi empacotado. E como o template vai
    // DENTRO do pacote publicado no npm, o erro chega a todo usuário — aparecendo como
    // "o projeto gerado tem um arquivo que o boilerplate não tem".
    const dir = await makeRepo();
    try {
      await writeFile(join(dir, 'README.md'), '# modificado\n', 'utf8');
      await assert.rejects(assertCleanRepo(dir), /sujo/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recusa repo com arquivo NÃO RASTREADO', async () => {
    // `--porcelain` inclui não rastreados de propósito: um arquivo novo entra no
    // template do mesmo jeito que um modificado, e é ainda mais difícil de reconstruir
    // depois — não está em commit nenhum.
    const dir = await makeRepo();
    try {
      await writeFile(join(dir, 'sobra.txt'), 'x\n', 'utf8');
      await assert.rejects(assertCleanRepo(dir), /sujo/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recusa diretório que não é repo git', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dp-norepo-'));
    try {
      await assert.rejects(assertCleanRepo(dir), /repositório git/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('recusa repo sujo em subdiretório, não só na raiz', async () => {
    const dir = await makeRepo();
    try {
      await mkdir(join(dir, 'apps/api'), { recursive: true });
      await writeFile(join(dir, 'apps/api/main.ts'), 'export {};\n', 'utf8');
      // O `git status --porcelain` colapsa diretório não rastreado num `?? apps/`, e é
      // essa string que a mensagem mostra. Serve: o operador precisa saber ONDE olhar,
      // e o `git status` dele mostra o resto.
      await assert.rejects(assertCleanRepo(dir), /apps\//);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('resolveCommit', () => {
  it('resolve HEAD e uma tag no mesmo sha', async () => {
    const dir = await makeRepo();
    try {
      await run('git', ['tag', 'v9.9.9'], { cwd: dir, timeout: 30_000 });
      const head = await resolveCommit(dir, 'HEAD');
      const tag = await resolveCommit(dir, 'v9.9.9');
      assert.match(head, /^[0-9a-f]{40}$/);
      assert.equal(head, tag);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('exclusões', () => {
  it('o instalador anterior não entra no próprio template', () => {
    // `packages/create-dontpanic/template/` é uma cópia integral do repo (2,4 MB):
    // copiá-la dobra o tarball e faz o rename trabalhar em ocorrências fantasma.
    assert.ok(EXCLUDED_REL_PATHS.includes('packages/create-dontpanic'));
  });

  it('exclui o que é da máquina de quem sincronizou, não do produto', () => {
    assert.ok(EXCLUDED_REL_PATHS.includes('.claude/settings.local.json'));
    assert.ok(EXCLUDED_REL_PATHS.includes('.husky/_'));
  });

  it('exclui o workflow que publica o instalador', () => {
    // Num projeto gerado ele roda e falha: não existe pacote para publicar.
    assert.ok(
      EXCLUDED_REL_PATHS.includes('.github/workflows/publish-create-dontpanic.yml'),
    );
  });
});

describe('renomeação de dotfiles', () => {
  it('cobre exatamente os dois que o npm nunca entrega num tarball', () => {
    // Sem o `.gitignore`, o projeto gerado commita node_modules e o .env no primeiro
    // commit. Sem o `.npmrc` (auto-install-peers), o `pnpm install` dele pode falhar em
    // peers. As duas exclusões do npm não têm flag para desligar.
    assert.deepEqual(DOTFILE_RENAMES, { '.gitignore': 'gitignore', '.npmrc': 'npmrc' });
  });
});

describe('applyTemplatePatches', () => {
  it('troca --frozen-lockfile nos workflows, que o template sem lockfile quebraria', () => {
    // O template nasce sem lockfile de propósito. Com `--frozen-lockfile`, o CI do
    // projeto gerado falha no PRIMEIRO push com ERR_PNPM_NO_LOCKFILE, num arquivo que o
    // usuário nunca tocou.
    const before = '      - run: pnpm install --frozen-lockfile\n';
    const { content, applied } = applyTemplatePatches('.github/workflows/ci.yml', before);
    assert.match(content, /pnpm install --no-frozen-lockfile/);
    assert.equal(applied.length, 1);
  });

  it('troca --frozen-lockfile nos Dockerfiles também', () => {
    // `Dockerfile.api` e `Dockerfile.web` usam o mesmo flag: sem o patch, o
    // `docker build` do projeto gerado falha igual ao CI.
    for (const file of ['Dockerfile.api', 'Dockerfile.web', 'Dockerfile.dev']) {
      const { content } = applyTemplatePatches(file, 'RUN pnpm install --frozen-lockfile\n');
      assert.match(content, /--no-frozen-lockfile/, `${file} não foi corrigido`);
    }
  });

  it('não mexe em --frozen-lockfile dentro de um .ts ou .md', () => {
    // O patch é cirúrgico por tipo de arquivo: documentação e código que MENCIONAM o
    // flag não são o problema — o problema é quem o EXECUTA.
    for (const file of ['src/index.ts', 'README.md']) {
      const { content, applied } = applyTemplatePatches(
        file,
        'pnpm install --frozen-lockfile\n',
      );
      assert.equal(content, 'pnpm install --frozen-lockfile\n');
      assert.deepEqual(applied, []);
    }
  });

  it('afrouxa o coverageThreshold da API, que não tem folga nenhuma em functions', () => {
    // A API exige functions: 100 e alcança exatamente 100. Como o gerador SUBTRAI,
    // qualquer receita menor que a completa pode deixar uma função sem cobertura — e aí
    // o `pnpm test` do projeto gerado falha num gate que o usuário não escreveu.
    const before = `  coverageThreshold: {
    global: {
      statements: 97,
      branches: 92,
      functions: 100,
      lines: 97,
    },
  },
`;
    const { content, applied } = applyTemplatePatches('apps/api/jest.config.js', before);
    assert.match(content, /statements: 90,/);
    assert.match(content, /branches: 85,/);
    assert.match(content, /functions: 90,/);
    assert.match(content, /lines: 90,/);
    assert.doesNotMatch(content, /functions: 100/);
    assert.equal(applied.length, 1);
    // E deixa no arquivo a explicação de por que o piso é 90.
    assert.match(content, /subtração/);
  });

  it('afrouxa também os thresholds do web (0,5 ponto de margem)', () => {
    const before = `      thresholds: {
        statements: 99,
        branches: 88,
        functions: 95,
        lines: 99,
      },
`;
    const { content } = applyTemplatePatches('apps/web/vitest.config.mts', before);
    assert.match(content, /statements: 90,/);
    assert.match(content, /lines: 90,/);
  });

  it('remove do .gitignore a linha que aponta para o instalador ausente', () => {
    const before = 'node_modules/\npackages/create-dontpanic/template/\ncoverage/\n';
    const { content } = applyTemplatePatches('.gitignore', before);
    assert.equal(content, 'node_modules/\ncoverage/\n');
  });

  it('remove também o comentário órfão que explicava a regra', () => {
    // Apagar só o caminho deixa um `# create-dontpanic: generated template` sozinho:
    // pior que a linha original, porque descreve uma regra que já não existe.
    const before =
      'node_modules/\n\n# create-dontpanic: generated template (built from the repo on publish)\npackages/create-dontpanic/template/\ncoverage/\n';
    const { content } = applyTemplatePatches('.gitignore', before);
    assert.ok(!content.includes('create-dontpanic'));
    assert.match(content, /node_modules\//);
    assert.match(content, /coverage\//);
  });

  it('faz o mesmo no .prettierignore', () => {
    const before =
      '# Generated boilerplate copy bundled by create-dontpanic (built on publish)\npackages/create-dontpanic/template/\ndist\n';
    const { content } = applyTemplatePatches('.prettierignore', before);
    assert.equal(content, 'dist\n');
  });

  it('é idempotente: aplicar duas vezes dá o mesmo resultado', () => {
    // O sync apaga e recopia o template a cada execução, mas o patch também precisa ser
    // idempotente — senão um `--no-no-frozen-lockfile` apareceria num segundo passe.
    const once = applyTemplatePatches('ci.yml', 'pnpm install --frozen-lockfile\n').content;
    const twice = applyTemplatePatches('ci.yml', once).content;
    assert.equal(once, twice);
    assert.match(twice, /^pnpm install --no-frozen-lockfile$/m);
  });

  it('todo patch tem um motivo escrito', () => {
    // O motivo vai para o resumo do sync e é a documentação do patch: um patch sem
    // motivo é um patch que ninguém sabe se ainda é necessário.
    for (const patch of TEMPLATE_PATCHES) {
      assert.ok(patch.reason.length > 20, `patch sem motivo legível: ${patch.find}`);
    }
  });
});

describe('template.json', () => {
  it('declara repo, tag e commit resolvido', async () => {
    // Tag pode ser movida (`git tag -f`), commit não: quem manda na reprodutibilidade é
    // o commit, e a tag é a etiqueta legível dele.
    const declaration = await readDeclaration();
    assert.equal(declaration.repo, 'marmottajr/dontpanic');
    assert.match(declaration.tag, /^v\d+\.\d+\.\d+$/);
    assert.match(declaration.commit, /^[0-9a-f]{40}$/);
    assert.match(declaration.url, /^https:\/\/github\.com\//);
  });
});
