import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Bir uç noktayı global JWT korumasından muaf tutar (örn. /auth/login).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
