import { useState, useEffect } from 'react';

/**
 * Universal Debounce Hook
 * Delays updating the debounced value until after the specified delay has passed
 * since the last time the value was changed.
 * Prevents expensive re-renders and excessive API calls on rapid billing-counter keystrokes.
 *
 * @param value The value to debounce (e.g. search input string)
 * @param delay Milliseconds to delay (defaults to 300ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
