#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import playwright from "playwright";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Global state for the recording session ---
let browser: playwright.Browser | null = null;
let context: playwright.BrowserContext | null = null;
let page: playwright.Page | null = null;
let isRecording = false;
let currentVideoPath: string | null = null;
let demoDescription: string = "";
let startUrl: string = "";

// Track user interactions for social media post generation
interface Interaction {
  type: 'navigate' | 'click' | 'type';
  timestamp: Date;
  description: string;
  element?: string;
  value?: string;
  url?: string;
}

let interactions: Interaction[] = [];

// Ensure videos directory exists
const videosDir = path.resolve(process.cwd(), "videos");
fs.ensureDirSync(videosDir);

// --- Helper function to generate ARIA snapshot ---
async function getPageSnapshot(currentPage: playwright.Page): Promise<string> {
  if (!currentPage || currentPage.isClosed()) {
    return "Error: Page is not available or closed.";
  }
  try {
    // Get page state
    const url = currentPage.url();
    const title = await currentPage.title();
    
    // Try to get Playwright's internal AI snapshot
    let snapshot = "";
    try {
      snapshot = await (currentPage as any)._snapshotForAI();
    } catch (e) {
      // Fallback to basic DOM info if AI snapshot fails
      const elements = await currentPage.evaluate(() => {
        const interactable = Array.from(document.querySelectorAll('button, a, input, textarea, select'));
        return interactable.slice(0, 10).map(el => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim() || '',
          type: (el as HTMLInputElement).type || '',
          placeholder: (el as HTMLInputElement).placeholder || '',
          href: (el as HTMLAnchorElement).href || ''
        }));
      });
      snapshot = JSON.stringify(elements, null, 2);
    }
    
    return `- Page URL: ${url}
- Page Title: ${title}
- Page Snapshot:
\`\`\`yaml
${snapshot}
\`\`\``;
  } catch (error) {
    console.error("Error taking snapshot:", error);
    return `Error taking snapshot: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// --- Helper function to generate social media post ---
function generateSocialMediaPost(): string {
  if (interactions.length === 0) {
    return "Check out this demo! 🚀";
  }

  // Analyze the interactions to create an engaging post
  const clickCount = interactions.filter(i => i.type === 'click').length;
  const typeCount = interactions.filter(i => i.type === 'type').length;
  const navigationCount = interactions.filter(i => i.type === 'navigate').length;

  // Build the narrative
  let post = `🎬 Just recorded a demo: "${demoDescription}"\n\n`;
  
  // Add journey highlights
  post += `📍 Started at: ${startUrl}\n`;
  
  // Key actions summary
  if (navigationCount > 1) {
    post += `🔄 Navigated through ${navigationCount} pages\n`;
  }
  if (clickCount > 0) {
    post += `🖱️ ${clickCount} strategic clicks\n`;
  }
  if (typeCount > 0) {
    post += `⌨️ Filled ${typeCount} form fields\n`;
  }

  // Add some key interactions as a story
  post += `\n✨ Key moments:\n`;
  const keyInteractions = interactions.slice(0, 3);
  keyInteractions.forEach((interaction, idx) => {
    if (interaction.type === 'click' && interaction.element) {
      post += `${idx + 1}. Clicked "${interaction.element}"\n`;
    } else if (interaction.type === 'type' && interaction.element) {
      post += `${idx + 1}. Entered data in "${interaction.element}"\n`;
    } else if (interaction.type === 'navigate' && interaction.url) {
      const urlPath = new URL(interaction.url).pathname;
      post += `${idx + 1}. Navigated to ${urlPath}\n`;
    }
  });

  // Add engagement hooks
  const totalActions = clickCount + typeCount + navigationCount;
  if (totalActions > 10) {
    post += `\n🔥 ${totalActions} total actions in this comprehensive walkthrough!`;
  } else if (totalActions > 5) {
    post += `\n💡 Quick ${totalActions}-step demo showing the essentials!`;
  } else {
    post += `\n⚡ Simple ${totalActions}-step process - easy to follow!`;
  }

  // Add hashtags
  post += `\n\n#Demo #WebAutomation #Tutorial #TechDemo #Playwright`;
  
  // Add call to action
  post += `\n\n👇 Watch the full video to see it in action!`;

  return post;
}

// --- MCP Server Setup ---
const server = new McpServer({
  name: "playwright-demo-recorder",
  version: "1.0.0",
  capabilities: {
    tools: {}, // Tools are registered below
  },
});

// --- Tool Definitions ---

server.tool(
  "start_demo_recording",
  "Starts a new browser session and begins recording a video of the interactions. The cursor will be visible.",
  {
    url: z.string().describe("The initial URL to navigate to."),
    description: z.string().describe("A short description for the demo (used for video filename and social post)."),
    browser_type: z.enum(["chromium", "firefox", "webkit"]).default("chromium").optional()
      .describe("Browser to use for recording (chromium, firefox, webkit). Defaults to chromium."),
  },
  async ({ url, description, browser_type }) => {
    if (isRecording) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: A recording is already in progress. Please stop it first." 
        }], 
        isError: true 
      };
    }

    // Reset state for new recording
    interactions = [];
    demoDescription = description;
    startUrl = url;

    const sanitizedDescription = description.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const videoFilename = `${sanitizedDescription}_${timestamp}.webm`;
    currentVideoPath = path.join(videosDir, videoFilename);

    try {
      const browserType = playwright[browser_type || "chromium"];
      browser = await browserType.launch({ headless: false }); // Headed for visible cursor
      context = await browser.newContext({
        recordVideo: {
          dir: videosDir,
          size: { width: 1280, height: 720 },
        },
        viewport: { width: 1280, height: 720 }
      });
      page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // Track initial navigation
      interactions.push({
        type: 'navigate',
        timestamp: new Date(),
        description: 'Started demo',
        url: url
      });

      isRecording = true;
      const snapshot = await getPageSnapshot(page);
      return {
        content: [
          { 
            type: "text", 
            text: `Recording started for "${description}". Initial page loaded. Video will be saved in '${videosDir}'.

${snapshot}` 
          },
        ],
      };
    } catch (error) {
      console.error("Error starting recording:", error);
      isRecording = false;
      currentVideoPath = null;
      await page?.close().catch(e => console.error("Page close error:", e));
      await context?.close().catch(e => console.error("Context close error:", e));
      await browser?.close().catch(e => console.error("Browser close error:", e));
      page = null; context = null; browser = null;
      return { 
        content: [{ 
          type: "text", 
          text: `Error starting recording: ${error instanceof Error ? error.message : String(error)}` 
        }], 
        isError: true 
      };
    }
  }
);

server.tool(
  "navigate_during_demo",
  "Navigates the current demo page to a new URL.",
  {
    url: z.string().describe("The URL to navigate to."),
  },
  async ({ url }) => {
    if (!isRecording || !page) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: Recording not active or page not available." 
        }], 
        isError: true 
      };
    }
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Track navigation
      interactions.push({
        type: 'navigate',
        timestamp: new Date(),
        description: `Navigated to new page`,
        url: url
      });
      
      const snapshot = await getPageSnapshot(page);
      return { 
        content: [{ 
          type: "text", 
          text: `Navigated to ${url}.

${snapshot}` 
        }] 
      };
    } catch (error) {
      return { 
        content: [{ 
          type: "text", 
          text: `Error navigating: ${error instanceof Error ? error.message : String(error)}` 
        }], 
        isError: true 
      };
    }
  }
);

server.tool(
  "click_element_on_demo_page",
  "Clicks an element on the current demo page.",
  {
    selector: z.string().describe("A CSS selector or Playwright auto-detectable selector for the element to click."),
    element_description: z.string().optional().describe("A human-readable description of the element being clicked (for logging and social post).")
  },
  async ({ selector, element_description }) => {
    if (!isRecording || !page) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: Recording not active or page not available." 
        }], 
        isError: true 
      };
    }
    try {
      await page.locator(selector).click();
      await page.waitForTimeout(500); // Allow UI to update
      
      // Track click interaction
      interactions.push({
        type: 'click',
        timestamp: new Date(),
        description: `Clicked element`,
        element: element_description || selector
      });
      
      const snapshot = await getPageSnapshot(page);
      return { 
        content: [{ 
          type: "text", 
          text: `Clicked on element ${element_description ? '"'+element_description+'"' : ''} (selector: ${selector}).

${snapshot}` 
        }] 
      };
    } catch (error) {
      return { 
        content: [{ 
          type: "text", 
          text: `Error clicking element (selector: ${selector}): ${error instanceof Error ? error.message : String(error)}` 
        }], 
        isError: true 
      };
    }
  }
);

server.tool(
  "type_into_demo_element",
  "Types text into an element on the current demo page.",
  {
    selector: z.string().describe("A CSS selector or Playwright auto-detectable selector for the input element."),
    text: z.string().describe("The text to type."),
    element_description: z.string().optional().describe("A human-readable description of the element being typed into (for logging and social post).")
  },
  async ({ selector, text, element_description }) => {
    if (!isRecording || !page) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: Recording not active or page not available." 
        }], 
        isError: true 
      };
    }
    try {
      await page.locator(selector).fill(text);
      await page.waitForTimeout(300);
      
      // Track type interaction
      interactions.push({
        type: 'type',
        timestamp: new Date(),
        description: `Typed into field`,
        element: element_description || selector,
        value: text.length > 20 ? text.substring(0, 20) + '...' : text
      });
      
      const snapshot = await getPageSnapshot(page);
      return { 
        content: [{ 
          type: "text", 
          text: `Typed "${text}" into element ${element_description ? '"'+element_description+'"' : ''} (selector: ${selector}).

${snapshot}` 
        }] 
      };
    } catch (error) {
      return { 
        content: [{ 
          type: "text", 
          text: `Error typing into element (selector: ${selector}): ${error instanceof Error ? error.message : String(error)}` 
        }], 
        isError: true 
      };
    }
  }
);

server.tool(
  "get_demo_page_snapshot",
  "Gets a snapshot of the current demo page.",
  {},
  async () => {
    if (!isRecording || !page) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: Recording not active or page not available." 
        }], 
        isError: true 
      };
    }
    const snapshot = await getPageSnapshot(page);
    return { content: [{ type: "text", text: snapshot }] };
  }
);

server.tool(
  "generate_social_media_post",
  "Generates an engaging social media post based on the recorded interactions. Call this before or after stopping the recording.",
  {},
  async () => {
    const post = generateSocialMediaPost();
    return { 
      content: [{ 
        type: "text", 
        text: `Generated Social Media Post:

${post}

You can copy and customize this post for your social media channels!` 
      }] 
    };
  }
);

server.tool(
  "stop_demo_recording",
  "Stops the current recording session and saves the video.",
  {},
  async () => {
    if (!isRecording) {
      return { 
        content: [{ 
          type: "text", 
          text: "Error: No recording is currently active." 
        }], 
        isError: true 
      };
    }

    let finalVideoPath = "unknown (video might not have saved correctly)";
    try {
      if (page && !page.isClosed()) {
        const video = page.video();
        await page.close(); // Closing the page is crucial for the video to be saved
        if (video) {
          finalVideoPath = await video.path();
        } else {
          // Fallback: check for most recent video in directory
          const files = await fs.readdir(videosDir);
          const videoFiles = files.filter(f => f.endsWith('.webm'));
          if (videoFiles.length > 0) {
            videoFiles.sort();
            finalVideoPath = path.join(videosDir, videoFiles[videoFiles.length - 1]);
          }
        }
      }
      if (context) await context.close();
      if (browser) await browser.close();
      
      isRecording = false;
      page = null;
      context = null;
      browser = null;
      
      if (finalVideoPath && finalVideoPath !== "unknown (video might not have saved correctly)") {
        currentVideoPath = finalVideoPath;
      }

      // Generate social media post
      const socialPost = generateSocialMediaPost();

      const userMessage = `Recording stopped successfully!

📹 Video saved to: ${currentVideoPath || "Check 'videos' directory"}

📱 Generated Social Media Post:
${socialPost}

✅ Demo recording complete with ${interactions.length} tracked interactions!`;

      currentVideoPath = null;
      return { content: [{ type: "text", text: userMessage }] };
    } catch (error) {
      console.error("Error stopping recording:", error);
      // Attempt cleanup even on error
      isRecording = false;
      await page?.close().catch(e => console.error("Page close error:", e));
      await context?.close().catch(e => console.error("Context close error:", e));
      await browser?.close().catch(e => console.error("Browser close error:", e));
      page = null; context = null; browser = null;
      currentVideoPath = null;
      return { 
        content: [{ 
          type: "text", 
          text: `Error stopping recording: ${error instanceof Error ? error.message : String(error)}` 
        }], 
        isError: true 
      };
    }
  }
);

// --- Main Function to Run Server ---
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Playwright Demo Recorder MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});