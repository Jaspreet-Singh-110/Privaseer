import { describe, it, expect } from 'vitest';
import type { DeceptivePatternViolation, DeceptivePatternRule } from '@/types';

describe('GDPR Compliance Scoring', () => {
  const mockRules: DeceptivePatternRule[] = [
    {
      id: 'hiddenRejectButton',
      name: 'Hidden Reject Button',
      description: 'Reject button is hidden or hard to find',
      severity: 'high',
      penalty: 40,
    },
    {
      id: 'acceptButtonProminence',
      name: 'Accept Button Prominence',
      description: 'Accept button is more prominent than reject',
      severity: 'medium',
      penalty: 25,
    },
    {
      id: 'preCheckedBoxes',
      name: 'Pre-checked Consent Boxes',
      description: 'Consent options are pre-selected',
      severity: 'medium',
      penalty: 30,
    },
    {
      id: 'forcedConsent',
      name: 'Forced Consent',
      description: 'No reject option available',
      severity: 'critical',
      penalty: 50,
    },
  ];

  function calculateComplianceScore(violations: DeceptivePatternViolation[]): number {
    const totalPenalty = violations.reduce((sum, v) => sum + v.penalty, 0);
    return Math.max(0, 100 - totalPenalty);
  }

  function getViolationDetails(patternIds: string[]): DeceptivePatternViolation[] {
    const violations: DeceptivePatternViolation[] = [];
    const patternMap = new Map(mockRules.map(p => [p.id, p]));

    for (const id of patternIds) {
      const rule = patternMap.get(id);
      if (rule) {
        violations.push({
          id: rule.id,
          name: rule.name,
          description: rule.description,
          severity: rule.severity,
          penalty: rule.penalty,
        });
      }
    }

    return violations;
  }

  describe('Penalty Calculation', () => {
    it('should return 100 for fully compliant site with no violations', () => {
      const violations = getViolationDetails([]);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(100);
    });

    it('should apply 40 point penalty for hidden reject button', () => {
      const violations = getViolationDetails(['hiddenRejectButton']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(60);
      expect(violations[0].severity).toBe('high');
      expect(violations[0].penalty).toBe(40);
    });

    it('should apply 25 point penalty for accept button prominence', () => {
      const violations = getViolationDetails(['acceptButtonProminence']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(75);
      expect(violations[0].severity).toBe('medium');
      expect(violations[0].penalty).toBe(25);
    });

    it('should apply 30 point penalty for pre-checked boxes', () => {
      const violations = getViolationDetails(['preCheckedBoxes']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(70);
      expect(violations[0].severity).toBe('medium');
      expect(violations[0].penalty).toBe(30);
    });

    it('should apply 50 point penalty for forced consent', () => {
      const violations = getViolationDetails(['forcedConsent']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(50);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].penalty).toBe(50);
    });
  });

  describe('Multiple Violations', () => {
    it('should accumulate penalties for multiple violations', () => {
      const violations = getViolationDetails(['hiddenRejectButton', 'acceptButtonProminence']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(35);
      expect(violations).toHaveLength(2);
    });

    it('should handle all medium violations', () => {
      const violations = getViolationDetails(['acceptButtonProminence', 'preCheckedBoxes']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(45);
    });

    it('should result in low score for critical + high violations', () => {
      const violations = getViolationDetails(['forcedConsent', 'hiddenRejectButton']);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(10);
    });

    it('should cap score at 0 for excessive violations', () => {
      const violations = getViolationDetails([
        'forcedConsent',
        'hiddenRejectButton',
        'acceptButtonProminence',
        'preCheckedBoxes',
      ]);
      const score = calculateComplianceScore(violations);
      expect(score).toBe(0);
    });
  });

  describe('Violation Details', () => {
    it('should provide complete violation information', () => {
      const violations = getViolationDetails(['hiddenRejectButton']);
      expect(violations[0]).toEqual({
        id: 'hiddenRejectButton',
        name: 'Hidden Reject Button',
        description: 'Reject button is hidden or hard to find',
        severity: 'high',
        penalty: 40,
      });
    });

    it('should handle unknown pattern IDs gracefully', () => {
      const violations = getViolationDetails(['unknownPattern']);
      expect(violations).toHaveLength(0);
    });

    it('should return multiple violation details in order', () => {
      const violations = getViolationDetails(['preCheckedBoxes', 'acceptButtonProminence']);
      expect(violations).toHaveLength(2);
      expect(violations[0].id).toBe('preCheckedBoxes');
      expect(violations[1].id).toBe('acceptButtonProminence');
    });
  });

  describe('Severity Levels', () => {
    it('should classify critical violations correctly', () => {
      const violations = getViolationDetails(['forcedConsent']);
      expect(violations[0].severity).toBe('critical');
      expect(violations[0].penalty).toBeGreaterThanOrEqual(50);
    });

    it('should classify high severity violations correctly', () => {
      const violations = getViolationDetails(['hiddenRejectButton']);
      expect(violations[0].severity).toBe('high');
      expect(violations[0].penalty).toBeGreaterThanOrEqual(40);
    });

    it('should classify medium severity violations correctly', () => {
      const mediumViolations = getViolationDetails(['acceptButtonProminence', 'preCheckedBoxes']);
      mediumViolations.forEach(v => {
        expect(v.severity).toBe('medium');
        expect(v.penalty).toBeGreaterThanOrEqual(25);
        expect(v.penalty).toBeLessThan(40);
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle typical non-compliant banner (hidden reject + prominence)', () => {
      const violations = getViolationDetails(['hiddenRejectButton', 'acceptButtonProminence']);
      const score = calculateComplianceScore(violations);

      expect(score).toBe(35);
      expect(violations).toHaveLength(2);
      expect(violations.some(v => v.severity === 'high')).toBe(true);
      expect(violations.some(v => v.severity === 'medium')).toBe(true);
    });

    it('should handle deceptive banner with pre-checked boxes', () => {
      const violations = getViolationDetails(['preCheckedBoxes', 'acceptButtonProminence']);
      const score = calculateComplianceScore(violations);

      expect(score).toBe(45);
      expect(violations).toHaveLength(2);
    });

    it('should severely penalize forced consent scenarios', () => {
      const violations = getViolationDetails(['forcedConsent']);
      const score = calculateComplianceScore(violations);

      expect(score).toBeLessThanOrEqual(50);
      expect(violations[0].severity).toBe('critical');
    });

    it('should identify compliant banners (score >= 80)', () => {
      const violations = getViolationDetails([]);
      const score = calculateComplianceScore(violations);

      expect(score).toBeGreaterThanOrEqual(80);
      expect(violations).toHaveLength(0);
    });

    it('should identify marginally compliant banners', () => {
      const violations = getViolationDetails(['acceptButtonProminence']);
      const score = calculateComplianceScore(violations);

      expect(score).toBe(75);
      expect(score).toBeLessThan(80);
    });
  });

  describe('Penalty Ranges', () => {
    it('should have critical penalties >= 50', () => {
      const critical = mockRules.filter(r => r.severity === 'critical');
      critical.forEach(rule => {
        expect(rule.penalty).toBeGreaterThanOrEqual(50);
      });
    });

    it('should have high severity penalties in range [40, 50)', () => {
      const high = mockRules.filter(r => r.severity === 'high');
      high.forEach(rule => {
        expect(rule.penalty).toBeGreaterThanOrEqual(40);
        expect(rule.penalty).toBeLessThan(50);
      });
    });

    it('should have medium severity penalties in range [25, 40)', () => {
      const medium = mockRules.filter(r => r.severity === 'medium');
      medium.forEach(rule => {
        expect(rule.penalty).toBeGreaterThanOrEqual(25);
        expect(rule.penalty).toBeLessThan(40);
      });
    });
  });
});
