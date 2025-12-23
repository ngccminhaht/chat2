export default function VietnamFlag({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Red background */}
      <rect width="20" height="20" fill="#DA020E" rx="10" />
      {/* Yellow star */}
      <path
        d="M10 4L11.18 7.64L15 8.18L12.09 10.82L12.64 14.64L10 12.77L7.36 14.64L7.91 10.82L5 8.18L8.82 7.64L10 4Z"
        fill="#FFCD00"
      />
    </svg>
  );
}

