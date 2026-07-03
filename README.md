# podcast.sh

Automates resource discovery, NotebookLM podcast generation, and WordPress publishing for `a-ripple-song`.

## Setup

1. Copy `.env.example` to `.env` and fill in all required values.
   `WORDPRESS_SITE_SLUG` is used as the notebook title prefix, for example `localhost7007-000001`.
   Resource selection starts at `RESOURCE_START_DATE` and only keeps items whose rating is at least `RESOURCE_START_SCORE`, then picks the oldest matching items first.
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
npm run preview-reset-targets
```

Preview which local records and linked WordPress / NotebookLM objects would be removed:

```bash
npm run reset-local-data
```

This command removes the script-linked WordPress episode posts/media, removes the linked NotebookLM notebooks, and then deletes and recreates `${STORAGE_DIR}/db`, `${STORAGE_DIR}/posters`, and `${STORAGE_DIR}/audio`.

## Notes

- `nlm` must already be installed and authenticated via `nlm login`.
- The script stores SQLite data under `${STORAGE_DIR}/db/podcast.sqlite`.
- Downloaded posters and audio files are stored under `${STORAGE_DIR}/posters` and `${STORAGE_DIR}/audio`.
- Each run also writes a JSONL log file under `${STORAGE_DIR}/logs`.
