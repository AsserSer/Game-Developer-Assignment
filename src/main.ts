import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';
import { createAceScene } from './scenes/aceScene';
import { createMagicScene } from './scenes/magicScene';
import { createPhoenixScene } from './scenes/phoenixScene';
import { addFpsCounter } from './utils';

const ASSETS = {
  card: './assets/card.png',
  particle: './assets/particle.png',
  particleBase: './assets/particle_base.png',
  particleSmall: './assets/particle_small.png'
};

// Create bundle configuration for Assets API
const ASSETS_BUNDLE = {
  card: ASSETS.card,
  particle: ASSETS.particle,
  particleBase: ASSETS.particleBase,
  particleSmall: ASSETS.particleSmall
};

// App initialization (PixiJS v8 API)
let app: PIXI.Application;
let container: HTMLDivElement;
const scenes: { [key: string]: PIXI.Container } = {};
let currentScene: PIXI.Container | null = null;
// Ticker functions for each scene to be able to remove them
const sceneTickers: { [key: string]: (() => void)[] } = {};

(async () => {
  app = new PIXI.Application();
  await app.init({
    resizeTo: window,
    backgroundColor: 0x0b0b0b,
    resolution: devicePixelRatio || 1,
    autoDensity: true
  });

  container = document.getElementById('app') as HTMLDivElement;
  container.appendChild(app.canvas);
  app.canvas.style.width = '100%';
  app.canvas.style.height = '100%';

  // Preload all assets using bundle
  Assets.addBundle('main', ASSETS_BUNDLE);
  
  // Load bundle
  await Assets.loadBundle('main');

  // Fullscreen on first user interaction
  let fullscreenRequested = false;
  function ensureFullscreen(event: Event) {
    // Prevent multiple calls
    if (fullscreenRequested || document.fullscreenElement) {
      return;
    }
    
    fullscreenRequested = true;
    
    // Fullscreen methods for cross-browser compatibility
    const element = container as any;
    try {
      if (element.requestFullscreen) {
        element.requestFullscreen().catch((err: Error) => {
          console.debug('Fullscreen request failed:', err.message);
          fullscreenRequested = false;
        });
      } else if (element.webkitRequestFullscreen) {
        // Safari
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        // Firefox
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        // IE/Edge
        element.msRequestFullscreen();
      }
    } catch (err) {
      console.debug('Fullscreen request failed:', err);
      fullscreenRequested = false;
    }
  }
  
  // Request fullscreen on first user click
  app.canvas.addEventListener('click', ensureFullscreen, { once: true, passive: true });

  // Scene: Menu
  function createMenuScene() {
    const scene = new PIXI.Container();

    addFpsCounter(scene, app, sceneTickers, 'menu');

    const style = new PIXI.TextStyle({ fill: '#FFFFFF', fontSize: 36 });
    const title = new PIXI.Text({ text: 'Demo Scenes', style });
    title.anchor.set(0.5, 0);
    title.x = app.renderer.width / 2;
    title.y = 20;
    scene.addChild(title);

    const buttonsData = [
      { id: 'ace', label: 'Ace of Shadows' },
      { id: 'magic', label: 'Magic Words' },
      { id: 'phoenix', label: 'Phoenix Flame' }
    ];

    const buttonStyle = new PIXI.TextStyle({ fill: '#ffffff', fontSize: 20 });
    buttonsData.forEach((b, i) => {
      const btn = new PIXI.Container();
      const bg = new PIXI.Graphics();
      bg.roundRect(-150, -20, 300, 40, 8).fill(0x222222);
      btn.addChild(bg);
      const label = new PIXI.Text({ text: b.label, style: buttonStyle });
      label.anchor.set(0.5);
      btn.addChild(label);
      btn.x = app.renderer.width / 2;
      btn.y = 120 + i * 70;
      btn.interactive = true;
      btn.cursor = 'pointer';
      btn.on('pointerdown', () => {
        switchToScene(b.id);
      });
      scene.addChild(btn);
    });

    // Responsive reposition on resize
    window.addEventListener('resize', () => {
      title.x = app.renderer.width / 2;
      scene.children.forEach((c) => {
        if (c instanceof PIXI.Container && c.children.length > 0) {
          c.x = app.renderer.width / 2;
        }
      });
    });

    return scene;
  }


  // Scene management
  function switchToScene(id: string) {
  // Hide and stop all animations for current scene
  if (currentScene) {
    currentScene.visible = false;
    const currentSceneId = Object.keys(scenes).find(key => scenes[key] === currentScene);
    
    // Stop all ticker animations for current scene
    if (currentSceneId && sceneTickers[currentSceneId]) {
      sceneTickers[currentSceneId].forEach(ticker => {
        app.ticker.remove(ticker);
      });
      delete sceneTickers[currentSceneId];
    }
    
    // Call scene cleanup if it exists
    if ((currentScene as any).cleanup) {
      try {
        (currentScene as any).cleanup();
      } catch (e) {
        console.warn('Error during scene cleanup:', e);
      }
    }
    
    // Clean up any remaining cards
    if (currentSceneId === 'ace') {
      // Remove all sprites
      const cardsToRemove: PIXI.Container[] = [];
      for (let i = app.stage.children.length - 1; i >= 0; i--) {
        const child = app.stage.children[i];
        // Only remove sprites, not scenes
        if (child instanceof PIXI.Sprite && child !== currentScene) {
          cardsToRemove.push(child);
        }
      }
      cardsToRemove.forEach(card => {
        try {
          if (card.parent === app.stage && !card.destroyed) {
            app.stage.removeChild(card);
          }
        } catch (e) {
          // Ignore errors if card is already removed
        }
      });
    }
    
    // Remove from stage
    try {
      if (currentScene.parent === app.stage) {
        app.stage.removeChild(currentScene);
      }
    } catch (e) {
      // Scene might already be removed
    }
    
    // Destroy current scene to stop all animations and reset state
    if (currentSceneId && currentSceneId !== 'menu') {
      currentScene.destroy({ children: true });
      delete scenes[currentSceneId];
    }
  }
  
  // Stop all animations and clear state when returning to menu
  if (id === 'menu') {
    // Remove all ticker functions for all scenes
    Object.keys(sceneTickers).forEach(sceneId => {
      const tickers = sceneTickers[sceneId];
      if (tickers) {
        tickers.forEach(ticker => {
          app.ticker.remove(ticker);
        });
      }
    });
    // Clear all scene tickers
    Object.keys(sceneTickers).forEach(key => delete sceneTickers[key]);
    // Clear all scenes to reset state
    Object.keys(scenes).forEach(key => {
      if (scenes[key] && key !== 'menu') {
        scenes[key].visible = false;
        scenes[key].destroy({ children: true });
        delete scenes[key];
      }
    });
  }

  // Create or get scene
  let scene = scenes[id];
  if (!scene || id !== 'menu') {
    // Recreate non-menu scenes with fresh state
    if (scenes[id] && id !== 'menu') {
      scenes[id].destroy({ children: true });
      delete scenes[id];
    }
    
    if (id === 'menu') {
      scene = scenes[id] || createMenuScene();
      if (!scenes[id]) scenes[id] = scene;
    } else if (id === 'ace') {
      scene = createAceScene(app, sceneTickers, switchToScene);
      scenes[id] = scene;
    } else if (id === 'magic') {
      scene = createMagicScene(app, switchToScene, sceneTickers);
      scenes[id] = scene;
    } else if (id === 'phoenix') {
      scene = createPhoenixScene(app, sceneTickers, switchToScene);
      scenes[id] = scene;
    } else {
      scene = createMenuScene();
      scenes[id] = scene;
    }
  }

    currentScene = scene;
    scene.visible = true;
    app.stage.addChild(scene);
  }

  switchToScene('menu');

  // Debugging
  (window as any).__APP = app;
})();