# MongoDB connection (async via Motor)
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = "dermai"

client = AsyncIOMotorClient(MONGODB_URI)
db = client[DB_NAME]
users_collection = db["users"]
conversations_collection = db["conversations"]
