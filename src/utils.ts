import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';

// Scene FPS counter
export function addFpsCounter(
  scene: PIXI.Container,
  app: PIXI.Application,
  sceneTickers: { [key: string]: (() => void)[] },
  sceneId?: string
) {
  const fpsText = new PIXI.Text({ 
    text: 'FPS: --', 
    style: { 
      fontSize: 14, 
      fill: '#00ff00',
      fontFamily: 'monospace'
    } 
  });
  fpsText.x = 10;
  fpsText.y = 10;
  scene.addChild(fpsText);

  let lastTime = performance.now();
  let frames = 0;
  const fpsTickerId = sceneId ? `fps-${sceneId}` : 'fps';

  // FPS update ticker
  const fpsTicker = () => {
    if (fpsText.destroyed) return;
    frames++;
    const now = performance.now();
    if (now - lastTime >= 500) {
      const fps = Math.round((frames * 1000) / (now - lastTime));
      fpsText.text = `FPS: ${fps}`;
      lastTime = now;
      frames = 0;
    }
  };

  // Register ticker
  app.ticker.add(fpsTicker);
  if (!sceneTickers[fpsTickerId]) sceneTickers[fpsTickerId] = [];
  sceneTickers[fpsTickerId].push(fpsTicker);

  // Update position on resize
  const resizeHandler = () => {
    if (fpsText && !fpsText.destroyed) {
      // Keep FPS counter in top-left corner
      fpsText.x = 10;
      fpsText.y = 10;
    }
  };
  window.addEventListener('resize', resizeHandler);

  (fpsText as any).cleanup = () => {
    window.removeEventListener('resize', resizeHandler);
  };
}

// Back to menu button
export function addBackToMenuButton(
  scene: PIXI.Container,
  app: PIXI.Application,
  switchToScene: (id: string) => void
) {
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  bg.roundRect(-50, -15, 100, 30, 5).fill(0x333333);
  button.addChild(bg);
  
  const label = new PIXI.Text({ text: 'Menu', style: { fontSize: 16, fill: '#ffffff' } });
  label.anchor.set(0.5);
  button.addChild(label);
  button.x = app.renderer.width - 60;
  button.y = 20;
  button.interactive = true;
  button.cursor = 'pointer';
  button.on('pointerdown', () => {
    switchToScene('menu');
  });
  
  scene.addChild(button);
  
  // Update position on resize
  const resizeHandler = () => {
    if (button && !button.destroyed) {
      button.x = app.renderer.width - 60;
    }
  };
  window.addEventListener('resize', resizeHandler);
  
  (button as any).cleanup = () => {
    window.removeEventListener('resize', resizeHandler);
  };
}

// Tokenize text into words or emoji
export function splitTextIntoTokens(text: string) {
  const tokens: { type: 'text' | 'emoji'; text: string }[] = [];
  
  // Emoji patterns
  const emojiPattern = /\{([a-zA-Z0-9_+-]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  while ((match = emojiPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: 'text', text: text.substring(lastIndex, match.index) });
    }
    tokens.push({ type: 'emoji', text: match[1] });
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    tokens.push({ type: 'text', text: text.substring(lastIndex) });
  }
  
  return tokens;
}

// Shared mask texture for emojis
let sharedEmojiMaskTexture: PIXI.Texture | null = null;

// Create shared mask
function getSharedEmojiMaskTexture(app: PIXI.Application, emojiSize: number): PIXI.Texture {
  if (!sharedEmojiMaskTexture) {
    const maskGraphics = new PIXI.Graphics();
    const maskRadius = emojiSize / 2;
    maskGraphics.circle(maskRadius, maskRadius, maskRadius);
    maskGraphics.fill(0xffffff);
    sharedEmojiMaskTexture = app.renderer.generateTexture(maskGraphics);
    maskGraphics.destroy();
  }
  return sharedEmojiMaskTexture;
}

// Dialogue text container
export function createRichTextContainer(
  text: string,
  emojiMap: Record<string, string>,
  maxWidth: number,
  app: PIXI.Application,
  emojiTextureCache?: Record<string, PIXI.Texture>
) {
  const container = new PIXI.Container();
  const tokens = splitTextIntoTokens(text);
  const style = new PIXI.TextStyle({ 
    fontSize: 18, 
    fill: '#ffffff',
    fontFamily: 'monospace'
  });

  let x = 0, y = 0;
  const lineHeight = 24;
  const emojiSize = 20;
  const charWidth = 10.8;

  for (const token of tokens) {
    if (token.type === 'emoji') {
      const emojiName = token.text;
      const url = emojiMap[emojiName];
      if (!url) {
        console.warn(`Emoji "${emojiName}" not found`);
        continue;
      }
      
      if (x + emojiSize > maxWidth && x > 0) {
        x = 0;
        y += lineHeight;
      }
      
      let tex: PIXI.Texture | null = null;
      
      // First check texture cache
      if (emojiTextureCache && emojiTextureCache[emojiName]) {
        tex = emojiTextureCache[emojiName];
      } else {
        // Fallback to Assets cache
        const emojiAlias = `emoji_${emojiName}`;
        if (Assets.cache.has(emojiAlias)) {
          const asset = Assets.get(emojiAlias);
          if (asset && asset instanceof PIXI.Texture) {
            tex = asset;
          }
        }
        
        // Create from URL
        if (!tex) {
          tex = PIXI.Texture.from(url);
        }
      }
      
      if (tex && tex.source) {
        // Create emoji container first
        const emojiContainer = new PIXI.Container();
        
        // Create sprite
        const spr = new PIXI.Sprite(tex);
        spr.width = emojiSize;
        spr.height = emojiSize;
        
        // Use shared mask texture
        const maskTexture = getSharedEmojiMaskTexture(app, emojiSize);
        const maskSprite = new PIXI.Sprite(maskTexture);
        maskSprite.width = emojiSize;
        maskSprite.height = emojiSize;
        
        spr.mask = maskSprite;
        
        // Add sprite and mask to container
        emojiContainer.addChild(spr);
        emojiContainer.addChild(maskSprite);
        
        // Position container
        emojiContainer.x = x;
        emojiContainer.y = y;
        (emojiContainer as any)._contentWidth = emojiSize;
        (emojiContainer as any)._contentHeight = emojiSize;
        
        container.addChild(emojiContainer);
        x += emojiSize + 4;
      }
    } else {
      const textContent = token.text;
      if (!textContent) continue;
      
      // Split text into words
      const words: string[] = [];
      let currentWord = '';
      for (let i = 0; i < textContent.length; i++) {
        const char = textContent[i];
        if (char === ' ') {
          if (currentWord) {
            words.push(currentWord);
            currentWord = '';
          }
          words.push(' ');
        } else {
          currentWord += char;
        }
      }
      if (currentWord) {
        words.push(currentWord);
      }
      
      // Word wrapping
      for (const word of words) {
        if (word === ' ') {
          const spaceText = new PIXI.Text({ text: ' ', style });
          if (x + spaceText.width > maxWidth && x > 0) {
            x = 0;
            y += lineHeight;
          } else {
            spaceText.x = x;
            spaceText.y = y;
            container.addChild(spaceText);
            x += spaceText.width;
          }
        } else {
          const wordText = new PIXI.Text({ text: word, style });
          const wordWidth = wordText.width;
          
          if (x + wordWidth > maxWidth && x > 0) {
            x = 0;
            y += lineHeight;
          }
          
          wordText.x = x;
          wordText.y = y;
          container.addChild(wordText);
          x += wordWidth;
        }
      }
    }
  }

  let actualWidth = 0;
  let actualHeight = 0;
  for (let i = 0; i < container.children.length; i++) {
    const child: any = container.children[i];
    if (child && typeof child.x === 'number') {
      let childWidth = (child as any)._contentWidth || child.width;
      let childHeight = (child as any)._contentHeight || child.height;
      if (!childWidth && child instanceof PIXI.Container && child.children.length > 0) {
        // Calculate width from children for containers
        let maxChildRight = 0;
        let maxChildBottom = 0;
        for (let j = 0; j < child.children.length; j++) {
          const grandChild: any = child.children[j];
          if (grandChild && typeof grandChild.x === 'number') {
            const grandChildRight = grandChild.x + (grandChild.width || 0);
            const grandChildBottom = grandChild.y + (grandChild.height || 0);
            maxChildRight = Math.max(maxChildRight, grandChildRight);
            maxChildBottom = Math.max(maxChildBottom, grandChildBottom);
          }
        }
        childWidth = maxChildRight;
        childHeight = maxChildBottom;
      }
      
      const rightEdge = child.x + (childWidth || 0);
      const bottomEdge = child.y + (childHeight || 0);
      actualWidth = Math.max(actualWidth, rightEdge);
      actualHeight = Math.max(actualHeight, bottomEdge);
    }
  }
  
  // Store dimensions as custom properties
  (container as any)._contentWidth = actualWidth || x;
  (container as any)._contentHeight = actualHeight || (y + lineHeight);
  
  // For compatibility to avoid scaling
  Object.defineProperty(container, 'width', {
    get: function() { return (this as any)._contentWidth || 0; },
    configurable: true
  });
  Object.defineProperty(container, 'height', {
    get: function() { return (this as any)._contentHeight || 0; },
    configurable: true
  });
  
  return container;
}

