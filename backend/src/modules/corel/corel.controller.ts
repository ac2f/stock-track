import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CorelKeyGuard } from './corel-key.guard';
import { CorelService } from './corel.service';
import { QueryCorelDto } from './dto/query-corel.dto';

const TEXT = 'text/plain; charset=utf-8';

/**
 * CorelDRAW eklentisi (ac2f pack) için salt-okunur uçlar.
 *
 * JWT yerine Ayarlar'da üretilen anahtar (`X-Api-Key`) ister. Yanıtlar
 * sekmeyle ayrılmış düz metindir; ilk satır `#ac2f-corel 1` sürüm başlığıdır.
 * Hiçbir uç kayıt yazmaz.
 */
@ApiTags('corel')
@ApiHeader({ name: 'X-Api-Key', required: true })
@Public()
@UseGuards(CorelKeyGuard)
@Controller({ path: 'corel', version: '1' })
export class CorelController {
  constructor(private readonly corel: CorelService) {}

  /** `ok <TAB> işletme adı` — eklentinin bağlantı denemesi. */
  @Get('ping')
  ping(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.ping();
  }

  /** Satır: `id <TAB> klasör adı <TAB> görünen ad`. */
  @Get('customers')
  customers(
    @Query() query: QueryCorelDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.customers(query.q, query.limit);
  }

  @Get('customers/:id')
  customer(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.customer(id);
  }

  /**
   * Satır: `id, sahip (C/B), tür, kalınlık µm, marka, varyant, renk, en, boy,
   * adet, görünen ad`. `customerId` verilirse önce o müşterinin malzemesi.
   */
  @Get('materials')
  materials(
    @Query() query: QueryCorelDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.materials(query.customerId, query.q, query.limit);
  }

  /** Satır: `id, teklif no, tarih, durum, tabaka kalemi sayısı`; yeniden eskiye. */
  @Get('quotes')
  quotes(
    @Query() query: QueryCorelDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.quotes(query.customerId, query.limit);
  }

  /**
   * Teklifin tabaka kalemleri, malzeme satırıyla aynı düzende; en/boy
   * kullanılan ölçüdür. Eklenti tabakanın bir kısmı kullanıldıysa takım yolu
   * klasörüne `u135x100` dosyası koyar.
   */
  @Get('quotes/:id/usage')
  quoteUsage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.quoteUsage(id);
  }
}
