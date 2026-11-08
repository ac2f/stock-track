import { issuedBeforePasswordChange } from './strategies/jwt.strategy';

describe('parola değişince eski oturumlar düşer', () => {
  const changedAt = Date.UTC(2026, 10, 8, 12, 0, 30, 400); // ...:30.400

  it('değişiklikten ÖNCE verilen token reddedilir', () => {
    expect(issuedBeforePasswordChange(Math.floor(changedAt / 1000) - 5, changedAt)).toBe(true);
  });

  it('değişiklikten sonra (ya da aynı saniyede) verilen yeni oturum geçerli', () => {
    expect(issuedBeforePasswordChange(Math.floor(changedAt / 1000), changedAt)).toBe(false);
    expect(issuedBeforePasswordChange(Math.floor(changedAt / 1000) + 60, changedAt)).toBe(false);
  });

  it('parolası hiç değişmemiş hesapta (null) hiçbir token elenmez', () => {
    expect(issuedBeforePasswordChange(1, 0)).toBe(false);
    expect(issuedBeforePasswordChange(undefined, 0)).toBe(false);
  });

  it('iat olmayan token, parolası değişmiş hesapta geçersiz sayılır', () => {
    expect(issuedBeforePasswordChange(undefined, changedAt)).toBe(true);
  });
});
