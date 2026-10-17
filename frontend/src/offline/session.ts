/**
 * Oturumdaki kullanıcı (AuthContext yazar). Önbellek ve kuyruk kullanıcıya
 * göre ayrılır: aynı bilgisayarda başka biri oturum açarsa öncekinin
 * listelerini görmez, sıradaki işlemlerini onun adına göndermez.
 */
let userId: string | null = null;

export function setSessionUser(id: string | null): void {
  userId = id;
}

export function getSessionUser(): string | null {
  return userId;
}
