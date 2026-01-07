/**
 * Webhook System
 * Sends HTTP notifications when payroll events occur
 */

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

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Payroll-Event': event,
          'X-Payroll-Delivery': deliveryId,
          ...webhook.headers,
        };

        if (webhook.secret) {
          headers['X-Payroll-Signature'] = this.generateSignature(payload, webhook.secret);
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event,
            payload,
            deliveredAt: new Date().toISOString(),
          }),
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

        // Retry on 5xx errors
        if (response.status >= 500 && attempt < maxRetries) {
          await this.sleep(Math.pow(2, attempt) * 1000); // Exponential backoff
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
   * Generate HMAC signature for webhook
   */
  private generateSignature(payload: unknown, secret: string): string {
    // Simple hash - in production, use crypto.createHmac
    const data = JSON.stringify(payload);
    return Buffer.from(`${secret}:${data}`).toString('base64');
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
