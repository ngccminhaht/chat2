/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  safelist: [
    // Dynamic classes used in components
    'text-white', 'text-black',
    'rounded-full', 'rounded-lg', 'rounded-2xl', 'rounded-bl-sm', 'rounded-br-sm',
    'flex', 'flex-1', 'flex-col', 'items-center', 'justify-center', 'self-start', 'self-end',
    'gap-1', 'gap-2', 'gap-3',
    'p-1', 'p-3', 'p-4', 'p-6', 'px-2', 'px-4', 'py-1', 'py-3',
    'mt-2', 'mb-2', 'mb-5', 'm-0',
    'w-10', 'h-10', 'w-full', 'h-full',
    'text-xs', 'text-sm', 'text-base', 'text-lg',
    'font-medium', 'font-semibold',
    'bg-white', 'bg-gray-100', 'bg-red-500', 'bg-red-600', 'bg-transparent',
    'text-gray-600', 'text-gray-900',
    'border', 'border-t', 'border-none', 'border-gray-200', 'border-gray-300',
    'shadow-lg', 'shadow-xl', 'shadow-2xl',
    'cursor-pointer', 'overflow-hidden', 'overflow-y-auto',
    'opacity-50', 'opacity-70', 'opacity-80',
    'leading-relaxed',
    'transition-all', 'duration-200',
    'hover:scale-105', 'hover:shadow-xl', 'hover:opacity-100', 'hover:opacity-90', 'hover:bg-red-600',
    'focus:border-blue-500',
    'disabled:opacity-50', 'disabled:cursor-not-allowed',
    'object-cover', 'box-border', 'outline-none',
    'absolute', 'fixed',
    // Complex arbitrary values
    'z-[2147483647]',
    'w-[380px]',
    'max-w-[80%]',
    'max-h-48',
    'bg-white/20',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
