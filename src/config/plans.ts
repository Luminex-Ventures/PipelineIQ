/**
 * SaaS: Plan config for pricing page and signup. DB is source of truth for limits;
 * this drives UI labels and feature bullets.
 */

export interface PlanFeature {
  label: string;
  included: boolean;
}

export interface PlanConfig {
  code: string;
  name: string;
  description: string;
  cta: string;
  priceLabel: string;
  features: PlanFeature[];
  isEnterprise: boolean;
}

export const PLANS: PlanConfig[] = [
  {
    code: 'independent',
    name: 'Independent Agent',
    description: 'Solo agent plan',
    cta: 'Get Started',
    priceLabel: 'Starts at $X/mo',
    isEnterprise: false,
    features: [
      { label: 'Pipeline & CRM', included: true },
      { label: 'Analytics', included: true },
      { label: 'Marketing basics', included: true },
    ],
  },
  {
    code: 'small_team',
    name: 'Small Team',
    description: 'Up to 10 agents',
    cta: 'Start Team',
    priceLabel: 'Starts at $Y/mo',
    isEnterprise: false,
    features: [
      { label: 'Everything in Independent', included: true },
      { label: 'Team collaboration', included: true },
      { label: 'Lead routing', included: true },
    ],
  },
  {
    code: 'large_team',
    name: 'Large Team',
    description: 'Up to 50 agents',
    cta: 'Start Large Team',
    priceLabel: 'Starts at $Z/mo',
    isEnterprise: false,
    features: [
      { label: 'Everything in Small Team', included: true },
      { label: 'API access', included: true },
      { label: 'Advanced reporting', included: true },
    ],
  },
  {
    code: 'enterprise',
    name: 'Enterprise',
    description: 'Custom scale & support',
    cta: 'Contact Us',
    priceLabel: 'Custom',
    isEnterprise: true,
    features: [
      { label: 'Everything', included: true },
      { label: 'Dedicated support', included: true },
      { label: 'Custom integrations', included: true },
    ],
  },
];
