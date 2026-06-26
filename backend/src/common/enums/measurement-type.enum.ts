/**
 * Bir malzemenin nasıl ölçüldüğü / faturalandığı.
 * - AREA   → metrekare (tabaka/plaka: en × boy).
 * - LENGTH → metre (rulo/şerit; ör. kutu harf profili).
 * - PIECE  → adet.
 * - WEIGHT → kilogram.
 */
export enum MeasurementType {
  AREA = 'area',
  LENGTH = 'length',
  PIECE = 'piece',
  WEIGHT = 'weight',
}

/** Stok miktarının/işlemenin birimi (gösterim ve hesap için). */
export enum UnitOfMeasure {
  SQUARE_METER = 'm2',
  METER = 'm',
  PIECE = 'adet',
  KILOGRAM = 'kg',
}

/** Ölçüm tipinden varsayılan stok birimi. */
export function defaultUnitForMeasurement(type: MeasurementType): UnitOfMeasure {
  switch (type) {
    case MeasurementType.AREA:
      return UnitOfMeasure.SQUARE_METER;
    case MeasurementType.LENGTH:
      return UnitOfMeasure.METER;
    case MeasurementType.WEIGHT:
      return UnitOfMeasure.KILOGRAM;
    default:
      return UnitOfMeasure.PIECE;
  }
}
