# Part 2: The Streaming Proxy

In the previous module, we conquered the **Ingestion** problem. We successfully moved heavy 4K media into the cloud without exceeding our RAM limits.

Now we face the **Latency** problem.

If you give a user a direct download link to a 250MB video file, they have to wait for the whole thing to download before they can watch the first frame. On a standard connection, that might take 30 seconds. On mobile, much longer.

Modern users expect playback to start within **200ms**. To achieve this, we don't just "serve files"—we build a **Streaming Proxy**.

---

## The Handshake: RFC 7233

Streaming isn't magic; it's a specific subset of the HTTP standard called **Range Requests** (defined in [RFC 7233](https://datatracker.ietf.org/doc/html/rfc7233)).

When you drag the slider on a video, your browser doesn't know about "minutes" or "seconds." It knows about **bytes**. It calculates: *"The user wants the middle of the video. The file is 250MB. I need byte 125,000,000."*

It sends a request to your server like this:
```http
GET /video/piece-cid HTTP/1.1
Range: bytes=125000000-
```

If your server replies with `200 OK` and the whole file, the browser rejects it. To enable streaming, your server must perform a specific "Handshake":
1.  Reply with `206 Partial Content`.
2.  Send only the requested byte slice.
3.  Include headers that describe the total file size.

---

## The Secret Sauce: Beam CDN

You'll notice `withCDN: true` in our code. While Filecoin is traditionally "Cold Storage" (where retrieval can take hours), **Beam CDN** is the caching layer. It keeps your recent uploads "Hot" on edge servers around the world.

-   **Without Beam**: Request -> Network searches archive -> Wait 3 hours -> Video Starts (FAIL).
-   **With Beam**: Request -> Edge Cache -> 50ms -> Video Starts (WIN).

---

---

## Step 1: The Plumbing (`server.js`)

We will build an Express.js server that acts as a linguistic translator between the Browser's range requests and Filecoin's data storage. This is the "mid-tier" plumbing of our application.

### The Code: `server.js`

```javascript
import express from 'express';
import { Synapse } from '@filoz/synapse-sdk';

const app = express();

// ... SDK Initialization ...

app.get('/video/:pieceCid', async (req, res) => {
    const { pieceCid } = req.params;
    const range = req.headers.range;

    // 1. Fetch File Metadata (Size)
    const context = await synapse.storage.createContext({ withCDN: true });
    
    // NOTE: In production, you would cache this size in a database!
    const fileData = await context.download(pieceCid);
    const videoSize = fileData.length;

    if (!range) {
        // Fallback: If no range is requested, send the whole file
        return res.status(200).send(Buffer.from(fileData));
    }

    // 2. Parse the Byte Range
    // Format: "bytes=start-end"
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;

    // 3. Calculate Chunk Metrics
    const chunkSize = (end - start) + 1;

    // 4. Perform the Handshake
    const headers = {
        "Content-Range": `bytes ${start}-${end}/${videoSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": "video/mp4",
    };

    res.writeHead(206, headers);
    
    // 5. Slice and Serve
    const videoStream = fileData.slice(start, end + 1);
    res.end(Buffer.from(videoStream));
});
```

### What's Happening

*   **`req.headers.range`**: We check if the browser is performing a range request. Chrome, Safari, and Firefox always do this for `<video>` tags.
*   **The 206 Status**: `res.writeHead(206)` tells the browser: "I understand you only want a slice. Here it is."
*   **`Content-Range`**: This is the most critical header. It tells the browser where this slice fits in the grand scheme of the file (e.g., `bytes 0-1048576/250000000`).
*   **`Accept-Ranges`**: This tells the browser: "I support seeking. You can jump to any byte you want."

### Why This Matters

Without this logic, the browser would treat the video as a single, static download. You wouldn't be able to "seek" (jump forward), and the browser wouldn't be able to "buffer ahead." By implementing RFC 7233, we turn a flat file into an interactive media stream.

---

## Architecture Insight: Stateful vs. Stateless

In our tutorial code, we `download()` the whole file into a buffer before slicing it. This is **Stateful** (the server holds the whole file). For a single user, it's fine. For 10,000 users, your server's RAM would explode.

### Production Pattern: The "Pass-Through"
A production-grade proxy is **Stateless**. Instead of downloading the whole file, it takes the browser's range request (`bytes=100-200`) and forwards it *directly* to the Beam CDN. The server acts as a pipe, moving bytes from the CDN to the user without ever storing them. This allows a single small server to handle thousands of concurrent viewers.

---

## Debugging & Edge Cases

When serving complex media streams, the handshake between the browser and your proxy can sometimes fail.

### 1. `416 Range Not Satisfiable`
This occurs if the browser asks for a byte range that is beyond the size of the file (e.g., asking for byte 1,001 of a 1,000-byte file).
*   **The Cause**: Typically happens if the `videoSize` metadata on your server is out of sync with the actual file on Filecoin. 
*   **The Fix**: Ensure your server is correctly calculating the `videoSize` from the `fileData` buffer.

### 2. Browser "Stalling" or Loading Loops
If the video appears to load but never plays:
*   **The Cause**: The browser might be receiving a `200 OK` (whole file) when it expected a `206 Partial Content`. 
*   **The Fix**: Double-check your `server.js` logic to ensure `res.writeHead(206)` is firing correctly when a `range` header is present.

---

## Conclusion

Your server is now a high-performance media gateway. It understands how to:
1.  Negotiate partial content delivery with modern browsers.
2.  Leverage the Beam CDN for sub-second start times.
3.  Provide full seekability for large media assets.

Now that the back-end is broadcasting, we need a front-end to receive it. In **[Part 3](./03-custom-video-player.md)**, we will build a custom interface to provide the ultimate viewing experience.
