import { cn } from "@/lib/utils";

export function PromptBeatsFolderIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 96 80"
      aria-hidden="true"
      className={cn("overflow-visible", className)}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="pb-folder-shell" x1="9" y1="10" x2="88" y2="71" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16D9FF" />
          <stop offset="0.48" stopColor="#2576FF" />
          <stop offset="1" stopColor="#D93BFF" />
        </linearGradient>
        <linearGradient id="pb-folder-fill" x1="18" y1="19" x2="78" y2="70" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0CB7E8" stopOpacity="0.46" />
          <stop offset="0.5" stopColor="#2757D8" stopOpacity="0.55" />
          <stop offset="1" stopColor="#9D2BEF" stopOpacity="0.45" />
        </linearGradient>
        <filter id="pb-folder-glow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="2.6" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d="M11 26.5V19.8C11 14.4 15.4 10 20.8 10H39l7.2 7.1H75c5.5 0 10 4.5 10 10v5.2"
        fill="url(#pb-folder-fill)"
        stroke="url(#pb-folder-shell)"
        strokeWidth="2.6"
        strokeLinejoin="round"
        filter="url(#pb-folder-glow)"
      />
      <path
        d="M10 30.5C10 25.8 13.8 22 18.5 22h59C82.2 22 86 25.8 86 30.5v34C86 69.2 82.2 73 77.5 73h-59C13.8 73 10 69.2 10 64.5v-34Z"
        fill="url(#pb-folder-fill)"
        stroke="url(#pb-folder-shell)"
        strokeWidth="2.8"
        filter="url(#pb-folder-glow)"
      />
      <path
        d="M14.5 33.5h67"
        stroke="rgba(255,255,255,.62)"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity=".55"
      />

      <g stroke="url(#pb-folder-shell)" strokeWidth="3.2" strokeLinecap="round" filter="url(#pb-folder-glow)">
        <path d="M28 51v4" />
        <path d="M34 47v12" />
        <path d="M40 43v20" />
        <path d="M46 48v10" />
        <path d="M52 39v28" />
        <path d="M58 46v14" />
        <path d="M64 50v6" />
      </g>

      <path
        d="M72.5 40.5l1.8 4.1 4.2 1.8-4.2 1.8-1.8 4.2-1.8-4.2-4.1-1.8 4.1-1.8 1.8-4.1Z"
        fill="#F5C7FF"
        stroke="#FFFFFF"
        strokeWidth=".6"
        filter="url(#pb-folder-glow)"
      />
    </svg>
  );
}
