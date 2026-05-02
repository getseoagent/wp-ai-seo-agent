import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MultiActiveBanner } from '../MultiActiveBanner';

describe('MultiActiveBanner', () => {
  it('renders nothing for 0 or 1 plugins', () => {
    const { container: c0 } = render(<MultiActiveBanner detected={[]} />);
    expect(c0.firstChild).toBeNull();
    const { container: c1 } = render(<MultiActiveBanner detected={['rank-math']} />);
    expect(c1.firstChild).toBeNull();
  });

  it('renders names of both plugins for the 2-plugin case', () => {
    const { container } = render(<MultiActiveBanner detected={['rank-math', 'yoast']} />);
    expect(container.textContent).toMatch(/Rank Math/);
    expect(container.textContent).toMatch(/Yoast/);
    expect(container.textContent).toMatch(/writing through/i);
  });

  it('renders 3-plugin case with plural form', () => {
    const { container } = render(<MultiActiveBanner detected={['rank-math', 'yoast', 'aioseo']} />);
    expect(container.textContent).toMatch(/Rank Math/);
    expect(container.textContent).toMatch(/Yoast/);
    expect(container.textContent).toMatch(/AIOSEO/);
  });

  it('passes through unknown slugs by displaying the slug itself', () => {
    const { container } = render(<MultiActiveBanner detected={['rank-math', 'mystery-plugin']} />);
    expect(container.textContent).toMatch(/mystery-plugin/);
  });
});
