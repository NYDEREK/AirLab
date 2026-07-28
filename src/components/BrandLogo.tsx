import logoUrl from "../assets/airlab-logo.svg";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "is-compact" : ""}`}>
      <img alt="" aria-hidden="true" src={logoUrl} />
      <div>
        <strong>AirLab</strong>
        {!compact ? <span>Ball design studio</span> : null}
      </div>
    </div>
  );
}
