import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalEscape } from '../hooks/useModalEscape';

function HelpIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8.5a2.5 2.5 0 1 1 3 3.8c-.5.3-.5.7-.5 1.7M12 17h.01" />
    </svg>
  );
}

export function AdminQuickGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const close = () => setIsOpen(false);
  useModalEscape(isOpen, close);
  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        className="admin-quick-guide-trigger"
        aria-label="View Admin quick guide"
        aria-haspopup="dialog"
        title="View quick guide"
        onClick={() => setIsOpen(true)}
      >
        <HelpIcon />
      </button>
      {isOpen && createPortal(
        <div className="employee-experience">
          <div className="fixed inset-0 modal-backdrop">
            <section className="modal quick-guide-modal admin-quick-guide-modal" role="dialog" aria-modal="true" aria-labelledby="admin-quick-guide-title">
              <button ref={closeButtonRef} className="modal-close icon-button" type="button" aria-label="Close dialog" onClick={close}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 6 12 12M6 18 18 6" />
                </svg>
              </button>
              <div className="quick-guide-modal-content admin-quick-guide-content">
                <header className="admin-quick-guide-header">
                  <span className="eyebrow">A QUICK GUIDE</span>
                  <h2 id="admin-quick-guide-title">Manage partner performance with confidence.</h2>
                  <p className="modal-subtitle">A quick guide to the Admin workspace.</p>
                </header>
                <ol className="quick-guide-steps">
                  <li><span>1</span><div><h3>Review the dashboard</h3><p>Start with current evaluation activity, partner rankings, and documents that need attention.</p></div></li>
                  <li><span>2</span><div><h3>Manage partners and evaluations</h3><p>Use Partners for the directory, documents, and feedback. Use Evaluations to manage forms, archives, and response imports.</p></div></li>
                  <li><span>3</span><div><h3>Analyze, report, and manage access</h3><p>Use Analytics for trends, Reports to build reports or presentations, and Users to manage accounts and permissions.</p></div></li>
                </ol>
                <p className="quick-guide-note">Your Admin role includes access to every workspace module.</p>
                <footer className="admin-quick-guide-footer">
                  <button className="primary-button" type="button" onClick={close}>Got it</button>
                </footer>
              </div>
            </section>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
