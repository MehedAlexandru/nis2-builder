import { TokenService } from './token.service';

describe('TokenService', () => {
  const service = new TokenService();

  it('generates unique opaque tokens and stores only a hash', () => {
    const first = service.generate();
    const second = service.generate();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toHaveLength(64);
    expect(first.token).not.toBe(first.hash);
  });

  it('matches a token against its hash in constant time', () => {
    const { token, hash } = service.generate();
    expect(service.matches(token, hash)).toBe(true);
    expect(service.matches(`${token}x`, hash)).toBe(false);
    expect(service.matches(token, service.hash('other'))).toBe(false);
  });

  it('generates numeric recovery codes of the requested length', () => {
    const code = service.randomCode(6);
    expect(code).toMatch(/^\d{6}$/);
  });
});
