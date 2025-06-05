# RabbitMQ Relay Plugin

A TypeScript-based RabbitMQ plugin for the Tazama relay service that provides reliable message transport functionality with support for both development and production environments.

## Overview

This plugin implements the `ITransportPlugin` interface and provides a seamless way to relay messages to RabbitMQ queues. It includes built-in support for:

- Development and production environments
- TLS/SSL connections for secure production deployments
- Application Performance Monitoring (APM) integration
- Comprehensive logging
- Multiple data format support (Buffer, string, object)

## Features

- **Environment-specific configuration**: Automatic detection of development vs production environments
- **TLS Support**: Secure connections in production using base64-encoded certificates
- **APM Integration**: Built-in transaction and span tracking for performance monitoring
- **Type Safety**: Full TypeScript support with proper type definitions
- **Flexible Data Handling**: Supports Buffer, string, and object data types
- **Error Handling**: Comprehensive error handling with detailed logging
- **High Test Coverage**: 95%+ test coverage with comprehensive unit tests

## Installation

```bash
npm install @paysys-labs/rabbitmq-relay-plugin
```

## Configuration

The plugin requires the following environment variables:

### Required Variables

| Variable                    | Type   | Description                                                                                                  |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| `DESTINATION_TRANSPORT_URL` | string | RabbitMQ connection URL (e.g., `amqp://localhost:5672` for dev, `amqps://prod-rabbitmq:5671` for production) |
| `PRODUCER_STREAM`           | string | Name of the RabbitMQ queue to send messages to                                                               |

### Optional Variables

| Variable          | Type   | Description                                                                     |
| ----------------- | ------ | ------------------------------------------------------------------------------- |
| `RABBITMQ_TLS_CA` | string | Base64-encoded TLS certificate for secure connections (required for production) |

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
RABBITMQ_TLS_CA=LS0tLS1CRUdJTi... # base64-encoded certificate
```

## Usage

### Basic Usage

```typescript
import RabbitMQRelayPlugin from '@paysys-labs/rabbitmq-relay-plugin';
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

#### `relay(data: Uint8Array): Promise<void>`

Relays data to the configured RabbitMQ queue.

**Parameters:**

- `data`: Data to relay (supports Buffer, string, or object types)

**Throws:**

- `Error`: If the connection is not initialized

**Data Handling:**

- `Buffer`: Sent as-is
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
