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

// Track mouse position for smooth cursor trails
let lastMouseX = 100;
let lastMouseY = 100;

// Ensure videos directory exists
const videosDir = path.resolve(__dirname, "..", "videos");
fs.ensureDirSync(videosDir);

// --- Helper function to inject cursor trail system ---
async function injectCursorTrail(currentPage: playwright.Page): Promise<void> {
  await currentPage.evaluate(() => {
    // Remove any existing cursor trail styles
    const existingStyle = document.querySelector('#playwright-cursor-trail-style');
    if (existingStyle) {
      existingStyle.remove();
    }

    // Inject cursor trail styles
    const style = document.createElement('style');
    style.id = 'playwright-cursor-trail-style';
    style.innerHTML = `
      .cursor-trail {
        position: fixed;
        width: 20px;
        height: 20px;
        background: radial-gradient(circle, rgba(255,0,0,0.9) 0%, rgba(255,0,0,0.6) 50%, rgba(255,0,0,0.2) 100%);
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999999;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 15px rgba(255,0,0,0.6);
        transition: opacity 1s ease, transform 0.3s ease;
      }
      
      .cursor-current {
        position: fixed;
        width: 24px;
        height: 24px;
        background: radial-gradient(circle, rgba(255,0,0,1) 0%, rgba(255,0,0,0.8) 40%, rgba(255,0,0,0.4) 100%);
        border: 3px solid white;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999999;
        transform: translate(-50%, -50%);
        box-shadow: 0 0 20px rgba(255,0,0,0.8);
        transition: all 0.2s ease;
      }
      
      .cursor-trail.clicking {
        background: radial-gradient(circle, rgba(0,150,255,0.9) 0%, rgba(0,150,255,0.6) 50%, rgba(0,150,255,0.2) 100%);
        box-shadow: 0 0 20px rgba(0,150,255,0.8);
        transform: translate(-50%, -50%) scale(1.5);
      }
      
      .cursor-trail.typing {
        background: radial-gradient(circle, rgba(0,255,0,0.9) 0%, rgba(0,255,0,0.6) 50%, rgba(0,255,0,0.2) 100%);
        box-shadow: 0 0 20px rgba(0,255,0,0.8);
        animation: typePulse 0.5s ease infinite alternate;
      }
      
      .click-indicator {
        position: fixed;
        width: 50px;
        height: 50px;
        border: 4px solid rgba(0,150,255,1);
        border-radius: 50%;
        pointer-events: none;
        z-index: 999998;
        transform: translate(-50%, -50%);
        background: rgba(0,150,255,0.3);
        box-shadow: 0 0 30px rgba(0,150,255,0.8), inset 0 0 20px rgba(0,150,255,0.3);
        animation: clickGlow 0.5s ease-out;
      }
      
      @keyframes clickGlow {
        0% { 
          transform: translate(-50%, -50%) scale(0.5);
          opacity: 0;
        }
        50% {
          transform: translate(-50%, -50%) scale(1.2);
          opacity: 1;
        }
        100% {
          transform: translate(-50%, -50%) scale(1);
          opacity: 0.9;
        }
      }
      
      .type-indicator {
        position: fixed;
        width: 40px;
        height: 40px;
        border: 3px solid rgba(0,255,0,0.8);
        border-radius: 50%;
        pointer-events: none;
        z-index: 999998;
        transform: translate(-50%, -50%);
        background: rgba(0,255,0,0.2);
        box-shadow: 0 0 25px rgba(0,255,0,0.6);
      }
      
      @keyframes typePulse {
        0% { transform: translate(-50%, -50%) scale(1); }
        100% { transform: translate(-50%, -50%) scale(1.2); }
      }
    `;
    document.head.appendChild(style);

    // Create global functions for cursor management
    (window as any).addCursorTrail = (x: number, y: number, actionType: string = 'move') => {
      const trailDot = document.createElement('div');
      trailDot.classList.add('cursor-trail');
      document.body.appendChild(trailDot);

      trailDot.style.left = `${x}px`;
      trailDot.style.top = `${y}px`;

      // Add action-specific styling
      if (actionType === 'click') {
        trailDot.classList.add('clicking');
      } else if (actionType === 'type') {
        trailDot.classList.add('typing');
      }

      // Fade out and remove after longer delay
      setTimeout(() => {
        trailDot.style.opacity = '0';
        setTimeout(() => trailDot.remove(), 1000);
      }, actionType === 'click' || actionType === 'type' ? 2000 : 800);
    };

    // Function to update persistent cursor position
    (window as any).updateCurrentCursor = (x: number, y: number) => {
      let cursor = document.querySelector('.cursor-current') as HTMLElement;
      if (!cursor) {
        cursor = document.createElement('div');
        cursor.classList.add('cursor-current');
        document.body.appendChild(cursor);
      }
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
    };

    // Function to add permanent action indicators
    (window as any).addActionIndicator = (x: number, y: number, actionType: string) => {
      const indicator = document.createElement('div');
      if (actionType === 'click') {
        indicator.classList.add('click-indicator');
      } else if (actionType === 'type') {
        indicator.classList.add('type-indicator');
      }
      
      if (indicator.className) {
        document.body.appendChild(indicator);
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y}px`;
        
        // Keep permanent indicators visible much longer
        setTimeout(() => {
          indicator.style.opacity = '0.7';
        }, 10000);
        
        // Add a number label to show click order
        const clickCount = document.querySelectorAll('.click-indicator').length;
        if (actionType === 'click') {
          const label = document.createElement('div');
          label.textContent = clickCount.toString();
          label.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            font-weight: bold;
            font-size: 14px;
            text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
            pointer-events: none;
          `;
          indicator.appendChild(label);
        }
      }
    };
  });
}

// --- Helper function to create visual trail during mouse movement ---
async function createCursorTrail(currentPage: playwright.Page, fromX: number, fromY: number, toX: number, toY: number, steps: number = 20): Promise<void> {
  const stepX = (toX - fromX) / steps;
  const stepY = (toY - fromY) / steps;

  for (let i = 0; i <= steps; i++) {
    const currentX = fromX + (stepX * i);
    const currentY = fromY + (stepY * i);
    
    // Add trail dot at current position
    await currentPage.evaluate((coords) => {
      (window as any).addCursorTrail(coords.x, coords.y, 'move');
      (window as any).updateCurrentCursor(coords.x, coords.y);
    }, { x: currentX, y: currentY });
    
    // Small delay between trail dots
    await currentPage.waitForTimeout(30);
  }
}

// --- Helper function to move cursor with visual trail ---
async function moveCursorToElement(currentPage: playwright.Page, selector: string, action: 'click' | 'type' | 'hover' = 'hover'): Promise<void> {
  // Get element position
  const elementBox = await currentPage.locator(selector).boundingBox();
  if (!elementBox) {
    throw new Error(`Element with selector "${selector}" not found`);
  }

  const targetX = elementBox.x + elementBox.width / 2;
  const targetY = elementBox.y + elementBox.height / 2;

  // Create visual trail from last position to target
  await createCursorTrail(currentPage, lastMouseX, lastMouseY, targetX, targetY, 15);
  
  // Move the actual Playwright mouse (without steps to avoid double trail)
  await currentPage.mouse.move(targetX, targetY);
  
  // Update tracked position
  lastMouseX = targetX;
  lastMouseY = targetY;
  
  // Add action-specific visual feedback at target
  await currentPage.evaluate((data) => {
    (window as any).addCursorTrail(data.x, data.y, data.action);
    (window as any).updateCurrentCursor(data.x, data.y);
    // Add permanent indicator for clicks and types
    if (data.action === 'click' || data.action === 'type') {
      (window as any).addActionIndicator(data.x, data.y, data.action);
    }
  }, { x: targetX, y: targetY, action });

  // Brief pause to show the cursor at target
  await currentPage.waitForTimeout(600);
}

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
    lastMouseX = 100;
    lastMouseY = 100;

    const sanitizedDescription = description.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 50);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const videoFilename = `${sanitizedDescription}_${timestamp}.webm`;
    currentVideoPath = path.join(videosDir, videoFilename);

    try {
      const browserType = playwright[browser_type || "chromium"];
      browser = await browserType.launch({ 
        headless: false,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--disable-default-apps'
        ]
      });
      context = await browser.newContext({
        recordVideo: {
          dir: videosDir,
          size: { width: 1280, height: 720 },
        },
        viewport: { width: 1280, height: 720 }
      });
      page = await context.newPage();
      
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      
      // Inject cursor trail system
      await injectCursorTrail(page);
      
      // Show initial cursor position with trail
      await page.evaluate(() => {
        (window as any).addCursorTrail(100, 100, 'move');
        (window as any).updateCurrentCursor(100, 100);
      });
      await page.mouse.move(100, 100);
      lastMouseX = 100;
      lastMouseY = 100;
      await page.waitForTimeout(800);

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
      
      // Re-inject cursor trail system after navigation
      await injectCursorTrail(page);
      
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
      // Move cursor to element with visual trail before clicking
      await moveCursorToElement(page, selector, 'click');
      
      // Get exact click coordinates
      const elementBox = await page.locator(selector).boundingBox();
      const clickX = elementBox!.x + elementBox!.width / 2;
      const clickY = elementBox!.y + elementBox!.height / 2;
      
      // Add pre-click indicator to show where we're about to click
      await page.evaluate((coords) => {
        console.log('Adding pre-click indicator at:', coords.x, coords.y);
        
        const preClick = document.createElement('div');
        preClick.style.cssText = `
          position: fixed !important;
          left: ${coords.x}px;
          top: ${coords.y}px;
          width: 120px;
          height: 120px;
          border: 6px dashed rgba(255,165,0,1);
          border-radius: 50%;
          background: rgba(255,165,0,0.2);
          z-index: 2147483647;
          pointer-events: none;
          transform: translate(-50%, -50%);
          animation: preClickBlink 0.5s ease-in-out 3;
          box-shadow: 0 0 40px rgba(255,165,0,0.8);
        `;
        
        // Add pre-click animation
        if (!document.querySelector('#pre-click-style')) {
          const style = document.createElement('style');
          style.id = 'pre-click-style';
          style.innerHTML = `
            @keyframes preClickBlink {
              0% { opacity: 0.3; transform: translate(-50%, -50%) scale(0.8); }
              50% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
              100% { opacity: 0.6; transform: translate(-50%, -50%) scale(1); }
            }
          `;
          document.head.appendChild(style);
        }
        
        document.body.appendChild(preClick);
        
        // Remove pre-click indicator after delay
        setTimeout(() => preClick.remove(), 2000);
        
        console.log('Pre-click indicator added successfully');
      }, { x: clickX, y: clickY });
      
      // Add MULTIPLE click visual effects for maximum visibility
      await page.evaluate((coords) => {
        console.log('Adding click effects at:', coords.x, coords.y);
        
        // Add comprehensive click effect styles if not exists
        if (!document.querySelector('#comprehensive-click-style')) {
          const style = document.createElement('style');
          style.id = 'comprehensive-click-style';
          style.innerHTML = `
            @keyframes clickRipple {
              0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
              100% { transform: translate(-50%, -50%) scale(3); opacity: 0; }
            }
            @keyframes clickPulse {
              0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
              50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.7; }
              100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
            }
            @keyframes clickFlash {
              0% { background: rgba(255,255,0,0.8); }
              50% { background: rgba(255,0,0,0.8); }
              100% { background: rgba(0,255,255,0.8); }
            }
            .click-effect {
              position: fixed !important;
              pointer-events: none !important;
              z-index: 2147483647 !important;
            }
          `;
          document.head.appendChild(style);
        }
        
        // Effect 1: Large expanding ripple
        const ripple1 = document.createElement('div');
        ripple1.className = 'click-effect';
        ripple1.style.cssText = `
          left: ${coords.x}px;
          top: ${coords.y}px;
          width: 80px;
          height: 80px;
          border: 4px solid rgba(255,255,0,1);
          border-radius: 50%;
          transform: translate(-50%, -50%) scale(0);
          animation: clickRipple 1s ease-out;
          background: rgba(255,255,0,0.2);
          box-shadow: 0 0 50px rgba(255,255,0,0.8);
        `;
        document.body.appendChild(ripple1);
        setTimeout(() => ripple1.remove(), 1000);
        
        // Effect 2: Medium pulsing circle
        const pulse = document.createElement('div');
        pulse.className = 'click-effect';
        pulse.style.cssText = `
          left: ${coords.x}px;
          top: ${coords.y}px;
          width: 50px;
          height: 50px;
          border: 3px solid rgba(255,0,255,1);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: clickPulse 2s ease-in-out 3;
          background: rgba(255,0,255,0.3);
        `;
        document.body.appendChild(pulse);
        setTimeout(() => pulse.remove(), 6000);
        
        // Effect 3: Color-changing flash
        const flash = document.createElement('div');
        flash.className = 'click-effect';
        flash.style.cssText = `
          left: ${coords.x}px;
          top: ${coords.y}px;
          width: 30px;
          height: 30px;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          animation: clickFlash 0.5s ease-in-out 4;
          border: 2px solid white;
        `;
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 2000);
        
        // Effect 4: Permanent numbered indicator (stays longest)
        const permanent = document.createElement('div');
        permanent.className = 'click-effect click-permanent';
        const clickNumber = document.querySelectorAll('.click-permanent').length + 1;
        permanent.style.cssText = `
          left: ${coords.x}px;
          top: ${coords.y}px;
          width: 60px;
          height: 60px;
          border: 4px solid rgba(0,150,255,1);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0,150,255,0.4);
          box-shadow: 0 0 30px rgba(0,150,255,0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 16px;
          text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
          font-family: Arial, sans-serif;
        `;
        permanent.textContent = clickNumber.toString();
        document.body.appendChild(permanent);
        
        // Keep permanent indicator visible for entire recording
        setTimeout(() => {
          permanent.style.opacity = '0.6';
        }, 15000);
        
        // Force browser repaint
        document.body.offsetHeight;
        
        console.log('Click effects added successfully');
      }, { x: clickX, y: clickY });
      
      // Wait a moment for visual effects to render
      await page.waitForTimeout(200);
      
      // Add backup click indicator using different method
      await page.evaluate((coords) => {
        // Create backup indicator that definitely appears
        const backup = document.createElement('div');
        backup.id = `click-backup-${Date.now()}`;
        backup.style.position = 'fixed';
        backup.style.left = coords.x + 'px';
        backup.style.top = coords.y + 'px';
        backup.style.width = '100px';
        backup.style.height = '100px';
        backup.style.border = '5px solid red';
        backup.style.borderRadius = '50%';
        backup.style.background = 'rgba(255,0,0,0.3)';
        backup.style.zIndex = '999999999';
        backup.style.pointerEvents = 'none';
        backup.style.transform = 'translate(-50%, -50%)';
        backup.style.fontSize = '20px';
        backup.style.color = 'white';
        backup.style.display = 'flex';
        backup.style.alignItems = 'center';
        backup.style.justifyContent = 'center';
        backup.style.fontWeight = 'bold';
        backup.textContent = 'CLICK';
        
        document.body.appendChild(backup);
        
        // Remove backup after long delay
        setTimeout(() => {
          if (document.getElementById(backup.id)) {
            backup.remove();
          }
        }, 8000);
        
        console.log('Backup click indicator added');
      }, { x: clickX, y: clickY });
      
      await page.locator(selector).click();
      
      // Add post-click confirmation
      await page.evaluate((coords) => {
        const confirm = document.createElement('div');
        confirm.style.cssText = `
          position: fixed;
          left: ${coords.x + 50}px;
          top: ${coords.y - 30}px;
          background: rgba(0,255,0,0.9);
          color: white;
          padding: 5px 10px;
          border-radius: 5px;
          font-weight: bold;
          z-index: 999999999;
          pointer-events: none;
          font-family: Arial, sans-serif;
        `;
        confirm.textContent = '✓ CLICKED';
        document.body.appendChild(confirm);
        setTimeout(() => confirm.remove(), 3000);
      }, { x: clickX, y: clickY });
      
      await page.waitForTimeout(800); // Allow UI to update and effects to show
      
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
      // Move cursor to element with visual trail before typing
      await moveCursorToElement(page, selector, 'type');
      
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
  console.error("Demo Video MCP Server with animated cursor trail running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});