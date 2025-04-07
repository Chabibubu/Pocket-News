class NewsAPI {
    constructor() {
        this.API_BASE_URL = 'http://127.0.0.1:8000';
        this.defaultImage = 'https://placehold.co/600x400/1a1a1a/ffffff?text=Pocket+News';
        this.COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
        this.BACKUP_API_URL = 'https://api.coincap.io/v2';
        this.BINANCE_API_URL = 'https://api.binance.com/api/v3';
        this.cryptoIds = {
            'BTC': 'bitcoin',
            'ETH': 'ethereum',
            'XRP': 'ripple'
        };
        this.cryptoPairs = {
            'BTC': 'BTCUSDT',
            'ETH': 'ETHUSDT',
            'XRP': 'XRPUSDT'
        };
        this.priceCallbacks = new Set();
        this.lastPrices = {};
        this.lastPriceFetch = 0;
        this.minFetchInterval = 10000;
        this.currentAPI = 0; // 0: CoinGecko, 1: CoinCap, 2: Binance
        this.APIs = ['CoinGecko', 'CoinCap', 'Binance'];
        this.retryDelay = 2000;
        this.maxRetries = 5;
        this.retryCount = 0;
        this.usingBackupAPI = false;

        // API request queue
        this.requestQueue = [];
        this.isProcessingQueue = false;

        // Sources configuration with rate limits and backup URLs
        this.sources = {
            'CoinDesk': {
                type: 'rss',
                url: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
                backupUrl: 'https://www.coindesk.com/feed',
                rateLimit: 60000
            },
            'CoinTelegraph': {
                type: 'rss',
                url: 'https://cointelegraph.com/rss',
                backupUrl: 'https://cointelegraph.com/feed',
                rateLimit: 60000
            },
            'CryptoNews': {
                type: 'rss',
                url: 'https://cryptonews.com/news/feed',
                backupUrl: 'https://cryptonews.net/feed/',
                rateLimit: 60000
            },
            'NewsBTC': {
                type: 'rss',
                url: 'https://www.newsbtc.com/feed/',
                backupUrl: 'https://www.newsbtc.com/feed',
                rateLimit: 60000
            }
        };

        // Track last fetch time for each source
        this.lastSourceFetch = {};
        Object.keys(this.sources).forEach(source => {
            this.lastSourceFetch[source] = 0;
        });

        // CORS proxies
        this.corsProxies = [
            'https://api.allorigins.win/raw?url=',
            'https://corsproxy.io/?',
            'https://cors-anywhere.herokuapp.com/'
        ];

        // Start price updates
        this.startPriceUpdates();
    }

    async processRequestQueue() {
        if (this.isProcessingQueue) return;
        this.isProcessingQueue = true;

        while (this.requestQueue.length > 0) {
            const { url, options, resolve, reject } = this.requestQueue.shift();
            try {
                const now = Date.now();
                const timeSinceLastFetch = now - this.lastPriceFetch;
                
                if (timeSinceLastFetch < this.minFetchInterval) {
                    await new Promise(r => setTimeout(r, this.minFetchInterval - timeSinceLastFetch));
                }

                const response = await fetch(url, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Accept': 'application/json',
                        'Cache-Control': 'no-cache'
                    }
                });

                if (!response.ok) {
                    if (response.status === 429) {
                        // Rate limit hit - increase delay
                        this.minFetchInterval = Math.min(this.minFetchInterval * 2, 30000);
                        throw new Error('Rate limit exceeded');
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                // Reset fetch interval if successful
                this.minFetchInterval = 5000;
                this.lastPriceFetch = Date.now();
                this.retryCount = 0;

                const data = await response.json();
                resolve(data);
            } catch (error) {
                console.error('API request failed:', error);
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.requestQueue.unshift({ url, options, resolve, reject });
                    await new Promise(r => setTimeout(r, this.retryDelay * this.retryCount));
                } else {
                    reject(error);
                }
            }
        }

        this.isProcessingQueue = false;
    }

    async safeRequest(url, options = {}) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ url, options, resolve, reject });
            this.processRequestQueue();
        });
    }

    onPriceUpdate(callback) {
        this.priceCallbacks.add(callback);
        // Return cleanup function
        return () => this.priceCallbacks.delete(callback);
    }

    startPriceUpdates() {
        // Initial price fetch
        this.fetchAndNotifyPrices();
        
        // Set up regular polling
        setInterval(() => this.fetchAndNotifyPrices(), 10000);
    }

    async fetchAndNotifyPrices() {
        try {
            const prices = await this.fetchPricesFromCoinGecko();
            if (prices && Object.keys(prices).length > 0) {
                // Update last prices and notify callbacks
                Object.entries(prices).forEach(([symbol, data]) => {
                    this.lastPrices[symbol] = data.price;
                });
                this.priceCallbacks.forEach(callback => callback(prices));
            }
        } catch (error) {
            console.error('Error fetching prices:', error);
            this.priceCallbacks.forEach(callback => callback(null));
        }
    }

    async fetchPricesFromCoinGecko() {
        const now = Date.now();
        if (now - this.lastPriceFetch < this.minFetchInterval) {
            await new Promise(r => setTimeout(r, this.minFetchInterval - (now - this.lastPriceFetch)));
        }

        const response = await fetch(
            `${this.COINGECKO_API_URL}/simple/price?ids=${Object.values(this.cryptoIds).join(',')}&vs_currencies=usd&include_24hr_change=true`,
            {
                headers: {
                    'Accept': 'application/json'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`CoinGecko API error: ${response.status}`);
        }

        const data = await response.json();
        this.lastPriceFetch = Date.now();

        const prices = {};
        for (const [symbol, id] of Object.entries(this.cryptoIds)) {
            if (data[id]) {
                prices[symbol] = {
                    price: data[id].usd,
                    change24h: data[id].usd_24h_change
                };
            }
        }

        return prices;
    }

    async fetchPricesFromCoinCap() {
        const prices = {};
        
        // Fetch each asset individually to avoid rate limits
        for (const [symbol, id] of Object.entries(this.cryptoIds)) {
            try {
                const response = await fetch(`${this.BACKUP_API_URL}/assets/${id}`);
                if (!response.ok) {
                    throw new Error(`CoinCap API error: ${response.status}`);
                }
                
                const data = await response.json();
                if (data.data) {
                    prices[symbol] = {
                        price: parseFloat(data.data.priceUsd),
                        change24h: parseFloat(data.data.changePercent24Hr)
                    };
                }
                
                // Add small delay between requests
                await new Promise(r => setTimeout(r, 200));
            } catch (error) {
                console.error(`Error fetching ${symbol} price from CoinCap:`, error);
            }
        }

        return prices;
    }

    async fetchPricesFromBinance() {
        const prices = {};
        
        for (const [symbol, pair] of Object.entries(this.cryptoPairs)) {
            try {
                const response = await fetch(`${this.BINANCE_API_URL}/ticker/24hr?symbol=${pair}`);
                if (!response.ok) {
                    throw new Error(`Binance API error: ${response.status}`);
                }
                
                const data = await response.json();
                prices[symbol] = {
                    price: parseFloat(data.lastPrice),
                    change24h: parseFloat(data.priceChangePercent)
                };
                
                // Small delay between requests
                await new Promise(r => setTimeout(r, 100));
            } catch (error) {
                console.error(`Error fetching ${symbol} price from Binance:`, error);
            }
        }
        
        return prices;
    }

    async fetchNews(source = null) {
        try {
            const url = new URL(`${this.API_BASE_URL}/api/news`);
            if (source) {
                url.searchParams.append('source', source);
            }

            const response = await fetch(url.toString());
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            return data.articles;
        } catch (error) {
            console.error('Error fetching news:', error);
            throw error;
        }
    }

    removeDuplicateArticles(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const key = article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    async fetchSourceNews(sourceName) {
        const source = this.sources[sourceName];
        if (!source) return [];

        try {
            const now = Date.now();
            const timeSinceLastFetch = now - (this.lastSourceFetch[sourceName] || 0);
            
            if (timeSinceLastFetch < source.rateLimit) {
                console.log(`Skipping ${sourceName} fetch due to rate limit`);
                return [];
            }

            this.lastSourceFetch[sourceName] = now;

            // Try direct fetch first
            try {
                console.log(`Trying direct fetch for ${sourceName} from ${source.url}`);
                const response = await fetch(source.url, {
                    headers: {
                        'Accept': 'application/rss+xml, application/xml, text/xml, application/json',
                    }
                });
                
                if (response.ok) {
                    const xmlText = await response.text();
                    const articles = await this.parseRSSFeed(xmlText, sourceName);
                    if (articles.length > 0) {
                        console.log(`Successfully fetched ${articles.length} articles directly from ${sourceName}`);
                        return articles;
                    }
                }
            } catch (directError) {
                console.log(`Direct fetch failed for ${sourceName}:`, directError);
            }

            // If direct fetch fails, try each CORS proxy
            for (const proxy of this.corsProxies) {
                try {
                    const proxyUrl = `${proxy}${encodeURIComponent(source.url)}`;
                    console.log(`Trying ${sourceName} with proxy: ${proxy}`);
                    
                    const response = await fetch(proxyUrl, {
                        headers: {
                            'Accept': 'application/rss+xml, application/xml, text/xml, application/json',
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const xmlText = await response.text();
                    console.log(`Successfully fetched content from ${sourceName} using ${proxy}`);
                    
                    const articles = await this.parseRSSFeed(xmlText, sourceName);
                    if (articles.length === 0) {
                        throw new Error('No articles found in feed');
                    }
                    
                    console.log(`Successfully parsed ${articles.length} articles from ${sourceName}`);
                    return articles;
                } catch (proxyError) {
                    console.warn(`Proxy ${proxy} failed for ${sourceName}:`, proxyError);
                    continue;
                }
            }

            // If all proxies fail, try backup URL
            if (source.backupUrl) {
                console.log(`Trying backup URL for ${sourceName}: ${source.backupUrl}`);
                for (const proxy of this.corsProxies) {
                    try {
                        const backupProxyUrl = `${proxy}${encodeURIComponent(source.backupUrl)}`;
                        const backupResponse = await fetch(backupProxyUrl, {
                            headers: {
                                'Accept': 'application/rss+xml, application/xml, text/xml, application/json',
                            }
                        });
                        
                        if (backupResponse.ok) {
                            const backupXmlText = await backupResponse.text();
                            const articles = await this.parseRSSFeed(backupXmlText, sourceName);
                            if (articles.length > 0) {
                                console.log(`Successfully fetched ${articles.length} articles from ${sourceName} backup URL`);
                                return articles;
                            }
                        }
                    } catch (backupError) {
                        console.warn(`Backup URL with proxy ${proxy} failed for ${sourceName}:`, backupError);
                    }
                }
            }

            throw new Error('All fetch attempts failed');
        } catch (error) {
            console.error(`Error fetching from ${sourceName}:`, error);
            return [];
        }
    }

    parseRSSFeed(xmlText, source) {
        try {
            console.log(`Parsing RSS feed for ${source}...`);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            
            // Check for parsing errors
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error(`XML parsing error for ${source}:`, parseError.textContent);
                return [];
            }

            const items = xmlDoc.querySelectorAll('item');
            console.log(`Found ${items.length} items in RSS feed for ${source}`);
            
            const articles = Array.from(items)
                .map(item => {
                    try {
                        const title = item.querySelector('title')?.textContent?.trim();
                        const url = item.querySelector('link')?.textContent?.trim();
                        const pubDate = item.querySelector('pubDate')?.textContent;
                        const author = item.querySelector('dc\\:creator, creator')?.textContent?.trim() || source;
                        
                        // Skip items without required fields
                        if (!title || !url) {
                            console.warn(`Skipping RSS item without title or URL for ${source}`);
                            return null;
                        }

                        // Extract image from content or enclosure
                        const coverImage = this.extractImageFromRSS(item) || this.defaultImage;
                        
                        return {
                            title,
                            url,
                            source,
                            timestamp: pubDate ? new Date(pubDate).getTime() : Date.now(),
                            author,
                            coverImage
                        };
                    } catch (itemError) {
                        console.error(`Error processing RSS item for ${source}:`, itemError);
                        return null;
                    }
                })
                .filter(item => item !== null);

            console.log(`Successfully parsed ${articles.length} valid articles from ${source}`);
            return articles;
        } catch (error) {
            console.error(`Error parsing RSS feed for ${source}:`, error);
            return [];
        }
    }

    extractImageFromRSS(item) {
        try {
            // Try media:content
            const mediaContent = item.querySelector('media\\:content, content');
            if (mediaContent?.getAttribute('url')) {
                return mediaContent.getAttribute('url');
            }

            // Try enclosure
            const enclosure = item.querySelector('enclosure');
            if (enclosure?.getAttribute('url') && enclosure.getAttribute('type')?.startsWith('image/')) {
                return enclosure.getAttribute('url');
            }

            // Try content:encoded
            const content = item.querySelector('content\\:encoded, encoded')?.textContent || '';
            let imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) {
                return imgMatch[1];
            }

            // Try description
            const description = item.querySelector('description')?.textContent || '';
            imgMatch = description.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch) {
                return imgMatch[1];
            }

            return null;
        } catch (error) {
            console.error('Error extracting image from RSS:', error);
            return null;
        }
    }
} 