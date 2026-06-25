import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** JWT doğrulamasından sonra request'e iliştirilen kullanıcı kimliği. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  fullName: string;
}

/**
 * Controller metotlarında oturum sahibini doğrudan enjekte eder.
 *
 *   @Get('me')
 *   me(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return data ? user?.[data] : user;
  },
);
