import {
  ISmsProvider,
  ProviderSendResult,
  SmsSendOptions,
  classifyError
} from './provider.interface.js';

export interface StandardSmsConfig {
  apiKey?: string;
  accountSid?: string;
  senderId?: string; // e.g. 'SKYBOLT' or E.164 phone number
  endpointUrl?: string;
}

export class StandardSmsProvider implements ISmsProvider {
  public readonly name: string;
  private readonly apiKey: string;
  private readonly accountSid: string;
  private readonly senderId: string;
  private readonly endpointUrl?: string;

  constructor(config: StandardSmsConfig, name = 'StandardSmsProvider') {
    this.name = name;
    this.apiKey = config.apiKey || '';
    this.accountSid = config.accountSid || '';
    this.senderId = config.senderId || 'SKYBOLT';
    this.endpointUrl = config.endpointUrl;
  }

  public async send(options: SmsSendOptions): Promise<ProviderSendResult> {
    if (!this.apiKey && !this.accountSid) {
      return {
        success: false,
        isTransient: false,
        errorCode: 'MISSING_API_KEY',
        errorReason: 'SMS provider API key or Account SID is not configured in environment.'
      };
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Determine endpoint: Twilio standard REST URL or custom gateway
      const targetUrl = this.endpointUrl ||
        (this.accountSid
          ? `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`
          : 'https://api.sms-gateway.com/v1/messages');

      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded'
      };

      if (this.accountSid && this.apiKey) {
        const auth = Buffer.from(`${this.accountSid}:${this.apiKey}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
      } else if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }

      const bodyParams = new URLSearchParams({
        To: options.recipient,
        From: this.senderId,
        Body: options.message
      });

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: bodyParams.toString(),
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
          errorBody?.code ? `TWILIO_${errorBody.code}` : `HTTP_${response.status}`,
          errorBody
        );

        return {
          success: false,
          isTransient: classified.isTransient,
          errorCode: classified.code,
          errorReason: classified.reason
        };
      }

      const data = (await response.json()) as { sid?: string; id?: string };
      return {
        success: true,
        providerMessageId: data?.sid || data?.id || `sms-${Date.now()}`,
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
