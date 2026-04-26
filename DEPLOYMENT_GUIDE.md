# Deployment Guide for Lumina Learn (Render)

This project is set up for **Hybrid Deployment**. 
- **Web App & API**: Runs on Render (Free tier).
- **Video Rendering**: Runs on your local computer (Free).

This avoids the complexity and cost of running heavy video rendering with Chromium/FFmpeg on cloud servers.

## Step 1: Prepare your Environment Variables

You will need the following API keys:
1. **OpenAI API Key**: From [OpenAI Dashboard](https://platform.openai.com/).
2. **Pinecone API Key**: From [Pinecone Console](https://app.pinecone.io/).
   - Ensure you have an index named `ai-tutor` with dimension **384** (for `all-MiniLM-L6-v2` embeddings).

## Step 2: Deploy to Render

### Option A: Using the Blueprint (Easiest)
1. Push your code to a GitHub/GitLab repository.
2. Go to the [Render Dashboard](https://dashboard.render.com/).
3. Click **New +** and select **Blueprint**.
4. Connect your repository.
5. Render will automatically detect `render.yaml` and prompt you for the `OPENAI_API_KEY` and `PINECONE_API_KEY`.
6. Click **Apply**.

### Option B: Manual Setup
1. Create a **New Web Service** on Render.
2. Connect your repository.
3. Settings:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Add Environment Variables:
   - `OPENAI_API_KEY`: your-key
   - `PINECONE_API_KEY`: your-key
   - `VIDEO_RENDER_MODE`: `worker`
   - `RENDER_WORKER_TOKEN`: `070506` (Must match your local .env)
   - `PINECONE_INDEX`: `ai-tutor`
   - `PINECONE_HOST`: `ai-tutor-hikzjgf.svc.aped-4627-b74a.pinecone.io`

## Step 3: Run the Local Video Worker

Once the Render service is live, you need to run the rendering worker on your computer:

1. Create or update your local `.env` file:
   ```env
   REMOTE_API_URL=https://ai-visual-tutor.onrender.com
   RENDER_WORKER_TOKEN=070506
   RENDER_WORKER_ID=my-laptop
   LOCAL_ASSET_PORT=3100
   ```
2. Run the worker:
   ```bash
   npm run worker
   ```

## Why this works?
1. **The Website**: When you click "Generate", Render creates the scenes and puts a "Job" in the database.
2. **The Worker**: Your laptop "polls" Render every few seconds. When it sees a job, it downloads the assets, renders the video using your local CPU/GPU, and uploads the final `.mp4` back to Render.
3. **Seamless Experience**: The user on the website sees a loading bar, and as soon as your laptop finishes, the video appears for them!

---
**Note**: Ensure your laptop has FFmpeg installed and available in the PATH for the worker to function correctly.
