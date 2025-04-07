# Pocket News Chrome Extension

A Chrome extension that transforms your new tab into a crypto news dashboard, aggregating news from top crypto news sources including CryptoPanic, CoinDesk, CoinSpectator, and CoinTelegraph.

## Features

- Real-time crypto prices for BTC, ETH, and BNB
- News categorized into Trending, Latest, and Analysis sections
- Auto-refresh functionality to keep content up to date
- Clean and modern UI design
- Direct links to original articles

## Installation

1. Clone this repository or download the ZIP file
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Configuration

Before using the extension, you need to add your API keys in the `js/api.js` file:

```javascript
this.apiKeys = {
    cryptopanic: 'YOUR_CRYPTOPANIC_API_KEY',
    coindesk: 'YOUR_COINDESK_API_KEY',
    coinspectator: 'YOUR_COINSPECTATOR_API_KEY',
    cointelegraph: 'YOUR_COINTELEGRAPH_API_KEY'
};
```

To obtain API keys:
- CryptoPanic: Visit https://cryptopanic.com/developers/api/
- CoinDesk: Visit https://www.coindesk.com/api/
- CoinSpectator: Visit https://coinspectator.com/api
- CoinTelegraph: Visit https://cointelegraph.com/api

## Development

The extension is built with vanilla JavaScript and uses modern ES6+ features. The main components are:

- `manifest.json`: Extension configuration
- `index.html`: Main new tab page
- `styles.css`: Styling for the extension
- `js/api.js`: API integration and data fetching
- `js/app.js`: Main application logic

## Auto-Refresh Intervals

- Crypto prices: Every 1 minute
- News content: Every 5 minutes

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- CryptoCompare API for cryptocurrency price data
- All the news sources for their valuable content
- Inspired by Muzli's clean design and functionality 