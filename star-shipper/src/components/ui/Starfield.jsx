import React, { useRef, useEffect } from 'react';

export const Starfield = () => {
  const canvasRef = useRef(null);
  const starsRef = useRef([]);
  const nebulaRef = useRef([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initializeStars();
    };

    const initializeStars = () => {
      // Generate stars
      starsRef.current = Array.from({ length: 300 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2 + 0.5,
        brightness: Math.random(),
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        twinkleOffset: Math.random() * Math.PI * 2,
        layer: Math.floor(Math.random() * 3), // 0 = far, 1 = mid, 2 = near
      }));

      // Generate nebula clouds
      nebulaRef.current = Array.from({ length: 5 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 300 + 200,
        color: [
          'rgba(100,50,150,',
          'rgba(50,100,150,',
          'rgba(150,50,100,',
          'rgba(50,150,100,',
        ][Math.floor(Math.random() * 4)],
      }));
    };

    resize();
    window.addEventListener('resize', resize);

    let animationId;
    const animate = () => {
      frameRef.current++;
      const frame = frameRef.current;

      // Background
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw nebulae
      nebulaRef.current.forEach(nebula => {
        const gradient = ctx.createRadialGradient(
          nebula.x,
          nebula.y,
          0,
          nebula.x,
          nebula.y,
          nebula.radius
        );
        gradient.addColorStop(0, nebula.color + '0.08)');
        gradient.addColorStop(0.5, nebula.color + '0.03)');
        gradient.addColorStop(1, nebula.color + '0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      });

      // Draw stars
      starsRef.current.forEach(star => {
        const twinkle =
          Math.sin(frame * star.twinkleSpeed + star.twinkleOffset) * 0.3 + 0.7;
        const alpha = star.brightness * twinkle;
        const layerAlpha = [0.4, 0.7, 1][star.layer];

        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size * layerAlpha, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 220, 255, ${alpha * layerAlpha})`;
        ctx.fill();

        // Add glow to brighter stars
        if (star.brightness > 0.7 && star.layer === 2) {
          ctx.beginPath();
          ctx.arc(star.x, star.y, star.size * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(150, 200, 255, ${alpha * 0.1})`;
          ctx.fill();
        }
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
};

export default Starfield;
