import { useEffect, useRef } from "react";

/** Stars closer than this (px) get joined by a line. */
const LINK_DISTANCE = 130;
/** Stars within this distance (px) of the pointer light up. */
const HOVER_RADIUS = 170;

type Star = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  glow: number;
};

/**
 * A drifting star field drawn on a canvas. Stars that drift close to each other
 * are joined by faint lines, and stars near the pointer (plus their lines) light up.
 */
export function ConstellationSky({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const styles = getComputedStyle(canvas);
    const starColor = styles.getPropertyValue("--star").trim() || "white";
    const glowColor = styles.getPropertyValue("--star-glow").trim() || starColor;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;

    function makeStar(): Star {
      const speed = reduceMotion ? 0 : 0.08 + Math.random() * 0.22;
      const angle = Math.random() * Math.PI * 2;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 0.8 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        glow: 0,
      };
    }

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const target = Math.min(170, Math.max(40, Math.round((width * height) / 9000)));
      stars = stars.filter((s) => s.x <= width && s.y <= height).slice(0, target);
      while (stars.length < target) stars.push(makeStar());
    }

    function draw(time: number) {
      if (!ctx) return;
      const t = time / 1000;
      ctx.clearRect(0, 0, width, height);

      // Move stars and ease each one's glow toward how close the pointer is.
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < -10) s.x = width + 10;
        if (s.x > width + 10) s.x = -10;
        if (s.y < -10) s.y = height + 10;
        if (s.y > height + 10) s.y = -10;

        const target = pointer
          ? Math.max(0, 1 - Math.hypot(pointer.x - s.x, pointer.y - s.y) / HOVER_RADIUS)
          : 0;
        s.glow += (target - s.glow) * (target > s.glow ? 0.18 : 0.05);
      }

      // Lines between nearby stars.
      ctx.lineWidth = 1;
      for (let i = 0; i < stars.length; i++) {
        const a = stars[i];
        if (!a) continue;
        for (let j = i + 1; j < stars.length; j++) {
          const b = stars[j];
          if (!b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          if (Math.abs(dx) > LINK_DISTANCE || Math.abs(dy) > LINK_DISTANCE) continue;
          const d = Math.hypot(dx, dy);
          if (d > LINK_DISTANCE) continue;

          const closeness = 1 - d / LINK_DISTANCE;
          const lit = Math.max(a.glow, b.glow);
          ctx.strokeStyle = lit > 0.05 ? glowColor : starColor;
          ctx.lineWidth = 1 + lit * 0.8;
          ctx.globalAlpha = Math.min(1, closeness * (0.14 + lit * 1.6));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      // Stars on top, glowing near the pointer.
      ctx.fillStyle = starColor;
      ctx.shadowColor = glowColor;
      for (const s of stars) {
        const twinkle = reduceMotion ? 0.55 : 0.4 + 0.25 * Math.sin(t * 1.3 + s.phase);
        ctx.globalAlpha = Math.min(1, twinkle + s.glow);
        ctx.fillStyle = s.glow > 0.1 ? glowColor : starColor;
        ctx.shadowBlur = s.glow * 22;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + s.glow * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;

      frame = requestAnimationFrame(draw);
    }

    function onPointer(event: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    }
    function onLeave() {
      pointer = null;
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("pointerdown", onPointer);
    document.documentElement.addEventListener("pointerleave", onLeave);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
