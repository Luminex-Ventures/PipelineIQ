export const ui = {
  radius: {
    card: 'rounded-2xl',
    control: 'rounded-lg',
    pill: 'rounded-full'
  },
  padding: {
    page: 'px-6 py-6 md:px-8 md:py-8',
    card: 'p-5',
    cardTight: 'p-4'
  },
  border: {
    card: 'border border-gray-200/70',
    subtle: 'border border-gray-100/80'
  },
  shadow: {
    card: 'shadow-[0_10px_30px_rgba(15,23,42,0.08)]',
    hero: 'shadow-[0_20px_60px_rgba(15,23,42,0.16)]'
  },
  text: {
    h1: 'text-3xl font-semibold tracking-tight text-gray-900',
    h2: 'text-xl font-semibold text-gray-900',
    body: 'text-[15px] text-gray-900',
    muted: 'text-sm text-gray-500',
    micro: 'text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400'
  }
} as const;
