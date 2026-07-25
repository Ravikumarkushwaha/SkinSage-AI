# MongoDB & Auth environment variables

Add these to your `.env` file (in project root or in `backend/`):

```env
# MongoDB Atlas (Compass) – use your own connection string
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/dermai?retryWrites=true&w=majority

# JWT secret for login tokens (use a long random string in production)
JWT_SECRET=your-secret-key-at-least-32-chars
```

- Replace `USER`, `PASSWORD`, and `CLUSTER` with your Atlas credentials. The database name `dermai` is set in the code; you can change it in `backend/database.py` if needed.
- Keep `JWT_SECRET` private and use a strong value in production.
