class NewsApp {
    constructor() {
        this.api = new NewsAPI();
        this.newsContainers = {
            trending: document.querySelector('#trending .news-grid'),
            allNews: document.querySelector('#all-news .news-grid')
        };
        this.cryptoPricesContainer = document.querySelector('.crypto-prices');
        this.searchInput = document.querySelector('#searchInput');
        this.searchButton = document.querySelector('#searchButton');
        this.allArticles = [];
        this.currentPlatform = 'home';
        this.analytics = this.initAnalytics();
        
        this.init();
    }

    initAnalytics() {
        // Check if Amplitude is available
        if (typeof amplitude === 'undefined') {
            console.warn('Amplitude not loaded');
            return {
                trackEvent: (category, action, label = null) => {
                    console.log('Event tracked (fallback):', { category, action, label });
                }
            };
        }

        return {
            trackEvent: (category, action, label = null, properties = {}) => {
                try {
                    // Combine all event data
                    const eventProperties = {
                        category,
                        action,
                        label,
                        url: window.location.href,
                        timestamp: new Date().toISOString(),
                        ...properties
                    };

                    // Create event name from category and action
                    const eventName = `${category}_${action}`.toLowerCase();

                    // Send event to Amplitude
                    amplitude.track(eventName, eventProperties);

                    // Log for debugging
                    console.debug('Amplitude event:', eventName, eventProperties);
                } catch (error) {
                    console.error('Error tracking event:', error);
                }
            },

            // Track page view
            trackPageView: (pageName = 'home') => {
                try {
                    amplitude.track('page_view', {
                        page: pageName,
                        url: window.location.href,
                        referrer: document.referrer,
                        timestamp: new Date().toISOString()
                    });
                } catch (error) {
                    console.error('Error tracking page view:', error);
                }
            },

            // Track user properties
            setUserProperties: (properties) => {
                try {
                    const identify = new amplitude.Identify();
                    Object.entries(properties).forEach(([key, value]) => {
                        identify.set(key, value);
                    });
                    amplitude.identify(identify);
                } catch (error) {
                    console.error('Error setting user properties:', error);
                }
            }
        };
    }

    async init() {
        console.log('Initializing app...');
        // Track initial page view
        this.analytics.trackPageView();
        
        // Set initial user properties
        this.analytics.setUserProperties({
            app_version: '1.0.0',
            platform: 'web',
            initial_visit_time: new Date().toISOString()
        });

        // Set up price updates
        this.api.onPriceUpdate(prices => {
            console.log('Received price update:', prices);
            this.updatePriceDisplay(prices);
        });

        // Initial news fetch
        await this.updateNews();
        
        this.setupPlatformListeners();
        this.setupSearchListeners();
        this.setupArticleClickTracking();
        this.startAutoRefresh();
        
        this.analytics.trackEvent('App', 'Initialize', null, {
            news_sources: Object.keys(this.api.sources),
            tracked_cryptocurrencies: Object.keys(this.api.cryptoIds)
        });
    }

    setupArticleClickTracking() {
        document.addEventListener('click', (e) => {
            const newsItem = e.target.closest('.news-item');
            if (newsItem) {
                const title = newsItem.querySelector('.title').textContent;
                const source = newsItem.querySelector('.source').textContent;
                const author = newsItem.querySelector('.author').textContent;
                const timeAgo = newsItem.querySelector('.time').textContent;
                
                this.analytics.trackEvent('Article', 'Click', `${source} - ${title}`, {
                    article_title: title,
                    article_source: source,
                    article_author: author,
                    article_age: timeAgo,
                    article_url: newsItem.href
                });
            }
        });
    }

    setupPlatformListeners() {
        const platformItems = document.querySelectorAll('.platform-catalog li');
        platformItems.forEach(item => {
            item.addEventListener('click', () => {
                platformItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                this.currentPlatform = item.dataset.platform;
                this.filterNewsByPlatform();
                
                this.analytics.trackEvent('Platform', 'Switch', this.currentPlatform, {
                    articles_count: this.allArticles.filter(
                        article => article.source === this.getPlatformName(this.currentPlatform)
                    ).length
                });
            });
        });
    }

    setupSearchListeners() {
        this.searchButton.addEventListener('click', () => this.filterNewsByPlatform());
        this.searchInput.addEventListener('keyup', (e) => {
            if (e.key === 'Enter') {
                this.filterNewsByPlatform();
                this.analytics.trackEvent('Search', 'Enter Press', this.searchInput.value, {
                    search_term: this.searchInput.value,
                    results_count: this.getSearchResultsCount()
                });
            }
        });
    }

    getSearchResultsCount() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        return this.allArticles.filter(article =>
            article.title.toLowerCase().includes(searchTerm)
        ).length;
    }

    filterNewsByPlatform() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        let filteredArticles = [...this.allArticles];

        // Filter by platform
        if (this.currentPlatform !== 'home') {
            const platformName = this.getPlatformName(this.currentPlatform);
            filteredArticles = filteredArticles.filter(article => 
                article.source === platformName
            );
        }

        // Filter by search term
        if (searchTerm) {
            filteredArticles = filteredArticles.filter(article =>
                article.title.toLowerCase().includes(searchTerm)
            );
            document.querySelector('#all-news h2').textContent = 
                `Found ${filteredArticles.length} results for "${searchTerm}"`;
            document.querySelector('#trending').style.display = 'none';
        } else {
            document.querySelector('#all-news h2').textContent = 'Latest Articles';
            document.querySelector('#trending').style.display = 'block';
        }

        this.updateNewsSection('allNews', filteredArticles);
        if (!searchTerm && this.currentPlatform === 'home') {
            this.updateNewsSection('trending', this.getTrendingNews(filteredArticles));
            
            // Track trending news update
            this.analytics.trackEvent('News', 'Trending Update', null, {
                trending_count: filteredArticles.length
            });
        }

        // Track filtering
        this.analytics.trackEvent('News', 'Filter', null, {
            platform: this.currentPlatform,
            search_term: searchTerm,
            results_count: filteredArticles.length
        });
    }

    getPlatformName(platform) {
        switch (platform) {
            case 'coindesk': return 'CoinDesk';
            case 'cointelegraph': return 'CoinTelegraph';
            case 'cryptonews': return 'CryptoNews';
            case 'newsbtc': return 'NewsBTC';
            default: return null;
        }
    }

    startAutoRefresh() {
        // Update news every 2 minutes
        setInterval(() => {
            console.log('Auto-refreshing news...');
            this.updateNews();
        }, 120000);
    }

    async updateCryptoPrices() {
        try {
            const prices = await this.api.fetchCryptoPrices();
            if (!prices) {
                this.cryptoPricesContainer.innerHTML = '<div class="error">Unable to load prices</div>';
                return;
            }

            this.cryptoPricesContainer.innerHTML = Object.entries(prices)
                .map(([symbol, data]) => {
                    const changeClass = data.change24h >= 0 ? 'price-up' : 'price-down';
                    const changeIcon = data.change24h >= 0 ? '↑' : '↓';
                    const iconUrls = {
                        'BTC': 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
                        'ETH': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
                        'XRP': 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png'
                    };
                    return `
                        <div class="crypto-price-item">
                            <div class="crypto-info">
                                <img src="${iconUrls[symbol]}" alt="${symbol}" class="crypto-icon">
                                <span class="symbol">${symbol}</span>
                            </div>
                            <div class="price-info">
                                <span class="price">$${data.price.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                })}</span>
                                <span class="change ${changeClass}">
                                    ${changeIcon} ${Math.abs(data.change24h).toFixed(2)}%
                                </span>
                            </div>
                        </div>
                    `;
                }).join('');
        } catch (error) {
            console.error('Error updating crypto prices:', error);
            this.cryptoPricesContainer.innerHTML = '<div class="error">Failed to load prices</div>';
        }
    }

    async updateNews() {
        try {
            console.log('Fetching news...');
            this.showLoading();
            
            const allNews = await this.api.fetchNews();
            console.log('Fetched news:', allNews);
            
            if (allNews && allNews.length > 0) {
                this.allArticles = allNews;
                this.filterNewsByPlatform();
                
                // Track successful news fetch
                this.analytics.trackEvent('News', 'Fetch Success', null, {
                    articles_count: allNews.length,
                    sources: [...new Set(allNews.map(article => article.source))]
                });
            } else {
                console.log('No news articles returned');
                this.handleNewsError('No articles available at this time. Please try again later.');
            }
        } catch (error) {
            console.error('Error updating news:', error);
            this.handleNewsError('Failed to load news. Please check your internet connection and try again.');
            
            // Track error
            this.analytics.trackEvent('News', 'Fetch Error', error.message);
        }
    }

    showLoading() {
        Object.values(this.newsContainers).forEach(container => {
            if (container) {
                container.innerHTML = `
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        <p>Loading articles...</p>
                    </div>
                `;
            }
        });
    }

    handleNewsError(message) {
        Object.values(this.newsContainers).forEach(container => {
            if (container) {
                container.innerHTML = `
                    <div class="error">
                        <p>${message}</p>
                        <button onclick="window.app.retryNewsLoad()" class="retry-button">
                            Try Again
                        </button>
                    </div>
                `;
            }
        });
    }

    async retryNewsLoad() {
        await this.updateNews();
    }

    updateNewsSection(section, articles) {
        const container = this.newsContainers[section];
        if (!container) {
            console.error(`Container for ${section} not found`);
            return;
        }

        console.log(`Updating ${section} with ${articles.length} articles`);
        
        if (articles.length === 0) {
            container.innerHTML = `
                <div class="no-content">
                    <p>No articles available.</p>
                    <button onclick="window.app.retryNewsLoad()" class="retry-button">
                        Refresh
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = articles.map(article => this.renderArticle(article)).join('');
    }

    getTrendingNews(articles) {
        return articles.slice(0, 4);
    }

    getTimeAgo(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        
        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };
        
        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
            }
        }
        
        return 'Just now';
    }

    renderArticle(article) {
        const timeAgo = this.getTimeAgo(article.timestamp);
        
        return `
            <a href="${article.url}" target="_blank" class="news-item" rel="noopener noreferrer">
                <div class="article-cover">
                    <img src="${article.coverImage}" alt="${article.title}" 
                         onerror="this.onerror=null; this.src='${this.api.defaultImage}';">
                </div>
                <div class="news-content">
                    <span class="source">${article.source}</span>
                    <h3 class="title">${article.title}</h3>
                    <div class="article-footer">
                        <span class="author">${article.author}</span>
                        <span class="time">${timeAgo}</span>
                    </div>
                </div>
            </a>
        `;
    }

    updatePriceDisplay(prices) {
        if (!prices || Object.keys(prices).length === 0) {
            this.cryptoPricesContainer.innerHTML = '<div class="error">Unable to load prices</div>';
            return;
        }

        const iconUrls = {
            'BTC': 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
            'ETH': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
            'XRP': 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png'
        };

        this.cryptoPricesContainer.innerHTML = Object.entries(prices)
            .map(([symbol, data]) => {
                const changeClass = data.change24h >= 0 ? 'price-up' : 'price-down';
                const changeIcon = data.change24h >= 0 ? '↑' : '↓';
                return `
                    <div class="crypto-price-item">
                        <div class="crypto-info">
                            <img src="${iconUrls[symbol]}" alt="${symbol}" class="crypto-icon">
                            <span class="symbol">${symbol}</span>
                        </div>
                        <div class="price-info">
                            <span class="price">$${data.price.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            })}</span>
                            <span class="change ${changeClass}">
                                ${changeIcon} ${Math.abs(data.change24h).toFixed(2)}%
                            </span>
                        </div>
                    </div>
                `;
            }).join('');

        this.analytics.trackEvent('Prices', 'Update', 
            Object.entries(prices)
                .map(([symbol, data]) => `${symbol}:${data.price}`)
                .join(',')
        );
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new NewsApp();
}); 