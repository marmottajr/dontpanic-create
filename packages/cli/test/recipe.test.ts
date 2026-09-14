import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ALWAYS_ON,
  DEFAULT_PRESET,
  PRESETS,
  PRESET_IDS,
  buildCommand,
  cloneRecipe,
  parseArgs,
  presetRecipe,
  reconcileRecipe,
  toFlags,
  validateRecipe,
} from '../src/recipe.ts';
import type { PresetId } from '../src/recipe.ts';
import { FEATURE_IDS } from '../src/types.ts';
import type { Recipe } from '../src/types.ts';

const PROJECT = { displayName: 'Acme Corp', slug: 'acme-corp' };

const errorsOf = (recipe: Recipe) =>
  validateRecipe(recipe)
    .filter((issue) => issue.level === 'error')
    .map((issue) => issue.message);

/** Atalho: aplica mutações sobre um preset e reconcilia, que é como o CLI faz. */
function recipeFrom(preset: PresetId, mutate: (r: Recipe) => void = () => {}): Recipe {
  const recipe = presetRecipe(preset, PROJECT);
  mutate(recipe);
  return reconcileRecipe(recipe).recipe;
}

describe('PRESETS', () => {
  it('cobre exatamente os ids declarados, e o default existe', () => {
    assert.deepEqual(Object.keys(PRESETS).sort(), [...PRESET_IDS].sort());
    assert.ok(PRESETS[DEFAULT_PRESET] !== undefined);
  });

  it('todo preset produz receita sem erro de coerência', () => {
    // É o invariante que sustenta a landing: qualquer botão de preset gera um projeto que
    // o CLI aceita. Um preset que precisa de reconciliação é um preset com bug.
    for (const id of PRESET_IDS) {
      const recipe = presetRecipe(id, PROJECT);
      assert.deepEqual(errorsOf(recipe), [], `preset ${id} tem erro`);
      const { applied } = reconcileRecipe(recipe);
      assert.deepEqual(
        applied.map((i) => i.message),
        [],
        `preset ${id} precisou de reconciliação`,
      );
    }
  });

  it('cada preset descreve todas as features, sem herdar a do vizinho', () => {
    for (const id of PRESET_IDS) {
      for (const feature of FEATURE_IDS) {
        assert.equal(
          typeof PRESETS[id].features[feature],
          'boolean',
          `preset ${id} não declara ${feature}`,
        );
      }
    }
  });

  it('mantém as features não-removíveis ligadas em todos os presets', () => {
    // `audit` não é opção na v1: o export de LGPD retorna linhas de auditoria.
    for (const id of PRESET_IDS) {
      for (const feature of ALWAYS_ON) {
        assert.equal(PRESETS[id].features[feature], true, `${id} desligou ${feature}`);
      }
    }
  });

  it('minimal é single-tenant e sem nenhuma porta pública', () => {
    // A cadeia do mapa: single-tenant ⇒ sem signup ⇒ painel sem sentido ⇒ libera planos e
    // convites. O resultado é o preset onde o seed é a única entrada.
    const f = PRESETS.minimal.features;
    assert.equal(f.multiTenant, false);
    assert.equal(f.publicSignup, false);
    assert.equal(f.platform, false);
    assert.equal(f.plans, false);
    assert.equal(f.invitations, false);
    // "port + memory": o port fica, porque port com zero jobs não compila (I8).
    assert.equal(f.queue, true);
    assert.equal(PRESETS.minimal.drivers.queue, 'memory');
  });

  it('saas inclui o painel e, com ele, convites, planos e auditoria', () => {
    const f = PRESETS.saas.features;
    assert.equal(f.platform, true);
    for (const required of ['invitations', 'plans', 'audit'] as const) {
      assert.equal(f[required], true, `platform exige ${required}`);
    }
    assert.equal(f.oauth, false, 'saas não pede console de terceiro no primeiro dia');
  });

  it('complete liga tudo e lista os três providers', () => {
    for (const feature of FEATURE_IDS) {
      assert.equal(PRESETS.complete.features[feature], true, `complete deixou ${feature} off`);
    }
    assert.deepEqual(PRESETS.complete.oauth.providers, ['google', 'apple', 'github']);
  });

  it('internal é multi-tenant completo, mas sem cadastro aberto', () => {
    // Venda assistida: o operador cria a empresa e convida o primeiro admin. Não é
    // single-tenant — há muitas empresas clientes.
    const f = PRESETS.internal.features;
    assert.equal(f.multiTenant, true);
    assert.equal(f.publicSignup, false);
    assert.equal(f.invitations, true);
    assert.equal(f.platform, true);
    assert.equal(PRESETS.internal.i18n.locales.length, 1);
  });

  it('não compartilha arrays entre receitas geradas do mesmo preset', () => {
    // Um `locales` compartilhado faria a segunda geração herdar a edição da primeira.
    const a = presetRecipe('saas', PROJECT);
    const b = presetRecipe('saas', PROJECT);
    a.i18n.locales.push('es');
    a.oauth.providers.push('google');
    assert.deepEqual(b.i18n.locales, PRESETS.saas.i18n.locales);
    assert.deepEqual(b.oauth.providers, []);
  });
});

describe('validateRecipe — combinações inválidas', () => {
  const rejects = (mutate: (r: Recipe) => void, fragment: string) => {
    const recipe = presetRecipe('saas', PROJECT);
    mutate(recipe);
    const messages = errorsOf(recipe);
    assert.ok(messages.length > 0, 'esperava erro');
    assert.ok(
      messages.some((m) => m.toLowerCase().includes(fragment.toLowerCase())),
      `esperava mensagem com "${fragment}", veio: ${messages.join(' | ')}`,
    );
  };

  it('recusa painel da plataforma em single-tenant (I12)', () => {
    rejects((r) => {
      r.features.multiTenant = false;
    }, 'atravessa empresas');
  });

  it('recusa registro público em single-tenant (I11)', () => {
    rejects((r) => {
      r.features.multiTenant = false;
    }, 'criação de empresa');
  });

  it('recusa painel sem convites, sem planos ou sem auditoria (I1, I2, I3)', () => {
    // As três são arestas hard: `POST /platform/tenants` CONVIDA, o painel faz CRUD de
    // planos, e o audit do painel aborta a transação quando falha.
    rejects((r) => {
      r.features.invitations = false;
    }, '--invitations');
    rejects((r) => {
      r.features.plans = false;
    }, '--plans');
  });

  it('recusa auditoria desligada (I4)', () => {
    rejects((r) => {
      r.features.audit = false;
    }, 'não é removível');
  });

  it('recusa auditoria desligada SEM oferecer correção automática', () => {
    // Recusa e auto-correção são coisas diferentes: um `fix` aqui faria o CLI religar a
    // auditoria em silêncio e seguir, o que é exatamente o que o mapa manda não fazer.
    const recipe = presetRecipe('saas', PROJECT);
    recipe.features.audit = false;
    const issue = validateRecipe(recipe).find((i) => i.message.includes('não é removível'));
    assert.ok(issue !== undefined);
    assert.equal(issue.fix, undefined);
  });

  it('recusa login social sem provider', () => {
    rejects((r) => {
      r.features.oauth = true;
      r.oauth.providers = [];
    }, 'sem nenhum provider');
  });

  it('recusa captcha ligado com driver none, e driver sem feature', () => {
    rejects((r) => {
      r.features.captcha = true;
      r.drivers.captcha = 'none';
    }, 'driver "none"');
    rejects((r) => {
      r.features.captcha = false;
      r.drivers.captcha = 'turnstile';
    }, 'feature desligada');
  });

  it('recusa idioma default fora da lista', () => {
    rejects((r) => {
      r.i18n.defaultLocale = 'de';
    }, 'não está na lista');
  });

  it('recusa código de idioma que não é BCP 47 curto', () => {
    rejects((r) => {
      r.i18n.locales = ['portugues'];
      r.i18n.defaultLocale = 'portugues';
    }, 'código de idioma');
  });

  it('recusa idioma sem catálogo no boilerplate, em vez de gerar sem ele', () => {
    // `es` passava na validação e o projeto nascia só com pt-BR e en-US: a poda mapeia
    // todo código não-`pt` para en-US. Um idioma pedido e ausente sem aviso.
    rejects((r) => {
      r.i18n.locales = ['pt', 'en', 'es'];
    }, 'não tem catálogo');
    rejects((r) => {
      r.features.i18n = false;
      r.i18n.locales = ['de'];
      r.i18n.defaultLocale = 'de';
    }, 'não tem catálogo');
    // As formas que existem continuam aceitas, curtas ou com região.
    for (const locales of [['pt', 'en'], ['pt-BR', 'en-US'], ['en']]) {
      const recipe = presetRecipe('saas', PROJECT);
      recipe.i18n.locales = locales;
      recipe.i18n.defaultLocale = locales[0] as string;
      assert.ok(!errorsOf(recipe).some((m) => m.includes('catálogo')), locales.join(','));
    }
  });

  it('avisa — sem recusar — quando o seed é a única porta de entrada (I19)', () => {
    const recipe = presetRecipe('minimal', PROJECT);
    assert.deepEqual(errorsOf(recipe), []);
    const warnings = validateRecipe(recipe).filter((i) => i.level === 'warning');
    assert.ok(warnings.some((w) => w.message.includes('db:seed')));
  });

  it('avisa que sem fila durável nenhum e-mail sai em produção', () => {
    // O CLAUDE.md do boilerplate é enfático nisso, e é a pegadinha que mais custa: o
    // projeto sobe, o login funciona, e o e-mail de verificação simplesmente não chega.
    const memory = recipeFrom('saas', (r) => {
      r.drivers.queue = 'memory';
    });
    const warnings = validateRecipe(memory).map((i) => i.message.toLowerCase());
    assert.ok(warnings.some((m) => m.includes('e-mail')));
  });

  it('avisa que o rate limit anda no cache (I15)', () => {
    const recipe = recipeFrom('saas', (r) => {
      r.drivers.cache = 'memory';
    });
    const warnings = validateRecipe(recipe).map((i) => i.message);
    assert.ok(warnings.some((m) => m.includes('rate limit')));
  });
});

describe('reconcileRecipe', () => {
  it('desliga o painel em single-tenant e diz o que fez', () => {
    const { recipe, applied } = reconcileRecipe(
      (() => {
        const base = presetRecipe('saas', PROJECT);
        base.features.multiTenant = false;
        return base;
      })(),
    );
    assert.equal(recipe.features.platform, false);
    assert.equal(recipe.features.publicSignup, false);
    assert.ok(applied.length >= 2);
    assert.deepEqual(errorsOf(recipe), []);
  });

  it('é idempotente: reconciliar de novo não muda nada', () => {
    // Idempotência é o que permite o CLI reconciliar em dois pontos (depois dos prompts e
    // antes de gerar) sem duplicar avisos nem oscilar entre dois estados.
    const broken: Array<(r: Recipe) => void> = [
      (r) => {
        r.features.multiTenant = false;
      },
      (r) => {
        r.features.oauth = true;
        r.oauth.providers = [];
      },
      (r) => {
        r.features.captcha = false;
        r.drivers.captcha = 'recaptcha-v3';
      },
      (r) => {
        r.features.queue = false;
        r.drivers.queue = 'bullmq';
      },
      (r) => {
        r.features.i18n = false;
        r.i18n.locales = ['pt', 'en', 'es'];
      },
      (r) => {
        r.i18n.locales = ['pt', 'pt', 'en'];
      },
      (r) => {
        r.features.oauth = false;
        r.oauth.providers = ['google', 'google'];
      },
    ];

    for (const mutate of broken) {
      const base = presetRecipe('saas', PROJECT);
      mutate(base);
      const first = reconcileRecipe(base);
      const second = reconcileRecipe(first.recipe);
      assert.deepEqual(second.applied, [], `não convergiu: ${JSON.stringify(first.applied)}`);
      assert.deepEqual(second.recipe, first.recipe);
    }
  });

  it('colapsa os idiomas quando i18n está desligado', () => {
    const recipe = recipeFrom('saas', (r) => {
      r.features.i18n = false;
      r.i18n.locales = ['pt', 'en'];
      r.i18n.defaultLocale = 'en';
    });
    assert.deepEqual(recipe.i18n.locales, ['en']);
    assert.equal(recipe.i18n.defaultLocale, 'en');
  });

  it('não mutila a receita de entrada', () => {
    const base = presetRecipe('saas', PROJECT);
    base.features.multiTenant = false;
    const snapshot = cloneRecipe(base);
    reconcileRecipe(base);
    assert.deepEqual(base, snapshot);
  });
});

describe('parseArgs', () => {
  const parse = (argv: string[]) => parseArgs(argv);

  it('sem argumento nenhum, pede modo interativo', () => {
    const result = parse([]);
    assert.equal(result.interactive, true);
    assert.deepEqual(result.errors, []);
  });

  it('deriva nome e slug do posicional', () => {
    const result = parse(['Acme Corp']);
    assert.equal(result.interactive, false);
    assert.equal(result.recipe?.project.displayName, 'Acme Corp');
    assert.equal(result.recipe?.project.slug, 'acme-corp');
  });

  it('trata posicional com barra como caminho, e usa o último segmento como nome', () => {
    const result = parse(['./apps/loja']);
    assert.equal(result.target, './apps/loja');
    assert.equal(result.recipe?.project.displayName, 'loja');
  });

  it('--no-2fa realmente desliga o 2FA', () => {
    // O caso que motiva a sugestão por distância de edição: um typo aqui geraria o projeto
    // COM 2FA e o usuário só descobriria muito depois.
    const on = parse(['acme']).recipe;
    const off = parse(['acme', '--no-2fa']).recipe;
    assert.equal(on?.features.twoFactor, true);
    assert.equal(off?.features.twoFactor, false);
  });

  it('aceita o kebab do id como alias do apelido', () => {
    assert.equal(parse(['acme', '--no-two-factor']).recipe?.features.twoFactor, false);
    assert.equal(parse(['acme', '--no-multi-tenant']).recipe?.features.multiTenant, false);
    assert.equal(parse(['acme', '--no-public-signup']).recipe?.features.publicSignup, false);
    assert.equal(parse(['acme', '--no-easter-eggs']).recipe?.features.easterEggs, false);
  });

  it('recusa desligar o que não é removível', () => {
    const result = parse(['acme', '--no-audit']);
    assert.ok(result.errors.some((e) => e.includes('--no-audit')));
    assert.equal(result.recipe, undefined);
  });

  it('a última flag ganha, inclusive contra o valor que ela acompanha', () => {
    // `--captcha=turnstile --no-captcha` tem que terminar sem captcha: se só a booleana
    // caísse, a reconciliação veria o driver e concluiria o contrário do que foi pedido.
    const result = parse(['acme', '--captcha=turnstile', '--no-captcha']);
    assert.equal(result.recipe?.features.captcha, false);
    assert.equal(result.recipe?.drivers.captcha, 'none');
  });

  it('--i18n=false deixa um idioma; --i18n=pt,en liga a feature', () => {
    const single = parse(['acme', '--i18n=false']).recipe;
    assert.equal(single?.features.i18n, false);
    const multi = parse(['acme', '--preset=internal', '--i18n=pt,en']).recipe;
    assert.equal(multi?.features.i18n, true);
    assert.deepEqual(multi?.i18n.locales, ['pt', 'en']);
    assert.equal(multi?.i18n.defaultLocale, 'pt');
  });

  it('--oauth=false desliga e esvazia; --oauth=lista liga', () => {
    const off = parse(['acme', '--oauth=false']).recipe;
    assert.equal(off?.features.oauth, false);
    assert.deepEqual(off?.oauth.providers, []);
    const on = parse(['acme', '--oauth=google,github']).recipe;
    assert.equal(on?.features.oauth, true);
    assert.deepEqual(on?.oauth.providers, ['google', 'github']);
  });

  it('--oauth sozinho é erro, porque não existe provider default seguro', () => {
    const result = parse(['acme', '--oauth']);
    assert.ok(result.errors.some((e) => e.includes('--oauth=')));
  });

  it('recusa provider e driver desconhecidos', () => {
    assert.ok(parse(['acme', '--oauth=twitter']).errors.some((e) => e.includes('twitter')));
    assert.ok(parse(['acme', '--captcha=hcaptcha']).errors.some((e) => e.includes('hcaptcha')));
    assert.ok(parse(['acme', '--db=mysql']).errors.some((e) => e.includes('mysql')));
  });

  it('exige "=" nas flags de valor', () => {
    // A forma com espaço engoliria o nome do projeto: `create --i18n acme`.
    const result = parse(['acme', '--preset', 'saas']);
    assert.ok(result.errors.some((e) => e.includes('=')));
  });

  it('sugere a flag mais próxima em vez de ignorar em silêncio', () => {
    assert.ok(parse(['acme', '--no-2af']).errors.some((e) => e.includes('--no-2fa')));
    assert.ok(parse(['acme', '--prest=saas']).errors.some((e) => e.includes('--preset')));
    assert.ok(parse(['acme', '--no-instal']).errors.some((e) => e.includes('--no-install')));
  });

  it('não sugere nada quando a flag não parece com nada', () => {
    const errors = parse(['acme', '--zzzzzzzzzzzz']).errors;
    assert.ok(errors.some((e) => e.includes('--help')));
  });

  it('--yes sem nome é erro: não há como perguntar', () => {
    assert.ok(parse(['--yes']).errors.some((e) => e.includes('nome')));
  });

  it('recusa slug ilegal informado à mão', () => {
    assert.ok(parse(['acme', '--slug=user']).errors.some((e) => e.includes('reservada do SQL')));
  });

  it('recusa mais de um posicional', () => {
    assert.ok(parse(['acme', 'outro']).errors.some((e) => e.includes('um nome de projeto')));
  });

  it('carrega as opções de execução fora da receita', () => {
    const result = parse(['acme', '--dry-run', '--debug', '--no-git', '--no-install', '--force']);
    assert.equal(result.dryRun, true);
    assert.equal(result.debug, true);
    assert.equal(result.recipe?.options.git, false);
    assert.equal(result.recipe?.options.install, false);
    assert.equal(result.recipe?.options.force, true);
  });

  it('o preset vale mesmo vindo depois das outras flags', () => {
    const result = parse(['acme', '--no-2fa', '--preset=internal']);
    assert.equal(result.recipe?.features.publicSignup, false);
    assert.equal(result.recipe?.features.twoFactor, false);
  });

  it('--help e --version não exigem nome', () => {
    assert.equal(parse(['--help']).help, true);
    assert.equal(parse(['-h']).help, true);
    assert.equal(parse(['--version']).version, true);
    assert.equal(parse(['-v']).version, true);
  });
});

describe('toFlags / buildCommand', () => {
  it('um preset puro rende no máximo a flag do próprio preset', () => {
    for (const id of PRESET_IDS) {
      const flags = toFlags(presetRecipe(id, PROJECT));
      const expected = id === DEFAULT_PRESET ? [] : [`--preset=${id}`];
      assert.deepEqual(flags, expected, `preset ${id} rendeu ${flags.join(' ')}`);
    }
  });

  it('escolhe o preset base que rende menos flags', () => {
    // Uma receita igual a `internal` não deve sair como `--preset=saas` mais dez flags.
    const recipe = presetRecipe('internal', PROJECT);
    assert.deepEqual(toFlags(recipe), ['--preset=internal']);
    assert.ok(toFlags(recipe, 'saas').length > 1);
  });

  it('emite só o que difere do preset base', () => {
    const recipe = recipeFrom('saas', (r) => {
      r.features.twoFactor = false;
    });
    assert.deepEqual(toFlags(recipe, 'saas'), ['--no-2fa']);
  });

  it('buildCommand põe o nome entre o comando e as flags, com aspas quando precisa', () => {
    const recipe = recipeFrom('saas', (r) => {
      r.features.twoFactor = false;
    });
    assert.equal(buildCommand(recipe), "npx create-dontpanic 'Acme Corp' --no-2fa");
  });

  it('só emite --slug quando ele não sai do nome', () => {
    const derived = presetRecipe('saas', PROJECT);
    assert.ok(!toFlags(derived).some((f) => f.startsWith('--slug=')));
    const custom = presetRecipe('saas', { displayName: 'Acme Corp', slug: 'loja' });
    assert.ok(toFlags(custom).includes('--slug=loja'));
  });
});

describe('round-trip: parseArgs(toFlags(r)) devolve r', () => {
  // A propriedade que faz a landing page confiável: a linha que ela mostra tem que produzir
  // exatamente a receita que ela descreveu. Sem isso, o site e o CLI divergem em silêncio.
  const cases: Array<[string, Recipe]> = [
    ...PRESET_IDS.map((id): [string, Recipe] => [`preset ${id}`, presetRecipe(id, PROJECT)]),
    ['saas sem 2fa', recipeFrom('saas', (r) => void (r.features.twoFactor = false))],
    [
      'saas com oauth',
      recipeFrom('saas', (r) => {
        r.features.oauth = true;
        r.oauth.providers = ['google', 'github'];
      }),
    ],
    [
      'saas sem fila',
      recipeFrom('saas', (r) => {
        r.features.queue = false;
      }),
    ],
    [
      'saas com fila em memória',
      recipeFrom('saas', (r) => {
        r.drivers.queue = 'memory';
      }),
    ],
    [
      'saas single-language',
      recipeFrom('saas', (r) => {
        r.features.i18n = false;
        r.i18n.locales = ['en'];
        r.i18n.defaultLocale = 'en';
      }),
    ],
    [
      'internal com três idiomas e default no segundo',
      recipeFrom('internal', (r) => {
        r.features.i18n = true;
        r.i18n.locales = ['pt', 'en', 'es'];
        r.i18n.defaultLocale = 'en';
      }),
    ],
    [
      'complete sem easter eggs e sem apple',
      recipeFrom('complete', (r) => {
        r.features.easterEggs = false;
        r.oauth.providers = ['google', 'github'];
      }),
    ],
    [
      'minimal virando multi-tenant',
      recipeFrom('minimal', (r) => {
        r.features.multiTenant = true;
      }),
    ],
    [
      'drivers todos trocados',
      recipeFrom('saas', (r) => {
        r.drivers.storage = 'local';
        r.drivers.mail = 'console';
        r.drivers.cache = 'memory';
        r.drivers.captcha = 'recaptcha-v3';
      }),
    ],
    [
      'sem git, sem install, sem docker, com force',
      recipeFrom('saas', (r) => {
        r.options = { git: false, install: false, docker: false, force: true };
      }),
    ],
    [
      'slug customizado e descrição',
      recipeFrom('saas', (r) => {
        r.project = { displayName: 'Acme Corp', slug: 'loja', description: 'Loja da Acme' };
      }),
    ],
  ];

  for (const [name, recipe] of cases) {
    it(name, () => {
      const flags = toFlags(recipe);
      const result = parseArgs([recipe.project.displayName, ...flags]);
      assert.deepEqual(result.errors, [], `erros no re-parse de: ${flags.join(' ')}`);
      const reparsed = reconcileRecipe(result.recipe as Recipe).recipe;
      assert.deepEqual(reparsed, recipe, `flags: ${flags.join(' ')}`);
    });
  }
});
