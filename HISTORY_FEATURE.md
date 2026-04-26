# Chat History System Documentation

## Overview
The chat history system now stores **everything** about your learning sessions including:
- ✅ Full chat messages (both user and bot)
- ✅ Generated videos with playback
- ✅ Quiz questions and user answers
- ✅ Accuracy scores and performance metrics
- ✅ Session metadata (topic, difficulty, timestamps)

## Features

### 1. **Complete Session Tracking**
Each session automatically captures:
- **Session ID**: Unique identifier for the session
- **Topic**: What you're learning about
- **Difficulty Level**: school/bachelors/masters
- **Start Time**: When the session began
- **End Time**: When the session ended
- **Uploaded Files**: Any PDFs used in the session

### 2. **Chat Message History**
All messages are stored with:
- Sender (user or bot)
- Message content
- Exact timestamp
- Message ID

### 3. **Video Generation Tracking**
Every generated video is stored with:
- Video URL for playback
- Scene information
- Generation timestamp
- Associated with the session

### 4. **Quiz Results with Accuracy**
Complete quiz data including:
- All 8 questions
- User's answers
- Correct answers
- Individual question accuracy
- Overall accuracy percentage
- Score (e.g., 6/8)

### 5. **Detailed History View**
Click on any session in the History panel to see:
- 📊 Overview stats (messages, videos, quizzes, avg accuracy)
- 💬 Complete chat conversation
- 🎥 All videos with playback
- 📝 All quizzes with answers and corrections
- 📈 Performance metrics

## Data Storage

### Backend (Server)
- **File**: `chat-history.js` - History management module
- **Storage**: `data/chat-history.json` - JSON file with all sessions
- **Structure**:
  ```
  {
    "sessions": [
      {
        "id": "1726234567890",
        "topic": "Photosynthesis",
        "difficulty": "bachelors",
        "startTime": "2024-04-21T10:30:00.000Z",
        "endTime": "2024-04-21T10:45:00.000Z",
        "uploadedFile": null,
        "messages": [...],
        "videos": [...],
        "quizzes": [...]
      }
    ]
  }
  ```

### Frontend (Browser)
- **LocalStorage**: Backup session list (topic, level, date, time)
- **Current Session**: Tracked in memory during the chat

## API Endpoints

### Session Management
- `POST /api/session/create` - Create a new session
- `GET /api/sessions` - Get all sessions (summary)
- `GET /api/session/:id` - Get full session details
- `DELETE /api/session/:id` - Delete a session

### Content Tracking
- `POST /api/session/:id/message` - Add message to session
- `POST /api/session/:id/video` - Add video to session
- `POST /api/session/:id/quiz` - Add quiz result to session

### Session Control
- `POST /api/session/:id/end` - Mark session as ended

## Usage Examples

### View History
1. Click the **🕐 History** button in the sidebar
2. See all past sessions with topic, level, and timestamp
3. Click any session to view full details

### Check Quiz Performance
1. In the history details view, scroll to "Quiz Results"
2. See all quizzes taken with:
   - Score (e.g., 6/8 questions correct)
   - Accuracy percentage
   - Individual question review with correct answers

### Track Learning Progress
- **Overall Accuracy**: Average of all quiz scores in a session
- **Questions Attempted**: Total number of questions answered
- **Videos Watched**: Number of educational videos generated
- **Topics Covered**: Complete list of topics studied

## Example: Complete Session Flow

1. **Start Session** → User clicks "New Session"
   - Session created with ID
   - Topic and difficulty pending

2. **Send Message** → User asks "Explain photosynthesis"
   - Message saved to session
   - Bot responds and message saved

3. **Select Difficulty** → User chooses "bachelors"
   - Difficulty stored
   - Video generation starts

4. **Generate Video** → System creates educational video
   - Video URL saved to session
   - Video displayed to user

5. **Generate Quiz** → User clicks "Generate Quiz"
   - 8 MCQs generated based on content

6. **Submit Quiz** → User answers and submits
   - All answers recorded
   - Score calculated (e.g., 7/8 = 87.5%)
   - Results saved to session

7. **View History** → User clicks History later
   - All session data retrieved
   - Detailed modal shows everything:
     - Messages exchanged
     - Video with playback
     - Quiz with answers and corrections
     - Performance metrics

## Data Privacy & Storage

- All data stored locally on your server
- No external uploads of session data
- History file: `./data/chat-history.json`
- Clear session history by deleting the file (backs up first!)

## Performance Metrics

### Available in History View
- **Total Messages**: Count of all chat messages
- **Video Count**: Number of videos generated
- **Quiz Count**: Number of quizzes completed
- **Average Accuracy**: Across all quizzes in session
- **Individual Scores**: Each quiz's performance

## Troubleshooting

### History Not Saving?
- Check if `data/` directory exists (auto-created)
- Verify `chat-history.json` permissions
- Check browser console for errors

### Videos Not Showing?
- Verify video files still exist in project root
- Check API endpoint `/api/session/:id`
- Videos are cleaned after use (configure in `server.js`)

### Quiz Results Missing?
- Ensure you submitted the quiz (not just answered)
- Check network tab for POST to `/api/session/:id/quiz`
- Data should appear in next history refresh

## Features Coming Soon
- 📤 Export session history as PDF
- 📊 Analytics dashboard with learning trends
- 🔍 Search and filter sessions
- ⭐ Favorite sessions
- 🏆 Achievement badges based on accuracy
