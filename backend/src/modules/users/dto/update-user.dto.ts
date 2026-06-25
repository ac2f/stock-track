import { PartialType } from '@nestjs/swagger';
import { CreateUserDto } from './create-user.dto';

/** Tüm alanlar opsiyonel; parola gönderilmezse değişmez. */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
