import { describe, expect, it } from 'vitest';

import { parseGtmId } from './gtm';

/**
 * O id chega de uma variável do repositório e é interpolado dentro de um `<script>`.
 * Estes casos são a fronteira: o que não tiver a forma de um id não vira tag nenhuma.
 */
describe('parseGtmId', () => {
  it('aceita um id bem formado', () => {
    expect(parseGtmId('GTM-NLGPGLGG')).toBe('GTM-NLGPGLGG');
  });

  it('tolera espaço em volta — copiar e colar da interface do GTM traz', () => {
    expect(parseGtmId('  GTM-ABCD12 ')).toBe('GTM-ABCD12');
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['sem prefixo', 'NLGPGLGG'],
    ['id do GA4, que não é contêiner', 'G-ABCD1234'],
    ['minúsculo', 'gtm-nlgpglgg'],
    ['curto demais para ser id', 'GTM-A'],
    ['o snippet inteiro em vez do id', "GTM-X');alert(1);//"],
    ['com aspa, que escaparia do script', "GTM-ABCD12'"],
  ])('recusa %s', (_caso: string, value: string | undefined) => {
    expect(parseGtmId(value)).toBeNull();
  });
});
