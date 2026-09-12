import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichText } from './rich-text';
import { MESSAGES } from '@/i18n/messages';
import { LOCALES } from '@/i18n/locales';

describe('RichText', () => {
  it('rende código como <code>, para o leitor de tela mudar de voz', () => {
    render(
      <p>
        <RichText>{'use `prisma.db` e não `prisma.user`'}</RichText>
      </p>,
    );

    const codes = screen.getAllByText(/prisma\./);
    expect(codes.map((node) => node.tagName)).toEqual(['CODE', 'CODE']);
    expect(codes[0]).toHaveTextContent('prisma.db');
  });

  it('rende ênfase forte e fraca com os elementos certos', () => {
    render(
      <p>
        <RichText>{'e **libera** o request *habilitado*'}</RichText>
      </p>,
    );

    expect(screen.getByText('libera').tagName).toBe('STRONG');
    expect(screen.getByText('habilitado').tagName).toBe('EM');
  });

  it('não engole texto: o conteúdo visível é o texto sem as marcas', () => {
    const source = 'O `TwoFactorGateGuard` **não** cobre isto.';
    const { container } = render(
      <p>
        <RichText>{source}</RichText>
      </p>,
    );

    expect(container.textContent).toBe('O TwoFactorGateGuard não cobre isto.');
  });

  /**
   * Uma marca desbalanceada num dicionário (um acento grave sozinho) renderizaria o
   * caractere cru na tela em vez de quebrar — feio, mas nunca perda de conteúdo. Este
   * teste garante que o parser não descarta nada em nenhum idioma.
   */
  it('preserva todo o texto dos sete dicionários', () => {
    for (const locale of LOCALES) {
      for (const item of MESSAGES[locale].proof.items) {
        const { container, unmount } = render(
          <p>
            <RichText>{item.ours}</RichText>
          </p>,
        );
        expect(container.textContent).toBe(item.ours.replace(/[`*]/g, ''));
        unmount();
      }
    }
  });
});
