import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Providers } from '@/app/Providers';
import { App } from '@/app/App';
import i18n from '@/lib/i18n';

describe('authentication shell', () => {
  beforeEach(() => {
    document.cookie = 'nis2_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  });

  it('renders the sign-in form with a link to registration', async () => {
    await i18n.changeLanguage('en');
    window.history.pushState({}, '', '/login');
    render(
      <Providers>
        <App />
      </Providers>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /^sign in$/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register');
  });

  it('redirects anonymous visitors away from the dashboard', async () => {
    await i18n.changeLanguage('en');
    window.history.pushState({}, '', '/dashboard');
    render(
      <Providers>
        <App />
      </Providers>,
    );

    expect(
      await screen.findByRole('heading', { level: 1, name: /^sign in$/i }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
