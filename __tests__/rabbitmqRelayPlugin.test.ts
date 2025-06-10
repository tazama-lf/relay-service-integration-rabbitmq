// SPDX-License-Identifier: Apache-2.0
import amqplib from 'amqplib';
import fs from 'fs';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import RabbitMQRelayPlugin from '../src/services/rabbitmqRelayPlugin';

jest.mock('amqplib');
jest.mock('fs');
jest.mock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
  validateProcessorConfig: jest.fn().mockReturnValue({
    nodeEnv: 'dev',
    DESTINATION_TRANSPORT_URL: 'amqp://localhost',
    PRODUCER_STREAM: 'test-queue',
    RABBITMQ_TLS_CA: 'ca-file-path.pem', // simulate a file path
  }),
}));

describe('RabbitMQRelayPlugin', () => {
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockApm: jest.Mocked<Apm>;
  let mockConnection: any;
  let mockChannel: any;
  let plugin: RabbitMQRelayPlugin;

  beforeEach(() => {
    // Mock fs.readFileSync to return a CA string for every call
    (fs.readFileSync as jest.Mock).mockReturnValue('CA-FAKE-CONTENT');

    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockApm = {
      startTransaction: jest.fn().mockReturnValue({ end: jest.fn() }),
      startSpan: jest.fn().mockReturnValue({ end: jest.fn() }),
    } as unknown as jest.Mocked<Apm>;

    mockChannel = {
      sendToQueue: jest.fn(),
      connection: {
        serverProperties: {},
      },
    };

    mockConnection = {
      createChannel: jest.fn().mockResolvedValue(mockChannel),
      connection: {
        serverProperties: {},
      },
    };

    (amqplib.connect as jest.Mock).mockResolvedValue(mockConnection);

    plugin = new RabbitMQRelayPlugin(mockLoggerService, mockApm);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize connection in dev environment', async () => {
      // Override config for this test
      (plugin as any).configuration = {
        ...(plugin as any).configuration,
        nodeEnv: 'dev',
        DESTINATION_TRANSPORT_URL: 'amqp://localhost:5672',
      };

      await plugin.init();

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost:5672');
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('RabbitMQ Relay Plugin initialized', 'RabbitMQRelayPlugin');
      expect(mockLoggerService.log).toHaveBeenCalledWith('Connected to RabbitMQ', 'RabbitMQRelayPlugin');
    });

    it('should initialize connection with TLS in production environment', async () => {
      (plugin as any).configuration = {
        ...(plugin as any).configuration,
        nodeEnv: 'production',
        DESTINATION_TRANSPORT_URL: 'amqps://prod-rabbitmq:5671',
        RABBITMQ_TLS_CA: 'ca-file-path.pem',
      };

      await plugin.init();

      expect(fs.readFileSync).toHaveBeenCalledWith('ca-file-path.pem', 'utf-8');
      expect(amqplib.connect).toHaveBeenCalledWith('amqps://prod-rabbitmq:5671', {
        ca: 'CA-FAKE-CONTENT',
      });
      expect(mockLoggerService.log).toHaveBeenCalledWith('Connected to RabbitMQ with TLS', expect.any(String));
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      (amqplib.connect as jest.Mock).mockRejectedValueOnce(connectionError);

      await plugin.init();

      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to connect to RabbitMQ', undefined, 'RabbitMQRelayPlugin');
    });
  });

  describe('relay', () => {
    beforeEach(async () => {
      await plugin.init();
      (plugin as any).amqpConnection = mockConnection;
      (plugin as any).amqpChannel = mockChannel;
      (plugin as any).configuration = {
        PRODUCER_STREAM: 'test-queue',
      };
    });

    it('should relay buffer data successfully', async () => {
      const bufferData = Buffer.from('test message');
      await plugin.relay(bufferData);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', bufferData);
      expect(mockApm.startTransaction).toHaveBeenCalledWith('RabbitMQRelayPlugin');
    });

    it('should relay string data successfully', async () => {
      const stringData = 'test message';
      await plugin.relay(stringData);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from(stringData));
    });

    it('should relay object data successfully', async () => {
      const objectData = { key: 'value' };
      await plugin.relay(objectData as any);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from(JSON.stringify(objectData)));
    });

    it('should log error if relay fails', async () => {
      mockChannel.sendToQueue.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });
      await plugin.relay('fail-message');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to relay message to RabbitMQ', '{}', 'RabbitMQRelayPlugin');
    });

    it('should throw error when connection is not initialized', async () => {
      const uninitializedPlugin = new RabbitMQRelayPlugin(mockLoggerService, mockApm);
      await expect(uninitializedPlugin.relay(Buffer.from('test'))).rejects.toThrow('RabbitMQ connection is not initialized');
    });
  });
});
