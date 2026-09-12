// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/out/**',
      '**/node_modules/**',
      // O template é o boilerplate de outro repo, com o lint dele. Lintar aqui só
      // produziria ruído sobre código que não é nosso e que não editamos.
      'packages/cli/template/**',
      '.conformance/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Projetos explícitos, não `projectService`.
        //
        // O `projectService` acha o tsconfig mais PRÓXIMO, que em `packages/cli` é o de
        // build — e aquele inclui só `src`, porque é dali que sai o `dist`. Com ele, os
        // testes e os scripts ficariam fora do lint em silêncio, que é o pior resultado
        // possível: um `pnpm lint` verde que não olhou metade do código.
        //
        // `tsconfig.eslint.json` existe só para o ESLint e cobre os três diretórios.
        project: ['./packages/cli/tsconfig.eslint.json', './apps/web/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // O gerador manipula texto vindo de arquivos: `any` esconde exatamente os erros
      // de tipo que importam aqui.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Promise solta num gerador de arquivos é escrita que pode não ter acontecido
      // quando o processo termina — por isso a regra fica ligada.
      //
      // A exceção são `describe`/`it` do `node:test`: eles devolvem uma Promise por
      // design, e o runner é que a aguarda. Sem declará-los seguros, 517 dos 534
      // problemas do lint eram esse falso positivo — e uma regra que grita em todo teste
      // é uma regra que alguém desliga inteira, perdendo os casos verdadeiros.
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it', 'test', 'suite'] },
          ],
        },
      ],
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': 'off', // é um CLI; o console é a interface
    },
  },

  {
    // Os scripts são utilitários de build, rodados à mão e no CI.
    files: ['packages/cli/scripts/**/*.ts', '**/*.config.{ts,js,mjs}'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
);
