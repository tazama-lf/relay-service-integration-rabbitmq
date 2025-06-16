# RabbitMQ Relay Plugin

A TypeScript plugin for relaying messages to RabbitMQ, with secure connections, comprehensive logging, and deep APM integration. Designed for production-grade messaging and easy drop-in integration with the Tazama relay service.

## Overview

The RabbitMQ Relay Plugin is a transport plugin that enables applications to reliably publish messages to RabbitMQ queues. It wraps the underlying AMQP client, providing a simple, type-safe interface for initialization and message relaying. With built-in Application Performance Monitoring (APM) and robust logging, the plugin makes it easy to monitor, trace, and troubleshoot all messaging operations.

## Features

- Connect to RabbitMQ with configurable connection settings (dev and production)
- Support for TLS/SSL connections with CA certificate validation
- Publish various data types (Buffer, string, object) to configurable queues
- Automatic data type conversion and serialization
- APM integration for distributed tracing and monitoring
- Detailed logging for debugging and operational visibility
- Simple API: just two main methods—`init()` and `relay()`
- Written in TypeScript with full type safety
- Fully tested with Jest

## Core Components

- **RabbitMQRelayPlugin Class**: Implements connection handling and message publishing
- **Configuration Module**: Loads environment-based settings
- **Interface Definitions**: Strongly typed plugin contract

## Installation

```bash
npm install @tazama-lf/rabbitmq-relay-plugin
```

## Configuration

| Environment Variable      | Description                                  | Default Value                    |
| ------------------------- | -------------------------------------------- | -------------------------------- |
| DESTINATION_TRANSPORT_URL | The URL of the RABBITMQ server to connect to | amqplib://localhost:5672         |
| PRODUCER_STREAM           | The subject to publish messages to           | example.subject                  |
| RABBITMQ_TLS_CA           | Path to the Certificate Authority file       | (required for TLS in production) |

### Example Environment Configuration

#### Development

```env
NODE_ENV=dev
DESTINATION_TRANSPORT_URL=amqp://localhost:5672
PRODUCER_STREAM=my-queue
```

#### Production

```env
NODE_ENV=production
DESTINATION_TRANSPORT_URL=amqps://prod-rabbitmq:5671
PRODUCER_STREAM=my-queue
RABBITMQ_TLS_CA=/path/to/ca_certificate.pem
```

## Usage

### Basic Usage

```typescript
import RabbitMQRelayPlugin from '@tazama-lf/rabbitmq-relay-plugin';
import { LoggerService } from '@tazama-lf/frms-coe-lib';
import { Apm } from '@tazama-lf/frms-coe-lib/lib/services/apm';

// Initialize the plugin
const logger = new LoggerService();
const apm = new Apm();
const plugin = new RabbitMQRelayPlugin(logger, apm);

// Initialize the connection
await plugin.init();

// Relay different types of data
await plugin.relay(Buffer.from('Hello, RabbitMQ!'));
await plugin.relay('Hello, RabbitMQ!');
await plugin.relay({ message: 'Hello, RabbitMQ!', timestamp: Date.now() });
```

### Error Handling

```typescript
try {
  await plugin.init();
  await plugin.relay(myData);
} catch (error) {
  console.error('Failed to relay message:', error);
}
```

## API Reference

### Constructor

```typescript
constructor(loggerService: LoggerService, apm: Apm)
```

Creates a new instance of the RabbitMQ relay plugin.

**Parameters:**

- `loggerService`: Logger service for application logging
- `apm`: Application Performance Monitoring service

### Methods

#### `init(): Promise<void>`

Initializes the RabbitMQ connection and channel. Must be called before using the `relay` method.

**Behavior:**

- In development: Creates a plain AMQP connection
- In production: Creates a secure AMQPS connection with TLS certificate validation

**Throws:**

- Connection errors are logged but not thrown to allow graceful degradation

#### `relay(data: Uint8Array | string | object): Promise<void>`

Relays data to the configured RabbitMQ queue.

**Parameters:**

- `data`: Data to relay (supports Buffer, string, or object types)

**Throws:**

- `Error`: If the connection is not initialized

**Data Handling:**

- `Buffer`/`Uint8Array`: Sent as-is
- `string`: Converted to Buffer
- `object`: JSON stringified and converted to Buffer

## Development

### Prerequisites

- Node.js 14+
- TypeScript 5.5+
- RabbitMQ server (for testing)

### Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Run linting
npm run lint

# Fix linting issues
npm run fix:eslint
npm run fix:prettier
```

### Project Structure

```
src/
├── config.ts                    # Configuration and environment variables
├── index.ts                     # Main export
├── interfaces/
│   └── ITransport.ts           # Transport plugin interface
└── services/
    └── rabbitmqRelayPlugin.ts  # Main plugin implementation
__tests__/
└── rabbitmqRelayPlugin.test.ts # Comprehensive test suite
```

### Testing

The plugin includes comprehensive unit tests with 95%+ coverage:

```bash
npm test
```

## Dependencies

### Runtime Dependencies

- `@tazama-lf/frms-coe-lib`: Core library providing configuration, logging, and APM services
- `amqplib`: RabbitMQ client library
- `dotenv`: Environment variable loading
- `tslib`: TypeScript runtime helpers

### Development Dependencies

- **Testing**: Jest, ts-jest, @types/jest
- **Linting**: ESLint with TypeScript and stylistic plugins
- **Build**: TypeScript compiler
- **Formatting**: Prettier
- **Git Hooks**: Husky, lint-staged

## License

SPDX-License-Identifier: Apache-2.0
