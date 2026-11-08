import { envValidationSchema } from './env.validation';

const base = {
  NODE_ENV: 'production',
  DB_HOST: 'postgres',
  DB_USERNAME: 'u',
  DB_PASSWORD: 'p-very-strong-db-password',
  DB_NAME: 'n',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
};
const check = (over: Record<string, unknown> = {}) => envValidationSchema.validate({ ...base, ...over }, { allowUnknown: true, abortEarly: false });

describe('ortam doğrulaması (üretim)', () => {
  it('güçlü ve farklı JWT sırlarıyla açılır', () => {
    expect(check().error).toBeUndefined();
    expect(check({ JWT_ACCESS_SECRET: 'f0'.repeat(32), JWT_REFRESH_SECRET: '1e'.repeat(32) }).error).toBeUndefined();
  });

  it('kısa sır reddedilir (32 karakter altı)', () => {
    const r = check({ JWT_ACCESS_SECRET: 'kisa-bir-sir' });
    expect(r.error?.message).toMatch(/JWT_ACCESS_SECRET en az 32/);
  });

  it('örnek/öntanımlı sırlar reddedilir', () => {
    expect(check({ JWT_ACCESS_SECRET: 'change-me-access-secret-change-me-access' }).error?.message).toMatch(/örnek\/öntanımlı/);
    expect(check({ JWT_REFRESH_SECRET: 'refresh-secret-refresh-secret-refresh-secret' }).error?.message).toMatch(/örnek\/öntanımlı/);
    expect(check({ JWT_REFRESH_SECRET: 'mypassword-mypassword-mypassword-123456' }).error?.message).toMatch(/örnek\/öntanımlı/);
  });

  it('erişim ve yenileme sırrı aynı olamaz', () => {
    const same = 'c0ffee'.repeat(8);
    expect(check({ JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }).error?.message).toMatch(/aynı olamaz/);
  });

  it('geliştirmede örnek sırlar serbest (yerel kurulum)', () => {
    const r = check({ NODE_ENV: 'development', JWT_ACCESS_SECRET: 'change-me-access-secret', JWT_REFRESH_SECRET: 'change-me-refresh-secret' });
    expect(r.error).toBeUndefined();
  });

  it('veritabanı havuzu ve zaman aşımı varsayılanları', () => {
    const { value } = check();
    expect(value.DB_POOL_MAX).toBe(20);
    expect(value.DB_STATEMENT_TIMEOUT_MS).toBe(120000);
    expect(value.DB_CONNECT_TIMEOUT_MS).toBe(10000);
  });

  it('install.sh/install.ps1 gibi 64 karakterlik rastgele onaltılık sır geçer', () => {
    const hex = (n: string) => n.repeat(64).slice(0, 64);
    expect(check({ JWT_ACCESS_SECRET: hex('3a9f'), JWT_REFRESH_SECRET: hex('c7d1') }).error).toBeUndefined();
  });
});
