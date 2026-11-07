import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { NoShop } from '../../common/shop/shop-access.decorator';
import { PrimaryOnly } from '../sync/sync.decorators';
import { BusinessesService } from './businesses.service';
import {
  CreateLabelDto,
  CreateMachineTypeDto,
  CreateMachineTypeSizeDto,
  QueryBusinessesDto,
  UpdateBusinessAdminDto,
  UpdateLabelDto,
  UpdateMachineTypeDto,
  UpdateMachineTypeSizeDto,
  UpdatePlatformSettingsDto,
} from './dto/platform.dto';
import { LabelsService } from './labels.service';
import { MachineTypesService } from './machine-types.service';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * Platform yönetimi (yalnız sistem sahibi): kiralanan işletmeler, iş kolu
 * etiketleri, makine türleri ve ebatları, kayıt ayarları. Hiçbiri dükkân
 * seçimi gerektirmez; yalnız merkez sunucuda çalışır.
 */
@ApiTags('platform')
@ApiBearerAuth()
@NoShop()
@PrimaryOnly()
@Roles(UserRole.OWNER)
@Controller({ path: 'platform', version: '1' })
export class PlatformAdminController {
  constructor(
    private readonly labels: LabelsService,
    private readonly machineTypes: MachineTypesService,
    private readonly businesses: BusinessesService,
    private readonly settings: PlatformSettingsService,
  ) {}

  // ── Ayarlar ──
  @Get('settings')
  getSettings() {
    return this.settings.get();
  }

  @Patch('settings')
  updateSettings(@Body() dto: UpdatePlatformSettingsDto) {
    return this.settings.update(dto);
  }

  // ── İşletmeler ──
  @Get('businesses/stats')
  stats() {
    return this.businesses.stats();
  }

  @Get('businesses')
  listBusinesses(@Query() q: QueryBusinessesDto) {
    return this.businesses.list(q);
  }

  @Get('businesses/:id')
  business(@Param('id', ParseUUIDPipe) id: string) {
    return this.businesses.get(id);
  }

  @Patch('businesses/:id')
  updateBusiness(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBusinessAdminDto) {
    return this.businesses.update(id, dto);
  }

  @Post('businesses/:id/approve')
  @HttpCode(200)
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.businesses.approve(id);
  }

  // ── Etiketler ──
  @Get('labels')
  listLabels() {
    return this.labels.adminList();
  }

  @Post('labels')
  createLabel(@Body() dto: CreateLabelDto) {
    return this.labels.create(dto);
  }

  @Patch('labels/:id')
  updateLabel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLabelDto) {
    return this.labels.update(id, dto);
  }

  @Delete('labels/:id')
  @HttpCode(204)
  async removeLabel(@Param('id', ParseUUIDPipe) id: string) {
    await this.labels.remove(id);
  }

  // ── Makine türleri ve ebatları ──
  @Get('machine-types')
  listMachineTypes() {
    return this.machineTypes.adminList();
  }

  @Post('machine-types')
  createMachineType(@Body() dto: CreateMachineTypeDto) {
    return this.machineTypes.create(dto);
  }

  @Patch('machine-types/:id')
  updateMachineType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMachineTypeDto) {
    return this.machineTypes.update(id, dto);
  }

  @Delete('machine-types/:id')
  @HttpCode(204)
  async removeMachineType(@Param('id', ParseUUIDPipe) id: string) {
    await this.machineTypes.remove(id);
  }

  @Post('machine-types/:id/sizes')
  addSize(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateMachineTypeSizeDto) {
    return this.machineTypes.addSize(id, dto);
  }

  @Patch('machine-type-sizes/:sizeId')
  updateSize(@Param('sizeId', ParseUUIDPipe) sizeId: string, @Body() dto: UpdateMachineTypeSizeDto) {
    return this.machineTypes.updateSize(sizeId, dto);
  }

  @Delete('machine-type-sizes/:sizeId')
  removeSize(@Param('sizeId', ParseUUIDPipe) sizeId: string) {
    return this.machineTypes.removeSize(sizeId);
  }
}
