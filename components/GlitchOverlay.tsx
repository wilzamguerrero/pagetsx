import React, { useEffect, useRef } from 'react';

interface GlitchOverlayProps {
  isActive: boolean;
}

export const GlitchOverlay: React.FC<GlitchOverlayProps> = ({ isActive }) => {
  const noiseCanvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    if (!isActive || !noiseCanvasRef.current) return;

    const canvas = noiseCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth / 2; // Lower res for performance
      canvas.height = window.innerHeight / 2;
    };
    resize();
    window.addEventListener('resize', resize);

    // TV static noise generation
    const generateNoise = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        // Random static with occasional bright spots
        const intensity = Math.random();
        const value = intensity > 0.97 ? 255 : intensity > 0.5 ? Math.random() * 50 : Math.random() * 20;
        
        data[i] = value;     // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = Math.random() * 40 + 10; // Alpha - semi transparent
      }
      
      // Add horizontal interference bands randomly
      if (Math.random() > 0.85) {
        const bandY = Math.floor(Math.random() * canvas.height);
        const bandHeight = Math.floor(Math.random() * 20) + 5;
        for (let y = bandY; y < Math.min(bandY + bandHeight, canvas.height); y++) {
          for (let x = 0; x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4;
            data[idx] = 255;
            data[idx + 1] = 255;
            data[idx + 2] = 255;
            data[idx + 3] = Math.random() * 80 + 40;
          }
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
    };

    // Animation loop - 24fps for that old TV feel
    let lastTime = 0;
    const fps = 24;
    const interval = 1000 / fps;

    const animate = (time: number) => {
      if (time - lastTime >= interval) {
        generateNoise();
        lastTime = time;
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive]);

  if (!isActive) return null;

  return (
    <>
      {/* Main glitch container */}
      <div className="glitch-overlay">
        {/* Chromatic aberration layers - RGB separation */}
        <div className="chromatic-container">
          <div className="chromatic-layer chromatic-red" />
          <div className="chromatic-layer chromatic-cyan" />
        </div>
        
        {/* TV static noise canvas */}
        <canvas 
          ref={noiseCanvasRef} 
          className="tv-noise"
        />
        
        {/* CRT scanlines */}
        <div className="crt-scanlines" />
        
        {/* Horizontal sync distortion bands */}
        <div className="h-sync-band h-sync-1" />
        <div className="h-sync-band h-sync-2" />
        
        {/* VHS tracking lines */}
        <div className="vhs-tracking" />
        
        {/* Screen flicker */}
        <div className="screen-flicker" />
        
        {/* Vignette effect */}
        <div className="crt-vignette" />
      </div>
    </>
  );
};
