import feedparser
import aiohttp
import asyncio
from bs4 import BeautifulSoup
from datetime import datetime
from dateutil import parser
from .database import db

class NewsCrawler:
    def __init__(self):
        self.sources = {
            'CoinDesk': 'https://www.coindesk.com/arc/outboundfeeds/rss/',
            'CoinTelegraph': 'https://cointelegraph.com/rss',
            'CryptoNews': 'https://cryptonews.com/news/feed',
            'NewsBTC': 'https://www.newsbtc.com/feed/'
        }
        self.default_image = 'https://placehold.co/600x400/1a1a1a/ffffff?text=Pocket+News'

    async def fetch_feed(self, session, source_name, url):
        try:
            async with session.get(url) as response:
                if response.status == 200:
                    content = await response.text()
                    feed = feedparser.parse(content)
                    
                    for entry in feed.entries[:10]:  # Process latest 10 articles
                        try:
                            # Parse date
                            if hasattr(entry, 'published'):
                                date = parser.parse(entry.published)
                            else:
                                date = datetime.now()

                            # Extract image URL
                            image_url = self.default_image
                            if hasattr(entry, 'media_content'):
                                image_url = entry.media_content[0]['url']
                            elif hasattr(entry, 'links'):
                                for link in entry.links:
                                    if link.get('type', '').startswith('image/'):
                                        image_url = link.href
                                        break

                            article = {
                                'title': entry.title,
                                'description': entry.description,
                                'url': entry.link,
                                'imageUrl': image_url,
                                'source': source_name,
                                'timestamp': int(date.timestamp() * 1000)
                            }

                            await db.save_article(article)
                            print(f"Processed article: {article['title']}")

                        except Exception as e:
                            print(f"Error processing article from {source_name}: {str(e)}")

        except Exception as e:
            print(f"Error fetching feed from {source_name}: {str(e)}")

    async def crawl_all_sources(self):
        print("Starting crawl...")
        async with aiohttp.ClientSession() as session:
            tasks = []
            for source_name, url in self.sources.items():
                task = self.fetch_feed(session, source_name, url)
                tasks.append(task)
            await asyncio.gather(*tasks)
        print("Crawl completed!")

crawler = NewsCrawler()
