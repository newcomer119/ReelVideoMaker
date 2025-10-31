"use client";

import Link from "next/link";
import { Button } from "~/components/ui/button";
import { useEffect, useRef } from "react";

export default function HomePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
    }> = [];

    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 1,
      });
    }

    const animate = () => {
      ctx.fillStyle = "rgba(21, 22, 44, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle, i) => {
        particle.x += particle.vx;
        particle.y += particle.vy;

        if (particle.x < 0 || particle.x > canvas.width) particle.vx *= -1;
        if (particle.y < 0 || particle.y > canvas.height) particle.vy *= -1;

        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(138, 43, 226, ${0.3 + Math.sin(Date.now() / 1000 + i) * 0.2})`;
        ctx.fill();

        particles.slice(i + 1).forEach((otherParticle) => {
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            ctx.strokeStyle = `rgba(138, 43, 226, ${0.2 * (1 - distance / 120)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        });
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
    };
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#2e026d] via-[#1a1b3e] to-[#15162c] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ mixBlendMode: "screen" }}
      />
      
      {/* Animated gradient orbs */}
      <div className="absolute top-20 left-10 h-96 w-96 animate-pulse rounded-full bg-purple-500/20 blur-3xl" />
      <div className="absolute bottom-20 right-10 h-96 w-96 animate-pulse rounded-full bg-blue-500/20 blur-3xl delay-1000" />
      <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-indigo-500/10 blur-3xl delay-500" />

      <div className="container relative z-10 flex flex-col items-center justify-center gap-12 px-4 py-16">
        {/* Hero Section */}
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="animate-fade-in">
            <h1 className="text-6xl font-extrabold tracking-tight text-white sm:text-7xl md:text-8xl lg:text-9xl">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent animate-gradient">
                EmpathAI
              </span>
            </h1>
          </div>
          <p className="max-w-3xl text-xl text-gray-300 sm:text-2xl md:text-3xl animate-fade-in-delay-1">
            AI-Powered <span className="text-purple-300">Emotion</span> &{" "}
            <span className="text-blue-300">Sentiment</span> Video Analyzer
          </p>
          <p className="max-w-2xl text-lg text-gray-400 sm:text-xl animate-fade-in-delay-2">
            Unlock deep insights into human emotions through advanced AI analysis.
            Understand sentiment, detect emotions, and gain meaningful insights from
            video content.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 animate-fade-in-delay-3">
          <Link href="/login">
            <Button
              size="lg"
              className="group relative overflow-hidden bg-gradient-to-r from-purple-600 to-blue-600 px-8 py-6 text-lg font-semibold text-white shadow-lg shadow-purple-500/50 transition-all hover:scale-105 hover:shadow-xl hover:shadow-purple-500/70"
            >
              <span className="relative z-10">Try Demo</span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-700 to-blue-700 opacity-0 transition-opacity group-hover:opacity-100" />
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="lg"
              variant="outline"
              className="group relative overflow-hidden border-2 border-purple-400/50 bg-white/5 px-8 py-6 text-lg font-semibold text-white backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-400 hover:bg-white/10"
            >
              <span className="relative z-10">See Emotion Analysis</span>
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="lg"
              variant="outline"
              className="group relative overflow-hidden border-2 border-blue-400/50 bg-white/5 px-8 py-6 text-lg font-semibold text-white backdrop-blur-sm transition-all hover:scale-105 hover:border-blue-400 hover:bg-white/10"
            >
              <span className="relative z-10">Join Beta</span>
            </Button>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="mt-16 grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="group relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-blue-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10">
              <div className="mb-4 text-4xl">🧠</div>
              <h3 className="mb-2 text-xl font-bold text-white">AI-Powered Analysis</h3>
              <p className="text-gray-300">
                Advanced machine learning algorithms analyze facial expressions, voice
                patterns, and body language to detect emotions with precision.
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-blue-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10">
              <div className="mb-4 text-4xl">📊</div>
              <h3 className="mb-2 text-xl font-bold text-white">Real-Time Insights</h3>
              <p className="text-gray-300">
                Get instant sentiment analysis and emotional metrics as your video
                content is processed in real-time.
              </p>
            </div>
          </div>

          <div className="group relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-blue-500/10 p-6 backdrop-blur-sm transition-all hover:scale-105 hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/20 sm:col-span-2 lg:col-span-1">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-blue-500/0 opacity-0 transition-opacity group-hover:opacity-100" />
            <div className="relative z-10">
              <div className="mb-4 text-4xl">🎯</div>
              <h3 className="mb-2 text-xl font-bold text-white">Actionable Results</h3>
              <p className="text-gray-300">
                Transform emotional data into actionable insights for content
                optimization, audience engagement, and strategic decision-making.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-16 flex w-full max-w-4xl flex-wrap items-center justify-center gap-8">
          <div className="text-center">
            <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text sm:text-5xl">
              99.9%
            </div>
            <div className="mt-2 text-sm text-gray-400 sm:text-base">Accuracy Rate</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text sm:text-5xl">
              &lt;1s
            </div>
            <div className="mt-2 text-sm text-gray-400 sm:text-base">Processing Time</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text sm:text-5xl">
              1000+
            </div>
            <div className="mt-2 text-sm text-gray-400 sm:text-base">Emotions Detected</div>
          </div>
        </div>
      </div>
    </main>
  );
}
