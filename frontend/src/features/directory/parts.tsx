/** Rehber ve platform ekranlarında ortak: liste yüklenemedi kutusu. */
export function PagePlaceholderError({ message = 'Liste yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.' }: { message?: string }) {
  return (
    <p role="alert" className="card mb-3 text-sm text-red-700 dark:text-red-300">
      ⚠ {message}
    </p>
  );
}
