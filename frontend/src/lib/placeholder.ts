/**
 * react-query `placeholderData`: yeni sonuç gelene kadar önceki sonucu yalnız
 * sorgu anahtarının SON öğesi (arama terimi) değiştiyse gösterir. Süzgecin
 * kendisi (sahip, tür, alıcı …) değiştiyse göstermez — eski süzgecin
 * kayıtları seçilip üzerinde işlem yapılmasın.
 */
export function keepWhileSearching(key: readonly unknown[]) {
  const base = JSON.stringify(key.slice(0, -1));
  return <T>(prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    prevQuery && JSON.stringify(prevQuery.queryKey.slice(0, -1)) === base ? prev : undefined;
}
