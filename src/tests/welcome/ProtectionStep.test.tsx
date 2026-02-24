/**
 * @file src/tests/welcome/ProtectionStep.test.tsx
 *
 * Test Type: Component
 * Contexts Tested: Welcome flow UI
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectionStep } from '@/welcome/steps/ProtectionStep';

describe('ProtectionStep', () => {
  it('renders the protection messaging and script list', () => {
    const { container } = render(<ProtectionStep theme="light" />);

    expect(
      screen.getByRole('heading', {
        name: /firewall-grade blocking before trackers ever reach your browser/i,
      })
    ).toBeInTheDocument();

    ['analytics-beacon.js', 'fingerprint-pro.js', 'pixel-ads.js'].forEach((script) => {
      expect(screen.getByText(script)).toBeInTheDocument();
    });

    expect(screen.getAllByText('blocked', { selector: 'span' })).toHaveLength(3);

    const cards = container.querySelectorAll('article');
    expect(cards).toHaveLength(2);
  });

  it('applies dark theme styles to the container and cards', () => {
    const { container } = render(<ProtectionStep theme="dark" />);

    const section = container.querySelector('section');
    expect(section?.className).toContain('bg-gray-800');
    expect(section?.className).toContain('text-white');

    const cards = container.querySelectorAll('article');
    expect(cards[0]?.className).toContain('border-gray-700');
    expect(cards[1]?.className).toContain('bg-gray-800');
  });
});
