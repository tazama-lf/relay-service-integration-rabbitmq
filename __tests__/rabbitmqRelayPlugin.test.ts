// SPDX-License-Identifier: Apache-2.0
import amqplib from 'amqplib';
import fs from 'node:fs';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';
import RabbitMQRelayPlugin from '../src/services/rabbitmqRelayPlugin';

jest.mock('amqplib');
jest.mock('node:fs');
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
      startTransaction: jest.fn().mockReturnValue({ end: jest.fn() } as any),
      startSpan: jest.fn().mockReturnValue({ end: jest.fn() } as any),
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

    plugin = new RabbitMQRelayPlugin();
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

      await plugin.init(mockLoggerService, mockApm);

      expect(amqplib.connect).toHaveBeenCalledWith('amqp://localhost:5672', {});
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

      await plugin.init(mockLoggerService, mockApm);

      expect(fs.readFileSync).toHaveBeenCalledWith('ca-file-path.pem', 'utf-8');
      expect(amqplib.connect).toHaveBeenCalledWith('amqps://prod-rabbitmq:5671', {
        ca: 'CA-FAKE-CONTENT',
      });
      // TLS connections now also create a channel in the init method
      expect(mockConnection.createChannel).toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith('Connected to RabbitMQ', 'RabbitMQRelayPlugin');
    });

    it('should throw error when TLS CA is not provided in non-dev environment', async () => {
      (plugin as any).configuration = {
        ...(plugin as any).configuration,
        nodeEnv: 'production',
        DESTINATION_TRANSPORT_URL: 'amqp://prod-rabbitmq:5672',
        RABBITMQ_TLS_CA: undefined,
      };

      await expect(plugin.init()).rejects.toThrow('TLS certificate (RABBITMQ_TLS_CA) is required in non-development environments');
    });

    it('should handle connection errors', async () => {
      // Ensure we're in dev mode to avoid TLS requirement
      (plugin as any).configuration = {
        ...(plugin as any).configuration,
        nodeEnv: 'dev',
        DESTINATION_TRANSPORT_URL: 'amqp://localhost:5672',
      };

      const connectionError = new Error('Connection failed');
      (amqplib.connect as jest.Mock).mockRejectedValueOnce(connectionError);

      await expect(plugin.init(mockLoggerService, mockApm)).rejects.toThrow('Connection failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith('Failed to connect to RabbitMQ', undefined, 'RabbitMQRelayPlugin');
    });
  });

  describe('relay', () => {
    beforeEach(async () => {
      // Set up dev configuration to avoid TLS requirements
      (plugin as any).configuration = {
        nodeEnv: 'dev',
        DESTINATION_TRANSPORT_URL: 'amqp://localhost:5672',
        PRODUCER_STREAM: 'test-queue',
      };

      await plugin.init(mockLoggerService, mockApm);
      (plugin as any).amqpConnection = mockConnection;
      (plugin as any).amqpChannel = mockChannel;
    });

    it('should relay buffer data successfully', async () => {
      const bufferData = Buffer.from('test message');
      await plugin.relay(bufferData);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from(bufferData));
      expect(mockApm.startTransaction).toHaveBeenCalledWith('RabbitMQRelayPlugin');
    });

    it('should relay string data successfully', async () => {
      const stringData = 'test message';
      await plugin.relay(stringData);
      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from(stringData));
    });

    it('should log error and throw when relay fails', async () => {
      const sendError = new Error('Send failed');
      mockChannel.sendToQueue.mockImplementationOnce(() => {
        throw sendError;
      });

      await expect(plugin.relay('fail-message')).rejects.toThrow('Send failed');
      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Failed to relay message to RabbitMQ',
        JSON.stringify(sendError, null, 4),
        'RabbitMQRelayPlugin',
      );
    });

    it('should throw error when connection is not initialized', async () => {
      const uninitializedPlugin = new RabbitMQRelayPlugin();
      await expect(uninitializedPlugin.relay(Buffer.from('test'))).rejects.toThrow('RabbitMQ connection is not initialized');
    });

    it('should throw error when channel is not initialized', async () => {
      const pluginWithoutChannel = new RabbitMQRelayPlugin();
      (pluginWithoutChannel as any).amqpConnection = mockConnection;
      // amqpChannel remains undefined
      await expect(pluginWithoutChannel.relay('test')).rejects.toThrow('RabbitMQ connection is not initialized');
    });

    it('should handle APM transaction correctly on successful relay', async () => {
      const mockTransaction = { end: jest.fn() } as any;
      const mockSpan = { end: jest.fn() } as any;
      mockApm.startTransaction.mockReturnValue(mockTransaction);
      mockApm.startSpan.mockReturnValue(mockSpan);

      await plugin.relay('test message');

      expect(mockApm.startTransaction).toHaveBeenCalledWith('RabbitMQRelayPlugin');
      expect(mockApm.startSpan).toHaveBeenCalledWith('relay');
      expect(mockSpan.end).toHaveBeenCalled();
      expect(mockTransaction.end).toHaveBeenCalled();
    });

    it('should handle APM transaction correctly on relay failure', async () => {
      const mockTransaction = { end: jest.fn() } as any;
      const mockSpan = { end: jest.fn() } as any;
      mockApm.startTransaction.mockReturnValue(mockTransaction);
      mockApm.startSpan.mockReturnValue(mockSpan);

      const sendError = new Error('Send failed');
      mockChannel.sendToQueue.mockImplementationOnce(() => {
        throw sendError;
      });

      await expect(plugin.relay('fail-message')).rejects.toThrow('Send failed');
      expect(mockTransaction.end).toHaveBeenCalled();
    });

    it('should handle null APM span gracefully', async () => {
      const mockTransaction = { end: jest.fn() } as any;
      mockApm.startTransaction.mockReturnValue(mockTransaction);
      mockApm.startSpan.mockReturnValue(null);

      await plugin.relay('test message');

      expect(mockTransaction.end).toHaveBeenCalled();
      // Should not throw when span is null
    });

    it('should log relaying message', async () => {
      await plugin.relay('test message');

      expect(mockLoggerService.log).toHaveBeenCalledWith('Relaying message to RabbitMQ', 'RabbitMQRelayPlugin');
    });

    it('should handle Uint8Array data correctly', async () => {
      const uint8ArrayData = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      await plugin.relay(Buffer.from(uint8ArrayData));

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from(uint8ArrayData));
    });
  });

  describe('TLS relay workflow', () => {
    let tlsPlugin: RabbitMQRelayPlugin;

    beforeEach(() => {
      tlsPlugin = new RabbitMQRelayPlugin();
      // Setup TLS environment
      (tlsPlugin as any).configuration = {
        nodeEnv: 'production',
        DESTINATION_TRANSPORT_URL: 'amqps://prod-rabbitmq:5671',
        RABBITMQ_TLS_CA: 'ca-file-path.pem',
        PRODUCER_STREAM: 'test-queue',
      };
    });

    it('should work with TLS connection and channel created during init', async () => {
      await tlsPlugin.init(mockLoggerService, mockApm);

      // Verify TLS connection was established and channel was created
      expect(fs.readFileSync).toHaveBeenCalledWith('ca-file-path.pem', 'utf-8');
      expect(amqplib.connect).toHaveBeenCalledWith('amqps://prod-rabbitmq:5671', {
        ca: 'CA-FAKE-CONTENT',
      });
      expect(mockConnection.createChannel).toHaveBeenCalled();

      // Now test relay functionality
      await tlsPlugin.relay('TLS test message');

      expect(mockChannel.sendToQueue).toHaveBeenCalledWith('test-queue', Buffer.from('TLS test message'));
      expect(mockLoggerService.log).toHaveBeenCalledWith('Relaying message to RabbitMQ', 'RabbitMQRelayPlugin');
    });
  });
});
