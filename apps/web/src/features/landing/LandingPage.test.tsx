import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { Providers } from '@/app/Providers';
import { App } from '@/app/App';

describe('landing page', () => {
  it('renders the hero and the legal disclaimer in English', async () => {
    await i18n.changeLanguage('en');
    render(
      <Providers>
        <App />
      </Providers>,
    );

    expect(
      screen.getByRole('heading', { level: 1, name: /know your nis2 obligations/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/does not constitute legal advice/i).length).toBeGreaterThan(0);
  });

  it('renders the Romanian disclaimer after switching locale', async () => {
    await i18n.changeLanguage('ro');
    render(
      <Providers>
        <App />
      </Providers>,
    );

    expect(screen.getAllByText(/nu constituie consultanță juridică/i).length).toBeGreaterThan(0);
  });
});
