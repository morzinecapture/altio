import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@test-utils$': '<rootDir>/src/__test-utils__',
    '^@test-utils/(.*)$': '<rootDir>/src/__test-utils__/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__test-utils__/setup.ts'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};

export default config;
