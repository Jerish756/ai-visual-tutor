## Hybrid Render Deployment

This setup keeps the website/API on Render and runs video rendering on your own computer for free.

### Render web service env vars

- `OPENAI_API_KEY`
- `PINECONE_API_KEY`
- `VIDEO_RENDER_MODE=worker`
- `RENDER_WORKER_TOKEN=<your-secret-token>`

Use:

- Build command: `npm install`
- Start command: `npm start`

### Local worker env vars

Create a local `.env` for the worker with:

```env
REMOTE_API_URL=https://your-render-service.onrender.com
RENDER_WORKER_TOKEN=the-same-secret-token-you-set-on-render
LOCAL_ASSET_PORT=3100
RENDER_WORKER_ID=home-pc
```

Then run:

```bash
npm install
npm run worker
```

Keep the worker running on the same computer where you want video rendering to happen.

### How it works

1. The site sends a generate request to Render.
2. Render creates scenes and queues a render job.
3. Your local worker polls Render, claims the job, renders video locally, and uploads the finished MP4 back.
4. The browser polls the job status and shows the video when the worker finishes.
