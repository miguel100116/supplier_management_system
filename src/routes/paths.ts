const encodeSegment = (value: string) => encodeURIComponent(value);

export const PATHS = {
  login: '/login',
  passwordRecovery: '/password-recovery',
  admin: {
    root: '/admin',
    dashboard: '/admin/dashboard',
    partners: {
      root: '/admin/partners',
      active: '/admin/partners?status=active',
      documents: '/admin/partners/documents',
      documentExpiry: '/admin/partners/documents/expiry',
      feedback: '/admin/partners/feedback',
      details: (partnerId: string) => `/admin/partners/${encodeSegment(partnerId)}`,
    },
    evaluations: {
      root: '/admin/evaluations',
      workspace: {
        root: '/admin/evaluations/workspace',
        forms: '/admin/evaluations/workspace/forms',
        newForm: '/admin/evaluations/workspace/forms/new',
        form: (formId: string) => `/admin/evaluations/workspace/forms/${encodeSegment(formId)}`,
        editForm: (formId: string) => `/admin/evaluations/workspace/forms/${encodeSegment(formId)}/edit`,
        responses: '/admin/evaluations/workspace/responses',
        coverage: '/admin/evaluations/workspace/coverage',
        categoryLabels: '/admin/evaluations/workspace/category-labels',
      },
      archive: '/admin/evaluations/archive',
      importResponses: '/admin/evaluations/import',
    },
    analytics: '/admin/analytics',
    reports: {
      root: '/admin/reports',
      generate: '/admin/reports/generate',
      present: '/admin/reports/present',
      history: '/admin/reports/history',
      builders: {
        summary: '/admin/reports/builders/summary',
        partners: '/admin/reports/builders/partners',
        questions: '/admin/reports/builders/questions',
        executiveSummary: '/admin/reports/builders/executive-summary',
      },
      export: { rawData: '/admin/reports/export/raw-data' },
    },
    users: {
      root: '/admin/users',
      departmentAccess: '/admin/users/department-access',
    },
    notifications: '/admin/notifications',
    settings: '/admin/settings',
  },
  employee: {
    home: '/employee/home',
    evaluations: '/employee/evaluations',
    fillEvaluation: (formId: string) => `/employee/evaluations/${encodeSegment(formId)}/fill`,
    submissions: '/employee/submissions',
    notifications: '/employee/notifications',
    profile: '/employee/profile',
  },
} as const;
