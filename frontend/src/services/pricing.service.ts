import { PricingQuoteDTO, PricingQuoteRequest } from '../types/pricing.types';

import { API_BASE_URL } from './api.config';

class ReactPricingService {
  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
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
      const errorMsg = data?.error?.message || response.statusText || 'Pricing request failed';
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Request an authoritative price quote breakdown from the backend
   */
  public async getQuote(quoteRequest: PricingQuoteRequest): Promise<PricingQuoteDTO> {
    const res = await this.request<{ success: boolean; data: PricingQuoteDTO }>(
      '/pricing/quote',
      {
        method: 'POST',
        body: JSON.stringify(quoteRequest)
      }
    );

    return res.data;
  }
}

export const pricingService = new ReactPricingService();
export default pricingService;
