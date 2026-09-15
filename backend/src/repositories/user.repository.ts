import { BaseRepository } from './base.repository.js';
import { IUserDoc, UserModel } from '../models/user.model.js';

export class UserRepository extends BaseRepository<IUserDoc> {
  constructor() {
    super(UserModel);
  }

  /**
   * Find user by email (normalized, without password)
   */
  public async findByEmail(email: string): Promise<IUserDoc | null> {
    return this.model
      .findOne({ email: email.toLowerCase().trim(), isDeleted: false })
      .exec();
  }

  /**
   * Find user by email and explicitly include passwordHash for authentication
   */
  public async findByEmailWithPassword(email: string): Promise<IUserDoc | null> {
    return this.model
      .findOne({ email: email.toLowerCase().trim(), isDeleted: false })
      .select('+passwordHash')
      .exec();
  }

  /**
   * Find user by ID and explicitly include passwordHash for password change verification
   */
  public async findByIdWithPassword(id: string): Promise<IUserDoc | null> {
    return this.model
      .findOne({ _id: id, isDeleted: false })
      .select('+passwordHash')
      .exec();
  }

  /**
   * Find user by unexpired reset token hash
   */
  public async findByResetToken(tokenHash: string): Promise<IUserDoc | null> {
    return this.model
      .findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: new Date() },
        isDeleted: false
      })
      .select('+passwordResetTokenHash +passwordResetExpiresAt')
      .exec();
  }

  /**
   * Record last login timestamp
   */
  public async updateLastLogin(userId: string): Promise<void> {
    await this.model.findByIdAndUpdate(userId, { lastLoginAt: new Date() }).exec();
  }

  /**
   * Save password reset token hash and expiration
   */
  public async setResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.model.findByIdAndUpdate(userId, {
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: expiresAt
    }).exec();
  }

  /**
   * Clear password reset token and update password hash
   */
  public async updatePasswordAndClearReset(userId: string, passwordHash: string): Promise<void> {
    await this.model.findByIdAndUpdate(userId, {
      passwordHash,
      passwordResetTokenHash: null,
      passwordResetExpiresAt: null
    }).exec();
  }

  /**
   * Update password hash
   */
  public async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.model.findByIdAndUpdate(userId, { passwordHash }).exec();
  }

  /**
   * Update only strictly whitelisted profile fields to prevent mass assignment
   */
  public async updateProfile(
    userId: string,
    fields: { name?: string; phone?: string; avatar?: string; licenseNumber?: string; city?: string; address?: string }
  ): Promise<IUserDoc | null> {
    const updateData: Record<string, unknown> = {};
    if (fields.name !== undefined) updateData.name = fields.name.trim();
    if (fields.phone !== undefined) updateData.phone = fields.phone.trim();
    if (fields.avatar !== undefined) updateData.avatar = fields.avatar.trim();
    if (fields.licenseNumber !== undefined) updateData.licenseNumber = fields.licenseNumber.trim();
    if (fields.city !== undefined) updateData.city = fields.city.trim();
    if (fields.address !== undefined) updateData.address = fields.address.trim();

    return this.model
      .findByIdAndUpdate(userId, { $set: updateData }, { returnDocument: 'after' })
      .exec();
  }
}

export const userRepository = new UserRepository();
