/**
 * Jest Setup - Suppress NestJS console logs during tests
 */
import { Logger } from '@nestjs/common';

// Mock NestJS Logger globally to suppress all log output during tests
jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
jest.spyOn(Logger.prototype, 'verbose').mockImplementation(() => {});
