// const tabs = await chrome.tabs.query({
//   url: [
//     "https://developer.chrome.com/docs/webstore/*",
//     "https://developer.chrome.com/docs/extensions/*",
//   ],
// });

// // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Collator
// const collator = new Intl.Collator();
// tabs.sort((a, b) => collator.compare(a.title, b.title));

// TODO: Follow instructions URL. if not on active results page.

// const template = document.getElementById("li_template");
// const elements = new Set();
// for (const tab of tabs) {
//   const element = template.content.firstElementChild.cloneNode(true);

//   const title = tab.title.split("-")[0].trim();
//   const pathname = new URL(tab.url).pathname.slice("/docs".length);

//   element.querySelector(".title").textContent = title;
//   element.querySelector(".pathname").textContent = pathname;
//   element.querySelector("a").addEventListener("click", async () => {
//     // need to focus window as well as the active tab
//     await chrome.tabs.update(tab.id, { active: true });
//     await chrome.windows.update(tab.windowId, { focused: true });
//   });

//   elements.add(element);
// }
// document.querySelector("ul").append(...elements);
