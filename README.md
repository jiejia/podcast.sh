# podcast.sh

Automates resource discovery, NotebookLM podcast generation, and WordPress publishing for `a-ripple-song`.

## Setup

1. Copy `.env.example` to `.env` and fill in all required values.
   `WORDPRESS_SITE_SLUG` is used as the notebook title prefix, for example `localhost7007-000001`.
   `PODCAST_LANG` sets the default podcast language when `--lang` is omitted.
   `WORDPRESS_AUTHORS` and `WORDPRESS_CONTRIBUTORS` set the default Members and Guests for new podcast episodes; use comma-separated WordPress usernames for multiple users.
   `TYPES` is required and controls the allowed resource types for `--type`. `--type` cannot be omitted unless `--limit` is also omitted; in that special case the CLI uses the full configured `TYPES` list and sets the total limit to one item per type.
   Resource selection starts at `RESOURCE_START_DATE` and only keeps items whose rating is at least `RESOURCE_START_SCORE`, then picks the oldest matching items first.
2. Install dependencies:

```bash
npm install
```

3. Run the CLI:

```bash
npx tsx src/index.ts --type=tv --limit=3 --format=deep-dive
```

Optional:

```bash
npx tsx src/index.ts --type=movie --limit=1 --lang=en-US --format=brief --wp-status=draft
```

All resource discovery now uses TMDB:

```text
movie -> /discover/movie
tv -> /discover/tv
```

Detailed type rules:

```text
movie
- uses TMDB /discover/movie
- filters by primary_release_date >= RESOURCE_START_DATE
- filters by vote_average >= RESOURCE_START_SCORE
- sorts by primary_release_date ascending

tv
- uses TMDB /discover/tv
- filters by first_air_date >= RESOURCE_START_DATE
- filters by vote_average >= RESOURCE_START_SCORE
- sorts by first_air_date ascending
```

- `PODCAST_LANG` 和 `--lang` 可选参数见 [LANGUAGES.md](/Users/gem/www/podcast.sh/LANGUAGES.md)
- `REGIONS` 可选参数见 [REGIONS.md](/Users/gem/www/podcast.sh/REGIONS.md)

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
- After a podcast is confirmed published, the pipeline deletes its NotebookLM notebook and local poster/audio files. If cleanup fails, the published record remains intact and cleanup is retried on the next run.
