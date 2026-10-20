import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CorelKeyGuard } from './corel-key.guard';
import { CorelService } from './corel.service';
import { QueryCorelDto, QueryCorelJobsDto } from './dto/query-corel.dto';
import { CorelJob } from './corel-naming.util';
import { CorelRunnerService } from './corel-runner.service';
import { JobFoldersDto, RunnerHeartbeatDto } from './dto/runner.dto';

const TEXT = 'text/plain; charset=utf-8';

/**
 * CorelDRAW eklentisi (ac2f pack) için salt-okunur uçlar.
 *
 * JWT yerine Ayarlar'da üretilen anahtar (`X-Api-Key`) ister. Yanıtlar
 * sekmeyle ayrılmış düz metindir; ilk satır `#ac2f-corel 1` sürüm başlığıdır.
 * Eklentinin uçları kayıt yazmaz; yalnız runner nabzını ve açtığı klasörü
 * bildirir (JSON).
 */
@ApiTags('corel')
@ApiHeader({ name: 'X-Api-Key', required: true })
@Public()
@UseGuards(CorelKeyGuard)
@Controller({ path: 'corel', version: '1' })
export class CorelController {
  constructor(
    private readonly corel: CorelService,
    private readonly runners: CorelRunnerService,
  ) {}

  /** `ok <TAB> işletme adı` — eklentinin bağlantı denemesi. */
  @Get('ping')
  ping(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.ping();
  }

  /**
   * Kesim fiyatlandırması, tek satır: saatlik ücret, asgari dk, m² ücreti,
   * asgari m², kesim mm/sn, boşta mm/sn, dalma sn, paso derinliği, para birimi.
   */
  @Get('pricing')
  pricing(@Res({ passthrough: true }) res: Response): Promise<string> {
    res.set({ 'Content-Type': TEXT });
    return this.corel.pricing();
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
   * İşe dönüştürülmüş teklifler (dönüşüm sırasıyla), dükkândaki runner için.
   * Diğer uçların aksine JSON döner; runner Python'dur, eklenti bunu okumaz.
   */
  @Get('jobs')
  jobs(@Query() query: QueryCorelJobsDto): Promise<CorelJob[]> {
    return this.corel.jobs(query.since, query.limit);
  }

  /**
   * Klasörleri arayüzden yeniden istenen teklifler (runner kapalıyken dönüşen
   * ya da klasörü silinen). Runner açıp bildirince listeden düşer.
   */
  @Get('jobs/requested')
  requestedJobs(): Promise<CorelJob[]> {
    return this.corel.requestedJobs();
  }

  /** Runner açtığı müşteri klasörünü bildirir; teklifte "klasör açıldı" görünür. */
  @Post('jobs/:id/folders')
  @HttpCode(200)
  reportFolders(@Param('id', ParseUUIDPipe) id: string, @Body() dto: JobFoldersDto) {
    return this.runners.reportFolders(id, dto);
  }

  /** Runner'ın her turdaki nabzı: bağlı mı, gün klasörü, son hata. */
  @Post('runner/heartbeat')
  @HttpCode(200)
  heartbeat(@Body() dto: RunnerHeartbeatDto) {
    return this.runners.heartbeat(dto);
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
