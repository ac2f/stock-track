/**
 * PM2 cluster konfigürasyonu.
 * Stateless mimari sayesinde N adet süreç aynı anda çalışabilir;
 * yük tüm CPU çekirdeklerine dağıtılır.
 *
 *   pm2 start ecosystem.config.js --env production
 *
 * ÖNEMLİ (ilk kurulum ve sürüm yükseltmesi): şema açılışta eşitlenir (DB_SYNCHRONIZE) ve geçişler
 * çalışır; bunlar birden çok süreçte AYNI ANDA çalışmamalı. Önce tek süreçle başlatın, açılınca çoğaltın:
 *   pm2 start ecosystem.config.js --env production -i 1   &&   pm2 scale stock-track-api max
 * Zamanlanmış görevler (yedek, Telegram, hatırlatma) yalnız 0 numaralı süreçte çalışır.
 * Docker Compose kurulumu (önerilen) tek API konteyneri çalıştırır; bu konuda ek bir şey gerekmez.
 */
module.exports = {
  apps: [
    {
      name: 'stock-track-api',
      script: 'dist/main.js',
      instances: 'max', // CPU çekirdeği sayısı kadar süreç
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '512M',
      // SIGTERM sonrası süren istekler için süre (uygulama enableShutdownHooks ile temiz kapanır).
      kill_timeout: 30000,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
