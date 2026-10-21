/**
 * Bu süreç yerel sunucu (replika) mu? Dışarıya mesaj gönderen kod (Telegram,
 * WhatsApp) yerelde susar: işlem merkeze aktarılınca bildirim orada bir kez
 * gönderilir (iki kez gitmesin).
 */
export function isReplicaRole(): boolean {
  return process.env.SYNC_ROLE === 'replica';
}

export const REPLICA_SILENT_MESSAGE = 'Yerel sunucu: bildirim merkeze aktarılınca oradan gönderilir.';
