import { ApiError } from '../utils/api-error.js';
import { userRepository } from '../repositories/user.repository.js';
import { toSafeUser } from '../models/user.model.js';
import { UserDTO } from '../types/auth.types.js';
import { UpdateProfileInput } from '../validators/auth.validator.js';

export class UserService {
  /**
   * Get user profile by ID
   */
  public async getProfile(userId: string): Promise<UserDTO> {
    const user = await userRepository.findById(userId);
    if (!user || user.isDeleted) {
      throw ApiError.notFound('User profile not found.');
    }
    return toSafeUser(user);
  }

  /**
   * Update user profile with mass assignment protection
   */
  public async updateProfile(userId: string, input: UpdateProfileInput): Promise<UserDTO> {
    const updated = await userRepository.updateProfile(userId, input);
    if (!updated || updated.isDeleted) {
      throw ApiError.notFound('User profile not found.');
    }
    return toSafeUser(updated);
  }
}

export const userService = new UserService();
