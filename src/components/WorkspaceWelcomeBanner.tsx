import type { ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';

interface WorkspaceWelcomeBannerProps {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

/** Shared welcome banner used by the Employee and Admin workspace homes. */
export function WorkspaceWelcomeBanner({ eyebrow, title, description, actionLabel, onAction }: WorkspaceWelcomeBannerProps) {
  return (
    <div className="welcome-banner">
      <div className="welcome-content">
        <span className="banner-eyebrow"><span />{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
        {actionLabel && onAction && <button className="banner-link" type="button" onClick={onAction}>{actionLabel} <ArrowRight size={17} /></button>}
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="art-orbit orbit-one" />
        <div className="art-orbit orbit-two" />
        <div className="art-dot dot-one" />
        <div className="art-dot dot-two" />
        <div className="art-sheet sheet-back" />
        <div className="art-sheet sheet-front">
          <span className="art-sheet-heading" />
          <span className="art-sheet-sub" />
          {[0, 1, 2].map((item) => (
            <div className="art-line" key={item}>
              <span className="art-check"><Check size={12} /></span>
              <span />
            </div>
          ))}
        </div>
        <div className="art-seal"><Check size={24} /></div>
      </div>
    </div>
  );
}
