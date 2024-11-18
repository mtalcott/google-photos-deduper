import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

export const config: PlasmoCSConfig = {
    matches: ["https://photos.google.com/*"]
  }

// Add GPD button to page
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    addButtonToPage();
  });
} else {
  addButtonToPage();
}

function addButtonToPage() {
  const button = document.createElement('button');
  button.innerText = 'Launch Google Photos Deduper';
  button.id = 'launch-gpd-button';
  button.style.position = 'fixed';
  button.style.top = '21px';
  button.style.right = '350px';
  button.style.zIndex = "200";

  button.addEventListener('click', () => {
    launchApp();
  });

  document.body.appendChild(button);
  console.debug("GPD: Added button to page", button);
}

function launchApp() {
  sendToBackground({
    name: "launch-gpd"
  })
}