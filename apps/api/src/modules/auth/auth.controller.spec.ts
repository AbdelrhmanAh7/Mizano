import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { CurrentUserData } from '../../common/decorators';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<AuthService>;

  beforeEach(() => {
    authService = {
      register: jest.fn().mockResolvedValue({ user: { id: 'u1' } }),
      login: jest.fn().mockResolvedValue({ tokens: { accessToken: 'a', refreshToken: 'r' } }),
      refreshTokens: jest
        .fn()
        .mockResolvedValue({ tokens: { accessToken: 'a2', refreshToken: 'r2' } }),
      logout: jest.fn().mockResolvedValue({ message: 'Logged out successfully' }),
    };
    controller = new AuthController(authService as AuthService);
  });

  describe('register', () => {
    it('delegates to authService.register on valid input', async () => {
      const dto: RegisterDto = {
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User',
        organizationName: 'Org',
      };
      await expect(controller.register(dto)).resolves.toEqual({ user: { id: 'u1' } });
      expect(authService.register).toHaveBeenCalledWith(dto);
    });

    it('throws BadRequestException with VALIDATION_ERROR and Validation Failed on null input', async () => {
      await expect(controller.register(null as never)).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Validation Failed',
          error: 'Bad Request',
        },
      });
    });
  });

  describe('login', () => {
    it('delegates to authService.login on valid input', async () => {
      const dto: LoginDto = { email: 'test@example.com', password: 'Password123' };
      await expect(controller.login(dto)).resolves.toEqual({
        tokens: { accessToken: 'a', refreshToken: 'r' },
      });
      expect(authService.login).toHaveBeenCalledWith(dto);
    });

    it('throws BadRequestException with VALIDATION_ERROR and Validation Failed on null input', async () => {
      await expect(controller.login(null as never)).rejects.toMatchObject({
        response: {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Validation Failed',
          error: 'Bad Request',
        },
      });
    });
  });

  describe('refreshToken', () => {
    it('delegates to authService.refreshTokens when valid user and token provided', async () => {
      const user: CurrentUserData = {
        id: 'u1',
        email: 'test@example.com',
        name: 'Test',
        organizationId: 'org-1',
        roleId: 'r-1',
      };
      await expect(controller.refreshToken(user, { refreshToken: 'r1' })).resolves.toEqual({
        tokens: { accessToken: 'a2', refreshToken: 'r2' },
      });
      expect(authService.refreshTokens).toHaveBeenCalledWith('u1', 'r1');
    });

    it('throws UnauthorizedException when user or refreshToken is missing', async () => {
      await expect(
        controller.refreshToken(null as never, { refreshToken: 'r1' }),
      ).rejects.toMatchObject({
        response: {
          statusCode: 401,
          message: 'Invalid refresh token',
          error: 'Unauthorized',
        },
      });

      const user: CurrentUserData = {
        id: 'u1',
        email: 'test@example.com',
        name: 'Test',
        organizationId: 'org-1',
        roleId: 'r-1',
      };
      await expect(controller.refreshToken(user, { refreshToken: '' })).rejects.toMatchObject({
        response: {
          statusCode: 401,
          message: 'Invalid refresh token',
          error: 'Unauthorized',
        },
      });
    });
  });

  describe('logout', () => {
    it('delegates to authService.logout when user is authenticated', async () => {
      const user: CurrentUserData = {
        id: 'u1',
        email: 'test@example.com',
        name: 'Test',
        organizationId: 'org-1',
        roleId: 'r-1',
      };
      await expect(controller.logout(user)).resolves.toEqual({
        message: 'Logged out successfully',
      });
      expect(authService.logout).toHaveBeenCalledWith('u1');
    });

    it('throws UnauthorizedException when user is missing', async () => {
      await expect(controller.logout(null as never)).rejects.toMatchObject({
        response: {
          statusCode: 401,
          message: 'Invalid or expired token',
          error: 'Unauthorized',
        },
      });
    });
  });
});
