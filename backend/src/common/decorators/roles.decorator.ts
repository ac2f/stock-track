import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../enums/user-role.enum';

export const ROLES_KEY = 'roles';

/**
 * Bir uç noktayı belirli rollere kısıtlar. RolesGuard ile birlikte çalışır.
 *
 *   @Roles(UserRole.OWNER)
 *   @Get('reports/financial')  // sadece İşletme Sahibi
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
