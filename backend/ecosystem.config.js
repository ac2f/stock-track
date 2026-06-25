/**
 * PM2 cluster konfigürasyonu.
 * Stateless mimari sayesinde N adet süreç aynı anda çalışabilir;
 * yük tüm CPU çekirdeklerine dağıtılır.
 *
 *   pm2 start ecosystem.config.js --env production
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
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
