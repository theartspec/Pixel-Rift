# NearHelp — Node.js Backend

## Quick Start in VS Code

```bash
# 1. Open this folder in VS Code
# 2. Open the integrated terminal (Ctrl+` or Cmd+`)

# 3. Install dependencies
npm install

# 4. Copy environment file
cp .env.example .env

# 5. Start the server (production)
npm start

# OR start with auto-reload (development)
npm run dev
```

Server starts at: **http://localhost:3000**

---

## Project Structure

```
nearhelp-backend-node/
├── server.js              ← Entry point
├── package.json
├── .env.example           ← Copy to .env
├── nearhelp.db            ← Auto-created SQLite database
├── uploads/               ← Profile picture uploads
├── db/
│   └── database.js        ← DB init + all table schemas
├── middleware/
│   └── auth.js            ← JWT verification middleware
└── routes/
    ├── auth.js            ← Register, login, OTP, Aadhaar
    ├── users.js           ← Profile, settings, location, status
    ├── items.js           ← Lend/borrow listings
    ├── services.js        ← Skill/service listings
    ├── requests.js        ← Help/follow/borrow requests
    ├── drivers.js         ← Driver profiles
    ├── chat.js            ← Messaging
    ├── reviews.js         ← Ratings & feedback
    ├── rewards.js         ← NearPoints & discounts
    ├── notifications.js   ← Push notifications
    └── emergency.js       ← SOS alerts
```

---

## API Reference

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create account | No |
| POST | `/api/auth/verify-otp` | Verify OTP | No |
| POST | `/api/auth/login` | Login | No |
| POST | `/api/auth/forgot-password` | Reset OTP | No |
| POST | `/api/auth/verify-aadhaar` | Aadhaar auth | No |
| GET | `/api/users/me` | Get my profile | ✅ |
| PUT | `/api/users/me` | Update profile | ✅ |
| PUT | `/api/users/me/status` | Set activity status | ✅ |
| PUT | `/api/users/me/location` | Update GPS location | ✅ |
| PUT | `/api/users/me/preferences` | Dark/elderly mode | ✅ |
| POST | `/api/users/me/profile-pic` | Upload/set avatar | ✅ |
| GET | `/api/users/nearby?lat=&lng=&radius=` | Nearby users | ✅ |
| GET | `/api/users/:id` | View profile | ✅ |
| POST | `/api/users/:id/follow` | Send follow request | ✅ |
| GET | `/api/items` | Browse items | ✅ |
| POST | `/api/items` | List item to lend | ✅ |
| PUT | `/api/items/:id` | Edit item | ✅ |
| DELETE | `/api/items/:id` | Remove item | ✅ |
| GET | `/api/services` | Browse services | ✅ |
| POST | `/api/services` | Offer a service | ✅ |
| GET | `/api/requests/incoming` | Incoming requests | ✅ |
| GET | `/api/requests/outgoing` | My sent requests | ✅ |
| POST | `/api/requests` | Send a request | ✅ |
| PUT | `/api/requests/:id/respond` | Accept/decline | ✅ |
| GET | `/api/drivers` | List drivers | ✅ |
| POST | `/api/drivers/register` | Register as driver | ✅ |
| GET | `/api/chat` | Inbox | ✅ |
| GET | `/api/chat/:userId` | Conversation | ✅ |
| POST | `/api/chat/:userId` | Send message | ✅ |
| POST | `/api/reviews` | Submit review | ✅ |
| GET | `/api/rewards/me` | My points & tier | ✅ |
| GET | `/api/rewards/leaderboard` | Top helpers | ✅ |
| GET | `/api/notifications` | My notifications | ✅ |
| PUT | `/api/notifications/read-all` | Mark all read | ✅ |
| POST | `/api/emergency` | SOS alert | ✅ |
| GET | `/api/health` | API health check | No |

---

## Authentication

All protected routes require:
```
Authorization: Bearer <token>
```
Get the token from `/api/auth/login` or `/api/auth/verify-otp`.

---

## Real-Time (Socket.IO)

Connect from frontend:
```javascript
const socket = io('http://localhost:3000');
socket.emit('user:online', userId);
socket.on('chat:receive', (msg) => { /* show message */ });
socket.on('request:notify', (req) => { /* show notification */ });
socket.on('emergency:incoming', (alert) => { /* show SOS */ });
```

---

## Contact
- anuannbiju06@gmail.com
- adheenasnair002@gmail.com
