import {
  UserDTO,
  LoginCredentials,
  RegisterCredentials,
  UpdateProfileInput
} from '../types/auth.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactAuthService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(options.headers || {})
    };

    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Guarantees HTTP-only auth cookies are sent and received
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || response.statusText || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Restore active authentication session via GET /auth/me
   */
  public async getMe(): Promise<UserDTO> {
    const res = await this.request<{ success: boolean; data: { user: UserDTO } }>('/auth/me', {
      method: 'GET'
    });
    return res.data.user;
  }

  /**
   * Authenticate user with credentials via POST /auth/login
   */
  public async login(credentials: LoginCredentials): Promise<UserDTO> {
    const res = await this.request<{ success: boolean; data: { user: UserDTO } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    return res.data.user;
  }

  /**
   * Register new customer account via POST /auth/register
   */
  public async register(credentials: RegisterCredentials): Promise<UserDTO> {
    const res = await this.request<{ success: boolean; data: { user: UserDTO } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(credentials)
    });
    return res.data.user;
  }

  /**
   * Terminate active session via POST /auth/logout
   */
  public async logout(): Promise<void> {
    await this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST'
    });
  }

  /**
   * Update user profile via PATCH /users/me
   */
  public async updateProfile(fields: UpdateProfileInput): Promise<UserDTO> {
    const res = await this.request<{ success: boolean; data: { user: UserDTO } }>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(fields)
    });
    return res.data.user;
  }

  /**
   * Request password reset via POST /auth/forgot-password
   */
  public async forgotPassword(email: string): Promise<string> {
    const res = await this.request<{ success: boolean; data: { message: string } }>(
      '/auth/forgot-password',
      {
        method: 'POST',
        body: JSON.stringify({ email })
      }
    );
    return res.data.message;
  }
}

export const authService = new ReactAuthService();
