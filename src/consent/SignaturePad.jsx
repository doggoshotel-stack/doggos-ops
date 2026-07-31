import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';

// A small pointer/touch signature pad. Draws crisp lines on a high-DPI canvas
// and exposes toDataURL() / clear() / isEmpty() to the parent via ref.
// Reports ink state through onInkChange so the form can require a signature.
const SignaturePad = forwardRef(function SignaturePad({ color = '#21392C', onInkChange }, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const setInk = useCallback((v) => {
    if (hasInk.current === v) return;
    hasInk.current = v;
    if (onInkChange) onInkChange(v);
  }, [onInkChange]);

  // Size the canvas backing store to its CSS box × devicePixelRatio.
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
  }, [color]);

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  const pos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const p = e.touches ? e.touches[0] : e;
    return { x: p.clientX - rect.left, y: p.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing.current = true;
    last.current = pos(e);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    setInk(true);
  };
  const end = () => { drawing.current = false; };

  useImperativeHandle(ref, () => ({
    isEmpty: () => !hasInk.current,
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setInk(false);
    },
    toDataURL: () => (hasInk.current ? canvasRef.current.toDataURL('image/png') : ''),
  }), [setInk]);

  return (
    <canvas
      ref={canvasRef}
      onMouseDown={start}
      onMouseMove={move}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
      style={{
        width: '100%',
        height: 180,
        display: 'block',
        touchAction: 'none',
        cursor: 'crosshair',
        borderRadius: 12,
        background: '#fff',
      }}
    />
  );
});

export default SignaturePad;
