## Getting Started

### Setup

1. Follow the instructions from the [main README](../README.md) to get the rest of the project up and running.
1. `cd chrome_extension`
1. `npm run build`
1. [Load the unpacked extension](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked) from `chrome_extension/dist`.
   - Go to your [Chrome Extensions page](chrome://extensions/).
   - Enable "Developer mode" by toggling the switch on the top right corner of the page.
   - Click on "Load unpacked" button, select the `chrome_extension/dist` directory from this project. Google Photos Deduper should now appear as an extension in the list.
