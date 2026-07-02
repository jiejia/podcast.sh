# podcast.sh

Automates resource discovery, NotebookLM podcast generation, and WordPress publishing for `a-ripple-song`.

## Setup

1. Copy `.env.example` to `.env` and fill in all required values.
2. Install dependencies:

```bash
npm install
```

3. Run the CLI:

```bash
npx tsx src/index.ts --type=anime --limit=3 --lang=中文 --format=deep-dive
```

Optional:

```bash
npx tsx src/index.ts --type=movie --limit=1 --lang=English --format=brief --wp-status=draft
```

Reset only local script data:

```bash
npm run reset-local-data
```

This deletes and recreates `${STORAGE_DIR}/db`, `${STORAGE_DIR}/posters`, and `${STORAGE_DIR}/audio`. It does not delete anything from WordPress or NotebookLM.

## Notes

- `nlm` must already be installed and authenticated via `nlm login`.
- The script stores SQLite data under `${STORAGE_DIR}/db/podcast.sqlite`.
- Downloaded posters and audio files are stored under `${STORAGE_DIR}/posters` and `${STORAGE_DIR}/audio`.
