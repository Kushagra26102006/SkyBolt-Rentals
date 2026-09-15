import crypto from 'crypto';
import {
  EmailSendOptions,
  IEmailProvider,
  ISmsProvider,
  ProviderSendResult,
  SmsSendOptions
} from './provider.interface.js';

interface FailureSimulation {
  isTransient: boolean;
  code: string;
  reason: string;
}

export class MockEmailProvider implements IEmailProvider {
  public readonly name = 'MockEmailProvider';
  public sentEmails: Array<EmailSendOptions & { sentAt: Date; providerMessageId: string }> = [];
  private failureQueue: FailureSimulation[] = [];

  /**
   * Queue a simulated failure for testing
   */
  public simulateFailure(isTransient: boolean, code: string = 'SIMULATED_ERROR', reason: string = 'Simulated delivery failure'): void {
    this.failureQueue.push({ isTransient, code, reason });
  }

  public simulateTransientFailure(count = 1, code = 'SIMULATED_TIMEOUT', reason = 'Simulated transient network timeout'): void {
    for (let i = 0; i < count; i++) {
      this.failureQueue.push({ isTransient: true, code, reason });
    }
  }

  public simulatePermanentFailure(count = 1, code = 'INVALID_RECIPIENT', reason = 'Simulated invalid recipient address'): void {
    for (let i = 0; i < count; i++) {
      this.failureQueue.push({ isTransient: false, code, reason });
    }
  }

  public clear(): void {
    this.sentEmails = [];
    this.failureQueue = [];
  }

  public async send(options: EmailSendOptions): Promise<ProviderSendResult> {
    // Check if there is a simulated failure in queue
    if (this.failureQueue.length > 0) {
      const failure = this.failureQueue.shift()!;
      return {
        success: false,
        isTransient: failure.isTransient,
        errorCode: failure.code,
        errorReason: failure.reason
      };
    }

    const providerMessageId = `mock-email-${crypto.randomUUID()}`;
    this.sentEmails.push({
      ...options,
      sentAt: new Date(),
      providerMessageId
    });

    return {
      success: true,
      providerMessageId,
      isTransient: false
    };
  }
}

export class MockSmsProvider implements ISmsProvider {
  public readonly name = 'MockSmsProvider';
  public sentSms: Array<SmsSendOptions & { sentAt: Date; providerMessageId: string }> = [];
  private failureQueue: FailureSimulation[] = [];

  public simulateFailure(isTransient: boolean, code: string = 'SIMULATED_SMS_ERROR', reason: string = 'Simulated SMS failure'): void {
    this.failureQueue.push({ isTransient, code, reason });
  }

  public simulateTransientFailure(count = 1, code = 'SIMULATED_SMS_RATE_LIMIT', reason = 'Simulated carrier rate limit'): void {
    for (let i = 0; i < count; i++) {
      this.failureQueue.push({ isTransient: true, code, reason });
    }
  }

  public simulatePermanentFailure(count = 1, code = 'INVALID_PHONE', reason = 'Simulated invalid phone number'): void {
    for (let i = 0; i < count; i++) {
      this.failureQueue.push({ isTransient: false, code, reason });
    }
  }

  public clear(): void {
    this.sentSms = [];
    this.failureQueue = [];
  }

  public async send(options: SmsSendOptions): Promise<ProviderSendResult> {
    if (this.failureQueue.length > 0) {
      const failure = this.failureQueue.shift()!;
      return {
        success: false,
        isTransient: failure.isTransient,
        errorCode: failure.code,
        errorReason: failure.reason
      };
    }

    const providerMessageId = `mock-sms-${crypto.randomUUID()}`;
    this.sentSms.push({
      ...options,
      sentAt: new Date(),
      providerMessageId
    });

    return {
      success: true,
      providerMessageId,
      isTransient: false
    };
  }
}
