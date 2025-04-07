from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from os import getenv
from dotenv import load_dotenv
from .database import db
from .crawler import crawler

load_dotenv()

app = FastAPI(title="Pocket News API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    await db.connect_db()
    # Start the crawler scheduler
    scheduler = AsyncIOScheduler()
    scheduler.add_job(crawler.crawl_all_sources, 'interval', 
                     seconds=int(getenv("CRAWLER_INTERVAL", "300")))
    scheduler.start()

@app.on_event("shutdown")
async def shutdown_event():
    await db.close_db()

# API endpoints
@app.get("/api/articles")
async def get_articles(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    source: str = Query(default=None)
):
    articles = await db.get_articles(skip=skip, limit=limit, source=source)
    return {"articles": articles}

@app.get("/api/trending")
async def get_trending_articles(
    limit: int = Query(default=4, ge=1, le=10)
):
    # Get latest articles from the last 12 hours
    articles = await db.get_articles(limit=limit)
    return {"articles": articles}

# Health check endpoint
@app.get("/health")
async def health_check():
    return {"status": "ok"}
