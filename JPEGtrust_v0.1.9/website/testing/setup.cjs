// Jest global setup for deterministic browser-like tests (Node env).
// Keep this minimal: individual tests can override as needed.

// Prevent noisy expected warnings from failing CI readability.
const _warn = console.warn;
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  console.warn.mockRestore?.();
  console.error.mockRestore?.();
});

// Basic Web APIs used by modules (stubbable per test)
global.Blob = global.Blob || class Blob {};
global.URL = global.URL || {
  createObjectURL: () => 'blob:test',
  revokeObjectURL: () => {},
};

// Some tests use timers via setTimeout in mocked Image onload
afterEach(() => {
  // Ensure no timers leak between tests.
  jest.clearAllTimers?.();
});
