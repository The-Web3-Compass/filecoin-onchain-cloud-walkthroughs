# Part 3: The Custom Video Player

We have arrived at the "Last Mile."

You have a scalable ingestion pipeline for massive assets (Part 1). You have a high-performance streaming proxy following international standards (Part 2). 

But to the end-user, none of that exists. To them, your entire engineering architecture is just a generic "Play" button. If that button doesn't work instantly, or if the granular seeking feels "janky," they assume the system is broken.

In this final module, we will build the interface that proves your architecture works. And we're going to do it by leveraging the **the Native Web Platform**.

---

## The "Native" Philosophy

Many developers rush to install heavy libraries like `Video.js` or `ReactPlayer` to handle streaming. While those tools are powerful, they often add hundreds of kilobytes of JavaScript overhead just to wrap functionality that the browser already provides.

The HTML5 `<video>` element is a marvel of engineering. It comes pre-packaged with:
-   **Hardware Acceleration**: GPU-assisted decoding for smooth 4K playback.
-   **Adaptive Buffering**: Intelligent network sensing to prevent stalls.
-   **RFC 7233 Compliance**: Native support for the range requests we built in Part 2.

Because our backend follows the byte-range standards, the native player will "just work" with sub-second latency.

---

---

## Step 1: The Receiver (`player.html`)

The final piece of our architecture is the **Receiver**. This is a standalone HTML file that provides the interface for both uploading media and streaming it back.

> [!IMPORTANT]
> To save time and ensure the UI looks premium, you should download the pre-designed `player.html` from our [Code Reference](https://github.com/The-Web3-Compass/filecoin-onchain-cloud-walkthroughs/tree/main/fast-delivery/streaming-large-files/code/player.html) and save it in your project root.

### The Layout: `player.html` (Structure & Style)

```html
<div class="container">
    <header>
        <h1>Decentralized Cinema</h1>
        <p>Streaming 4K media directly from Filecoin Beam.</p>
    </header>

    <!-- The Playback Engine -->
    <section class="card viewer">
        <div class="input-group">
            <input type="text" id="pieceCid" placeholder="Enter PieceCID (e.g. baga...)">
            <button onclick="streamMedia()">Stream Now</button>
        </div>
        
        <div class="video-wrapper">
            <video id="player" controls poster="poster.jpg"></video>
            <div id="loadingOverlay" class="hidden">Negotiating Stream...</div>
        </div>
    </section>

    <!-- The Ingestion Zone -->
    <section class="card ingestion">
        <h3>Upload New Asset</h3>
        <!-- ... Upload form inputs ... -->
    </section>
</div>
```

---

## Step 2: The Logic Engine

The logic is responsible for taking a PieceCID and instructing the browser to begin the partial content handshake with our proxy.

### The Code: `player.js`

```javascript
function streamMedia() {
    const pieceCid = document.getElementById('pieceCid').value;
    const player = document.getElementById('player');
    const overlay = document.getElementById('loadingOverlay');

    if (!pieceCid) return alert("Please provide a valid PieceCID");

    // 1. Show intent immediately
    overlay.classList.remove('hidden');

    // 2. Point to our Proxy
    // Note: We point directly to our server route, which handles 206 status
    player.src = `/video/${pieceCid}`;

    // 3. Monitor the Handshake
    player.onloadedmetadata = () => {
        overlay.classList.add('hidden');
        console.log(`Stream established. Duration: ${player.duration}s`);
        player.play();
    };

    player.onerror = () => {
        overlay.textContent = "Error: PieceCID not found or Server Offline";
    };
}
```

### What's Happening

*   **Setting `player.src`**: This single line of code triggers a complex sequence. The browser immediately fires an HTTP `GET` with a `Range: bytes=0-` header to your proxy.
*   **ReadyState Negotiation**: The browser waits for the `206 Partial Content` response. Once it receives the first few megabytes (the video header/atoms), it fires the `onloadedmetadata` event.
*   **The Seek-Bar**: Because our server responds with `Accept-Ranges: bytes`, the browser automatically enables the seek-bar. If the user clicks halfway through the timeline, the browser cancels the current download and opens a *new* request starting from the middle of the file.

### Why This Matters: UX Perception

Latency is the killer of decentralised apps. By using the `onloadedmetadata` event, we can provide immediate visual feedback. The moment the "Handshake" is complete, we remove the loading overlay and start playback. 

Even if the rest of the 250MB file is still downloading, the user perceives the application as **instant**.

---

## Beyond the Basics: Production Readiness

While our setup is functional, industrial-scale streaming requires additional considerations:

### 1. Transcoding (HLS/DASH)
Standard `.mp4` files are "single bitrate." If a user is on a fast 4K monitor, it looks great. If they are on a 3G phone, the video will stall. In production, you would use `ffmpeg` to convert the video into **HLS (HTTP Live Streaming)**. This creates multiple versions of the video (480p, 720p, 1080p) and switches between them automatically based on the user's internet speed.

### 2. Metadata Caching
In Part 2, our server downloaded the file to find its size. In a real app, you would store the `PieceCID`, `Size`, and `Duration` in a lightning-fast database like Redis. This ensures the proxy can respond to the browser's handshake in microseconds.

### 3. Signed URLs
To prevent unauthorized users from draining your Beam CDN bandwidth, you should implement Signed URLs. The server generates a temporary, cryptographically signed link for the video that expires after a few hours.

---

## The Debugger's Toolkit

Frontend media errors can be opaque. Use this checklist if your player doesn't behave as expected.

### 1. `MEDIA_ERR_SRC_NOT_SUPPORTED`
This is a catch-all for "I can't load the file." 
*   **The Check**: Open your browser's **Network Tab**. If the request to `/video/:cid` returns a `404`, your server isn't finding the file on Filecoin. If it returns `200` but the video doesn't play, ensure you haven't corrupted the file headers during a manual download.

### 2. CORS & Origin Errors
If you are running the frontend on a different port or domain than the server (e.g., frontend on 5500 via Live Server, backend on 3000):
*   **The Fix**: Ensure your Express server has the `cors` middleware installed and configured to allow your frontend's origin:
    ```javascript
    import cors from 'cors';
    app.use(cors()); // In development only
    ```

---

## Final Conclusion

Congratulations. You have moved from simple "Hello World" uploads to building a professional-grade media delivery stack on Filecoin.

**What you have built:**
1.  **Ingestion**: A memory-efficient pipeline that overcomes the "Memory Wall."
2.  **Delivery**: A protocol-compliant proxy that leverages the Filecoin Beam CDN.
3.  **Consumption**: A high-performance, native user interface designed for speed.

You are no longer just storing bytes; you are broadcasting them. The next step is yours: take this foundation and build the next generation of decentralized YouTube, Vimeo, or Spotify. The infrastructure is ready.
