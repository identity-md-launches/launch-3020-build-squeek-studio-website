export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: (
      <>
        <path d="M5 12h14m-6-6 6 6-6 6" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20 15.5A9 9 0 0 1 8.5 4a9 9 0 1 0 11.5 11.5Z" />,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="3" />
        <path d="M16 11h5v5h-5a2.5 2.5 0 0 1 0-5ZM3 8V5l13-3v3" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V3H3v13h5" />
      </>
    ),
    share: (
      <>
        <circle cx="18" cy="4" r="3" />
        <circle cx="5" cy="12" r="3" />
        <circle cx="18" cy="20" r="3" />
        <path d="m7.5 10.5 8-5m-8 8 8 5" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    pfp: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
      </>
    ),
    banner: <rect x="2" y="7" width="20" height="10" rx="2" />,
    phone: (
      <>
        <rect x="6" y="2" width="12" height="20" rx="2" />
        <path d="M10 18h4" />
      </>
    ),
    desktop: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M12 17v5m-5 0h10" />
      </>
    ),
    stickers: (
      <>
        <path d="M21 13V4H3v17h10l8-8Z" />
        <path d="M13 21v-8h8" />
        <path d="M7 8h1m6 0h1m-8 4q4 4 8 0" />
      </>
    ),
    id: (
      <>
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <circle cx="8" cy="10" r="2" />
        <path d="M5 16v-1a3 3 0 0 1 6 0v1m3-7h5m-5 4h5" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7V2l-4 4a8 8 0 1 0 3 11M20 2h-5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4m-4 4v3" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m-1-6L10 14m11 0v7H3V3h7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.spark}
    </svg>
  );
}
export function Mark() {
  return (
    <svg
      width="33"
      height="33"
      viewBox="0 0 33 33"
      aria-hidden="true"
      className="brand-mark"
    >
      <g fill="currentColor">
        {[
          [7, 7],
          [23, 7],
          [7, 12],
          [12, 12],
          [17, 12],
          [23, 12],
          [7, 17],
          [12, 17],
          [17, 17],
          [23, 17],
          [7, 22],
          [12, 22],
          [17, 22],
          [23, 22],
          [12, 27],
          [17, 27],
        ].map(([x, y], i) => (
          <rect key={i} x={x - 2} y={y - 2} width="4" height="4" rx="1" />
        ))}
      </g>
      <path d="M11 16h1m8 0h1m-7 6h4" stroke="var(--bg)" strokeWidth="2" />
    </svg>
  );
}
