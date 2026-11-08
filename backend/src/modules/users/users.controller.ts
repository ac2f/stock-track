import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { toAdminView, UsersService } from './users.service';
import { NoShop } from '../../common/shop/shop-access.decorator';

/** Personel yönetimi — yalnızca İşletme Sahibi (OWNER). */
@ApiTags('users')
@ApiBearerAuth()
@Roles(UserRole.OWNER)
@NoShop()
@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return toAdminView(await this.usersService.create(dto));
  }

  @Get()
  async findAll() {
    return (await this.usersService.findAll()).map(toAdminView);
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return toAdminView(await this.usersService.findOne(id));
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return toAdminView(await this.usersService.update(id, dto));
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.remove(id);
  }
}
