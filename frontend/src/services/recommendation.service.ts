import {
  RecommendationRequestDTO,
  RecommendationResponseDTO,
  RecommendationChatResponseDTO,
  UserPreferencesDTO,
  RecommendationMetricsDTO
} from '../types/recommendation.types.js';

import { API_BASE_URL } from './api.config';

class FrontendRecommendationService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...((options.headers as Record<string, string>) || {})
    };

    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || response.statusText || 'Recommendation request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Request vehicle recommendations from the AI engine
   */
  public async getRecommendations(
    req: RecommendationRequestDTO
  ): Promise<RecommendationResponseDTO> {
    const res = await this.request<{ success: boolean; data: RecommendationResponseDTO }>(
      '/recommendations',
      {
        method: 'POST',
        body: JSON.stringify(req)
      }
    );
    return res.data;
  }

  /**
   * Conversational recommendation inquiry
   */
  public async chat(
    message: string,
    params: Partial<RecommendationRequestDTO> = {}
  ): Promise<RecommendationChatResponseDTO> {
    const res = await this.request<{ success: boolean; data: RecommendationChatResponseDTO }>(
      '/recommendations/chat',
      {
        method: 'POST',
        body: JSON.stringify({ message, ...params })
      }
    );
    return res.data;
  }

  /**
   * Get user preferences
   */
  public async getPreferences(): Promise<UserPreferencesDTO | null> {
    const res = await this.request<{ success: boolean; data: UserPreferencesDTO }>(
      '/recommendations/preferences',
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Save user preferences
   */
  public async savePreferences(prefs: Partial<UserPreferencesDTO>): Promise<UserPreferencesDTO> {
    const res = await this.request<{ success: boolean; data: UserPreferencesDTO }>(
      '/recommendations/preferences',
      {
        method: 'PUT',
        body: JSON.stringify(prefs)
      }
    );
    return res.data;
  }

  /**
   * Clear user preferences
   */
  public async clearPreferences(): Promise<void> {
    await this.request('/recommendations/preferences', {
      method: 'DELETE'
    });
  }

  /**
   * Record recommendation telemetry event
   */
  public async recordEvent(eventType: string, vehicleId?: string, metadata?: Record<string, unknown>): Promise<void> {
    try {
      await this.request('/recommendations/events', {
        method: 'POST',
        body: JSON.stringify({ eventType, vehicleId, metadata })
      });
    } catch {
      // Non-blocking telemetry
    }
  }

  /**
   * Submit recommendation feedback
   */
  public async recordFeedback(vehicleId: string, helpful: boolean, feedback?: string): Promise<void> {
    await this.request('/recommendations/feedback', {
      method: 'POST',
      body: JSON.stringify({ vehicleId, helpful, feedback })
    });
  }

  /**
   * Admin: Get operational metrics
   */
  public async getMetrics(): Promise<RecommendationMetricsDTO> {
    const res = await this.request<{ success: boolean; data: RecommendationMetricsDTO }>(
      '/admin/recommendations/metrics',
      { method: 'GET' }
    );
    return res.data;
  }
}

export const recommendationService = new FrontendRecommendationService();
export default recommendationService;
