export function Loading({ label = 'Carregando...' }: { label?: string }) {
  return <div className="loading-card">{label}</div>;
}
