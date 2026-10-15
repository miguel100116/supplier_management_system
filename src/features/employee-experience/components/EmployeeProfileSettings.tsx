import { LogOut } from 'lucide-react';

interface EmployeeProfileSettingsProps {
  email: string;
  displayName: string;
  initials: string;
  designation?: string;
  department?: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onLogout: () => void;
}

export function EmployeeProfileSettings({
  email,
  displayName,
  initials,
  designation,
  department,
  darkMode,
  onToggleDarkMode,
  onLogout,
}: EmployeeProfileSettingsProps) {
  return (
    <div className="employee-profile-settings">
      <section className="employee-profile-account" aria-labelledby="employee-profile-name">
        <div className="employee-profile-account-heading">
          <div className="employee-profile-avatar" aria-hidden="true">{initials}</div>
          <div className="employee-profile-identity-copy">
            <h2 id="employee-profile-name">{displayName || 'User'}</h2>
            <p className="employee-profile-email">{email}</p>
          </div>
        </div>
        <dl className="employee-profile-details">
          <div><dt>Role</dt><dd>Employee</dd></div>
          {designation && <div><dt>Designation</dt><dd>{designation}</dd></div>}
          {department && <div><dt>Department</dt><dd>{department}</dd></div>}
        </dl>
      </section>

      <section className="employee-profile-preferences" aria-labelledby="employee-profile-preferences-title">
        <div className="employee-profile-section-heading">
          <h3 id="employee-profile-preferences-title">Appearance</h3>
          <p>Choose how the workspace looks on this device.</p>
        </div>
        <div className="employee-profile-preference-row">
          <span className="employee-profile-preference-copy">
            <strong>Dark mode</strong>
            <span>Use a darker color scheme.</span>
          </span>
          <button
            className={`employee-profile-switch${darkMode ? ' is-on' : ''}`}
            onClick={onToggleDarkMode}
            type="button"
            role="switch"
            aria-label="Dark mode"
            aria-checked={darkMode}
          >
            <span />
          </button>
        </div>
      </section>

      <section className="employee-profile-session" aria-labelledby="employee-profile-session-title">
        <div className="employee-profile-session-copy">
          <h3 id="employee-profile-session-title">Session</h3>
          <p>Sign out of the Supplier Management System.</p>
        </div>
        <button className="employee-profile-signout" onClick={onLogout} type="button">
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </section>
    </div>
  );
}
