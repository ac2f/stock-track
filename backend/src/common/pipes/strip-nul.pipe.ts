import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';

/**
 * İstekten gelen her metindeki NUL karakterini (U+0000) atar. PostgreSQL metin ve jsonb sütunlarına NUL yazmaz
 * ("unsupported Unicode escape sequence"); bir dosya adında, notta ya da etikette kalan tek NUL isteği 500 ile
 * düşürüyordu (ör. iyiCAM'in kesim raporu). NUL hiçbir metinde anlamlı değildir. Doğrulamadan ÖNCE çalışır.
 */
@Injectable()
export class StripNulPipe implements PipeTransform {
  transform(value: unknown, meta: ArgumentMetadata): unknown {
    if (meta.type === 'custom') return value;
    return stripNul(value);
  }
}

export function stripNul<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return (value.includes('\u0000') ? value.replace(/\u0000/g, '') : value) as T;
  if (depth > 32 || value === null || typeof value !== 'object') return value;
  if (Buffer.isBuffer(value) || value instanceof Date) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = stripNul(value[i], depth + 1);
    return value;
  }
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    const clean = key.includes('\u0000') ? key.replace(/\u0000/g, '') : key;
    const v = stripNul(obj[key], depth + 1);
    if (clean !== key) delete obj[key];
    obj[clean] = v;
  }
  return value;
}
