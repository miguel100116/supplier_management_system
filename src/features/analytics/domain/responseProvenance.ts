import type { SurveyResponse, SurveyResponseSource } from '../../../types/survey';

export type DeploymentEnvironment = 'staging' | 'production';

export function parseDeploymentEnvironment(value: unknown): DeploymentEnvironment {
  return String(value ?? '').trim().toLowerCase() === 'production' ? 'production' : 'staging';
}

export function submissionSourceForEnvironment(environment: DeploymentEnvironment): SurveyResponseSource {
  // Completing an evaluation is business input in staging as well as production.
  // Keep the legacy production source, but never label a normal app save as a test.
  return environment === 'production' ? 'production_submission' : 'app_submission';
}

/**
 * Classifies records created before provenance fields existed. The normalized
 * client import uses the default form IDs, while UI CSV imports use IMPORT-*.
 * RESP-* rows in this repository were created in the documented pre-production
 * staging environment, so they remain available elsewhere but are excluded
 * from official Analytics until explicitly imported/submitted as official.
 */
export function getResponseDataSource(response: SurveyResponse): SurveyResponseSource {
  if (response.dataSource) return response.dataSource;
  if (response.surveyId?.startsWith('default-') || response.responseId.startsWith('IMPORT-')) {
    return 'client_csv';
  }
  if (response.responseId.startsWith('RESP-')) return 'test_submission';
  return 'test_submission';
}

export function isOfficialAnalyticsResponse(response: SurveyResponse): boolean {
  const source = getResponseDataSource(response);
  return source === 'client_csv' || source === 'app_submission' || source === 'production_submission';
}
