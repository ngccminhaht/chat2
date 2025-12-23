export default function USFlag({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Red and white stripes - 13 stripes total */}
      <rect width="20" height="1.54" fill="#B22234" />
      <rect y="1.54" width="20" height="1.54" fill="#FFFFFF" />
      <rect y="3.08" width="20" height="1.54" fill="#B22234" />
      <rect y="4.62" width="20" height="1.54" fill="#FFFFFF" />
      <rect y="6.16" width="20" height="1.54" fill="#B22234" />
      <rect y="7.7" width="20" height="1.54" fill="#FFFFFF" />
      <rect y="9.24" width="20" height="1.54" fill="#B22234" />
      
      {/* Blue canton - covers first 7 stripes */}
      <rect width="8" height="10.78" fill="#3C3B6E" />
      
      {/* Stars - simplified pattern with 5 stars visible at small size */}
      <g fill="#FFFFFF">
        {/* Top row - 3 stars */}
        <path
          d="M1.5 2L1.7 2.8L2.5 2.8L1.9 3.2L2.1 4L1.5 3.6L0.9 4L1.1 3.2L0.5 2.8L1.3 2.8L1.5 2Z"
        />
        <path
          d="M3.5 2L3.7 2.8L4.5 2.8L3.9 3.2L4.1 4L3.5 3.6L2.9 4L3.1 3.2L2.5 2.8L3.3 2.8L3.5 2Z"
        />
        <path
          d="M5.5 2L5.7 2.8L6.5 2.8L5.9 3.2L6.1 4L5.5 3.6L4.9 4L5.1 3.2L4.5 2.8L5.3 2.8L5.5 2Z"
        />
        
        {/* Second row - 4 stars */}
        <path
          d="M0.5 4.5L0.7 5.3L1.5 5.3L0.9 5.7L1.1 6.5L0.5 6.1L-0.1 6.5L0.1 5.7L-0.5 5.3L0.3 5.3L0.5 4.5Z"
        />
        <path
          d="M2.5 4.5L2.7 5.3L3.5 5.3L2.9 5.7L3.1 6.5L2.5 6.1L1.9 6.5L2.1 5.7L1.5 5.3L2.3 5.3L2.5 4.5Z"
        />
        <path
          d="M4.5 4.5L4.7 5.3L5.5 5.3L4.9 5.7L5.1 6.5L4.5 6.1L3.9 6.5L4.1 5.7L3.5 5.3L4.3 5.3L4.5 4.5Z"
        />
        <path
          d="M6.5 4.5L6.7 5.3L7.5 5.3L6.9 5.7L7.1 6.5L6.5 6.1L5.9 6.5L6.1 5.7L5.5 5.3L6.3 5.3L6.5 4.5Z"
        />
      </g>
    </svg>
  );
}

