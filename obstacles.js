// Obstacles & Tactical Cover Rendering for Y.O.L.O
// Manages solid bunkers, destructible crates, and stealth camouflage fog zones where players can hide.

class ObstacleRenderer {
  constructor() {
    this.fogTime = 0;
  }

  update(dt) {
    this.fogTime += dt;
  }

  drawObstacle(ctx, obs, camera) {
    const rx = obs.x - camera.x;
    const ry = obs.y - camera.y;

    ctx.save();

    if (obs.type === 'wall') {
      // Solid steel barrier
      ctx.fillStyle = '#111827';
      ctx.fillRect(rx, ry, obs.width, obs.height);

      // Neon cyber accent edge
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, obs.width, obs.height);

      // Inner tech grooves
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 20;
      for (let x = rx + step; x < rx + obs.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, ry + 4);
        ctx.lineTo(x, ry + obs.height - 4);
        ctx.stroke();
      }
    } else if (obs.type === 'crate') {
      // Destructible energy crate
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(rx, ry, obs.width, obs.height);

      ctx.strokeStyle = 'rgba(255, 183, 3, 0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(rx, ry, obs.width, obs.height);

      // Cross braces
      ctx.strokeStyle = 'rgba(255, 183, 3, 0.2)';
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + obs.width, ry + obs.height);
      ctx.moveTo(rx + obs.width, ry);
      ctx.lineTo(rx, ry + obs.height);
      ctx.stroke();

      // Crate Health Bar if damaged
      if (obs.hp < (obs.maxHp || 80)) {
        const hpPercent = Math.max(0, obs.hp / (obs.maxHp || 80));
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(rx, ry - 8, obs.width, 4);
        ctx.fillStyle = hpPercent > 0.4 ? '#ffb703' : '#ff0055';
        ctx.fillRect(rx, ry - 8, obs.width * hpPercent, 4);
      }
    } else if (obs.type === 'pillar') {
      // Concrete pillar
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(rx + obs.width / 2, ry + obs.height / 2, obs.width / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 243, 255, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Core light
      ctx.fillStyle = '#00f3ff';
      ctx.beginPath();
      ctx.arc(rx + obs.width / 2, ry + obs.height / 2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw Stealth Concealment Fog (Requirement 5: obstacles where one can hide)
  drawStealthZone(ctx, zone, camera) {
    const rx = zone.x - camera.x;
    const ry = zone.y - camera.y;

    ctx.save();

    // Shimmering animated energy mist
    const pulse = 0.15 + Math.sin(this.fogTime * 2 + zone.x) * 0.05;
    ctx.fillStyle = `rgba(15, 23, 42, ${0.45 + pulse})`;
    ctx.fillRect(rx, ry, zone.width, zone.height);

    // Glowing boundary
    ctx.strokeStyle = `rgba(0, 255, 136, ${0.3 + pulse})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(rx, ry, zone.width, zone.height);

    // Stealth label
    ctx.font = '600 10px "Orbitron"';
    ctx.fillStyle = 'rgba(0, 255, 136, 0.6)';
    ctx.textAlign = 'center';
    ctx.fillText('STEALTH ZONE // COVER', rx + zone.width / 2, ry + 14);

    // Fog particles effect
    for (let i = 0; i < 4; i++) {
      const px = rx + ((Math.sin(this.fogTime + i * 1.5) + 1) / 2) * zone.width;
      const py = ry + ((Math.cos(this.fogTime * 0.8 + i) + 1) / 2) * zone.height;
      ctx.fillStyle = 'rgba(0, 255, 136, 0.12)';
      ctx.beginPath();
      ctx.arc(px, py, 22, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

window.obstacleRenderer = new ObstacleRenderer();
