// SPDX-License-Identifier: Apache-2.0
import amqplib from 'amqplib';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import RabbitMQRelayPlugin from '../src/services/rabbitmqRelayPlugin';

jest.mock('amqplib');
jest.mock('@tazama-lf/frms-coe-lib/lib/config/processor.config', () => ({
  validateProcessorConfig: jest.fn().mockReturnValue({
    nodeEnv: 'dev',
    DESTINATION_TRANSPORT_URL: 'amqp://localhost',
    PRODUCER_STREAM: 'test-queue',
    RABBITMQ_TLS_CA: 'base64encodedstring',
  }),
}));

describe('RabbitMQRelayPlugin', () => {
  let mockLoggerService: jest.Mocked<LoggerService>;
  let mockApm: jest.Mocked<Apm>;
  let mockConnection: jest.Mocked<any>;
  let mockChannel: jest.Mocked<any>;
  let plugin: RabbitMQRelayPlugin;

  beforeEach(() => {
    mockLoggerService = {
      log: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;

    mockApm = {
      startTransaction: jest.fn().mockReturnValue({
        end: jest.fn(),
      }),
      startSpan: jest.fn().mockReturnValue({
        end: jest.fn(),
      }),
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
        RABBITMQ_TLS_CA: 'base64encodedstring',
      };

      await plugin.init();

      expect(amqplib.connect).toHaveBeenCalledWith('amqps://prod-rabbitmq:5671', {
        ca: [Buffer.from('base64encodedstring', 'base64')],
      });
      expect(mockLoggerService.log).toHaveBeenCalledWith('RabbitMQ Relay Plugin initialized', 'RabbitMQRelayPlugin');
      expect(mockLoggerService.log).toHaveBeenCalledWith('Connected to RabbitMQ with TLS', expect.any(String));
    });

    it('should handle connection errors', async () => {
      const connectionError = new Error('Connection failed');
      (amqplib.connect as jest.Mock).mockRejectedValueOnce(connectionError);

      await plugin.init();

      expect(mockLoggerService.log).toHaveBeenCalledWith('RabbitMQ Relay Plugin initialized', 'RabbitMQRelayPlugin');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to connect to RabbitMQ', undefined, 'RabbitMQRelayPlugin');
    });
  });

  describe('relay', () => {
    it('should relay buffer data successfully', async () => {
      await plugin.init();
      (plugin as any).amqpConnection = mockConnection;
      (plugin as any).amqpChannel = mockChannel;
      (plugin as any).configuration = {
        PRODUCER_STREAM: 'test-queue',
      };

      const bufferData = Buffer.from('test message');

      await plugin.relay(bufferData);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith((plugin as any).configuration.PRODUCER_STREAM, bufferData);
      expect(mockApm.startTransaction).toHaveBeenCalledWith('RabbitMQRelayPlugin');
    });

    it('should relay string data successfully', async () => {
      await plugin.init();
      (plugin as any).amqpConnection = mockConnection;
      (plugin as any).amqpChannel = mockChannel;
      (plugin as any).configuration = {
        PRODUCER_STREAM: 'test-queue',
      };

      let stringData = 'test message' as any;

      await plugin.relay(stringData);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith((plugin as any).configuration.PRODUCER_STREAM, Buffer.from(stringData));
    });

    it('should relay object data successfully', async () => {
      await plugin.init();
      (plugin as any).amqpConnection = mockConnection;
      (plugin as any).amqpChannel = mockChannel;
      (plugin as any).configuration = {
        PRODUCER_STREAM: 'test-queue',
      };

      const objectData = { key: 'value' } as any;

      await plugin.relay(objectData);

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith(
        (plugin as any).configuration.PRODUCER_STREAM,
        Buffer.from(JSON.stringify(objectData)),
      );
      expect(mockApm.startTransaction).toHaveBeenCalled();
      expect(mockApm.startSpan).toHaveBeenCalled();
    });

    it('should throw error when connection is not initialized', async () => {
      const uninitializedPlugin = new RabbitMQRelayPlugin(mockLoggerService, mockApm);

      await expect(uninitializedPlugin.relay(Buffer.from('test'))).rejects.toThrow('RabbitMQ connection is not initialized');
    });
  });
});
