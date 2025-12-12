module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^uuid$': require.resolve('uuid'),
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid)/)',
  ],
  // Suppress NestJS console logs during tests
  setupFilesAfterEnv: ['<rootDir>/test/jest-setup.ts'],
};
