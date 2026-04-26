# Chat History Setup Guide

## What's New?

Your Lumina Learn application now has **comprehensive chat history** that captures everything:
- ✅ Full conversation messages
- ✅ All generated videos
- ✅ Quiz questions and answers  
- ✅ Accuracy scores and performance metrics
- ✅ Complete session details

## Getting Started

### 1. **No Installation Needed**
The system is already integrated. Just start your server as normal:
```bash
npm start
# or
node server.js
```

### 2. **New Files Created**
- `chat-history.js` - Backend storage module
- `data/chat-history.json` - Automatic history database (created on first session)
- `HISTORY_FEATURE.md` - Full documentation

### 3. **Using the History Feature**

#### **During a Session**
Everything happens automatically:
- Each chat creates a new session
- Messages are tracked
- Videos are recorded
- Quiz results are saved with accuracy

#### **Viewing History**
1. Click **🕐 History** in the sidebar
2. See all past sessions listed
3. Click any session to view:
   - 📊 Stats (message count, videos, quizzes, avg accuracy)
   - 💬 Full chat conversation with timestamps
   - 🎥 All generated videos (with playback)
   - 📝 All quizzes with scores and answer review
   - ✅/❌ Correct vs incorrect answers for each question

## Data Structure

Each session stores:
```
{
  id: "unique session ID",
  topic: "What you learned",
  difficulty: "school/bachelors/masters",
  startTime: "2024-04-21T10:30:00Z",
  endTime: "2024-04-21T10:45:00Z",
  uploadedFile: "filename.pdf or null",
  
  messages: [
    { id, role: "user"|"bot", content, timestamp },
    ...
  ],
  
  videos: [
    { id, url: "/output_timestamp.mp4", generatedAt },
    ...
  ],
  
  quizzes: [
    {
      id,
      questions: [...],
      userAnswers: [...],
      score: "6/8",
      accuracy: "75%",
      completedAt
    },
    ...
  ]
}
```

## API Endpoints

The system adds these new endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/session/create` | Create new session |
| GET | `/api/sessions` | Get all sessions (summary) |
| GET | `/api/session/:id` | Get full session details |
| POST | `/api/session/:id/message` | Add message |
| POST | `/api/session/:id/video` | Add video |
| POST | `/api/session/:id/quiz` | Add quiz result |
| POST | `/api/session/:id/end` | End session |
| DELETE | `/api/session/:id` | Delete session |

## Example Flow

```
1. User clicks "New Session"
   └─ Session created with ID

2. User: "Teach me photosynthesis"
   └─ Message saved to history

3. Bot: "Great choice! What level..."
   └─ Bot message saved

4. User selects "Bachelors" level
   └─ Video generated and saved

5. User: "Generate Quiz"
   └─ 8 MCQs shown

6. User submits answers
   └─ Quiz results saved with accuracy

7. User clicks History tab
   └─ Full session displayed with all details!
```

## What Gets Tracked?

✅ **Messages**
- Every message you send
- Every response from the bot
- Exact timestamps
- Message content

✅ **Videos**
- URL for playback
- Generation timestamp
- Scene information

✅ **Quizzes**
- All 8 questions
- Your answers for each
- Correct answers
- Score (X/8)
- Accuracy percentage

✅ **Session Info**
- Topic studied
- Difficulty level
- Start & end times
- Files uploaded

## Storage Location

All history stored in: `data/chat-history.json`

This is a simple JSON file that:
- Auto-creates on first session
- Stores locally on your server
- Is human-readable
- Can be backed up easily

## Features

### View Full Conversation
Click a session in History to see the complete chat transcript with:
- Who said what
- Exact time each message was sent
- Clear formatting (user vs bot)

### Review Quiz Performance
For each quiz in a session:
- See your score (e.g., 6/8)
- See accuracy percentage
- Review your answers vs correct answers
- Learn from mistakes

### Track Learning Progress
- Average accuracy across all quizzes
- Number of topics studied
- Total study time
- Video count per session

## Troubleshooting

**Q: Where is history stored?**  
A: In `data/chat-history.json` on your server

**Q: Can I delete old sessions?**  
A: Yes, via the API or by editing the JSON file

**Q: Does history save automatically?**  
A: Yes, everything is saved in real-time

**Q: Can I export my history?**  
A: Currently saved as JSON. Manual export via file system. (PDF export coming soon!)

**Q: What if I clear my browser?**  
A: Server history is unaffected - stored on disk, not in browser storage

## Next Steps

1. Start a learning session normally
2. Complete a quiz
3. Click History tab
4. Click on your session to see all details
5. Review your answers and performance!

Enjoy your comprehensive learning history! 🎉
