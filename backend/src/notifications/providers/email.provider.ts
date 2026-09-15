import {
  EmailSendOptions,
  IEmailProvider,
  ProviderSendResult,
  classifyError
} from './provider.interface.js';

export interface StandardEmailConfig {
  apiKey?: string;
  fromAddress: string;
  endpointUrl?: string; // Optional custom webhook or API endpoint
}

export class StandardEmailProvider implements IEmailProvider {
  public readonly name: string;
  private readonly apiKey: string;
  private readonly fromAddress: string;
  private readonly endpointUrl: string;

  constructor(config: StandardEmailConfig, name = 'StandardEmailProvider') {
    this.name = name;
    this.apiKey = config.apiKey || '';
    this.fromAddress = config.fromAddress || 'SkyBolt Rentals <notifications@skyboltrentals.com>';
    this.endpointUrl = config.endpointUrl || 'https://api.resend.com/emails';
  }

  public async send(options: EmailSendOptions): Promise<ProviderSendResult> {
    if (!this.apiKey) {
      return {
        success: false,
        isTransient: false,
        errorCode: 'MISSING_API_KEY',
        errorReason: 'Email provider API key is not configured in environment.'
      };
    }

    try {
      // Standard HTTP payload for modern transactional email providers (Resend / SendGrid compatible)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: options.recipient,
          subject: options.subject,
          html: options.html,
          text: options.text,
          headers: options.idempotencyKey ? { 'X-Idempotency-Key': options.idempotencyKey } : undefined
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorBody: any = null;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { message: await response.text() };
        }

        const classified = classifyError(
          response.status,
          errorBody?.code || errorBody?.name || `HTTP_${response.status}`,
          errorBody
        );

        return {
          success: false,
          isTransient: classified.isTransient,
          errorCode: classified.code,
          errorReason: classified.reason
        };
      }

      const responseData = (await response.json()) as { id?: string };
      return {
        success: true,
        providerMessageId: responseData?.id || `email-${Date.now()}`,
        isTransient: false
      };
    } catch (err: any) {
      const classified = classifyError(undefined, err?.code || (err?.name === 'AbortError' ? 'ETIMEDOUT' : undefined), err);
      return {
        success: false,
        isTransient: classified.isTransient,
        errorCode: classified.code,
        errorReason: classified.reason
      };
    }
  }
}
