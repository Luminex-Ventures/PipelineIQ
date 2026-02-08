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
    card: 'shadow-[0_10px_30px_rgba(15,23,42,0.08)]',
    hero: 'shadow-[0_20px_60px_rgba(15,23,42,0.16)]'
  },
  align: {
    left: 'text-left',
    right: 'text-right',
    center: 'text-center'
  },
  text: {
    h1: 'text-3xl font-semibold tracking-tight text-gray-900',
    h2: 'text-xl font-semibold text-gray-900',
    body: 'text-[15px] text-gray-900',
    muted: 'text-sm text-gray-500',
    micro: 'text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400'
  },
  tone: {
    primary: 'text-gray-900',
    muted: 'text-gray-600',
    subtle: 'text-gray-500',
    faint: 'text-gray-400',
    accent: 'text-[var(--app-accent)]',
    inverse: 'text-white',
    success: 'text-emerald-600',
    successStrong: 'text-green-700',
    warning: 'text-orange-600',
    warningStrong: 'text-orange-700',
    info: 'text-cyan-600',
    infoStrong: 'text-indigo-600',
    blue: 'text-blue-600',
    purple: 'text-purple-600',
    rose: 'text-rose-600'
  }
} as const;
