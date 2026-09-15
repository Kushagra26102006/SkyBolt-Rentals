import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.config.js';
import { ApiError } from '../utils/api-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { toSafeUser } from '../models/user.model.js';
import { UserDTO, AuthJwtPayload } from '../types/auth.types.js';
import {
  RegisterInput,
  LoginInput,
  ChangePasswordInput,
  ResetPasswordInput
} from '../validators/auth.validator.js';
import {
  notificationService,
  NotificationType,
  NotificationChannel
} from '../notifications/index.js';

export interface AuthSessionResult {
  user: UserDTO;
  token: string;
}

export class AuthService {
  /**
   * Register new customer account
   */
  public async register(input: RegisterInput): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Check for duplicate email
    const existing = await userRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw ApiError.conflict('An account with this email address already exists.');
    }

    // 2. Hash password with bcrypt
    const passwordHash = await bcrypt.hash(input.password, config.auth.bcryptSaltRounds);

    // 3. Create user record with chosen public role (CUSTOMER or OWNER)
    const role = input.role || 'CUSTOMER';
    if (role !== 'CUSTOMER' && role !== 'OWNER') {
      throw ApiError.badRequest('Invalid role specified. Only CUSTOMER and OWNER may be registered publicly.');
    }
    const status = role === 'OWNER' ? 'PENDING_VERIFICATION' : 'ACTIVE';

    const createdUser = await userRepository.create({
      name: input.name.trim(),
      email: normalizedEmail,
      phone: input.phone ? input.phone.trim() : '',
      licenseNumber: input.licenseNumber ? input.licenseNumber.trim() : '',
      city: input.city ? input.city.trim() : '',
      address: input.address ? input.address.trim() : '',
      idVerificationNumber: input.idVerificationNumber ? input.idVerificationNumber.trim() : '',
      passwordHash,
      role,
      status,
      emailVerified: false,
      phoneVerified: false
    });

    const userDTO = toSafeUser(createdUser);
    const token = this.generateToken(userDTO);

    // Enqueue transactional welcome notification
    try {
      await notificationService.enqueue({
        type: NotificationType.ACCOUNT_WELCOME,
        userId: userDTO.id,
        recipientEmail: userDTO.email,
        recipientPhone: userDTO.phone,
        channels: userDTO.phone ? [NotificationChannel.EMAIL, NotificationChannel.SMS] : [NotificationChannel.EMAIL],
        templateData: {
          customerName: userDTO.name
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Auth] Failed to enqueue welcome notification:', notifyErr);
    }

    return { user: userDTO, token };
  }

  /**
   * Authenticate user with credentials
   */
  public async login(input: LoginInput): Promise<AuthSessionResult> {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Retrieve user with passwordHash
    const user = await userRepository.findByEmailWithPassword(normalizedEmail);
    if (!user) {
      // Generic error message prevents account enumeration
      throw ApiError.unauthorized('Invalid email or password');
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // 3. Check account status
    if (user.status === 'SUSPENDED') {
      throw new ApiError(
        403,
        'ACCOUNT_SUSPENDED',
        'Your account has been suspended. Please contact customer support.'
      );
    }

    if (user.status === 'DEACTIVATED') {
      throw new ApiError(403, 'ACCOUNT_DEACTIVATED', 'This account is deactivated.');
    }

    // 4. Update last login timestamp
    const userId = user.id || String(user._id);
    await userRepository.updateLastLogin(userId);

    const userDTO = toSafeUser(user);
    const token = this.generateToken(userDTO);

    return { user: userDTO, token };
  }

  /**
   * Change password for authenticated user
   */
  public async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await userRepository.findByIdWithPassword(userId);
    if (!user) {
      throw ApiError.unauthorized('User not found.');
    }

    const isCurrentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw ApiError.badRequest('Current password is incorrect.');
    }

    const newPasswordHash = await bcrypt.hash(input.newPassword, config.auth.bcryptSaltRounds);
    await userRepository.updatePassword(userId, newPasswordHash);

    // Enqueue security alert
    try {
      await notificationService.enqueue({
        type: NotificationType.SECURITY_ALERT,
        userId,
        recipientEmail: user.email,
        channels: [NotificationChannel.EMAIL],
        templateData: {
          customerName: user.name,
          alertDetails: 'Your SkyBolt account password was recently changed.',
          timestamp: new Date().toUTCString()
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Auth] Failed to enqueue security alert notification:', notifyErr);
    }
  }

  /**
   * Initiate password reset flow (account-enumeration safe)
   */
  public async forgotPassword(email: string): Promise<{ message: string; debugToken?: string }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);

    let debugToken: string | undefined = undefined;

    if (user && user.status === 'ACTIVE') {
      // Generate cryptographically secure random reset token
      const rawToken = crypto.randomBytes(32).toString('hex');
      // Store SHA-256 hash in database
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + config.auth.passwordResetExpiresMs);

      const userId = user.id || String(user._id);
      await userRepository.setResetToken(userId, tokenHash, expiresAt);

      // Enqueue transactional password reset notification
      try {
        await notificationService.enqueue({
          type: NotificationType.PASSWORD_RESET,
          userId,
          recipientEmail: user.email,
          channels: [NotificationChannel.EMAIL],
          templateData: {
            customerName: user.name,
            resetUrl: `${config.corsOrigins[0]}/reset-password?token=${rawToken}`,
            expiresInMinutes: Math.round(config.auth.passwordResetExpiresMs / 60000)
          },
          metadata: {
            customSuffix: tokenHash.substring(0, 8)
          }
        });
      } catch (notifyErr) {
        console.warn('[SkyBolt Auth] Failed to enqueue password reset notification:', notifyErr);
      }

      // Restrict debugToken exposure strictly to automated test-only environment (never in dev/staging/prod)
      if (config.isTest) {
        debugToken = rawToken;
      }
    }

    return {
      message: 'If an account exists with that email, password reset instructions have been dispatched.',
      ...(debugToken ? { debugToken } : {})
    };
  }

  /**
   * Complete password reset using token
   */
  public async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
    const user = await userRepository.findByResetToken(tokenHash);

    if (!user) {
      throw ApiError.badRequest('Invalid or expired password reset token.');
    }

    const userId = user.id || String(user._id);
    const newPasswordHash = await bcrypt.hash(input.newPassword, config.auth.bcryptSaltRounds);
    await userRepository.updatePasswordAndClearReset(userId, newPasswordHash);

    // Enqueue security alert
    try {
      await notificationService.enqueue({
        type: NotificationType.SECURITY_ALERT,
        userId,
        recipientEmail: user.email,
        channels: [NotificationChannel.EMAIL],
        templateData: {
          customerName: user.name,
          alertDetails: 'Your SkyBolt account password was successfully reset using a reset token.',
          timestamp: new Date().toUTCString()
        }
      });
    } catch (notifyErr) {
      console.warn('[SkyBolt Auth] Failed to enqueue security alert notification:', notifyErr);
    }
  }

  /**
   * Generate signed JWT token
   */
  public generateToken(user: UserDTO): string {
    const payload: AuthJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role
    };

    return jwt.sign(payload, config.auth.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: config.auth.jwtExpiresIn as any
    });
  }
}

export const authService = new AuthService();
