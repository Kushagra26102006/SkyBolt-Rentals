import {
  ReviewDTO,
  AdminReviewDTO,
  ReviewReportDTO,
  VehicleReviewSummaryDTO,
  ReviewEligibilityResult,
  CreateReviewInput,
  UpdateReviewInput,
  CreateReportInput,
  ModerateReviewInput,
  ResolveReportInput,
  ReviewSortOption
} from '../types/review.types';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:5001/api/v1';

class ReactReviewService {
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
      credentials: 'include',
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data?.error?.message || data?.message || response.statusText || 'Request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Public: Fetch paginated reviews and summary for a vehicle
   */
  public async getVehicleReviews(
    vehicleId: string,
    options: { page?: number; limit?: number; sort?: ReviewSortOption; rating?: number } = {}
  ): Promise<{
    data: ReviewDTO[];
    meta: { page: number; limit: number; total: number; totalPages: number };
    summary: VehicleReviewSummaryDTO;
  }> {
    const query = new URLSearchParams();
    if (options.page) query.set('page', String(options.page));
    if (options.limit) query.set('limit', String(options.limit));
    if (options.sort) query.set('sort', options.sort);
    if (options.rating) query.set('rating', String(options.rating));

    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.request(`/vehicles/${vehicleId}/reviews${qs}`, { method: 'GET' });
  }

  /**
   * Public: Fetch vehicle review summary metrics
   */
  public async getVehicleSummary(vehicleId: string): Promise<VehicleReviewSummaryDTO> {
    const res = await this.request<{ success: boolean; data: VehicleReviewSummaryDTO }>(
      `/vehicles/${vehicleId}/reviews/summary`,
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Customer: Check if authenticated user is eligible to review a completed booking
   */
  public async checkEligibility(bookingId: string): Promise<ReviewEligibilityResult> {
    const res = await this.request<{ success: boolean; data: ReviewEligibilityResult }>(
      `/bookings/${bookingId}/review-eligibility`,
      { method: 'GET' }
    );
    return res.data;
  }

  /**
   * Customer: Submit a verified review for a completed booking
   */
  public async submitReview(bookingId: string, input: CreateReviewInput): Promise<ReviewDTO> {
    const res = await this.request<{ success: boolean; message: string; data: ReviewDTO }>(
      `/bookings/${bookingId}/review`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Customer: Update own review within 30 days
   */
  public async updateReview(reviewId: string, input: UpdateReviewInput): Promise<ReviewDTO> {
    const res = await this.request<{ success: boolean; message: string; data: ReviewDTO }>(
      `/reviews/${reviewId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Customer: Delete own review
   */
  public async deleteReview(reviewId: string): Promise<void> {
    await this.request<{ success: boolean; message: string }>(`/reviews/${reviewId}`, {
      method: 'DELETE'
    });
  }

  /**
   * Customer: Toggle helpful vote
   */
  public async toggleHelpful(reviewId: string): Promise<{ voted: boolean; helpfulCount: number }> {
    const res = await this.request<{ success: boolean; data: { voted: boolean; helpfulCount: number } }>(
      `/reviews/${reviewId}/helpful`,
      { method: 'POST' }
    );
    return res.data;
  }

  /**
   * Customer: Report review for abuse
   */
  public async reportReview(reviewId: string, input: CreateReportInput): Promise<ReviewReportDTO> {
    const res = await this.request<{ success: boolean; message: string; data: ReviewReportDTO }>(
      `/reviews/${reviewId}/report`,
      {
        method: 'POST',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Customer: Fetch own reviews
   */
  public async getMyReviews(page = 1, limit = 10): Promise<{ data: ReviewDTO[]; meta: any }> {
    return await this.request(`/me/reviews?page=${page}&limit=${limit}`, { method: 'GET' });
  }

  /**
   * Admin: List reviews for moderation
   */
  public async adminListReviews(filters: Record<string, any> = {}): Promise<{ data: AdminReviewDTO[]; meta: any }> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v !== undefined && v !== null && v !== '') query.set(k, String(v));
    }
    const qs = query.toString() ? `?${query.toString()}` : '';
    return await this.request(`/admin/reviews${qs}`, { method: 'GET' });
  }

  /**
   * Admin: Moderate review
   */
  public async adminModerateReview(reviewId: string, input: ModerateReviewInput): Promise<AdminReviewDTO> {
    const res = await this.request<{ success: boolean; message: string; data: AdminReviewDTO }>(
      `/admin/reviews/${reviewId}/moderate`,
      {
        method: 'PATCH',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }

  /**
   * Admin: List abuse reports
   */
  public async adminListReports(page = 1, limit = 20): Promise<{ data: ReviewReportDTO[]; meta: any }> {
    return await this.request(`/admin/reviews/reports?page=${page}&limit=${limit}`, { method: 'GET' });
  }

  /**
   * Admin: Resolve abuse report
   */
  public async adminResolveReport(reportId: string, input: ResolveReportInput): Promise<ReviewReportDTO> {
    const res = await this.request<{ success: boolean; message: string; data: ReviewReportDTO }>(
      `/admin/reviews/reports/${reportId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input)
      }
    );
    return res.data;
  }
}

export const reactReviewService = new ReactReviewService();
export default reactReviewService;
