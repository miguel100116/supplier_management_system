import React, { useState } from 'react';
import { PartnerContact } from '../types';
import { SurveyType } from '../../../types/survey';
import { Users, Plus, Mail, Building, Trash, Edit3, Search, Check, X, Sparkles } from 'lucide-react';
import { useModalEscape } from '../../../hooks/useModalEscape';

interface PartnerDirectoryTabProps {
  contacts: PartnerContact[];
  onAddContact: (contact: Omit<PartnerContact, 'id' | 'updatedAt'>) => void;
  onUpdateContact: (contact: PartnerContact) => void;
  onDeleteContact: (id: string) => void;
  isAdmin?: boolean;
}

export function PartnerDirectoryTab({
  contacts,
  onAddContact,
  onUpdateContact,
  onDeleteContact,
  isAdmin,
}: PartnerDirectoryTabProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<SurveyType | 'All'>('All');

  // Contact Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  useModalEscape(isModalOpen, () => setIsModalOpen(false));
  const [editingContact, setEditingContact] = useState<PartnerContact | null>(null);

  // Form State
  const [companyName, setCompanyName] = useState('');
  const [partnerType, setPartnerType] = useState<SurveyType>('Courier');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [ccListInput, setCcListInput] = useState('');

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch =
      c.companyName.toLowerCase().includes(search.toLowerCase()) ||
      c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === 'All' || c.partnerType === selectedType;
    return matchesSearch && matchesType;
  });

  const handleOpenAdd = () => {
    setEditingContact(null);
    setCompanyName('');
    setPartnerType('Courier');
    setContactPerson('');
    setEmail('');
    setCcListInput('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: PartnerContact) => {
    setEditingContact(c);
    setCompanyName(c.companyName);
    setPartnerType(c.partnerType);
    setContactPerson(c.contactPerson);
    setEmail(c.email);
    setCcListInput(c.ccEmails.join(', '));
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !email.trim()) return;

    const ccEmailsArr = ccListInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingContact) {
      onUpdateContact({
        ...editingContact,
        companyName: companyName.trim(),
        partnerType,
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        ccEmails: ccEmailsArr,
        updatedAt: new Date().toISOString(),
      });
    } else {
      onAddContact({
        companyName: companyName.trim(),
        partnerType,
        contactPerson: contactPerson.trim(),
        email: email.trim(),
        ccEmails: ccEmailsArr,
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200 dark:border-slate-800 dark:bg-slate-950">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search directory by partner name, contact person, or email..."
            className="field !pl-9 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="segmented-control admin-tab-strip min-w-0 flex-1">
            {(['All', 'Courier', 'Supplier', 'Subcontractor'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelectedType(type)}
                aria-pressed={selectedType === type}
                className={selectedType === type ? 'segmented-active' : ''}
              >
                {type}
              </button>
            ))}
          </div>

          <button
            onClick={handleOpenAdd}
            className="primary-button text-xs gap-1.5 bg-[#0063a9] hover:bg-blue-800 shrink-0"
          >
            <Plus size={15} />
            Add Partner Contact
          </button>
        </div>
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredContacts.map((contact) => (
          <div
            key={contact.id}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950 flex flex-col justify-between hover:shadow-md transition"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <span className="badge bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-bold">
                  {contact.partnerType}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleOpenEdit(contact)}
                    className="p-1 text-slate-400 hover:text-blue-600 transition"
                    title="Edit Contact"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => onDeleteContact(contact.id)}
                    className="p-1 text-slate-400 hover:text-rose-600 transition"
                    title="Delete Contact"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>

              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Building size={16} className="text-[#0063a9] shrink-0" />
                {contact.companyName}
              </h3>

              <div className="mt-4 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Contact Person</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{contact.contactPerson || 'N/A'}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">Primary Email</span>
                  <span className="font-semibold text-[#0063a9] dark:text-blue-300 flex items-center gap-1 mt-0.5">
                    <Mail size={13} />
                    {contact.email}
                  </span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">CC List</span>
                  {contact.ccEmails.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {contact.ccEmails.map((cc) => (
                        <span key={cc} className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded text-[10px] font-medium">
                          {cc}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-slate-400 italic text-[11px]">None</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
              <span>Auto-fills in Send Flow</span>
              <span>Updated {new Date(contact.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Contact Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users size={16} className="text-[#0063a9]" />
                {editingContact ? 'Edit Partner Contact' : 'Add New Partner Contact'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="field-label text-xs font-bold">Partner Company Name <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. LBC Express Inc."
                  className="field mt-1 text-xs"
                />
              </div>

              <div>
                <label className="field-label text-xs font-bold">Partner Category</label>
                <select
                  value={partnerType}
                  onChange={(e) => setPartnerType(e.target.value as SurveyType)}
                  className="field mt-1 text-xs"
                >
                  <option value="Courier">Courier</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Subcontractor">Subcontractor</option>
                </select>
              </div>

              <div>
                <label className="field-label text-xs font-bold">Contact Person & Title</label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  placeholder="e.g. Carlos Mendoza - Account Lead"
                  className="field mt-1 text-xs"
                />
              </div>

              <div>
                <label className="field-label text-xs font-bold">Primary Dispatch Email <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. contact@company.com"
                  className="field mt-1 text-xs"
                />
              </div>

              <div>
                <label className="field-label text-xs font-bold">CC List (Comma separated)</label>
                <input
                  type="text"
                  value={ccListInput}
                  onChange={(e) => setCcListInput(e.target.value)}
                  placeholder="e.g. ops@company.com, rep@mgenesis.com"
                  className="field mt-1 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="secondary-button text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button text-xs bg-[#0063a9]"
                >
                  {editingContact ? 'Save Changes' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
