import { logger } from './logger';
import type { MessageType, Message, MessageHandler } from '../types';

class MessageBus {
  private handlers = new Map<MessageType, MessageHandler[]>();
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: number;
  }>();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
          logger.error('MessageBus', 'Message handler error', error);
          sendResponse({ success: false, error: error.message });
        });
      return true;
    });

    this.initialized = true;
  }

  on<T = unknown>(type: MessageType, handler: MessageHandler<T>): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler as MessageHandler<unknown>);
  }

  off(type: MessageType, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async send<T = unknown>(type: MessageType, data?: unknown, timeout = 5000): Promise<T> {
    const requestId = `${type}_${Date.now()}_${Math.random()}`;
    const message: Message = {
      type,
      data,
      requestId,
      timestamp: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        const error = new Error(`Message timeout: ${type}`);
        logger.warn('MessageBus', `Message timeout: ${type}`, { requestId });
        reject(error);
      }, timeout) as unknown as number;

      this.pendingRequests.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timeoutId,
      });

      chrome.runtime.sendMessage(message, response => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(requestId);

          if (chrome.runtime.lastError) {
            logger.error('MessageBus', 'Runtime error', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message || 'Runtime error'));
          } else if (response?.success === false) {
            reject(new Error(response.error || 'Unknown error'));
          } else {
            resolve(response);
          }
        }
      });
    });
  }

  broadcast(type: MessageType, data?: unknown): void {
    const message: Message = {
      type,
      data,
      timestamp: Date.now(),
    };

    chrome.runtime.sendMessage(message).catch(() => {
      // Popup may be closed, ignore
    });

    chrome.tabs.query({}, tabs => {
      tabs.forEach(tab => {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, message).catch(() => {
            // Content script may not be loaded, ignore
          });
        }
      });
    });
  }

  private async handleMessage(
    message: Message,
    sender: chrome.runtime.MessageSender
  ): Promise<unknown> {
    const handlers = this.handlers.get(message.type);
    if (!handlers || handlers.length === 0) {
      logger.warn('MessageBus', `No handler for message type: ${message.type}`);
      return { success: false, error: `No handler for ${message.type}` };
    }

    try {
      const results = await Promise.all(
        handlers.map(handler => handler(message.data, sender))
      );
      return results[results.length - 1] || { success: true };
    } catch (error) {
      logger.error('MessageBus', `Error handling ${message.type}`, error);
      throw error;
    }
  }

  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  clearPendingRequests(): void {
    this.pendingRequests.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('Request cleared'));
    });
    this.pendingRequests.clear();
  }
}

export const messageBus = new MessageBus();

export type { MessageType, Message, MessageHandler };
