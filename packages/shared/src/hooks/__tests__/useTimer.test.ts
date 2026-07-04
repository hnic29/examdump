/**
 * NOTE: Vitest 4's jsdom environment worker fails on Windows paths that contain
 * '~' (URL-encoded as %7E).  We therefore run in the default node environment
 * and install jsdom globals manually via the beforeAll block below so that
 * @testing-library/react's renderHook works correctly.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { renderHook, act } from '@testing-library/react';
import { useTimer } from '../useTimer';

// ---------------------------------------------------------------------------
// Minimal DOM setup (workaround: installs jsdom globals without using the
// vitest environment pragma, which fails on Windows paths containing '~')
// ---------------------------------------------------------------------------
let _dom: JSDOM;

beforeAll(() => {
  _dom = new JSDOM('<!DOCTYPE html><body></body>', {
    pretendToBeVisual: true,
    url: 'http://localhost/',
  });
  const win = _dom.window as unknown as Window & typeof globalThis;

  // Some properties (navigator, location) are read-only getters on globalThis
  // in Node.js — use defineProperty with configurable:true to override them.
  const assign = (key: string, value: unknown) => {
    try {
      (globalThis as Record<string, unknown>)[key] = value;
    } catch {
      Object.defineProperty(globalThis, key, {
        value,
        writable: true,
        configurable: true,
      });
    }
  };

  assign('window', win);
  assign('document', win.document);
  assign('navigator', win.navigator);
  assign('Element', win.Element);
  assign('HTMLElement', win.HTMLElement);
  assign('SVGElement', win.SVGElement);
  assign('Event', win.Event);
  assign('CustomEvent', win.CustomEvent);
  assign('MouseEvent', win.MouseEvent);
  assign('KeyboardEvent', win.KeyboardEvent);
  assign('InputEvent', win.InputEvent);
  assign('UIEvent', win.UIEvent);
  assign('FocusEvent', win.FocusEvent);
  assign('MutationObserver', win.MutationObserver);
  assign('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number);
  assign('cancelAnimationFrame', (id: number) => clearTimeout(id));
  assign('getComputedStyle', win.getComputedStyle.bind(win));
});

afterAll(() => {
  _dom.window.close();
});

describe('useTimer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('counts down from initial seconds', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(5, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.secondsLeft).toBe(3);
  });

  it('calls onExpire when reaching zero', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(2, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(2000); });
    expect(onExpire).toHaveBeenCalledOnce();
  });

  it('pauses and resumes correctly', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(10, onExpire));
    act(() => { result.current.start(); });
    act(() => { vi.advanceTimersByTime(3000); });
    act(() => { result.current.pause(); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.secondsLeft).toBe(7);
    act(() => { result.current.resume(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.secondsLeft).toBe(4);
  });

  it('resets to new value', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() => useTimer(10, onExpire));
    act(() => { result.current.start(); vi.advanceTimersByTime(3000); });
    act(() => { result.current.reset(20); });
    expect(result.current.secondsLeft).toBe(20);
    expect(result.current.isRunning).toBe(false);
  });
});
