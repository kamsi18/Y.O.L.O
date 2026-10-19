// Power-Up Renderers & Visuals for Y.O.L.O
// Covers: More Damage, Clone Minion, 2x Shield, Time Slow (5s, 7s, 10s)

class PowerupRenderer {
  constructor() {
    this.animTime = 0;
  }

  update(dt) {
    this.animTime += dt;
  }

  drawPowerup(ctx, pup, camera) {
    const rx = pup.x - camera.x;
    const ry = pup.y - camera.y + Math.sin(this.animTime * 3 + (pup.bobOffset || 0)) * 6;

    ctx.save();

    // Ground projector ring
    ctx.strokeStyle = this.getColorForType(pup.type);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(rx, ry + 22, 18, 8, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Floating orb glow
    ctx.shadowColor = this.getColorForType(pup.type);
    ctx.shadowBlur = 18;

    // Outer rotating tech brackets
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(this.animTime * 1.5);
    ctx.strokeStyle = this.getColorForType(pup.type);
    ctx.lineWidth = 2;
    ctx.strokeRect(-18, -18, 36, 36);
    ctx.restore();

    // Inner icon symbol
    ctx.fillStyle = '#fff';
    ctx.font = '700 16px "Orbitron"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let icon = '⚡';
    if (pup.type === 'damage') icon = '🔥';
    else if (pup.type === 'clone') icon = '🤖';
    else if (pup.type === 'shield') icon = '🛡️';
    else if (pup.type === 'slow') icon = '⏳';

    ctx.fillText(icon, rx, ry);

    // Floating label with duration/subType
    ctx.shadowBlur = 0;
    ctx.font = '700 10px "Orbitron"';
    ctx.fillStyle = this.getColorForType(pup.type);
    ctx.fillText(this.getShortLabel(pup), rx, ry - 26);

    ctx.restore();
  }

  getColorForType(type) {
    switch (type) {
      case 'damage': return '#ff0055'; // Neon crimson
      case 'clone': return '#00ff88';  // Neon green
      case 'shield': return '#00f3ff'; // Neon cyan
      case 'slow': return '#9d4edd';   // Neon purple
      default: return '#ffffff';
    }
  }

  getShortLabel(pup) {
    if (pup.type === 'damage') return '2.5x DMG';
    if (pup.type === 'clone') return 'CLONE';
    if (pup.type === 'shield') return '2x SHIELD';
    if (pup.type === 'slow') return `SLOW ${pup.subType || '7s'}`;
    return 'BUFF';
  }
}
