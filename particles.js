// Particle & Floating Combat Text Engine for Y.O.L.O

class ParticleSystem {
  constructor() {
    this.particles = [];
    this.combatTexts = [];
  }

  // Bullet hit sparks
  createSparks(x, y, color = '#00f3ff', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 2 + Math.random() * 3,
        life: 0.2 + Math.random() * 0.25,
        maxLife: 0.45,
        alpha: 1
      });
    }
  }

  // Shield deflection energy ripple
  createShieldRipple(x, y, color = '#00f3ff') {
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      const speed = 120 + Math.random() * 80;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: color,
        size: 3,
        life: 0.35,
        maxLife: 0.35,
        alpha: 1
      });
    }
  }

  // Explosion Debris & Smoke
  createExplosion(x, y, color = '#ff0055', count = 35) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 300;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: Math.random() < 0.6 ? color : '#ffb703',
        size: 3 + Math.random() * 5,
        life: 0.4 + Math.random() * 0.4,
        maxLife: 0.8,
        alpha: 1
      });
    }
  }

  // Floating Combat Damage Text (-25, CRIT, SHIELD BROKEN, TIME WARP)
  addCombatText(x, y, text, color = '#ff0055', isLarge = false) {
    this.combatTexts.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y - 20,
      text: text,
      color: color,
      isLarge: isLarge,
      vy: -55 - Math.random() * 20,
      life: 0.9,
      maxLife: 0.9,
      alpha: 1
    });
  }

  update(dt) {
    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Update Combat Texts
    for (let i = this.combatTexts.length - 1; i >= 0; i--) {
      const ct = this.combatTexts[i];
      ct.y += ct.vy * dt;
      ct.vy *= 0.95;
      ct.life -= dt;
      ct.alpha = Math.max(0, ct.life / ct.maxLife);

      if (ct.life <= 0) {
        this.combatTexts.splice(i, 1);
      }
    }
  }

  draw(ctx, camera) {
    // Draw Particles
    for (const p of this.particles) {
      const screenX = p.x - camera.x;
      const screenY = p.y - camera.y;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(screenX, screenY, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Combat Texts
    for (const ct of this.combatTexts) {
      const screenX = ct.x - camera.x;
      const screenY = ct.y - camera.y;

      ctx.save();
      ctx.globalAlpha = ct.alpha;
      ctx.fillStyle = ct.color;
      ctx.shadowColor = ct.color;
      ctx.shadowBlur = 10;
      ctx.font = ct.isLarge ? '900 16px "Orbitron"' : '700 13px "Rajdhani"';
      ctx.textAlign = 'center';
      ctx.fillText(ct.text, screenX, screenY);
      ctx.restore();
    }
  }
}

window.particleSystem = new ParticleSystem();
