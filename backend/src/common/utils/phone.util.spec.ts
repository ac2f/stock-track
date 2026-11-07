import { maskPhone, normalizePhone } from './phone.util';

describe('normalizePhone', () => {
  it('aynı numaranın bütün yazımları aynı değere iner', () => {
    for (const s of [
      '0532 123 45 67',
      '0(532) 123-45-67',
      '+90 532 123 45 67',
      '+90532 1234567',
      '5321234567',
      '905321234567',
      '00905321234567',
      '532.123.45.67',
      ' 0532 123 45 67 dahili 12',
    ]) {
      expect(normalizePhone(s)).toBe('905321234567');
    }
  });

  it('farklı numaralar farklı kalır', () => {
    expect(normalizePhone('0532 123 45 67')).not.toBe(normalizePhone('0532 123 45 68'));
  });

  it('yurtdışı numaraları ülke koduyla kalır', () => {
    expect(normalizePhone('+49 30 123456')).toBe('4930123456');
    expect(normalizePhone('0049 30 123456')).toBe('4930123456');
  });

  it('boş, çok kısa ve çok uzun girişler eşleştirilmez', () => {
    for (const s of [null, undefined, '', '   ', 'yok', '123', '12 34', '1234567890123456789']) {
      expect(normalizePhone(s as string)).toBeNull();
    }
  });

  it('alan kodsuz yerel numara olduğu gibi (yalnız rakam) kalır', () => {
    expect(normalizePhone('123 45 67')).toBe('1234567');
  });
});

describe('maskPhone', () => {
  it('ortayı gizler', () => {
    expect(maskPhone('905321234567')).toBe('9053••••••67');
    expect(maskPhone('1234')).toBe('1234');
  });
});
