# SkinSage AI

SkinSage AI is a full-stack AI-powered dermatology application that enables users to analyze skin disease images, interact with an AI-powered dermatology assistant, and receive intelligent clinical insights. The application combines a **React (Vite + TypeScript)** frontend with a **FastAPI** backend, integrating deep learning, JWT authentication, MongoDB, voice interaction, and an AI chatbot.

---

## Features

- Secure User Authentication (JWT)
- AI-Based Skin Disease Detection
- AI Dermatology Chatbot (Groq API)
- Voice Input (Speech Recognition)
- Voice Output (Text-to-Speech)
- Clinical Intelligence Dashboard
- AI Dermatology Workbench
- Image Analysis History
- MongoDB Database Integration
- Responsive User Interface

---

## Technologies Used

| Category | Technologies |
|----------|--------------|
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| Backend | FastAPI, Python |
| Database | MongoDB Atlas |
| Authentication | JWT Authentication |
| AI & Machine Learning | TensorFlow, Keras, Groq API, RAG Chatbot |
| Browser APIs | Web Speech API |
| Version Control | Git, GitHub |

---

## Project Structure

```text
SkinSage AI/
│
├── backend/
│   ├── api.py
│   ├── best_small_model/
│   ├── requirements.txt
│   ├── .env
│   └── ...
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── ...
│
├── .gitignore
└── README.md
```

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB
- Git

---

## Installation

### Clone the Repository

```bash
git clone <your-repository-url>
cd "SkinSage AI"
```

### Backend Setup

Create and activate a virtual environment.

```bash
python -m venv .venv
```

**Windows**

```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**

```bash
source .venv/bin/activate
```

Install dependencies.

```bash
cd backend
pip install -r requirements.txt
```

Create a `backend/.env` file.

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
GROQ_API_KEY=your_groq_api_key
```

Start the backend server.

```bash
uvicorn api:app --reload --host 0.0.0.0 --port 8000
```

Backend:

```
http://localhost:8000
```

Swagger API Documentation:

```
http://localhost:8000/docs
```

---

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend:

```
http://localhost:5173
```

---

## Environment Variables

### Backend

```env
MONGODB_URI=
JWT_SECRET=
GROQ_API_KEY=
```

### Frontend

```env
VITE_API_URL=http://localhost:8000
```

---

## Future Enhancements

- Multi-language support
- Mobile application
- Cloud deployment
- PDF report generation
- Dermatologist appointment booking
- Advanced clinical analytics

---

## Notes

- Login is required to access the dashboard.
- Start the backend before running the frontend.
- Configure MongoDB locally or use MongoDB Atlas.
- Voice features require a browser that supports the Web Speech API.

---

## Author

**Ravi Kumar Kushwaha**

GitHub: https://github.com/Ravikumarkushwaha