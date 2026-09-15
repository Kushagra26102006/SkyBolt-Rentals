import { config } from '../../config/env.config.js';
import { IEmailProvider, ISmsProvider } from './provider.interface.js';
import { MockEmailProvider, MockSmsProvider } from './mock.provider.js';
import { StandardEmailProvider } from './email.provider.js';
import { StandardSmsProvider } from './sms.provider.js';

export * from './provider.interface.js';
export * from './mock.provider.js';
export * from './email.provider.js';
export * from './sms.provider.js';

let activeEmailProvider: IEmailProvider | null = null;
let activeSmsProvider: ISmsProvider | null = null;

/**
 * Returns the configured email provider singleton or initializes it based on config.
 */
export function getEmailProvider(): IEmailProvider {
  if (activeEmailProvider) {
    return activeEmailProvider;
  }

  const notificationConfig = (config as any).notifications;

  if (notificationConfig?.emailProvider === 'standard' || notificationConfig?.emailProvider === 'resend') {
    activeEmailProvider = new StandardEmailProvider({
      apiKey: notificationConfig.emailApiKey,
      fromAddress: notificationConfig.emailFrom
    });
  } else {
    // Default to Mock in test, development, or when not explicitly set to standard
    activeEmailProvider = new MockEmailProvider();
  }

  return activeEmailProvider;
}

/**
 * Returns the configured SMS provider singleton or initializes it based on config.
 */
export function getSmsProvider(): ISmsProvider {
  if (activeSmsProvider) {
    return activeSmsProvider;
  }

  const notificationConfig = (config as any).notifications;

  if (notificationConfig?.smsProvider === 'standard' || notificationConfig?.smsProvider === 'twilio') {
    activeSmsProvider = new StandardSmsProvider({
      apiKey: notificationConfig.smsApiKey,
      accountSid: notificationConfig.smsAccountSid,
      senderId: notificationConfig.smsSenderId
    });
  } else {
    // Default to Mock
    activeSmsProvider = new MockSmsProvider();
  }

  return activeSmsProvider;
}

/**
 * Allows injecting custom or mock providers (ideal for unit/integration tests).
 */
export function setEmailProvider(provider: IEmailProvider | null): void {
  activeEmailProvider = provider;
}

export function setSmsProvider(provider: ISmsProvider | null): void {
  activeSmsProvider = provider;
}
