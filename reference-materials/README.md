# Reference materials

Historical form utilities, extracted text/question JSON, and the existing reviewed CSV sources are grouped here. Files were moved from the repository root; the source data was not regenerated or changed.

```text
reference-materials/
  scripts/
    extract_form_text.js
    extract_remaining.js
    generate_subcontractor.js
    generate_subcontractor2.cjs
    generate_supplier.js
    patch_questions.cjs
    test_single.js
  extracted/
    extracted_courier.txt
    extracted_form_text.txt
    extracted_subcontractor.txt
    extracted_supplier.txt
    metadata.json
    subQuestions.json
    supQuestions.json
  source-data/
    screenshots/                 Original form screenshots by partner category
    EFAS_Project_Charter.docx
    Master List Tracker_V4_SMS Copy.csv
    Microgenesis Courier Evaluation Form.csv
    Microgenesis Subcontractor Evaluation Form.csv
    Microgenesis Supplier Evaluation Form.csv
```

## Import sources

The CSV importer reads `source-data/` when given this repository's root. Existing commands such as `npm run import:supabase -- --dry-run` retain their meaning. `--project-root` also continues to accept a directory containing the four CSVs directly. Reviewed file checksums and header validation remain enforced.

These files contain confidential business records. Their existing filenames, contents, and import identities are preserved; moving them does not change stored database records. See [the normalized import documentation](../docs/engineering/SUPABASE_NORMALIZED_IMPORT.md).

## Legacy utilities

Run these scripts from the repository root using their new paths, for example `node reference-materials/scripts/generate_supplier.js`. The two `.js` question generators print JSON to standard output. Extractors read `reference-materials/source-data/screenshots/` and write under `reference-materials/extracted/`.

The extraction scripts and `test_single.js` send screenshots to the configured Gemini API and require `GEMINI_API_KEY`. The name `test_single.js` refers to a manual API probe, not an automated application test.

`patch_questions.cjs` reads question JSON from `extracted/` and rewrites `src/hooks/useSurveyData.ts`. `generate_subcontractor2.cjs` also rewrites that source file and changes a cache-version suffix. These historical utilities are not part of normal application startup or deployment. Inspect their output and source diff before using them.

The automated compatibility test exercises the relocated patcher against synthetic files in a disposable workspace. It does not call the API or rewrite application source.
