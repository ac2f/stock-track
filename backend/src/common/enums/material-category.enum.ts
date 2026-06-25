/**
 * Malzeme kategorileri. Yeni bir tür eklemek için buraya bir değer eklemek
 * yeterlidir; şema değişikliği gerekmez (şablon + jsonb attributes ile genişler).
 */
export enum MaterialCategory {
  ALUMINUM = 'aluminum', // Alüminyum
  ALUMINUM_COMPOSITE = 'aluminum_composite', // Alüminyum kompozit
  PLEXIGLASS = 'plexiglass', // Pleksi
  DEKOTA = 'dekota', // Dekota (PVC köpük)
  MDF = 'mdf', // MDF
  FOREX = 'forex', // Forex / PVC levha
  OTHER = 'other',
}
