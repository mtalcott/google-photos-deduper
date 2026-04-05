import React, { useEffect } from "react";
import { GetAllMediaItemsMessageType, GetAllMediaItemsResultMessageType } from "types";

export default function App() {

  const handleGetAllMediaItems = async () => {
    const message: GetAllMediaItemsMessageType = {
      app: "GooglePhotosDeduper",
      action: "getAllMediaItems",
    }
    chrome.runtime.sendMessage(message);
  };

  useEffect(() => {
    const listener = async (event: MessageEvent) => {
      if (
        event.data?.app === "GooglePhotosDeduper" &&
        event.data?.action === "getAllMediaItems.result"
      ) {
        const message: GetAllMediaItemsResultMessageType = event.data;
        console.log("getAllMediaItems.result", message); 
      }
    }
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  return (
    <>
      <h1>Google Photos Deduper</h1>
      <button onClick={handleGetAllMediaItems}>Get all media items</button>
    </>
  );
}


