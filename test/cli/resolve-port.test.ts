import { describe, it, expect } from 'vitest';
import { resolvePort } from '../../src/cli/resolve-port.js';

describe('resolvePort', () => {
  it('returns the default when neither env nor flag is set', () => {
    expect(resolvePort([], {})).toBe(7411);
  });

  it('parses a valid MCP_DEALER_UI_PORT', () => {
    expect(resolvePort([], { MCP_DEALER_UI_PORT: '9000' })).toBe(9000);
  });

  it('parses a valid --port flag', () => {
    expect(resolvePort(['--port', '8080'], {})).toBe(8080);
  });

  it('lets --port override MCP_DEALER_UI_PORT', () => {
    expect(resolvePort(['--port', '8080'], { MCP_DEALER_UI_PORT: '9000' })).toBe(8080);
  });

  it('throws on a non-numeric MCP_DEALER_UI_PORT', () => {
    expect(() => resolvePort([], { MCP_DEALER_UI_PORT: 'bogus' }))
      .toThrow(/MCP_DEALER_UI_PORT/);
  });

  it('throws on an out-of-range MCP_DEALER_UI_PORT', () => {
    expect(() => resolvePort([], { MCP_DEALER_UI_PORT: '70000' }))
      .toThrow(/MCP_DEALER_UI_PORT/);
  });

  it('throws on a negative MCP_DEALER_UI_PORT', () => {
    expect(() => resolvePort([], { MCP_DEALER_UI_PORT: '-1' }))
      .toThrow(/MCP_DEALER_UI_PORT/);
  });

  it('throws when --port has no value', () => {
    expect(() => resolvePort(['--port'], {})).toThrow(/--port/);
  });

  it('throws on a non-numeric --port value', () => {
    expect(() => resolvePort(['--port', 'bogus'], {})).toThrow(/--port/);
  });

  it('throws on an out-of-range --port value', () => {
    expect(() => resolvePort(['--port', '99999'], {})).toThrow(/--port/);
  });

  it('throws on a non-integer port', () => {
    expect(() => resolvePort(['--port', '80.5'], {})).toThrow(/--port/);
  });

  it('accepts port 0 (let OS assign)', () => {
    expect(resolvePort(['--port', '0'], {})).toBe(0);
  });

  it('ignores an empty MCP_DEALER_UI_PORT (treats as unset)', () => {
    expect(resolvePort([], { MCP_DEALER_UI_PORT: '' })).toBe(7411);
  });
});
