import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

/**
 * Konsinye (müşteriye ait) stoğun sahipliğini işletmeye aktarma.
 * Belirtilen müşterinin, ilgili depodaki konsinye miktarı işletme stoğuna geçer.
 */
export class TransferOwnershipDto {
  // Sahipliği aktarılacak konsinye stoğun mevcut sahibi (müşteri).
  @IsUUID()
  ownerCustomerId: string;

  // Hangi depodaki konsinye stok aktarılacak; verilmezse varsayılan (Merkez) depo.
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  // Aktarılacak miktar; verilmezse o depodaki tüm konsinye miktar aktarılır.
  @IsOptional()
  @IsNumber()
  @Min(0)
  quantity?: number;
}
