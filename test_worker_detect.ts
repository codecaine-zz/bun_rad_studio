
  console.log("In worker. postMessage:", typeof postMessage, "window:", typeof window);
  if (typeof postMessage === "function") {
    postMessage({ fromWorker: true });
  }
