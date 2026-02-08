export const ui = {
  radius: {
    card: 'rounded-2xl',
    control: 'rounded-lg',
    pill: 'rounded-full'
  },
  pad: {
    page: 'px-6 py-6 md:px-8 md:py-8',
    card: 'p-5',
    cardTight: 'p-4',
    chip: 'px-2 py-1',
    chipTight: 'px-1.5 py-0.5'
  },
  padding: {
    page: 'px-6 py-6 md:px-8 md:py-8',
    card: 'p-5',
    cardTight: 'p-4',
    chip: 'px-2 py-1',
    chipTight: 'px-1.5 py-0.5'
  },
  border: {
    card: 'border border-gray-200/70',
    subtle: 'border border-gray-100/80'
  },
  shadow: {
    card: 'shadow-[0_10px_30px_rgba(30,58,95,0.08)]',
    hero: 'shadow-[0_20px_60px_rgba(30,58,95,0.16)]'
  },
  align: {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center'
  },
  // Brand colors
  brand: {
    navy: '#1e3a5f',
    orange: '#D4883A'
  },
  text: {
    h1: 'text-3xl font-semibold tracking-tight text-[#1e3a5f]',
    h2: 'text-xl font-semibold text-[#1e3a5f]',
    body: 'text-[15px] text-[#1e3a5f]',
    muted: 'text-sm text-[rgba(30,58,95,0.6)]',
    micro: 'text-[11px] font-semibold uppercase tracking-[0.25em] text-[rgba(30,58,95,0.5)]'
  },
  tone: {
    primary: 'text-[#1e3a5f]',
    muted: 'text-[rgba(30,58,95,0.7)]',
    subtle: 'text-[rgba(30,58,95,0.6)]',
    faint: 'text-[rgba(30,58,95,0.5)]',
    accent: 'text-[var(--app-accent)]',
    inverse: 'text-white',
    success: 'text-emerald-600',
    successStrong: 'text-green-700',
    warning: 'text-[var(--app-accent)]',
    warningStrong: 'text-[#c27830]',
    info: 'text-cyan-600',
    infoStrong: 'text-indigo-600',
    blue: 'text-[#1e3a5f]',
    purple: 'text-purple-600',
    rose: 'text-rose-600'
  }
} as const;
