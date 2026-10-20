/** Yükleniyor iskeleti: içerik gelene kadar sayfanın yerleşimi oynamaz. */
export function LoadingBlock({ rows = 3, label = 'Yükleniyor…' }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card space-y-2">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-3 w-2/3" />
          <div className="skeleton h-3 w-1/4" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Düğme içinde/yanında küçük dönen gösterge. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      role="status"
      aria-label="Yükleniyor"
    />
  );
}

/** Ekran parçası yüklenirken (tembel yüklenen sayfa) gösterilen iskelet. */
export function PageFallback() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-7 w-48" />
      <LoadingBlock rows={3} label="Ekran yükleniyor…" />
    </div>
  );
}
