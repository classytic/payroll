/**
 * Webhook System
 * Sends HTTP notifications when payroll events occur
 */

import crypto from 'crypto';
import type { PayrollEventType, PayrollEventMap } from './events.js';

export interface WebhookConfig {
  url: string;
  events: PayrollEventType[];
  secret?: string;
  headers?: Record<string, string>;
  retries?: number;
  timeout?: number;
}

export interface WebhookDelivery {
  id: string;
  event: PayrollEventType;
  url: string;
  payload: unknown;
  attempt: number;
  status: 'pending' | 'sent' | 'failed';
  response?: {
    status: number;
    body: string;
  };
  error?: string;
  sentAt?: Date;
}

export class WebhookManager {
  private webhooks: WebhookConfig[] = [];
  private deliveryLog: WebhookDelivery[] = [];

  /**
   * Register a webhook
   */
  register(config: WebhookConfig): void {
    this.webhooks.push({
      retries: 3,
      timeout: 30000,
      ...config,
    });
  }

  /**
   * Remove a webhook
   */
  unregister(url: string): void {
    this.webhooks = this.webhooks.filter((w) => w.url !== url);
  }

  /**
   * Send webhook for event
   */
  async send<K extends PayrollEventType>(
    event: K,
    payload: PayrollEventMap[K]
  ): Promise<void> {
    const matchingWebhooks = this.webhooks.filter((w) => w.events.includes(event));

    const deliveries = matchingWebhooks.map((webhook) =>
      this.deliver(webhook, event, payload)
    );

    await Promise.allSettled(deliveries);
  }

  /**
   * Deliver webhook with retries
   */
  private async deliver<K extends PayrollEventType>(
    webhook: WebhookConfig,
    event: K,
    payload: PayrollEventMap[K]
  ): Promise<WebhookDelivery> {
    const deliveryId = `${Date.now()}-${Math.random().toString(36)}`;

    const delivery: WebhookDelivery = {
      id: deliveryId,
      event,
      url: webhook.url,
      payload,
      attempt: 0,
      status: 'pending',
    };

    this.deliveryLog.push(delivery);

    const maxRetries = webhook.retries || 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      delivery.attempt = attempt;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), webhook.timeout || 30000);

        const timestamp = Math.floor(Date.now() / 1000);
        const deliveredAt = new Date().toISOString();

        const requestBody = {
          event,
          payload,
          deliveredAt,
        };

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Payroll-Event': event,
          'X-Payroll-Delivery': deliveryId,
          'X-Payroll-Timestamp': timestamp.toString(),
          ...webhook.headers,
        };

        if (webhook.secret) {
          headers['X-Payroll-Signature'] = this.generateSignature(requestBody, webhook.secret, timestamp);
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        delivery.response = {
          status: response.status,
          body: await response.text(),
        };
        delivery.sentAt = new Date();

        if (response.ok) {
          delivery.status = 'sent';
          return delivery;
        }

        // Retry on transient errors: 5xx, 429 (rate limit), 408 (timeout)
        const shouldRetry = (
          response.status >= 500 ||
          response.status === 429 ||
          response.status === 408
        );

        if (shouldRetry && attempt < maxRetries) {
          // Exponential backoff with jitter
          const backoff = Math.pow(2, attempt) * 1000;
          const jitter = Math.random() * 1000;
          await this.sleep(backoff + jitter);
          continue;
        }

        delivery.status = 'failed';
        delivery.error = `HTTP ${response.status}`;
        return delivery;
      } catch (error) {
        delivery.error = (error as Error).message;

        if (attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000);
          continue;
        }

        delivery.status = 'failed';
        return delivery;
      }
    }

    return delivery;
  }

  /**
   * Generate HMAC-SHA256 signature for webhook (Stripe-style)
   *
   * Format: t=<timestamp>,v1=<hmac_signature>
   *
   * The signed payload is: timestamp.JSON(requestBody)
   * where requestBody = { event, payload, deliveredAt }
   *
   * Consumers should verify:
   * 1. Timestamp is within tolerance (e.g., 5 minutes)
   * 2. HMAC signature matches
   *
   * @example Verify signature (consumer side)
   * ```typescript
   * import crypto from 'crypto';
   *
   * const signature = req.headers['x-payroll-signature'];
   * const timestamp = req.headers['x-payroll-timestamp'];
   * const requestBody = req.body; // { event, payload, deliveredAt }
   *
   * // Check timestamp (replay protection)
   * const now = Math.floor(Date.now() / 1000);
   * if (Math.abs(now - parseInt(timestamp)) > 300) {
   *   throw new Error('Signature expired');
   * }
   *
   * // Verify signature
   * const signedPayload = `${timestamp}.${JSON.stringify(requestBody)}`;
   * const expectedSignature = crypto
   *   .createHmac('sha256', secret)
   *   .update(signedPayload)
   *   .digest('hex');
   *
   * const parts = signature.split(',');
   * const providedSignature = parts.find(p => p.startsWith('v1='))?.split('=')[1];
   *
   * if (providedSignature !== expectedSignature) {
   *   throw new Error('Invalid signature');
   * }
   * ```
   */
  private generateSignature(requestBody: unknown, secret: string, timestamp: number): string {
    const data = JSON.stringify(requestBody);

    // Signed payload: timestamp.data
    const signedPayload = `${timestamp}.${data}`;

    // Generate HMAC-SHA256 signature
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signedPayload);
    const signature = hmac.digest('hex');

    // Stripe-style format: t=timestamp,v1=signature
    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get delivery log
   */
  getDeliveries(options?: { event?: PayrollEventType; status?: WebhookDelivery['status']; limit?: number }): WebhookDelivery[] {
    let results = this.deliveryLog;

    if (options?.event) {
      results = results.filter((d) => d.event === options.event);
    }

    if (options?.status) {
      results = results.filter((d) => d.status === options.status);
    }

    if (options?.limit) {
      results = results.slice(-options.limit);
    }

    return results;
  }

  /**
   * Clear delivery log
   */
  clearLog(): void {
    this.deliveryLog = [];
  }

  /**
   * Get all registered webhooks
   */
  getWebhooks(): WebhookConfig[] {
    return [...this.webhooks];
  }
}
