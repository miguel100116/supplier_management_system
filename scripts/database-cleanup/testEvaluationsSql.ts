/** Generates reviewable SQL; this module never connects to a database. */
export function buildTestEvaluationCleanupSql(mode: 'preview' | 'delete'): string {
  const deletion = mode === 'delete';
  return `-- Test evaluation cleanup (${mode}). Check the selected Supabase project.
-- CSV files, normalized imports, companies, forms and accounts are preserved.
-- Review the preview first: staging labels may include genuine evaluations.
BEGIN;
${deletion ? `-- Prevent changes between candidate selection and deletion.
LOCK TABLE public.application_records IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.evaluation_submissions IN SHARE MODE;
` : ''}
CREATE TEMP TABLE cleanup_test_candidates ON COMMIT DROP AS
WITH classified AS (
  SELECT ar.record_id, ar.payload,
    NULLIF(TRIM(ar.payload->>'responseId'), '') AS response_id,
    (
      ar.payload->>'dataSource' = 'test_submission'
      OR (
        NULLIF(TRIM(ar.payload->>'dataSource'), '') IS NULL
        AND UPPER(TRIM(ar.payload->>'company')) = 'TEST'
        AND COALESCE(ar.payload->>'surveyId', '') NOT LIKE 'default-%'
      )
    ) IS TRUE AS is_test,
    (
      COALESCE(ar.payload->>'responseId', '') LIKE 'IMPORT-%'
      OR COALESCE(ar.payload->>'importBatchId', '') LIKE 'client-csv:%'
      OR ar.payload->>'dataSource' IN ('client_csv', 'app_submission', 'production_submission')
      OR EXISTS (
        SELECT 1 FROM public.evaluation_submissions s
        WHERE s.id::text = ar.payload->>'responseId'
      )
    ) IS TRUE AS is_protected
  FROM public.application_records ar
  WHERE ar.record_type = 'survey_response'
), eligible_responses AS (
  -- Delete whole evaluations only; preserve mixed or uncertain answer groups.
  SELECT response_id
  FROM classified
  WHERE response_id IS NOT NULL
  GROUP BY response_id
  HAVING BOOL_AND(is_test) AND NOT BOOL_OR(is_protected)
)
SELECT c.record_id, c.payload
FROM classified c
JOIN eligible_responses e ON e.response_id = c.response_id;

SELECT payload->>'company' AS company,
  payload->>'surveyType' AS survey_type,
  COUNT(DISTINCT payload->>'responseId') AS responses,
  COUNT(*) AS answer_rows
FROM cleanup_test_candidates
GROUP BY 1, 2
ORDER BY 1, 2;

${deletion ? `DELETE FROM public.application_records ar
USING cleanup_test_candidates c
WHERE ar.record_type = 'survey_response' AND ar.record_id = c.record_id
RETURNING ar.record_id, ar.payload->>'responseId' AS response_id,
  ar.payload->>'company' AS company, ar.payload->>'surveyType' AS survey_type;

COMMIT;` : `-- Export these full rows privately before running the deletion SQL.
SELECT ar.*
FROM public.application_records ar
JOIN cleanup_test_candidates c ON c.record_id = ar.record_id
WHERE ar.record_type = 'survey_response'
ORDER BY ar.record_id;

ROLLBACK;`}
`;
}

export function parseCleanupMode(args: string[]): 'preview' | 'delete' {
  if (args.length === 0 || (args.length === 1 && args[0] === '--preview')) return 'preview';
  if (args.length === 1 && args[0] === '--delete-sql') return 'delete';
  throw new Error('Use --preview (default) or --delete-sql. This command generates SQL only.');
}
