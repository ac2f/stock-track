import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Stok sahipliğini taraflar arasında serbestçe aktarma.
 * `fromOwnerCustomerId`/`toOwnerCustomerId` boş ise o taraf **işletmedir**.
 * Böylece işletme↔müşteri ve müşteri↔müşteri aktarımları desteklenir.
 */
export class TransferOwnershipDto {
  // Kaynak sahip (müşteri); boşsa işletme stoğu.
  @IsOptional()
  @IsUUID()
  fromOwnerCustomerId?: string;

  // Hedef sahip (müşteri); boşsa işletme stoğu.
  @IsOptional()
  @IsUUID()
  toOwnerCustomerId?: string;

  // Hangi depodaki stok aktarılacak; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Aktarılacak miktar; verilmezse kaynaktaki tüm miktar.
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;
}
