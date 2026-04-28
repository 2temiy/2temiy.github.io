# DemoCut AI backend/render architecture

This app cannot create real CS2 POV videos from GitHub Pages alone. A real product needs a backend that stores uploaded `.dem` files, parses game events, queues render jobs, drives a CS2 demo playback worker, records clips, and returns MP4 URLs to the frontend.

## User flow

1. User uploads a `.dem`.
2. Backend creates a job and stores the original demo.
3. Parser extracts players, rounds, deaths, weapons, headshots, ticks, teams, and match metadata.
4. User selects their player and either auto mode or a specific moment.
5. Highlight selector ranks candidate moments.
6. Render queue creates one job per output:
   - own POV clip;
   - enemy POV clip;
   - vertical auto edit;
   - optional full-round clip.
7. Render worker records CS2 demo playback and trims/encodes clips with ffmpeg.
8. Frontend polls job status and shows signed download links when outputs are ready.

## Services

### Web/API

- Suggested stack: FastAPI or Node/NestJS.
- Responsibilities:
  - authenticated upload endpoint;
  - job status endpoint;
  - highlight selection endpoint;
  - output download links;
  - validation for size, extension, and parseability.

### Storage

- Demo/object storage: S3-compatible bucket.
- Database: PostgreSQL.
- Tables:
  - `demo_jobs`;
  - `players`;
  - `rounds`;
  - `events`;
  - `highlight_candidates`;
  - `render_jobs`;
  - `render_outputs`.

### Parser worker

- Library: `demoparser2`.
- Reads `.dem` from storage.
- Extracts at minimum:
  - `player_death`;
  - `round_start`, `round_end`, `bomb_planted`, `bomb_defused`;
  - player info/name/SteamID;
  - tick and `total_rounds_played`;
  - weapon, headshot, attacker/victim.
- Produces normalized highlight candidates:
  - multi-kill;
  - clutch;
  - AWP kill;
  - pistol/eco if economy data is available;
  - retake/post-plant;
  - enemy POV revenge/death angle.

### Render worker

- Requires a Windows or Linux GPU machine with:
  - Steam account with CS2 installed;
  - CS2 launchable in a controlled desktop session;
  - OBS or screen capture;
  - ffmpeg;
  - enough disk for temporary raw captures.
- Render steps:
  1. Copy demo into CS2 demo directory.
  2. Launch CS2 with deterministic graphics/video config.
  3. Run `playdemo <demo_name>`.
  4. Seek to the start tick with `demo_goto <tick>`.
  5. Select target POV where possible through spectator controls/config.
  6. Record a padded window around the moment.
  7. Trim and encode with ffmpeg.
  8. Upload MP4 to storage and mark output ready.

## API sketch

```http
POST /api/demos
Content-Type: multipart/form-data

file=<match.dem>
```

```json
{
  "jobId": "demo_123",
  "status": "uploaded"
}
```

```http
GET /api/demos/demo_123
```

```json
{
  "status": "parsed",
  "players": [
    { "id": "7656119...", "name": "2temiy", "team": "T" }
  ],
  "moments": [
    {
      "id": "hl_1",
      "round": 18,
      "tick": 482314,
      "type": "clutch",
      "title": "Clutch 1v3",
      "score": 0.96
    }
  ]
}
```

```http
POST /api/demos/demo_123/render
Content-Type: application/json
```

```json
{
  "playerId": "7656119...",
  "momentId": "hl_1",
  "outputs": ["player_pov", "enemy_pov", "vertical_edit"]
}
```

```http
GET /api/renders/render_123
```

```json
{
  "status": "ready",
  "outputs": [
    { "type": "player_pov", "url": "https://cdn.example/player.mp4" },
    { "type": "enemy_pov", "url": "https://cdn.example/enemy.mp4" }
  ]
}
```

## MVP milestones

### Milestone 1: honest analyzer

- Real `.dem` upload.
- Real parse with `demoparser2`.
- Real player list.
- Real highlight moments with ticks/rounds.
- No MP4 yet.

### Milestone 2: queued rendering

- Render job API.
- One controlled render worker.
- Own POV MP4 for one selected moment.

### Milestone 3: multi-output pack

- Enemy POV clips.
- Vertical auto edit.
- Full round output.
- Progress UI and download links.

## Constraints

- GitHub Pages can only host the frontend.
- Browser-only code cannot run CS2 or record POV video.
- Rendering is operationally heavy: it needs a game install, GPU/desktop capture, queue isolation, and a Steam account.
- The frontend should not claim MP4 output is ready until a backend render job exists.
