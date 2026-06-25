/**
 * Sistem rolleri (RBAC).
 * - OWNER    → İşletme Sahibi: tüm yetkiler + mali raporlar.
 * - EMPLOYEE → Çalışan: stok girişi, işleme kaydı, nakit tahsilat.
 */
export enum UserRole {
  OWNER = 'owner',
  EMPLOYEE = 'employee',
}
