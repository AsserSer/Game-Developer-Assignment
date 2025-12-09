import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';
import { addBackToMenuButton, createRichTextContainer, addFpsCounter } from '../utils';

const MAGIC_WORDS_API = 'https://private-624120-softgamesassignment.apiary-mock.com/v2/magicwords';

async function fetchMagicWordsData() {
  const res = await fetch(MAGIC_WORDS_API);
  if (!res.ok) throw new Error('Network response not ok: ' + res.status);
  const data = await res.json();
  return data;
}

export function createMagicScene(
  app: PIXI.Application,
  switchToScene: (id: string) => void,
  sceneTickers?: { [key: string]: (() => void)[] }
): PIXI.Container {
  const scene = new PIXI.Container();
  
  // Create sceneTickers if not provided
  const tickers = sceneTickers || {};
  
  addFpsCounter(scene, app, tickers, 'magic');
  addBackToMenuButton(scene, app, switchToScene);

  // Dialogue message container
  const messageContainer = new PIXI.Container();
  scene.addChild(messageContainer);

  // dialogue system state
  let dialogueData: any[] = [];
  let emojiMap: Record<string, string> = {};
  let avatars: Record<string, string> = {};
  let currentMessageIndex = 0;
  
  // Cache for emoji textures
  const emojiTextureCache: Record<string, PIXI.Texture> = {};

  // Show "Connecting..." message while loading data
  const connectingText = new PIXI.Text({ 
    text: 'Connecting...', 
    style: { fontSize: 24, fill: '#ffffff' } 
  });
  connectingText.anchor.set(0.5);
  connectingText.x = app.renderer.width / 2;
  connectingText.y = app.renderer.height / 2;
  messageContainer.addChild(connectingText);

  // Function to render a single message
  function renderMessage(index: number) {
    // Clear previous message
    messageContainer.removeChildren();

    if (index >= dialogueData.length) {
      // All messages shown
      const endText = new PIXI.Text({ 
        text: 'End of dialogue', 
        style: { fontSize: 24, fill: '#ffffff' } 
      });
      endText.anchor.set(0.5);
      endText.x = app.renderer.width / 2;
      endText.y = app.renderer.height / 2;
      messageContainer.addChild(endText);
      return;
    }

    const msg = dialogueData[index];
    
    // Parse character name
    const characterName = msg.name || msg.character || msg.speaker || 'Unknown';
    
    // Parse dialogue text
    const dialogueText = msg.text || msg.dialogue || msg.message || '';
    
    // Get avatar from avatars object using character name
    const avatarUrl = avatars[characterName];
    
    // Create message box container
    const box = new PIXI.Container();
    const padding = 20;
    const avatarSize = 80;
    const avatarSpacing = 20;
    const sideMargin = 40;
    const maxTextWidth = Math.min(600, app.renderer.width - avatarSize - avatarSpacing - sideMargin * 2);
    
    box.x = sideMargin;
    box.y = app.renderer.height / 2 - 100;

    // Add avatar on the left
    const avatarContainer = new PIXI.Container();
    if (avatarUrl) {
      try {
        // Get texture from Assets bundle using alias
        const avatarAlias = `avatar_${characterName}`;
        let tex: PIXI.Texture | null = null;
        
        // Try to get from Assets cache
        if (Assets.cache.has(avatarAlias)) {
          const asset = Assets.get(avatarAlias);
          if (asset && asset instanceof PIXI.Texture) {
            tex = asset;
          }
        }
        
        // Fallback to direct URL if not in bundle or invalid
        if (!tex) {
          console.warn('Avatar not found in bundle, using direct URL:', avatarUrl);
          tex = PIXI.Texture.from(avatarUrl);
        }
        
        // Verify texture is valid before creating sprite
        if (tex && tex.source) {
          const avatarSprite = new PIXI.Sprite(tex);
          // Preserve aspect ratio
          const aspectRatio = tex.width / tex.height;
          if (aspectRatio > 1) {
            avatarSprite.width = avatarSize;
            avatarSprite.height = avatarSize / aspectRatio;
          } else {
            avatarSprite.width = avatarSize * aspectRatio;
            avatarSprite.height = avatarSize;
          }
          avatarSprite.x = 0;
          avatarSprite.y = 0;
          avatarContainer.addChild(avatarSprite);
        } else {
          console.warn('Invalid texture for avatar:', avatarUrl);
        }
      } catch (e) {
        console.warn('Failed to load avatar:', avatarUrl, e);
      }
    }
    
    // If no avatar or failed to load, create placeholder
    if (avatarContainer.children.length === 0) {
      const placeholder = new PIXI.Graphics();
      placeholder.rect(0, 0, avatarSize, avatarSize).fill(0x333333);
      avatarContainer.addChild(placeholder);
    }
    
    avatarContainer.x = padding;
    avatarContainer.y = padding;
    box.addChild(avatarContainer);

    // Text container positioned to the right of avatar
    const textContainer = new PIXI.Container();
    const textStartX = padding + avatarSize + avatarSpacing;
    
    // Render character name above text
    const nameText = new PIXI.Text({ 
      text: characterName, 
      style: { fontSize: 18, fill: '#ffd', fontWeight: 'bold' } 
    });
    nameText.x = 0;
    nameText.y = 0;
    textContainer.addChild(nameText);

    // Render dialogue text with emojis
    const richText = createRichTextContainer(dialogueText, emojiMap, maxTextWidth, app, emojiTextureCache);
    richText.x = 0;
    richText.y = 30;
    textContainer.addChild(richText);

    // Add click indicator
    const clickHint = new PIXI.Text({ 
      text: 'Click to continue...', 
      style: { fontSize: 14, fill: '#888', fontStyle: 'italic' } 
    });
    clickHint.x = 0;
    clickHint.y = richText.y + richText.height + 10;
    textContainer.addChild(clickHint);
    
    textContainer.x = textStartX;
    textContainer.y = padding;
    box.addChild(textContainer);

    messageContainer.addChild(box);
  }

  // Show next message
  function showNextMessage() {
    currentMessageIndex++;
    renderMessage(currentMessageIndex);
  }

  // Make scene clickable to advance dialogue
  scene.interactive = true;
  scene.cursor = 'pointer';
  scene.on('pointerdown', showNextMessage);

  // Load data and show first message
  (async () => {
    try {
      const data = await fetchMagicWordsData();
      
      if (Array.isArray(data.dialogue)) {
        dialogueData = data.dialogue;
      } else if (Array.isArray(data.dialogues)) {
        dialogueData = data.dialogues;
      } else if (Array.isArray(data.messages)) {
        dialogueData = data.messages;
      } else if (Array.isArray(data)) {
        dialogueData = data;
      } else {
        console.warn('Unexpected data structure:', data);
        dialogueData = [];
      }
      
      // Parse emoji map
      const emojiesArray = data.emojies || data.emojis || [];
      if (Array.isArray(emojiesArray)) {
        emojiMap = {};
        emojiesArray.forEach((emoji: any) => {
          if (emoji.name && emoji.url) {
            emojiMap[emoji.name] = emoji.url;
          }
        });
      } else if (typeof emojiesArray === 'object') {
        emojiMap = emojiesArray as Record<string, string>;
      } else {
        emojiMap = {};
      }
      
      // Parse avatars
      const avatarsArray = data.avatars || data.portraits || [];
      if (Array.isArray(avatarsArray)) {
        avatars = {};
        avatarsArray.forEach((avatar: any) => {
          if (avatar.name && avatar.url) {
            avatars[avatar.name] = avatar.url;
          }
        });
      } else if (typeof avatarsArray === 'object') {
        avatars = avatarsArray as Record<string, string>;
      } else {
        avatars = {};
      }
      
      // Fallback values for specific characters and emojis if not present
      if (!avatars['Neighbour']) {
        avatars['Neighbour'] = 'https://api.dicebear.com/9.x/personas/png?body=squared&clothingColor=d56AAf&eyes=open&hair=shortCombover&hairColor=adad55&mouth=smirk&nose=mediumRound&skinColor=e5a07e';
      }
      
      if (!emojiMap['affirmative']) {
        emojiMap['affirmative'] = 'https://api.dicebear.com/9.x/fun-emoji/png?seed=OK';
      }

      if (!emojiMap['win']) {
        emojiMap['win'] = 'https://api.dicebear.com/9.x/fun-emoji/png?seed=Win';
      }

      // Preload Magic Words assets, register in Assets for caching
      const allUrls: string[] = [];
      const urlToAlias: Record<string, string> = {};
      
      // Collect emoji URLs
      Object.entries(emojiMap).forEach(([name, url]) => {
        if (url && typeof url === 'string') {
          const alias = `emoji_${name}`;
          urlToAlias[url] = alias;
          allUrls.push(url);
        }
      });
      
      // Collect avatar URLs
      Object.entries(avatars).forEach(([name, url]) => {
        if (url && typeof url === 'string') {
          const alias = `avatar_${name}`;
          urlToAlias[url] = alias;
          allUrls.push(url);
        }
      });

      // Preload all images using Image API, then register in Assets
      if (allUrls.length > 0) {
        try {
          const imagePromises = allUrls.map(url => {
            return new Promise<HTMLImageElement>((resolve, reject) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              img.onload = () => resolve(img);
              img.onerror = () => {
                console.warn('Failed to preload image:', url);
                resolve(img);
              };
              img.src = url;
            });
          });
          
          const images = await Promise.all(imagePromises);
          
          // Register loaded images and populate texture cache
          images.forEach((img, index) => {
            const url = allUrls[index];
            const alias = urlToAlias[url];
            if (img.complete && img.naturalWidth > 0) {
              const texture = PIXI.Texture.from(img);
              // Add to Assets cache only if not present
              if (!Assets.cache.has(alias)) {
                Assets.cache.set(alias, texture);
              } else {
                // Use existing texture from cache
                const existingTexture = Assets.get(alias) as PIXI.Texture;
                if (existingTexture) {
                  texture.destroy();
                  // Reuse existing texture
                  const nameMatch = alias.match(/^(emoji|avatar)_(.+)$/);
                  if (nameMatch) {
                    const type = nameMatch[1];
                    const name = nameMatch[2];
                    if (type === 'emoji') {
                      emojiTextureCache[name] = existingTexture;
                    }
                  }
                  return;
                }
              }
              
              // Add to local texture cache for fast access
              const nameMatch = alias.match(/^(emoji|avatar)_(.+)$/);
              if (nameMatch) {
                const type = nameMatch[1];
                const name = nameMatch[2];
                if (type === 'emoji') {
                  emojiTextureCache[name] = texture;
                }
              }
            }
          });
        } catch (error) {
          console.error('Failed to preload Magic Words assets:', error);
          // Continue anyway, will use direct URL loading
        }
      }

      // Remove "Connecting..."
      messageContainer.removeChildren();
      currentMessageIndex = -1;
      showNextMessage();
    } catch (error) {
      console.error('Error loading Magic Words data:', error);
      messageContainer.removeChildren();
      const errorText = new PIXI.Text({ 
        text: 'Failed to load dialogue data', 
        style: { fontSize: 20, fill: '#ff0000' } 
      });
      errorText.anchor.set(0.5);
      errorText.x = app.renderer.width / 2;
      errorText.y = app.renderer.height / 2;
      messageContainer.addChild(errorText);
    }
  })();

  return scene;
}

