// SPDX-License-Identifier: Apache-2.0
import amqplib from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import type { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import { additionalEnvironmentVariables, type Configuration } from '../config';
import { validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';
import type { ITransportPlugin } from '@tazama-lf/frms-coe-lib/lib/interfaces/relay-service/ITransportPlugin';
import fs from 'node:fs';
import type { TlsOptions } from 'node:tls';
import * as util from 'node:util';

export default class RabbitMQRelayPlugin implements ITransportPlugin {
  private amqpConnection?: ChannelModel;
  private amqpChannel?: Channel;
  private loggerservice?: LoggerService;
  private apm?: Apm;
  private readonly configuration: Configuration;

  constructor() {
    this.configuration = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;
  }

  /**
   * Initializes the RabbitMQ connection for the relay plugin.
   *
   * This method establishes a connection to RabbitMQ using either TLS or plain connection
   * based on the environment configuration. In non-development environments with TLS
   * certificate available, it creates a secure connection. Otherwise, it creates a
   * standard connection and channel.
   * @param loggerService - Optional logger service for logging operations.
   * @param apm - Optional APM service for performance monitoring.
   * @returns A Promise that resolves when the connection is successfully established
   * @throws {Error} Throws an error if the connection to RabbitMQ fails
   *
   * @remarks
   * - In production environments with RABBITMQ_TLS_CA configured, uses TLS connection
   * - In development or when TLS is not configured, uses standard connection
   * - Creates an AMQP channel only for non-TLS connections
   * - Logs connection status and server properties for debugging
   */
  async init(loggerService?: LoggerService, apm?: Apm): Promise<void> {
    this.loggerservice = loggerService;
    this.apm = apm;
    this.loggerservice?.log('RabbitMQ Relay Plugin initialized', RabbitMQRelayPlugin.name);
    let tlsOptions: TlsOptions | undefined = {};
    try {
      if (this.configuration.nodeEnv !== 'dev') {
        if (!this.configuration.RABBITMQ_TLS_CA) {
          throw new Error('TLS certificate (RABBITMQ_TLS_CA) is required in non-development environments');
        }
        tlsOptions = {
          ca: fs.readFileSync(this.configuration.RABBITMQ_TLS_CA, 'utf-8'),
        };
      }
      this.amqpConnection = await amqplib.connect(this.configuration.DESTINATION_TRANSPORT_URL, tlsOptions);
      this.amqpChannel = await this.amqpConnection.createChannel();
      this.loggerservice?.log('Connected to RabbitMQ', RabbitMQRelayPlugin.name);
    } catch (error) {
      this.loggerservice?.error('Failed to connect to RabbitMQ', util.inspect(error), RabbitMQRelayPlugin.name);
      throw error as Error;
    }
  }

  /**
   * Relays data to a RabbitMQ queue.
   *
   * This method publishes the provided data to the configured RabbitMQ queue.
   * It handles different input formats (Uint8Array, string, or other objects),
   * creates APM transactions and spans for monitoring, and logs the operation.
   *
   * @param data - The data to relay to RabbitMQ. Can be a Uint8Array, string, or any object
   *               that can be converted to JSON.
   * @returns A Promise that resolves when the operation completes.
   * @throws May throw errors if the RabbitMQ connection fails. These are caught internally
   *         and logged, but do not cause the Promise to reject.
   */
  async relay(data: Uint8Array | string): Promise<void> {
    let apmTransaction = null;
    if (!this.amqpConnection || !this.amqpChannel) {
      throw new Error('RabbitMQ connection is not initialized');
    }
    try {
      apmTransaction = this.apm?.startTransaction(RabbitMQRelayPlugin.name);
      const span = this.apm?.startSpan('relay');

      this.loggerservice?.log('Relaying message to RabbitMQ', RabbitMQRelayPlugin.name);

      this.amqpChannel.sendToQueue(this.configuration.PRODUCER_STREAM, Buffer.from(data));
      span?.end();
    } catch (error) {
      this.loggerservice?.error('Failed to relay message to RabbitMQ', util.inspect(error), RabbitMQRelayPlugin.name);
      await Promise.reject(error as Error);
    } finally {
      if (apmTransaction) {
        apmTransaction.end();
      }
    }
  }
}
