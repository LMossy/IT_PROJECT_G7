module.exports = {
  // Environment for testing DOM-related code
  testEnvironment: 'jsdom',
  
  // Setup file to run before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Map CSS imports to identity object proxy
  moduleNameMapper: {
    '\\.(css|less|scss)$': 'identity-obj-proxy'
  },
  
  // Test file pattern
  testMatch: [
    '**/tests/test-*.js'
  ],
  
  // Collect coverage from source files
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js'
  ],
  
  // Transform .js files with babel-jest
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // Ignore node_modules except for our specific modules
  transformIgnorePatterns: [
    'node_modules/(?!(axios)/)'
  ]
};
