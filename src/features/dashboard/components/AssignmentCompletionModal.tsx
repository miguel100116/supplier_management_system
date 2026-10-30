import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useModalEscape } from '../../../hooks/useModalEscape';
import type { AssignmentProgress, EmployeeAssignmentDetail } from '../domain/dashboardSnapshot';

export interface AssignmentCompletionModalProps {
  title: string;
  progress: AssignmentProgress | null;
  employees: EmployeeAssignmentDetail[] | null;
  onClose: () => void;
}

export function AssignmentCompletionModal({ title, progress, employees, onClose }: AssignmentCompletionModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalEscape(true, onClose);
  useEffect(() => { closeRef.current?.focus(); }, []);

  return <div className="dashboard-assignment-backdrop fixed inset-0">
    <section className="dashboard-assignment-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, summary, [tabindex="0"]')].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header>
        <div><h2 id={titleId}>Evaluation Progress</h2><p>{title}</p></div>
        <button ref={closeRef} type="button" className="dashboard-assignment-close" aria-label="Close evaluation progress" onClick={onClose}><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="dashboard-assignment-body" role="region" aria-label="Assigned employee details" tabIndex={0}>
        <p id={descriptionId}>{progress === null ? 'Assignment details are unavailable.' : progress.required === 0 ? 'No required assignments.' : `${progress.completed} of ${progress.required} assignments completed · ${progress.percentage}%`}</p>
        {employees === null ? <p>Employee access information is unavailable.</p> : employees.length === 0 ? <p>No employees currently have permission to complete this form.</p> : <table>
          <caption className="sr-only">Assigned employees and current-round completion</caption>
          <thead><tr><th scope="col">Employee</th><th scope="col">Completed / Required</th></tr></thead>
          <tbody>{employees.map(employee => <tr key={employee.email}>
            <td><strong>{employee.email}</strong><small>{employee.department} · {employee.designation}</small>
              {employee.companies.length > 0 && <details><summary aria-label={`View companies for ${employee.email}`}>View companies</summary><ul>{employee.companies.map(company => <li key={company.id}><span>{company.name}</span><span>{company.completed ? 'Completed' : 'Pending'}</span></li>)}</ul></details>}
            </td>
            <td>{employee.completed} / {employee.total}</td>
          </tr>)}</tbody>
        </table>}
      </div>
    </section>
  </div>;
}
