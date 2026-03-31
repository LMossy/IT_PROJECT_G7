module.exports = {
  rootDir: '..',
  roots: ['<rootDir>/tests'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: { '^.+\\.js$': 'babel-jest' },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.cjs'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: ['js/**/*.js', 'backend/**/*.js'],
  coveragePathIgnorePatterns: ['/node_modules/'],
};
