import type { PlasmoMessaging } from "@plasmohq/messaging"

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const appTab = await chrome.tabs.create({ url: "/" })
}

export default handler
