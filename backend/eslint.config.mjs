// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Üretim güvenliği odaklı kurallar (biçim kuralı değil): beklenmeyen reddedilmiş sözler (floating promise),
 * await edilmeyen değerler, Promise döndüren işleyicilerin yanlış yerde kullanımı.
 * `npm run lint` salt raporlar; düzeltme otomatik YAPILMAZ.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-e2e/**', 'eslint.config.mjs', 'ecosystem.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { arguments: false } }],
      '@typescript-eslint/await-thenable': 'error',
      // Katı tip kuralları mevcut kod tabanında çok gürültülü: yalnız hata sayılanlar açık.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
