import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';
import { addBackToMenuButton, addFpsCounter } from '../utils';

export function createAceScene(
  app: PIXI.Application,
  sceneTickers: { [key: string]: (() => void)[] },
  switchToScene: (id: string) => void
): PIXI.Container {
  const scene = new PIXI.Container();
  
  addFpsCounter(scene, app, sceneTickers, 'ace');
  addBackToMenuButton(scene, app, switchToScene);

  const NUM_SPRITES = 144;
  const STACK_OFFSET = 0.6;
  
  // Create two deck containers
  const leftDeck = new PIXI.Container();
  leftDeck.sortableChildren = true;
  scene.addChild(leftDeck);

  const rightDeck = new PIXI.Container();
  rightDeck.sortableChildren = true;
  scene.addChild(rightDeck);

  // Position decks
  const deckXLeft = app.renderer.width * 0.25;
  const deckXRight = app.renderer.width * 0.65;
  const deckY = app.renderer.height / 2;

  leftDeck.x = deckXLeft;
  leftDeck.y = deckY;
  rightDeck.x = deckXRight;
  rightDeck.y = deckY;

  // Create 144 card sprites
  const cardTexture = Assets.get('card') as PIXI.Texture;
  
  // Store cards that are currently animating
  const animatingCards: Set<PIXI.Sprite> = new Set();
  
  // Animation state interface
  interface CardAnimation {
    card: PIXI.Sprite;
    startTime: number;
    durationMs: number;
    sourceX: number;
    sourceY: number;
    midX: number;
    midY: number;
    targetX: number;
    targetY: number;
    targetDeck: PIXI.Container;
  }
  
  // Store all active card animations (updated by PIXI Ticker)
  const activeCardAnimations: CardAnimation[] = [];

  let leftTopCard: PIXI.Sprite | null = null;
  let rightTopCard: PIXI.Sprite | null = null;

  for (let i = 0; i < NUM_SPRITES; i++) {
    const card = new PIXI.Sprite(cardTexture);
    card.anchor.set(0.5);
    card.scale.set(0.6);
    
    // Stack cards with slight offset
    const stackOffset = i * STACK_OFFSET;
    card.x = stackOffset;
    card.y = stackOffset;
    
    // Set zIndex
    card.zIndex = i;
    
    leftDeck.addChild(card);
    // Last card
    leftTopCard = card;
  }

  // Get top card from a deck
  function getTopCard(deck: PIXI.Container): PIXI.Sprite | null {
    if (deck === leftDeck) {
      return leftTopCard;
    } else if (deck === rightDeck) {
      return rightTopCard;
    }
    return null;
  }

  // Add card to top of deck
  function addCardToTop(deck: PIXI.Container, card: PIXI.Sprite) {
    // Get max zIndex from current top card (O(1)) or calculate if no top card
    let maxZ = -1;
    if (deck === leftDeck && leftTopCard) {
      maxZ = (leftTopCard as any).zIndex ?? 0;
    } else if (deck === rightDeck && rightTopCard) {
      maxZ = (rightTopCard as any).zIndex ?? 0;
    } else {
      // Fallback: calculate max zIndex only if no cached top card
      maxZ = getMaxZIndex(deck);
    }
    
    const stackOffset = deck.children.length * STACK_OFFSET;
    
    // Convert to deck local coordinates
    card.x = stackOffset;
    card.y = stackOffset;
    card.zIndex = maxZ + 1;
    
    deck.addChild(card);
    
    // Update cached top card reference
    if (deck === leftDeck) {
      leftTopCard = card;
    } else if (deck === rightDeck) {
      rightTopCard = card;
    }
  }

  // Update cached top card reference after removal
  function updateTopCardCache(deck: PIXI.Container) {
    if (deck.children.length === 0) {
      if (deck === leftDeck) {
        leftTopCard = null;
      } else if (deck === rightDeck) {
        rightTopCard = null;
      }
      return;
    }
    
    // Find card with highest zIndex
    let topCard: PIXI.Sprite | null = null;
    let maxZ = -Infinity;
    
    for (const child of deck.children) {
      if (child instanceof PIXI.Sprite) {
        const zIndex = (child as any).zIndex ?? 0;
        if (zIndex > maxZ) {
          maxZ = zIndex;
          topCard = child;
        }
      }
    }
    
    // Update cache
    if (deck === leftDeck) {
      leftTopCard = topCard;
    } else if (deck === rightDeck) {
      rightTopCard = topCard;
    }
  }

  // Only used when cached top card is not available
  function getMaxZIndex(deck: PIXI.Container): number {
    if (deck === leftDeck && leftTopCard) {
      return (leftTopCard as any).zIndex ?? 0;
    } else if (deck === rightDeck && rightTopCard) {
      return (rightTopCard as any).zIndex ?? 0;
    }
    
    // Fallback: calculate max zIndex
    let max = -Infinity;
    for (const child of deck.children) {
      if (child instanceof PIXI.Sprite) {
        const zIndex = (child as any).zIndex ?? 0;
        max = Math.max(max, zIndex);
      }
    }
    return max === -Infinity ? -1 : max;
  }

  let lastMoveTime = performance.now();
  const moveInterval = 1000;
  let movingLeftToRight = true;

  // Ticker to update all card animations
  const animationTicker = () => {
    const now = performance.now();
    
    // Update all active card animations
    for (let i = activeCardAnimations.length - 1; i >= 0; i--) {
      const anim = activeCardAnimations[i];
      
      // Check if card is still valid
      if (!anim.card || anim.card.destroyed) {
        activeCardAnimations.splice(i, 1);
        continue;
      }
      
      // Calculate animation progress (0 to 1)
      const elapsed = now - anim.startTime;
      const t = Math.min(1, elapsed / anim.durationMs);
      
      // Quadratic bezier curve
      const inv = 1 - t;
      const x = inv * inv * anim.sourceX + 2 * inv * t * anim.midX + t * t * anim.targetX;
      const y = inv * inv * anim.sourceY + 2 * inv * t * anim.midY + t * t * anim.targetY;
      
      anim.card.x = x;
      anim.card.y = y;
      
      // Check if animation is complete
      if (t >= 1) {
        // Add card to target deck
        if (anim.card && !anim.card.destroyed) {
          const finalLocal = anim.targetDeck.toLocal({ x: anim.card.x, y: anim.card.y }, app.stage);
          anim.card.x = finalLocal.x;
          anim.card.y = finalLocal.y;
          
          // Remove from stage and add to target deck
          if (anim.card.parent === app.stage) {
            app.stage.removeChild(anim.card);
          }
          animatingCards.delete(anim.card);
          addCardToTop(anim.targetDeck, anim.card);
        }
        
        // Remove completed animation
        activeCardAnimations.splice(i, 1);
      }
    }
  };

  // Ticker to move cards between decks
  const aceTicker = () => {
    const now = performance.now();
    
    // Wait for previous animation to complete
    if (activeCardAnimations.length > 0) return;
    
    // Check if it's time to move next card
    if (now - lastMoveTime < moveInterval) return;
    
    // If left deck is empty, move right to left
    if (leftDeck.children.length === 0) {
      movingLeftToRight = false;
    } else if (rightDeck.children.length === 0) {
      movingLeftToRight = true;
    }
    
    const sourceDeck = movingLeftToRight ? leftDeck : rightDeck;
    const targetDeck = movingLeftToRight ? rightDeck : leftDeck;
    
    // Get top card from source deck
    const card = getTopCard(sourceDeck);
    if (!card) return;
    
    // Remove card from source deck
    sourceDeck.removeChild(card);
    
    // Update cached top card reference
    updateTopCardCache(sourceDeck);
    
    // Add card to stage for animation
    app.stage.addChild(card);
    animatingCards.add(card);
    
    // Get current global position
    const sourceGlobal = sourceDeck.toGlobal({ x: card.x, y: card.y });
    card.x = sourceGlobal.x;
    card.y = sourceGlobal.y;
    
    // Calculate target position
    const targetStackOffset = targetDeck.children.length * STACK_OFFSET;
    const targetLocal = { x: targetStackOffset, y: targetStackOffset };
    const targetGlobal = targetDeck.toGlobal(targetLocal);
    
    // Animate card movement
    const finalTargetX = targetGlobal.x + (Math.random() - 0.5) * 6;
    const finalTargetY = targetGlobal.y + (Math.random() - 0.5) * 6;
    
    // Add vertical offset in the middle of the path
    const arcHeight = 40;
    const midX = (sourceGlobal.x + finalTargetX) / 2;
    const midY = Math.min(sourceGlobal.y, finalTargetY) - arcHeight;
    
    const startTime = performance.now();
    const durationMs = 2000;
    
    // Add animation to active animations array
    activeCardAnimations.push({
      card,
      startTime,
      durationMs,
      sourceX: sourceGlobal.x,
      sourceY: sourceGlobal.y,
      midX,
      midY,
      targetX: finalTargetX,
      targetY: finalTargetY,
      targetDeck
    });
    
    lastMoveTime = now;
  };
  
  // Register ticker functions
  app.ticker.add(aceTicker);
  app.ticker.add(animationTicker);
  if (!sceneTickers['ace']) sceneTickers['ace'] = [];
  sceneTickers['ace'].push(aceTicker);
  sceneTickers['ace'].push(animationTicker);

  // Handle window resize
  const resizeHandler = () => {
    if (leftDeck && !leftDeck.destroyed) {
      leftDeck.x = app.renderer.width * 0.25;
      leftDeck.y = app.renderer.height / 2;
    }
    if (rightDeck && !rightDeck.destroyed) {
      rightDeck.x = app.renderer.width * 0.65;
      rightDeck.y = app.renderer.height / 2;
    }
  };
  window.addEventListener('resize', resizeHandler);
  
  // Store cleanup function on scene
  (scene as any).cleanup = () => {
    window.removeEventListener('resize', resizeHandler);
    
    // Clean up all animating cards from stage
    animatingCards.forEach(card => {
      if (card && !card.destroyed && card.parent === app.stage) {
        app.stage.removeChild(card);
      }
    });
    animatingCards.clear(); // Clear Set
    
    // Clear all active card animations
    activeCardAnimations.length = 0;
  };

  return scene;
}

