// Tactical AI Bot Controller for Solo vs Computer Modes
// Powers 1v1 Bot Duel & 10-Player Survival Battle Royale

class BotAI {
  constructor(botData, difficulty = 'veteran') {
    this.bot = botData;
    this.difficulty = difficulty;
    this.state = 'patrol';
    this.target = null;
    this.targetPowerup = null;
    this.coverPoint = null;
    this.rethinkTimer = 0;
    this.strafeDir = 1;
    this.strafeTimer = 0;
  }

  update(dt, allPlayers, powerups, obstacles, stealthZones, bullets, mapBounds) {
    if (!this.bot.alive) return;

    this.rethinkTimer -= dt;
    this.strafeTimer -= dt;

    if (this.strafeTimer <= 0) {
      this.strafeDir = Math.random() < 0.5 ? 1 : -1;
      this.strafeTimer = 0.8 + Math.random() * 1.2;
    }

    // Periodic decision rethink (every 0.2s - 0.4s)
    if (this.rethinkTimer <= 0) {
      this.rethinkTimer = this.difficulty === 'cybergod' ? 0.15 : (this.difficulty === 'veteran' ? 0.28 : 0.45);
      this.makeTacticalDecision(allPlayers, powerups, obstacles, stealthZones);
    }

    // Execute movement and combat based on state
    this.executeBehavior(dt, allPlayers, bullets, mapBounds);
  }

  makeTacticalDecision(allPlayers, powerups, obstacles, stealthZones) {
    // 1. Find nearest living enemy who is not in stealth
    let nearestEnemy = null;
    let minDist = 9999;

    for (const p of allPlayers) {
      if (p.id !== this.bot.id && p.alive && !p.stealth) {
        const d = Math.hypot(p.x - this.bot.x, p.y - this.bot.y);
        if (d < minDist) {
          minDist = d;
          nearestEnemy = p;
        }
      }
    }
    this.target = nearestEnemy;

    // 2. Health check: if HP < 45, seek cover in stealth fog or behind bunker
    if (this.bot.hp < 45 && this.difficulty !== 'recruit') {
      // Find nearest stealth fog zone
      let bestCover = null;
      let minCoverDist = 800;
      for (const sz of stealthZones) {
        const cx = sz.x + sz.width / 2;
        const cy = sz.y + sz.height / 2;
        const d = Math.hypot(cx - this.bot.x, cy - this.bot.y);
        if (d < minCoverDist) {
          minCoverDist = d;
          bestCover = { x: cx, y: cy };
        }
      }
      if (bestCover) {
        this.state = 'cover';
        this.coverPoint = bestCover;
        return;
      }
    }

    // 3. Power-up awareness: if power-up nearby, go grab it
    let bestPowerup = null;
    let minPupDist = this.difficulty === 'cybergod' ? 650 : 400;
    for (const pup of powerups) {
      const d = Math.hypot(pup.x - this.bot.x, pup.y - this.bot.y);
      if (d < minPupDist) {
        minPupDist = d;
        bestPowerup = pup;
      }
    }

    if (bestPowerup && (this.bot.hp < 80 || Math.random() < 0.65)) {
      this.state = 'seek_powerup';
      this.targetPowerup = bestPowerup;
      return;
    }

    // 4. Combat engage
    if (this.target) {
      this.state = 'attack';
    } else {
      this.state = 'patrol';
    }
  }

  executeBehavior(dt, allPlayers, bullets, mapBounds) {
    let goalX = this.bot.x;
    let goalY = this.bot.y;
    let wantsToFire = false;
    let aimAngle = this.bot.angle;

    // Bullet evasion (Dodge weave)
    if (this.difficulty !== 'recruit') {
      for (const b of bullets) {
        if (b.ownerId !== this.bot.id) {
          const distToBullet = Math.hypot(b.x - this.bot.x, b.y - this.bot.y);
          if (distToBullet < 200) {
            // Perpendicular dodge
            const bAngle = Math.atan2(b.vy, b.vx);
            const dodgeAngle = bAngle + (Math.PI / 2) * this.strafeDir;
            goalX += Math.cos(dodgeAngle) * 140;
            goalY += Math.sin(dodgeAngle) * 140;
            break;
          }
        }
      }
    }

    if (this.state === 'cover' && this.coverPoint) {
      goalX = this.coverPoint.x;
      goalY = this.coverPoint.y;
      if (this.target) {
        aimAngle = Math.atan2(this.target.y - this.bot.y, this.target.x - this.bot.x);
      }
    } else if (this.state === 'seek_powerup' && this.targetPowerup) {
      goalX = this.targetPowerup.x;
      goalY = this.targetPowerup.y;
      if (this.target) {
        aimAngle = Math.atan2(this.target.y - this.bot.y, this.target.x - this.bot.x);
        wantsToFire = Math.hypot(this.target.x - this.bot.x, this.target.y - this.bot.y) < 500;
      }
    } else if (this.state === 'attack' && this.target) {
      const dist = Math.hypot(this.target.x - this.bot.x, this.target.y - this.bot.y);
      const angle = Math.atan2(this.target.y - this.bot.y, this.target.x - this.bot.x);

      // Lead aim prediction for Cyber-God
      if (this.difficulty === 'cybergod') {
        const bulletSpeed = 650;
        const timeToHit = dist / bulletSpeed;
        const predictedX = this.target.x + (this.target.vx || 0) * timeToHit;
        const predictedY = this.target.y + (this.target.vy || 0) * timeToHit;
        aimAngle = Math.atan2(predictedY - this.bot.y, predictedX - this.bot.x);
      } else {
        // Veteran / Recruit slight inaccuracy
        const jitter = this.difficulty === 'recruit' ? 0.25 : 0.08;
        aimAngle = angle + (Math.random() - 0.5) * jitter;
      }

      // Tactical spacing (maintain 220-350 distance, circle strafe)
      if (dist > 350) {
        goalX = this.target.x;
        goalY = this.target.y;
      } else if (dist < 180) {
        goalX = this.bot.x - Math.cos(angle) * 160;
        goalY = this.bot.y - Math.sin(angle) * 160;
      } else {
        // Circle strafe
        goalX = this.bot.x + Math.cos(angle + (Math.PI / 2) * this.strafeDir) * 140;
        goalY = this.bot.y + Math.sin(angle + (Math.PI / 2) * this.strafeDir) * 140;
      }

      wantsToFire = dist < 700;
    } else {
      // Patrol center
      goalX = mapBounds.width / 2 + Math.sin(Date.now() * 0.001) * 200;
      goalY = mapBounds.height / 2 + Math.cos(Date.now() * 0.001) * 200;
    }

    // Apply movement
    const moveAngle = Math.atan2(goalY - this.bot.y, goalX - this.bot.x);
    const slowFactor = this.bot.buffs && this.bot.buffs.timeSlowed > 0 ? 0.4 : 1.0;
    const speed = this.bot.speed * 0.85 * slowFactor;

    this.bot.vx = Math.cos(moveAngle) * speed;
    this.bot.vy = Math.sin(moveAngle) * speed;
    this.bot.angle = aimAngle;
    this.bot.wantsToFire = wantsToFire;
  }
}

window.BotAI = BotAI;
