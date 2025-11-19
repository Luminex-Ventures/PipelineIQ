interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function SegmentedControl({ options, value, onChange, className = '' }: SegmentedControlProps) {
  return (
    <div
      className={`inline-flex rounded-2xl border border-gray-200/80 bg-white p-1 shadow-sm ${className}`}
    >
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-150 min-h-[40px] ${
            value === option.value
              ? 'bg-[rgb(0,122,255)] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
