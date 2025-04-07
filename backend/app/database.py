from motor.motor_asyncio import AsyncIOMotorClient
from os import getenv
from dotenv import load_dotenv

load_dotenv()

class Database:
    client: AsyncIOMotorClient = None
    db = None

    async def connect_db(self):
        self.client = AsyncIOMotorClient(getenv("MONGODB_URL"))
        self.db = self.client[getenv("DATABASE_NAME")]
        print("Connected to MongoDB!")

    async def close_db(self):
        if self.client:
            self.client.close()
            print("MongoDB connection closed.")

    async def get_articles(self, skip: int = 0, limit: int = 20, source: str = None):
        query = {} if source is None else {"source": source}
        cursor = self.db.articles.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        return await cursor.to_list(length=limit)

    async def save_article(self, article: dict):
        # Check if article already exists
        existing = await self.db.articles.find_one({"url": article["url"]})
        if not existing:
            await self.db.articles.insert_one(article)
            return True
        return False

db = Database()
