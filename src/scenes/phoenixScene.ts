import * as PIXI from 'pixi.js';
import { Assets } from 'pixi.js';
import { addBackToMenuButton, addFpsCounter } from '../utils';

// Particle types
enum ParticleType {
  BASE = 'base',      // Base of the fire
  FLAME = 'flame',    // Main flame tongue
  SPARK = 'spark'     // Small sparks
}

interface FireParticle {
  sprite: PIXI.Sprite;
  type: ParticleType;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  baseY: number;
  // Spiral parameters for sparks
  spiralAngle?: number;
  spiralRadius?: number;
  spiralSpeed?: number;
}

export function createPhoenixScene(
  app: PIXI.Application,
  sceneTickers: { [key: string]: (() => void)[] },
  switchToScene: (id: string) => void
): PIXI.Container {
  const scene = new PIXI.Container();
  addFpsCounter(scene, app, sceneTickers, 'phoenix');
  addBackToMenuButton(scene, app, switchToScene);

  const particles: FireParticle[] = [];
  const maxSprites = 10; // Max 10 sprites on screen at the same time

  // Particle type counters (optimized to avoid filter() calls every frame)
  let flameCount = 0;
  let baseCount = 0;
  let sparkCount = 0;

  // Cache emitter positions
  let emitterX = app.renderer.width / 2;
  let emitterY = app.renderer.height / 2;
  
  // Base spawn timer
  let baseSpawnTimer = 0;
  const baseSpawnInterval = 0.2;
  
  // Spark spawn timer
  let sparkSpawnTimer = 0;
  const sparkSpawnInterval = 0.5;

  // Get textures from bundle
  const particleTexture = Assets.get('particle') as PIXI.Texture;
  const particleBaseTexture = Assets.get('particleBase') as PIXI.Texture;
  const particleSmallTexture = Assets.get('particleSmall') as PIXI.Texture;

  // Object pools for sprite reuse
  const spritePools = {
    [ParticleType.BASE]: [] as PIXI.Sprite[],
    [ParticleType.FLAME]: [] as PIXI.Sprite[],
    [ParticleType.SPARK]: [] as PIXI.Sprite[]
  };

  // Helper to create a new particle sprite
  function createNewParticleSprite(type: ParticleType): PIXI.Sprite {
    let texture: PIXI.Texture;
    switch (type) {
      case ParticleType.BASE:
        texture = particleBaseTexture;
        break;
      case ParticleType.FLAME:
        texture = particleTexture;
        break;
      case ParticleType.SPARK:
        texture = particleSmallTexture;
        break;
    }
    
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    return sprite;
  }

  // Get sprite from pool or create new one if pool is empty
  function getPooledSprite(type: ParticleType): PIXI.Sprite {
    const pool = spritePools[type];
    if (pool.length > 0) {
      const sprite = pool.pop()!;
      // Ensure sprite is not in any container
      if (sprite.parent) {
        sprite.parent.removeChild(sprite);
      }
      return sprite;
    }
    return createNewParticleSprite(type);
  }

  // Return sprite to pool for reuse
  function returnSpriteToPool(sprite: PIXI.Sprite, type: ParticleType) {
    // Remove from scene if still attached
    if (sprite.parent) {
      sprite.parent.removeChild(sprite);
    }
    
    // Reset sprite properties to default state
    sprite.visible = true;
    sprite.alpha = 1.0;
    sprite.scale.set(1.0);
    sprite.rotation = 0;
    sprite.x = 0;
    sprite.y = 0;
    
    // Don't destroy - return to pool for reuse
    spritePools[type].push(sprite);
  }

  // Spawn a particle
  // Ensures max 10 sprites on screen at the same time
  // Uses object pooling to reuse sprites
  function spawnParticle(type: ParticleType) {
    // Do not create if already at max (10 sprites)
    if (particles.length >= maxSprites) return;

    // Get sprite from pool (or create new if pool is empty)
    const sprite = getPooledSprite(type);
    const particle: FireParticle = {
      sprite,
      type,
      vx: 0,
      vy: 0,
      life: 1.0,
      maxLife: 1.0,
      baseY: emitterY
    };

    switch (type) {
      case ParticleType.BASE:
        sprite.x = emitterX;
        sprite.y = emitterY + 100;
        sprite.scale.set((0.9 + Math.random() * 0.2) * 2/3);
        sprite.alpha = 0.7 + Math.random() * 0.3;
        particle.vx = (Math.random() - 0.5) * 0.2;
        particle.vy = -0.3 - Math.random() * 0.2;
        particle.maxLife = 1.5 + Math.random() * 0.5;
        particle.life = particle.maxLife;
        particle.baseY = sprite.y;
        break;

      case ParticleType.FLAME:
        sprite.x = emitterX;
        sprite.y = emitterY;
        sprite.scale.set(1.5 + Math.random() * 0.5);
        sprite.alpha = 0.8;
        particle.vx = 0;
        particle.vy = 0;
        particle.maxLife = Infinity;
        particle.life = 1.0;
        break;

      case ParticleType.SPARK:
        sprite.x = emitterX;
        sprite.y = emitterY;
        sprite.scale.set(0.2 + Math.random() * 0.15);
        sprite.alpha = 0.8 + Math.random() * 0.5;
        sprite.rotation = Math.random() * Math.PI * 2;
        particle.spiralAngle = Math.random() * Math.PI * 2;
        particle.spiralRadius = 0;
        particle.spiralSpeed = 2 + Math.random() * 2;
        particle.vy = -2 - Math.random() * 1;
        particle.vx = 0;
        particle.maxLife = 2.5 + Math.random() * 0.5;
        particle.life = particle.maxLife;
        break;
    }

    particles.push(particle);
    scene.addChild(sprite);
    
    // Update particle type counters
    switch (type) {
      case ParticleType.FLAME:
        flameCount++;
        break;
      case ParticleType.BASE:
        baseCount++;
        break;
      case ParticleType.SPARK:
        sparkCount++;
        break;
    }
  }

  // Spawn and update particles
  const phoenixTicker = () => {
    const deltaTime = app.ticker.deltaMS / 1000;

    // Ensure single flame tongue exists
    if (flameCount === 0 && particles.length < maxSprites) {
      spawnParticle(ParticleType.FLAME);
    }

    // Ensure at least one base particle exists
    if (baseCount === 0 && particles.length < maxSprites) {
      spawnParticle(ParticleType.BASE);
    }

    baseSpawnTimer += deltaTime;
    if (baseSpawnTimer >= baseSpawnInterval) {
      baseSpawnTimer = 0;
      if (particles.length < maxSprites && baseCount < 3) {
        spawnParticle(ParticleType.BASE);
      }
    }

    sparkSpawnTimer += deltaTime;
    if (sparkSpawnTimer >= sparkSpawnInterval) {
      sparkSpawnTimer = 0;
      if (particles.length < maxSprites && sparkCount < 4) {
        spawnParticle(ParticleType.SPARK);
      }
    }

    // Update particles (effects)
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= deltaTime;

      // Update position
      p.sprite.x += p.vx * deltaTime * 60;
      p.sprite.y += p.vy * deltaTime * 60;

      // Update properties based on type
      switch (p.type) {
        case ParticleType.BASE:
          p.sprite.alpha = (p.life / p.maxLife) * 0.8;
          p.sprite.scale.x += 0.001 * deltaTime * 60;
          p.sprite.scale.y += 0.001 * deltaTime * 60;
          // Slow down as they rise
          p.vy *= 0.98;
          break;

        case ParticleType.FLAME:
          p.life += deltaTime;
          p.sprite.alpha = 0.6 + 0.4 * (Math.sin(p.life * 3) * 0.5 + 0.5);
          const baseScale = 1.5;
          p.sprite.scale.set(baseScale + Math.sin(p.life * 2) * 0.2);
          break;

        case ParticleType.SPARK:
          if (p.spiralAngle !== undefined && p.spiralRadius !== undefined && p.spiralSpeed !== undefined) {
            const elapsed = 1 - (p.life / p.maxLife);
            
            p.spiralAngle += p.spiralSpeed * deltaTime;
            p.spiralRadius = 5 + elapsed * 60;
            
            const spiralX = Math.cos(p.spiralAngle) * p.spiralRadius;
            const spiralY = Math.sin(p.spiralAngle) * p.spiralRadius * 0.4;
            const upwardOffset = -elapsed * 300;
            
            p.sprite.x = emitterX + spiralX;
            p.sprite.y = emitterY + spiralY + upwardOffset;
          }
          
          p.sprite.alpha = (p.life / p.maxLife) * 0.7;
          p.sprite.scale.x *= 0.995;
          p.sprite.scale.y *= 0.995;
          break;
      }

      // Remove dead particles (except flame)
      if (p.life <= 0 && p.type !== ParticleType.FLAME) {
        returnSpriteToPool(p.sprite, p.type);
        particles.splice(i, 1);
        
        // Update particle type counters
        switch (p.type) {
          case ParticleType.BASE:
            baseCount--;
            break;
          case ParticleType.SPARK:
            sparkCount--;
            break;
        }
      }
    }
  };

  // Register ticker function
  app.ticker.add(phoenixTicker);
  if (!sceneTickers['phoenix']) sceneTickers['phoenix'] = [];
  sceneTickers['phoenix'].push(phoenixTicker);

  // Resize handler
  const resizeHandler = () => {
    const newEmitterX = app.renderer.width / 2;
    const newEmitterY = app.renderer.height / 2;
    
    // Calculate offset to move particles
    const offsetX = newEmitterX - emitterX;
    const offsetY = newEmitterY - emitterY;
    
    // Update emitter position
    emitterX = newEmitterX;
    emitterY = newEmitterY;
    
    // Update positions of existing particles to keep them centered
    particles.forEach(p => {
      if (p.sprite && !p.sprite.destroyed) {
        if (p.type === ParticleType.FLAME) {
          // Flame tongue should stay at center
          p.sprite.x = emitterX;
          p.sprite.y = emitterY;
        } else {
          // Move other particles by the same offset to maintain relative positions
          p.sprite.x += offsetX;
          p.sprite.y += offsetY;
        }
      }
    });
  };
  window.addEventListener('resize', resizeHandler);

  // Store cleanup function on scene
  (scene as any).cleanup = () => {
    window.removeEventListener('resize', resizeHandler);
    // Return all active sprites to pools
    particles.forEach(p => {
      if (p.sprite && !p.sprite.destroyed) {
        returnSpriteToPool(p.sprite, p.type);
      }
    });
    particles.length = 0;
    
    // Reset particle type counters
    flameCount = 0;
    baseCount = 0;
    sparkCount = 0;
    
    // Destroy pooled sprites to free memory when scene is cleaned up (if scene won't be reused)
    Object.values(spritePools).forEach(pool => {
      pool.forEach(sprite => {
        if (!sprite.destroyed) {
          sprite.destroy();
        }
      });
      pool.length = 0;
    });
  };

  return scene;
}
