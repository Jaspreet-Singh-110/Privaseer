/**
 * @file src/tests/welcome/BurnerEmailStep.test.tsx
 *
 * Test Type: Component
 * Contexts Tested: Welcome flow UI
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BurnerEmailStep } from '@/welcome/steps/BurnerEmailStep';

describe('BurnerEmailStep', () => {
  it('renders the feature cards and helper text', () => {
    const { container } = render(<BurnerEmailStep theme="light" />);

    expect(
      screen.getByRole('heading', {
        name: /protect your inbox with aliases that forward instantly/i,
      })
    ).toBeInTheDocument();

    ['Instant Forwarding', 'Single-use Identities', 'Spam Detox'].forEach((title) => {
      expect(screen.getByText(title)).toBeInTheDocument();
    });

    const cards = container.querySelectorAll('article');
    expect(cards).toHaveLength(3);

    expect(
      screen.getByText(/burner email setup happens inside settings/i)
    ).toBeInTheDocument();
  });

  it('applies dark theme container styles', () => {
    const { container } = render(<BurnerEmailStep theme="dark" />);
    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-gray-800');
    expect(section?.className).toContain('border-gray-700');
  });
});
