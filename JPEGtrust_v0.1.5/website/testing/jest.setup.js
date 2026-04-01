// Mock FileReader API for testing file operations
Object.defineProperty(window, 'FileReader', {
  writable: true,
  value: function() {
    this.readAsDataURL = function() {
      // Simulate successful file read
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: 'data:image/png;base64,mock' } });
        }
      }, 0);
    };
    
    this.readAsArrayBuffer = function() {
      // Simulate successful buffer read
      setTimeout(() => {
        if (this.onload) {
          this.onload({ target: { result: new ArrayBuffer(8) } });
        }
      }, 0);
    };
  }
});

// Mock File constructor
global.File = class MockFile {
  constructor(bits, name, options = {}) {
    this.name = name;
    this.size = bits.reduce((acc, bit) => acc + (typeof bit === 'string' ? bit.length : bit.byteLength), 0);
    this.type = options.type || '';
    this.lastModified = options.lastModified || Date.now();
  }
};

// Mock DOM elements that might be accessed
document.body.innerHTML = `
  <div id="report"></div>
  <div id="accBody"></div>
  <button id="accBtn"></button>
  <button id="rstBtn"></button>
`;

// Mock scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// Mock global fetch if needed
global.fetch = jest.fn(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({}),
  text: () => Promise.resolve('')
}));

// Mock module resolution for URL imports
jest.mock('https://esm.sh/@contentauth/c2pa-web@0.6.1/inline', () => ({
  createC2pa: jest.fn().mockResolvedValue({
    reader: {
      fromBlob: jest.fn().mockResolvedValue({
        manifestStore: jest.fn().mockResolvedValue({}),
        free: jest.fn().mockResolvedValue(undefined)
      })
    }
  })
}), { virtual: true });

jest.mock('https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.js', () => ({
  parse: jest.fn().mockResolvedValue({})
}), { virtual: true });
