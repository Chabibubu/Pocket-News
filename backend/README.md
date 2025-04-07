# Pocket News Backend

A FastAPI-based backend service for Pocket News that crawls and stores articles from various crypto news sources.

## Features

- Automatic article crawling every 5 minutes
- MongoDB storage for articles
- RESTful API endpoints
- CORS support
- Async processing

## Prerequisites

- Python 3.8+
- MongoDB
- pip (Python package manager)

## Setup

1. Install MongoDB and start the service:
   ```bash
   # macOS (using Homebrew)
   brew install mongodb-community
   brew services start mongodb-community

   # Linux
   sudo apt update
   sudo apt install mongodb
   sudo systemctl start mongodb
   ```

2. Create a virtual environment and activate it:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   - Copy `.env.example` to `.env` (if not already done)
   - Update the variables as needed

## Running the Application

1. Start the FastAPI server:
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```

2. The API will be available at:
   - API Documentation: http://localhost:8000/docs
   - API Base URL: http://localhost:8000/api

## API Endpoints

- `GET /api/articles` - Get paginated articles
  - Query parameters:
    - `skip`: Number of articles to skip (default: 0)
    - `limit`: Number of articles to return (default: 20, max: 100)
    - `source`: Filter by news source (optional)

- `GET /api/trending` - Get trending articles
  - Query parameters:
    - `limit`: Number of articles to return (default: 4, max: 10)

- `GET /health` - Health check endpoint

## Development

The crawler runs automatically every 5 minutes (configurable in .env). It fetches articles from:
- CoinDesk
- CoinTelegraph
- CryptoNews
- NewsBTC

## Error Handling

- The crawler implements retry logic and error handling
- Failed article fetches are logged but don't stop the entire process
- Duplicate articles are automatically detected and skipped
