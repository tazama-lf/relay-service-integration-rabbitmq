// SPDX-License-Identifier: Apache-2.0
import amqplib from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import type { LoggerService } from '@tazama-lf/frms-coe-lib';
import type { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import { additionalEnvironmentVariables, type Configuration } from '../config';
import { validateProcessorConfig } from '@tazama-lf/frms-coe-lib/lib/config/processor.config';
import type { ITransportPlugin } from '../interfaces/ITransport';
import fs from 'fs';

export default class RabbitMQRelayPlugin implements ITransportPlugin {
  private amqpConnection?: ChannelModel;
  private amqpChannel?: Channel;
  private readonly loggerservice: LoggerService;
  private readonly apm: Apm;
  private readonly configuration: Configuration;

  constructor(loggerService: LoggerService, apm: Apm) {
    this.loggerservice = loggerService;
    this.apm = apm;
    this.configuration = validateProcessorConfig(additionalEnvironmentVariables) as Configuration;
  }

  async init(): Promise<void> {
    this.loggerservice.log('RabbitMQ Relay Plugin initialized', RabbitMQRelayPlugin.name);
    try {
      if (this.configuration.nodeEnv !== 'dev' && this.configuration.RABBITMQ_TLS_CA) {
        const tlsOptions = {
          ca: fs.readFileSync(this.configuration.RABBITMQ_TLS_CA, 'utf-8'),
        };
        this.amqpConnection = await amqplib.connect(this.configuration.DESTINATION_TRANSPORT_URL, tlsOptions);
        this.loggerservice.log('Connected to RabbitMQ with TLS', JSON.stringify(this.amqpConnection.connection.serverProperties, null, 4));
      } else {
        this.amqpConnection = await amqplib.connect(this.configuration.DESTINATION_TRANSPORT_URL);
        this.amqpChannel = await this.amqpConnection.createChannel();
        this.loggerservice.log('Connected to RabbitMQ', RabbitMQRelayPlugin.name);
      }
    } catch (error) {
      this.loggerservice.error(
        'Failed to connect to RabbitMQ',
        JSON.stringify(this.amqpChannel?.connection.serverProperties, null, 4),
        RabbitMQRelayPlugin.name,
      );
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
      apmTransaction = this.apm.startTransaction(RabbitMQRelayPlugin.name);
      const span = this.apm.startSpan('relay');

      this.loggerservice.log('Relaying message to RabbitMQ', RabbitMQRelayPlugin.name);

      let payload: Uint8Array | string | undefined;
      if (Buffer.isBuffer(data)) {
        payload = data;
      } else if (typeof data === 'string') {
        payload = data;
      } else {
        payload = JSON.stringify(data);
      }

      this.amqpChannel.sendToQueue(this.configuration.PRODUCER_STREAM, Buffer.from(payload));
      span?.end();
    } catch (error) {
      this.loggerservice.error('Failed to relay message to RabbitMQ', JSON.stringify(error, null, 4), RabbitMQRelayPlugin.name);
    } finally {
      if (apmTransaction) {
        apmTransaction.end();
      }
    }
  }
}
